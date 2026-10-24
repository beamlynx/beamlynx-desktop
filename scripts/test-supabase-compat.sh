#!/usr/bin/env bash
# Calls record_profile with every payload a released app sends
# (supabase/tests/payloads/), as a signed-in user, against a local database
# with every migration applied. Fails if any call fails, or if the row isn't
# written. See supabase/README.md.
#
# Needs a running local database: `npx supabase db start` (and `db reset`
# to apply the migrations). Connects with psql through docker, so nothing
# needs installing on the host.
set -euo pipefail
cd "$(dirname "$0")/.."

container=$(docker ps --filter 'name=supabase_db_beamlynx' --format '{{.Names}}' | head -1)
if [ -z "$container" ]; then
  echo "No local Supabase database is running. Start one with: npx supabase db start" >&2
  exit 1
fi
psql() { docker exec -i "$container" psql -U postgres -d postgres -v ON_ERROR_STOP=1 -qtA "$@"; }

user_id=00000000-0000-4000-8000-000000000001
psql <<SQL
delete from auth.users where id = '$user_id';
insert into auth.users (id, email, raw_user_meta_data, raw_app_meta_data, aud, role)
values ('$user_id', 'compat@example.com', '{"full_name": "Compat Test"}', '{"provider": "github"}',
        'authenticated', 'authenticated');
SQL

status=0
for payload in supabase/tests/payloads/*.json; do
  # Runs as the app does: the authenticated role, with the user's ID in the
  # JWT claims auth.uid() reads.
  if psql >/dev/null <<SQL
begin;
set local role authenticated;
select set_config('request.jwt.claims', '{"sub": "$user_id", "role": "authenticated"}', true);
select public.record_profile(\$payload\$$(cat "$payload")\$payload\$::jsonb);
commit;
SQL
  then
    echo "ok   $payload"
  else
    echo "FAIL $payload" >&2
    status=1
  fi
done

row=$(psql -c "select email || '|' || name || '|' || provider from public.profiles where user_id = '$user_id'")
if [ "$row" != "compat@example.com|Compat Test|github" ]; then
  echo "FAIL the profile row is wrong: '$row'" >&2
  status=1
fi

# Apps must not reach the table itself.
if psql -c "set role authenticated; select count(*) from public.profiles" >/dev/null 2>&1; then
  echo "FAIL the authenticated role can read public.profiles directly" >&2
  status=1
fi

psql -c "delete from auth.users where id = '$user_id'" >/dev/null
exit $status
