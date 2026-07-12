-- Common Resources: the user's reusable Starter-module structure (library files + authored pages). Owner-scoped RLS; the browser reads and writes the single row directly. Written idempotently.

create table if not exists public.common_resources (
  user_id uuid primary key references auth.users (id) on delete cascade,
  items jsonb not null default '[]'::jsonb,
  updated_at timestamptz not null default now()
);

alter table public.common_resources enable row level security;

drop policy if exists "Users read own common_resources" on public.common_resources;
create policy "Users read own common_resources"
  on public.common_resources for select
  using (auth.uid() = user_id);

drop policy if exists "Users insert own common_resources" on public.common_resources;
create policy "Users insert own common_resources"
  on public.common_resources for insert
  with check (auth.uid() = user_id);

drop policy if exists "Users update own common_resources" on public.common_resources;
create policy "Users update own common_resources"
  on public.common_resources for update
  using (auth.uid() = user_id);

drop policy if exists "Users delete own common_resources" on public.common_resources;
create policy "Users delete own common_resources"
  on public.common_resources for delete
  using (auth.uid() = user_id);
