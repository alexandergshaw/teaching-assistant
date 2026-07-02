-- The rubric bank: human-authored rubrics that pass through embedded grading
-- (pasted, uploaded, or Canvas-supplied) are remembered, keyed by a content
-- hash so re-grading the same rubric is a no-op. When the engine is asked to
-- GENERATE a rubric for a topic it has seen a real rubric for, it reuses the
-- instructor's own rubric instead of rule-based generation. Readable by
-- everyone, written only via the service-role client.

create table if not exists public.rubric_bank (
  id                   text primary key,        -- sha-256 of the normalized rubric text
  topics               text[] not null default '{}',
  instructions_excerpt text not null default '',
  rubric_text          text not null,
  source               text not null default 'supplied',
  created_at           timestamptz not null default now()
);

create index if not exists rubric_bank_topics_idx on public.rubric_bank using gin (topics);

alter table public.rubric_bank enable row level security;

drop policy if exists "Rubric bank is readable by everyone" on public.rubric_bank;
create policy "Rubric bank is readable by everyone"
  on public.rubric_bank for select
  using (true);
