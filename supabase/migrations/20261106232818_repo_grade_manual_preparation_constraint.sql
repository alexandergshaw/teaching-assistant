-- A manual claim has no preparation key. SQL evaluates NULL AND FALSE to
-- FALSE, so the original check rejected every manual claim instead of only
-- rejecting manual claims that supplied a preparation key.
alter table public.repo_grade_attempts
  drop constraint repo_grade_attempts_check3,
  add constraint repo_grade_attempts_preparation_key_check
    check (preparation_key is null or
      (mode <> 'manual' and preparation_key ~ '^[0-9a-f]{64}$'));
