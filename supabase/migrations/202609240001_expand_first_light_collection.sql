insert into public.card_definitions
  (id, kind, catalog_name, common_name, object_type, constellation,
   distance_light_years, apparent_magnitude, apparent_size_arcmin,
   physical_size_light_years, source_url, enabled)
values
  ('m31','astronomical','M31','Andromeda Galaxy','spiral_galaxy','Andromeda',2500000,3.44,190,152000,'https://science.nasa.gov/mission/hubble/science/explore-the-night-sky/hubble-messier-catalog/messier-31/',true),
  ('sfo82','astronomical','SFO 82','Dark Tower','cometary_globule','Scorpius',5000,10,30,40,'https://www.eso.org/public/images/potw2411a/',true)
on conflict (id) do update set
  kind=excluded.kind, catalog_name=excluded.catalog_name, common_name=excluded.common_name,
  object_type=excluded.object_type, constellation=excluded.constellation,
  distance_light_years=excluded.distance_light_years,
  apparent_magnitude=excluded.apparent_magnitude,
  apparent_size_arcmin=excluded.apparent_size_arcmin,
  physical_size_light_years=excluded.physical_size_light_years,
  source_url=excluded.source_url, enabled=true;

delete from public.card_attribute_values
where card_id in ('m31','sfo82');

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
where c.id in ('m31','sfo82');

insert into public.card_images
  (id, card_id, collection_name, asset_path, photographer_name, photographer_handle)
values
  ('first-light-m31','m31','First Light Collection','/assets/cards/m31.jpg','Tiago Rocha','@astro_scient'),
  ('first-light-sfo82','sfo82','First Light Collection','/assets/cards/sfo82.jpg','Fernando Modotti','@luimodotti')
on conflict (id) do update set
  card_id=excluded.card_id, collection_name=excluded.collection_name,
  asset_path=excluded.asset_path, photographer_name=excluded.photographer_name,
  photographer_handle=excluded.photographer_handle, enabled=true;
