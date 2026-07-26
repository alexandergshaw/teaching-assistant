-- Reusable artifact templates shared by the assignment / test / discussion / quiz /
-- class-session families via a `kind` discriminator (one table, not five).
-- Owner-scoped RLS; the browser reads and writes rows directly. Written idempotently.

create table if not exists public.artifact_templates (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users on delete cascade,
  kind text not null,
  name text not null default '',
  description text not null default '',
  spec jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists artifact_templates_user_kind_idx
  on public.artifact_templates (user_id, kind, created_at desc);

alter table public.artifact_templates enable row level security;

drop policy if exists "Users read own artifact_templates" on public.artifact_templates;
create policy "Users read own artifact_templates"
  on public.artifact_templates for select
  using (auth.uid() = user_id);

drop policy if exists "Users insert own artifact_templates" on public.artifact_templates;
create policy "Users insert own artifact_templates"
  on public.artifact_templates for insert
  with check (auth.uid() = user_id);

drop policy if exists "Users update own artifact_templates" on public.artifact_templates;
create policy "Users update own artifact_templates"
  on public.artifact_templates for update
  using (auth.uid() = user_id);

drop policy if exists "Users delete own artifact_templates" on public.artifact_templates;
create policy "Users delete own artifact_templates"
  on public.artifact_templates for delete
  using (auth.uid() = user_id);
