-- Scheduled publishing from Modules: let an instructor cancel a scheduled
-- release, and remember the published state its commit found so a cancel can
-- restore on FACT rather than assumption.
-- docs/scheduled-publishing-from-modules-acceptance-criteria.md, "F11.
-- Cancelling a scheduled release".
--
-- WHY CANCEL MUST RESTORE, NOT JUST STOP (F11.1). Committing a release
-- unpublishes the selected content immediately (F4) - visibility is hidden
-- the moment the instructor commits, long before the release instant. A
-- cancel that merely deletes or stops the row leaves every target hidden
-- PERMANENTLY, with no scheduled event left to ever reveal it again. The
-- instructor's mental model of "cancel" is undo; delivering "your content is
-- now invisible forever, silently" against that word is the worst thing this
-- feature could do. So cancelling must be able to restore the published
-- state the commit changed - and a target the commit found ALREADY
-- unpublished must be left alone, because restoring it would publish
-- something the instructor never had visible in the first place.
--
-- was_published (F11.2): the published state the COMMIT observed for this
-- target, persisted at write time so a later cancel acts on a recorded fact
-- rather than re-deriving or assuming one. NULLABLE, and NULL is not a
-- synonym for false: a row written before this column existed has no
-- recorded fact to restore from, and src/lib/scheduled-releases.ts's
-- consumers must cancel such a row WITHOUT attempting a restore, saying so
-- explicitly - never guessing "false" and silently skipping a restore that
-- may have been owed. Not backfilled, for the same reason
-- 20261009000000_scheduled_releases_module_id.sql did not backfill
-- module_id: there is nothing to backfill FROM, only a real absence of the
-- fact for rows written before it was ever captured.
--
-- cancelled AS A NEW TERMINAL STATUS, NOT A DELETE (F11.3). A row the cron
-- has already claimed is mid-flight - cancelling it out from under a claim
-- would race the publish - so cancel is a compare-and-set from 'pending' to
-- 'cancelled' only, the same CAS idiom claimScheduledRelease already uses to
-- move 'pending' to 'claimed'. A lost race (the row is no longer 'pending' by
-- the time the CAS runs) must report honestly that the release already ran or
-- is running, never silently do nothing. 'cancelled' joins 'done' and
-- 'failed' as a terminal status - kept rather than deleted so "what did I
-- call off, and when" stays answerable, the same reasoning entry 333 (see
-- docs/REGRESSION.md) applied to the gradebook audit trail.
--
-- THE STATUS CHECK CONSTRAINT MUST BE DROPPED AND RECREATED, NOT ALTERED IN
-- PLACE - Postgres has no ALTER CONSTRAINT for a CHECK's expression. The
-- constraint was declared inline in 20261008000000_scheduled_releases.sql
-- without an explicit name, so Postgres gave it the default name Postgres
-- always gives an inline column CHECK: <table>_<column>_check, i.e.
-- scheduled_releases_status_check - confirmed against this table's actual
-- name and column, not guessed. Dropped and recreated idempotently
-- (drop-if-exists, then add), following the exact shape
-- 20260909000000_workflow_run_logs.sql already used for workflow_runs'
-- status column.
--
-- RLS untouched: cancelling is an UPDATE, already covered by "Users update
-- own scheduled_releases" (20261008000000_scheduled_releases.sql). The cron
-- route's stale-claim sweep and the browser-facing cancel action both write
-- through that same policy (the cron route via the service-role client,
-- which bypasses RLS regardless).
--
-- Written idempotently.

alter table public.scheduled_releases
  add column if not exists was_published boolean;

comment on column public.scheduled_releases.was_published is
  'The published state the commit found for this target, persisted so cancel (F11) can restore on fact rather than assumption. NULL means the row was written before this column existed and must never be read as false - cancel must skip the restore attempt and say so, never guess.';

alter table public.scheduled_releases
  drop constraint if exists scheduled_releases_status_check;
alter table public.scheduled_releases
  add constraint scheduled_releases_status_check
  check (status in ('pending', 'claimed', 'done', 'failed', 'cancelled'));
