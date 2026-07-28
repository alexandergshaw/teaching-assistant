-- Per-institution knowledge base: a Confluence/Notion-style page tree for the
-- policies, rules, and deadlines an instructor must follow at each school.
--
-- parent_id references this same table and cascades on delete: deleting a
-- page must delete its whole subtree, because a page with a dangling
-- parent_id would otherwise become unreachable from the tree while still
-- occupying a row. The UI is required to warn the user before a delete, since
-- that cascade is exactly what makes a delete here irreversible and
-- wide-reaching (see src/lib/knowledge-base.ts's buildPageTree, which also
-- has to defend itself against a page whose parent was removed out from
-- under it by a race).
--
-- institution is a plain text column, not a foreign key, because there is no
-- institutions table in this codebase - see src/lib/institutions.ts: the
-- acronym registry (MCC, MPCC, ...) lives entirely in the browser's
-- localStorage. A page's institution value is just the uppercased acronym
-- string, matched against whatever the client currently has registered.
--
-- Written idempotently.

create table if not exists public.institution_pages (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users on delete cascade,
  institution text not null,
  parent_id uuid references public.institution_pages on delete cascade,
  title text not null default '',
  body text not null default '',
  tags text[] not null default '{}',
  position int not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists institution_pages_user_institution_parent_position_idx
  on public.institution_pages (user_id, institution, parent_id, position);

alter table public.institution_pages enable row level security;

drop policy if exists "Users read own institution_pages" on public.institution_pages;
create policy "Users read own institution_pages"
  on public.institution_pages for select
  using (auth.uid() = user_id);

drop policy if exists "Users insert own institution_pages" on public.institution_pages;
create policy "Users insert own institution_pages"
  on public.institution_pages for insert
  with check (auth.uid() = user_id);

drop policy if exists "Users update own institution_pages" on public.institution_pages;
create policy "Users update own institution_pages"
  on public.institution_pages for update
  using (auth.uid() = user_id);

drop policy if exists "Users delete own institution_pages" on public.institution_pages;
create policy "Users delete own institution_pages"
  on public.institution_pages for delete
  using (auth.uid() = user_id);
