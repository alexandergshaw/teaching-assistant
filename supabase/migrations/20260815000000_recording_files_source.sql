-- Tag recording_files with the workflow that produced them, so unattended
-- workflow deliverables are distinguishable from manual uploads in the Files
-- tab and can drive a "new deliverables" badge. Idempotent.

alter table public.recording_files add column if not exists source text;         -- null | 'workflow'
alter table public.recording_files add column if not exists origin text;         -- null | 'unattended' | 'manual'
alter table public.recording_files add column if not exists workflow_name text;
