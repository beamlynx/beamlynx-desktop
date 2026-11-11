-- Puts the person's GitHub identity in every token Supabase signs, as two
-- claims: github_id (GitHub's numeric user ID, as text) and github_login.
-- A Beamlynx server checks a token's signature and then trusts these two
-- claims to know who is asking. See
-- beamlynx-plans/plans/008-server-mode-and-identity.md.
--
-- They come from auth.identities, which only Supabase writes, from what
-- GitHub reported at sign-in. They never come from user_metadata: a
-- signed-in person can edit that themselves (supabase.auth.updateUser), so
-- a user_name there proves nothing.
--
-- Supabase calls this before signing every token, for every app ever
-- released. If it raised, nobody could sign in, so it never does: on any
-- error it returns the token unchanged.
--
-- The hook is switched on in config.toml for local databases, and by hand
-- in the dashboard for the live one (supabase/README.md).
create function public.custom_access_token_hook(event jsonb)
returns jsonb
language plpgsql
stable
set search_path = ''
as $$
declare
  claims jsonb;
  github_id text;
  github_login text;
begin
  -- Nothing else may set these two names. Drop them first, so a token never
  -- carries a GitHub identity that didn't come from the lookup below.
  claims := coalesce(event->'claims', '{}'::jsonb) - 'github_id' - 'github_login';

  select i.provider_id, i.identity_data->>'user_name'
    into github_id, github_login
    from auth.identities i
   where i.user_id = (event->>'user_id')::uuid
     and i.provider = 'github'
   order by i.created_at
   limit 1;

  if github_id is not null then
    claims := claims || jsonb_build_object('github_id', github_id);
    if github_login is not null then
      claims := claims || jsonb_build_object('github_login', github_login);
    end if;
  end if;

  return jsonb_set(event, '{claims}', claims);
exception when others then
  return event;
end;
$$;

-- Only Supabase's auth server may run it. A new function can be run by
-- everyone until told otherwise.
grant usage on schema public to supabase_auth_admin;
grant execute on function public.custom_access_token_hook(jsonb) to supabase_auth_admin;
revoke execute on function public.custom_access_token_hook(jsonb) from public, anon, authenticated; -- compat: a new function, no app has called it
