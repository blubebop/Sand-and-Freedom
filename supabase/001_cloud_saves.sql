-- One private save per signed-in player. Clients cannot bypass revision checks.
create table public.game_saves (
  user_id uuid primary key references auth.users(id) on delete cascade,
  revision bigint not null default 1 check (revision > 0),
  payload jsonb not null check (jsonb_typeof(payload) = 'object' and octet_length(payload::text) <= 1000000),
  updated_at timestamptz not null default now()
);
alter table public.game_saves enable row level security;
revoke all on public.game_saves from anon, authenticated;
grant select on public.game_saves to authenticated;
create policy own_save on public.game_saves for select to authenticated
  using ((select auth.uid()) = user_id);

create schema if not exists private;
revoke all on schema private from public;
grant usage on schema private to authenticated;
create function private.save_game_impl(expected_revision bigint, save_payload jsonb)
returns setof public.game_saves language plpgsql security definer set search_path = '' as $$
declare player uuid := auth.uid();
begin
  if player is null then raise exception 'Sign in required' using errcode = '42501'; end if;
  if expected_revision < 0 or expected_revision is null then
    raise exception 'Invalid revision' using errcode = '22023';
  end if;
  if save_payload is null or jsonb_typeof(save_payload) <> 'object'
     or octet_length(save_payload::text) > 1000000
     or save_payload->>'version' is distinct from '1'
     or jsonb_typeof(save_payload->'values') is distinct from 'object' then
    raise exception 'Invalid save' using errcode = '22023';
  end if;
  -- Serialize even two first-time saves, without trusting a client-supplied user ID.
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(player::text, 0));
  if expected_revision = 0 then
    return query insert into public.game_saves(user_id, payload)
      values(player, save_payload) on conflict(user_id) do nothing returning *;
  else
    return query update public.game_saves
      set payload = save_payload, revision = revision + 1, updated_at = now()
      where user_id = player and revision = expected_revision returning *;
  end if;
  -- Empty result means another device saved first. The client must resolve it.
end;
$$;
revoke all on function private.save_game_impl(bigint,jsonb) from public, anon;
grant execute on function private.save_game_impl(bigint,jsonb) to authenticated;
create function public.save_game(expected_revision bigint, save_payload jsonb)
returns setof public.game_saves language sql security invoker set search_path = '' as $$
  select * from private.save_game_impl(expected_revision, save_payload);
$$;
revoke all on function public.save_game(bigint,jsonb) from public, anon;
grant execute on function public.save_game(bigint,jsonb) to authenticated;
