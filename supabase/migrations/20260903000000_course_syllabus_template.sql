alter table if exists public.course_hub
  add column if not exists syllabus_template_id text null;
