// Applies drizzle/ with the migration role before the suite, as CI does before a deploy (05 S05-35).
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { drizzle } from "drizzle-orm/postgres-js";
import { migrate } from "drizzle-orm/postgres-js/migrator";
import postgres from "postgres";

function exampleValue(name: string): string {
  const text = readFileSync(
    fileURLToPath(new URL("../../../.env.example", import.meta.url)),
    "utf8",
  );
  const line = text.split("\n").find((l) => l.startsWith(`${name}=`));
  return line ? line.slice(name.length + 1) : "";
}

export default async function setup(): Promise<void> {
  const url = process.env.DATABASE_MIGRATION_URL ?? exampleValue("DATABASE_MIGRATION_URL");
  const sql = postgres(url, { max: 1, onnotice: () => undefined });
  await migrate(drizzle(sql), {
    migrationsFolder: fileURLToPath(new URL("../drizzle", import.meta.url)),
    migrationsSchema: "public",
    migrationsTable: "__drizzle_migrations",
  });
  await sql.end();
}
