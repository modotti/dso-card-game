insert into public.card_definitions
  (id, kind, catalog_name, common_name, object_type, constellation,
   distance_light_years, apparent_magnitude, apparent_size_arcmin,
   physical_size_light_years, source_url, enabled)
values
  ('m8','astronomical','M8','Lagoon Nebula','emission_nebula','Sagittarius',5200,6,90,110,'https://science.nasa.gov/mission/hubble/science/explore-the-night-sky/hubble-messier-catalog/messier-8/',true),
  ('m42','astronomical','M42','Orion Nebula','emission_nebula','Orion',1500,4,85,24,'https://science.nasa.gov/mission/hubble/science/explore-the-night-sky/hubble-messier-catalog/messier-42/',true),
  ('ngc3372','astronomical','NGC 3372','Carina Nebula','emission_nebula','Carina',7500,4.8,120,300,'https://science.nasa.gov/mission/hubble/science/explore-the-night-sky/hubble-caldwell-catalog/caldwell-92/',true)
on conflict (id) do update set
  kind=excluded.kind, catalog_name=excluded.catalog_name, common_name=excluded.common_name,
  object_type=excluded.object_type, constellation=excluded.constellation,
  distance_light_years=excluded.distance_light_years,
  apparent_magnitude=excluded.apparent_magnitude,
  apparent_size_arcmin=excluded.apparent_size_arcmin,
  physical_size_light_years=excluded.physical_size_light_years,
  source_url=excluded.source_url, enabled=true;

delete from public.card_attribute_values
where card_id in ('m8','m42','ngc3372');

insert into public.card_attribute_values
  (card_id, attribute_id, value, is_approximate, source_url)
select c.id, values_to_add.attribute_id, values_to_add.value, values_to_add.is_approximate, c.source_url
from public.card_definitions c
cross join lateral (values
  ('distance_light_years', c.distance_light_years, true),
  ('apparent_magnitude', c.apparent_magnitude, false),
  ('apparent_size_arcmin', c.apparent_size_arcmin, true),
  ('physical_size_light_years', c.physical_size_light_years, true)
) values_to_add(attribute_id, value, is_approximate)
where c.id in ('m8','m42','ngc3372');

insert into public.card_images
  (id, card_id, collection_name, asset_path, photographer_name, photographer_handle)
values
  ('first-light-m8','m8','First Light Collection','/assets/cards/m8.jpg','Fernando Modotti','@luimodotti'),
  ('first-light-m42','m42','First Light Collection','/assets/cards/m42.jpg','Fernando Modotti','@luimodotti'),
  ('first-light-ngc3372','ngc3372','First Light Collection','/assets/cards/ngc3372.jpg','Tiago Rocha','@astro_scient')
on conflict (id) do update set
  card_id=excluded.card_id, collection_name=excluded.collection_name,
  asset_path=excluded.asset_path, photographer_name=excluded.photographer_name,
  photographer_handle=excluded.photographer_handle, enabled=true;
