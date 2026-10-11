import { defineConfig } from "drizzle-kit";

// Migrations run with the migration role only (05 S05-35); the app never migrates at run time.
export default defineConfig({
  dialect: "postgresql",
  schema: "./src/lib/server/db/schema.ts",
  out: "./drizzle",
  dbCredentials: { url: process.env.DATABASE_MIGRATION_URL ?? "" },
  migrations: { schema: "public", table: "__drizzle_migrations" },
  strict: true,
});
