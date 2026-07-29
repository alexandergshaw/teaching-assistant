-- Weekly Checklist column: an ordered list of recurring checklist items per
-- course, each with a stable id, a label, an optional weekly deadline (day
-- of week 0=Sunday..6=Saturday - matching workflow_schedules.days_of_week's
-- convention, see 20260911000000_add_schedule_days_of_week.sql - plus an
-- optional time), and a checked flag.
--
-- Checked state is PERSISTENT: the app never auto-resets it on any weekly
-- cadence. See coerceWeeklyChecklist / resetAllWeeklyChecklistChecks in
-- src/lib/weekly-checklist.ts - the instructor clears a course's checks
-- explicitly, per course, via the cell's "Reset all" control.
--
-- Nullable jsonb, no default: every course created before this column
-- existed has no checklist, and coerceWeeklyChecklist(null) already reads
-- back as [] at zero migration cost - there is nothing meaningful to
-- backfill.
--
-- Written idempotently.

alter table public.course_hub
  add column if not exists weekly_checklist jsonb;
