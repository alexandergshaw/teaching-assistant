-- Multi-day weekly schedules: workflow_schedules.days_of_week lets a weekly
-- schedule fire on more than one weekday (e.g. Fri/Sat/Sun), stored as
-- integers 0=Sunday..6=Saturday.
--
-- Nullable, no default (deliberately NOT "not null default '{}'"): every
-- weekly schedule created before this column existed already encodes its
-- single firing day implicitly in next_run_at's weekday - there was never an
-- explicit day selection to backfill. Application code (mapSchedule /
-- computeNextRunAt in src/lib/workflow-schedules.ts) defines an empty/absent
-- array as "no explicit multi-day selection - keep using the day implied by
-- next_run_at", so every pre-existing row must read back that way rather
-- than a default silently claiming a concrete day set for it. A plain
-- nullable column with no default gets existing rows to null (mapped to []
-- by the reader) at zero migration cost, with no rewrite of their meaning.
--
-- Written idempotently.

alter table public.workflow_schedules
  add column if not exists days_of_week integer[];
