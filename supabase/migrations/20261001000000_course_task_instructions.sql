-- Per-institution, per-task instruction text for the Tasks tab's course x
-- task-checklist matrix
-- (docs/task-institution-instructions-acceptance-criteria.md, AC1). One row
-- is "how this school wants this task done" - shared standing guidance that
-- every course at that institution inherits for a given task column,
-- additive to (never a replacement for) the existing per-course, per-cell
-- TaskCell.note (src/lib/course-tasks.ts:109-112) - see the AC doc's A1/A2
-- stated assumptions for why a per-(course, task) instruction would add
-- nothing that note does not already provide, and why per-(institution,
-- task) is the axis that matters.
--
-- institution is a plain text column, not a foreign key, for the same
-- reason institution_pages.institution is one: there is no institutions
-- table in this codebase - see
-- supabase/migrations/20260910000000_create_institution_pages.sql:13-17.
-- The acronym registry (MCC, MPCC, ...) lives entirely in the browser's
-- localStorage (src/lib/institutions.ts), so a row here can only ever be
-- matched against whatever string a course tile or an editing surface
-- happens to send, never a real foreign key.
--
-- This is a SEPARATE TABLE rather than a new column on course_task_defs
-- (supabase/migrations/20260924000000_course_tasks.sql:62-78) because that
-- table's natural key is (user_id, task_id), with no institution dimension
-- at all, and every def upsert (upsertCourseTaskDef / upsertCourseTaskDefs,
-- src/lib/supabase/course-tasks.ts) rewrites every column on conflict.
-- Bolting an institution-scoped value onto a row keyed without institution
-- would mean either one instruction per task regardless of institution
-- (wrong - AC1's whole point is per-institution guidance) or every
-- def-only write (a rename, a reorder) silently wiping every institution's
-- instruction for that task the next time an unrelated def upsert touches
-- the row. A dedicated table keyed (user_id, institution, task_id) avoids
-- both problems, and matches the natural key every other per-institution
-- table in this codebase already uses (institution_fields, PK
-- (user_id, acronym); microsoft_credentials, PK (user_id, institution);
-- grading_dismissals, institution inside the PK - see the AC doc's "Vetted
-- existing code" table).
--
-- Casing note (AC2 item 6, "the casing trap"): this column stores whatever
-- normalized value the write path hands it
-- (src/lib/task-institution-instructions.ts's taskInstructionKey,
-- trim().toUpperCase()) - unlike course_hub.institution, which is only
-- trimmed and never uppercased (clean() inside toRow,
-- src/lib/supabase/courses.row.ts:162-165, and the asymmetry called out in
-- countCoursesByInstitution's own comment, src/lib/supabase/courses.ts:129-139).
-- A tile saved "mcc" and an
-- instruction saved "MCC" must still join; the application layer is what
-- reconciles that, not a SQL CHECK constraint - matching how
-- institution_pages itself normalizes entirely in the TypeScript layer
-- (src/lib/knowledge-base.ts's normalizeInstitution) rather than in SQL.
--
-- No enum, no CHECK constraint, and no foreign key to any institution
-- table - there isn't one to reference. Migrations in this repo auto-apply
-- via .github/workflows/supabase-migrations.yml on push to main; this file
-- is never meant to be run by hand.
--
-- Written idempotently.

create table if not exists public.course_task_instructions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users on delete cascade,
  institution text not null,
  task_id text not null,
  body text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists course_task_instructions_user_inst_task_idx
  on public.course_task_instructions (user_id, institution, task_id);

alter table public.course_task_instructions enable row level security;

drop policy if exists "Users read own course_task_instructions" on public.course_task_instructions;
create policy "Users read own course_task_instructions"
  on public.course_task_instructions for select
  using (auth.uid() = user_id);

drop policy if exists "Users insert own course_task_instructions" on public.course_task_instructions;
create policy "Users insert own course_task_instructions"
  on public.course_task_instructions for insert
  with check (auth.uid() = user_id);

drop policy if exists "Users update own course_task_instructions" on public.course_task_instructions;
create policy "Users update own course_task_instructions"
  on public.course_task_instructions for update
  using (auth.uid() = user_id);

drop policy if exists "Users delete own course_task_instructions" on public.course_task_instructions;
create policy "Users delete own course_task_instructions"
  on public.course_task_instructions for delete
  using (auth.uid() = user_id);
