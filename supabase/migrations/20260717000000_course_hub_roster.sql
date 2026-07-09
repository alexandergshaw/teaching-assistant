-- Roster of students for a course (plain text, one student per line), edited
-- by paste or fetched from Canvas in the Courses hub.
alter table public.course_hub add column if not exists roster text;
