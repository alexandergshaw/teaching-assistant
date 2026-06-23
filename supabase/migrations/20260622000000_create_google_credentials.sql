-- Stores the owner's Google OAuth tokens for the calendar scheduling feature.
-- Tokens are encrypted at the application layer (AES-256-GCM, see src/lib/crypto.ts)
-- before they are written here. Writes go through the Supabase service-role client
-- from server actions / route handlers; reads are owner-scoped by RLS.

create table if not exists public.google_credentials (
  user_id uuid primary key references auth.users (id) on delete cascade,
  access_token text,
  refresh_token text,
  expiry timestamptz,
  scope text,
  updated_at timestamptz not null default now()
);

alter table public.google_credentials enable row level security;

-- A signed-in user may read and delete only their own row. Inserts and updates are
-- performed by the service-role client (which bypasses RLS) from trusted server code.
drop policy if exists "Users read own google credentials" on public.google_credentials;
create policy "Users read own google credentials"
  on public.google_credentials for select
  using (auth.uid() = user_id);

drop policy if exists "Users delete own google credentials" on public.google_credentials;
create policy "Users delete own google credentials"
  on public.google_credentials for delete
  using (auth.uid() = user_id);
