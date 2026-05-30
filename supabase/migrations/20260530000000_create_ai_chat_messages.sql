-- Migration: create ai_chat_messages table for logging user ↔ AI conversations.
--
-- Apply with:
--   supabase db push
-- or by pasting into the Supabase SQL editor.

create table if not exists public.ai_chat_messages (
  id           uuid primary key default gen_random_uuid(),
  created_at   timestamptz not null default now(),
  -- Nullable so anonymous (unauthenticated) sessions can still be logged.
  user_id      uuid references auth.users (id) on delete cascade,
  -- Groups all turns of one conversation window together.
  session_id   uuid not null,
  -- 'fab' = floating action-button chat, 'selection' = text-selection chat.
  source       text not null check (source in ('fab', 'selection')),
  role         text not null check (role in ('user', 'assistant')),
  content      text not null,
  -- The text the user had highlighted when they opened a 'selection' chat.
  context_text text
);

-- Row-level security
alter table public.ai_chat_messages enable row level security;

-- Authenticated users may only read their own messages.
create policy "ai_chat_messages_select_own"
  on public.ai_chat_messages for select
  using (auth.uid() = user_id);

-- Inserts are performed server-side (service role / server actions).
-- No client-side insert policy is needed; the service role bypasses RLS.
