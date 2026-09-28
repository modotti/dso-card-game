create table public.admin_users (
  user_id uuid primary key references auth.users(id) on delete cascade,
  label text,
  created_at timestamptz not null default now()
);

alter table public.admin_users enable row level security;
revoke all on public.admin_users from anon, authenticated;

create or replace function public.is_backoffice_admin()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.admin_users where user_id = auth.uid()
  );
$$;

revoke all on function public.is_backoffice_admin() from public, anon;
grant execute on function public.is_backoffice_admin() to authenticated;

alter table public.photo_submissions
  add column original_filename text,
  add column mime_type text,
  add column file_size integer check (file_size is null or file_size > 0),
  add column image_width integer check (image_width is null or image_width > 0),
  add column image_height integer check (image_height is null or image_height > 0),
  add column reviewed_at timestamptz,
  add column reviewed_by uuid references auth.users(id) on delete set null,
  add column review_notes text check (review_notes is null or char_length(review_notes) <= 500);

create index photo_submissions_review_queue_idx
  on public.photo_submissions (status, created_at desc);

create policy "Backoffice admins can read photo submissions"
on public.photo_submissions
for select
to authenticated
using ((select public.is_backoffice_admin()));

grant select on public.photo_submissions to authenticated;

create or replace function public.review_photo_submission(
  target_submission_id uuid,
  target_status text,
  notes text default null
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not public.is_backoffice_admin() then
    raise exception 'ADMIN_REQUIRED';
  end if;
  if target_status not in ('pending', 'approved', 'rejected') then
    raise exception 'INVALID_REVIEW_STATUS';
  end if;
  if char_length(notes) > 500 then
    raise exception 'REVIEW_NOTES_TOO_LONG';
  end if;

  update public.photo_submissions
  set status = target_status,
      review_notes = nullif(trim(notes), ''),
      reviewed_at = case when target_status = 'pending' then null else now() end,
      reviewed_by = case when target_status = 'pending' then null else auth.uid() end
  where id = target_submission_id;

  if not found then
    raise exception 'SUBMISSION_NOT_FOUND';
  end if;
end;
$$;

revoke all on function public.review_photo_submission(uuid, text, text) from public, anon;
grant execute on function public.review_photo_submission(uuid, text, text) to authenticated;

create policy "Backoffice admins can read submitted photos"
on storage.objects
for select
to authenticated
using (
  bucket_id = 'photo-submissions'
  and (select public.is_backoffice_admin())
);

-- Bootstrap the first administrator after signing in once:
-- insert into public.admin_users (user_id, label)
-- values ('YOUR_AUTH_USER_UUID', 'Fernando');
