-- Keep the newest proven no-submission result per gradebook cell even when a
-- later targeted run covers a different cell. Later inconclusive statuses do
-- not erase a known result; the caller compares saved receipts before display.
create index if not exists repo_grade_automatic_targets_course_cell_idx
  on public.repo_grade_automatic_targets (course_id, lower(repo), folder, run_id);

create or replace function public.repo_grade_latest_no_submission_targets(p_user_id uuid, p_course_id uuid)
returns jsonb
language sql stable security invoker set search_path = ''
as $$
  with latest as (
    select distinct on (lower(t.repo), t.folder)
      t.repo, t.folder, t.source_ref, t.source_sha, t.state, t.reason, r.created_at as run_started_at
    from public.repo_grade_automatic_targets t
    join public.repo_grade_automatic_runs r on r.id = t.run_id
    join public.course_hub c on c.id = t.course_id and c.user_id = r.user_id
    where r.user_id = p_user_id and t.course_id = p_course_id
      and t.state in ('succeeded', 'no-submission')
    order by lower(t.repo), t.folder, r.created_at desc, r.id desc, t.id desc
  ), observed as (
    select distinct on (lower(t.repo), t.folder)
      t.repo, t.folder, t.source_ref, t.source_sha, t.state, r.created_at as run_started_at
    from public.repo_grade_automatic_targets t
    join public.repo_grade_automatic_runs r on r.id = t.run_id
    join public.course_hub c on c.id = t.course_id and c.user_id = r.user_id
    where r.user_id = p_user_id and t.course_id = p_course_id
    order by lower(t.repo), t.folder, r.created_at desc, r.id desc, t.id desc
  ), empty_targets as (
    select latest.repo, latest.folder, latest.source_ref, latest.source_sha, latest.run_started_at, latest.reason,
      observed.source_ref as observed_source_ref, observed.source_sha as observed_source_sha,
      observed.state as observed_state, observed.run_started_at as observed_run_started_at
    from latest join observed on lower(observed.repo) = lower(latest.repo) and observed.folder = latest.folder
    where latest.state = 'no-submission'
  ), bounded as (
    select * from empty_targets order by repo, folder limit 1000
  )
  select jsonb_build_object(
    'total', (select count(*) from empty_targets),
    'targets', coalesce((select jsonb_agg(to_jsonb(bounded)) from bounded), '[]'::jsonb)
  );
$$;

revoke all on function public.repo_grade_latest_no_submission_targets(uuid, uuid) from public, anon, authenticated;
grant execute on function public.repo_grade_latest_no_submission_targets(uuid, uuid) to service_role;
