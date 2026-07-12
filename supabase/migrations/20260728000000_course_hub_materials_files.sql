-- Per-course generated materials list (zips, LMS exports): [{name, path, size, addedAt}]. Idempotent.
alter table public.course_hub add column if not exists materials_files jsonb not null default '[]'::jsonb;
