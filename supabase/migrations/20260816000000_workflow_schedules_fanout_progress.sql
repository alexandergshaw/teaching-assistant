-- Per-institution fan-out checkpoint for unattended runs. When an institution
-- fan-out is truncated mid-way (the server-runner soft deadline, or a Vercel
-- maxDuration hard-kill), this records which institutions already ran this
-- occurrence so the NEXT cron tick resumes the remainder instead of re-running
-- (and re-posting announcements for) the ones already completed. NULL means no
-- fan-out is in flight. Idempotent.
alter table public.workflow_schedules
  add column if not exists fanout_progress jsonb;
