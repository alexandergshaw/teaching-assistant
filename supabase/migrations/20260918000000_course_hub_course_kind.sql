-- F3: a course kind ("coding" | "applied" - src/lib/course-kind.ts's own
-- vocabulary, the SAME two values Course Build/Refresh/Kickoff already use
-- for pedagogy - never a third) stored directly on the course tile, so an
-- instructor can mark a course's kind explicitly instead of it being
-- entirely DERIVED from whichever schedule source Course Build happens to be
-- run with (the reported bug: a CS Principles course built from a course
-- description could never be a coding course, because the source decided).
--
-- Nullable, no default, same shape as modality (course_hub_modality.sql) and
-- email_client - null means "unset," and Course Build's own precedence rule
-- (steps.course-schedule-from-source.ts) falls back to its existing
-- source-derived value whenever this is null, so every course tile that
-- predates this column keeps its exact current effective behavior with no
-- backfill required.
--
-- Written idempotently.

alter table public.course_hub
  add column if not exists course_kind text null;
