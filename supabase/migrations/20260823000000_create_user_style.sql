-- Stores the owner's voice clone settings and writing style sample.
-- Voice: stores the cloned ElevenLabs voice ID and the path to the recorded sample file.
-- Writing: stores a sample of the user's natural writing for style matching.
-- One row per user; Writes use the service-role client from trusted server actions;
-- reads are protected by RLS.

create table if not exists public.user_style (
  user_id uuid not null primary key references auth.users (id) on delete cascade,
  voice_id text null,
  voice_sample_path text null,
  voice_sample_name text null,
  writing_sample text null,
  updated_at timestamptz not null default now()
);

alter table public.user_style enable row level security;

drop policy if exists "Users read own user_style" on public.user_style;
create policy "Users read own user_style"
  on public.user_style for select
  using (auth.uid() = user_id);

drop policy if exists "Users delete own user_style" on public.user_style;
create policy "Users delete own user_style"
  on public.user_style for delete
  using (auth.uid() = user_id);
