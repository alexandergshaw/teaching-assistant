-- The research library's knowledge base: case studies, practice problems
-- (worked example + prompt + verified solution), and unverified external
-- references retrieved by the research loop. App-global, non-user data:
-- readable by everyone, written only via the service-role client (no
-- insert/update policies, so anon/authenticated writes are refused and the
-- service role bypasses RLS).

create table if not exists public.knowledge_entries (
  id            text primary key,
  kind          text not null check (kind in ('case_study', 'practice_problem', 'reference')),
  source        text not null default 'curated'
                check (source in ('curated', 'wikipedia', 'stackexchange', 'manual')),
  title         text not null,
  topics        text[] not null default '{}',
  -- Prose summary; curated case studies store their bullets newline-separated.
  summary       text not null default '',
  lesson        text,
  organization  text,
  year          int,
  language      text,
  difficulty    text,
  prompt        text,
  example_code  text,
  solution_code text,
  url           text,
  -- True when a human authored/checked the content (curated entries). Only
  -- verified entries may supply code for Practice/Answer material.
  verified      boolean not null default false,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  -- Recall-oriented full-text index over title, tags, and summary. Precision
  -- comes from the application-side scorer over the returned candidates.
  fts tsvector generated always as (
    to_tsvector('english', title || ' ' || array_to_string(topics, ' ') || ' ' || summary)
  ) stored
);

create index if not exists knowledge_entries_topics_idx on public.knowledge_entries using gin (topics);
create index if not exists knowledge_entries_fts_idx on public.knowledge_entries using gin (fts);
create index if not exists knowledge_entries_kind_idx on public.knowledge_entries (kind);

alter table public.knowledge_entries enable row level security;

drop policy if exists "Knowledge entries are readable by everyone" on public.knowledge_entries;
create policy "Knowledge entries are readable by everyone"
  on public.knowledge_entries for select
  using (true);
