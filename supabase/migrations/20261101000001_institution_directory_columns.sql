create table if not exists public.institution_directory_columns (
  id uuid not null default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  label text not null check (length(btrim(label)) between 1 and 48),
  label_key text generated always as (lower(regexp_replace(btrim(label), '[-_[:space:]]+', ' ', 'g'))) stored,
  value_type text not null check (value_type in ('text', 'date', 'https')),
  position integer not null check (position >= 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (user_id, id),
  unique (user_id, label_key)
);

create table if not exists public.institution_directory_values (
  user_id uuid not null,
  acronym text not null,
  column_id uuid not null,
  value text not null,
  updated_at timestamptz not null default now(),
  primary key (user_id, acronym, column_id),
  foreign key (user_id, acronym)
    references public.institution_directory_profiles (user_id, acronym) on delete cascade,
  foreign key (user_id, column_id)
    references public.institution_directory_columns (user_id, id) on delete cascade
);

alter table public.institution_directory_columns enable row level security;
alter table public.institution_directory_values enable row level security;

drop policy if exists "Users read own institution directory columns" on public.institution_directory_columns;
create policy "Users read own institution directory columns"
  on public.institution_directory_columns for select to authenticated
  using (auth.uid() = user_id);

drop policy if exists "Users read own institution directory values" on public.institution_directory_values;
create policy "Users read own institution directory values"
  on public.institution_directory_values for select to authenticated
  using (auth.uid() = user_id);

revoke all on public.institution_directory_columns from anon, authenticated;
revoke all on public.institution_directory_values from anon, authenticated;
grant select on public.institution_directory_columns to authenticated;
grant select on public.institution_directory_values to authenticated;
grant select, insert, update, delete on public.institution_directory_columns to service_role;
grant select, insert, update, delete on public.institution_directory_values to service_role;
