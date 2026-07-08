-- Hold a course's third-party integrations (Cengage, McGraw-Hill Connect, etc.)
-- as a jsonb array of { name, url }, so each course keeps its integration links
-- alongside its other resources. Nullable-by-default (empty array).
alter table public.course_hub add column if not exists integrations jsonb not null default '[]'::jsonb;
