alter table if exists public.course_hub
  add column if not exists end_date text null,
  add column if not exists breaks text null,
  add column if not exists assignment_due_rule text null,
  add column if not exists email text null,
  add column if not exists email_client text null;
