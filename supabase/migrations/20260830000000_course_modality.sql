-- Course modality (async/sync/unset) so a course tile can record whether it
-- runs asynchronously or synchronously, and workflow steps can gate on it.
alter table if exists public.course_hub add column if not exists modality text null;
