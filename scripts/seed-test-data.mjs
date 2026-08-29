import { readFile } from "node:fs/promises";
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

const pool = new Pool({ connectionString: databaseUrl });

try {
  const sql = await readFile(join(process.cwd(), "db", "seed", "test_seed.sql"), "utf8");
  await pool.query(sql);
} finally {
  await pool.end();
}
