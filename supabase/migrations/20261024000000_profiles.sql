-- The list of people who signed in to Beamlynx. One row per person, written
-- by the app on sign-in and at most once a day after that (src/main/account.ts).
-- See beamlynx-plans/plans/012-know-who-uses-beamlynx.md.

create table public.profiles (
  user_id      uuid primary key references auth.users on delete cascade,
  email        text,
  name         text,
  provider     text,
  first_seen   timestamptz not null default now(),
  last_seen    timestamptz not null default now(),
  app_version  text,
  os           text
);

-- Each signed-in person can read and write only their own row. The app uses
-- the public key, so these policies are all that stands between one user
-- and another's row.
alter table public.profiles enable row level security;

create policy "own profile: read" on public.profiles
  for select using ((select auth.uid()) = user_id);
create policy "own profile: insert" on public.profiles
  for insert with check ((select auth.uid()) = user_id);
create policy "own profile: update" on public.profiles
  for update using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
