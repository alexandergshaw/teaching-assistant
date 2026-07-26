alter table if exists public.course_hub
  add column if not exists class_length_minutes integer null;
