-- Weekly announcement scheduling: the idempotency mapping table for the
-- "schedule a recurring weekly announcement on a chosen weekday" feature
-- (docs/weekly-announcement-scheduling-acceptance-criteria.md, AC3). Canvas
-- offers no client-supplied idempotency key, no external id, and no SIS id
-- for discussion topics, so this table is the ONLY source of dedupe: one row
-- per (course, week), keyed on course_id + week_number - never on the
-- scheduled date itself, so editing the course start date reschedules the
-- SAME row instead of missing it and creating a duplicate (AC3 item 9).
--
-- WRITE-AHEAD INTENT ORDERING (AC3 item 10): for each week, the reconciler
-- (1) inserts a `pending` row and commits it, (2) calls Canvas, (3) updates
-- the row to `confirmed` with the returned topic id. The atomic boundary
-- sits BEFORE the external call because it cannot span the network
-- boundary. A `pending` row found on a later run is AMBIGUOUS, not failed -
-- the crash may have landed either side of Canvas's create - and is
-- resolved by a targeted read-back against Canvas, never by a blind
-- re-create (AC3 item 11).
--
-- `posted_at` is deliberately NOT a column here. The write-ahead ordering
-- above always commits this row BEFORE Canvas is ever called, so this table
-- can never itself learn whether Canvas has since posted an announcement -
-- only a read-back against Canvas's own API can (AC3 item 12b). The
-- reconciler merges that Canvas-sourced value into
-- src/lib/announcement-schedule.ts's ExistingAnnouncementRow at the call
-- site; the planning function itself is pure and never fetches.
--
-- `scheduled_for` records the date WE most recently told Canvas to use - set
-- at write-ahead insert time (not left null until confirm), so a later
-- run's targeted read-back has a concrete date to match against even when
-- the crash landed before Canvas ever returned a topic id. A confirmed row
-- whose scheduled_for is null (AC3 item 12c) resolves toward reschedule,
-- never toward create - rewriting a known topic id's date is safe and
-- idempotent, creating is not.
--
-- Written idempotently.

create table if not exists public.weekly_announcement_schedule (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users on delete cascade,
  course_id uuid not null references public.course_hub (id) on delete cascade,
  week_number integer not null,
  status text not null default 'pending' check (status in ('pending', 'confirmed')),
  topic_id bigint,
  scheduled_for timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists weekly_announcement_schedule_course_week_idx
  on public.weekly_announcement_schedule (course_id, week_number);

alter table public.weekly_announcement_schedule enable row level security;

drop policy if exists "Users read own weekly_announcement_schedule" on public.weekly_announcement_schedule;
create policy "Users read own weekly_announcement_schedule"
  on public.weekly_announcement_schedule for select
  using (auth.uid() = user_id);

drop policy if exists "Users insert own weekly_announcement_schedule" on public.weekly_announcement_schedule;
create policy "Users insert own weekly_announcement_schedule"
  on public.weekly_announcement_schedule for insert
  with check (auth.uid() = user_id);

drop policy if exists "Users update own weekly_announcement_schedule" on public.weekly_announcement_schedule;
create policy "Users update own weekly_announcement_schedule"
  on public.weekly_announcement_schedule for update
  using (auth.uid() = user_id);

drop policy if exists "Users delete own weekly_announcement_schedule" on public.weekly_announcement_schedule;
create policy "Users delete own weekly_announcement_schedule"
  on public.weekly_announcement_schedule for delete
  using (auth.uid() = user_id);
