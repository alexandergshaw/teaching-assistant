-- Usage tracking for knowledge entries: how often each entry has actually been
-- served into decks, examples, or API results. Retrieval uses this as a ranking
-- tie-breaker, so entries that keep proving useful surface first over time.
-- The bump runs through a SQL function so the increment is atomic; it is
-- security invoker, and with no update policy on the table only the
-- service-role client can actually apply it.

alter table public.knowledge_entries
  add column if not exists times_served integer not null default 0,
  add column if not exists last_served_at timestamptz;

create or replace function public.bump_knowledge_served(entry_ids text[])
returns void
language sql
as $$
  update public.knowledge_entries
  set times_served = times_served + 1,
      last_served_at = now()
  where id = any(entry_ids);
$$;
