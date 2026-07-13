-- Per-course rubric attachment (generated grading rubric text) shown under the Rubric tile. Idempotent.
alter table public.course_hub add column if not exists rubric_name text;
alter table public.course_hub add column if not exists rubric_data text;
