-- Stores the owner's Microsoft (Outlook / Microsoft 365) OAuth tokens, one row
-- per school (institution acronym), so different schools' inboxes can each be
-- connected. Tokens are encrypted at the application layer (AES-256-GCM, see
-- src/lib/crypto.ts) before being written here. Writes go through the Supabase
-- service-role client from route handlers / server actions; reads are owner-scoped
-- by RLS.
--
-- Requires an Azure (Entra ID) app registration and these environment variables:
--   MS_OAUTH_CLIENT_ID, MS_OAUTH_CLIENT_SECRET, MS_OAUTH_REDIRECT_URI
--   MS_OAUTH_TENANT (optional, defaults to "organizations")
-- The app requests only user-consentable delegated scopes (offline_access,
-- Mail.Read, User.Read) so it needs admin approval as rarely as possible.

create table if not exists public.microsoft_credentials (
  user_id uuid not null references auth.users (id) on delete cascade,
  institution text not null,
  access_token text,
  refresh_token text,
  expiry timestamptz,
  scope text,
  updated_at timestamptz not null default now(),
  primary key (user_id, institution)
);

alter table public.microsoft_credentials enable row level security;

drop policy if exists "Users read own microsoft credentials" on public.microsoft_credentials;
create policy "Users read own microsoft credentials"
  on public.microsoft_credentials for select
  using (auth.uid() = user_id);

drop policy if exists "Users delete own microsoft credentials" on public.microsoft_credentials;
create policy "Users delete own microsoft credentials"
  on public.microsoft_credentials for delete
  using (auth.uid() = user_id);
