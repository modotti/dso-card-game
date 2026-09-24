update public.card_images
set collection_name = 'Space Agencies Collection'
where collection_name = 'ESO Collection';

insert into public.card_definitions
  (id, kind, catalog_name, common_name, object_type, constellation,
   distance_light_years, apparent_magnitude, apparent_size_arcmin,
   physical_size_light_years, source_url, enabled)
values
  ('ngc7293','astronomical','NGC 7293','Helix Nebula','planetary_nebula','Aquarius',655,7.6,25,2.9,'https://science.nasa.gov/universe/exoplanets-or-stars-from-afar/the-helix-nebula-unraveling-at-the-seams/',true),
  ('ngc104','astronomical','NGC 104','47 Tucanae','globular_cluster','Tucana',15000,4.09,43.8,190,'https://www.eso.org/public/images/eso1302a/',true),
  ('ngc4755','astronomical','NGC 4755','Jewel Box Cluster','open_cluster','Crux',6500,4.2,7.8,15,'https://www.eso.org/public/images/eso0940a/',true),
  ('m2','astronomical','M2','Messier 2','globular_cluster','Aquarius',37000,6.3,8.4,175,'https://science.nasa.gov/mission/hubble/science/explore-the-night-sky/hubble-messier-catalog/messier-2/',true),
  ('m92','astronomical','M92','Messier 92','globular_cluster','Hercules',27000,6.3,14,110,'https://science.nasa.gov/mission/hubble/science/explore-the-night-sky/hubble-messier-catalog/messier-92/',true),
  ('ngc7006','astronomical','NGC 7006','Caldwell 42','globular_cluster','Delphinus',135000,10.5,3.6,140,'https://science.nasa.gov/mission/hubble/science/explore-the-night-sky/hubble-caldwell-catalog/caldwell-42/',true),
  ('m78','astronomical','M78','Messier 78','reflection_nebula','Orion',1400,8,8,4,'https://www.eso.org/public/images/eso1105a/',true)
on conflict (id) do update set
  kind=excluded.kind, catalog_name=excluded.catalog_name, common_name=excluded.common_name,
  object_type=excluded.object_type, constellation=excluded.constellation,
  distance_light_years=excluded.distance_light_years,
  apparent_magnitude=excluded.apparent_magnitude,
  apparent_size_arcmin=excluded.apparent_size_arcmin,
  physical_size_light_years=excluded.physical_size_light_years,
  source_url=excluded.source_url, enabled=true;

delete from public.card_attribute_values
where card_id in ('ngc7293','ngc104','ngc4755','m2','m92','ngc7006','m78');

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
where c.id in ('ngc7293','ngc104','ngc4755','m2','m92','ngc7006','m78');

insert into public.card_images
  (id, card_id, collection_name, asset_path, photographer_name, photographer_handle)
values
  ('agency-ngc7293','ngc7293','Space Agencies Collection','/assets/cards/ngc7293.jpg','NASA, ESA, C.R. O''Dell (Vanderbilt University), and M. Meixner, P. McCullough, and G. Bacon',null),
  ('agency-ngc104','ngc104','Space Agencies Collection','/assets/cards/ngc104.jpg','ESO/M.-R. Cioni/VISTA Magellanic Cloud survey.',null),
  ('agency-ngc4755','ngc4755','Space Agencies Collection','/assets/cards/ngc4755.jpg','ESO/Y. Beletsky',null),
  ('agency-m2','m2','Space Agencies Collection','/assets/cards/m2.jpg','ESA/Hubble & NASA, G. Piotto et al',null),
  ('agency-m92','m92','Space Agencies Collection','/assets/cards/m92.jpg','ESA/Hubble & NASA Acknowledgement: Gilles Chapdelaine',null),
  ('agency-ngc7006','ngc7006','Space Agencies Collection','/assets/cards/ngc7006.jpg','ESA/Hubble & NASA',null),
  ('agency-m78','m78','Space Agencies Collection','/assets/cards/m78.jpg','ESO/Igor Chekalin',null)
on conflict (id) do update set
  card_id=excluded.card_id, collection_name=excluded.collection_name,
  asset_path=excluded.asset_path, photographer_name=excluded.photographer_name,
  photographer_handle=excluded.photographer_handle, enabled=true;
