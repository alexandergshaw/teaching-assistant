-- Scheduled publishing from Modules: store an item target's owning module id
-- on the row. docs/scheduled-publishing-from-modules-acceptance-criteria.md,
-- "F10. The target-set decision".
--
-- WHY THIS ARRIVES IN A SECOND MIGRATION, NOT THE FIRST. The original
-- migration (20261008000000_scheduled_releases.sql) deliberately kept the
-- target reference generic - (target_kind, target_id) only - because F9's
-- first highest-risk unknown (does an item published inside an UNPUBLISHED
-- module actually become visible to students?) was still open, and that
-- question decides whether releases would ever need to target modules,
-- items, or both. Adding a module id column at that point would have baked
-- in a guess about a question nobody had answered yet - see that migration's
-- own header for the long form.
--
-- F10 answered it (without running the experiment): releases target BOTH the
-- module and its items, because that is the only target set that is correct
-- regardless of which way F9's experiment eventually comes out. One direct
-- consequence F10 states explicitly: "module_id is now known at schedule
-- time for every item target, so it is stored on the row" - a module_item
-- target is always produced by walking an already-loaded module tree
-- (release-plan.ts's buildReleaseTargets), so its owning module id is simply
-- sitting right there when the row is written; nothing about it was ever
-- actually unknown, only unstored. Storing it closes the follow-up
-- REGRESSION entry 339 recorded in so many words: "the module id is known at
-- SCHEDULE time and could simply be stored on the row" - which removes the
-- runner's per-item `listModules` call (src/lib/release-runner.ts) entirely
-- on the normal path.
--
-- NULLABLE, AND NOT BACKFILLED. A module target has no owning module (the
-- target IS the module) - null there is a permanent, correct state, not a
-- gap. A module_item row written before this migration existed has no
-- module_id to backfill FROM: the (target_kind, target_id) pair alone does
-- not carry it, and this migration does not query Canvas retroactively to
-- fill old rows in. release-runner.ts keeps a fallback (the pre-F10
-- `listModules` lookup) for exactly that historical case, and only that
-- case - see that file's own comment for why it is never exercised on the
-- normal, F10-aware commit path.
--
-- Written idempotently.

alter table public.scheduled_releases
  add column if not exists module_id bigint;

comment on column public.scheduled_releases.module_id is
  'Owning module id for a module_item target, known at schedule time per F10 (docs/scheduled-publishing-from-modules-acceptance-criteria.md). Null for module targets (the target IS the module) and for rows written before this column existed.';
