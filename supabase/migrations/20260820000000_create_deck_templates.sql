-- Reusable presentation templates for the PowerPoint Design feature. Owner-scoped RLS; the browser reads and writes rows directly. Written idempotently.

create table if not exists public.deck_templates (
  id uuid primary key,
  user_id uuid not null references auth.users (id) on delete cascade,
  name text not null,
  description text not null default '',
  slides jsonb not null default '[]'::jsonb,
  loops jsonb not null default '[]'::jsonb,
  audience text not null default '',
  tone text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists deck_templates_user_idx
  on public.deck_templates (user_id, created_at desc);

alter table public.deck_templates enable row level security;

drop policy if exists "Users read own deck_templates" on public.deck_templates;
create policy "Users read own deck_templates"
  on public.deck_templates for select
  using (auth.uid() = user_id);

drop policy if exists "Users insert own deck_templates" on public.deck_templates;
create policy "Users insert own deck_templates"
  on public.deck_templates for insert
  with check (auth.uid() = user_id);

drop policy if exists "Users update own deck_templates" on public.deck_templates;
create policy "Users update own deck_templates"
  on public.deck_templates for update
  using (auth.uid() = user_id);

drop policy if exists "Users delete own deck_templates" on public.deck_templates;
create policy "Users delete own deck_templates"
  on public.deck_templates for delete
  using (auth.uid() = user_id);
