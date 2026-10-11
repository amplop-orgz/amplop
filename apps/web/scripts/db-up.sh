#!/usr/bin/env bash
# npm run db:up (05 S05-35): start local Postgres 16 and create the two roles with local-only passwords.
set -euo pipefail
cd "$(dirname "$0")/.."
docker compose up -d --wait db
docker compose exec -T db psql -q -v ON_ERROR_STOP=1 -U amplop -d amplop \
  -v migrator_pw=amplop_migrator -v app_pw=amplop_app < drizzle/roles.sql
echo "db up: postgres://amplop_app@127.0.0.1:5432/amplop"
