-- Grades Due column: a single CALENDAR DATE (nullable) - when final grades
-- are due for the course - plus an optional companion clock time. This is
-- deliberately NOT the recurring day-of-week shape assignment_due_rule uses
-- (see src/lib/assignment-due-rule.ts): final grades are due once, on one
-- date, at the end of the term - they do not repeat every week the way an
-- assignment deadline does.
--
-- Two plain scalar columns rather than one encoded string (contrast with
-- assignment_due_rule's single "day|time" string): a real calendar date
-- benefits from staying a native, directly sortable value, and the two
-- columns can be coerced/degraded independently on a malformed read (see
-- src/lib/grades-due.ts) rather than one bad half poisoning the other.
--
-- Nullable, no default: every course created before this column existed has
-- no grades-due date, and there is nothing meaningful to backfill.
--
-- Written idempotently.

alter table public.course_hub
  add column if not exists grades_due_date date,
  add column if not exists grades_due_time text;
