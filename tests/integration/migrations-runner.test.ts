import { execFile } from "node:child_process";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";

import { Pool } from "pg";
import { describe, expect, it } from "vitest";

const execFileAsync = promisify(execFile);
const describeIfDb = process.env.DATABASE_URL ? describe : describe.skip;

describeIfDb("migration runner transactional safety", () => {
  it("rolls back failed file fully and succeeds after correction", async () => {
    const migrationDir = await mkdtemp(join(tmpdir(), "agency-migrations-test-"));
    const fileName = `99999999999999_tx_rollback_test_${Date.now()}.sql`;
    const tableName = `migration_tx_test_${Date.now()}`;
    const filePath = join(migrationDir, fileName);
    const pool = new Pool({ connectionString: process.env.DATABASE_URL });

    try {
      await writeFile(
        filePath,
        `create table public.${tableName} (id integer not null);\ninsert into public.${tableName} (missing_col) values (1);\n`,
        "utf8",
      );

      let failureStdErr = "";
      await expect(
        execFileAsync("node", ["scripts/run-migrations.mjs"], {
          cwd: "/Users/mac/Desktop/agencyOS",
          env: {
            ...process.env,
            MIGRATIONS_DIR: migrationDir,
          },
        }).catch((error: Error & { stderr?: string }) => {
          failureStdErr = error.stderr ?? "";
          throw error;
        }),
      ).rejects.toBeTruthy();

      expect(failureStdErr).toContain(`migration ${fileName} failed at statement 2`);
      expect(failureStdErr).toContain(
        `migration ${fileName} failed and was rolled back - database unchanged`,
      );

      const existsAfterFailure = await pool.query<{ regclass: string | null }>(
        "select to_regclass($1) as regclass",
        [`public.${tableName}`],
      );
      expect(existsAfterFailure.rows[0].regclass).toBeNull();

      await writeFile(
        filePath,
        `create table public.${tableName} (id integer not null);\ninsert into public.${tableName} (id) values (1);\n`,
        "utf8",
      );

      await expect(
        execFileAsync("node", ["scripts/run-migrations.mjs"], {
          cwd: "/Users/mac/Desktop/agencyOS",
          env: {
            ...process.env,
            MIGRATIONS_DIR: migrationDir,
          },
        }),
      ).resolves.toBeTruthy();

      const countRows = await pool.query<{ count: string }>(`select count(*)::text as count from public.${tableName}`);
      expect(Number(countRows.rows[0].count)).toBe(1);

      const migrationRows = await pool.query<{ filename: string }>(
        "select filename from public.schema_migrations where filename = $1",
        [fileName],
      );
      expect(migrationRows.rowCount).toBe(1);
    } finally {
      await pool.query(`drop table if exists public.${tableName}`);
      await pool.query("delete from public.schema_migrations where filename = $1", [fileName]);
      await pool.end();
      await rm(migrationDir, { recursive: true, force: true });
    }
  });
});
