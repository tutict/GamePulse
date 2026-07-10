import { readFile } from "node:fs/promises";
import path from "node:path";
import { performance } from "node:perf_hooks";
import { fileURLToPath } from "node:url";
import { Pool, type PoolClient, type QueryResult, type QueryResultRow } from "pg";
import { loadConfig } from "./config.js";

let pool: Pool | undefined;

export function getPool(): Pool {
  if (!pool) {
    const config = loadConfig();
    pool = new Pool({
      connectionString: config.databaseUrl,
      max: config.pgPoolMax,
      idleTimeoutMillis: config.pgIdleTimeoutMs,
      connectionTimeoutMillis: config.pgConnectTimeoutMs,
      statement_timeout: config.pgStatementTimeoutMs
    });
  }

  return pool;
}

export async function query<T extends QueryResultRow = QueryResultRow>(
  text: string,
  values: unknown[] = [],
  queryName?: string
): Promise<QueryResult<T>> {
  const startedAt = performance.now();

  try {
    return await getPool().query<T>(text, values);
  } finally {
    const durationMs = performance.now() - startedAt;
    const thresholdMs = loadConfig().slowQueryMs;
    if (durationMs >= thresholdMs) {
      console.warn(
        JSON.stringify({
          event: "slow_query",
          query: queryName ?? summarizeQuery(text),
          durationMs: Math.round(durationMs)
        })
      );
    }
  }
}

export async function withClient<T>(handler: (client: PoolClient) => Promise<T>): Promise<T> {
  const client = await getPool().connect();

  try {
    return await handler(client);
  } finally {
    client.release();
  }
}

export async function withTransaction<T>(handler: (client: PoolClient) => Promise<T>): Promise<T> {
  return withClient(async (client) => {
    await client.query("BEGIN");
    try {
      const result = await handler(client);
      await client.query("COMMIT");
      return result;
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    }
  });
}

export async function migrate(): Promise<void> {
  const dbDirectory = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../../db");
  const schema = await readFile(path.join(dbDirectory, "schema.sql"), "utf8");
  const performanceMigrations = await readFile(path.join(dbDirectory, "performance-indexes.sql"), "utf8");

  await withClient(async (client) => {
    await client.query("SELECT pg_advisory_lock(hashtext('gamepulse:migrate'))");
    try {
      await client.query(schema);
      for (const statement of performanceMigrations.split(/\r?\n-- statement\r?\n/).map((value) => value.trim()).filter(Boolean)) {
        await client.query(statement);
      }
    } finally {
      await client.query("SELECT pg_advisory_unlock(hashtext('gamepulse:migrate'))");
    }
  });
}

export async function closePool(): Promise<void> {
  if (pool) {
    await pool.end();
    pool = undefined;
  }
}

function summarizeQuery(text: string): string {
  return text.replace(/\s+/g, " ").trim().slice(0, 160);
}