create table public.photo_submissions (
  id uuid primary key,
  submitter_id uuid not null references auth.users(id) on delete cascade,
  photographer_name text not null check (char_length(trim(photographer_name)) between 1 and 100),
  instagram text check (instagram is null or instagram ~ '^@[A-Za-z0-9._]{1,30}$'),
  target_name text not null check (char_length(trim(target_name)) between 1 and 120),
  target_type text not null check (target_type in (
    'emission_nebula',
    'reflection_nebula',
    'dark_nebula',
    'planetary_nebula',
    'galaxy',
    'open_cluster',
    'globular_cluster',
    'other'
  )),
  storage_path text not null unique,
  status text not null default 'pending' check (status in ('pending','approved','rejected')),
  terms_version text not null check (terms_version = '2026-09-25-v1'),
  created_at timestamptz not null default now()
);

alter table public.photo_submissions enable row level security;
revoke all on public.photo_submissions from anon,authenticated;

insert into storage.buckets (id,name,public,file_size_limit,allowed_mime_types)
values ('photo-submissions','photo-submissions',false,5242880,array['image/jpeg','image/webp'])
on conflict (id) do update set
  public=false,
  file_size_limit=excluded.file_size_limit,
  allowed_mime_types=excluded.allowed_mime_types;

-- Uploads are performed only by the submit-photo Edge Function with the
-- service role. No anon/authenticated select policy is intentionally created.
-- Review tooling can later use a service-role backend or narrowly scoped
-- administrator policies without making submitted images public.
