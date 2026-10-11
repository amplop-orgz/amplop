# apps/web

The Next.js app: landing page, phone app and API route handlers (specs 05 to 15, 17). See the [root README](../../README.md).

- `npm run db:up` starts Postgres 16 in Docker and creates the two roles (`drizzle/roles.sql`); `npm run db:migrate` applies `drizzle/`.
- `npm test -w @amplop/web` runs the unit suite against that database (`.env.test`).
- `npm run build -w @amplop/web` builds and then runs the bundle scan (`scripts/bundle-scan.mjs`).
