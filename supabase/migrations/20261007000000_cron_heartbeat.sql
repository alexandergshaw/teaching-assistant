-- Cron heartbeat: the one row the scheduled tick writes EVERY time it runs,
-- including - especially - when it had nothing to do.
-- docs/scheduled-publishing-from-modules-acceptance-criteria.md F5/F9(2).
--
-- WHY THIS EXISTS. With an empty due list, /api/cron/run-schedules performs
-- ZERO database writes, so from the outside a dead cron and a quiet one are
-- indistinguishable. `last_run_status` cannot close that hole: it is per-row
-- state written only by a tick that actually ran, so it can never report the
-- tick that never happened. This table records the tick ITSELF, so "when did
-- the scheduler last fire" is answerable without a single schedule existing.
-- F9 ranks that question second among the feature's unknowns, and calls this
-- a shippable increment on its own - it answers "does the Actions cron fire
-- reliably for this repo" with real data (and this repository is PUBLIC, so
-- GitHub's 60-day auto-disable of scheduled workflows on inactive repos
-- applies - F3).
--
-- ONE ROW, NOT AN APPEND-ONLY LOG. The question is "when did it last fire",
-- and a single upserted row answers it in one indexless read with no
-- retention policy to maintain. `id` is the tick's NAME (currently only
-- 'run-schedules'), so a second scheduled entry point later gets its own row
-- rather than overwriting this one.
--
-- NOT user-scoped. A cron tick belongs to the deployment, not to a user -
-- there is no `user_id` to key on, and the fact it records ("the scheduler
-- ran at T") is the same fact for everyone. Reads are open to any
-- authenticated session; writes happen only through the service-role client
-- in the cron route, which bypasses RLS, so there is deliberately no
-- insert/update policy at all - a signed-in browser must not be able to
-- forge a heartbeat and make a dead scheduler look alive.
--
-- Written idempotently.

create table if not exists public.cron_heartbeat (
  -- The tick's name, not a surrogate key: 'run-schedules' today.
  id text primary key,
  -- When the tick STARTED. Deliberately the start, not the finish: a tick
  -- that hangs past the 60s maxDuration cap is a fact worth recording, and
  -- pairing it with duration_ms below makes a hang visible as a stale
  -- heartbeat rather than as no heartbeat at all.
  last_tick_at timestamptz not null,
  -- Who called it - 'github-actions', 'vercel-cron', 'manual'. Free text
  -- rather than a check constraint: a new caller must never be able to make
  -- the heartbeat write FAIL, since the write failing is the one thing that
  -- would recreate the silent-failure hole this table closes.
  last_tick_source text not null default 'unknown',
  -- What that tick actually did. All zero is the normal, healthy case.
  schedules_processed integer not null default 0,
  triggers_processed integer not null default 0,
  -- Wall-clock milliseconds the tick took, or null if it never reported.
  duration_ms integer,
  -- The last tick's own top-level failure, or null. A per-schedule failure
  -- lives on that schedule's row (last_run_status) and does NOT belong here.
  last_error text,
  updated_at timestamptz not null default now()
);

alter table public.cron_heartbeat enable row level security;

-- Read-only to the app. There is no insert/update/delete policy by design -
-- see this file's header.
drop policy if exists "Authenticated read cron_heartbeat" on public.cron_heartbeat;
create policy "Authenticated read cron_heartbeat"
  on public.cron_heartbeat for select
  to authenticated
  using (true);
