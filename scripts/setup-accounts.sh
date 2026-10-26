#!/usr/bin/env bash
set -euo pipefail

# Sets up everything behind sign-in and usage stats that can be done from a
# script, and says exactly what is left to do by hand. Safe to run again: it
# finds what already exists and only fills in what's missing. See
# docs/accounts-and-usage-stats.md.
#
# What it does:
#   1. Finds or creates the Supabase project `beamlynx` in an EU region.
#   2. Configures its sign-in: GitHub and Google on, email off, the
#      127.0.0.1 return address allowed.
#   3. Stores the deploy secrets in this GitHub repo, and runs the
#      "Supabase migrations" workflow, which sets up the database.
#   4. Checks the database answers, and prints the command to try sign-in
#      from a dev build.
#   5. With --for-release only: sets the repo variables a release build reads,
#      so the next release ships sign-in and usage stats.
#
# Needs: gh (signed in), curl, jq, openssl.
#
# Environment:
#   SUPABASE_ACCESS_TOKEN        required. supabase.com -> Account -> Access Tokens
#   GITHUB_OAUTH_CLIENT_ID       } from the GitHub OAuth app. Without them,
#   GITHUB_OAUTH_CLIENT_SECRET   } GitHub sign-in stays off.
#   GOOGLE_OAUTH_CLIENT_ID       } from the Google OAuth client. Without them,
#   GOOGLE_OAUTH_CLIENT_SECRET   } Google sign-in stays off.
#   SUPABASE_ORG                 the organization's slug. Defaults to the only one,
#                                or else the one named Beamlynx
#   SUPABASE_DB_PASSWORD         only when the project already exists and the
#                                repo doesn't have the secret yet
#   BEAMLYNX_POSTHOG_KEY         --for-release only. Defaults to the website's
#                                key in ../beamlynx.com/.env.local
#
# Usage:
#   SUPABASE_ACCESS_TOKEN=sbp_... ./scripts/setup-accounts.sh
#   SUPABASE_ACCESS_TOKEN=sbp_... GITHUB_OAUTH_CLIENT_ID=... ... ./scripts/setup-accounts.sh
#   SUPABASE_ACCESS_TOKEN=sbp_... ./scripts/setup-accounts.sh --for-release

cd "$(dirname "$0")/.."

REPO="beamlynx/beamlynx-desktop"
PROJECT_NAME="beamlynx"
ORG_NAME="Beamlynx"
REGION="eu-central-1" # Frankfurt. Can't be changed after the project exists.
SITE_URL="https://beamlynx.com"
REDIRECT_URL="http://127.0.0.1:*/auth/callback"
API="https://api.supabase.com/v1"

FOR_RELEASE=false
for arg in "$@"; do
  case "$arg" in
    --for-release) FOR_RELEASE=true ;;
    *) echo "Unknown argument: $arg" >&2; exit 1 ;;
  esac
done

for tool in gh curl jq openssl; do
  command -v "$tool" >/dev/null || { echo "Needs $tool." >&2; exit 1; }
done
gh auth status >/dev/null 2>&1 || { echo "Sign in to GitHub first: gh auth login" >&2; exit 1; }
: "${SUPABASE_ACCESS_TOKEN:?Set SUPABASE_ACCESS_TOKEN: supabase.com -> Account -> Access Tokens}"

# Things that still need doing by hand, printed at the end.
TODO=()

supabase() { # supabase METHOD PATH [JSON]
  local out status data=()
  out="$(mktemp)"
  [ $# -ge 3 ] && data=(--data "$3")
  status=$(curl -sS -o "$out" -w '%{http_code}' -X "$1" "$API$2" \
    -H "Authorization: Bearer $SUPABASE_ACCESS_TOKEN" \
    -H 'Content-Type: application/json' \
    "${data[@]}")
  if [ "${status:0:1}" != 2 ]; then
    echo "Supabase API: $1 $2 failed with $status:" >&2
    cat "$out" >&2; echo >&2
    rm -f "$out"
    exit 1
  fi
  cat "$out"; rm -f "$out"
}

echo "== Supabase project"

# Look for the project first: a token limited to one organization may not
# be allowed to list organizations, and the organization is only needed to
# create the project.
REF="$(supabase GET /projects | jq -r --arg org "${SUPABASE_ORG:-}" --arg name "$PROJECT_NAME" \
  '.[] | select(.name == $name and ($org == "" or .organization_slug == $org)) | .ref' | head -1)"

if [ -z "$REF" ] && [ -z "${SUPABASE_ORG:-}" ]; then
  orgs="$(supabase GET /organizations)"
  # The only organization, or else the one named Beamlynx.
  SUPABASE_ORG="$(jq -r --arg name "$ORG_NAME" \
    'if length == 1 then .[0].slug else (map(select(.name | ascii_downcase == ($name | ascii_downcase)))[0].slug // empty) end' <<<"$orgs")"
  if [ -z "$SUPABASE_ORG" ]; then
    if [ "$(jq length <<<"$orgs")" = 0 ]; then
      echo "This token can't see any Supabase organization." >&2
      echo "Create one named $ORG_NAME at supabase.com, or give the token read access to it," >&2
      echo "or set SUPABASE_ORG=<slug> (it's in the URL: supabase.com/dashboard/org/<slug>)." >&2
    else
      echo "None of your Supabase organizations is named $ORG_NAME. Pick one with SUPABASE_ORG=<slug>:" >&2
      jq -r '.[] | "  \(.slug)  \(.name)"' <<<"$orgs" >&2
    fi
    exit 1
  fi
fi

NEW_DB_PASSWORD=""
if [ -z "$REF" ]; then
  # 32 letters and digits: strong, and safe in a URL or a shell.
  NEW_DB_PASSWORD="$(openssl rand -base64 48 | tr -dc 'A-Za-z0-9' | head -c 32)"
  body="$(jq -n --arg name "$PROJECT_NAME" --arg org "$SUPABASE_ORG" --arg pass "$NEW_DB_PASSWORD" --arg region "$REGION" \
    '{name: $name, organization_slug: $org, db_pass: $pass, region_selection: {type: "specific", code: $region}}')"
  REF="$(supabase POST /projects "$body" | jq -r .ref)"
  echo "Created project $PROJECT_NAME ($REF) in $REGION."
else
  echo "Found project $PROJECT_NAME ($REF)."
fi

URL="https://$REF.supabase.co"
CALLBACK="$URL/auth/v1/callback"

printf 'Waiting for it to be ready'
for _ in $(seq 1 60); do
  status="$(supabase GET "/projects/$REF" | jq -r .status)"
  [ "$status" = ACTIVE_HEALTHY ] && break
  case "$status" in
    INACTIVE|PAUSING) echo; echo "The project is paused. Restore it in the Supabase dashboard, then run this again." >&2; exit 1 ;;
  esac
  printf '.'; sleep 10
done
echo " $status"
[ "$status" = ACTIVE_HEALTHY ] || { echo "Still not ready after 10 minutes. Run this again later." >&2; exit 1; }

# The publishable key is the public one, meant to ship in apps. Never the
# secret or service role key.
keys="$(supabase GET "/projects/$REF/api-keys?reveal=true")"
KEY="$(jq -r '[.[] | select(.type == "publishable")][0].api_key // empty' <<<"$keys")"
if [ -z "$KEY" ]; then
  KEY="$(supabase POST "/projects/$REF/api-keys?reveal=true" '{"type": "publishable", "name": "default"}' | jq -r .api_key)"
fi

echo
echo "== Sign-in"

auth="$(jq -n --arg site "$SITE_URL" --arg redirect "$REDIRECT_URL" \
  '{site_url: $site, uri_allow_list: $redirect, external_email_enabled: false}')"

if [ -n "${GITHUB_OAUTH_CLIENT_ID:-}" ] && [ -n "${GITHUB_OAUTH_CLIENT_SECRET:-}" ]; then
  auth="$(jq --arg id "$GITHUB_OAUTH_CLIENT_ID" --arg secret "$GITHUB_OAUTH_CLIENT_SECRET" \
    '. + {external_github_enabled: true, external_github_client_id: $id, external_github_secret: $secret}' <<<"$auth")"
  echo "GitHub: on."
else
  TODO+=("Create the GitHub OAuth app, then run this again with GITHUB_OAUTH_CLIENT_ID and GITHUB_OAUTH_CLIENT_SECRET.
     github.com/organizations/beamlynx/settings/applications -> New OAuth App
       Application name:           Beamlynx
       Homepage URL:               $SITE_URL
       Authorization callback URL: $CALLBACK
     Then: Generate a new client secret.")
  echo "GitHub: skipped, no client ID and secret yet."
fi

if [ -n "${GOOGLE_OAUTH_CLIENT_ID:-}" ] && [ -n "${GOOGLE_OAUTH_CLIENT_SECRET:-}" ]; then
  auth="$(jq --arg id "$GOOGLE_OAUTH_CLIENT_ID" --arg secret "$GOOGLE_OAUTH_CLIENT_SECRET" \
    '. + {external_google_enabled: true, external_google_client_id: $id, external_google_secret: $secret}' <<<"$auth")"
  echo "Google: on."
else
  TODO+=("Create the Google OAuth client, then run this again with GOOGLE_OAUTH_CLIENT_ID and GOOGLE_OAUTH_CLIENT_SECRET.
     console.cloud.google.com -> a new project 'beamlynx' under Grephyte's organization
       Google Auth Platform -> Branding: app name Beamlynx, a support email you read,
         home page $SITE_URL, privacy $SITE_URL/privacy, terms $SITE_URL/terms,
         authorized domains beamlynx.com and supabase.co. No logo: a logo means a review by Google.
       Audience: External, then Publish app.
       Clients -> Create client: Web application, authorized redirect URI $CALLBACK")
  echo "Google: skipped, no client ID and secret yet."
fi

supabase PATCH "/projects/$REF/config/auth" "$auth" >/dev/null
echo "Email sign-in: off. Return address allowed: $REDIRECT_URL"

echo
echo "== Database"

secrets="$(gh secret list --repo "$REPO" --json name -q '.[].name')"
printf '%s' "$SUPABASE_ACCESS_TOKEN" | gh secret set SUPABASE_ACCESS_TOKEN --repo "$REPO"
printf '%s' "$REF" | gh secret set SUPABASE_PROJECT_REF --repo "$REPO"
DB_PASSWORD="${NEW_DB_PASSWORD:-${SUPABASE_DB_PASSWORD:-}}"
if [ -n "$DB_PASSWORD" ]; then
  printf '%s' "$DB_PASSWORD" | gh secret set SUPABASE_DB_PASSWORD --repo "$REPO"
elif ! grep -qx SUPABASE_DB_PASSWORD <<<"$secrets"; then
  echo "The repo has no SUPABASE_DB_PASSWORD, and this project already existed, so its password is unknown." >&2
  echo "Reset it under Project Settings -> Database, then run this again with SUPABASE_DB_PASSWORD." >&2
  exit 1
fi
echo "Repo secrets set: SUPABASE_ACCESS_TOKEN, SUPABASE_PROJECT_REF$([ -n "$DB_PASSWORD" ] && echo ', SUPABASE_DB_PASSWORD')."

# The same workflow every merge and release uses, so this also proves it works.
before="$(gh run list --repo "$REPO" --workflow supabase-migrate.yml --limit 1 --json databaseId -q '.[0].databaseId // 0')"
gh workflow run supabase-migrate.yml --repo "$REPO" --ref main
printf 'Started the "Supabase migrations" workflow'
run=""
for _ in $(seq 1 30); do
  run="$(gh run list --repo "$REPO" --workflow supabase-migrate.yml --limit 1 --json databaseId -q '.[0].databaseId // 0')"
  [ "$run" != "$before" ] && break
  printf '.'; sleep 2
done
echo
[ "$run" != "$before" ] || { echo "The workflow run didn't appear. Check the Actions tab." >&2; exit 1; }
echo "Waiting for it to finish, usually a minute or two."
gh run watch "$run" --repo "$REPO" --exit-status >/dev/null || {
  echo "The migrations failed: $(gh run view "$run" --repo "$REPO" --json url -q .url)" >&2
  exit 1
}
echo "Migrations applied."

# Without a signed-in user, record_profile refuses with "permission denied".
# A database without it answers "not found" instead, which is what this
# looks for.
answer="$(curl -sS -X POST "$URL/rest/v1/rpc/record_profile" -H "apikey: $KEY" \
  -H 'Content-Type: application/json' --data '{"profile": {}}')"
code="$(jq -r '.code // empty' <<<"$answer" 2>/dev/null || true)"
case "$code" in
  42501) echo "The database answers, and refuses callers who aren't signed in." ;;
  PGRST202) echo "The database has no record_profile function, although the migrations ran: $answer" >&2; exit 1 ;;
  *) echo "Unexpected answer from record_profile; check it in the dashboard: $answer" ;;
esac

if $FOR_RELEASE; then
  echo
  echo "== Release build"
  if [ -z "${BEAMLYNX_POSTHOG_KEY:-}" ] && [ -f ../beamlynx.com/.env.local ]; then
    BEAMLYNX_POSTHOG_KEY="$(sed -n 's/^VITE_POSTHOG_PROJECT_TOKEN=//p' ../beamlynx.com/.env.local)"
  fi
  : "${BEAMLYNX_POSTHOG_KEY:?Set BEAMLYNX_POSTHOG_KEY: the PostHog project API key of the website, starting phc_}"
  gh variable set BEAMLYNX_SUPABASE_URL --repo "$REPO" --body "$URL"
  gh variable set BEAMLYNX_SUPABASE_KEY --repo "$REPO" --body "$KEY"
  gh variable set BEAMLYNX_POSTHOG_KEY --repo "$REPO" --body "$BEAMLYNX_POSTHOG_KEY"
  echo "Repo variables set. The next release ships sign-in and usage stats."
fi

echo
echo "== Done"
if [ -n "$NEW_DB_PASSWORD" ]; then
  echo
  echo "The new database password. Save it in your password manager; it isn't shown again:"
  echo "  $NEW_DB_PASSWORD"
fi
echo
echo "Try sign-in from a dev build. In beamlynx-ui: NEXT_PUBLIC_DESKTOP=1 npm run dev"
echo "Then, in beamlynx-desktop:"
echo "  BEAMLYNX_SUPABASE_URL=$URL \\"
echo "  BEAMLYNX_SUPABASE_KEY=$KEY \\"
echo "  BEAMLYNX_DEV_UI_URL=http://localhost:3000 \\"
echo "  npm start"
if ! $FOR_RELEASE; then
  echo
  echo "When it works, run this again with --for-release so the next release ships it."
fi
if [ ${#TODO[@]} -gt 0 ]; then
  echo
  echo "Still to do by hand:"
  for i in "${!TODO[@]}"; do
    echo "  $((i + 1)). ${TODO[$i]}"
  done
fi
