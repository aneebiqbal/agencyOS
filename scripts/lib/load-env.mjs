import { config } from "dotenv";
import { resolve } from "node:path";
import process from "node:process";

/**
 * Load env the same way Next.js does for local app config:
 * - `.env` then `.env.local` (local wins over `.env`)
 * - Variables already present in the shell/CI environment are not overwritten
 */
export function loadEnv() {
  const cwd = process.cwd();
  const fromFiles = {};

  config({ path: resolve(cwd, ".env"), processEnv: fromFiles, quiet: true });
  config({
    path: resolve(cwd, ".env.local"),
    processEnv: fromFiles,
    override: true,
    quiet: true,
  });

  for (const [key, value] of Object.entries(fromFiles)) {
    if (process.env[key] === undefined && value !== undefined) {
      process.env[key] = value;
    }
  }
}
