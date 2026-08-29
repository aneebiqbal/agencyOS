import { Pool, type PoolClient, type QueryResultRow } from "pg";

export interface DbActorContext {
  userId: string;
  role: "owner" | "hr" | "cto";
  orgId: string;
}

let pool: Pool | null = null;

function getPool(): Pool {
  if (pool) {
    return pool;
  }

  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) {
    throw new Error("DATABASE_URL is required for postgres persistence.");
  }

  pool = new Pool({
    connectionString,
    // For serverless APIs, keep pool small and rely on provider pooler.
    max: Number(process.env.PG_POOL_MAX ?? 5),
    idleTimeoutMillis: 20_000,
    connectionTimeoutMillis: 10_000,
    allowExitOnIdle: process.env.NODE_ENV === "test",
  });

  return pool;
}

async function setSessionContext(client: PoolClient, actor: DbActorContext): Promise<void> {
  await client.query("set local role agency_app_role");
  await client.query("select set_config('app.current_user_id', $1, true)", [actor.userId]);
  await client.query("select set_config('app.current_user_role', $1, true)", [actor.role]);
  await client.query("select set_config('app.current_org_id', $1, true)", [actor.orgId]);
}

export async function queryAsActor<T extends QueryResultRow>(
  actor: DbActorContext,
  text: string,
  values: unknown[] = [],
): Promise<T[]> {
  const client = await getPool().connect();
  try {
    await client.query("begin");
    await setSessionContext(client, actor);
    const result = await client.query<T>(text, values);
    await client.query("commit");
    return result.rows;
  } catch (error) {
    await client.query("rollback");
    throw error;
  } finally {
    client.release();
  }
}

export async function transactionAsActor<T>(
  actor: DbActorContext,
  run: (client: PoolClient) => Promise<T>,
): Promise<T> {
  const client = await getPool().connect();
  try {
    await client.query("begin");
    await setSessionContext(client, actor);
    const result = await run(client);
    await client.query("commit");
    return result;
  } catch (error) {
    await client.query("rollback");
    throw error;
  } finally {
    client.release();
  }
}

export async function querySystem<T extends QueryResultRow>(
  text: string,
  values: unknown[] = [],
): Promise<T[]> {
  const result = await getPool().query<T>(text, values);
  return result.rows;
}

export function isPostgresConfigured(): boolean {
  return Boolean(process.env.DATABASE_URL);
}

export async function closePool(): Promise<void> {
  if (pool) {
    await pool.end();
    pool = null;
  }
}
