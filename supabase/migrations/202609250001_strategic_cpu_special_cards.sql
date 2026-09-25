-- Let Medium and Hard evaluate offensive Special Cards without reading the
-- opponent's secret selection. Medium keeps a 25% random-choice window;
-- Hard always selects the card with the best estimated win probability.
create or replace function public.play_cpu_turn(target_game_id uuid)
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
  difficulty text;
begin
  if not public.is_game_member(target_game_id) then raise exception 'GAME_ACCESS_DENIED'; end if;

  select gp.player_id into cpu_id
  from public.game_players gp
  join public.players p on p.id=gp.player_id and p.is_cpu
  where gp.game_id=target_game_id;
  if cpu_id is null then raise exception 'CPU_NOT_FOUND'; end if;

  select gr.* into r
  from public.game_rounds gr
  where gr.game_id=target_game_id
  order by gr.round_number desc
  limit 1
  for update;
  if r.status='resolved' then return; end if;

  select coalesce(g.rules->>'cpuDifficulty','easy'),(g.rules->>'actionTimeoutSeconds')::integer
  into difficulty,timeout_seconds
  from public.games g
  where g.id=target_game_id;
  if difficulty not in ('easy','medium','hard') then difficulty:='easy'; end if;

  if r.status='choosing_attribute' then
    if r.active_player_id<>cpu_id then return; end if;
    if difficulty='hard' then
      select candidate.attribute_id into chosen_attribute
      from (
        select cpu_value.attribute_id,cpu_value.card_id,
          avg(case
            when attribute.comparison='higher_wins' and cpu_value.value>opponent_value.value then 1.0
            when attribute.comparison='lower_wins' and cpu_value.value<opponent_value.value then 1.0
            when cpu_value.value=opponent_value.value then 0.5
            else 0.0 end) win_probability
        from public.game_cards cpu_card
        join public.card_definitions cpu_definition on cpu_definition.id=cpu_card.card_id and cpu_definition.kind='astronomical'
        join public.card_attribute_values cpu_value on cpu_value.card_id=cpu_card.card_id
        join public.available_game_attributes(target_game_id) available_attribute on available_attribute.id=cpu_value.attribute_id
        join public.attribute_definitions attribute on attribute.id=cpu_value.attribute_id
        join public.card_attribute_values opponent_value on opponent_value.attribute_id=cpu_value.attribute_id
        join public.card_definitions opponent_definition on opponent_definition.id=opponent_value.card_id and opponent_definition.enabled and opponent_definition.kind='astronomical'
        where cpu_card.game_id=target_game_id and cpu_card.player_id=cpu_id and cpu_card.played_round is null
          and not exists(select 1 from public.game_cards known_cpu_card where known_cpu_card.game_id=target_game_id and known_cpu_card.player_id=cpu_id and known_cpu_card.card_id=opponent_value.card_id)
          and not exists(select 1 from public.round_selections revealed where revealed.game_id=target_game_id and revealed.round_number<r.round_number and revealed.card_id=opponent_value.card_id)
        group by cpu_value.attribute_id,cpu_value.card_id
      ) candidate
      order by candidate.win_probability desc,random()
      limit 1;
    end if;
    if difficulty<>'hard' or chosen_attribute is null then
      select a.id into chosen_attribute from public.available_game_attributes(target_game_id) a order by random() limit 1;
    end if;
    if chosen_attribute is null then raise exception 'NO_ATTRIBUTE_AVAILABLE'; end if;
    update public.game_rounds
    set selected_attribute=chosen_attribute,status='choosing_cards',action_deadline=now()+make_interval(secs=>timeout_seconds)
    where game_id=target_game_id and round_number=r.round_number;
    return;
  end if;

  if exists(select 1 from public.round_selections selection where selection.game_id=target_game_id and selection.round_number=r.round_number and selection.player_id=cpu_id) then return; end if;

  if difficulty='easy' or (difficulty='medium' and random()<0.25) then
    select cpu_card.card_id into chosen_card
    from public.game_cards cpu_card
    join public.card_definitions definition on definition.id=cpu_card.card_id
    where cpu_card.game_id=target_game_id and cpu_card.player_id=cpu_id and cpu_card.played_round is null
      and (definition.kind='effect' or exists(select 1 from public.card_attribute_values value where value.card_id=cpu_card.card_id and value.attribute_id=r.selected_attribute))
    order by random()
    limit 1;
  else
    -- Estimate every playable card against astronomical objects that could
    -- still be in the opponent's hand. Current-round selections are not read.
    select candidate.card_id into chosen_card
    from (
      select cpu_card.card_id,
        avg(case
          when attribute.comparison='higher_wins' and cpu_value.value>opponent_value.value then 1.0
          when attribute.comparison='lower_wins' and cpu_value.value<opponent_value.value then 1.0
          when cpu_value.value=opponent_value.value then 0.5
          else 0.0 end) win_probability
      from public.game_cards cpu_card
      join public.card_definitions cpu_definition on cpu_definition.id=cpu_card.card_id and cpu_definition.kind='astronomical'
      join public.card_attribute_values cpu_value on cpu_value.card_id=cpu_card.card_id and cpu_value.attribute_id=r.selected_attribute
      join public.attribute_definitions attribute on attribute.id=cpu_value.attribute_id
      join public.card_attribute_values opponent_value on opponent_value.attribute_id=r.selected_attribute
      join public.card_definitions opponent_definition on opponent_definition.id=opponent_value.card_id and opponent_definition.enabled and opponent_definition.kind='astronomical'
      where cpu_card.game_id=target_game_id and cpu_card.player_id=cpu_id and cpu_card.played_round is null
        and not exists(select 1 from public.game_cards known_cpu_card where known_cpu_card.game_id=target_game_id and known_cpu_card.player_id=cpu_id and known_cpu_card.card_id=opponent_definition.id)
        and not exists(select 1 from public.round_selections revealed where revealed.game_id=target_game_id and revealed.round_number<r.round_number and revealed.card_id=opponent_definition.id)
      group by cpu_card.card_id

      union all

      select cpu_card.card_id,
        avg(case
          when effect.effect_key='defeat_emission_nebula' and opponent.object_type='emission_nebula' then 1.0
          when effect.effect_key='defeat_galaxy' and opponent.object_type like '%_galaxy' then 1.0
          when effect.effect_key='defeat_star_cluster' and opponent.object_type in ('open_cluster','globular_cluster') then 1.0
          else 0.0 end) win_probability
      from public.game_cards cpu_card
      join public.card_definitions effect on effect.id=cpu_card.card_id and effect.kind='effect' and effect.effect_key<>'cancel_round'
      cross join public.card_definitions opponent
      where cpu_card.game_id=target_game_id and cpu_card.player_id=cpu_id and cpu_card.played_round is null
        and opponent.enabled and opponent.kind='astronomical'
        and not exists(select 1 from public.game_cards known_cpu_card where known_cpu_card.game_id=target_game_id and known_cpu_card.player_id=cpu_id and known_cpu_card.card_id=opponent.id)
        and not exists(select 1 from public.round_selections revealed where revealed.game_id=target_game_id and revealed.round_number<r.round_number and revealed.card_id=opponent.id)
      group by cpu_card.card_id
    ) candidate
    order by candidate.win_probability desc,random()
    limit 1;
  end if;

  -- Clouds or any remaining effect card is always a legal final option.
  if chosen_card is null then
    select cpu_card.card_id into chosen_card
    from public.game_cards cpu_card
    join public.card_definitions definition on definition.id=cpu_card.card_id and definition.kind='effect'
    where cpu_card.game_id=target_game_id and cpu_card.player_id=cpu_id and cpu_card.played_round is null
    order by random()
    limit 1;
  end if;

  if chosen_card is null then raise exception 'CPU_CARD_NOT_AVAILABLE'; end if;
  insert into public.round_selections(game_id,round_number,player_id,card_id)
  values(target_game_id,r.round_number,cpu_id,chosen_card);
  perform public.resolve_round_if_ready(target_game_id,r.round_number);
end;
$$;

revoke execute on function public.play_cpu_turn(uuid) from public,anon;
grant execute on function public.play_cpu_turn(uuid) to authenticated;
