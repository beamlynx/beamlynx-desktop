#!/usr/bin/env bash
# Checks the token hook (custom_access_token_hook) against a local database
# with every migration applied. It runs the hook the way Supabase does, as
# supabase_auth_admin, and checks that:
#
# - github_id and github_login come from auth.identities, even when the
#   person has edited their own user_metadata to say something else
# - a person with no GitHub identity gets neither claim, and no error
# - every claim Supabase put in the token is still there
# - apps can't run the hook themselves
#
# See supabase/README.md. Needs a running local database, like
# test-supabase-compat.sh.
set -euo pipefail
cd "$(dirname "$0")/.."

container=$(docker ps --filter 'name=supabase_db_beamlynx' --format '{{.Names}}' | head -1)
if [ -z "$container" ]; then
  echo "No local Supabase database is running. Start one with: npx supabase db start" >&2
  exit 1
fi
psql() { docker exec -i "$container" psql -U postgres -d postgres -v ON_ERROR_STOP=1 -qtA "$@"; }
# The postgres user may not switch to supabase_auth_admin. supabase_admin may,
# and `set role` then drops its own rights, so the grants are what's tested.
psql_as_auth() { docker exec -i "$container" psql -U supabase_admin -d postgres -v ON_ERROR_STOP=1 -qtA "$@"; }

github_user=00000000-0000-4000-8000-000000000002
other_user=00000000-0000-4000-8000-000000000003

cleanup() { psql -c "delete from auth.users where id in ('$github_user', '$other_user')" >/dev/null; }
cleanup

# The GitHub user has edited their own metadata to claim to be someone else.
psql <<SQL
insert into auth.users (id, email, raw_user_meta_data, raw_app_meta_data, aud, role) values
  ('$github_user', 'gh@example.com', '{"user_name": "bob", "provider_id": "1"}', '{"provider": "github"}',
   'authenticated', 'authenticated'),
  ('$other_user', 'other@example.com', '{}', '{"provider": "email"}', 'authenticated', 'authenticated');
insert into auth.identities (provider_id, user_id, identity_data, provider, last_sign_in_at, created_at, updated_at)
values ('583231', '$github_user', '{"sub": "583231", "user_name": "real-login"}', 'github', now(), now(), now());
SQL

# Runs the hook as Supabase's auth server does, for one user, and prints the
# claims it returns.
claims_for() {
  psql_as_auth <<SQL
set role supabase_auth_admin;
select public.custom_access_token_hook(jsonb_build_object(
  'user_id', '$1',
  'authentication_method', 'oauth',
  'claims', jsonb_build_object(
    'sub', '$1', 'role', 'authenticated', 'aud', 'authenticated',
    'user_metadata', jsonb_build_object('user_name', 'bob'),
    'github_id', '1'
  )
))->'claims';
SQL
}

status=0
check() { # description, actual, expected
  if [ "$2" = "$3" ]; then
    echo "ok   $1"
  else
    echo "FAIL $1: got '$2', expected '$3'" >&2
    status=1
  fi
}

claims=$(claims_for "$github_user")
field() { psql -c "select '$claims'::jsonb->>'$1'"; }
check "github_id comes from auth.identities" "$(field github_id)" "583231"
check "github_login comes from auth.identities" "$(field github_login)" "real-login"
check "sub is kept" "$(field sub)" "$github_user"
check "role is kept" "$(field role)" "authenticated"
check "aud is kept" "$(field aud)" "authenticated"
check "user_metadata is kept" "$(psql -c "select '$claims'::jsonb->'user_metadata'->>'user_name'")" "bob"

claims=$(claims_for "$other_user")
check "no GitHub identity: no github_id, even if one was passed in" "$(field github_id)" ""
check "no GitHub identity: no github_login" "$(field github_login)" ""
check "no GitHub identity: sub is kept" "$(field sub)" "$other_user"

# A user_id that isn't a UUID makes the lookup fail. The token must still be
# issued, unchanged.
broken=$(psql_as_auth <<'SQL'
set role supabase_auth_admin;
select public.custom_access_token_hook('{"user_id": "not-a-uuid", "claims": {"sub": "x"}}')->'claims'->>'sub';
SQL
)
check "an error returns the token unchanged" "$broken" "x"

for role in anon authenticated; do
  if psql -c "set role $role; select public.custom_access_token_hook('{}')" >/dev/null 2>&1; then
    echo "FAIL the $role role can run the hook" >&2
    status=1
  else
    echo "ok   the $role role can't run the hook"
  fi
done

cleanup
exit $status
