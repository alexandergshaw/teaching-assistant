-- Extend the course hub: support MULTIPLE codebases per course (a jsonb array of
-- { repo, branch }) and associate a GitHub organization with the course. Replaces
-- the single github_repo/github_branch columns added in the create migration.

alter table public.courses
  add column if not exists repos jsonb not null default '[]'::jsonb,
  add column if not exists github_org text;

-- Fold any existing single repo into the new repos array before dropping it.
update public.courses
  set repos = jsonb_build_array(jsonb_build_object('repo', github_repo, 'branch', github_branch))
  where github_repo is not null and github_repo <> '' and repos = '[]'::jsonb;

alter table public.courses
  drop column if exists github_repo,
  drop column if exists github_branch;
