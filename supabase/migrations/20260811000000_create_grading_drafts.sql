-- Grading drafts: the durable output of the unattended AI *scoring* step
-- (grade-to-draft). Grades reach Canvas ONLY through the app-open review
-- workflow (review-grading-draft -> post-grades) after the user approves
-- them in the review table - this table only ever holds an unposted draft.
-- Idempotent.

create table if not exists public.grading_drafts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  status text not null default 'pending', -- 'pending' | 'reviewed'
  summary text not null default '', -- short human summary (e.g. "3 assignments, 41 submissions")
  payload jsonb not null default '{}'::jsonb, -- { runs: RunEntry[] } with rawBase64 stripped - see AC17.3
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists grading_drafts_user_created_idx
  on public.grading_drafts (user_id, created_at);

alter table public.grading_drafts enable row level security;

drop policy if exists "Users read own grading_drafts" on public.grading_drafts;
create policy "Users read own grading_drafts"
  on public.grading_drafts for select
  using (auth.uid() = user_id);

drop policy if exists "Users insert own grading_drafts" on public.grading_drafts;
create policy "Users insert own grading_drafts"
  on public.grading_drafts for insert
  with check (auth.uid() = user_id);

drop policy if exists "Users update own grading_drafts" on public.grading_drafts;
create policy "Users update own grading_drafts"
  on public.grading_drafts for update
  using (auth.uid() = user_id);

drop policy if exists "Users delete own grading_drafts" on public.grading_drafts;
create policy "Users delete own grading_drafts"
  on public.grading_drafts for delete
  using (auth.uid() = user_id);
