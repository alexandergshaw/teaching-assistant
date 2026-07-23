-- Track stale-claim recovery attempts so the cron sweep retries an
-- interrupted unattended occurrence at most once instead of looping forever.
alter table if exists public.workflow_schedules add column if not exists recovery_attempts integer not null default 0;
alter table if exists public.workflow_triggers add column if not exists recovery_attempts integer not null default 0;
