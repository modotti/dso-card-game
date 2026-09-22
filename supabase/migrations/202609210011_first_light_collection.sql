create table public.card_images (
  id text primary key,
  card_id text not null references public.card_definitions(id) on delete cascade,
  collection_name text not null,
  asset_path text not null,
  photographer_name text not null,
  photographer_handle text,
  enabled boolean not null default true,
  unique (card_id, asset_path)
);

alter table public.card_images enable row level security;
revoke all on public.card_images from anon, authenticated;
grant select on public.card_images to authenticated;
create policy "authenticated can read enabled card images"
  on public.card_images for select to authenticated using (enabled);

alter table public.game_cards
  add column image_id text references public.card_images(id);

-- Only First Light targets enter newly created games. Existing games keep their dealt cards.
update public.card_definitions set enabled = false where kind = 'astronomical';

insert into public.card_definitions
  (id, kind, catalog_name, common_name, object_type, constellation,
   distance_light_years, apparent_magnitude, apparent_size_arcmin,
   physical_size_light_years, source_url, enabled)
values
  ('m16','astronomical','M16','Eagle Nebula','emission_nebula','Serpens',7000,6,70,70,'https://science.nasa.gov/mission/hubble/science/explore-the-night-sky/hubble-messier-catalog/messier-16/',true),
  ('sl17','astronomical','SL 17','Dark Wolf Nebula','dark_nebula','Scorpius',5300,10,42,65,'https://www.eso.org/public/images/eso2416a/',true),
  ('ngc5139','astronomical','NGC 5139','Omega Centauri','globular_cluster','Centaurus',17000,3.7,36.3,450,'https://science.nasa.gov/mission/hubble/science/explore-the-night-sky/hubble-caldwell-catalog/caldwell-80/',true),
  ('ngc6334','astronomical','NGC 6334','Cat''s Paw Nebula','emission_nebula','Scorpius',4000,7.2,35,40,'https://science.nasa.gov/missions/webb/nasas-webb-scratches-beyond-surface-of-cats-paw-for-3rd-anniversary/',true),
  ('m7','astronomical','M7','Ptolemy''s Cluster','open_cluster','Scorpius',980,3.3,80,23,'https://science.nasa.gov/mission/hubble/science/explore-the-night-sky/hubble-messier-catalog/messier-7/',true),
  ('m6','astronomical','M6','Butterfly Cluster','open_cluster','Scorpius',1600,4.2,25,12,'https://science.nasa.gov/mission/hubble/science/explore-the-night-sky/hubble-messier-catalog/messier-6/',true),
  ('m11','astronomical','M11','Wild Duck Cluster','open_cluster','Scutum',6120,5.8,14,25,'https://science.nasa.gov/mission/hubble/science/explore-the-night-sky/hubble-messier-catalog/messier-11/',true),
  ('sh2-308','astronomical','Sh 2-308','Dolphin Head Nebula','emission_nebula','Canis Major',5200,12,40,60,'https://science.nasa.gov/missions/hubble/hubbles-cosmic-bubbles/',true),
  ('ngc5128','astronomical','NGC 5128','Centaurus A','elliptical_galaxy','Centaurus',11000000,6.7,18.2,60000,'https://science.nasa.gov/mission/hubble/science/explore-the-night-sky/hubble-caldwell-catalog/caldwell-77/',true),
  ('ngc3324','astronomical','NGC 3324','Gabriela Mistral Nebula','emission_nebula','Carina',7500,6.7,16,35,'https://science.nasa.gov/image-article/apod-2018-april-6-ngc-3324-in-carina/',true),
  ('ic2944','astronomical','IC 2944','Running Chicken Nebula','emission_nebula','Centaurus',6000,2.9,53,92,'https://science.nasa.gov/photojournal/chasing-chickens-in-the-lambda-centauri-nebula/',true),
  ('ngc2736','astronomical','NGC 2736','Pencil Nebula','supernova_remnant','Vela',815,12,30,7,'https://science.nasa.gov/asset/hubble/the-pencil-nebula-remnants-of-an-exploded-star-ngc-2736/',true),
  ('m33','astronomical','M33','Triangulum Galaxy','spiral_galaxy','Triangulum',2730000,5.72,70.8,56000,'https://science.nasa.gov/mission/hubble/science/explore-the-night-sky/hubble-messier-catalog/messier-33/',true),
  ('ngc7000','astronomical','NGC 7000','North America Nebula','emission_nebula','Cygnus',2590,4,120,90,'https://science.nasa.gov/universe/exoplanets-or-stars-from-afar/north-america-nebula-ngc-7000/',true),
  ('ngc6188','astronomical','NGC 6188','Fighting Dragons of Ara','emission_nebula','Ara',4000,5,20,23,'https://www.eso.org/public/images/ngc6188-3-6-m/',true),
  ('cg4','astronomical','CG 4','God''s Hand','cometary_globule','Puppis',1300,10,21,8,'https://www.eso.org/public/news/eso1503/',true),
  ('ic4592','astronomical','IC 4592','Blue Horsehead Nebula','reflection_nebula','Scorpius',420,3.9,300,40,'https://science.nasa.gov/image-article/apod-2009-may-21-ic-4592-a-blue-horsehead/',true),
  ('ngc6357','astronomical','NGC 6357','Lobster Nebula','emission_nebula','Scorpius',6500,10.8,30,50,'https://science.nasa.gov/image-article/apod-2016-february-5-massive-stars-in-ngc-6357/',true),
  ('ngc246','astronomical','NGC 246','Skull Nebula','planetary_nebula','Cetus',1600,8,3.8,1.8,'https://science.nasa.gov/mission/hubble/science/explore-the-night-sky/hubble-caldwell-catalog/caldwell-56/',true),
  ('ngc253','astronomical','NGC 253','Sculptor Galaxy','spiral_galaxy','Sculptor',11400000,7.1,27.5,90000,'https://science.nasa.gov/missions/webb/nasas-webb-delivers-unprecedented-look-into-heart-of-sculptor-galaxy/',true)
on conflict (id) do update set
  kind=excluded.kind, catalog_name=excluded.catalog_name, common_name=excluded.common_name,
  object_type=excluded.object_type, constellation=excluded.constellation,
  distance_light_years=excluded.distance_light_years,
  apparent_magnitude=excluded.apparent_magnitude,
  apparent_size_arcmin=excluded.apparent_size_arcmin,
  physical_size_light_years=excluded.physical_size_light_years,
  source_url=excluded.source_url, enabled=true;

delete from public.card_attribute_values
where card_id in ('m16','sl17','ngc5139','ngc6334','m7','m6','m11','sh2-308','ngc5128','ngc3324','ic2944','ngc2736','m33','ngc7000','ngc6188','cg4','ic4592','ngc6357','ngc246','ngc253');

insert into public.card_attribute_values (card_id, attribute_id, value, is_approximate, source_url)
select c.id, values_to_add.attribute_id, values_to_add.value, values_to_add.is_approximate, c.source_url
from public.card_definitions c
cross join lateral (values
  ('distance_light_years', c.distance_light_years, true),
  ('apparent_magnitude', c.apparent_magnitude, true),
  ('apparent_size_arcmin', c.apparent_size_arcmin, true),
  ('physical_size_light_years', c.physical_size_light_years, true)
) values_to_add(attribute_id, value, is_approximate)
where c.enabled and c.kind = 'astronomical' and values_to_add.value is not null;

insert into public.card_images
  (id, card_id, collection_name, asset_path, photographer_name, photographer_handle)
values
  ('first-light-m16','m16','First Light Collection','/assets/cards/m16.jpg','Fernando Modotti','@luimodotti'),
  ('first-light-sl17','sl17','First Light Collection','/assets/cards/sl17.jpg','Fernando Modotti','@luimodotti'),
  ('first-light-ngc5139','ngc5139','First Light Collection','/assets/cards/ngc5139.jpg','Fernando Modotti','@luimodotti'),
  ('first-light-ngc6334','ngc6334','First Light Collection','/assets/cards/ngc6334.jpg','Fernando Modotti','@luimodotti'),
  ('first-light-m7','m7','First Light Collection','/assets/cards/m7.jpg','Fernando Modotti','@luimodotti'),
  ('first-light-m6','m6','First Light Collection','/assets/cards/m6.jpg','Fernando Modotti','@luimodotti'),
  ('first-light-m11','m11','First Light Collection','/assets/cards/m11.jpg','Fernando Modotti','@luimodotti'),
  ('first-light-sh2-308','sh2-308','First Light Collection','/assets/cards/sh2-308.jpg','Erly Alexandrino da Silva Neto','@erlyneto'),
  ('first-light-ngc5128','ngc5128','First Light Collection','/assets/cards/ngc5128.jpg','Erly Alexandrino da Silva Neto','@erlyneto'),
  ('first-light-ngc3324','ngc3324','First Light Collection','/assets/cards/ngc3324.jpg','Erly Alexandrino da Silva Neto','@erlyneto'),
  ('first-light-ic2944','ic2944','First Light Collection','/assets/cards/ic2944.jpg','Erly Alexandrino da Silva Neto','@erlyneto'),
  ('first-light-ngc2736','ngc2736','First Light Collection','/assets/cards/ngc2736.jpg','Tiago Rocha','@astro_scient'),
  ('first-light-m33','m33','First Light Collection','/assets/cards/m33.jpg','Tiago Rocha','@astro_scient'),
  ('first-light-ngc7000','ngc7000','First Light Collection','/assets/cards/ngc7000.jpg','Tiago Rocha','@astro_scient'),
  ('first-light-ngc6188','ngc6188','First Light Collection','/assets/cards/ngc6188.jpg','Tiago Rocha','@astro_scient'),
  ('first-light-cg4','cg4','First Light Collection','/assets/cards/cg4.jpg','Dilan Rosa','@dilannn.e'),
  ('first-light-ic4592','ic4592','First Light Collection','/assets/cards/ic4592.jpg','Dilan Rosa','@dilannn.e'),
  ('first-light-ngc6357','ngc6357','First Light Collection','/assets/cards/ngc6357.jpg','Thiago Gonçalves','@astro_bah'),
  ('first-light-ngc246','ngc246','First Light Collection','/assets/cards/ngc246.jpg','Thiago Gonçalves','@astro_bah'),
  ('first-light-ngc253','ngc253','First Light Collection','/assets/cards/ngc253.jpg','Thiago Gonçalves','@astro_bah')
on conflict (id) do update set
  card_id=excluded.card_id, collection_name=excluded.collection_name,
  asset_path=excluded.asset_path, photographer_name=excluded.photographer_name,
  photographer_handle=excluded.photographer_handle, enabled=true;

create or replace function public.start_game(target_game_id uuid)
returns void language plpgsql security definer set search_path = '' as $$
declare hand_size integer; first_player uuid; second_player uuid;
begin
  select (g.rules->>'handSize')::integer into hand_size from public.games g where g.id = target_game_id for update;
  if (select count(*) from public.game_players gp where gp.game_id = target_game_id) <> 2 then raise exception 'PLAYERS_NOT_READY'; end if;
  if (select count(*) from public.card_definitions c where c.enabled and c.kind='astronomical' and exists(select 1 from public.card_images ci where ci.card_id=c.id and ci.enabled)) < hand_size*2 then raise exception 'INSUFFICIENT_CARDS'; end if;
  if exists (select 1 from public.game_cards gc where gc.game_id = target_game_id) then return; end if;
  select gp.player_id into first_player from public.game_players gp where gp.game_id=target_game_id and gp.seat=1;
  select gp.player_id into second_player from public.game_players gp where gp.game_id=target_game_id and gp.seat=2;
  insert into public.game_cards (game_id,card_id,player_id,hand_position,image_id)
  select target_game_id,picked.id,
    case when picked.position<=hand_size then first_player else second_player end,
    case when picked.position<=hand_size then picked.position else picked.position-hand_size end,
    (select ci.id from public.card_images ci where ci.card_id=picked.id and ci.enabled order by random() limit 1)
  from (
    select chosen.id,row_number() over(order by chosen.random_order)::smallint position
    from (
      select c.id,random() random_order
      from public.card_definitions c
      where c.enabled and c.kind='astronomical'
        and exists(select 1 from public.card_images ci where ci.card_id=c.id and ci.enabled)
      order by random_order
      limit (hand_size*2)
    ) chosen
  ) picked;
  insert into public.game_cards (game_id,card_id,player_id,hand_position)
  values (target_game_id,'clouds-seat-1',first_player,hand_size+1),
         (target_game_id,'clouds-seat-2',second_player,hand_size+1);
  insert into public.game_rounds (game_id,round_number,active_player_id) values (target_game_id,1,first_player);
  update public.games set status='in_progress',updated_at=now() where id=target_game_id;
end; $$;

create function public.game_card_payload_with_image(target_card_id text, target_image_id text)
returns jsonb language sql stable security definer set search_path='' as $$
  select (to_jsonb(c)-'enabled'-'distance_light_years'-'apparent_magnitude'-'apparent_size_arcmin'-'physical_size_light_years') ||
    jsonb_build_object(
      'image',(select jsonb_build_object('id',ci.id,'src',ci.asset_path,'collectionName',ci.collection_name,'photographerName',ci.photographer_name,'photographerHandle',ci.photographer_handle) from public.card_images ci where ci.id=target_image_id),
      'attributes',coalesce((
        select jsonb_agg(jsonb_build_object('id',ad.id,'labelKey',ad.label_key,'unit',ad.unit,'comparison',ad.comparison,'value',cav.value,'isApproximate',coalesce(cav.is_approximate,false)) order by ad.display_order)
        from public.attribute_definitions ad left join public.card_attribute_values cav on cav.attribute_id=ad.id and cav.card_id=c.id
        where ad.enabled
      ),'[]'::jsonb)
    )
  from public.card_definitions c where c.id=target_card_id;
$$;

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
    'hand',(select coalesce(jsonb_agg(public.game_card_payload_with_image(gc.card_id,gc.image_id) order by gc.hand_position),'[]'::jsonb) from public.game_cards gc where gc.game_id=target_game.id and gc.player_id=auth.uid() and gc.played_round is null),
    'round',jsonb_build_object('number',current_round.round_number,'activePlayerId',current_round.active_player_id,'status',current_round.status,'attribute',current_round.selected_attribute,'winnerId',current_round.winner_id,'isTie',current_round.is_tie,'isCancelled',current_round.is_cancelled,'actionDeadline',current_round.action_deadline,
      'selectedPlayerIds',(select coalesce(jsonb_agg(rs.player_id),'[]'::jsonb) from public.round_selections rs where rs.game_id=target_game.id and rs.round_number=current_round.round_number),
      'revealedCards',case when current_round.status='resolved' then (select coalesce(jsonb_agg(jsonb_build_object('playerId',rs.player_id,'card',public.game_card_payload_with_image(rs.card_id,gc.image_id))),'[]'::jsonb) from public.round_selections rs join public.game_cards gc on gc.game_id=rs.game_id and gc.card_id=rs.card_id where rs.game_id=target_game.id and rs.round_number=current_round.round_number) else '[]'::jsonb end)) into result;
  return result;
end; $$;

revoke execute on function public.game_card_payload_with_image(text,text) from public,anon,authenticated;
