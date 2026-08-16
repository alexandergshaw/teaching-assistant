-- Add items to modules on an export-only course
-- (docs/export-module-additions-acceptance-criteria.md): ONE new nullable
-- jsonb column on course_hub, single-writer (updateCourseExportModuleAdditions,
-- src/lib/supabase/courses.ts), unversioned in the SQL sense (the jsonb
-- itself carries its own `v: 1` format tag - see
-- src/lib/export-module-additions.ts) and always read with the course,
-- exactly like course_project, student_repos and repo_module_pairing before
-- it - not a new table: the data is one small blob per course, and a table
-- would need its own RLS, module and cascade for no benefit.
--
-- Shape (coerceExportModuleAdditions, src/lib/export-module-additions.ts):
--   { v: 1, additions: [{ id, moduleRef, title, type, body?, addedAt }] }
-- `moduleRef` is a CartridgeModule.identifier (docs/REGRESSION.md entry 303 -
-- stable across re-parses of the same export bytes), never array position or
-- a hash.
--
-- Nullable jsonb, no default: every course created before this column
-- existed has no additions, and coerceExportModuleAdditions(null) already
-- reads back as the empty value ({ v: 1, additions: [] }) at zero migration
-- cost - there is nothing meaningful to backfill.
--
-- Written idempotently.

alter table public.course_hub
  add column if not exists export_module_additions jsonb;
