-- Per-schedule custom run frequency: when repeat = 'interval', the schedule
-- fires every interval_minutes minutes (configured in the app UI), instead of
-- the fixed daily/weekly cadences. Idempotent.

alter table public.workflow_schedules
  add column if not exists interval_minutes integer;
