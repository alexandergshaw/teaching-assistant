-- The instructor glossary: definitions found in the instructor's own course
-- materials, accumulated over time so future decks and chat answers can reuse
-- explanations the instructor already wrote. App-global, non-user data:
-- readable by everyone, written only via the service-role client. The first
-- stored definition for a term wins (writes use ON CONFLICT DO NOTHING), so a
-- term's meaning stays stable once learned.

create table if not exists public.glossary_terms (
  id         text primary key,          -- slugified term
  term       text not null,
  definition text not null,
  source     text not null default 'materials',
  created_at timestamptz not null default now()
);

alter table public.glossary_terms enable row level security;

drop policy if exists "Glossary terms are readable by everyone" on public.glossary_terms;
create policy "Glossary terms are readable by everyone"
  on public.glossary_terms for select
  using (true);
