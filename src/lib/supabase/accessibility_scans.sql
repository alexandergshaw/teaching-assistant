-- Cache of per-item accessibility scan results. Run once in the Supabase SQL
-- editor. Until this exists the feature still works (scans fresh each load); the
-- table just makes reopening a course instant and avoids re-scanning unchanged
-- items. Writes use the service-role key, so RLS is optional.

create table if not exists public.accessibility_scans (
  user_id          uuid        not null,
  institution      text        not null default '',
  course_id        text        not null,
  item_type        text        not null,
  item_id          text        not null,
  item_title       text        not null default '',
  fingerprint      text        not null,
  error_count      integer     not null default 0,
  warning_count    integer     not null default 0,
  suggestion_count integer     not null default 0,
  issues           jsonb       not null default '[]'::jsonb,
  scanned_at       timestamptz not null default now(),
  primary key (user_id, institution, course_id, item_type, item_id)
);

create index if not exists accessibility_scans_course_idx
  on public.accessibility_scans (user_id, institution, course_id);
