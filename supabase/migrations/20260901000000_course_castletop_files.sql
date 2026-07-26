alter table if exists public.course_hub
  add column if not exists castletop_files jsonb not null default '[]'::jsonb;
