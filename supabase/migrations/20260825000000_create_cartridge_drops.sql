-- Cartridge drops: centralized submission archives for closed/LMS-less courses.
-- Bytes live in the private "cartridge-drops" storage bucket under a per-user folder.
-- Owner-scoped RLS; browser uploads directly to Storage.
-- Workflow trigger fires when new drops appear; triggered workflow grades each drop
-- and produces a gradebook CSV ready to upload, plus a reviewable grading draft.
-- Written idempotently.

create table if not exists public.cartridge_drops (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  name text not null,
  course_label text not null default '',
  assignment_label text not null default '',
  points_possible double precision,
  rubric_text text,
  lms text not null default 'canvas' check (lms in ('canvas', 'brightspace', 'blackboard', 'moodle')),
  status text not null default 'new' check (status in ('new', 'processing', 'graded', 'error')),
  error text,
  storage_path text not null,
  csv_storage_path text,
  csv_name text,
  size_bytes bigint not null default 0,
  graded_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists cartridge_drops_user_idx
  on public.cartridge_drops (user_id, created_at desc);

alter table public.cartridge_drops enable row level security;

drop policy if exists "Users read own cartridge_drops" on public.cartridge_drops;
create policy "Users read own cartridge_drops"
  on public.cartridge_drops for select
  using (auth.uid() = user_id);

drop policy if exists "Users insert own cartridge_drops" on public.cartridge_drops;
create policy "Users insert own cartridge_drops"
  on public.cartridge_drops for insert
  with check (auth.uid() = user_id);

drop policy if exists "Users update own cartridge_drops" on public.cartridge_drops;
create policy "Users update own cartridge_drops"
  on public.cartridge_drops for update
  using (auth.uid() = user_id);

drop policy if exists "Users delete own cartridge_drops" on public.cartridge_drops;
create policy "Users delete own cartridge_drops"
  on public.cartridge_drops for delete
  using (auth.uid() = user_id);

insert into storage.buckets (id, name, public)
  values ('cartridge-drops', 'cartridge-drops', false)
  on conflict (id) do nothing;

drop policy if exists "Users read own cartridge-drops objects" on storage.objects;
create policy "Users read own cartridge-drops objects"
  on storage.objects for select
  using (bucket_id = 'cartridge-drops' and (storage.foldername(name))[1] = auth.uid()::text);

drop policy if exists "Users insert own cartridge-drops objects" on storage.objects;
create policy "Users insert own cartridge-drops objects"
  on storage.objects for insert
  with check (bucket_id = 'cartridge-drops' and (storage.foldername(name))[1] = auth.uid()::text);

drop policy if exists "Users update own cartridge-drops objects" on storage.objects;
create policy "Users update own cartridge-drops objects"
  on storage.objects for update
  using (bucket_id = 'cartridge-drops' and (storage.foldername(name))[1] = auth.uid()::text)
  with check (bucket_id = 'cartridge-drops' and (storage.foldername(name))[1] = auth.uid()::text);

drop policy if exists "Users delete own cartridge-drops objects" on storage.objects;
create policy "Users delete own cartridge-drops objects"
  on storage.objects for delete
  using (bucket_id = 'cartridge-drops' and (storage.foldername(name))[1] = auth.uid()::text);
