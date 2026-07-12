-- Per-course week and test counts used by the Course Kickoff workflow. Idempotent.
alter table public.course_hub add column if not exists weeks integer;
alter table public.course_hub add column if not exists tests integer;
