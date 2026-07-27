alter table if exists public.course_hub
  add column if not exists course_project jsonb not null default '{}'::jsonb;
