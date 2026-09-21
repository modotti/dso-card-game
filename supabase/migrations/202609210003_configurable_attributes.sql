create type public.attribute_comparison as enum ('higher_wins', 'lower_wins');

create table public.attribute_definitions (
  id text primary key,
  label_key text not null unique,
  unit text not null,
  comparison public.attribute_comparison not null,
  display_order smallint not null unique,
  enabled boolean not null default true
);

create table public.card_attribute_values (
  card_id text not null references public.card_definitions(id) on delete cascade,
  attribute_id text not null references public.attribute_definitions(id) on delete cascade,
  value numeric not null,
  is_approximate boolean not null default false,
  source_url text,
  notes text,
  primary key (card_id, attribute_id)
);

insert into public.attribute_definitions (id,label_key,unit,comparison,display_order) values
  ('distance_light_years','attribute.distance','ly','higher_wins',1),
  ('apparent_magnitude','attribute.apparentMagnitude','mag','lower_wins',2),
  ('apparent_size_arcmin','attribute.apparentSize','arcmin','higher_wins',3),
  ('physical_size_light_years','attribute.physicalSize','ly','higher_wins',4);

insert into public.card_attribute_values (card_id,attribute_id,value,is_approximate,source_url)
select id,'distance_light_years',distance_light_years,true,source_url from public.card_definitions where distance_light_years is not null
union all select id,'apparent_magnitude',apparent_magnitude,false,source_url from public.card_definitions where apparent_magnitude is not null
union all select id,'apparent_size_arcmin',apparent_size_arcmin,true,source_url from public.card_definitions where apparent_size_arcmin is not null
union all select id,'physical_size_light_years',physical_size_light_years,true,source_url from public.card_definitions where physical_size_light_years is not null;

alter table public.card_definitions alter column distance_light_years drop not null;
alter table public.card_definitions alter column apparent_magnitude drop not null;
alter table public.card_definitions alter column apparent_size_arcmin drop not null;
alter table public.card_definitions alter column physical_size_light_years drop not null;

alter table public.attribute_definitions enable row level security;
alter table public.card_attribute_values enable row level security;
revoke all on public.attribute_definitions,public.card_attribute_values from anon,authenticated;
grant select on public.attribute_definitions,public.card_attribute_values to authenticated;
create policy "authenticated can read enabled attributes" on public.attribute_definitions for select to authenticated using (enabled);
create policy "authenticated can read card values" on public.card_attribute_values for select to authenticated using (true);

create or replace function public.available_game_attributes(target_game_id uuid)
returns table (id text,label_key text,unit text,comparison public.attribute_comparison,display_order smallint)
language sql stable security definer set search_path='' as $$
  select ad.id,ad.label_key,ad.unit,ad.comparison,ad.display_order
  from public.attribute_definitions ad
  where ad.enabled and not exists (
    select 1 from public.game_players gp
    where gp.game_id=target_game_id and not exists (
      select 1 from public.game_cards gc
      join public.card_attribute_values cav on cav.card_id=gc.card_id and cav.attribute_id=ad.id
      where gc.game_id=target_game_id and gc.player_id=gp.player_id and gc.played_round is null
    )
  ) order by ad.display_order;
$$;

create function public.game_card_payload(target_card_id text)
returns jsonb language sql stable security definer set search_path='' as $$
  select (to_jsonb(c)-'enabled'-'distance_light_years'-'apparent_magnitude'-'apparent_size_arcmin'-'physical_size_light_years') ||
    jsonb_build_object('attributes',coalesce((
      select jsonb_agg(jsonb_build_object('id',ad.id,'labelKey',ad.label_key,'unit',ad.unit,'comparison',ad.comparison,'value',cav.value,'isApproximate',coalesce(cav.is_approximate,false)) order by ad.display_order)
      from public.attribute_definitions ad left join public.card_attribute_values cav on cav.attribute_id=ad.id and cav.card_id=c.id
      where ad.enabled
    ),'[]'::jsonb))
  from public.card_definitions c where c.id=target_card_id;
$$;

create or replace function public.choose_round_attribute(target_game_id uuid,attribute_key text)
returns void language plpgsql security definer set search_path='' as $$
declare current_round public.game_rounds%rowtype;
begin
  select gr.* into current_round from public.game_rounds gr where gr.game_id=target_game_id order by gr.round_number desc limit 1 for update;
  if current_round.active_player_id<>auth.uid() then raise exception 'NOT_ACTIVE_PLAYER'; end if;
  if current_round.status<>'choosing_attribute' then raise exception 'ATTRIBUTE_ALREADY_CHOSEN'; end if;
  if not exists(select 1 from public.available_game_attributes(target_game_id) a where a.id=attribute_key) then raise exception 'ATTRIBUTE_NOT_AVAILABLE'; end if;
  update public.game_rounds set selected_attribute=attribute_key,status='choosing_cards' where game_id=target_game_id and round_number=current_round.round_number;
end; $$;

alter table public.game_rounds drop constraint if exists game_rounds_selected_attribute_check;
alter table public.game_rounds add constraint game_rounds_selected_attribute_fkey foreign key (selected_attribute) references public.attribute_definitions(id);

create or replace function public.choose_round_card(target_game_id uuid,selected_card_id text)
returns void language plpgsql security definer set search_path='' as $$
declare r public.game_rounds%rowtype; selection_count integer; first_sel public.round_selections%rowtype; second_sel public.round_selections%rowtype;
declare first_value numeric; second_value numeric; direction public.attribute_comparison; round_winner uuid; rounds_to_play integer;
begin
  select gr.* into r from public.game_rounds gr where gr.game_id=target_game_id order by gr.round_number desc limit 1 for update;
  if r.status<>'choosing_cards' then raise exception 'CARDS_NOT_EXPECTED'; end if;
  if not exists(select 1 from public.game_cards gc join public.card_attribute_values cav on cav.card_id=gc.card_id and cav.attribute_id=r.selected_attribute where gc.game_id=target_game_id and gc.card_id=selected_card_id and gc.player_id=auth.uid() and gc.played_round is null) then raise exception 'CARD_NOT_AVAILABLE_FOR_ATTRIBUTE'; end if;
  insert into public.round_selections(game_id,round_number,player_id,card_id) values(target_game_id,r.round_number,auth.uid(),selected_card_id)
    on conflict(game_id,round_number,player_id) do update set card_id=excluded.card_id,selected_at=now();
  select count(*) into selection_count from public.round_selections rs where rs.game_id=target_game_id and rs.round_number=r.round_number;
  if selection_count<2 then return; end if;
  select rs.* into first_sel from public.round_selections rs join public.game_players gp on gp.game_id=rs.game_id and gp.player_id=rs.player_id where rs.game_id=target_game_id and rs.round_number=r.round_number and gp.seat=1;
  select rs.* into second_sel from public.round_selections rs join public.game_players gp on gp.game_id=rs.game_id and gp.player_id=rs.player_id where rs.game_id=target_game_id and rs.round_number=r.round_number and gp.seat=2;
  select cav.value into first_value from public.card_attribute_values cav where cav.card_id=first_sel.card_id and cav.attribute_id=r.selected_attribute;
  select cav.value into second_value from public.card_attribute_values cav where cav.card_id=second_sel.card_id and cav.attribute_id=r.selected_attribute;
  select ad.comparison into direction from public.attribute_definitions ad where ad.id=r.selected_attribute;
  if first_value<>second_value then
    round_winner:=case when (direction='lower_wins' and first_value<second_value) or (direction='higher_wins' and first_value>second_value) then first_sel.player_id else second_sel.player_id end;
    update public.game_players set score=score+1 where game_id=target_game_id and player_id=round_winner;
  end if;
  update public.game_cards gc set played_round=r.round_number from public.round_selections rs where rs.game_id=target_game_id and rs.round_number=r.round_number and gc.game_id=rs.game_id and gc.card_id=rs.card_id;
  update public.game_rounds set status='resolved',winner_id=round_winner,is_tie=(round_winner is null),resolved_at=now() where game_id=target_game_id and round_number=r.round_number;
  select (g.rules->>'roundsToPlay')::integer into rounds_to_play from public.games g where g.id=target_game_id;
  if r.round_number>=rounds_to_play then update public.games set status='finished',updated_at=now() where id=target_game_id; end if;
end; $$;

create or replace function public.get_game_state(requested_code text)
returns jsonb language plpgsql stable security definer set search_path='' as $$
declare target_game public.games%rowtype; current_round public.game_rounds%rowtype; result jsonb;
begin
  select g.* into target_game from public.games g where g.room_code=upper(trim(requested_code));
  if target_game.id is null or not public.is_game_member(target_game.id) then raise exception 'ROOM_NOT_FOUND'; end if;
  select gr.* into current_round from public.game_rounds gr where gr.game_id=target_game.id order by gr.round_number desc limit 1;
  select jsonb_build_object(
    'id',target_game.id,'code',target_game.room_code,'status',target_game.status,'rules',target_game.rules,
    'players',(select jsonb_agg(jsonb_build_object('id',p.id,'displayName',p.display_name,'seat',gp.seat,'score',gp.score) order by gp.seat) from public.game_players gp join public.players p on p.id=gp.player_id where gp.game_id=target_game.id),
    'availableAttributes',(select coalesce(jsonb_agg(to_jsonb(a) order by a.display_order),'[]'::jsonb) from public.available_game_attributes(target_game.id) a),
    'hand',(select coalesce(jsonb_agg(public.game_card_payload(gc.card_id) order by gc.hand_position),'[]'::jsonb) from public.game_cards gc where gc.game_id=target_game.id and gc.player_id=auth.uid() and gc.played_round is null),
    'round',jsonb_build_object('number',current_round.round_number,'activePlayerId',current_round.active_player_id,'status',current_round.status,'attribute',current_round.selected_attribute,'winnerId',current_round.winner_id,'isTie',current_round.is_tie,
      'selectedPlayerIds',(select coalesce(jsonb_agg(rs.player_id),'[]'::jsonb) from public.round_selections rs where rs.game_id=target_game.id and rs.round_number=current_round.round_number),
      'revealedCards',case when current_round.status='resolved' then (select coalesce(jsonb_agg(jsonb_build_object('playerId',rs.player_id,'card',public.game_card_payload(rs.card_id))),'[]'::jsonb) from public.round_selections rs where rs.game_id=target_game.id and rs.round_number=current_round.round_number) else '[]'::jsonb end)
  ) into result;
  return result;
end; $$;

revoke execute on function public.available_game_attributes(uuid),public.game_card_payload(text) from public,anon;
grant execute on function public.available_game_attributes(uuid) to authenticated;
