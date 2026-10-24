# Accounts and usage stats

The app counts a few anonymous events and lets people sign in once, with GitHub or Google. This page is how to set up the services behind that, and how to try it from a dev build. The reasons are in `beamlynx-plans/plans/012-know-who-uses-beamlynx.md`.

## What the app does

- **Usage stats.** From the first launch, the app sends a few events to PostHog: `app_opened`, `connection_added`, `query_run`, `sign_in_skipped` and `sign_in_completed`. They carry the app version, OS and CPU architecture, and nothing else the user typed or saw. PostHog also records the country, from the IP address. The full list, and the check that enforces it, is `EVENTS` in `src/main/usage-stats.ts`. People can turn this off on the first-run screen or in Settings → Preferences.
- **Sign in once.** The first-run screen offers GitHub, Google, or Skip. After sign-in, PostHog joins the install's earlier events to the person, and the app writes the person's row in the `profiles` table.

Nothing is sent before the person has seen the first-run screen.

## Setting up the services

Do this once. All of it is in EU regions.

### Supabase

1. Create a project in an EU region, such as Frankfurt or Stockholm. The region can't be changed later.
2. Run `supabase/migrations/20261024000000_profiles.sql` in the SQL editor, or with `supabase db push`.
3. Under **Authentication → Sign In / Providers**:
   - Turn on **GitHub**. Create an OAuth app at github.com → Settings → Developer settings → OAuth Apps. Its callback URL is the one Supabase shows, ending in `/auth/v1/callback`.
   - Turn on **Google**. Create an OAuth client (type: Web application) in Google Cloud Console → APIs & Services → Credentials, with the same Supabase callback URL.
   - Turn off **Email**.
4. Under **Authentication → URL Configuration**:
   - **Site URL**: `https://beamlynx.com`
   - **Redirect URLs**: add `http://127.0.0.1:*/auth/callback`

   Supabase already accepts any redirect to a loopback IP address. The allowlist entry keeps sign-in working if that ever changes.
5. Copy the **Project URL** and the **publishable key** (the public key, also called the anon key). Never use the secret or service role key in the app.

### PostHog

Use the project the website uses, so website visits and app use are in one place. Copy its **project API key** (it starts with `phc_`) and check its host. The EU cloud is `https://eu.i.posthog.com`.

### The release build

Add these as **repository variables** (Settings → Secrets and variables → Actions → Variables), not secrets. They are public keys.

| Variable | Value |
|---|---|
| `BEAMLYNX_SUPABASE_URL` | The Supabase Project URL |
| `BEAMLYNX_SUPABASE_KEY` | The Supabase publishable key |
| `BEAMLYNX_POSTHOG_KEY` | The PostHog project API key |
| `BEAMLYNX_POSTHOG_HOST` | Optional. Defaults to `https://eu.i.posthog.com` |

The release workflow writes them to `dist/main/service-config.json` (`scripts/write-service-config.js`). A build without them has no first-run screen, no sign-in and no usage stats.

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

- **Who signed in:** the `profiles` table, in the Supabase dashboard, or from Beamlynx itself with the database connection string. Use the `postgres` user, which bypasses row-level security.
- **What they do:** PostHog. A signed-in person is a PostHog person with their email. Everyone else is an anonymous install ID.

## Removing someone

Delete the user under **Authentication → Users** in Supabase, which also deletes their `profiles` row. Delete the person in PostHog too.
