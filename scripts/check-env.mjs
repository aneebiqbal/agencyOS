import process from "node:process";
import { Pool } from "pg";

import { loadEnv } from "./lib/load-env.mjs";
import { maskDatabaseUrl, validateDatabaseUrl } from "./lib/db-url.mjs";

const REQUIRED_VARS = ["DATABASE_URL", "DIRECT_DATABASE_URL"];

loadEnv();

function fail(message) {
  console.error(message);
  process.exit(1);
}

console.log("Checking database environment...\n");

const missing = REQUIRED_VARS.filter((name) => {
  const value = process.env[name];
  return value == null || String(value).trim() === "";
});

if (missing.length > 0) {
  fail(
    `${missing.join(" and ")} ${missing.length === 1 ? "is" : "are"} missing. Set ${missing.length === 1 ? "it" : "them"} in .env.local and retry.`,
  );
}

let structureFailed = false;

for (const name of REQUIRED_VARS) {
  const value = process.env[name];
  const result = validateDatabaseUrl(value, name);
  console.log(`${name}: present`);
  if (!result.ok) {
    structureFailed = true;
    console.log(`  structure: INVALID`);
    console.log(`  error: ${result.error}`);
    console.log(`  masked: ${maskDatabaseUrl(value)}`);
  } else {
    console.log(`  structure: valid (${result.summary})`);
    console.log(`  masked: ${maskDatabaseUrl(value)}`);
  }
  console.log("");
}

if (structureFailed) {
  fail("Structure validation failed. Fix the messages above before connecting.");
}

console.log("Attempting lightweight connections (SELECT 1)...\n");

let connectFailed = false;

for (const name of REQUIRED_VARS) {
  const value = process.env[name];
  const pool = new Pool({ connectionString: value, connectionTimeoutMillis: 8_000 });
  try {
    await pool.query("select 1 as ok");
    console.log(`${name}: connect ok`);
  } catch (error) {
    connectFailed = true;
    const message = error instanceof Error ? error.message : String(error);
    console.error(`${name}: connect FAILED`);
    console.error(`  driver: ${message}`);
    console.error(`  masked: ${maskDatabaseUrl(value)}`);
  } finally {
    await pool.end().catch(() => undefined);
  }
  console.log("");
}

if (connectFailed) {
  fail("One or more database connections failed. See driver messages above (connection strings are masked).");
}

console.log("All checks passed.");
