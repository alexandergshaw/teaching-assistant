-- Course materials: zip files attached to a course hub entry.
-- Bytes live in the private "course-files" storage bucket under a per-user,
-- per-course folder. Owner-scoped RLS; browser uploads directly to Storage.
-- Written idempotently.

alter table public.course_hub add column if not exists materials_zip_name text;
alter table public.course_hub add column if not exists materials_zip_path text;
alter table public.course_hub add column if not exists materials_zip_size bigint;

insert into storage.buckets (id, name, public)
  values ('course-files', 'course-files', false)
  on conflict (id) do nothing;

drop policy if exists "Users read own course-file objects" on storage.objects;
create policy "Users read own course-file objects"
  on storage.objects for select
  using (bucket_id = 'course-files' and (storage.foldername(name))[1] = auth.uid()::text);

drop policy if exists "Users insert own course-file objects" on storage.objects;
create policy "Users insert own course-file objects"
  on storage.objects for insert
  with check (bucket_id = 'course-files' and (storage.foldername(name))[1] = auth.uid()::text);

drop policy if exists "Users update own course-file objects" on storage.objects;
create policy "Users update own course-file objects"
  on storage.objects for update
  using (bucket_id = 'course-files' and (storage.foldername(name))[1] = auth.uid()::text)
  with check (bucket_id = 'course-files' and (storage.foldername(name))[1] = auth.uid()::text);

drop policy if exists "Users delete own course-file objects" on storage.objects;
create policy "Users delete own course-file objects"
  on storage.objects for delete
  using (bucket_id = 'course-files' and (storage.foldername(name))[1] = auth.uid()::text);
