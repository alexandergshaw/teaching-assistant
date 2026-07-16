-- Presentation drafts: the durable output of the save-presentation-draft workflow step
-- and the "Save as draft" button in PowerPointDesignTab. Generated decks are persisted
-- here for later review and editing. This table only ever holds an unsaved draft.
-- Idempotent.

create table if not exists public.presentation_drafts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  status text not null default 'pending', -- 'pending' | 'reviewed'
  summary text not null default '', -- short human summary (e.g. "Presentation: Intro to React")
  payload jsonb not null default '{}'::jsonb, -- { presentationTitle, slides: [{title, bullets, code?, codeLanguage?}], templateName?, subject? }
  workflow_id text, -- which workflow produced this draft (if any)
  workflow_name text, -- display name of that workflow
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists presentation_drafts_user_created_idx
  on public.presentation_drafts (user_id, created_at);

alter table public.presentation_drafts enable row level security;

drop policy if exists "Users read own presentation_drafts" on public.presentation_drafts;
create policy "Users read own presentation_drafts"
  on public.presentation_drafts for select
  using (auth.uid() = user_id);

drop policy if exists "Users insert own presentation_drafts" on public.presentation_drafts;
create policy "Users insert own presentation_drafts"
  on public.presentation_drafts for insert
  with check (auth.uid() = user_id);

drop policy if exists "Users update own presentation_drafts" on public.presentation_drafts;
create policy "Users update own presentation_drafts"
  on public.presentation_drafts for update
  using (auth.uid() = user_id);

drop policy if exists "Users delete own presentation_drafts" on public.presentation_drafts;
create policy "Users delete own presentation_drafts"
  on public.presentation_drafts for delete
  using (auth.uid() = user_id);
