-- C: instructor profile fields, rendered VERBATIM by generate-course-guides'
-- new "About Your Instructor" document - NO LLM anywhere in this path. The
-- app previously held no instructor biographical data at all: only a
-- free-text `instructor` name typed per workflow run (steps.course-guides.ts's
-- own "instructor" input, owned by the Instructor Contact document) and the
-- tile's own `email` column. Generating a bio from a bare name would
-- fabricate credentials, so this is an opt-in field the instructor fills in
-- once on the course tile instead.
--
-- Four nullable text columns, same shape as course_kind/modality/email_client
-- (course_hub_course_kind.sql) - null means "unset," and the guide-document
-- step treats a null/blank instructor_bio as "no About Your Instructor
-- document this run" (skipped, not stubbed - see steps.course-guides.ts's own
-- skip note), so every course tile that predates this column keeps its exact
-- current behavior with no backfill required. instructor_title,
-- instructor_credentials, and instructor_department are optional detail
-- rendered alongside the bio when present; the document itself is gated on
-- instructor_bio alone.
--
-- Written idempotently.

alter table public.course_hub
  add column if not exists instructor_bio text null,
  add column if not exists instructor_title text null,
  add column if not exists instructor_credentials text null,
  add column if not exists instructor_department text null;
