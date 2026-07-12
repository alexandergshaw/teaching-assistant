-- Per-course class start date (YYYY-MM-DD) used for workflow deadlines. Idempotent.
alter table public.course_hub add column if not exists start_date text;
