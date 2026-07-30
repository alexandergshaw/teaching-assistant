-- Lets a saved workflow_defs row represent a USER'S OVERRIDE OF A CODE
-- PRESET, keyed by the preset's own id, instead of a separate duplicate row
-- with a freshly generated id ("Course Kickoff (no codebase) (copy)" - see
-- docs/REGRESSION.md #152/#153). A preset id is a plain slug ("course-
-- kickoff-no-code"), not a uuid, and two different users may each own their
-- own override of the SAME preset, so:
--
--   1. `id` widens from uuid to text - every existing value is already a
--      valid uuid string, which is also valid text, so no data changes.
--   2. The primary key widens from (id) to (user_id, id) - required so two
--      users can each have a row whose id is the same preset slug. Nothing
--      else has ever referenced workflow_defs.id via a foreign key
--      (workflow_schedules.workflow_id / workflow_triggers.workflow_id /
--      workflow_runs.workflow_id are plain text columns, not FKs - see
--      those tables' own migrations), so this is safe to widen.
--   3. `preset_overrides` carries the delta itself (see PresetOverrideDelta
--      in src/lib/workflows/types.ts) - null for a plain custom workflow
--      (including every pre-existing row, and any pre-existing "(copy)" -
--      those are deliberately left as ordinary custom workflows; nothing in
--      the data reliably ties an old copy back to the preset it came from,
--      so this migration does not guess).
--
-- Idempotent; safe to re-run.

alter table public.workflow_defs
  alter column id type text using id::text;

do $$
begin
  if exists (
    select 1 from pg_constraint
    where conname = 'workflow_defs_pkey'
      and conrelid = 'public.workflow_defs'::regclass
  ) then
    alter table public.workflow_defs drop constraint workflow_defs_pkey;
  end if;
end $$;

alter table public.workflow_defs
  add constraint workflow_defs_pkey primary key (user_id, id);

alter table public.workflow_defs
  add column if not exists preset_overrides jsonb;
