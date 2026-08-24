-- Scheduled publishing from Modules: the durable queue of individual publish
-- targets waiting to go live. docs/scheduled-publishing-from-modules-
-- acceptance-criteria.md, "Post-design corrections" section, F2 and the
-- storage half of F5.
--
-- ONE ROW PER TARGET, NOT ONE ROW PER RELEASE. F2 disqualifies reusing
-- `workflow_schedules` for three reasons, and this shape is the direct answer
-- to all three: (1) that table's claim function ADVANCES OR DISABLES the row,
-- which assumes a repeating or reusable schedule - wrong for a one-shot
-- release, so this table's claim never advances a row to a future occurrence,
-- it only ever moves forward through a terminal state (see the state machine
-- below); (2) packing N targets into one `field_values` jsonb blob makes
-- "crashed after publishing 3 of 10" unrepresentable, and that state is the
-- whole problem this feature exists to solve - with one row per target,
-- "3 of 10" is just three rows with status = 'done' and seven with
-- status = 'pending', each independently queryable; (3) becoming a workflow
-- inherits `isHeadlessSafeWorkflow`, which SILENTLY SKIPS - a release that
-- never happens and never says so is exactly the failure this feature exists
-- to prevent, so this table is dispatched directly by the cron route under
-- its own sub-budget (F2), never wrapped as a workflow run.
--
-- KEYED ON course_url, NOT A course_hub FOREIGN KEY. F2 is explicit:
-- `resolveCourse` (src/lib/canvas-core.ts) needs only a course URL plus an
-- optional institution acronym to resolve a course - it does not need, and
-- must not require, a `course_hub` row to exist. A foreign key here would
-- make a schedule impossible for any course opened by direct Canvas URL that
-- was never saved as a tile.
--
-- THE TARGET REFERENCE IS DELIBERATELY GENERIC: (target_kind, target_id), not
-- a module_id column and a separate module_item_id column. F9's first
-- highest-risk unknown - whether a module ITEM published inside an
-- UNPUBLISHED module is actually invisible to students, or whether the
-- MODULE itself must also be unpublished for the hide to work - is
-- unresolved as of this migration, and that answer decides whether releases
-- ever need to target modules, items, or both. A generic (kind, id) pair
-- survives either answer without a schema change; a pair of nullable
-- module/item columns would bake in a guess. DO NOT narrow this to a single
-- `module_item_id` column before F9(1) is actually resolved (ten minutes in
-- Student View, per the acceptance criteria).
--
-- THE STATE MACHINE, AND WHY EACH TRANSITION EXISTS.
--   pending  - write-ahead intent: the row is committed BEFORE anything is
--              published or unpublished on Canvas, following this repo's
--              write-ahead discipline (see 20260925000000_weekly_announcement
--              _schedule.sql). A row that never leaves 'pending' simply never
--              fired yet, or fired and crashed before claiming - both are
--              safe, because nothing has touched Canvas.
--   claimed  - exactly one caller has won the compare-and-set (status still
--              'pending' AND release_at unchanged) and is now acting on
--              Canvas. This is what makes a row safe to process from two
--              concurrent cron ticks or an open browser tab racing the
--              server: the loser's UPDATE matches zero rows.
--   done     - terminal, success. The target (and anything F4 required
--              unpublishing first) is confirmed live.
--   failed   - terminal, but VISIBLE (AC8) - Canvas refused the write, or the
--              claim went stale and exhausted its one recovery attempt (see
--              recovery_attempts below). A 'failed' row is never silently
--              retried again; that is what makes it the opposite of the
--              silent-skip failure mode F2 rules out.
-- A row stuck at 'claimed' for longer than the stale-claim threshold (a
-- process killed mid-flight by the 60-second maxDuration cap, or a closed
-- browser tab - see src/lib/scheduled-releases.ts's STALE_CLAIM_MS, which
-- follows the same shape as workflow-schedules.ts's stale-claim sweep) is
-- swept back to 'pending' once (recovery_attempts 0 -> 1) so the next tick
-- retries it, or to 'failed' once that one retry has also gone stale
-- (recovery_attempts already at the cap) - never advanced to a "next
-- occurrence" the way workflow_schedules does, because a one-shot release has
-- no next occurrence to advance to. Each row's transitions depend only on its
-- own status and timestamps, never on sibling rows for the same release - the
-- property that makes "3 of 10 published, cron died, the other 7 are still
-- independently due" representable at all.
--
-- ONE PENDING ROW PER TARGET (AC5): rescheduling a target replaces its
-- pending row rather than creating a second one racing it. Enforced with a
-- partial unique index rather than a plain one, because 'done'/'failed' rows
-- are a deliberate audit trail - a target may legitimately be scheduled,
-- released, and later scheduled again - and only the 'pending' (not yet
-- acted on) state can conflict with a reschedule.
--
-- USER-SCOPED (unlike cron_heartbeat, which deliberately is not). A cron tick
-- is a fact about the deployment; a scheduled release is a fact about one
-- instructor's course and belongs to them the same way a workflow_schedules
-- row does. RLS below mirrors 20260808000000_create_workflow_schedules.sql
-- exactly. The cron route claims and sweeps ACROSS ALL USERS (it has no
-- single signed-in user), so - like listDueUnattendedWorkflowSchedules and
-- listStaleClaimedWorkflowSchedules - it must use the service-role client,
-- which bypasses RLS entirely; these policies exist for the browser-facing
-- reads/writes a future UI adds, not for the cron route.
--
-- Written idempotently.

create table if not exists public.scheduled_releases (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  -- Not a course_hub foreign key - see header. Whatever URL the instructor
  -- had open when they scheduled the release.
  course_url text not null,
  -- Institution acronym snapshot, passed to resolveCourse's second argument
  -- alongside course_url; null when the course was resolved by URL-host
  -- matching alone (resolveCourse's fallback path).
  course_acronym text,
  target_kind text not null check (target_kind in ('module', 'module_item')),
  -- Canvas's own id for the module or module item. Not a foreign key -
  -- Canvas is the source of truth, this table only remembers what it must do.
  target_id bigint not null,
  -- The absolute UTC instant to release at, computed in the BROWSER (AC4) and
  -- stored as-is; the runner never re-derives it from a wall-clock date.
  release_at timestamptz not null,
  status text not null default 'pending' check (status in ('pending', 'claimed', 'done', 'failed')),
  -- Set when status moves to 'claimed'; cleared (null) whenever a row is
  -- re-armed back to 'pending' by the stale sweep. Used both by the claim's
  -- own CAS and by the stale sweep's cutoff query.
  claimed_at timestamptz,
  -- How many times the stale sweep has already re-armed this row back to
  -- 'pending' after an interrupted claim; capped (see MAX_RECOVERY_ATTEMPTS
  -- in scheduled-releases.ts) so a target whose runner keeps dying cannot
  -- loop forever - it becomes 'failed', visibly, instead.
  recovery_attempts integer not null default 0,
  -- The most recent failure detail (a refused Canvas write, or a stale-claim
  -- recovery note), capped at 500 chars like every other detail column in
  -- this codebase (see recordCronHeartbeat, updateScheduleRunOutcome). Left
  -- in place after a terminal 'failed' so AC8 has something to show; cleared
  -- back to null on a successful 'done'.
  last_error text,
  -- Set only when status becomes 'done'.
  completed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- One pending row per target - see header (AC5). Deliberately partial: a
-- 'done' or 'failed' row must never block scheduling that same target again
-- later.
create unique index if not exists scheduled_releases_pending_target_idx
  on public.scheduled_releases (course_url, target_kind, target_id)
  where status = 'pending';

-- Due-selection query shape: status = 'pending' and release_at <= now().
create index if not exists scheduled_releases_due_idx
  on public.scheduled_releases (release_at)
  where status = 'pending';

-- Stale-claim sweep query shape: status = 'claimed' and claimed_at < cutoff.
create index if not exists scheduled_releases_claimed_idx
  on public.scheduled_releases (claimed_at)
  where status = 'claimed';

create index if not exists scheduled_releases_user_idx
  on public.scheduled_releases (user_id, release_at);

alter table public.scheduled_releases enable row level security;

drop policy if exists "Users read own scheduled_releases" on public.scheduled_releases;
create policy "Users read own scheduled_releases"
  on public.scheduled_releases for select
  using (auth.uid() = user_id);

drop policy if exists "Users insert own scheduled_releases" on public.scheduled_releases;
create policy "Users insert own scheduled_releases"
  on public.scheduled_releases for insert
  with check (auth.uid() = user_id);

drop policy if exists "Users update own scheduled_releases" on public.scheduled_releases;
create policy "Users update own scheduled_releases"
  on public.scheduled_releases for update
  using (auth.uid() = user_id);

drop policy if exists "Users delete own scheduled_releases" on public.scheduled_releases;
create policy "Users delete own scheduled_releases"
  on public.scheduled_releases for delete
  using (auth.uid() = user_id);
