-- Bind new coordinated attempts to the saved course/folder and immutable rubric.
-- Existing history remains readable. Attempts that predate cohort binding cannot
-- recover an exact rubric and are intentionally excluded from the recovery RPC.
alter table public.repo_grade_attempts
  add column cohort_id uuid,
  add column configuration_fingerprint text check (configuration_fingerprint ~ '^[0-9a-f]{64}$'),
  add column rubric_fingerprint text check (rubric_fingerprint ~ '^[0-9a-f]{64}$'),
  add constraint repo_grade_attempts_receipt_fk
    foreign key (course_id, user_id, folder, cohort_id)
    references public.repo_grade_rubric_receipts (course_id, user_id, folder, cohort_id) on delete cascade,
  add constraint repo_grade_attempts_cohort_complete check (
    (cohort_id is null and configuration_fingerprint is null and rubric_fingerprint is null)
    or (mode <> 'manual' and cohort_id is not null
      and configuration_fingerprint is not null and rubric_fingerprint is not null)
  );

-- Remove the earlier fingerprint-only admission entry point.
drop function public.repo_grade_claim(uuid, uuid, text, text, text, text, text, text, jsonb);

create function public.repo_grade_claim(
  p_user_id uuid, p_course_id uuid, p_repo text, p_folder text, p_mode text,
  p_source_ref text, p_source_sha text, p_course_config jsonb,
  p_cohort_id uuid, p_receipt jsonb
) returns jsonb language plpgsql security invoker set search_path = '' as $$
declare
  new_attempt public.repo_grade_attempts;
  course_row public.course_hub;
  frozen public.repo_grade_rubric_receipts;
begin
  if p_user_id is null or p_mode is null or p_mode not in ('automatic', 'manual', 'retry') then
    raise exception 'invalid repo grade claim';
  end if;
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('repo-grade:' || p_user_id::text, 0));
  if p_course_id is not null then
    select * into course_row from public.course_hub c
      where c.id = p_course_id and c.user_id = p_user_id for share;
    if not found then return jsonb_build_object('status', 'forbidden'); end if;
  end if;
  -- Compare the raw saved inputs used by planning, while holding the course
  -- row lock. Course timestamps are application-assigned and can collide.
  if p_mode <> 'manual' and (
    p_course_id is null
    or p_course_config is distinct from jsonb_build_object(
      'github_org', course_row.github_org, 'repos', course_row.repos,
      'rubric_name', course_row.rubric_name, 'rubric_data', course_row.rubric_data,
      'repo_module_pairing', course_row.repo_module_pairing, 'student_repos', course_row.student_repos
    )
    or nullif(btrim(course_row.github_org), '') is null
    or lower(btrim(course_row.github_org)) is distinct from lower(split_part(p_repo, '/', 1))
  ) then return jsonb_build_object('status', 'configuration-changed'); end if;

  if p_mode <> 'manual' then
    select r.* into frozen
      from public.repo_grade_current_profiles c
      join public.repo_grade_profile_versions v using (course_id, user_id, folder, configuration_fingerprint)
      join public.repo_grade_rubric_receipts r using (course_id, user_id, folder, configuration_fingerprint)
      where c.user_id = p_user_id and c.course_id = p_course_id and c.folder = p_folder
        and r.cohort_id = p_cohort_id and r.receipt = p_receipt
        and (v.profile ->> 'sourceRef' is null or v.profile ->> 'sourceRef' = p_source_ref);
    if not found then return jsonb_build_object('status', 'configuration-changed'); end if;
  end if;

  update public.repo_grade_attempts
     set status = 'unknown', settled_at = clock_timestamp()
   where user_id = p_user_id and status = 'claimed'
     and claimed_at <= clock_timestamp() - interval '15 minutes';

  if p_mode = 'automatic' and exists (
    select 1 from public.repo_grade_attempts a
    where a.user_id = p_user_id and a.course_id = p_course_id and lower(a.repo) = lower(p_repo)
      and a.source_ref = p_source_ref and a.source_sha = p_source_sha and a.folder = p_folder
      and a.mode <> 'manual' and a.status in ('succeeded', 'no-submission')
  ) then return jsonb_build_object('status', 'terminal'); end if;

  if exists (
    select 1 from public.repo_grade_reservations r
    left join public.repo_grade_attempts a on a.generation = r.generation and a.user_id = r.user_id
    where r.user_id = p_user_id and (
      a.generation is null
      or (lower(a.repo) = lower(p_repo)
        and (a.course_id is null or p_course_id is null or a.course_id = p_course_id
          or a.mode = 'manual' or p_mode = 'manual')
        and (a.folder is null or p_folder is null or a.folder = p_folder))
    )
  ) then return jsonb_build_object('status', 'busy'); end if;

  if p_mode = 'automatic' and exists (
    select 1 from public.repo_grade_attempts a
    where a.user_id = p_user_id and a.course_id = p_course_id and lower(a.repo) = lower(p_repo)
      and a.source_ref = p_source_ref and a.source_sha = p_source_sha and a.folder = p_folder
      and a.mode <> 'manual'
  ) then return jsonb_build_object('status', 'explicit-retry-required'); end if;

  if (select count(*) from public.repo_grade_reservations r where r.user_id = p_user_id) >= 3
  then return jsonb_build_object('status', 'capacity'); end if;

  insert into public.repo_grade_attempts (
    user_id, course_id, repo, folder, mode, source_ref, source_sha,
    cohort_id, configuration_fingerprint, rubric_fingerprint, profile_fingerprint
  ) values (
    p_user_id, p_course_id, p_repo, p_folder, p_mode, p_source_ref, p_source_sha,
    frozen.cohort_id, frozen.configuration_fingerprint,
    frozen.receipt ->> 'rubricFingerprint', frozen.receipt ->> 'profileFingerprint'
  )
  returning * into new_attempt;
  insert into public.repo_grade_reservations (generation, user_id) values (new_attempt.generation, p_user_id);
  return jsonb_build_object('status', 'claimed', 'generation', new_attempt.generation, 'token', new_attempt.claim_token);
end;
$$;

-- Recovery deliberately reads the historical profile. A subsequent claim must
-- still pass the current-profile gate above, even when it uses this receipt.
create function public.repo_grade_read_attempt_profile(
  p_user_id uuid, p_course_id uuid, p_folder text, p_generation bigint
) returns jsonb language sql stable security invoker set search_path = '' as $$
  select jsonb_build_object(
    'cohortId', a.cohort_id, 'configurationFingerprint', a.configuration_fingerprint,
    'rubricFingerprint', a.rubric_fingerprint, 'profileFingerprint', a.profile_fingerprint,
    'profile', v.profile, 'receipt', r.receipt
  )
    from public.repo_grade_attempts a
    join public.repo_grade_rubric_receipts r using (course_id, user_id, folder, cohort_id, configuration_fingerprint)
    join public.repo_grade_profile_versions v using (course_id, user_id, folder, configuration_fingerprint)
    where a.generation = p_generation and a.user_id = p_user_id and a.course_id = p_course_id
      and a.folder = p_folder and a.mode <> 'manual'
      and r.receipt ->> 'rubricFingerprint' = a.rubric_fingerprint
      and r.receipt ->> 'profileFingerprint' = a.profile_fingerprint;
$$;

revoke all on function public.repo_grade_claim(uuid, uuid, text, text, text, text, text, jsonb, uuid, jsonb),
  public.repo_grade_read_attempt_profile(uuid, uuid, text, bigint) from public, anon, authenticated;
grant execute on function public.repo_grade_claim(uuid, uuid, text, text, text, text, text, jsonb, uuid, jsonb),
  public.repo_grade_read_attempt_profile(uuid, uuid, text, bigint) to service_role;
