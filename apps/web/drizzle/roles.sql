-- One-time role setup (05 S05-36). Run by hand with the database owner's credentials:
--   psql "$OWNER_URL" -v migrator_pw=... -v app_pw=... -f apps/web/drizzle/roles.sql
-- The \gexec guards only make a re-run harmless; the statements are the spec's.
SELECT format('CREATE ROLE amplop_migrator LOGIN PASSWORD %L', :'migrator_pw')
  WHERE NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'amplop_migrator') \gexec
SELECT format('CREATE ROLE amplop_app LOGIN PASSWORD %L', :'app_pw')
  WHERE NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'amplop_app') \gexec
REVOKE CREATE ON SCHEMA public FROM PUBLIC;
GRANT USAGE, CREATE ON SCHEMA public TO amplop_migrator;
GRANT USAGE ON SCHEMA public TO amplop_app;
-- A non-superuser owner (Neon, Supabase) may only set default privileges for a role it belongs to.
SELECT format('GRANT amplop_migrator TO %I', current_user) \gexec
ALTER DEFAULT PRIVILEGES FOR ROLE amplop_migrator IN SCHEMA public
  GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO amplop_app;
ALTER DEFAULT PRIVILEGES FOR ROLE amplop_migrator IN SCHEMA public
  GRANT USAGE, SELECT ON SEQUENCES TO amplop_app;
-- drizzle-kit migrate always runs CREATE SCHEMA IF NOT EXISTS, which needs CREATE on the database.
SELECT format('GRANT CREATE ON DATABASE %I TO amplop_migrator', current_database()) \gexec
