-- Recording files: metadata for videos recorded/edited in the Recording tab.
-- Bytes live in the private "recordings" storage bucket under a per-user folder.
-- Owner-scoped RLS; browser uploads directly to Storage so large videos never
-- pass through server actions. Written idempotently.

create table if not exists public.recording_files (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  name text not null,
  kind text not null default 'recording' check (kind in ('recording', 'captioned')),
  mime_type text not null default 'video/webm',
  size_bytes bigint not null default 0,
  duration_sec double precision,
  storage_path text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists recording_files_user_idx
  on public.recording_files (user_id, created_at desc);

alter table public.recording_files enable row level security;

drop policy if exists "Users read own recording_files" on public.recording_files;
create policy "Users read own recording_files"
  on public.recording_files for select
  using (auth.uid() = user_id);

drop policy if exists "Users insert own recording_files" on public.recording_files;
create policy "Users insert own recording_files"
  on public.recording_files for insert
  with check (auth.uid() = user_id);

drop policy if exists "Users update own recording_files" on public.recording_files;
create policy "Users update own recording_files"
  on public.recording_files for update
  using (auth.uid() = user_id);

drop policy if exists "Users delete own recording_files" on public.recording_files;
create policy "Users delete own recording_files"
  on public.recording_files for delete
  using (auth.uid() = user_id);

insert into storage.buckets (id, name, public)
  values ('recordings', 'recordings', false)
  on conflict (id) do nothing;

drop policy if exists "Users read own recording objects" on storage.objects;
create policy "Users read own recording objects"
  on storage.objects for select
  using (bucket_id = 'recordings' and (storage.foldername(name))[1] = auth.uid()::text);

drop policy if exists "Users insert own recording objects" on storage.objects;
create policy "Users insert own recording objects"
  on storage.objects for insert
  with check (bucket_id = 'recordings' and (storage.foldername(name))[1] = auth.uid()::text);

drop policy if exists "Users update own recording objects" on storage.objects;
create policy "Users update own recording objects"
  on storage.objects for update
  using (bucket_id = 'recordings' and (storage.foldername(name))[1] = auth.uid()::text)
  with check (bucket_id = 'recordings' and (storage.foldername(name))[1] = auth.uid()::text);

drop policy if exists "Users delete own recording objects" on storage.objects;
create policy "Users delete own recording objects"
  on storage.objects for delete
  using (bucket_id = 'recordings' and (storage.foldername(name))[1] = auth.uid()::text);
