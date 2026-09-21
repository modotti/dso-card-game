create or replace function public.resolve_round_if_ready(target_game_id uuid,target_round smallint)
returns void language plpgsql security definer set search_path='' as $$
declare r public.game_rounds%rowtype; first_sel public.round_selections%rowtype; second_sel public.round_selections%rowtype;
declare first_value numeric; second_value numeric; direction public.attribute_comparison; round_winner uuid; round_cancelled boolean;
declare leader_score integer; trailing_score integer; remaining_rounds integer;
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

  select max(gp.score),min(gp.score) into leader_score,trailing_score
  from public.game_players gp where gp.game_id=target_game_id;
  select coalesce(max(cards.card_count),0)::integer into remaining_rounds
  from (
    select count(*) as card_count
    from public.game_cards gc
    where gc.game_id=target_game_id and gc.played_round is null
    group by gc.player_id
  ) cards;

  if remaining_rounds=0 or leader_score>trailing_score+remaining_rounds then
    update public.games set status='finished',updated_at=now() where id=target_game_id;
  end if;
end; $$;

revoke execute on function public.resolve_round_if_ready(uuid,smallint) from public,anon,authenticated;
