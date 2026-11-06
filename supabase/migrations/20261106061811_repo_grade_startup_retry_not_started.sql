-- A later opening may recapture a definitively not-started selector from a
-- closed or expired batch. Keep its original marker for history. A linked
-- attempt or an unresolved marker still fences the selector across openings.

create or replace function public.repo_grade_stage_startup(
  p_user_id uuid, p_batch_id uuid, p_course_id uuid, p_targets jsonb
) returns jsonb language plpgsql security invoker set search_path = '' as $$
declare
  skipped jsonb;
  now_at timestamptz;
begin
  if jsonb_typeof(p_targets) is distinct from 'array' or jsonb_array_length(p_targets) > 1000 then
    raise exception 'invalid startup plan';
  end if;
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('repo-grade:' || p_user_id::text, 0));
  now_at := clock_timestamp();
  perform 1 from public.course_hub where id = p_course_id and user_id = p_user_id for key share;
  if not found then raise exception 'startup course unavailable'; end if;

  delete from public.repo_grade_startup_batches
    where user_id = p_user_id and sealed_at is null and created_at < clock_timestamp() - interval '1 hour';
  insert into public.repo_grade_startup_batches (user_id, id) values (p_user_id, p_batch_id)
    on conflict do nothing;
  if exists (select 1 from public.repo_grade_startup_batches
    where user_id = p_user_id and id = p_batch_id and sealed_at is not null)
  then raise exception 'startup batch already sealed'; end if;

  delete from public.repo_grade_startup_targets
    where user_id = p_user_id and batch_id = p_batch_id and course_id = p_course_id;
  with candidates as (
    select distinct target.*, prior.state as captured
    from jsonb_to_recordset(p_targets) as target(repo text, folder text, ref text, sha text)
    left join lateral (
      select case
        when a.status = 'claimed' then case
          when b.closed_at is null and b.expires_at > now_at and a.claimed_at > now_at - interval '15 minutes'
            then 'claimed' else 'unknown' end
        when a.status is not null then a.status
        when t.unlinked_status = 'already-processed' then 'terminal'
        when t.unlinked_status is not null then t.unlinked_status
        when t.started_at is not null then 'unknown'
        else 'claimed'
      end as state
      from public.repo_grade_startup_targets t
      join public.repo_grade_startup_batches b on b.user_id = t.user_id and b.id = t.batch_id
      left join public.repo_grade_attempts a on a.generation = t.attempt_generation and a.user_id = t.user_id
      where t.user_id = p_user_id and t.course_id = p_course_id and b.sealed_at is not null
        and lower(t.repo) = lower(target.repo) and t.source_sha = target.sha and t.folder = target.folder
        and ((b.closed_at is null and b.expires_at > now_at)
          or (t.started_at is not null
            and (t.attempt_generation is not null or t.unlinked_status is distinct from 'not-started')))
      order by (t.started_at is not null) desc, b.sealed_at desc, b.id desc
      limit 1
    ) prior on true
  ), installed as (
    insert into public.repo_grade_startup_targets (user_id, batch_id, course_id, repo, folder, source_ref, source_sha)
      select p_user_id, p_batch_id, p_course_id, repo, folder, ref, sha from candidates where captured is null
    returning 1
  )
  select coalesce(jsonb_agg(jsonb_build_object('repo', repo, 'folder', folder, 'ref', ref, 'sha', sha,
    'state', captured)), '[]'::jsonb)
    into skipped from candidates where captured is not null;
  return skipped;
end;
$$;

create or replace function public.repo_grade_seal_startup(p_user_id uuid, p_batch_id uuid, p_count integer)
returns boolean language plpgsql security invoker set search_path = '' as $$
declare
  now_at timestamptz;
begin
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('repo-grade:' || p_user_id::text, 0));
  now_at := clock_timestamp();
  if p_count is null or p_count < 1 or p_count > 1000 or exists (
    select 1 from public.repo_grade_startup_batches
    where user_id = p_user_id and sealed_at is not null and closed_at is null and expires_at > now_at
  ) then return false; end if;
  if (select count(*) from public.repo_grade_startup_targets where user_id = p_user_id and batch_id = p_batch_id) <> p_count
    or exists (
      select 1 from public.repo_grade_startup_targets t
      join public.repo_grade_startup_targets prior on prior.user_id = t.user_id and prior.course_id = t.course_id
        and lower(prior.repo) = lower(t.repo) and prior.source_sha = t.source_sha and prior.folder = t.folder
      join public.repo_grade_startup_batches b on b.user_id = prior.user_id and b.id = prior.batch_id
      where t.user_id = p_user_id and t.batch_id = p_batch_id and b.sealed_at is not null
        and ((b.closed_at is null and b.expires_at > now_at)
          or (prior.started_at is not null
            and (prior.attempt_generation is not null or prior.unlinked_status is distinct from 'not-started')))
    ) then return false; end if;
  update public.repo_grade_startup_batches set sealed_at = now_at, expires_at = now_at + interval '15 minutes'
    where user_id = p_user_id and id = p_batch_id and sealed_at is null;
  return found;
end;
$$;
