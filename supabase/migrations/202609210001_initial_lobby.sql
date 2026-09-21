create table public.players (
  id uuid primary key references auth.users(id) on delete cascade,
  display_name text not null check (char_length(display_name) between 1 and 32),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create type public.game_status as enum ('waiting', 'ready', 'in_progress', 'finished');

create table public.games (
  id uuid primary key default gen_random_uuid(),
  room_code text not null unique check (room_code ~ '^[A-Z0-9]{6}$'),
  status public.game_status not null default 'waiting',
  created_by uuid not null references public.players(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.game_players (
  game_id uuid not null references public.games(id) on delete cascade,
  player_id uuid not null references public.players(id) on delete cascade,
  seat smallint not null check (seat in (1, 2)),
  joined_at timestamptz not null default now(),
  primary key (game_id, player_id),
  unique (game_id, seat)
);

alter table public.players enable row level security;
alter table public.games enable row level security;
alter table public.game_players enable row level security;

revoke all on public.players, public.games, public.game_players from anon, authenticated;
grant select on public.players, public.games, public.game_players to authenticated;

create function public.is_game_member(target_game_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.game_players gp
    where gp.game_id = target_game_id and gp.player_id = auth.uid()
  );
$$;

revoke execute on function public.is_game_member(uuid) from public, anon;
grant execute on function public.is_game_member(uuid) to authenticated;

create policy "players can read themselves or opponents"
on public.players for select to authenticated
using (
  id = auth.uid() or exists (
    select 1 from public.game_players mine
    join public.game_players theirs on theirs.game_id = mine.game_id
    where mine.player_id = auth.uid() and theirs.player_id = players.id
  )
);

create policy "members can read games"
on public.games for select to authenticated
using (public.is_game_member(id));

create policy "members can read game players"
on public.game_players for select to authenticated
using (public.is_game_member(game_id));

create function public.generate_room_code()
returns text
language plpgsql
volatile
set search_path = ''
as $$
declare
  alphabet constant text := 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  result text := '';
  position integer;
begin
  for position in 1..6 loop
    result := result || substr(alphabet, floor(random() * length(alphabet) + 1)::integer, 1);
  end loop;
  return result;
end;
$$;

create function public.create_game(player_name text)
returns table (game_id uuid, room_code text)
language plpgsql
security definer
set search_path = ''
as $$
declare
  new_game_id uuid;
  new_code text;
  attempts integer := 0;
begin
  if auth.uid() is null then raise exception 'AUTH_REQUIRED'; end if;
  if char_length(trim(player_name)) not between 1 and 32 then raise exception 'INVALID_PLAYER_NAME'; end if;

  insert into public.players (id, display_name)
  values (auth.uid(), trim(player_name))
  on conflict (id) do update set display_name = excluded.display_name, updated_at = now();

  loop
    attempts := attempts + 1;
    new_code := public.generate_room_code();
    begin
      insert into public.games (room_code, created_by) values (new_code, auth.uid()) returning id into new_game_id;
      exit;
    exception when unique_violation then
      if attempts >= 5 then raise exception 'ROOM_CODE_GENERATION_FAILED'; end if;
    end;
  end loop;

  insert into public.game_players (game_id, player_id, seat) values (new_game_id, auth.uid(), 1);
  return query select new_game_id, new_code;
end;
$$;

create function public.join_game(requested_code text, player_name text)
returns table (game_id uuid, room_code text)
language plpgsql
security definer
set search_path = ''
as $$
declare
  target_game public.games%rowtype;
  player_count integer;
  existing_seat smallint;
begin
  if auth.uid() is null then raise exception 'AUTH_REQUIRED'; end if;
  if char_length(trim(player_name)) not between 1 and 32 then raise exception 'INVALID_PLAYER_NAME'; end if;

  select g.* into target_game from public.games g
  where g.room_code = upper(trim(requested_code)) and g.status in ('waiting', 'ready')
  for update;
  if not found then raise exception 'ROOM_NOT_FOUND'; end if;

  insert into public.players (id, display_name)
  values (auth.uid(), trim(player_name))
  on conflict (id) do update set display_name = excluded.display_name, updated_at = now();

  select gp.seat into existing_seat from public.game_players gp
  where gp.game_id = target_game.id and gp.player_id = auth.uid();

  if existing_seat is null then
    select count(*) into player_count from public.game_players gp where gp.game_id = target_game.id;
    if player_count >= 2 then raise exception 'ROOM_FULL'; end if;
    insert into public.game_players (game_id, player_id, seat) values (target_game.id, auth.uid(), 2);
    update public.games set status = 'ready', updated_at = now() where id = target_game.id;
  end if;

  return query select target_game.id, target_game.room_code;
end;
$$;

create function public.get_game_lobby(requested_code text)
returns table (game_id uuid, room_code text, game_status public.game_status, players jsonb)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  target_id uuid;
begin
  select g.id into target_id from public.games g where g.room_code = upper(trim(requested_code));
  if target_id is null or not public.is_game_member(target_id) then raise exception 'ROOM_NOT_FOUND'; end if;

  return query
  select g.id, g.room_code, g.status,
    coalesce(jsonb_agg(jsonb_build_object('id', p.id, 'display_name', p.display_name, 'seat', gp.seat) order by gp.seat), '[]'::jsonb)
  from public.games g
  join public.game_players gp on gp.game_id = g.id
  join public.players p on p.id = gp.player_id
  where g.id = target_id
  group by g.id;
end;
$$;

revoke execute on function public.generate_room_code() from public, anon, authenticated;
revoke execute on function public.create_game(text) from public, anon;
revoke execute on function public.join_game(text, text) from public, anon;
revoke execute on function public.get_game_lobby(text) from public, anon;
grant execute on function public.create_game(text), public.join_game(text, text), public.get_game_lobby(text) to authenticated;

alter publication supabase_realtime add table public.games, public.game_players;
