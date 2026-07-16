-- Message drafts: the durable output of the save-message-draft workflow step.
-- Drafted messages (replies and announcements) are persisted here for later
-- review and sending. This table only ever holds an unsent draft.
-- Idempotent.

create table if not exists public.message_drafts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  status text not null default 'pending', -- 'pending' | 'reviewed'
  summary text not null default '', -- short human summary (e.g. "Drafted reply")
  payload jsonb not null default '{}'::jsonb, -- { kind, body, conversationId?, courseUrl?, title?, institution?, context? }
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists message_drafts_user_created_idx
  on public.message_drafts (user_id, created_at);

alter table public.message_drafts enable row level security;

drop policy if exists "Users read own message_drafts" on public.message_drafts;
create policy "Users read own message_drafts"
  on public.message_drafts for select
  using (auth.uid() = user_id);

drop policy if exists "Users insert own message_drafts" on public.message_drafts;
create policy "Users insert own message_drafts"
  on public.message_drafts for insert
  with check (auth.uid() = user_id);

drop policy if exists "Users update own message_drafts" on public.message_drafts;
create policy "Users update own message_drafts"
  on public.message_drafts for update
  using (auth.uid() = user_id);

drop policy if exists "Users delete own message_drafts" on public.message_drafts;
create policy "Users delete own message_drafts"
  on public.message_drafts for delete
  using (auth.uid() = user_id);
