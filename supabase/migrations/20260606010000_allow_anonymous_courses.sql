-- Migration: allow anonymous course creation.
--
-- The application does not yet expose an authentication flow, so course data is
-- persisted on behalf of anonymous users (mirroring the ai_chat_messages table,
-- whose user_id is also nullable). Course writes go through the service-role
-- client, which bypasses row level security.
--
-- This migration relaxes the NOT NULL constraint on courses.user_id so a course
-- can be created without an authenticated user. When auth is added later, the
-- column can be backfilled and the constraint reinstated.
--
-- Apply with:
--   supabase db push
-- or by pasting into the Supabase SQL editor.

alter table public.courses
  alter column user_id drop not null;
