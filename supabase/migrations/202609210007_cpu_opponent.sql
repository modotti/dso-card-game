alter table public.players drop constraint if exists players_id_fkey;
alter table public.players add column is_cpu boolean not null default false;

insert into public.players (id, display_name, is_cpu)
values ('00000000-0000-0000-0000-000000000001', 'CPU', true)
on conflict (id) do update set display_name = excluded.display_name, is_cpu = true, updated_at = now();

create function public.create_cpu_game(player_name text)
returns table (game_id uuid, room_code text)
language plpgsql
security definer
set search_path = ''
as $$
declare
  new_game_id uuid;
  new_code text;
  attempts integer := 0;
  cpu_id constant uuid := '00000000-0000-0000-0000-000000000001';
begin
  if auth.uid() is null then raise exception 'AUTH_REQUIRED'; end if;
  if char_length(trim(player_name)) not between 1 and 32 then raise exception 'INVALID_PLAYER_NAME'; end if;

  insert into public.players (id, display_name, is_cpu)
  values (auth.uid(), trim(player_name), false)
  on conflict (id) do update set display_name = excluded.display_name, updated_at = now();

  loop
    attempts := attempts + 1;
    new_code := public.generate_room_code();
    begin
      insert into public.games (room_code, created_by, status)
      values (new_code, auth.uid(), 'ready')
      returning id into new_game_id;
      exit;
    exception when unique_violation then
      if attempts >= 5 then raise exception 'ROOM_CODE_GENERATION_FAILED'; end if;
    end;
  end loop;

  insert into public.game_players (game_id, player_id, seat)
  values (new_game_id, auth.uid(), 1), (new_game_id, cpu_id, 2);
  perform public.start_game(new_game_id);
  return query select new_game_id, new_code;
end;
$$;

create function public.play_cpu_turn(target_game_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  r public.game_rounds%rowtype;
  cpu_id uuid;
  chosen_attribute text;
  chosen_card text;
  timeout_seconds integer;
begin
  if not public.is_game_member(target_game_id) then raise exception 'GAME_ACCESS_DENIED'; end if;
  select gp.player_id into cpu_id
  from public.game_players gp
  join public.players p on p.id = gp.player_id and p.is_cpu
  where gp.game_id = target_game_id;
  if cpu_id is null then raise exception 'CPU_NOT_FOUND'; end if;

  select gr.* into r from public.game_rounds gr
  where gr.game_id = target_game_id order by gr.round_number desc limit 1 for update;
  if r.status = 'resolved' then return; end if;

  if r.status = 'choosing_attribute' then
    if r.active_player_id <> cpu_id then return; end if;
    select a.id into chosen_attribute
    from public.available_game_attributes(target_game_id) a order by random() limit 1;
    if chosen_attribute is null then raise exception 'NO_ATTRIBUTE_AVAILABLE'; end if;
    select (g.rules->>'actionTimeoutSeconds')::integer into timeout_seconds
    from public.games g where g.id = target_game_id;
    update public.game_rounds
    set selected_attribute = chosen_attribute,
        status = 'choosing_cards',
        action_deadline = now() + make_interval(secs => timeout_seconds)
    where game_id = target_game_id and round_number = r.round_number;
    return;
  end if;

  if exists (
    select 1 from public.round_selections rs
    where rs.game_id = target_game_id and rs.round_number = r.round_number and rs.player_id = cpu_id
  ) then return; end if;

  select gc.card_id into chosen_card
  from public.game_cards gc
  join public.card_attribute_values cav
    on cav.card_id = gc.card_id and cav.attribute_id = r.selected_attribute
  where gc.game_id = target_game_id
    and gc.player_id = cpu_id
    and gc.played_round is null
  order by random()
  limit 1;
  if chosen_card is null then raise exception 'CPU_CARD_NOT_AVAILABLE'; end if;

  insert into public.round_selections (game_id, round_number, player_id, card_id)
  values (target_game_id, r.round_number, cpu_id, chosen_card);
  perform public.resolve_round_if_ready(target_game_id, r.round_number);
end;
$$;

create or replace function public.advance_round(target_game_id uuid)
returns void language plpgsql security definer set search_path='' as $$
declare r public.game_rounds%rowtype; next_player uuid; timeout_seconds integer; next_is_cpu boolean;
begin
  select gr.* into r from public.game_rounds gr where gr.game_id=target_game_id order by gr.round_number desc limit 1 for update;
  if r.status<>'resolved' then raise exception 'ROUND_NOT_RESOLVED'; end if;
  if (select g.status from public.games g where g.id=target_game_id)='finished' then raise exception 'GAME_FINISHED'; end if;
  select gp.player_id,p.is_cpu into next_player,next_is_cpu from public.game_players gp join public.players p on p.id=gp.player_id where gp.game_id=target_game_id and gp.player_id<>r.active_player_id;
  if auth.uid()<>next_player and not (next_is_cpu and public.is_game_member(target_game_id)) then raise exception 'NOT_NEXT_ACTIVE_PLAYER'; end if;
  select (g.rules->>'actionTimeoutSeconds')::integer into timeout_seconds from public.games g where g.id=target_game_id;
  insert into public.game_rounds(game_id,round_number,active_player_id,action_deadline) values(target_game_id,r.round_number+1,next_player,now()+make_interval(secs=>timeout_seconds));
end; $$;

create or replace function public.get_game_state(requested_code text)
returns jsonb language plpgsql stable security definer set search_path='' as $$
declare target_game public.games%rowtype; current_round public.game_rounds%rowtype; result jsonb;
begin
  select g.* into target_game from public.games g where g.room_code=upper(trim(requested_code));
  if target_game.id is null or not public.is_game_member(target_game.id) then raise exception 'ROOM_NOT_FOUND'; end if;
  select gr.* into current_round from public.game_rounds gr where gr.game_id=target_game.id order by gr.round_number desc limit 1;
  select jsonb_build_object('id',target_game.id,'code',target_game.room_code,'status',target_game.status,'rules',target_game.rules,
    'players',(select jsonb_agg(jsonb_build_object('id',p.id,'displayName',p.display_name,'seat',gp.seat,'score',gp.score,'isCpu',p.is_cpu) order by gp.seat) from public.game_players gp join public.players p on p.id=gp.player_id where gp.game_id=target_game.id),
    'availableAttributes',(select coalesce(jsonb_agg(to_jsonb(a) order by a.display_order),'[]'::jsonb) from public.available_game_attributes(target_game.id) a),
    'hand',(select coalesce(jsonb_agg(public.game_card_payload(gc.card_id) order by gc.hand_position),'[]'::jsonb) from public.game_cards gc where gc.game_id=target_game.id and gc.player_id=auth.uid() and gc.played_round is null),
    'round',jsonb_build_object('number',current_round.round_number,'activePlayerId',current_round.active_player_id,'status',current_round.status,'attribute',current_round.selected_attribute,'winnerId',current_round.winner_id,'isTie',current_round.is_tie,'actionDeadline',current_round.action_deadline,
      'selectedPlayerIds',(select coalesce(jsonb_agg(rs.player_id),'[]'::jsonb) from public.round_selections rs where rs.game_id=target_game.id and rs.round_number=current_round.round_number),
      'revealedCards',case when current_round.status='resolved' then (select coalesce(jsonb_agg(jsonb_build_object('playerId',rs.player_id,'card',public.game_card_payload(rs.card_id))),'[]'::jsonb) from public.round_selections rs where rs.game_id=target_game.id and rs.round_number=current_round.round_number) else '[]'::jsonb end)) into result;
  return result;
end; $$;

revoke execute on function public.create_cpu_game(text),public.play_cpu_turn(uuid) from public,anon;
grant execute on function public.create_cpu_game(text),public.play_cpu_turn(uuid) to authenticated;
