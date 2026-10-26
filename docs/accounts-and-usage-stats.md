# Accounts and usage stats

The app counts a few anonymous events and lets people sign in once, with GitHub or Google. This page is how to set up the services behind that, and how to try it from a dev build. The reasons are in `beamlynx-plans/plans/012-know-who-uses-beamlynx.md`.

## What the app does

- **Usage stats.** From the first launch, the app sends a few events to PostHog: `app_opened`, `connection_added`, `query_run`, `sign_in_skipped` and `sign_in_completed`. They carry the app version, OS and CPU architecture, and nothing else the user typed or saw. PostHog also records the country, from the IP address. The full list, and the check that enforces it, is `EVENTS` in `src/main/usage-stats.ts`. People can turn this off on the first-run screen or in Settings → Preferences.
- **Sign in once.** The first-run screen offers GitHub, Google, or Skip. After sign-in, PostHog joins the install's earlier events to the person, and the app writes the person's row in the `profiles` table.

Nothing is sent before the person has seen the first-run screen.

## Setting up the services

`scripts/setup-accounts.sh` does everything that can be scripted, and lists what is left to do by hand. Run it again at any point: it finds what already exists and only fills in what's missing. The comment at its top lists every environment variable it reads.

### By hand, before the script
1. Sign up at supabase.com, and create an organization named Beamlynx.
2. Create an access token under **Account → Access Tokens**. Supabase has no way to create one from a script.

### Run the script
```sh
SUPABASE_ACCESS_TOKEN=sbp_... ./scripts/setup-accounts.sh
```
It does the following:
1. Creates the `beamlynx` project in Frankfurt (`eu-central-1`). The region can't be changed later.
2. Turns email sign-in off, and allows the app's return address, `http://127.0.0.1:*/auth/callback`. Supabase already accepts any return to a loopback address; the allowlist entry keeps sign-in working if that changes.
3. Stores `SUPABASE_ACCESS_TOKEN`, `SUPABASE_PROJECT_REF` and `SUPABASE_DB_PASSWORD` as secrets in this repo.
4. Runs the **Supabase migrations** workflow, the same one every release runs first, and checks that the database answers.
5. Prints the new database password once, so you can save it. It also prints the Supabase callback URL that the OAuth apps need, and the command to try sign-in from a dev build.

### By hand, after the first run
GitHub and Google have no way to create these from a script. The script prints the exact values to fill in.

- **A GitHub OAuth app, under the beamlynx GitHub organization.** It gives a client ID and a client secret.
- **A Google OAuth client, under Grephyte's Google Cloud organization.** It gives a client ID and a client secret. Set up its consent screen first, under **Google Auth Platform**. Leave the logo out, because a logo means a review by Google. Then **Publish app**: until then, only test users you add can sign in.

Then run the script again with both:
```sh
SUPABASE_ACCESS_TOKEN=sbp_... \
GITHUB_OAUTH_CLIENT_ID=... GITHUB_OAUTH_CLIENT_SECRET=... \
GOOGLE_OAUTH_CLIENT_ID=... GOOGLE_OAUTH_CLIENT_SECRET=... \
./scripts/setup-accounts.sh
```

### Ship it
When sign-in works from a dev build, run the script once more with `--for-release`. It sets these **repository variables**, which the release workflow writes to `dist/main/service-config.json` (`scripts/write-service-config.js`):

| Variable | Value |
|---|---|
| `BEAMLYNX_SUPABASE_URL` | The Supabase project URL |
| `BEAMLYNX_SUPABASE_KEY` | The Supabase publishable key, which is public. Never the secret or service role key |
| `BEAMLYNX_POSTHOG_KEY` | The PostHog project API key. The website's project, so visits and app use are in one place. The script reads it from `../beamlynx.com/.env.local`, or from `BEAMLYNX_POSTHOG_KEY` |
| `BEAMLYNX_POSTHOG_HOST` | Optional, not set by the script. Defaults to `https://eu.i.posthog.com` |

A build without them has no first-run screen, no sign-in and no usage stats.

Every release applies new migrations as its first job, before anything is built, and stops if they fail. Migrations also deploy on every merge to `main` that changes one; see `supabase/README.md`. A release with `BEAMLYNX_SUPABASE_URL` set but the secrets missing stops too, so the app never ships pointing at a database that was never set up.

## When the services are unreachable

The app never waits for Supabase or PostHog. Every call to them can fail without the app noticing:

- **Offline at launch:** the first-run screen waits for a launch with a connection.
- **Offline after signing in:** the person stays signed in. Who they are is stored locally, and the daily profile update waits.
- **Supabase or PostHog down:** the same as offline. Failures are logged, nothing more.
- **Sign-in fails:** a one-line message, and the person can try again or skip.

## Trying it from a dev build

A dev build has no service config, so it sends nothing. To try it, set the same variables before starting:

```sh
BEAMLYNX_SUPABASE_URL=https://xyz.supabase.co \
BEAMLYNX_SUPABASE_KEY=sb_publishable_... \
npm start
```

Add `BEAMLYNX_POSTHOG_KEY` only to test usage stats. A separate PostHog project for testing keeps your events out of the real numbers. A packaged build ignores these variables.

A dev build has its own data folder, so its sign-in and install ID are separate from the installed app's. To see the first-run screen again, sign out and delete `account.onboarding` from the `meta` table in the dev build's `beamlynx.db`.

## Reading the list of users

- **Who signed in:** the `profiles` table, in the Supabase dashboard, or from Beamlynx itself with the database connection string. Use the `postgres` user: apps can't read the table at all, only call `record_profile`.
- **What they do:** PostHog. A signed-in person is a PostHog person with their email. Everyone else is an anonymous install ID.

## Removing someone

Delete the user under **Authentication → Users** in Supabase, which also deletes their `profiles` row. Delete the person in PostHog too.
