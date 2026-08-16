-- Durable repo-to-module associations
-- (docs/durable-repo-module-associations-acceptance-criteria.md): ONE new
-- nullable jsonb column on course_hub, single-writer (updateCourseRepoPairing,
-- src/lib/supabase/courses.ts), unversioned in the SQL sense (the jsonb
-- itself carries its own `v: 1` format tag - see
-- src/lib/repo-module-pairing.ts) and always read with the course, exactly
-- like course_project and student_repos before it - not a new table: the
-- data is one small blob per course, and a table would need its own RLS,
-- module and cascade for no benefit.
--
-- Shape (coerceRepoModulePairing, src/lib/repo-module-pairing.ts):
--   { v: 1, repoRef, branch,
--     associations: [{ path, kind: "folder" | "file", moduleId, boundAt }] }
--
-- Nullable jsonb, no default: every course created before this column
-- existed has no pairing, and coerceRepoModulePairing(null) already reads
-- back as the empty pairing ({ v: 1, repoRef: "", branch: "", associations:
-- [] }) at zero migration cost - there is nothing meaningful to backfill.
--
-- Written idempotently.

alter table public.course_hub
  add column if not exists repo_module_pairing jsonb;
