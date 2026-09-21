alter table public.card_definitions add column effect_key text;
alter table public.game_rounds add column is_cancelled boolean not null default false;

insert into public.card_definitions
  (id, kind, catalog_name, common_name, object_type, constellation, source_url, effect_key)
values
  ('clouds-seat-1', 'effect', 'CLOUDS', 'Clouds', 'special_effect', '—', 'generated://clouds-card', 'cancel_round'),
  ('clouds-seat-2', 'effect', 'CLOUDS', 'Clouds', 'special_effect', '—', 'generated://clouds-card', 'cancel_round');

create or replace function public.start_game(target_game_id uuid)
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
  insert into public.game_cards (game_id, card_id, player_id, hand_position)
  values
    (target_game_id, 'clouds-seat-1', first_player, hand_size + 1),
    (target_game_id, 'clouds-seat-2', second_player, hand_size + 1);
  insert into public.game_rounds (game_id, round_number, active_player_id) values (target_game_id, 1, first_player);
  update public.games set status = 'in_progress', updated_at = now() where id = target_game_id;
end; $$;

create or replace function public.resolve_round_if_ready(target_game_id uuid,target_round smallint)
returns void language plpgsql security definer set search_path='' as $$
declare r public.game_rounds%rowtype; first_sel public.round_selections%rowtype; second_sel public.round_selections%rowtype;
declare first_value numeric; second_value numeric; direction public.attribute_comparison; round_winner uuid; rounds_to_play integer; round_cancelled boolean;
begin
  select gr.* into r from public.game_rounds gr where gr.game_id=target_game_id and gr.round_number=target_round for update;
  if r.status<>'choosing_cards' or (select count(*) from public.round_selections rs where rs.game_id=target_game_id and rs.round_number=target_round)<2 then return; end if;
  select exists(
    select 1 from public.round_selections rs
    join public.card_definitions c on c.id=rs.card_id
    where rs.game_id=target_game_id and rs.round_number=target_round and c.effect_key='cancel_round'
  ) into round_cancelled;
  if not round_cancelled then
    select rs.* into first_sel from public.round_selections rs join public.game_players gp on gp.game_id=rs.game_id and gp.player_id=rs.player_id where rs.game_id=target_game_id and rs.round_number=target_round and gp.seat=1;
    select rs.* into second_sel from public.round_selections rs join public.game_players gp on gp.game_id=rs.game_id and gp.player_id=rs.player_id where rs.game_id=target_game_id and rs.round_number=target_round and gp.seat=2;
    select cav.value into first_value from public.card_attribute_values cav where cav.card_id=first_sel.card_id and cav.attribute_id=r.selected_attribute;
    select cav.value into second_value from public.card_attribute_values cav where cav.card_id=second_sel.card_id and cav.attribute_id=r.selected_attribute;
    select ad.comparison into direction from public.attribute_definitions ad where ad.id=r.selected_attribute;
    if first_value<>second_value then
      round_winner:=case when (direction='lower_wins' and first_value<second_value) or (direction='higher_wins' and first_value>second_value) then first_sel.player_id else second_sel.player_id end;
      update public.game_players set score=score+1 where game_id=target_game_id and player_id=round_winner;
    end if;
  end if;
  update public.game_cards gc set played_round=target_round from public.round_selections rs where rs.game_id=target_game_id and rs.round_number=target_round and gc.game_id=rs.game_id and gc.card_id=rs.card_id;
  update public.game_rounds set status='resolved',winner_id=round_winner,is_tie=(round_winner is null and not round_cancelled),is_cancelled=round_cancelled,resolved_at=now(),action_deadline=null where game_id=target_game_id and round_number=target_round;
  select (g.rules->>'roundsToPlay')::integer into rounds_to_play from public.games g where g.id=target_game_id;
  if target_round>=rounds_to_play then update public.games set status='finished',updated_at=now() where id=target_game_id; end if;
end; $$;

create or replace function public.choose_round_card(target_game_id uuid,selected_card_id text)
returns void language plpgsql security definer set search_path='' as $$
declare r public.game_rounds%rowtype;
begin
  select gr.* into r from public.game_rounds gr where gr.game_id=target_game_id order by gr.round_number desc limit 1 for update;
  if r.status<>'choosing_cards' then raise exception 'CARDS_NOT_EXPECTED'; end if;
  if not exists(
    select 1 from public.game_cards gc join public.card_definitions c on c.id=gc.card_id
    where gc.game_id=target_game_id and gc.card_id=selected_card_id and gc.player_id=auth.uid() and gc.played_round is null
      and (c.effect_key='cancel_round' or exists(select 1 from public.card_attribute_values cav where cav.card_id=gc.card_id and cav.attribute_id=r.selected_attribute))
  ) then raise exception 'CARD_NOT_AVAILABLE_FOR_ATTRIBUTE'; end if;
  insert into public.round_selections(game_id,round_number,player_id,card_id) values(target_game_id,r.round_number,auth.uid(),selected_card_id)
    on conflict(game_id,round_number,player_id) do update set card_id=excluded.card_id,selected_at=now();
  perform public.resolve_round_if_ready(target_game_id,r.round_number);
end; $$;

create or replace function public.play_cpu_turn(target_game_id uuid)
returns void language plpgsql security definer set search_path = '' as $$
declare r public.game_rounds%rowtype; cpu_id uuid; chosen_attribute text; chosen_card text; timeout_seconds integer;
begin
  if not public.is_game_member(target_game_id) then raise exception 'GAME_ACCESS_DENIED'; end if;
  select gp.player_id into cpu_id from public.game_players gp join public.players p on p.id=gp.player_id and p.is_cpu where gp.game_id=target_game_id;
  if cpu_id is null then raise exception 'CPU_NOT_FOUND'; end if;
  select gr.* into r from public.game_rounds gr where gr.game_id=target_game_id order by gr.round_number desc limit 1 for update;
  if r.status='resolved' then return; end if;
  if r.status='choosing_attribute' then
    if r.active_player_id<>cpu_id then return; end if;
    select a.id into chosen_attribute from public.available_game_attributes(target_game_id) a order by random() limit 1;
    if chosen_attribute is null then raise exception 'NO_ATTRIBUTE_AVAILABLE'; end if;
    select (g.rules->>'actionTimeoutSeconds')::integer into timeout_seconds from public.games g where g.id=target_game_id;
    update public.game_rounds set selected_attribute=chosen_attribute,status='choosing_cards',action_deadline=now()+make_interval(secs=>timeout_seconds) where game_id=target_game_id and round_number=r.round_number;
    return;
  end if;
  if exists(select 1 from public.round_selections rs where rs.game_id=target_game_id and rs.round_number=r.round_number and rs.player_id=cpu_id) then return; end if;
  select gc.card_id into chosen_card
  from public.game_cards gc join public.card_definitions c on c.id=gc.card_id
  where gc.game_id=target_game_id and gc.player_id=cpu_id and gc.played_round is null
    and (c.effect_key='cancel_round' or exists(select 1 from public.card_attribute_values cav where cav.card_id=gc.card_id and cav.attribute_id=r.selected_attribute))
  order by random() limit 1;
  if chosen_card is null then raise exception 'CPU_CARD_NOT_AVAILABLE'; end if;
  insert into public.round_selections(game_id,round_number,player_id,card_id) values(target_game_id,r.round_number,cpu_id,chosen_card);
  perform public.resolve_round_if_ready(target_game_id,r.round_number);
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
    'round',jsonb_build_object('number',current_round.round_number,'activePlayerId',current_round.active_player_id,'status',current_round.status,'attribute',current_round.selected_attribute,'winnerId',current_round.winner_id,'isTie',current_round.is_tie,'isCancelled',current_round.is_cancelled,'actionDeadline',current_round.action_deadline,
      'selectedPlayerIds',(select coalesce(jsonb_agg(rs.player_id),'[]'::jsonb) from public.round_selections rs where rs.game_id=target_game.id and rs.round_number=current_round.round_number),
      'revealedCards',case when current_round.status='resolved' then (select coalesce(jsonb_agg(jsonb_build_object('playerId',rs.player_id,'card',public.game_card_payload(rs.card_id))),'[]'::jsonb) from public.round_selections rs where rs.game_id=target_game.id and rs.round_number=current_round.round_number) else '[]'::jsonb end)) into result;
  return result;
end; $$;

revoke execute on function public.resolve_round_if_ready(uuid,smallint) from public,anon,authenticated;
