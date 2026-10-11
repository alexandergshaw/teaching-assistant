-- LIVE-LMS-STUDENT-MESSAGING W4: the durable send ledger.
--
-- One row per (batch_id, course_id, recipient_id). The ledger is what makes a
-- reload, a second tab or a lost response safe: it records WHICH student was
-- (possibly) messaged so a resend is refused instead of duplicated. The design
-- lives in docs/live-lms-student-messaging-ledger.md; this file implements it.
--
-- Decisions, written here where the next editor will read them:
--   * user_id, not owner_id: user_id is the house owner column (every other
--     per-user table uses it).
--   * status and code are text plus CHECK, not enums: the repo has no enum
--     type, and a closed CHECK means a Canvas error string can never be stored.
--   * NO PII COLUMN. No name, subject, body, score or message text. The only
--     message-derived value is body_digest (sha256 of code, course, user,
--     subject and body). course_id and recipient_id are Canvas numeric ids.
--   * No foreign key to any institutions table (institution is a bare code).
--   * The claim is an RPC, not a PostgREST filter chain, because it needs a
--     transaction-scoped advisory lock (the two-tab race, R-W2-11 option B).
--   * Every function is explicitly volatile. A stable or immutable function
--     would run its queries on the snapshot of the calling statement, so the
--     guard inside CLAIM would read a pre-lock snapshot and silently defeat the
--     advisory lock. Do not mark any of them stable.
--   * live_message_sends_state_shape (the CHECK below) is the construction behind
--     F-L1: a sending row cannot carry settled_at, so the duplicate lookup
--     anchor for a sending row is always claimed_at. CLAIM and REQUEUE clear
--     settled_at, code and http_status for the same reason.
--   * allow_resend is the persisted Resend-anyway decision. An override row
--     ignores other rows whose anchor is not later than its own created_at
--     (created_at is never updated, so the horizon cannot move).
--   * CLAIM reconciles stale sending rows of ITS OWN KEY inside the advisory
--     lock, before the guard, so it never depends on a prior Start having
--     reconciled (the third caller of the duplicate predicate).
--   * No service-role client ever touches this table. Every write goes through
--     the seven public RPCs, which derive the owner from auth.uid(); a call with
--     no user JWT (the unattended runner, a service-role call) raises, so
--     nothing can be sent from an unattended path.
--
-- Implicit reliance the next editor must preserve: live_message_uid is
-- SECURITY INVOKER (no security definer clause) and live_message_dup_rows is
-- internal with execute revoked from every API role. Both are called ONLY from
-- the security definer public functions. Neither is ever granted to an API
-- role.
--
-- Every statement is idempotent (create ... if not exists, drop policy if
-- exists, create or replace, repeatable revoke and grant). A later change to a
-- constraint is a new migration; create or replace function cannot change a
-- return type.

create table if not exists public.live_message_sends (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  batch_id uuid not null,
  institution text not null,
  course_id text not null,
  recipient_id text not null,
  -- sha256 hex of: code LF courseId LF userId LF subject LF body.
  body_digest text not null,
  status text not null default 'pending',
  code text,
  http_status smallint,
  attempt smallint not null default 0,
  allow_resend boolean not null default false,
  created_at timestamptz not null default now(),
  claimed_at timestamptz,
  settled_at timestamptz,
  constraint live_message_sends_batch_recipient_key unique (batch_id, course_id, recipient_id),
  constraint live_message_sends_institution_shape check (institution ~ '^[A-Z0-9][A-Z0-9_-]{0,15}$'),
  constraint live_message_sends_course_id_shape check (course_id ~ '^[0-9]{1,12}$'),
  constraint live_message_sends_recipient_id_shape check (recipient_id ~ '^[0-9]{1,12}$'),
  constraint live_message_sends_digest_shape check (body_digest ~ '^[0-9a-f]{64}$'),
  constraint live_message_sends_status_vocab check (status in ('pending', 'sending', 'accepted', 'refused', 'unknown')),
  constraint live_message_sends_http_status_range check (http_status is null or http_status between 100 and 599),
  constraint live_message_sends_attempt_nonneg check (attempt >= 0),
  constraint live_message_sends_state_shape check (
    (status = 'pending' and claimed_at is null and settled_at is null and code is null and http_status is null)
    or (status = 'sending' and claimed_at is not null and settled_at is null and code is null and http_status is null)
    or (status = 'accepted' and claimed_at is not null and settled_at is not null and code = 'ok')
    or (status = 'refused' and claimed_at is not null and settled_at is not null
        and code in ('refused-pre-send', 'refused-http', 'refused-rate-limited'))
    or (status = 'unknown' and claimed_at is not null and settled_at is not null
        and code in ('unknown-http', 'unknown-no-response', 'unknown-stale-claim'))
  )
);

create index if not exists live_message_sends_dup_idx
  on public.live_message_sends (user_id, institution, course_id, recipient_id, body_digest);

create index if not exists live_message_sends_sending_idx
  on public.live_message_sends (user_id, claimed_at)
  where status = 'sending';

create index if not exists live_message_sends_user_created_idx
  on public.live_message_sends (user_id, created_at);

alter table public.live_message_sends enable row level security;

drop policy if exists "Users read own live_message_sends" on public.live_message_sends;
create policy "Users read own live_message_sends"
  on public.live_message_sends for select
  using (auth.uid() = user_id);

-- No insert, update or delete policy: the only writes are the seven public RPCs.
revoke insert, update, delete, truncate on public.live_message_sends from anon, authenticated;
revoke all on public.live_message_sends from anon;

create or replace function public.live_message_uid()
returns uuid
language plpgsql
volatile
set search_path = ''
as $fn$
declare
  v_uid uuid := auth.uid();
begin
  if v_uid is null then
    raise exception 'live_message: not authenticated' using errcode = '28000';
  end if;
  return v_uid;
end;
$fn$;

create or replace function public.live_message_reconcile(p_stale_ms bigint)
returns table (reconciled integer, db_now timestamptz)
language plpgsql
volatile
security definer
set search_path = ''
as $fn$
declare
  v_uid uuid := public.live_message_uid();
  v_n integer;
begin
  if p_stale_ms is null or p_stale_ms < 30000 or p_stale_ms > 3600000 then
    raise exception 'live_message: stale threshold out of range' using errcode = '22023';
  end if;
  update public.live_message_sends s
     set status = 'unknown', code = 'unknown-stale-claim', settled_at = now()
   where s.user_id = v_uid
     and s.status = 'sending'
     and s.claimed_at < now() - p_stale_ms * interval '1 millisecond';
  get diagnostics v_n = row_count;
  return query select v_n, now();
end;
$fn$;

create or replace function public.live_message_dup_rows(
  p_uid uuid,
  p_institution text,
  p_course_ids text[],
  p_recipient_ids text[],
  p_digests text[],
  p_window_ms bigint,
  p_exclude_id uuid,
  p_after timestamptz
)
returns setof public.live_message_sends
language sql
volatile
set search_path = ''
as $fn$
  select s.*
    from unnest(p_course_ids, p_recipient_ids, p_digests) as t (course_id, recipient_id, body_digest)
    join public.live_message_sends s
      on s.user_id = p_uid
     and s.institution = p_institution
     and s.course_id = t.course_id
     and s.recipient_id = t.recipient_id
     and s.body_digest = t.body_digest
   where s.status in ('accepted', 'unknown', 'sending')
     and coalesce(s.settled_at, s.claimed_at, s.created_at) > now() - p_window_ms * interval '1 millisecond'
     and (p_exclude_id is null or s.id <> p_exclude_id)
     and (p_after is null or coalesce(s.settled_at, s.claimed_at, s.created_at) > p_after);
$fn$;

create or replace function public.live_message_dup_lookup(
  p_institution text,
  p_course_ids text[],
  p_recipient_ids text[],
  p_digests text[],
  p_window_ms bigint,
  p_stale_ms bigint
)
returns setof public.live_message_sends
language plpgsql
volatile
security definer
set search_path = ''
as $fn$
declare
  v_uid uuid := public.live_message_uid();
begin
  if p_course_ids is null or p_recipient_ids is null or p_digests is null
     or cardinality(p_course_ids) < 1 or cardinality(p_course_ids) > 500
     or cardinality(p_course_ids) <> cardinality(p_recipient_ids)
     or cardinality(p_course_ids) <> cardinality(p_digests) then
    raise exception 'live_message: bad recipient arrays' using errcode = '22023';
  end if;
  if p_window_ms is null or p_window_ms < 3600000 or p_window_ms > 2592000000 then
    raise exception 'live_message: window out of range' using errcode = '22023';
  end if;
  perform 1 from public.live_message_reconcile(p_stale_ms);
  return query
    select * from public.live_message_dup_rows(
      v_uid, p_institution, p_course_ids, p_recipient_ids, p_digests, p_window_ms, null, null);
end;
$fn$;

create or replace function public.live_message_start_batch(
  p_institution text,
  p_course_ids text[],
  p_recipient_ids text[],
  p_digests text[],
  p_allow_resend boolean[],
  p_window_ms bigint,
  p_stale_ms bigint,
  p_max_recipients integer
)
returns table (o_batch_id uuid, o_course_id text, o_recipient_id text, o_outcome text, o_dup_status text)
language plpgsql
volatile
security definer
set search_path = ''
as $fn$
declare
  v_uid uuid := public.live_message_uid();
  v_batch uuid := gen_random_uuid();
begin
  if p_course_ids is null or p_recipient_ids is null or p_digests is null or p_allow_resend is null
     or p_max_recipients is null or p_max_recipients < 1 or p_max_recipients > 500
     or cardinality(p_course_ids) < 1 or cardinality(p_course_ids) > p_max_recipients
     or cardinality(p_course_ids) <> cardinality(p_recipient_ids)
     or cardinality(p_course_ids) <> cardinality(p_digests)
     or cardinality(p_course_ids) <> cardinality(p_allow_resend) then
    raise exception 'live_message: bad recipient arrays' using errcode = '22023';
  end if;
  if p_window_ms is null or p_window_ms < 3600000 or p_window_ms > 2592000000 then
    raise exception 'live_message: window out of range' using errcode = '22023';
  end if;
  perform 1 from public.live_message_reconcile(p_stale_ms);
  return query
  with req as (
    select t.course_id, t.recipient_id, t.body_digest, coalesce(t.allow_resend, false) as allow_resend
      from unnest(p_course_ids, p_recipient_ids, p_digests, p_allow_resend)
           as t (course_id, recipient_id, body_digest, allow_resend)
  ),
  dups as (
    select d.course_id, d.recipient_id,
           (array_agg(d.status order by case d.status when 'sending' then 0 when 'unknown' then 1 else 2 end))[1]
             as dup_status
      from public.live_message_dup_rows(
             v_uid, p_institution, p_course_ids, p_recipient_ids, p_digests, p_window_ms, null, null) d
     group by d.course_id, d.recipient_id
  ),
  ins as (
    insert into public.live_message_sends
           (user_id, batch_id, institution, course_id, recipient_id, body_digest, allow_resend)
    select v_uid, v_batch, p_institution, r.course_id, r.recipient_id, r.body_digest,
           (r.allow_resend and x.course_id is not null)
      from req r
      left join dups x on x.course_id = r.course_id and x.recipient_id = r.recipient_id
     where x.course_id is null or r.allow_resend
    returning course_id, recipient_id
  )
  select v_batch, r.course_id, r.recipient_id,
         case when i.course_id is not null then 'inserted' else 'duplicate' end,
         x.dup_status
    from req r
    left join ins i on i.course_id = r.course_id and i.recipient_id = r.recipient_id
    left join dups x on x.course_id = r.course_id and x.recipient_id = r.recipient_id;
end;
$fn$;

create or replace function public.live_message_claim(
  p_id uuid,
  p_digest text,
  p_window_ms bigint,
  p_stale_ms bigint
)
returns setof public.live_message_sends
language plpgsql
volatile
security definer
set search_path = ''
as $fn$
declare
  v_uid uuid := public.live_message_uid();
  v_row public.live_message_sends%rowtype;
  v_out public.live_message_sends%rowtype;
begin
  if current_setting('transaction_isolation') <> 'read committed' then
    raise exception 'live_message: claim requires READ COMMITTED' using errcode = '25000';
  end if;
  if p_window_ms is null or p_window_ms < 3600000 or p_window_ms > 2592000000 then
    raise exception 'live_message: window out of range' using errcode = '22023';
  end if;
  if p_stale_ms is null or p_stale_ms < 30000 or p_stale_ms > 3600000 then
    raise exception 'live_message: stale threshold out of range' using errcode = '22023';
  end if;
  select * into v_row from public.live_message_sends where id = p_id and user_id = v_uid;
  if not found then
    return;
  end if;
  perform set_config('lock_timeout', '2000', true);
  perform pg_advisory_xact_lock(hashtextextended(
    v_uid::text || ':' || v_row.institution || ':' || v_row.course_id || ':'
    || v_row.recipient_id || ':' || v_row.body_digest, 0));
  -- Reconcile stale sending rows of THIS KEY under the lock, BEFORE the guard,
  -- so a sibling claimed over the window ago and never reconciled is re-anchored
  -- inside the window (settled_at = now()) and the guard sees it.
  update public.live_message_sends s
     set status = 'unknown', code = 'unknown-stale-claim', settled_at = now()
   where s.user_id = v_uid
     and s.institution = v_row.institution
     and s.course_id = v_row.course_id
     and s.recipient_id = v_row.recipient_id
     and s.body_digest = v_row.body_digest
     and s.status = 'sending'
     and s.claimed_at < now() - p_stale_ms * interval '1 millisecond';
  if exists (
    select 1 from public.live_message_dup_rows(
      v_uid, v_row.institution, array[v_row.course_id], array[v_row.recipient_id],
      array[v_row.body_digest], p_window_ms, v_row.id,
      case when v_row.allow_resend then v_row.created_at else null end)
  ) then
    return;
  end if;
  update public.live_message_sends s
     set status = 'sending', attempt = s.attempt + 1, claimed_at = now(),
         settled_at = null, code = null, http_status = null
   where s.id = p_id and s.user_id = v_uid and s.status = 'pending' and s.body_digest = p_digest
  returning * into v_out;
  if found then
    return next v_out;
  end if;
  return;
end;
$fn$;

create or replace function public.live_message_settle(
  p_id uuid,
  p_status text,
  p_code text,
  p_http_status smallint
)
returns boolean
language plpgsql
volatile
security definer
set search_path = ''
as $fn$
declare
  v_uid uuid := public.live_message_uid();
  v_n integer;
begin
  if p_status is null or p_status not in ('accepted', 'refused', 'unknown') then
    raise exception 'live_message: bad settle status' using errcode = '22023';
  end if;
  update public.live_message_sends s
     set status = p_status, code = p_code, http_status = p_http_status, settled_at = now()
   where s.id = p_id and s.user_id = v_uid and s.status = 'sending';
  get diagnostics v_n = row_count;
  return v_n = 1;
end;
$fn$;

create or replace function public.live_message_requeue_refused(
  p_batch_id uuid,
  p_max_attempts integer
)
returns integer
language plpgsql
volatile
security definer
set search_path = ''
as $fn$
declare
  v_uid uuid := public.live_message_uid();
  v_n integer;
begin
  if p_max_attempts is null or p_max_attempts < 1 or p_max_attempts > 10 then
    raise exception 'live_message: attempts out of range' using errcode = '22023';
  end if;
  update public.live_message_sends s
     set status = 'pending', claimed_at = null, settled_at = null, code = null, http_status = null
   where s.user_id = v_uid and s.batch_id = p_batch_id
     and s.status = 'refused' and s.attempt < p_max_attempts;
  get diagnostics v_n = row_count;
  return v_n;
end;
$fn$;

create or replace function public.live_message_prune(
  p_retention_days integer,
  p_limit integer
)
returns integer
language plpgsql
volatile
security definer
set search_path = ''
as $fn$
declare
  v_uid uuid := public.live_message_uid();
  v_n integer;
begin
  if p_retention_days is null or p_retention_days < 8 or p_retention_days > 3650
     or p_limit is null or p_limit < 1 or p_limit > 2000 then
    raise exception 'live_message: prune arguments out of range' using errcode = '22023';
  end if;
  delete from public.live_message_sends
   where id in (
     select d.id from public.live_message_sends d
      where d.user_id = v_uid and d.created_at < now() - p_retention_days * interval '1 day'
      order by d.created_at
      limit p_limit);
  get diagnostics v_n = row_count;
  return v_n;
end;
$fn$;

-- Execute rights: revoke from every role, then grant the seven public functions
-- to authenticated only. live_message_uid and live_message_dup_rows get NO grant.
revoke all on function public.live_message_uid() from public, anon, authenticated, service_role;
revoke all on function public.live_message_dup_rows(uuid, text, text[], text[], text[], bigint, uuid, timestamptz)
  from public, anon, authenticated, service_role;

revoke all on function public.live_message_reconcile(bigint) from public, anon, authenticated, service_role;
grant execute on function public.live_message_reconcile(bigint) to authenticated;

revoke all on function public.live_message_dup_lookup(text, text[], text[], text[], bigint, bigint)
  from public, anon, authenticated, service_role;
grant execute on function public.live_message_dup_lookup(text, text[], text[], text[], bigint, bigint)
  to authenticated;

revoke all on function public.live_message_start_batch(text, text[], text[], text[], boolean[], bigint, bigint, integer)
  from public, anon, authenticated, service_role;
grant execute on function public.live_message_start_batch(text, text[], text[], text[], boolean[], bigint, bigint, integer)
  to authenticated;

revoke all on function public.live_message_claim(uuid, text, bigint, bigint)
  from public, anon, authenticated, service_role;
grant execute on function public.live_message_claim(uuid, text, bigint, bigint) to authenticated;

revoke all on function public.live_message_settle(uuid, text, text, smallint)
  from public, anon, authenticated, service_role;
grant execute on function public.live_message_settle(uuid, text, text, smallint) to authenticated;

revoke all on function public.live_message_requeue_refused(uuid, integer)
  from public, anon, authenticated, service_role;
grant execute on function public.live_message_requeue_refused(uuid, integer) to authenticated;

revoke all on function public.live_message_prune(integer, integer)
  from public, anon, authenticated, service_role;
grant execute on function public.live_message_prune(integer, integer) to authenticated;
