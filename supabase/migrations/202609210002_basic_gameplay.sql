create table public.card_definitions (
  id text primary key,
  kind text not null default 'astronomical' check (kind in ('astronomical', 'effect')),
  catalog_name text not null,
  common_name text not null,
  object_type text not null,
  constellation text not null,
  distance_light_years numeric not null check (distance_light_years > 0),
  apparent_magnitude numeric not null,
  apparent_size_arcmin numeric not null check (apparent_size_arcmin > 0),
  physical_size_light_years numeric not null check (physical_size_light_years > 0),
  source_url text not null,
  enabled boolean not null default true
);

insert into public.card_definitions
  (id, catalog_name, common_name, object_type, constellation, distance_light_years, apparent_magnitude, apparent_size_arcmin, physical_size_light_years, source_url)
values
  ('m31','M31','Andromeda Galaxy','spiral_galaxy','Andromeda',2500000,3.44,190,152000,'https://science.nasa.gov/mission/hubble/science/explore-the-night-sky/hubble-messier-catalog/messier-31/'),
  ('m42','M42','Orion Nebula','emission_nebula','Orion',1500,4,85,24,'https://science.nasa.gov/mission/hubble/science/explore-the-night-sky/hubble-messier-catalog/messier-42/'),
  ('m8','M8','Lagoon Nebula','emission_nebula','Sagittarius',4100,6,90,110,'https://science.nasa.gov/mission/hubble/science/explore-the-night-sky/hubble-messier-catalog/messier-8/'),
  ('m16','M16','Eagle Nebula','emission_nebula','Serpens',7000,6,70,70,'https://science.nasa.gov/mission/hubble/science/explore-the-night-sky/hubble-messier-catalog/messier-16/'),
  ('m45','M45','Pleiades','open_cluster','Taurus',444,1.6,110,17.5,'https://science.nasa.gov/mission/hubble/science/explore-the-night-sky/hubble-messier-catalog/messier-45/'),
  ('m51','M51','Whirlpool Galaxy','spiral_galaxy','Canes Venatici',31000000,8.4,11.2,76000,'https://science.nasa.gov/mission/hubble/science/explore-the-night-sky/hubble-messier-catalog/messier-51/'),
  ('m57','M57','Ring Nebula','planetary_nebula','Lyra',2300,8.8,3.8,1.3,'https://science.nasa.gov/mission/hubble/science/explore-the-night-sky/hubble-messier-catalog/messier-57/'),
  ('m104','M104','Sombrero Galaxy','spiral_galaxy','Virgo',31100000,8,9,50000,'https://science.nasa.gov/mission/hubble/science/explore-the-night-sky/hubble-messier-catalog/messier-104/'),
  ('ngc253','NGC 253','Sculptor Galaxy','spiral_galaxy','Sculptor',11400000,7.1,27.5,90000,'https://science.nasa.gov/missions/webb/nasas-webb-delivers-unprecedented-look-into-heart-of-sculptor-galaxy/'),
  ('ngc7293','NGC 7293','Helix Nebula','planetary_nebula','Aquarius',655,7.6,25,2.9,'https://science.nasa.gov/universe/exoplanets-or-stars-from-afar/the-helix-nebula-unraveling-at-the-seams/');

alter table public.games add column rules jsonb not null default '{"handSize":5,"roundsToPlay":5}'::jsonb;
alter table public.game_players add column score smallint not null default 0 check (score >= 0);

create type public.game_round_status as enum ('choosing_attribute', 'choosing_cards', 'resolved');
create table public.game_cards (
  game_id uuid not null references public.games(id) on delete cascade,
  card_id text not null references public.card_definitions(id),
  player_id uuid not null,
  hand_position smallint not null,
  played_round smallint,
  primary key (game_id, card_id),
  foreign key (game_id, player_id) references public.game_players(game_id, player_id) on delete cascade
);
create table public.game_rounds (
  game_id uuid not null references public.games(id) on delete cascade,
  round_number smallint not null,
  active_player_id uuid not null,
  status public.game_round_status not null default 'choosing_attribute',
  selected_attribute text check (selected_attribute in ('distance_light_years','apparent_magnitude','apparent_size_arcmin','physical_size_light_years')),
  winner_id uuid,
  is_tie boolean not null default false,
  resolved_at timestamptz,
  primary key (game_id, round_number),
  foreign key (game_id, active_player_id) references public.game_players(game_id, player_id),
  foreign key (game_id, winner_id) references public.game_players(game_id, player_id)
);
create table public.round_selections (
  game_id uuid not null,
  round_number smallint not null,
  player_id uuid not null,
  card_id text not null,
  selected_at timestamptz not null default now(),
  primary key (game_id, round_number, player_id),
  foreign key (game_id, round_number) references public.game_rounds(game_id, round_number) on delete cascade,
  foreign key (game_id, card_id) references public.game_cards(game_id, card_id),
  foreign key (game_id, player_id) references public.game_players(game_id, player_id)
);

alter table public.card_definitions enable row level security;
alter table public.game_cards enable row level security;
alter table public.game_rounds enable row level security;
alter table public.round_selections enable row level security;
revoke all on public.card_definitions, public.game_cards, public.game_rounds, public.round_selections from anon, authenticated;
grant select on public.card_definitions, public.game_cards, public.game_rounds, public.round_selections to authenticated;
create policy "authenticated can read enabled cards" on public.card_definitions for select to authenticated using (enabled);
create policy "members can read game cards" on public.game_cards for select to authenticated using (public.is_game_member(game_id));
create policy "members can read rounds" on public.game_rounds for select to authenticated using (public.is_game_member(game_id));
create policy "members can read selections" on public.round_selections for select to authenticated using (public.is_game_member(game_id));

create function public.start_game(target_game_id uuid)
returns void language plpgsql security definer set search_path = '' as $$
declare hand_size integer; first_player uuid; second_player uuid;
begin
  select (g.rules->>'handSize')::integer into hand_size from public.games g where g.id = target_game_id for update;
  if (select count(*) from public.game_players gp where gp.game_id = target_game_id) <> 2 then raise exception 'PLAYERS_NOT_READY'; end if;
  if (select count(*) from public.card_definitions c where c.enabled and c.kind = 'astronomical') < hand_size * 2 then raise exception 'INSUFFICIENT_CARDS'; end if;
  if exists (select 1 from public.game_cards gc where gc.game_id = target_game_id) then return; end if;
  select gp.player_id into first_player from public.game_players gp where gp.game_id = target_game_id and gp.seat = 1;
  select gp.player_id into second_player from public.game_players gp where gp.game_id = target_game_id and gp.seat = 2;
  insert into public.game_cards (game_id, card_id, player_id, hand_position)
  select target_game_id, picked.id, case when picked.position <= hand_size then first_player else second_player end,
    case when picked.position <= hand_size then picked.position else picked.position - hand_size end
  from (select c.id, row_number() over (order by random())::smallint position from public.card_definitions c where c.enabled and c.kind = 'astronomical' limit (hand_size * 2)) picked;
  insert into public.game_rounds (game_id, round_number, active_player_id) values (target_game_id, 1, first_player);
  update public.games set status = 'in_progress', updated_at = now() where id = target_game_id;
end; $$;

create or replace function public.join_game(requested_code text, player_name text)
returns table (game_id uuid, room_code text) language plpgsql security definer set search_path = '' as $$
declare target_game public.games%rowtype; player_count integer; existing_seat smallint;
begin
  if auth.uid() is null then raise exception 'AUTH_REQUIRED'; end if;
  if char_length(trim(player_name)) not between 1 and 32 then raise exception 'INVALID_PLAYER_NAME'; end if;
  select g.* into target_game from public.games g where g.room_code = upper(trim(requested_code)) and g.status in ('waiting','ready') for update;
  if not found then raise exception 'ROOM_NOT_FOUND'; end if;
  insert into public.players (id,display_name) values (auth.uid(),trim(player_name)) on conflict (id) do update set display_name=excluded.display_name,updated_at=now();
  select gp.seat into existing_seat from public.game_players gp where gp.game_id=target_game.id and gp.player_id=auth.uid();
  if existing_seat is null then
    select count(*) into player_count from public.game_players gp where gp.game_id=target_game.id;
    if player_count >= 2 then raise exception 'ROOM_FULL'; end if;
    insert into public.game_players (game_id,player_id,seat) values (target_game.id,auth.uid(),2);
  end if;
  perform public.start_game(target_game.id);
  return query select target_game.id,target_game.room_code;
end; $$;

create function public.start_ready_game(requested_code text)
returns void language plpgsql security definer set search_path = '' as $$
declare target_id uuid;
begin
  select g.id into target_id from public.games g where g.room_code=upper(trim(requested_code));
  if target_id is null or not public.is_game_member(target_id) then raise exception 'ROOM_NOT_FOUND'; end if;
  perform public.start_game(target_id);
end; $$;

create function public.choose_round_attribute(target_game_id uuid, attribute_key text)
returns void language plpgsql security definer set search_path = '' as $$
declare current_round public.game_rounds%rowtype;
begin
  select gr.* into current_round from public.game_rounds gr where gr.game_id=target_game_id order by gr.round_number desc limit 1 for update;
  if current_round.active_player_id <> auth.uid() then raise exception 'NOT_ACTIVE_PLAYER'; end if;
  if current_round.status <> 'choosing_attribute' then raise exception 'ATTRIBUTE_ALREADY_CHOSEN'; end if;
  if attribute_key not in ('distance_light_years','apparent_magnitude','apparent_size_arcmin','physical_size_light_years') then raise exception 'INVALID_ATTRIBUTE'; end if;
  update public.game_rounds set selected_attribute=attribute_key,status='choosing_cards' where game_id=target_game_id and round_number=current_round.round_number;
end; $$;

create function public.choose_round_card(target_game_id uuid, selected_card_id text)
returns void language plpgsql security definer set search_path = '' as $$
declare r public.game_rounds%rowtype; selection_count integer; first_sel public.round_selections%rowtype; second_sel public.round_selections%rowtype;
declare first_value numeric; second_value numeric; round_winner uuid; rounds_to_play integer;
begin
  select gr.* into r from public.game_rounds gr where gr.game_id=target_game_id order by gr.round_number desc limit 1 for update;
  if r.status <> 'choosing_cards' then raise exception 'CARDS_NOT_EXPECTED'; end if;
  if not exists (select 1 from public.game_cards gc where gc.game_id=target_game_id and gc.card_id=selected_card_id and gc.player_id=auth.uid() and gc.played_round is null) then raise exception 'CARD_NOT_AVAILABLE'; end if;
  insert into public.round_selections (game_id,round_number,player_id,card_id) values (target_game_id,r.round_number,auth.uid(),selected_card_id)
    on conflict (game_id,round_number,player_id) do update set card_id=excluded.card_id,selected_at=now();
  select count(*) into selection_count from public.round_selections rs where rs.game_id=target_game_id and rs.round_number=r.round_number;
  if selection_count < 2 then return; end if;
  select rs.* into first_sel from public.round_selections rs join public.game_players gp on gp.game_id=rs.game_id and gp.player_id=rs.player_id where rs.game_id=target_game_id and rs.round_number=r.round_number and gp.seat=1;
  select rs.* into second_sel from public.round_selections rs join public.game_players gp on gp.game_id=rs.game_id and gp.player_id=rs.player_id where rs.game_id=target_game_id and rs.round_number=r.round_number and gp.seat=2;
  select case r.selected_attribute when 'distance_light_years' then c.distance_light_years when 'apparent_magnitude' then c.apparent_magnitude when 'apparent_size_arcmin' then c.apparent_size_arcmin else c.physical_size_light_years end into first_value from public.card_definitions c where c.id=first_sel.card_id;
  select case r.selected_attribute when 'distance_light_years' then c.distance_light_years when 'apparent_magnitude' then c.apparent_magnitude when 'apparent_size_arcmin' then c.apparent_size_arcmin else c.physical_size_light_years end into second_value from public.card_definitions c where c.id=second_sel.card_id;
  if first_value <> second_value then
    if r.selected_attribute='apparent_magnitude' then round_winner := case when first_value < second_value then first_sel.player_id else second_sel.player_id end;
    else round_winner := case when first_value > second_value then first_sel.player_id else second_sel.player_id end; end if;
    update public.game_players set score=score+1 where game_id=target_game_id and player_id=round_winner;
  end if;
  update public.game_cards gc set played_round=r.round_number from public.round_selections rs where rs.game_id=target_game_id and rs.round_number=r.round_number and gc.game_id=rs.game_id and gc.card_id=rs.card_id;
  update public.game_rounds set status='resolved',winner_id=round_winner,is_tie=(round_winner is null),resolved_at=now() where game_id=target_game_id and round_number=r.round_number;
  select (g.rules->>'roundsToPlay')::integer into rounds_to_play from public.games g where g.id=target_game_id;
  if r.round_number >= rounds_to_play then update public.games set status='finished',updated_at=now() where id=target_game_id;
  end if;
end; $$;

create function public.advance_round(target_game_id uuid)
returns void language plpgsql security definer set search_path = '' as $$
declare r public.game_rounds%rowtype; next_player uuid;
begin
  select gr.* into r from public.game_rounds gr where gr.game_id=target_game_id order by gr.round_number desc limit 1 for update;
  if r.status <> 'resolved' then raise exception 'ROUND_NOT_RESOLVED'; end if;
  if (select g.status from public.games g where g.id=target_game_id) = 'finished' then raise exception 'GAME_FINISHED'; end if;
  select gp.player_id into next_player from public.game_players gp where gp.game_id=target_game_id and gp.player_id<>r.active_player_id;
  if auth.uid() <> next_player then raise exception 'NOT_NEXT_ACTIVE_PLAYER'; end if;
  insert into public.game_rounds (game_id,round_number,active_player_id) values (target_game_id,r.round_number+1,next_player);
end; $$;

create function public.get_game_state(requested_code text)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare target_game public.games%rowtype; current_round public.game_rounds%rowtype; result jsonb;
begin
  select g.* into target_game from public.games g where g.room_code=upper(trim(requested_code));
  if target_game.id is null or not public.is_game_member(target_game.id) then raise exception 'ROOM_NOT_FOUND'; end if;
  select gr.* into current_round from public.game_rounds gr where gr.game_id=target_game.id order by gr.round_number desc limit 1;
  select jsonb_build_object(
    'id',target_game.id,'code',target_game.room_code,'status',target_game.status,'rules',target_game.rules,
    'players',(select jsonb_agg(jsonb_build_object('id',p.id,'displayName',p.display_name,'seat',gp.seat,'score',gp.score) order by gp.seat) from public.game_players gp join public.players p on p.id=gp.player_id where gp.game_id=target_game.id),
    'hand',(select coalesce(jsonb_agg(to_jsonb(c) - 'enabled' order by gc.hand_position),'[]'::jsonb) from public.game_cards gc join public.card_definitions c on c.id=gc.card_id where gc.game_id=target_game.id and gc.player_id=auth.uid() and gc.played_round is null),
    'round',jsonb_build_object('number',current_round.round_number,'activePlayerId',current_round.active_player_id,'status',current_round.status,'attribute',current_round.selected_attribute,'winnerId',current_round.winner_id,'isTie',current_round.is_tie,
      'selectedPlayerIds',(select coalesce(jsonb_agg(rs.player_id),'[]'::jsonb) from public.round_selections rs where rs.game_id=target_game.id and rs.round_number=current_round.round_number),
      'revealedCards',case when current_round.status='resolved' then (select coalesce(jsonb_agg(jsonb_build_object('playerId',rs.player_id,'card',to_jsonb(c)-'enabled')),'[]'::jsonb) from public.round_selections rs join public.card_definitions c on c.id=rs.card_id where rs.game_id=target_game.id and rs.round_number=current_round.round_number) else '[]'::jsonb end)
  ) into result;
  return result;
end; $$;

revoke execute on function public.start_game(uuid) from public,anon,authenticated;
revoke execute on function public.start_ready_game(text),public.choose_round_attribute(uuid,text),public.choose_round_card(uuid,text),public.advance_round(uuid),public.get_game_state(text) from public,anon;
grant execute on function public.start_ready_game(text),public.choose_round_attribute(uuid,text),public.choose_round_card(uuid,text),public.advance_round(uuid),public.get_game_state(text) to authenticated;
alter publication supabase_realtime add table public.game_cards,public.game_rounds,public.round_selections;
