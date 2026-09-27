#!/bin/sh
set -eu

: "${MOCCA_APP_PASSWORD:?MOCCA_APP_PASSWORD is required}"

psql --set=ON_ERROR_STOP=1 --set=app_password="$MOCCA_APP_PASSWORD" <<'SQL'
SELECT format('CREATE ROLE mocca_app LOGIN PASSWORD %L', :'app_password')
WHERE NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'mocca_app')
\gexec
ALTER ROLE mocca_app WITH LOGIN PASSWORD :'app_password';
SQL
