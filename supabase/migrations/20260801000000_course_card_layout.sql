-- Course-card layout (per-user tile groups/order) and per-course custom tiles. Idempotent.

create table if not exists public.course_card_layout (
  user_id uuid primary key references auth.users (id) on delete cascade,
  groups jsonb not null default '[]'::jsonb,
  updated_at timestamptz not null default now()
);

alter table public.course_card_layout enable row level security;

drop policy if exists "Users read own course_card_layout" on public.course_card_layout;
create policy "Users read own course_card_layout"
  on public.course_card_layout for select
  using (auth.uid() = user_id);

drop policy if exists "Users insert own course_card_layout" on public.course_card_layout;
create policy "Users insert own course_card_layout"
  on public.course_card_layout for insert
  with check (auth.uid() = user_id);

drop policy if exists "Users update own course_card_layout" on public.course_card_layout;
create policy "Users update own course_card_layout"
  on public.course_card_layout for update
  using (auth.uid() = user_id);

drop policy if exists "Users delete own course_card_layout" on public.course_card_layout;
create policy "Users delete own course_card_layout"
  on public.course_card_layout for delete
  using (auth.uid() = user_id);

alter table public.course_hub add column if not exists custom_tiles jsonb not null default '[]'::jsonb;
