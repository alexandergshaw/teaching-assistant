-- Institution knowledge overview: an AI-generated summary of every page in
-- scope (the whole institution, or one page's subtree) plus a persisted
-- history of free-text questions answered ONLY from those same pages. See
-- src/lib/knowledge-overview.ts for the data layer that reads and writes
-- both tables below, and that file's own header comment for how scopeKeyFor
-- mirrors this migration's scope_key expression exactly.
--
-- TWO TABLES, NOT ONE. institution_knowledge_summaries holds at most one row
-- per (owner, institution, scope) - a summary is REPLACED on regeneration,
-- never appended - while institution_knowledge_questions is an append-only
-- log: asking the same question twice under the same scope is two rows, by
-- design, so it carries no uniqueness constraint at all.
--
-- SCOPE, AND WHY scope_key EXISTS. A scope is either "the whole institution"
-- (scope_page_id is null) or "this page and its descendants" (scope_page_id
-- names the root of that subtree). Both tables need "at most one row per
-- (owner, institution, scope)" as a lookup key, and the summaries table also
-- needs it as a hard uniqueness constraint - but scope_page_id itself is
-- NULLABLE, and a plain unique index treats every NULL as distinct from
-- every other NULL, so a bare
-- `unique (user_id, institution, scope_page_id)` would happily accept an
-- unbounded number of "institution root" rows for the same owner instead of
-- enforcing "at most one."
--
-- The obvious-looking fix - two PARTIAL unique indexes, one
-- `where scope_page_id is null` and one `where scope_page_id is not null` -
-- is a trap. PostgREST's `.upsert()` always emits
-- `ON CONFLICT (col, col, col) DO UPDATE` with NO WHERE clause of its own,
-- and Postgres will only accept a partial index as that statement's conflict
-- arbiter when the statement's own WHERE clause implies the index's
-- predicate. An upsert with no WHERE clause implies nothing, so a
-- partial-index design reviews clean and then fails EVERY SINGLE SAVE at
-- runtime with 42P10 ("no unique or exclusion constraint matching the
-- ON CONFLICT specification"). Do not "fix" this back to partial indexes.
--
-- The design here instead collapses the null into a concrete value with a
-- STORED GENERATED column:
--   scope_key uuid not null generated always as
--     (coalesce(scope_page_id, '00000000-0000-0000-0000-000000000000'::uuid)) stored
-- so ONE ordinary, non-partial unique index on (user_id, institution,
-- scope_key) is the sole arbiter an upsert ever needs. uuid, not text -
-- `coalesce` over two uuid values (a column and a literal) is unambiguously
-- IMMUTABLE, which is what a generated column's expression requires; casting
-- to text would rest the same guarantee on the text I/O function's
-- volatility, which is not a bet worth placing on a migration that
-- auto-applies straight to production. The all-zero nil uuid is a safe
-- sentinel: institution_pages.id is always produced by gen_random_uuid() or
-- crypto.randomUUID() (see the app's page-creation path), and neither can
-- ever emit the nil uuid, so it can never collide with a real page id. The
-- column is GENERATED, so the application cannot write to it directly and
-- cannot let it drift out of sync with scope_page_id.
--
-- CASCADE. Both tables reference public.institution_pages(id) on delete
-- cascade for scope_page_id: deleting a page deletes every summary and
-- every question row scoped to that exact page. This is deliberate, not
-- merely convenient - a stored summary or answer is a claim about a
-- specific page's CURRENT content, and a page that no longer exists can
-- never again satisfy that claim. An institution-ROOT row (scope_page_id
-- null) is untouched by any single page's deletion, matching how "the whole
-- institution" survives the deletion of any one of its pages. Both tables
-- also cascade on the owning user's deletion (auth.users), matching every
-- other per-user table in this schema.
--
-- NO LENGTH CHECK CONSTRAINT on summary/question/answer. A CHECK that
-- rejected an over-long value would discard the answer a model call was
-- just paid for; the length clamp (with a visible " [truncated]" marker
-- appended to the stored text) is enforced in src/lib/knowledge-overview.ts
-- before the write, not here.
--
-- grounded is a STORED FACT, decided once by the code that parsed the
-- model's own structured answer, and never RE-DERIVED later by pattern- or
-- string-matching the stored answer text - a persisted decision cannot
-- drift out of sync with the model call that made it, and a phrase in the
-- answer happening to resemble a refusal is not evidence that no page was
-- cited.
--
-- RLS mirrors the 4-policy shape from
-- 20261008000000_scheduled_releases.sql (own-row select/insert/update/
-- delete, keyed on auth.uid() = user_id). This repo has zero grant
-- statements and zero service_role policies anywhere across its
-- migrations, so `.eq("user_id", userId)` in the lib is the real owner
-- gate, and these policies exist only for an RLS-respecting browser client,
-- not the service-role client the server actions actually use.
--
-- Written idempotently.

create table if not exists public.institution_knowledge_summaries (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  -- Uppercased acronym, matching institution_pages.institution - no FK, no
  -- institutions table (see 20260910000000_create_institution_pages.sql).
  -- Normalized through normalizeInstitution before every read and write.
  institution text not null,
  -- Null = the institution root (every page). Non-null = the root of a
  -- subtree: that page plus all of its descendants.
  scope_page_id uuid references public.institution_pages (id) on delete cascade,
  scope_key uuid not null generated always as
    (coalesce(scope_page_id, '00000000-0000-0000-0000-000000000000'::uuid)) stored,
  summary text not null default '',
  -- [{id, title, updatedAt, included}] - the pages considered when this
  -- summary was generated. The fingerprint set src/lib/knowledge-overview-
  -- stale.ts diffs against the CURRENT scope to decide staleness
  -- (added/removed/changed), and "included" distinguishes a page this
  -- summary could name from one it actually read (the context budget can
  -- omit a page even when it is in scope).
  source_pages jsonb not null default '[]'::jsonb,
  -- Free text, no CHECK: a new model id must never make a save fail.
  model text,
  -- Written EXPLICITLY by the app from its own process clock on every
  -- generate - never left to the column default. The default below exists
  -- only so a hand-written row (a manual fixture, a future backfill) still
  -- has a value. This must never be compared against
  -- institution_pages.updated_at to decide staleness - that column is
  -- written by the APP clock while a DB-defaulted generated_at would come
  -- from `now()`, two different clocks; staleness is decided entirely by
  -- the fingerprint set diff in src/lib/knowledge-overview-stale.ts, never
  -- by comparing two timestamps.
  generated_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

comment on column public.institution_knowledge_summaries.scope_page_id is
  'Null = the institution root (every page in scope). Non-null = the root of a subtree (that page plus its descendants). Cascades on delete of the referenced page.';
comment on column public.institution_knowledge_summaries.scope_key is
  'GENERATED. coalesce(scope_page_id, nil uuid) - the single value every upsert conflict-targets and every read filters on, so a nullable scope still has one non-partial unique index. Never written directly by the app; see scopeKeyFor in src/lib/knowledge-overview.ts.';
comment on column public.institution_knowledge_summaries.source_pages is
  'jsonb array of {id, title, updatedAt, included} snapshots of the in-scope pages considered at generation time - the fingerprint staleness diffs against, and the record of which pages actually made the context budget.';

-- The ONE non-partial unique index this feature depends on - see the header
-- comment for why a partial index here silently breaks every upsert at
-- runtime. Also serves the (user_id, institution) prefix read that lists
-- every summary an owner has for one institution.
create unique index if not exists institution_knowledge_summaries_scope_idx
  on public.institution_knowledge_summaries (user_id, institution, scope_key);

alter table public.institution_knowledge_summaries enable row level security;

drop policy if exists "Users read own institution_knowledge_summaries" on public.institution_knowledge_summaries;
create policy "Users read own institution_knowledge_summaries"
  on public.institution_knowledge_summaries for select
  using (auth.uid() = user_id);

drop policy if exists "Users insert own institution_knowledge_summaries" on public.institution_knowledge_summaries;
create policy "Users insert own institution_knowledge_summaries"
  on public.institution_knowledge_summaries for insert
  with check (auth.uid() = user_id);

drop policy if exists "Users update own institution_knowledge_summaries" on public.institution_knowledge_summaries;
create policy "Users update own institution_knowledge_summaries"
  on public.institution_knowledge_summaries for update
  using (auth.uid() = user_id);

drop policy if exists "Users delete own institution_knowledge_summaries" on public.institution_knowledge_summaries;
create policy "Users delete own institution_knowledge_summaries"
  on public.institution_knowledge_summaries for delete
  using (auth.uid() = user_id);

create table if not exists public.institution_knowledge_questions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  institution text not null,
  scope_page_id uuid references public.institution_pages (id) on delete cascade,
  scope_key uuid not null generated always as
    (coalesce(scope_page_id, '00000000-0000-0000-0000-000000000000'::uuid)) stored,
  question text not null,
  answer text not null,
  -- [{id, title}] - id is what a citation chip's click resolves against;
  -- title is a SNAPSHOT taken at answer time, so a page renamed afterward
  -- still shows the name the answer actually referred to.
  citations jsonb not null default '[]'::jsonb,
  -- Same shape as institution_knowledge_summaries.source_pages - the pages
  -- this specific question's own search actually considered, independent of
  -- whatever the persisted summary says (an answer is never derived from
  -- the summary - see this feature's acceptance criteria on grounding).
  source_pages jsonb not null default '[]'::jsonb,
  -- A persisted FACT about whether the model found grounding in the
  -- in-scope pages, decided once when the answer was parsed - never
  -- re-derived later by matching against the stored answer text.
  grounded boolean not null default true,
  model text,
  created_at timestamptz not null default now()
);

comment on column public.institution_knowledge_questions.scope_page_id is
  'Null = the institution root. Non-null = the root of the subtree this question was asked against. Cascades on delete of the referenced page.';
comment on column public.institution_knowledge_questions.scope_key is
  'GENERATED. Same coalesce-to-nil-uuid collapse as institution_knowledge_summaries.scope_key - see that column''s comment and this migration''s header.';
comment on column public.institution_knowledge_questions.source_pages is
  'jsonb array of {id, title, updatedAt, included} - the pages this question''s own search pass considered, independent of any stored summary.';
comment on column public.institution_knowledge_questions.grounded is
  'Persisted fact, decided once at answer time from the model''s own structured response - never re-derived from the answer text.';

-- Serves the history listing (newest first), the history-cap prune, and
-- "clear all questions for this scope" - all three filter on
-- (user_id, institution, scope_key) and order by created_at. DELIBERATELY
-- NOT UNIQUE on anything: history is append-only, so asking the same
-- question twice under the same scope is two rows, not a conflict.
create index if not exists institution_knowledge_questions_scope_created_idx
  on public.institution_knowledge_questions (user_id, institution, scope_key, created_at desc);

alter table public.institution_knowledge_questions enable row level security;

drop policy if exists "Users read own institution_knowledge_questions" on public.institution_knowledge_questions;
create policy "Users read own institution_knowledge_questions"
  on public.institution_knowledge_questions for select
  using (auth.uid() = user_id);

drop policy if exists "Users insert own institution_knowledge_questions" on public.institution_knowledge_questions;
create policy "Users insert own institution_knowledge_questions"
  on public.institution_knowledge_questions for insert
  with check (auth.uid() = user_id);

drop policy if exists "Users update own institution_knowledge_questions" on public.institution_knowledge_questions;
create policy "Users update own institution_knowledge_questions"
  on public.institution_knowledge_questions for update
  using (auth.uid() = user_id);

drop policy if exists "Users delete own institution_knowledge_questions" on public.institution_knowledge_questions;
create policy "Users delete own institution_knowledge_questions"
  on public.institution_knowledge_questions for delete
  using (auth.uid() = user_id);
