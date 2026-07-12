-- Per-institution common fields (start date, Outlook URL, custom entries) shown above the institution's course cards. Idempotent.

create table if not exists public.institution_fields (
  user_id uuid not null references auth.users (id) on delete cascade,
  acronym text not null,
  fields jsonb not null default '[]'::jsonb,
  updated_at timestamptz not null default now(),
  primary key (user_id, acronym)
);

alter table public.institution_fields enable row level security;

drop policy if exists "Users read own institution_fields" on public.institution_fields;
create policy "Users read own institution_fields"
  on public.institution_fields for select
  using (auth.uid() = user_id);

drop policy if exists "Users insert own institution_fields" on public.institution_fields;
create policy "Users insert own institution_fields"
  on public.institution_fields for insert
  with check (auth.uid() = user_id);

drop policy if exists "Users update own institution_fields" on public.institution_fields;
create policy "Users update own institution_fields"
  on public.institution_fields for update
  using (auth.uid() = user_id);

drop policy if exists "Users delete own institution_fields" on public.institution_fields;
create policy "Users delete own institution_fields"
  on public.institution_fields for delete
  using (auth.uid() = user_id);
