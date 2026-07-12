-- Per-course meeting day/time (e.g. MW 10:00-11:15) used to schedule lecture announcements. Idempotent.
alter table public.course_hub add column if not exists day_time text;
