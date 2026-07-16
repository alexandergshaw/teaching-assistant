-- Record which workflow produced each draft, so the Drafts tab can link back to it.
alter table if exists public.grading_drafts add column if not exists workflow_id text;
alter table if exists public.grading_drafts add column if not exists workflow_name text;
alter table if exists public.message_drafts add column if not exists workflow_id text;
alter table if exists public.message_drafts add column if not exists workflow_name text;
