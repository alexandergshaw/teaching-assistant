-- No-op. Superseded by 20260713000000_create_course_hub.sql.
--
-- This version was recorded in the remote migration history, but its original
-- contents targeted a `courses` table that collided with a pre-existing,
-- unrelated `courses` table in the database. The course-hub feature now uses a
-- dedicated `course_hub` table instead. This file is kept as a no-op so its
-- migration version still exists locally -- otherwise `supabase db push` (and
-- the CI apply job) report "remote migration versions not found in local
-- migrations directory". It does nothing on a fresh database and is skipped on
-- databases where this version is already applied.

do $$ begin end $$;
