-- Generated Artifacts: versioned storage for content generated from
-- selected LMS material (anticipated Q&A, current events, sample answers,
-- announcements, and eventually decks), so an instructor can regenerate and
-- refine a piece of generated content while every prior version stays
-- around.
--
-- WHY A NEW TABLE, DELIBERATELY: nothing in this repo versions a generated
-- artifact today - checked against all 91 already-applied migrations.
-- syllabus_templates, deck_templates, artifact_templates,
-- presentation_drafts, grading_drafts and message_drafts all OVERWRITE in
-- place. recording_files is accidentally append-only (a fresh UUID per
-- save, `upsert: false` in src/lib/recording-files.ts) but carries no
-- version number, no lineage, and no ordering beyond created_at.
--
-- A prior note recommended reusing the dormant presentation_drafts table -
-- its payload is deck-shaped and it has zero callers. That is declined here
-- on purpose: this store must serve pure-text kinds (anticipated Q&A,
-- current events, sample answers, announcements) as well as decks, and a
-- deck-shaped table would leave most columns meaningless for most kinds.
-- presentation_drafts stays free for the deck's own structured payload
-- later.
--
-- KEEP-THE-OLD-ROW VERSIONING, following avatar_likenesses
-- (20260922000000_avatar_likenesses.sql) - the only other keep-the-old-row
-- table in this database: a new version is a NEW row, never an overwrite of
-- the previous one. `version` is monotonic per (course_id, kind) - kinds do
-- not share a counter, the same way avatar_likenesses' retraining history
-- stays auditable rather than being destroyed on retrain. `is_current` is
-- this table's supersede marker (avatar_likenesses instead folds that into
-- its status column, as the value 'superseded' - a plain boolean fits
-- better here because a generated-artifact row has no other lifecycle to
-- encode: it is written once, in full, and only ever superseded after
-- that). The partial unique index below enforces "at most one current row
-- per course+kind" at the database level, the same guarantee
-- avatar_likenesses_one_default gives for is_default - never left to
-- application code alone to uphold.
--
-- `structured` (nullable jsonb) exists because slidesToText is lossy (it
-- drops code, notes and graphics) - the eventual deck kind cannot round-trip
-- through `text` alone. Every other kind is expected to leave it null.
--
-- `prompt` carries the actual instruction/prompt that produced this version,
-- IN FULL. This is deliberately NOT sourced from the workflow run log:
-- src/lib/workflows/run-input-redaction.ts truncates every value at 500
-- characters (MAX_VALUE_CHARS) before that log is ever written, so a real
-- generation prompt reaching workflow_run_steps.inputs is already destroyed
-- by the time it lands there. Capturing the prompt directly on this table,
-- before any redaction step touches it, is the only way to keep it intact.
--
-- `kind` has no CHECK constraint on purpose - unlike recording_files.kind,
-- which is widened via a drop/recreate of its constraint each time a new
-- kind ships. The generators this table backs are still being built out one
-- at a time, and locking the set now would just mean another migration per
-- generator. This matches the existing open-ended precedent of
-- workflow_run_steps.step_type and course_task_defs.task_id, neither of
-- which is constrained either.
--
-- Post-commit state (a Canvas topic_id, posted/scheduled flags) is
-- deliberately NOT stored here - that belongs on a commit record, not on
-- the versioned artifact. weekly_announcement_schedule
-- (20260925000000_weekly_announcement_schedule.sql) already makes this same
-- separation on purpose, omitting posted_at because only Canvas knows it;
-- this table keeps the same boundary.
--
-- Keyed like course_tasks and weekly_announcement_schedule: user_id is the
-- owner, course_id references public.course_hub (id) on delete cascade so a
-- deleted course takes its generated artifacts with it.
--
-- Written idempotently, like every migration in this repo.

create table if not exists public.generated_artifacts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  course_id uuid not null references public.course_hub (id) on delete cascade,
  -- Which generator produced this row (e.g. 'anticipated-qa',
  -- 'current-events', 'sample-answers', 'announcement', 'deck', ...). See
  -- the header comment for why this has no CHECK constraint.
  kind text not null,
  -- Monotonic per (course_id, kind); also enforced below by
  -- generated_artifacts_course_kind_version_idx, not left to application
  -- arithmetic alone.
  version integer not null,
  -- Supersede marker - see the header comment. At most one true row per
  -- (course_id, kind), enforced by generated_artifacts_one_current_idx.
  is_current boolean not null default true,
  -- Announcements need a title distinct from their body; every other kind
  -- is expected to leave this null.
  title text,
  -- Serves preview, refine and diff for EVERY kind.
  text text not null,
  -- Nullable - see the header comment. Only the deck kind is expected to
  -- ever populate this.
  structured jsonb,
  -- The full prompt/instruction that produced this version - see the header
  -- comment for why this is captured here rather than read back from the
  -- (truncated) workflow run log.
  prompt text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Enforces "monotonic per course+kind" at the database level. This btree
-- also serves newest-first version lookups (a backward index scan), so no
-- separate ordering index is added.
create unique index if not exists generated_artifacts_course_kind_version_idx
  on public.generated_artifacts (course_id, kind, version);

-- At most one current version per (course_id, kind), atomically - the same
-- pattern as avatar_likenesses_one_default (see that migration's own
-- comment for why this must be a database-level guarantee rather than a
-- read-then-write in application code).
create unique index if not exists generated_artifacts_one_current_idx
  on public.generated_artifacts (course_id, kind) where is_current;

-- Owner-scoped listing independent of any one course, matching
-- avatar_likenesses_user_idx / workflow_run_steps_user_idx.
create index if not exists generated_artifacts_user_idx
  on public.generated_artifacts (user_id, created_at desc);

alter table public.generated_artifacts enable row level security;

drop policy if exists "Users read own generated_artifacts" on public.generated_artifacts;
create policy "Users read own generated_artifacts"
  on public.generated_artifacts for select
  using (auth.uid() = user_id);

drop policy if exists "Users insert own generated_artifacts" on public.generated_artifacts;
create policy "Users insert own generated_artifacts"
  on public.generated_artifacts for insert
  with check (auth.uid() = user_id);

drop policy if exists "Users update own generated_artifacts" on public.generated_artifacts;
create policy "Users update own generated_artifacts"
  on public.generated_artifacts for update
  using (auth.uid() = user_id);

drop policy if exists "Users delete own generated_artifacts" on public.generated_artifacts;
create policy "Users delete own generated_artifacts"
  on public.generated_artifacts for delete
  using (auth.uid() = user_id);
