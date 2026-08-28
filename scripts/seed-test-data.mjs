import { readFile } from "node:fs/promises";
import { join } from "node:path";
import process from "node:process";
import { Pool } from "pg";

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) {
  throw new Error("DATABASE_URL is required for test seeding.");
}

const pool = new Pool({ connectionString: databaseUrl });

try {
  const sql = await readFile(join(process.cwd(), "db", "seed", "test_seed.sql"), "utf8");
  await pool.query(sql);
} finally {
  await pool.end();
}
