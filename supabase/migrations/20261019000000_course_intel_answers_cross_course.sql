-- course-intel Q&A history: a CROSS-COURSE answer (docs/course-student-
-- intelligence-acceptance-criteria.md, decision D24e - "a ranking that
-- silently omits courses is worse than a list that does") is now persisted
-- alongside every single-course answer this table already held
-- (20261018000000_course_intel_answers.sql). See
-- src/lib/course-intel/history.ts for the data layer this migration serves.
--
-- WHY THIS WAS A GAP, AND WHY IT IS NOT THE SAME GAP ANYMORE. 20261018000000's
-- own header said a cross-course answer would never be stored: "history rows
-- are keyed to ONE course, and an answer spanning five courses has no honest
-- value for that column." That reasoning still holds for course_id alone - a
-- five-course answer genuinely has no single honest course_id - but it never
-- followed that the answer could not be stored at all. The fix is to give the
-- row a second, honest way to say what it is about, and to make exactly one
-- of the two ways be populated, never neither and never both.
--
-- course_id IS NOW NULLABLE. NULL means "this row is not about one course" -
-- see course_ids below for what it is about instead. Every single-course row,
-- past and future, keeps a non-null course_id exactly as before: dropping
-- NOT NULL only widens what the column accepts and rewrites nothing already
-- stored. The foreign key to course_hub and its ON DELETE CASCADE are
-- untouched - a nullable column participates in a foreign key exactly like a
-- non-nullable one, simply skipping the check when the value is NULL.
--
-- course_ids uuid[] not null default '{}' - the full set of course_hub ids a
-- CROSS-COURSE answer actually covered. Under D24e, coverage IS part of the
-- answer's meaning, not a footnote recomputable later - the assembly itself
-- is never persisted (20261018000000's own "what is deliberately not stored"
-- rule), so this column is the only place that fact survives past the
-- request that produced it. Empty ('{}') on every single-course row, where
-- course_id alone already says which course this is. Added with a constant
-- default, so backfilling every row already in the table costs a metadata
-- change, not a rewrite.
--
-- course_intel_answers_course_scope_check replaces "course_id is required"
-- with "exactly one representation of scope is present": either course_id
-- names the one course this row is about and course_ids is empty, or
-- course_id is null and course_ids names at least one course. Every row
-- already in this table satisfies the first branch (course_id not null,
-- course_ids defaulted to '{}' by the add column above), so this constraint
-- validates cleanly against the data already there without needing NOT VALID.
-- array_length() returns NULL (not 0) for an empty array - both branches
-- below coalesce it to 0 for exactly that reason.
--
-- A KNOWN GAP, NAMED RATHER THAN BUILT (mirrors 20261018000000's own such
-- note about scope_student and a withdrawn student). course_id's foreign key
-- cascades when the course it names is deleted; course_ids carries NO such
-- integrity, because Postgres cannot express a per-element foreign key on an
-- array column without a trigger, and this migration does not add one. A
-- cross-course answer that named a course later deleted from course_hub
-- keeps that id in course_ids indefinitely, naming a course that no longer
-- exists. The row is not silently corrected, and nothing here claims it is -
-- the same honest-gap posture 20261018000000 already takes when a named
-- student withdraws.
--
-- RETRIEVAL. A per-course history read must not silently drop a cross-course
-- row that covered it (D24e applies to what an instructor can find again,
-- not only to what a live answer states). src/lib/course-intel/history.ts
-- reads BOTH `course_id = :courseId` - unchanged, still served by the
-- existing course_intel_answers_user_course_created_idx - and
-- `course_ids @> ARRAY[:courseId]` - new, served by the GIN index below -
-- and merges the two, rather than filtering on course_id alone and making a
-- cross-course row invisible from every single course's own history.
--
-- RLS untouched. Every policy on this table is scoped by user_id alone, never
-- by course_id, so widening what course_id may hold changes nothing about
-- who can read, write or delete a row. The tenant boundary that matters on
-- this app's real path is still the explicit user_id filter in
-- src/lib/course-intel/history.ts - see that table's own header: the caller
-- is always a service-role client, which bypasses RLS and leaves auth.uid()
-- null.
--
-- Written idempotently: migrations auto-apply via a GitHub Action on push to
-- main and may re-run.

alter table public.course_intel_answers
  alter column course_id drop not null;

alter table public.course_intel_answers
  add column if not exists course_ids uuid[] not null default '{}'::uuid[];

comment on column public.course_intel_answers.course_id is
  'The one course this row is about, or NULL for a cross-course answer - see course_ids for what a cross-course row is about instead. NULLABLE since 20261019000000_course_intel_answers_cross_course.sql; every single-course row, past and future, still has this set.';
comment on column public.course_intel_answers.course_ids is
  'The full set of course_hub ids a CROSS-COURSE answer covered (acceptance-criteria decision D24e - coverage is part of the answer''s meaning, not a footnote). Empty on every single-course row, where course_id alone already says which course this is; never populated at the same time as course_id - see course_intel_answers_course_scope_check. No per-element foreign key - see this migration''s header for why that is a named gap, not an oversight.';

alter table public.course_intel_answers
  drop constraint if exists course_intel_answers_course_scope_check;
alter table public.course_intel_answers
  add constraint course_intel_answers_course_scope_check
  check (
    (course_id is not null and coalesce(array_length(course_ids, 1), 0) = 0)
    or
    (course_id is null and coalesce(array_length(course_ids, 1), 0) >= 1)
  );

-- Supports `course_ids @> ARRAY[:courseId]` (the cross-course half of a
-- per-course history read - see this migration's header). GIN is the only
-- index type Postgres offers for array containment, via the built-in array
-- operator class - no extension required. The existing
-- (user_id, course_id, created_at desc) btree index is untouched and keeps
-- serving every single-course read exactly as before.
create index if not exists course_intel_answers_course_ids_gin_idx
  on public.course_intel_answers using gin (course_ids);
