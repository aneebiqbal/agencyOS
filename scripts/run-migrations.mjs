import { readFile, readdir } from "node:fs/promises";
import { join } from "node:path";
import process from "node:process";
import { Pool } from "pg";

const direction = process.argv[2] === "down" ? "down" : "up";
const directory =
  direction === "up"
    ? join(process.cwd(), "supabase", "migrations")
    : join(process.cwd(), "supabase", "migrations_down");

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) {
  throw new Error("DATABASE_URL is required for migration scripts.");
}

const pool = new Pool({ connectionString: databaseUrl });

try {
  const files = (await readdir(directory)).filter((name) => name.endsWith(".sql")).sort();

  for (const fileName of files) {
    const sql = await readFile(join(directory, fileName), "utf8");
    await pool.query("begin");
    try {
      await pool.query(sql);
      await pool.query("commit");
    } catch (error) {
      await pool.query("rollback");
      throw new Error(`Migration failed in ${fileName}: ${String(error)}`);
    }
  }
} finally {
  await pool.end();
}
