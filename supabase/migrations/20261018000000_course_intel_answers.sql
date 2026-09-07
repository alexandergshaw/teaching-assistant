-- Course-student-intelligence Q&A history: a per-user, per-course store of
-- questions an instructor asked the Ask AI feature (see
-- docs/course-student-intelligence-acceptance-criteria.md) and the answers
-- it gave. See src/lib/course-intel/history.ts for the data layer that reads
-- and writes this table, and src/lib/course-intel/types.ts for
-- CourseIntelAnswerRecord, the app-level shape this table exists to
-- persist.
--
-- WHAT IS STORED, AND WHAT IS DELIBERATELY NOT (acceptance-criteria
-- decision D8). This table holds the question, the answer markdown, which
-- students the answer cited (index + Canvas user id, never a name), the
-- omissions the assembly reported, which tier it ran at, and when the
-- underlying assembly was built. It NEVER holds the signals snapshot, the
-- assembled corpus, or any per-student structured record - those are the
-- most sensitive part of this feature and are rebuildable from Canvas in a
-- handful of calls. institution_knowledge_summaries
-- (20261011000000_institution_knowledge_overview.sql) persists a
-- source_pages snapshot of exactly that shape; that precedent is NOT
-- copied here, on purpose.
--
-- scope_student text not null default '', NEVER NULLABLE. A blank string
-- means "the whole course"; a non-blank value is the Canvas user id (as
-- text) of the one student a student-status or student-topics question was
-- scoped to (see CourseIntelQuestionShape in
-- src/lib/course-intel/types.ts). This is the same "nullable uniqueness key
-- plus PostgREST upsert" fork that institution_knowledge_questions hit
-- (error 42P10 - see that migration's header for the full account), but it
-- resolves DIFFERENTLY here rather than reusing that table's fix: this
-- table carries no uniqueness constraint at all (every question is its own
-- append-only row, exactly like announcement_exemplars,
-- 20261017000000_announcement_exemplars.sql), so there is no ON CONFLICT
-- arbiter for a nullable column to ever break in the first place. The
-- coalesce-to-nil-uuid STORED GENERATED column technique the knowledge
-- migration used does not even apply on its own terms here: a student key
-- is a Canvas user id (a small integer, carried as text), not a uuid, and
-- resting a generated column's IMMUTABLE requirement on a text I/O function
-- is not a bet worth placing on a migration that auto-applies straight to
-- production. `not null default ''` needs none of that machinery - it is
-- just an ordinary text column with a non-null default.
--
-- NO THREAD OR PARENT-QUESTION COLUMN, ON PURPOSE. Cross-question
-- extraction (feeding a prior answer back into a later prompt so "and what
-- about her grades?" can work) is closed today, deliberately (decision D9):
-- no prior question or answer may ever be placed in a prompt, because a
-- crafted discussion post could ask the model to restate an instructor's
-- earlier question verbatim. This table has no column that would let a
-- future caller thread answers together, so that invariant cannot be
-- silently defeated by a schema change alone - enforcing it in the
-- prompt-building code is still that code's own job, not this migration's.
--
-- NO CASCADE ON THE SUBJECT OF THE RECORD, BECAUSE IT IS NOT A ROW HERE
-- (decision D8). institution_knowledge_summaries/_questions cascade on
-- institution_pages(id) because the thing a summary is ABOUT is a page in
-- this database. A course-intel answer is about a student, and a student is
-- not a row in this database - Canvas is the system of record for
-- enrollment. So there is no FK to cascade on when a student withdraws,
-- graduates, or is removed from a course roster, and there cannot be one:
-- nothing here can ever fire on that event. The two FKs this table DOES
-- carry (user_id -> auth.users, course_id -> course_hub) cascade exactly
-- like every other per-course table in this schema, so deleting the owning
-- account or the course itself takes its answers with it. Beyond that,
-- deletion is only ever by explicit instructor action - see below.
--
-- RETENTION (decision D8, survey finding S22). Three tables in this schema
-- already hold student-derived AI output indefinitely with no purge path
-- (institution_knowledge_questions among them), and no retention concept
-- exists anywhere in this app. This table does not silently join them, and
-- it does not silently copy institution_knowledge_questions' own
-- MAX_SCOPE_QA_ENTRIES=20 prune either - deleting a stored assessment about
-- a named person after the 21st newer question is a retention policy
-- nobody chose. Instead: NO AUTOMATIC DELETION OF ANY KIND runs against
-- this table. Retention is bounded only by explicit instructor action -
-- deleteCourseIntelAnswer (one row) and clearCourseIntelAnswers (every row
-- for a course), both in src/lib/course-intel/history.ts, both shipped
-- from day one, both owner-filtered. exportCourseIntelAnswers (same file)
-- returns every row for a course so an instructor can answer "what do you
-- hold about me" without opening each entry by hand.
--
-- A KNOWN GAP, NAMED RATHER THAN BUILT (decision D18). Per-row delete and
-- clear-all cover "delete this one answer" and "delete everything for this
-- course." Neither covers "delete everything this tool has ever said about
-- ONE student" - a withdrawn student is a foreseeable trigger for exactly
-- that, and an instructor would otherwise have to hand-pick rows by memory,
-- with no way to know a stale answer refers to that person under an older
-- spelling of their name. Building that operation needs an index of which
-- stored answers mention which student, which is itself a small dossier of
-- exactly the kind this table's header refuses to persist above. So it is
-- NOT built. The honest interim answer is the export control: an
-- instructor can produce what is held and delete individual rows by hand.
--
-- SECURITY - DO NOT RELY ON RLS ALONE. Every function in
-- src/lib/course-intel/history.ts is called from
-- src/app/actions/course-intel.ts with a SERVICE-ROLE client, which
-- bypasses RLS entirely and leaves auth.uid() null. The RLS policies below
-- are correct and matter for an RLS-respecting client, but on the path
-- this app actually uses today the explicit user_id filter every function
-- applies itself is the ONLY tenant boundary that exists - restated from
-- src/lib/artifact-templates.ts's own history, where a live cross-tenant
-- hole of exactly this shape (a client-supplied id used as an .upsert()
-- ON CONFLICT arbiter, and a delete with no owner filter at all) let any
-- signed-in account destroy or steal another account's rows.
--
-- Written idempotently: migrations auto-apply via a GitHub Action on push
-- to main and may re-run.

create table if not exists public.course_intel_answers (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  course_id uuid not null references public.course_hub (id) on delete cascade,
  scope_student text not null default '',
  question text not null,
  answer_markdown text not null,
  cited_students jsonb not null default '[]'::jsonb,
  omissions jsonb not null default '[]'::jsonb,
  tier text not null,
  assembled_at timestamptz not null,
  created_at timestamptz not null default now()
);

comment on table public.course_intel_answers is
  'Per-user, per-course Q&A history for the course-student-intelligence Ask AI feature. Append-only, no uniqueness constraint, no upsert. NEVER stores the signals snapshot, the assembled corpus, or any per-student structured record - see this migration''s header. Every read, write and delete goes through src/lib/course-intel/history.ts using the service-role client, which bypasses RLS - the explicit user_id filter that module applies itself is the real tenant boundary, not the RLS policies below.';
comment on column public.course_intel_answers.scope_student is
  'Blank string = the whole course. A non-blank value is the Canvas user id (as text) of the one student a student-status or student-topics question was scoped to. NOT NULLABLE by design - see this migration''s header for why the knowledge migration''s coalesce-to-nil-uuid technique does not transfer here.';
comment on column public.course_intel_answers.cited_students is
  'jsonb array of {index, userId} - the resolved student markers the ANSWER cited, so a citation chip can be rendered without re-running anything. Never a name. Matches CourseIntelAnswerRecord.citedStudents in src/lib/course-intel/types.ts.';
comment on column public.course_intel_answers.omissions is
  'jsonb array of AssemblyOmission (src/lib/course-intel/types.ts) - what the assembly this answer was built from could not see. Persisted verbatim so a stored answer can still disclose its own gaps after the live assembly is gone.';
comment on column public.course_intel_answers.tier is
  'AssemblyTier ("signals" or "signals+text") as free text, no CHECK constraint - matches this schema''s existing model-id-style columns (e.g. institution_knowledge_questions.model): a future tier value must never make a save fail.';
comment on column public.course_intel_answers.assembled_at is
  'When the underlying assembly (src/lib/course-intel/types.ts CourseIntelAssembly) was built - carried from that assembly, never recomputed here. Distinct from created_at (this row''s own insert time), the same way institution_knowledge_summaries.generated_at is distinct from its created_at.';

-- The one index this table needs: every real read is "history for this
-- course, newest first" (see listCourseIntelAnswers / exportCourseIntelAnswers
-- in src/lib/course-intel/history.ts). Deliberately NOT keyed on
-- scope_student - the history feed shows whole-course and per-student
-- answers together, and splitting the index by scope would only serve a
-- per-student view this feature does not build (see the known-gap note
-- above).
create index if not exists course_intel_answers_user_course_created_idx
  on public.course_intel_answers (user_id, course_id, created_at desc);

alter table public.course_intel_answers enable row level security;

drop policy if exists "Users read own course_intel_answers" on public.course_intel_answers;
create policy "Users read own course_intel_answers"
  on public.course_intel_answers for select
  using (auth.uid() = user_id);

drop policy if exists "Users insert own course_intel_answers" on public.course_intel_answers;
create policy "Users insert own course_intel_answers"
  on public.course_intel_answers for insert
  with check (auth.uid() = user_id);

drop policy if exists "Users update own course_intel_answers" on public.course_intel_answers;
create policy "Users update own course_intel_answers"
  on public.course_intel_answers for update
  using (auth.uid() = user_id);

drop policy if exists "Users delete own course_intel_answers" on public.course_intel_answers;
create policy "Users delete own course_intel_answers"
  on public.course_intel_answers for delete
  using (auth.uid() = user_id);
