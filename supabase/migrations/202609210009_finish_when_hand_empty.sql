update public.games g
set rules = jsonb_set(
  g.rules,
  '{roundsToPlay}',
  to_jsonb(coalesce(
    (
      select max(cards_per_player.card_count)::integer
      from (
        select count(*) as card_count
        from public.game_cards gc
        where gc.game_id = g.id
        group by gc.player_id
      ) cards_per_player
    ),
    (g.rules->>'handSize')::integer + 1
  )),
  true
)
where g.status <> 'finished';

alter table public.games
alter column rules set default '{"handSize":5,"roundsToPlay":6,"actionTimeoutSeconds":60}'::jsonb;

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
        and (c.effect_key='cancel_round' or exists(
          select 1 from public.card_attribute_values cav where cav.card_id=gc.card_id and cav.attribute_id=ad.id
        ))
    )
  ) order by ad.display_order;
$$;

create or replace function public.resolve_round_if_ready(target_game_id uuid,target_round smallint)
returns void language plpgsql security definer set search_path='' as $$
declare r public.game_rounds%rowtype; first_sel public.round_selections%rowtype; second_sel public.round_selections%rowtype;
declare first_value numeric; second_value numeric; direction public.attribute_comparison; round_winner uuid; round_cancelled boolean;
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
  if not exists(select 1 from public.game_cards gc where gc.game_id=target_game_id and gc.played_round is null) then
    update public.games set status='finished',updated_at=now() where id=target_game_id;
  end if;
end; $$;

revoke execute on function public.resolve_round_if_ready(uuid,smallint) from public,anon,authenticated;

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
        and (c.effect_key='cancel_round' or exists(select 1 from public.card_attribute_values cav where cav.card_id=gc.card_id and cav.attribute_id=r.selected_attribute))
      order by random() limit 1;
      if random_card is null then raise exception 'CARD_NOT_AVAILABLE_FOR_ATTRIBUTE'; end if;
      insert into public.round_selections(game_id,round_number,player_id,card_id) values(target_game_id,r.round_number,participant.player_id,random_card);
    end if;
  end loop;
  perform public.resolve_round_if_ready(target_game_id,r.round_number);
end; $$;

revoke execute on function public.resolve_expired_action(uuid) from public,anon;
grant execute on function public.resolve_expired_action(uuid) to authenticated;
