-- Per-user grading notification preferences:
--   scope 'assignment' -> an assignment marked "seen" (hidden from the feed/badge)
--   scope 'course'     -> a course the user has stopped watching
-- Both hide items from the Live Feed and subtract from the needs-grading badge.
-- Written via the service-role client behind requireOwner(); reads also RLS-guarded.

create table if not exists public.grading_dismissals (
  user_id     uuid not null references auth.users (id) on delete cascade,
  scope       text not null check (scope in ('assignment', 'course')),
  institution text not null,
  ref_id      text not null,
  created_at  timestamptz not null default now(),
  primary key (user_id, scope, institution, ref_id)
);

alter table public.grading_dismissals enable row level security;

drop policy if exists "Users manage own grading dismissals" on public.grading_dismissals;
create policy "Users manage own grading dismissals"
  on public.grading_dismissals for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);
