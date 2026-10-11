// One lazy Postgres client per server instance (05 S05-33). Queries only through Drizzle (S05-37).
import "server-only";
import { drizzle, type PostgresJsDatabase } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import { env } from "../env";
import * as schema from "./schema";

export type Db = PostgresJsDatabase<typeof schema>;

let client: { sql: postgres.Sql; db: Db } | undefined;

export function connect(url: string): { sql: postgres.Sql; db: Db } {
  const host = new URL(url).hostname;
  const local = host === "localhost" || host === "127.0.0.1";
  const sql = postgres(url, {
    max: 5,
    prepare: false,
    idle_timeout: 20,
    connect_timeout: 10,
    ssl: local ? false : "require",
    connection: { statement_timeout: 10_000, lock_timeout: 10_000, TimeZone: "UTC" },
    onnotice: () => undefined,
  });
  return { sql, db: drizzle(sql, { schema }) };
}

export function db(): Db {
  client ??= connect(env().DATABASE_URL);
  return client.db;
}

/** Tests only. */
export async function closeDb(): Promise<void> {
  await client?.sql.end();
  client = undefined;
}

export { schema };

/** A Drizzle transaction handle, for helpers that must run inside a caller's transaction. */
export type Tx = Parameters<Parameters<Db["transaction"]>[0]>[0];
