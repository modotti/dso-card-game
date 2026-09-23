insert into public.card_definitions
  (id, kind, catalog_name, common_name, object_type, constellation,
   distance_light_years, apparent_magnitude, apparent_size_arcmin,
   physical_size_light_years, source_url, enabled)
values
  ('m104','astronomical','M104','Sombrero Galaxy','spiral_galaxy','Virgo',28000000,8,8.51,69000,'https://science.nasa.gov/mission/hubble/science/explore-the-night-sky/hubble-messier-catalog/messier-104/',true),
  ('ngc1365','astronomical','NGC 1365','Great Barred Spiral Galaxy','spiral_galaxy','Fornax',60000000,9.63,7.56,200000,'https://www.eso.org/public/images/potw1037a/',true),
  ('ngc1055','astronomical','NGC 1055','Edge-on Galaxy','spiral_galaxy','Cetus',52000000,10.59,7.08,115000,'https://www.eso.org/public/images/eso1707a/',true),
  ('ngc1097','astronomical','NGC 1097','Barred Spiral Galaxy','spiral_galaxy','Fornax',45000000,9.48,10.6,140000,'https://www.eso.org/public/images/eso0128a/',true),
  ('ngc1232','astronomical','NGC 1232','Grand Design Spiral','spiral_galaxy','Eridanus',60000000,9.87,5.07,90000,'https://www.eso.org/public/images/eso9845d/',true),
  ('ngc1398','astronomical','NGC 1398','Ribbons and Pearls','spiral_galaxy','Fornax',65000000,9.7,7.2,135000,'https://www.eso.org/public/images/potw1801a/',true),
  ('ngc55','astronomical','NGC 55','String of Pearls Galaxy','irregular_galaxy','Sculptor',8000000,7.87,32.36,70000,'https://www.eso.org/public/images/ngc/',true),
  ('m83','astronomical','M83','Southern Pinwheel Galaxy','spiral_galaxy','Hydra',15000000,7.52,13.8,40000,'https://www.eso.org/public/images/eso0525b/',true)
on conflict (id) do update set
  kind=excluded.kind, catalog_name=excluded.catalog_name, common_name=excluded.common_name,
  object_type=excluded.object_type, constellation=excluded.constellation,
  distance_light_years=excluded.distance_light_years,
  apparent_magnitude=excluded.apparent_magnitude,
  apparent_size_arcmin=excluded.apparent_size_arcmin,
  physical_size_light_years=excluded.physical_size_light_years,
  source_url=excluded.source_url, enabled=true;

delete from public.card_attribute_values
where card_id in ('m104','ngc1365','ngc1055','ngc1097','ngc1232','ngc1398','ngc55','m83');

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
where c.id in ('m104','ngc1365','ngc1055','ngc1097','ngc1232','ngc1398','ngc55','m83');

insert into public.card_images
  (id, card_id, collection_name, asset_path, photographer_name, photographer_handle)
values
  ('eso-m104','m104','ESO Collection','/assets/cards/m104.jpg','ESO/IDA/Danish 1.5 m/R. Gendler and J.-E. Ovaldsen',null),
  ('eso-ngc1365','ngc1365','ESO Collection','/assets/cards/ngc1365.jpg','ESO/IDA/Danish 1.5 m/ R. Gendler, J-E. Ovaldsen, C. Thöne, and C. Feron.',null),
  ('eso-ngc1055','ngc1055','ESO Collection','/assets/cards/ngc1055.jpg','ESO',null),
  ('eso-ngc1097','ngc1097','ESO Collection','/assets/cards/ngc1097.jpg','ESO',null),
  ('eso-ngc1232','ngc1232','ESO Collection','/assets/cards/ngc1232.jpg','ESO',null),
  ('eso-ngc1398','ngc1398','ESO Collection','/assets/cards/ngc1398.jpg','ESO',null),
  ('eso-ngc55','ngc55','ESO Collection','/assets/cards/ngc55.jpg','ESO',null),
  ('eso-m83','m83','ESO Collection','/assets/cards/m83.jpg','ESO',null)
on conflict (id) do update set
  card_id=excluded.card_id, collection_name=excluded.collection_name,
  asset_path=excluded.asset_path, photographer_name=excluded.photographer_name,
  photographer_handle=excluded.photographer_handle, enabled=true;
