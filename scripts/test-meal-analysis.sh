#!/bin/sh
set -eu
cd "$(dirname "$0")/.."
pgbin=${PG_BIN:-$(pg_config --bindir)}
work=$(mktemp -d "${TMPDIR:-/tmp}/mealwise-sql.XXXXXX")
cleanup() {
  "$pgbin/pg_ctl" -D "$work/db" -m immediate stop >/dev/null 2>&1 || true
  rm -rf "$work"
}
trap cleanup EXIT HUP INT TERM
"$pgbin/initdb" -D "$work/db" -A trust --no-locale >/dev/null
"$pgbin/pg_ctl" -D "$work/db" -l "$work/postgres.log" -o "-k $work -c listen_addresses=''" -w start >/dev/null
export PGHOST="$work" PGDATABASE=postgres
psql -X -v ON_ERROR_STOP=1 -q <<'SQL'
create role anon;
create role authenticated;
create role service_role bypassrls;
create schema auth;
create table auth.users(id uuid primary key);
create function auth.uid() returns uuid language sql as 'select null::uuid';
create schema storage;
create table storage.buckets(id text primary key, name text, public boolean, file_size_limit bigint, allowed_mime_types text[]);
create table storage.objects(id uuid primary key, bucket_id text, name text);
SQL
psql -X -v ON_ERROR_STOP=1 -q -f supabase/schema.sql >/dev/null
psql -X -v ON_ERROR_STOP=1 -q -f supabase/meal-analysis.sql
psql -X -v ON_ERROR_STOP=1 -q -f scripts/meal-analysis.test.sql
echo 'SQL checks passed: save, rollback, ownership, stale writes, clarification, permissions.'
