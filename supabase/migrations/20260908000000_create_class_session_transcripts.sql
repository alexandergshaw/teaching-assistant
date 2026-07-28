-- Class session transcripts: one row per live class, holding the running
-- transcript and every question the class-mode assistant detected and
-- answered while the class was live.
--
-- segments and answered are jsonb arrays rather than child tables: the
-- browser appends small batches (a handful of transcript segments, an
-- occasional answered question) throughout a live class and always reads
-- the transcript back whole for display, never a slice of it. A child table
-- would turn each append into an extra insert round trip and each read into
-- a join, for a table that is written by exactly one browser tab and never
-- queried by anything but its own id - no benefit for the added complexity.
-- Owner-scoped RLS; the browser reads and writes rows directly. Written
-- idempotently.

create table if not exists public.class_session_transcripts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  course_id uuid references public.course_hub (id) on delete set null,
  title text not null default '',
  module_name text not null default '',
  status text not null default 'live' check (status in ('live', 'ended', 'error')),
  started_at timestamptz not null default now(),
  ended_at timestamptz,
  segments jsonb not null default '[]'::jsonb,
  answered jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists class_session_transcripts_user_idx
  on public.class_session_transcripts (user_id, started_at desc);

alter table public.class_session_transcripts enable row level security;

drop policy if exists "Users read own class_session_transcripts" on public.class_session_transcripts;
create policy "Users read own class_session_transcripts"
  on public.class_session_transcripts for select
  using (auth.uid() = user_id);

drop policy if exists "Users insert own class_session_transcripts" on public.class_session_transcripts;
create policy "Users insert own class_session_transcripts"
  on public.class_session_transcripts for insert
  with check (auth.uid() = user_id);

drop policy if exists "Users update own class_session_transcripts" on public.class_session_transcripts;
create policy "Users update own class_session_transcripts"
  on public.class_session_transcripts for update
  using (auth.uid() = user_id);

drop policy if exists "Users delete own class_session_transcripts" on public.class_session_transcripts;
create policy "Users delete own class_session_transcripts"
  on public.class_session_transcripts for delete
  using (auth.uid() = user_id);
