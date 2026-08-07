-- Avatar Studio: widen recording_files.kind for the two new kinds this
-- feature writes ("sample" = training footage the user recorded, "avatar" =
-- a generated AI video), and add the tables that back Tavus-trained
-- likenesses and the videos generated from them. Written idempotently, like
-- every migration in this repo.
--
-- Versioned 20260922000000 deliberately, NOT with today's date: this repo's
-- migration version is a monotonic counter, not a real date, and the newest
-- already-applied migration is 20260921000000. A migration dated 2026-08-06
-- would sort BEFORE four already-applied migrations and `supabase db push`
-- rejects out-of-order local files, breaking the deploy.

-- ── recording_files.kind widening ──────────────────────────────────────────
-- Established pattern: drop-and-recreate the CHECK constraint (see the
-- _kind_narrated / _kind_bundle / _kind_file migrations this repeats).
alter table public.recording_files drop constraint if exists recording_files_kind_check;
alter table public.recording_files add constraint recording_files_kind_check
  check (kind in ('recording', 'captioned', 'narrated', 'bundle', 'file', 'sample', 'avatar'));

-- ── avatar_likenesses ───────────────────────────────────────────────────────
-- One row per training ATTEMPT (not one row per person) - retraining inserts
-- a new row and marks the previous one 'superseded' rather than overwriting
-- it in place, so training history and the paid-slot accounting stay
-- auditable. RLS is all four verbs, owner-scoped, matching recording_files
-- (not user_style's select+delete-only style) because this is read by the
-- browser.
create table if not exists public.avatar_likenesses (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  provider text not null default 'tavus',
  external_id text,
  name text not null,
  status text not null default 'pending'
    check (status in ('pending', 'training', 'ready', 'failed', 'superseded')),
  error_message text,
  sample_file_id uuid references public.recording_files (id) on delete set null,
  is_default boolean not null default false,
  acknowledgement text,
  acknowledged_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists avatar_likenesses_user_idx
  on public.avatar_likenesses (user_id, created_at desc);

-- Exactly one default likeness per user, enforced by the database rather
-- than a read-then-write in application code (AC3.5): a partial unique index
-- over user_id where is_default is true makes two simultaneous defaults for
-- the same user impossible, atomically, regardless of what the application
-- layer does.
create unique index if not exists avatar_likenesses_one_default
  on public.avatar_likenesses (user_id) where is_default;

alter table public.avatar_likenesses enable row level security;

drop policy if exists "Users read own avatar_likenesses" on public.avatar_likenesses;
create policy "Users read own avatar_likenesses"
  on public.avatar_likenesses for select
  using (auth.uid() = user_id);

drop policy if exists "Users insert own avatar_likenesses" on public.avatar_likenesses;
create policy "Users insert own avatar_likenesses"
  on public.avatar_likenesses for insert
  with check (auth.uid() = user_id);

drop policy if exists "Users update own avatar_likenesses" on public.avatar_likenesses;
create policy "Users update own avatar_likenesses"
  on public.avatar_likenesses for update
  using (auth.uid() = user_id);

drop policy if exists "Users delete own avatar_likenesses" on public.avatar_likenesses;
create policy "Users delete own avatar_likenesses"
  on public.avatar_likenesses for delete
  using (auth.uid() = user_id);

-- ── avatar_videos ───────────────────────────────────────────────────────────
-- One row per generation job. No CHECK on `status`: Tavus's documented video
-- statuses (queued|generating|ready|deleted|error) are read straight through
-- from the provider (see src/lib/tavus.ts), and this table also needs to
-- represent this app's own post-download states, so the column is left
-- unconstrained rather than guessing a closed set up front.
create table if not exists public.avatar_videos (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  likeness_id uuid references public.avatar_likenesses (id) on delete set null,
  external_id text,
  status text not null default 'queued',
  script text not null,
  recording_file_id uuid references public.recording_files (id) on delete set null,
  error_message text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists avatar_videos_user_idx
  on public.avatar_videos (user_id, created_at desc);

alter table public.avatar_videos enable row level security;

drop policy if exists "Users read own avatar_videos" on public.avatar_videos;
create policy "Users read own avatar_videos"
  on public.avatar_videos for select
  using (auth.uid() = user_id);

drop policy if exists "Users insert own avatar_videos" on public.avatar_videos;
create policy "Users insert own avatar_videos"
  on public.avatar_videos for insert
  with check (auth.uid() = user_id);

drop policy if exists "Users update own avatar_videos" on public.avatar_videos;
create policy "Users update own avatar_videos"
  on public.avatar_videos for update
  using (auth.uid() = user_id);

drop policy if exists "Users delete own avatar_videos" on public.avatar_videos;
create policy "Users delete own avatar_videos"
  on public.avatar_videos for delete
  using (auth.uid() = user_id);
