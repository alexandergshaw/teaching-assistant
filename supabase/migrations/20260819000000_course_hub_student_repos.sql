-- Per-student {student, canvasUserId, repo} mapping for course tiles.

alter table public.course_hub add column if not exists student_repos jsonb not null default '[]'::jsonb;
