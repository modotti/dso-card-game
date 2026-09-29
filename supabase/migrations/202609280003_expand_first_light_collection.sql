insert into public.card_definitions
  (id, kind, catalog_name, common_name, object_type, constellation,
   distance_light_years, apparent_magnitude, apparent_size_arcmin,
   physical_size_light_years, source_url, enabled)
values
  ('ic4628','astronomical','IC 4628','Prawn Nebula','emission_nebula','Scorpius',6000,7.3,90,250,'https://science.nasa.gov/missions/hubble/hubble-catches-celestial-prawn-drifting-through-the-cosmic-deep/',true),
  ('sh2-9','astronomical','Sh 2-9','Sh 2-9 Nebula','emission_nebula','Scorpius',590,10,60,10,'https://simbad.cds.unistra.fr/simbad/sim-id?Ident=Sh2-9',true),
  ('c14','astronomical','C14','Double Cluster','open_cluster','Perseus',7500,5.3,60,130,'https://science.nasa.gov/mission/hubble/science/explore-the-night-sky/hubble-caldwell-catalog/caldwell-14/',true),
  ('ic1396','astronomical','IC 1396','Elephant''s Trunk Nebula','emission_nebula','Cepheus',2450,3.5,170,100,'https://science.nasa.gov/photojournal/dark-globule-in-ic-1396-irac/',true),
  ('ldn1235','astronomical','LDN 1235','Dark Shark Nebula','dark_nebula','Cepheus',650,10,160,30,'https://simbad.cds.unistra.fr/simbad/sim-id?Ident=LDN+1235',true),
  ('m13','astronomical','M13','Hercules Globular Cluster','globular_cluster','Hercules',25000,5.8,16.6,145,'https://science.nasa.gov/mission/hubble/science/explore-the-night-sky/hubble-messier-catalog/messier-13/',true),
  ('m45','astronomical','M45','Pleiades','open_cluster','Taurus',445,1.6,110,17,'https://science.nasa.gov/mission/hubble/science/explore-the-night-sky/hubble-messier-catalog/messier-45/',true),
  ('sh2-115','astronomical','Sh 2-115','Sh 2-115 Nebula','emission_nebula','Cygnus',7500,10,60,130,'https://simbad.cds.unistra.fr/simbad/sim-id?Ident=Sh2-115',true)
on conflict (id) do update set
  kind=excluded.kind, catalog_name=excluded.catalog_name, common_name=excluded.common_name,
  object_type=excluded.object_type, constellation=excluded.constellation,
  distance_light_years=excluded.distance_light_years,
  apparent_magnitude=excluded.apparent_magnitude,
  apparent_size_arcmin=excluded.apparent_size_arcmin,
  physical_size_light_years=excluded.physical_size_light_years,
  source_url=excluded.source_url, enabled=true;

delete from public.card_attribute_values
where card_id in ('ic4628','sh2-9','c14','ic1396','ldn1235','m13','m45','sh2-115');

insert into public.card_attribute_values
  (card_id, attribute_id, value, is_approximate, source_url)
select c.id, values_to_add.attribute_id, values_to_add.value, values_to_add.is_approximate, c.source_url
from public.card_definitions c
cross join lateral (values
  ('distance_light_years', c.distance_light_years, true),
  ('apparent_magnitude', c.apparent_magnitude, true),
  ('apparent_size_arcmin', c.apparent_size_arcmin, true),
  ('physical_size_light_years', c.physical_size_light_years, true)
) values_to_add(attribute_id, value, is_approximate)
where c.id in ('ic4628','sh2-9','c14','ic1396','ldn1235','m13','m45','sh2-115');

update public.card_images
set
  enabled = false,
  asset_path = case id
    when 'eso-m104' then '/assets/cards/m104-agency-retired.jpg'
    when 'agency-ngc104' then '/assets/cards/ngc104-agency-retired.jpg'
  end
where id in ('eso-m104', 'agency-ngc104');

insert into public.card_images
  (id, card_id, collection_name, asset_path, photographer_name, photographer_handle)
values
  ('first-light-ic4628','ic4628','First Light Collection','/assets/cards/ic4628.jpg','Felipe Temponi','@infusao.galactica'),
  ('first-light-ngc104','ngc104','First Light Collection','/assets/cards/ngc104.jpg','André Irgang','@irganga'),
  ('first-light-sh2-9','sh2-9','First Light Collection','/assets/cards/sh2-9.jpg','Fernando Modotti','@luimodotti'),
  ('first-light-m104','m104','First Light Collection','/assets/cards/m104.jpg','Rangel Meissner','@rangel_m_astrofotografia'),
  ('first-light-c14','c14','First Light Collection','/assets/cards/c14.jpg','Gabriel Zaccaria','@imaginastrum'),
  ('first-light-ic1396','ic1396','First Light Collection','/assets/cards/ic1396.jpg','Gabriel Zaccaria','@imaginastrum'),
  ('first-light-ldn1235','ldn1235','First Light Collection','/assets/cards/ldn1235.jpg','Gabriel Zaccaria','@imaginastrum'),
  ('first-light-m13','m13','First Light Collection','/assets/cards/m13.jpg','Gabriel Zaccaria','@imaginastrum'),
  ('first-light-m45','m45','First Light Collection','/assets/cards/m45.jpg','Gabriel Zaccaria','@imaginastrum'),
  ('first-light-sh2-115','sh2-115','First Light Collection','/assets/cards/sh2-115.jpg','Gabriel Zaccaria','@imaginastrum')
on conflict (id) do update set
  card_id=excluded.card_id, collection_name=excluded.collection_name,
  asset_path=excluded.asset_path, photographer_name=excluded.photographer_name,
  photographer_handle=excluded.photographer_handle, enabled=true;
