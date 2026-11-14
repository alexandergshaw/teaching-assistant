-- Return the newest instructor review for one owned gradebook cell, including
-- its original attempt and revision. The current attempt is not changed.
create function public.repo_grade_latest_instructor_review(
  p_user_id uuid, p_course_id uuid, p_repo text, p_folder text
) returns jsonb language sql stable security invoker set search_path = '' as $$
  select jsonb_build_object('generation', r.generation, 'source_sha', r.source_sha,
    'source_ref', a.source_ref, 'score', r.score, 'feedback', r.feedback,
    'criteria', r.criteria, 'reviewed_at', r.reviewed_at)
  from public.repo_grade_instructor_reviews r
  join public.repo_grade_attempts a on a.generation = r.generation and a.user_id = r.user_id
  where r.user_id = p_user_id and a.course_id = p_course_id
    and lower(a.repo) = lower(p_repo) and a.folder = p_folder
  order by r.generation desc, r.review_id desc limit 1;
$$;
revoke all on function public.repo_grade_latest_instructor_review(uuid,uuid,text,text) from public, anon, authenticated, service_role;
grant execute on function public.repo_grade_latest_instructor_review(uuid,uuid,text,text) to service_role;
