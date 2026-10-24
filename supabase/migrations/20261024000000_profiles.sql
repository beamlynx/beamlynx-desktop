-- The list of people who signed in to Beamlynx. One row per person.
-- See beamlynx-plans/plans/012-know-who-uses-beamlynx.md and
-- supabase/README.md for the rules every migration follows.

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

-- Apps never touch the table. They call record_profile below, so the table
-- can change shape while every released app keeps calling the same
-- function. Row-level security with no policies, and no grants: nothing but
-- the function can read or write it.
alter table public.profiles enable row level security;
revoke all on public.profiles from anon, authenticated; -- compat: a new table, no app has used it

-- Records that the signed-in person was here, from which app version and OS.
--
-- `profile` is a JSON object, so old and new apps can send different fields:
-- unknown fields are ignored, and missing ones keep what is stored. Today an
-- app sends {"app_version": "...", "os": "..."}.
--
-- Who the person is comes from their sign-in, never from the app: email,
-- name and provider are read from auth.users.
create function public.record_profile(profile jsonb)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  uid uuid := auth.uid();
  account auth.users%rowtype;
begin
  if uid is null then
    raise exception 'Not signed in' using errcode = '42501';
  end if;
  select * into account from auth.users where id = uid;

  insert into public.profiles as p (user_id, email, name, provider, app_version, os)
  values (
    uid,
    account.email,
    left(coalesce(account.raw_user_meta_data->>'full_name', account.raw_user_meta_data->>'name',
                  account.raw_user_meta_data->>'user_name'), 200),
    account.raw_app_meta_data->>'provider',
    left(profile->>'app_version', 50),
    left(profile->>'os', 50)
  )
  on conflict (user_id) do update set
    email       = excluded.email,
    name        = coalesce(excluded.name, p.name),
    provider    = coalesce(excluded.provider, p.provider),
    app_version = coalesce(excluded.app_version, p.app_version),
    os          = coalesce(excluded.os, p.os),
    last_seen   = now();
end;
$$;

revoke all on function public.record_profile(jsonb) from public, anon; -- compat: a new function, no app has called it
grant execute on function public.record_profile(jsonb) to authenticated;
