import { readFile, readdir } from "node:fs/promises";
import { join } from "node:path";
import process from "node:process";
import { Pool } from "pg";

import { loadEnv } from "./lib/load-env.mjs";
import { requireValidDatabaseUrl, validateDatabaseUrl } from "./lib/db-url.mjs";

loadEnv();

function fail(message) {
  console.error(message);
  process.exit(1);
}

function getDirection() {
  return process.argv[2] === "down" ? "down" : "up";
}

function getDirectory(direction) {
  if (direction === "up" && process.env.MIGRATIONS_DIR) {
    return process.env.MIGRATIONS_DIR;
  }
  if (direction === "down" && process.env.MIGRATIONS_DOWN_DIR) {
    return process.env.MIGRATIONS_DOWN_DIR;
  }

  return direction === "up"
    ? join(process.cwd(), "supabase", "migrations")
    : join(process.cwd(), "supabase", "migrations_down");
}

function splitSqlStatements(sqlText) {
  const statements = [];
  let start = 0;
  let inSingleQuote = false;
  let inDoubleQuote = false;
  let inLineComment = false;
  let inBlockComment = false;
  let dollarTag = null;

  for (let i = 0; i < sqlText.length; i += 1) {
    const ch = sqlText[i];
    const next = i + 1 < sqlText.length ? sqlText[i + 1] : "";

    if (inLineComment) {
      if (ch === "\n") {
        inLineComment = false;
      }
      continue;
    }

    if (inBlockComment) {
      if (ch === "*" && next === "/") {
        inBlockComment = false;
        i += 1;
      }
      continue;
    }

    if (dollarTag) {
      if (sqlText.startsWith(dollarTag, i)) {
        i += dollarTag.length - 1;
        dollarTag = null;
      }
      continue;
    }

    if (inSingleQuote) {
      if (ch === "'" && next === "'") {
        i += 1;
        continue;
      }
      if (ch === "'") {
        inSingleQuote = false;
      }
      continue;
    }

    if (inDoubleQuote) {
      if (ch === '"' && next === '"') {
        i += 1;
        continue;
      }
      if (ch === '"') {
        inDoubleQuote = false;
      }
      continue;
    }

    if (ch === "-" && next === "-") {
      inLineComment = true;
      i += 1;
      continue;
    }

    if (ch === "/" && next === "*") {
      inBlockComment = true;
      i += 1;
      continue;
    }

    if (ch === "'") {
      inSingleQuote = true;
      continue;
    }

    if (ch === '"') {
      inDoubleQuote = true;
      continue;
    }

    if (ch === "$") {
      const remainder = sqlText.slice(i);
      const tagMatch = remainder.match(/^\$[A-Za-z_0-9]*\$/);
      if (tagMatch) {
        dollarTag = tagMatch[0];
        i += dollarTag.length - 1;
        continue;
      }
    }

    if (ch === ";") {
      const chunk = sqlText.slice(start, i + 1).trim();
      if (chunk.length > 0) {
        statements.push(chunk);
      }
      start = i + 1;
    }
  }

  const tail = sqlText.slice(start).trim();
  if (tail.length > 0) {
    statements.push(tail);
  }

  return statements;
}

function summarizeStatement(sql) {
  return sql.replace(/\s+/g, " ").trim().slice(0, 220);
}

function getUpFilenameFromDownFilename(fileName) {
  return fileName.endsWith(".down.sql") ? `${fileName.slice(0, -".down.sql".length)}.sql` : fileName;
}

async function ensureSchemaMigrationsTable(pool) {
  await pool.query(`
    create table if not exists public.schema_migrations (
      filename text primary key,
      applied_at timestamptz not null default now()
    )
  `);
}

async function loadAppliedFilenames(pool) {
  const rows = await pool.query("select filename from public.schema_migrations");
  return new Set(rows.rows.map((row) => String(row.filename)));
}

async function applyMigrationFile(pool, fileName, sqlText, direction) {
  const statements = splitSqlStatements(sqlText);
  const client = await pool.connect();

  try {
    await client.query("begin");

    for (let i = 0; i < statements.length; i += 1) {
      const statement = statements[i];
      try {
        await client.query(statement);
      } catch (error) {
        await client.query("rollback");
        const label = direction === "up" ? fileName : getUpFilenameFromDownFilename(fileName);
        const message = error instanceof Error ? error.message : String(error);
        throw new Error(
          [
            `migration ${label} failed at statement ${i + 1}: ${summarizeStatement(statement)}`,
            `database error: ${message}`,
            `migration ${label} failed and was rolled back - database unchanged`,
          ].join("\n"),
        );
      }
    }

    if (direction === "up") {
      await client.query(
        `insert into public.schema_migrations (filename, applied_at)
         values ($1, now())
         on conflict (filename) do nothing`,
        [fileName],
      );
    } else {
      await client.query("delete from public.schema_migrations where filename = $1", [
        getUpFilenameFromDownFilename(fileName),
      ]);
    }

    await client.query("commit");
  } catch (error) {
    if (client) {
      try {
        await client.query("rollback");
      } catch {
        // no-op
      }
    }
    throw error;
  } finally {
    client.release();
  }
}

async function run() {
  let databaseUrl;
  try {
    databaseUrl = requireValidDatabaseUrl(process.env.DATABASE_URL, "DATABASE_URL");
  } catch (error) {
    fail(error instanceof Error ? error.message : String(error));
  }

  if (process.env.DIRECT_DATABASE_URL != null && String(process.env.DIRECT_DATABASE_URL).trim() !== "") {
    const directCheck = validateDatabaseUrl(process.env.DIRECT_DATABASE_URL, "DIRECT_DATABASE_URL");
    if (!directCheck.ok) {
      fail(directCheck.error);
    }
  }

  const direction = getDirection();
  const directory = getDirectory(direction);
  const pool = new Pool({ connectionString: databaseUrl });

  try {
    await ensureSchemaMigrationsTable(pool);

    const rawFiles = (await readdir(directory)).filter((name) => name.endsWith(".sql"));
    const files = rawFiles.sort(direction === "down" ? (a, b) => b.localeCompare(a) : (a, b) => a.localeCompare(b));
    const applied = await loadAppliedFilenames(pool);

    for (const fileName of files) {
      const trackingName = direction === "up" ? fileName : getUpFilenameFromDownFilename(fileName);

      if (direction === "up" && applied.has(trackingName)) {
        console.log(`skipping already-applied migration ${trackingName}`);
        continue;
      }

      if (direction === "down" && !applied.has(trackingName)) {
        console.log(`skipping down migration for unapplied file ${trackingName}`);
        continue;
      }

      const sql = await readFile(join(directory, fileName), "utf8");
      await applyMigrationFile(pool, fileName, sql, direction);
      console.log(`applied migration ${trackingName}`);
      if (direction === "up") {
        applied.add(trackingName);
      } else {
        applied.delete(trackingName);
      }
    }
  } finally {
    await pool.end();
  }
}

try {
  await run();
} catch (error) {
  fail(error instanceof Error ? error.message : String(error));
}
