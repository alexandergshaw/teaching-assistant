-- Per-course LMS choice (canvas | blackboard) used to pick workflow export formats. Idempotent.
alter table public.course_hub add column if not exists lms text;
