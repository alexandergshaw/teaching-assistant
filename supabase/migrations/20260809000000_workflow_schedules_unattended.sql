-- Unattended (headless) scheduled workflow runs: an opt-in flag plus the
-- provider and disabled-step snapshots a Vercel Cron run needs to reproduce
-- the run form exactly as it stood when the schedule was created, since a
-- cron invocation has no browser/localStorage to read them from. Idempotent.
-- Existing rows have no `unattended` value and default to false, so they
-- stay app-open-only and behave exactly as before this migration.

alter table public.workflow_schedules add column if not exists unattended boolean not null default false;
alter table public.workflow_schedules add column if not exists provider text;
alter table public.workflow_schedules add column if not exists disabled_steps jsonb not null default '[]'::jsonb;
