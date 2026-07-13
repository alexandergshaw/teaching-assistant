-- Per-course LMS export packages (.imscc) shown under the LMS Exports tile. Idempotent.
alter table public.course_hub add column if not exists export_files jsonb;
