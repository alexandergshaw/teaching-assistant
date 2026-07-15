-- Workflow-level targets ("This workflow is for"): the institution / course
-- tiles / Canvas courses / GitHub orgs a whole custom workflow is for, so its
-- entity inputs are not asked at run time and unattended runs need no prompt.
-- Stored as a small jsonb map ({ institution?, hubCourse?, lmsCourse?, org? });
-- existing rows default to an empty object (no targets). Idempotent.

alter table public.workflow_defs
  add column if not exists scope jsonb not null default '{}'::jsonb;
