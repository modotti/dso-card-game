insert into public.card_definitions
  (id, kind, catalog_name, common_name, object_type, constellation, source_url, effect_key, enabled)
values
  ('stellar-winds-seat-1','effect','SPECIAL','Stellar Winds','special_effect','—','generated://stellar-winds-card','defeat_emission_nebula',true),
  ('stellar-winds-seat-2','effect','SPECIAL','Stellar Winds','special_effect','—','generated://stellar-winds-card','defeat_emission_nebula',true),
  ('galactic-collision-seat-1','effect','SPECIAL','Galactic Collision','special_effect','—','generated://galactic-collision-card','defeat_galaxy',true),
  ('galactic-collision-seat-2','effect','SPECIAL','Galactic Collision','special_effect','—','generated://galactic-collision-card','defeat_galaxy',true),
  ('tidal-disruption-seat-1','effect','SPECIAL','Tidal Disruption','special_effect','—','generated://tidal-disruption-card','defeat_star_cluster',true),
  ('tidal-disruption-seat-2','effect','SPECIAL','Tidal Disruption','special_effect','—','generated://tidal-disruption-card','defeat_star_cluster',true)
on conflict (id) do update set
  kind=excluded.kind, catalog_name=excluded.catalog_name, common_name=excluded.common_name,
  object_type=excluded.object_type, constellation=excluded.constellation,
  source_url=excluded.source_url, effect_key=excluded.effect_key, enabled=true;

create or replace function public.start_game(target_game_id uuid)
returns void language plpgsql security definer set search_path = '' as $$
declare
  hand_size integer;
  first_player uuid;
  second_player uuid;
  first_seat smallint;
  first_special text;
  second_special text;
begin
  select (g.rules->>'handSize')::integer,g.starting_seat into hand_size,first_seat
  from public.games g where g.id=target_game_id for update;
  if (select count(*) from public.game_players gp where gp.game_id=target_game_id)<>2 then raise exception 'PLAYERS_NOT_READY'; end if;
  if (select count(*) from public.card_definitions c where c.enabled and c.kind='astronomical' and exists(select 1 from public.card_images ci where ci.card_id=c.id and ci.enabled))<hand_size*2 then raise exception 'INSUFFICIENT_CARDS'; end if;
  if exists(select 1 from public.game_cards gc where gc.game_id=target_game_id) then return; end if;
  select gp.player_id into first_player from public.game_players gp where gp.game_id=target_game_id and gp.seat=first_seat;
  select gp.player_id into second_player from public.game_players gp where gp.game_id=target_game_id and gp.seat<>first_seat;

  insert into public.game_cards(game_id,card_id,player_id,hand_position,image_id)
  select target_game_id,picked.id,
    case when picked.position<=hand_size then first_player else second_player end,
    case when picked.position<=hand_size then picked.position else picked.position-hand_size end,
    (select ci.id from public.card_images ci where ci.card_id=picked.id and ci.enabled order by random() limit 1)
  from (
    select chosen.id,row_number() over(order by chosen.random_order)::smallint position
    from (
      select c.id,random() random_order from public.card_definitions c
      where c.enabled and c.kind='astronomical'
        and exists(select 1 from public.card_images ci where ci.card_id=c.id and ci.enabled)
      order by random_order limit (hand_size*2)
    ) chosen
  ) picked;

  select c.id into first_special
  from public.card_definitions c
  where c.enabled and c.kind='effect' and c.id like '%-seat-1'
  order by random() limit 1;
  select c.id into second_special
  from public.card_definitions c
  where c.enabled and c.kind='effect' and c.id like '%-seat-2'
  order by random() limit 1;
  if first_special is null or second_special is null then raise exception 'SPECIAL_CARD_NOT_AVAILABLE'; end if;

  insert into public.game_cards(game_id,card_id,player_id,hand_position)
  values (target_game_id,first_special,first_player,hand_size+1),
         (target_game_id,second_special,second_player,hand_size+1);
  insert into public.game_rounds(game_id,round_number,active_player_id) values(target_game_id,1,first_player);
  update public.games set status='in_progress',updated_at=now() where id=target_game_id;
end; $$;

create or replace function public.available_game_attributes(target_game_id uuid)
returns table (id text,label_key text,unit text,comparison public.attribute_comparison,display_order smallint)
language sql stable security definer set search_path='' as $$
  select ad.id,ad.label_key,ad.unit,ad.comparison,ad.display_order
  from public.attribute_definitions ad
  where ad.enabled and not exists (
    select 1 from public.game_players gp
    where gp.game_id=target_game_id and not exists (
      select 1 from public.game_cards gc
      join public.card_definitions c on c.id=gc.card_id
      where gc.game_id=target_game_id and gc.player_id=gp.player_id and gc.played_round is null
        and (c.kind='effect' or exists(
          select 1 from public.card_attribute_values cav where cav.card_id=gc.card_id and cav.attribute_id=ad.id
        ))
    )
  ) order by ad.display_order;
$$;

create or replace function public.choose_round_card(target_game_id uuid,selected_card_id text)
returns void language plpgsql security definer set search_path='' as $$
declare r public.game_rounds%rowtype;
begin
  select gr.* into r from public.game_rounds gr where gr.game_id=target_game_id order by gr.round_number desc limit 1 for update;
  if r.status<>'choosing_cards' then raise exception 'CARDS_NOT_EXPECTED'; end if;
  if not exists(
    select 1 from public.game_cards gc join public.card_definitions c on c.id=gc.card_id
    where gc.game_id=target_game_id and gc.card_id=selected_card_id and gc.player_id=auth.uid() and gc.played_round is null
      and (c.kind='effect' or exists(select 1 from public.card_attribute_values cav where cav.card_id=gc.card_id and cav.attribute_id=r.selected_attribute))
  ) then raise exception 'CARD_NOT_AVAILABLE_FOR_ATTRIBUTE'; end if;
  insert into public.round_selections(game_id,round_number,player_id,card_id) values(target_game_id,r.round_number,auth.uid(),selected_card_id)
    on conflict(game_id,round_number,player_id) do update set card_id=excluded.card_id,selected_at=now();
  perform public.resolve_round_if_ready(target_game_id,r.round_number);
end; $$;

create or replace function public.resolve_round_if_ready(target_game_id uuid,target_round smallint)
returns void language plpgsql security definer set search_path='' as $$
declare
  r public.game_rounds%rowtype;
  first_sel public.round_selections%rowtype;
  second_sel public.round_selections%rowtype;
  first_card public.card_definitions%rowtype;
  second_card public.card_definitions%rowtype;
  first_value numeric;
  second_value numeric;
  direction public.attribute_comparison;
  round_winner uuid;
  round_cancelled boolean;
  special_wins boolean;
  leader_score integer;
  trailing_score integer;
  remaining_rounds integer;
begin
  select gr.* into r from public.game_rounds gr where gr.game_id=target_game_id and gr.round_number=target_round for update;
  if r.status<>'choosing_cards' or (select count(*) from public.round_selections rs where rs.game_id=target_game_id and rs.round_number=target_round)<2 then return; end if;

  select rs.* into first_sel from public.round_selections rs join public.game_players gp on gp.game_id=rs.game_id and gp.player_id=rs.player_id where rs.game_id=target_game_id and rs.round_number=target_round and gp.seat=1;
  select rs.* into second_sel from public.round_selections rs join public.game_players gp on gp.game_id=rs.game_id and gp.player_id=rs.player_id where rs.game_id=target_game_id and rs.round_number=target_round and gp.seat=2;
  select c.* into first_card from public.card_definitions c where c.id=first_sel.card_id;
  select c.* into second_card from public.card_definitions c where c.id=second_sel.card_id;

  round_cancelled := coalesce(first_card.effect_key='cancel_round',false)
    or coalesce(second_card.effect_key='cancel_round',false);
  if not round_cancelled then
    if first_card.kind='effect' and second_card.kind='astronomical' then
      special_wins := (first_card.effect_key='defeat_emission_nebula' and second_card.object_type='emission_nebula')
        or (first_card.effect_key='defeat_galaxy' and second_card.object_type like '%_galaxy')
        or (first_card.effect_key='defeat_star_cluster' and second_card.object_type in ('open_cluster','globular_cluster'));
      round_winner := case when special_wins then first_sel.player_id else second_sel.player_id end;
    elsif second_card.kind='effect' and first_card.kind='astronomical' then
      special_wins := (second_card.effect_key='defeat_emission_nebula' and first_card.object_type='emission_nebula')
        or (second_card.effect_key='defeat_galaxy' and first_card.object_type like '%_galaxy')
        or (second_card.effect_key='defeat_star_cluster' and first_card.object_type in ('open_cluster','globular_cluster'));
      round_winner := case when special_wins then second_sel.player_id else first_sel.player_id end;
    elsif first_card.kind='astronomical' and second_card.kind='astronomical' then
      select cav.value into first_value from public.card_attribute_values cav where cav.card_id=first_sel.card_id and cav.attribute_id=r.selected_attribute;
      select cav.value into second_value from public.card_attribute_values cav where cav.card_id=second_sel.card_id and cav.attribute_id=r.selected_attribute;
      select ad.comparison into direction from public.attribute_definitions ad where ad.id=r.selected_attribute;
      if first_value<>second_value then
        round_winner:=case when (direction='lower_wins' and first_value<second_value) or (direction='higher_wins' and first_value>second_value) then first_sel.player_id else second_sel.player_id end;
      end if;
    end if;
    if round_winner is not null then
      update public.game_players set score=score+1 where game_id=target_game_id and player_id=round_winner;
    end if;
  end if;

  update public.game_cards gc set played_round=target_round from public.round_selections rs where rs.game_id=target_game_id and rs.round_number=target_round and gc.game_id=rs.game_id and gc.card_id=rs.card_id;
  update public.game_rounds set status='resolved',winner_id=round_winner,is_tie=(round_winner is null and not round_cancelled),is_cancelled=round_cancelled,resolved_at=now(),action_deadline=null where game_id=target_game_id and round_number=target_round;

  select max(gp.score),min(gp.score) into leader_score,trailing_score from public.game_players gp where gp.game_id=target_game_id;
  select coalesce(max(cards.card_count),0)::integer into remaining_rounds
  from (select count(*) as card_count from public.game_cards gc where gc.game_id=target_game_id and gc.played_round is null group by gc.player_id) cards;
  if remaining_rounds=0 or leader_score>trailing_score+remaining_rounds then
    update public.games set status='finished',updated_at=now() where id=target_game_id;
  end if;
end; $$;

create or replace function public.resolve_expired_action(target_game_id uuid)
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
      select gc.card_id into random_card
      from public.game_cards gc join public.card_definitions c on c.id=gc.card_id
      where gc.game_id=target_game_id and gc.player_id=participant.player_id and gc.played_round is null
        and (c.kind='effect' or exists(select 1 from public.card_attribute_values cav where cav.card_id=gc.card_id and cav.attribute_id=r.selected_attribute))
      order by random() limit 1;
      if random_card is null then raise exception 'CARD_NOT_AVAILABLE_FOR_ATTRIBUTE'; end if;
      insert into public.round_selections(game_id,round_number,player_id,card_id) values(target_game_id,r.round_number,participant.player_id,random_card);
    end if;
  end loop;
  perform public.resolve_round_if_ready(target_game_id,r.round_number);
end; $$;

create or replace function public.play_cpu_turn(target_game_id uuid)
returns void language plpgsql security definer set search_path = '' as $$
declare
  r public.game_rounds%rowtype;
  cpu_id uuid;
  chosen_attribute text;
  chosen_card text;
  timeout_seconds integer;
  difficulty text;
begin
  if not public.is_game_member(target_game_id) then raise exception 'GAME_ACCESS_DENIED'; end if;
  select gp.player_id into cpu_id from public.game_players gp join public.players p on p.id=gp.player_id and p.is_cpu where gp.game_id=target_game_id;
  if cpu_id is null then raise exception 'CPU_NOT_FOUND'; end if;
  select gr.* into r from public.game_rounds gr where gr.game_id=target_game_id order by gr.round_number desc limit 1 for update;
  if r.status='resolved' then return; end if;
  select coalesce(g.rules->>'cpuDifficulty','easy'),(g.rules->>'actionTimeoutSeconds')::integer into difficulty,timeout_seconds from public.games g where g.id=target_game_id;
  if difficulty not in ('easy','medium','hard') then difficulty:='easy'; end if;

  if r.status='choosing_attribute' then
    if r.active_player_id<>cpu_id then return; end if;
    if difficulty='hard' then
      select candidate.attribute_id into chosen_attribute
      from (
        select cpu_value.attribute_id,cpu_value.card_id,
          avg(case when attribute.comparison='higher_wins' and cpu_value.value>opponent_value.value then 1.0 when attribute.comparison='lower_wins' and cpu_value.value<opponent_value.value then 1.0 when cpu_value.value=opponent_value.value then 0.5 else 0.0 end) win_probability
        from public.game_cards cpu_card
        join public.card_definitions cpu_definition on cpu_definition.id=cpu_card.card_id and cpu_definition.kind='astronomical'
        join public.card_attribute_values cpu_value on cpu_value.card_id=cpu_card.card_id
        join public.available_game_attributes(target_game_id) available_attribute on available_attribute.id=cpu_value.attribute_id
        join public.attribute_definitions attribute on attribute.id=cpu_value.attribute_id
        join public.card_attribute_values opponent_value on opponent_value.attribute_id=cpu_value.attribute_id
        join public.card_definitions opponent_definition on opponent_definition.id=opponent_value.card_id and opponent_definition.enabled and opponent_definition.kind='astronomical'
        where cpu_card.game_id=target_game_id and cpu_card.player_id=cpu_id and cpu_card.played_round is null
          and not exists(select 1 from public.game_cards known_cpu_card where known_cpu_card.game_id=target_game_id and known_cpu_card.player_id=cpu_id and known_cpu_card.card_id=opponent_value.card_id)
          and not exists(select 1 from public.round_selections revealed where revealed.game_id=target_game_id and revealed.card_id=opponent_value.card_id)
        group by cpu_value.attribute_id,cpu_value.card_id
      ) candidate order by candidate.win_probability desc,random() limit 1;
    end if;
    if difficulty<>'hard' or chosen_attribute is null then
      select a.id into chosen_attribute from public.available_game_attributes(target_game_id) a order by random() limit 1;
    end if;
    if chosen_attribute is null then raise exception 'NO_ATTRIBUTE_AVAILABLE'; end if;
    update public.game_rounds set selected_attribute=chosen_attribute,status='choosing_cards',action_deadline=now()+make_interval(secs=>timeout_seconds) where game_id=target_game_id and round_number=r.round_number;
    return;
  end if;

  if exists(select 1 from public.round_selections selection where selection.game_id=target_game_id and selection.round_number=r.round_number and selection.player_id=cpu_id) then return; end if;
  if difficulty='easy' or (difficulty='medium' and random()<0.25) then
    select cpu_card.card_id into chosen_card
    from public.game_cards cpu_card join public.card_definitions definition on definition.id=cpu_card.card_id
    where cpu_card.game_id=target_game_id and cpu_card.player_id=cpu_id and cpu_card.played_round is null
      and (definition.kind='effect' or exists(select 1 from public.card_attribute_values value where value.card_id=cpu_card.card_id and value.attribute_id=r.selected_attribute))
    order by random() limit 1;
  else
    select cpu_card.card_id into chosen_card
    from public.game_cards cpu_card
    join public.card_definitions definition on definition.id=cpu_card.card_id and definition.kind='astronomical'
    join public.card_attribute_values value on value.card_id=cpu_card.card_id and value.attribute_id=r.selected_attribute
    join public.attribute_definitions attribute on attribute.id=value.attribute_id
    where cpu_card.game_id=target_game_id and cpu_card.player_id=cpu_id and cpu_card.played_round is null
    order by case when attribute.comparison='higher_wins' then value.value end desc,case when attribute.comparison='lower_wins' then value.value end asc,random() limit 1;
  end if;
  if chosen_card is null then
    select cpu_card.card_id into chosen_card
    from public.game_cards cpu_card join public.card_definitions definition on definition.id=cpu_card.card_id and definition.kind='effect'
    where cpu_card.game_id=target_game_id and cpu_card.player_id=cpu_id and cpu_card.played_round is null
    order by random() limit 1;
  end if;
  if chosen_card is null then raise exception 'CPU_CARD_NOT_AVAILABLE'; end if;
  insert into public.round_selections(game_id,round_number,player_id,card_id) values(target_game_id,r.round_number,cpu_id,chosen_card);
  perform public.resolve_round_if_ready(target_game_id,r.round_number);
end; $$;

revoke execute on function public.resolve_round_if_ready(uuid,smallint) from public,anon,authenticated;
