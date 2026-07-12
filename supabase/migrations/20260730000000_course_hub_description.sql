-- Per-course description used as context in workflows. Idempotent.
alter table public.course_hub add column if not exists description text;
