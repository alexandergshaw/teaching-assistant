-- Course topics: a free-text list (one topic per line) shown as a tile on the Courses tab. Idempotent.
alter table public.course_hub add column if not exists topics text;
