-- Per-course CSV attachment (small data files, e.g. gradebook or topic imports) shown under the Topics tile. Idempotent.
alter table public.course_hub add column if not exists csv_name text;
alter table public.course_hub add column if not exists csv_data text;
