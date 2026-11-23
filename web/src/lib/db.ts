import { Pool, type PoolClient, type QueryResultRow } from "pg";
import { getConfig } from "./config";

/**
 * One connection pool for the whole app (kept on globalThis so hot-reload in
 * development does not open a new pool every time).
 */
const g = globalThis as unknown as { __pgPool?: Pool };

export function getPool(): Pool {
  if (!g.__pgPool) {
    const pool = new Pool({
      connectionString: getConfig().DATABASE_URL,
      max: 10,
      idleTimeoutMillis: 30_000,
      connectionTimeoutMillis: 5_000,
    });
    // An idle connection can drop (database restart). Without this handler the whole process would crash.
    pool.on("error", (e) => console.error("[db] idle client error", e.message));
    g.__pgPool = pool;
  }
  return g.__pgPool;
}

/** Run one SQL statement with $1, $2 ... parameters (never build SQL with string concatenation). */
export async function query<T extends QueryResultRow = QueryResultRow>(
  text: string,
  params: unknown[] = [],
): Promise<T[]> {
  const res = await getPool().query<T>(text, params);
  return res.rows;
}

/** Run several statements in one transaction. Rolls back automatically on error. */
export async function tx<T>(fn: (client: PoolClient) => Promise<T>): Promise<T> {
  const client = await getPool().connect();
  try {
    await client.query("BEGIN");
    const result = await fn(client);
    await client.query("COMMIT");
    return result;
  } catch (e) {
    await client.query("ROLLBACK").catch(() => {}); // never hide the original error
    throw e;
  } finally {
    client.release();
  }
}
