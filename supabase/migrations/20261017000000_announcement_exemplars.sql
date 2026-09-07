-- Announcement exemplars: a per-user, per-course store of pasted
-- announcement FORMAT exemplars, backing AC1 of
-- docs/announcement-from-walkthrough-acceptance-criteria.md's exemplar-driven
-- drafting path. An instructor pastes a previous announcement so a later
-- draft can match its STRUCTURE (section order, which headings appear, list
-- vs. prose, greeting/sign-off/due-date presence, roughly how long each part
-- runs) - never its content. Only the outline derived from the pasted text
-- is ever read into a drafting prompt; the raw text itself is stored here
-- for reference and re-derivation, but per AC2/P11 of that document it must
-- never itself reach a model call.
--
-- WHY THIS TABLE, RATHER THAN localStorage. Decided as P3 of the
-- acceptance-criteria document, correcting that document's own AC1: "more
-- than one exemplar may be stored per course, the most recent is the
-- default" describes a managed collection, not control state. Every other
-- piece of per-course user-authored text in this app already lives in
-- Supabase for exactly that reason (generated_artifacts,
-- course_task_attachments, institution_page_attachments), and this repo has
-- a documented localStorage quota-fallback lever elsewhere precisely
-- because that store cannot be trusted for payloads of this kind.
--
-- "MOST RECENT IS THE DEFAULT" IS DERIVED, NEVER STORED. There is no
-- is_default column and no is_current flag (contrast generated_artifacts,
-- 20261004000000, which does track a current version per course+kind). The
-- default exemplar is computed at read time as
-- `order by created_at desc limit 1` - see
-- getMostRecentAnnouncementExemplar in src/lib/announcement-exemplars.ts.
-- Nothing here is kept in sync on write, and nothing races, because no write
-- ever depends on any other row's state.
--
-- NOTHING UPSERTS. EVERY SAVE IS A PLAIN INSERT. This table carries no
-- uniqueness constraint at all, so there is nothing for PostgREST's
-- `.upsert()` to need an ON CONFLICT arbiter for in the first place. That
-- sidesteps, rather than merely avoids, the 42P10 trap this repo has hit
-- twice already - see 20261011000000_institution_knowledge_overview.sql's
-- header for the full account: a nullable uniqueness key plus `.upsert()`
-- needs a STORED GENERATED column to collapse the null before an ordinary
-- (non-partial) unique index can serve as that statement's conflict
-- arbiter; two partial indexes do not work, because PostgREST always emits
-- an ON CONFLICT with no WHERE clause of its own. If a future change wants
-- "pin one exemplar as the default", THAT is when this table would need an
-- is_default column and the generated-column pattern above - it must not be
-- reached for here, casually, before it is actually needed.
--
-- RETENTION IS UNBOUNDED, AND THAT IS ACCEPTED, NOT AN OVERSIGHT. Rows
-- accumulate with no sweep and no TTL. At instructor-authored-text volumes
-- (an instructor pastes a handful of exemplars over a course's life, not one
-- per request) this is a few dozen rows per course at most - nothing like
-- the every-request-writes-a-row growth rate that made
-- lms_credential_save_attempts (20261016000000) need a cleanup-on-write
-- sweep; see that migration's header for the contrast. The real risk of
-- unbounded growth here is picker clutter for the instructor, not storage
-- bytes or a slow scan, and the fix for picker clutter - if it is ever
-- needed - belongs on the READ path (a LIMIT on the listing query), never as
-- a destructive background job deleting an instructor's own saved text
-- without being asked. No cron sweep is built for this table.
--
-- OFFBOARDING is handled entirely by the two cascade FKs below: deleting a
-- user deletes their exemplars, and deleting a course deletes that course's
-- exemplars. No other cleanup path exists or is needed.
--
-- SECURITY NOTE, RESTATED FROM THE APP'S ACTIONS LAYER - DO NOT RELY ON RLS
-- ALONE. Every legitimate access to this table goes through
-- src/lib/announcement-exemplars.ts, which every caller in this app invokes
-- with a SERVICE-ROLE client. That client bypasses RLS entirely and carries
-- no JWT, so auth.uid() is null under it regardless of who is signed in. The
-- RLS policies below are correct, and are written anyway because they are
-- the real boundary for any future RLS-respecting client - but on the path
-- this app actually uses today, the only tenant boundary that exists is the
-- explicit user_id filter every function in that module applies itself. See
-- that module's header, and src/lib/artifact-templates.ts's own history (a
-- live cross-tenant delete with no owner filter, and an upsert that let a
-- client-supplied id reassign another user's row) for why this is stated so
-- plainly here.
--
-- Written idempotently: migrations auto-apply via a GitHub Action on push to
-- main and may re-run.

create table if not exists public.announcement_exemplars (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  course_id uuid not null references public.course_hub (id) on delete cascade,
  exemplar_text text not null,
  outline jsonb not null,
  label text,
  created_at timestamptz not null default now()
);

comment on table public.announcement_exemplars is
  'Per-user, per-course store of pasted announcement FORMAT exemplars, backing AC1 of docs/announcement-from-walkthrough-acceptance-criteria.md. Append-only: every save is a plain INSERT, and "most recent is the default" is derived at read time (order by created_at desc limit 1), never stored - see this migration''s header for why there is no is_default column. Every read, write and delete goes through src/lib/announcement-exemplars.ts using the service-role client, which bypasses RLS - the explicit user_id filter that module applies itself is the real tenant boundary, not the RLS policies below.';
comment on column public.announcement_exemplars.exemplar_text is
  'The pasted announcement, reduced to plain text before it ever reaches this table (this app has no HTML paste ingress - see P12 of the acceptance-criteria document, so there is no raw HTML to strip here either). Stored in full for reference and re-derivation; never itself sent to a drafting prompt - only the outline column is (see AC2/P11).';
comment on column public.announcement_exemplars.outline is
  'The structural outline derived from exemplar_text: section order, heading text, list vs. prose, greeting/sign-off/due-date presence, approximate per-section length. Descriptive, never prescriptive about content - see AC2''s own wording. This is the only part of this row a drafting prompt may ever read.';
comment on column public.announcement_exemplars.label is
  'Optional instructor-facing label distinguishing two shapes of exemplar (e.g. a weekly announcement vs. a module wrap-up) - nullable, since most saved exemplars are expected to be told apart by recency alone.';

-- Serves both of this table's real query shapes: "every exemplar for this
-- user+course, newest first" (the listing) and "the single most recent
-- exemplar for this user+course" (order by created_at desc limit 1) - a
-- single backward index scan answers both, so no separate ordering index is
-- added.
create index if not exists announcement_exemplars_user_course_created_idx
  on public.announcement_exemplars (user_id, course_id, created_at desc);

alter table public.announcement_exemplars enable row level security;

-- Four owner-scoped policies, matching every per-user table in this schema
-- (e.g. generated_artifacts, 20261004000000) - correct, and written anyway,
-- even though the app's own actions layer bypasses them with a
-- service-role client; see the SECURITY NOTE above. The update policy in
-- particular has no caller today (src/lib/announcement-exemplars.ts exposes
-- no update function - this table is append-only per its header comment
-- above); it is included only for parity with that same-shape convention,
-- in case a future RLS-respecting client is ever added.
drop policy if exists "Users read own announcement_exemplars" on public.announcement_exemplars;
create policy "Users read own announcement_exemplars"
  on public.announcement_exemplars for select
  using (auth.uid() = user_id);

drop policy if exists "Users insert own announcement_exemplars" on public.announcement_exemplars;
create policy "Users insert own announcement_exemplars"
  on public.announcement_exemplars for insert
  with check (auth.uid() = user_id);

drop policy if exists "Users update own announcement_exemplars" on public.announcement_exemplars;
create policy "Users update own announcement_exemplars"
  on public.announcement_exemplars for update
  using (auth.uid() = user_id);

drop policy if exists "Users delete own announcement_exemplars" on public.announcement_exemplars;
create policy "Users delete own announcement_exemplars"
  on public.announcement_exemplars for delete
  using (auth.uid() = user_id);
