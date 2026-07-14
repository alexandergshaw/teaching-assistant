-- Event-triggered workflow runs: fire a saved workflow when a condition is
-- observed (a new submission, a new message, a repo push, another workflow
-- completing, an inbound webhook, ...). Everything is poll-based (no LMS/GitHub
-- webhooks): the app-open watcher and the Vercel Cron route evaluate each
-- enabled trigger's event source on a tick, compare the current state against
-- the stored `cursor`, and run the workflow (once) when the event fires.
-- Mirrors workflow_schedules for the run snapshot (field_values, provider,
-- disabled_steps, unattended, course/institution attachment). Idempotent.

create table if not exists public.workflow_triggers (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  workflow_id text not null,
  workflow_name text not null,
  -- Snapshot of the run form's values at trigger-creation time (uploads excluded).
  field_values jsonb not null default '{}'::jsonb,
  -- The event source kind (see EVENT_SOURCES in src/lib/workflow-triggers.ts).
  event_type text not null,
  -- Per-event configuration (institution, org, prefix, threshold, source
  -- workflow id, ...); shape depends on event_type.
  event_config jsonb not null default '{}'::jsonb,
  -- Last-seen dedup state for the event source; null until the first evaluation
  -- establishes a baseline (the first eval never fires - it only records state).
  cursor jsonb,
  -- Optimistic-lock counter: a poller reads it, evaluates, then claims the tick
  -- with a conditional update on this value. The loser of a race (a second tab
  -- or the cron ticking at the same moment) sees 0 rows updated and discards its
  -- decision, so an event can only ever fire once.
  check_version integer not null default 0,
  enabled boolean not null default true,
  -- Opt-in server-side (Vercel Cron) evaluation + execution while the app is
  -- closed. Only ever true for a headless-safe workflow whose event source is
  -- itself server-evaluable (see isHeadlessSafeWorkflow / serverEvaluable).
  unattended boolean not null default false,
  -- LLM provider snapshot (ta-llm-provider) for unattended runs; the runner
  -- defaults this to "gemini" when null.
  provider text,
  -- Top-level disabled-step-index snapshot (ta-workflow-disabled-<id>).
  disabled_steps jsonb not null default '[]'::jsonb,
  course_id uuid references public.course_hub (id) on delete set null,
  institution text,
  -- event_type = 'webhook' only: the secret path segment an external caller
  -- POSTs to fire this trigger. Unique across all rows (enforced below).
  webhook_token text,
  last_checked_at timestamptz,
  last_fired_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists workflow_triggers_user_idx
  on public.workflow_triggers (user_id, enabled);

-- The cron route scans enabled + unattended rows across ALL users; keep that
-- scan index-backed. Partial: unattended rows are the minority.
create index if not exists workflow_triggers_unattended_idx
  on public.workflow_triggers (enabled, unattended)
  where unattended;

-- Webhook tokens are the entire trust boundary for the inbound endpoint, so a
-- token must resolve to at most one trigger. Partial: only webhook rows carry one.
create unique index if not exists workflow_triggers_webhook_token_idx
  on public.workflow_triggers (webhook_token)
  where webhook_token is not null;

alter table public.workflow_triggers enable row level security;

drop policy if exists "Users read own workflow_triggers" on public.workflow_triggers;
create policy "Users read own workflow_triggers"
  on public.workflow_triggers for select
  using (auth.uid() = user_id);

drop policy if exists "Users insert own workflow_triggers" on public.workflow_triggers;
create policy "Users insert own workflow_triggers"
  on public.workflow_triggers for insert
  with check (auth.uid() = user_id);

drop policy if exists "Users update own workflow_triggers" on public.workflow_triggers;
create policy "Users update own workflow_triggers"
  on public.workflow_triggers for update
  using (auth.uid() = user_id);

drop policy if exists "Users delete own workflow_triggers" on public.workflow_triggers;
create policy "Users delete own workflow_triggers"
  on public.workflow_triggers for delete
  using (auth.uid() = user_id);
