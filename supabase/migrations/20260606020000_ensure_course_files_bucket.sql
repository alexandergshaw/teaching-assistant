-- Migration: ensure the course-files storage bucket and its policies exist.
--
-- The original courses schema migration provisioned the "course-files" bucket
-- and its row level security policies in the same transaction that created the
-- course tables. If any of the `create policy` statements failed (for example
-- because a policy of the same name already existed from a prior partial run),
-- the whole transaction aborted and the bucket was never created — which makes
-- every file upload fail with "Bucket not found" and surfaces to the user as a
-- save error on the End to End subtab.
--
-- This migration re-provisions the bucket and policies idempotently so the
-- upload path works regardless of how the earlier migration was applied. The
-- application also self-heals by creating the bucket at runtime via the
-- service-role client, but keeping the schema correct is preferable.
--
-- Apply with:
--   supabase db push
-- or by pasting into the Supabase SQL editor.

-- ── storage bucket ────────────────────────────────────────────────────────────

insert into storage.buckets (id, name, public)
values ('course-files', 'course-files', false)
on conflict (id) do nothing;

-- Recreate the per-owner object policies idempotently. Objects are stored under
-- {user_id}/{course_id}/... paths, so only the owner may read/write them.

drop policy if exists "course_files_select_own" on storage.objects;
create policy "course_files_select_own"
  on storage.objects for select
  using (
    bucket_id = 'course-files'
    and auth.uid()::text = (string_to_array(name, '/'))[1]
  );

drop policy if exists "course_files_insert_own" on storage.objects;
create policy "course_files_insert_own"
  on storage.objects for insert
  with check (
    bucket_id = 'course-files'
    and auth.uid()::text = (string_to_array(name, '/'))[1]
  );

drop policy if exists "course_files_update_own" on storage.objects;
create policy "course_files_update_own"
  on storage.objects for update
  using (
    bucket_id = 'course-files'
    and auth.uid()::text = (string_to_array(name, '/'))[1]
  );

drop policy if exists "course_files_delete_own" on storage.objects;
create policy "course_files_delete_own"
  on storage.objects for delete
  using (
    bucket_id = 'course-files'
    and auth.uid()::text = (string_to_array(name, '/'))[1]
  );
