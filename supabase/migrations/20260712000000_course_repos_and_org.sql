-- Extend the course hub: support MULTIPLE codebases per course (a jsonb array of
-- { repo, branch }) and associate a GitHub organization. Written to be idempotent
-- and self-guarding: a safe no-op on a courses table that already has the final
-- schema (from the create migration), and a correct upgrade for a table that
-- still has the single github_repo/github_branch columns.

alter table public.courses add column if not exists repos jsonb not null default '[]'::jsonb;
alter table public.courses add column if not exists github_org text;

-- Fold any existing single repo into the new repos array, only when the legacy
-- github_repo column is still present (guarded so the reference cannot error).
do $$
begin
  if exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'courses' and column_name = 'github_repo'
  ) then
    update public.courses
      set repos = jsonb_build_array(jsonb_build_object('repo', github_repo, 'branch', github_branch))
      where github_repo is not null and github_repo <> '' and repos = '[]'::jsonb;
  end if;
end $$;

alter table public.courses drop column if exists github_repo;
alter table public.courses drop column if exists github_branch;
