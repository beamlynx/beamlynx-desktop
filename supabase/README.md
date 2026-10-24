# The Beamlynx database

The Supabase project behind sign-in. It holds the list of people who signed in (`profiles`). Setup is in `docs/accounts-and-usage-stats.md`.

Every installed copy of the app talks to this one database, and old copies stay installed for months. So every change here must keep **every released app** working. Three things make sure of that.

## 1. Apps call functions, never tables

An app calls `record_profile(profile jsonb)`. It never reads or writes a table. The function ignores fields it doesn't know and keeps stored values for fields an app doesn't send. A table can change shape as long as the function keeps accepting what released apps send.

A new kind of call is a new function. An existing function keeps its name and parameters for good.

## 2. Migrations only add

A migration may:

- create tables, columns, indexes, functions and policies
- add a column that is nullable or has a default
- replace a function's body, keeping its name and parameters

A migration must not:

- drop or rename anything
- change a column's type
- make a column `NOT NULL` without a default
- take away a grant or permission an app relies on
- edit a migration that is already merged, because it has already run

`scripts/check-supabase-migrations.js` enforces this in CI. It reads SQL with simple patterns, so it is a guard, not a proof. A statement that has to break the rule needs a `-- compat: <reason>` comment at the end of its line. A reviewer then reads that reason.

To remove something for real, first check PostHog's `app_version` to make sure no app in use still needs it. Then add the removal as a new migration.

## 3. Old apps' calls are tested

`supabase/tests/payloads/` holds the JSON each app version sends to `record_profile`. CI starts a local database, applies every migration, and calls the function with each file (`scripts/test-supabase-compat.sh`).

When an app starts sending something new, add a new payload file. Never edit or delete one: a released app still sends it.

## Deploying

`.github/workflows/supabase-migrate.yml` applies new migrations to the live database:

- on every merge to `main` that changes `supabase/migrations/`
- as the first job of every desktop release, before anything is built

Because migrations only add, applying them never breaks an app that is already out there. A migration therefore goes live before any app that needs it.

It needs three repository secrets: `SUPABASE_ACCESS_TOKEN`, `SUPABASE_PROJECT_REF` and `SUPABASE_DB_PASSWORD`. Until they exist, the workflow skips itself with a notice.

## Trying it locally

```sh
npx supabase@2 db start     # Postgres with Supabase's auth schema, in Docker
npx supabase@2 db reset     # applies every migration from scratch
./scripts/test-supabase-compat.sh
npx supabase@2 stop
```
