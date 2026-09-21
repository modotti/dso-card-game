update public.games set rules=rules||'{"actionTimeoutSeconds":30}'::jsonb where not rules?'actionTimeoutSeconds';
alter table public.games alter column rules set default '{"handSize":5,"roundsToPlay":5,"actionTimeoutSeconds":30}'::jsonb;
alter table public.game_rounds add column action_deadline timestamptz;
alter table public.game_rounds alter column action_deadline set default (now()+interval '30 seconds');
update public.game_rounds set action_deadline=now()+interval '30 seconds' where status<>'resolved';

create function public.resolve_round_if_ready(target_game_id uuid,target_round smallint)
returns void language plpgsql security definer set search_path='' as $$
declare r public.game_rounds%rowtype; first_sel public.round_selections%rowtype; second_sel public.round_selections%rowtype;
declare first_value numeric; second_value numeric; direction public.attribute_comparison; round_winner uuid; rounds_to_play integer;
begin
  select gr.* into r from public.game_rounds gr where gr.game_id=target_game_id and gr.round_number=target_round for update;
  if r.status<>'choosing_cards' or (select count(*) from public.round_selections rs where rs.game_id=target_game_id and rs.round_number=target_round)<2 then return; end if;
  select rs.* into first_sel from public.round_selections rs join public.game_players gp on gp.game_id=rs.game_id and gp.player_id=rs.player_id where rs.game_id=target_game_id and rs.round_number=target_round and gp.seat=1;
  select rs.* into second_sel from public.round_selections rs join public.game_players gp on gp.game_id=rs.game_id and gp.player_id=rs.player_id where rs.game_id=target_game_id and rs.round_number=target_round and gp.seat=2;
  select cav.value into first_value from public.card_attribute_values cav where cav.card_id=first_sel.card_id and cav.attribute_id=r.selected_attribute;
  select cav.value into second_value from public.card_attribute_values cav where cav.card_id=second_sel.card_id and cav.attribute_id=r.selected_attribute;
  select ad.comparison into direction from public.attribute_definitions ad where ad.id=r.selected_attribute;
  if first_value<>second_value then
    round_winner:=case when (direction='lower_wins' and first_value<second_value) or (direction='higher_wins' and first_value>second_value) then first_sel.player_id else second_sel.player_id end;
    update public.game_players set score=score+1 where game_id=target_game_id and player_id=round_winner;
  end if;
  update public.game_cards gc set played_round=target_round from public.round_selections rs where rs.game_id=target_game_id and rs.round_number=target_round and gc.game_id=rs.game_id and gc.card_id=rs.card_id;
  update public.game_rounds set status='resolved',winner_id=round_winner,is_tie=(round_winner is null),resolved_at=now(),action_deadline=null where game_id=target_game_id and round_number=target_round;
  select (g.rules->>'roundsToPlay')::integer into rounds_to_play from public.games g where g.id=target_game_id;
  if target_round>=rounds_to_play then update public.games set status='finished',updated_at=now() where id=target_game_id; end if;
end; $$;

create or replace function public.choose_round_attribute(target_game_id uuid,attribute_key text)
returns void language plpgsql security definer set search_path='' as $$
declare r public.game_rounds%rowtype; timeout_seconds integer;
begin
  select gr.* into r from public.game_rounds gr where gr.game_id=target_game_id order by gr.round_number desc limit 1 for update;
  if r.active_player_id<>auth.uid() then raise exception 'NOT_ACTIVE_PLAYER'; end if;
  if r.status<>'choosing_attribute' then raise exception 'ATTRIBUTE_ALREADY_CHOSEN'; end if;
  if not exists(select 1 from public.available_game_attributes(target_game_id) a where a.id=attribute_key) then raise exception 'ATTRIBUTE_NOT_AVAILABLE'; end if;
  select (g.rules->>'actionTimeoutSeconds')::integer into timeout_seconds from public.games g where g.id=target_game_id;
  update public.game_rounds set selected_attribute=attribute_key,status='choosing_cards',action_deadline=now()+make_interval(secs=>timeout_seconds) where game_id=target_game_id and round_number=r.round_number;
end; $$;

create or replace function public.choose_round_card(target_game_id uuid,selected_card_id text)
returns void language plpgsql security definer set search_path='' as $$
declare r public.game_rounds%rowtype;
begin
  select gr.* into r from public.game_rounds gr where gr.game_id=target_game_id order by gr.round_number desc limit 1 for update;
  if r.status<>'choosing_cards' then raise exception 'CARDS_NOT_EXPECTED'; end if;
  if not exists(select 1 from public.game_cards gc join public.card_attribute_values cav on cav.card_id=gc.card_id and cav.attribute_id=r.selected_attribute where gc.game_id=target_game_id and gc.card_id=selected_card_id and gc.player_id=auth.uid() and gc.played_round is null) then raise exception 'CARD_NOT_AVAILABLE_FOR_ATTRIBUTE'; end if;
  insert into public.round_selections(game_id,round_number,player_id,card_id) values(target_game_id,r.round_number,auth.uid(),selected_card_id)
    on conflict(game_id,round_number,player_id) do update set card_id=excluded.card_id,selected_at=now();
  perform public.resolve_round_if_ready(target_game_id,r.round_number);
end; $$;

create function public.resolve_expired_action(target_game_id uuid)
returns void language plpgsql security definer set search_path='' as $$
declare r public.game_rounds%rowtype; timeout_seconds integer; chosen_attribute text; participant record; random_card text;
begin
  if not public.is_game_member(target_game_id) then raise exception 'GAME_ACCESS_DENIED'; end if;
  select gr.* into r from public.game_rounds gr where gr.game_id=target_game_id order by gr.round_number desc limit 1 for update;
  if r.status='resolved' or r.action_deadline is null or clock_timestamp()<r.action_deadline then return; end if;
  select (g.rules->>'actionTimeoutSeconds')::integer into timeout_seconds from public.games g where g.id=target_game_id;
  if r.status='choosing_attribute' then
    select a.id into chosen_attribute from public.available_game_attributes(target_game_id) a order by random() limit 1;
    if chosen_attribute is null then raise exception 'NO_ATTRIBUTE_AVAILABLE'; end if;
    update public.game_rounds set selected_attribute=chosen_attribute,status='choosing_cards',action_deadline=clock_timestamp()+make_interval(secs=>timeout_seconds) where game_id=target_game_id and round_number=r.round_number;
    return;
  end if;
  for participant in select gp.player_id from public.game_players gp where gp.game_id=target_game_id loop
    if not exists(select 1 from public.round_selections rs where rs.game_id=target_game_id and rs.round_number=r.round_number and rs.player_id=participant.player_id) then
      select gc.card_id into random_card from public.game_cards gc join public.card_attribute_values cav on cav.card_id=gc.card_id and cav.attribute_id=r.selected_attribute where gc.game_id=target_game_id and gc.player_id=participant.player_id and gc.played_round is null order by random() limit 1;
      insert into public.round_selections(game_id,round_number,player_id,card_id) values(target_game_id,r.round_number,participant.player_id,random_card);
    end if;
  end loop;
  perform public.resolve_round_if_ready(target_game_id,r.round_number);
end; $$;

create or replace function public.advance_round(target_game_id uuid)
returns void language plpgsql security definer set search_path='' as $$
declare r public.game_rounds%rowtype; next_player uuid; timeout_seconds integer;
begin
  select gr.* into r from public.game_rounds gr where gr.game_id=target_game_id order by gr.round_number desc limit 1 for update;
  if r.status<>'resolved' then raise exception 'ROUND_NOT_RESOLVED'; end if;
  if (select g.status from public.games g where g.id=target_game_id)='finished' then raise exception 'GAME_FINISHED'; end if;
  select gp.player_id into next_player from public.game_players gp where gp.game_id=target_game_id and gp.player_id<>r.active_player_id;
  if auth.uid()<>next_player then raise exception 'NOT_NEXT_ACTIVE_PLAYER'; end if;
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
    'players',(select jsonb_agg(jsonb_build_object('id',p.id,'displayName',p.display_name,'seat',gp.seat,'score',gp.score) order by gp.seat) from public.game_players gp join public.players p on p.id=gp.player_id where gp.game_id=target_game.id),
    'availableAttributes',(select coalesce(jsonb_agg(to_jsonb(a) order by a.display_order),'[]'::jsonb) from public.available_game_attributes(target_game.id) a),
    'hand',(select coalesce(jsonb_agg(public.game_card_payload(gc.card_id) order by gc.hand_position),'[]'::jsonb) from public.game_cards gc where gc.game_id=target_game.id and gc.player_id=auth.uid() and gc.played_round is null),
    'round',jsonb_build_object('number',current_round.round_number,'activePlayerId',current_round.active_player_id,'status',current_round.status,'attribute',current_round.selected_attribute,'winnerId',current_round.winner_id,'isTie',current_round.is_tie,'actionDeadline',current_round.action_deadline,
      'selectedPlayerIds',(select coalesce(jsonb_agg(rs.player_id),'[]'::jsonb) from public.round_selections rs where rs.game_id=target_game.id and rs.round_number=current_round.round_number),
      'revealedCards',case when current_round.status='resolved' then (select coalesce(jsonb_agg(jsonb_build_object('playerId',rs.player_id,'card',public.game_card_payload(rs.card_id))),'[]'::jsonb) from public.round_selections rs where rs.game_id=target_game.id and rs.round_number=current_round.round_number) else '[]'::jsonb end)) into result;
  return result;
end; $$;

revoke execute on function public.resolve_round_if_ready(uuid,smallint) from public,anon,authenticated;
revoke execute on function public.resolve_expired_action(uuid) from public,anon;
grant execute on function public.resolve_expired_action(uuid) to authenticated;
