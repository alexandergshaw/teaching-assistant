-- Per-institution, per-assignment accommodations/extensions list (backlog
-- N4). One row = one student's accommodation/extension note for one exact
-- (institution, course, assignment) scope. See src/lib/accommodations.ts for
-- the data layer that reads and writes this table.
--
-- THIS IS DISABILITY-RELATED STUDENT DATA - the most sensitive data this
-- application holds. Every decision below that looks unusually conservative
-- (no denormalised names, session client not service-role, an explicit
-- user_id filter on every verb) is conservative on purpose - see
-- src/lib/accommodations.ts's own header for the full rationale, which this
-- migration does not repeat.
--
-- NO course_name / assignment_name COLUMNS, DELIBERATELY (orchestrator
-- ruling N4-U, upgraded from assertion to measurement). All three human-
-- readable names - institution, course, assignment, AND the student's own
-- name - are resolved LIVE, while the panel is open, from
-- listCourses()/listAssignments()/listStudents() in src/lib/canvas/listings.ts,
-- never stored here. A denormalised name column would make a leaked row far
-- more re-identifying for no benefit: every one of those three lookups only
-- needs the institution code (already selected) plus the id this row already
-- stores, so nothing about resolving them live is actually missing.
--
-- canvas_user_id IS THE ONLY PER-STUDENT IDENTIFIER STORED. The student's
-- NAME is never written to this table under any column, at any point -
-- resolved for display only, the same way the other two names are.
--
-- ONE ROW PER STUDENT PER ASSIGNMENT (the narrower of the two legitimate
-- uniqueness shapes - see the unique constraint below). This gives the
-- application clean re-add/update-in-place semantics: a teacher correcting a
-- note does not accumulate duplicate rows for the same student. None of the
-- five columns in the unique tuple is nullable, so a plain `unique`
-- constraint is sufficient here - no stored generated column is needed, unlike
-- institution_knowledge_summaries's nullable scope_page_id (see that
-- migration's header for when a generated column actually is required).
--
-- NO RETENTION / CLEANUP STORY. The `on delete cascade` below is standard FK
-- hygiene for the case where a user's auth row is ever deleted - it is NOT a
-- claim that this application deletes accounts today. It does not. There is
-- no expiry and no end-of-term sweep: the only thing that ever removes a row
-- is the owner deleting it by hand. That is a real, open governance question,
-- not resolved by this migration.
--
-- RLS is the SECOND layer, not the only one. The data-access module
-- (src/lib/accommodations.ts) uses the RLS-respecting session client
-- (createClient(), never createServiceClient()) precisely so these four
-- policies are load-bearing rather than decorative, AND that module filters
-- every read/update/delete on user_id explicitly as well - belt and
-- suspenders, matching institution_knowledge_questions's own policy shape
-- (supabase/migrations/20261011000000_institution_knowledge_overview.sql:204-222).
--
-- Written idempotently: migrations auto-apply via a GitHub Action on push to
-- main and may re-run.

create table if not exists public.institution_accommodations (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  institution text not null,
  course_id text not null,
  assignment_id text not null,
  canvas_user_id text not null,
  note text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, institution, course_id, assignment_id, canvas_user_id)
);

comment on table public.institution_accommodations is
  'One row per student per (institution, course, assignment) scope. Never stores a student''s name, a course name, or an assignment name - canvas_user_id is the only identifying value (see its own column comment); the other names are resolved live from the Canvas API by the application, never persisted here. Manually scoped: institution/course/assignment are chosen by the owner, never inferred.';

comment on column public.institution_accommodations.institution is
  'Normalized institution code (see normalizeInstitution() in src/lib/knowledge-base.ts) - the owner''s manually-selected institution, never inferred.';

comment on column public.institution_accommodations.course_id is
  'The Canvas course id, never the Supabase hub id - see listCourses() in src/lib/canvas/listings.ts, which is the only source this column is populated from.';

comment on column public.institution_accommodations.assignment_id is
  'The Canvas assignment id, scoped to course_id - a Canvas assignment id is per-course, so a row is only meaningful together with its course_id. See listAssignments() in src/lib/canvas/listings.ts.';

comment on column public.institution_accommodations.canvas_user_id is
  'The Canvas student user id, from listStudents() in src/lib/canvas/listings.ts. This is the ONLY per-student identifier stored - the student''s name is resolved for display only, while the panel is open, by re-calling listStudents(); it is never written here.';

comment on column public.institution_accommodations.note is
  'Free-text accommodation or extension note, e.g. ''50% extended time''. Owner-authored; never model-generated, never sent to a model prompt.';

comment on column public.institution_accommodations.updated_at is
  'Set by the application on every edit (see updateAccommodation in src/lib/accommodations.ts). A correction path for data about a person''s disability is treated as an obligation, not a nicety - see that function''s own header.';

-- Non-unique lookup index: the panel filters on this exact triple every time
-- it opens (see listAccommodations in src/lib/accommodations.ts). The
-- table's own uniqueness constraint above already covers (user_id,
-- institution, course_id, assignment_id, canvas_user_id); this index
-- additionally serves the narrower (user_id, institution, course_id,
-- assignment_id) filter alone, which the unique constraint's column order
-- also satisfies as a prefix, so no separate index is strictly required by
-- Postgres - kept here anyway, named explicitly, so a future migration
-- narrowing or reordering the unique constraint does not silently regress
-- this lookup's plan.
create index if not exists institution_accommodations_scope_idx
  on public.institution_accommodations (user_id, institution, course_id, assignment_id);

alter table public.institution_accommodations enable row level security;

drop policy if exists "Users read own institution_accommodations" on public.institution_accommodations;
create policy "Users read own institution_accommodations"
  on public.institution_accommodations for select
  using (auth.uid() = user_id);

drop policy if exists "Users insert own institution_accommodations" on public.institution_accommodations;
create policy "Users insert own institution_accommodations"
  on public.institution_accommodations for insert
  with check (auth.uid() = user_id);

drop policy if exists "Users update own institution_accommodations" on public.institution_accommodations;
create policy "Users update own institution_accommodations"
  on public.institution_accommodations for update
  using (auth.uid() = user_id);

drop policy if exists "Users delete own institution_accommodations" on public.institution_accommodations;
create policy "Users delete own institution_accommodations"
  on public.institution_accommodations for delete
  using (auth.uid() = user_id);
