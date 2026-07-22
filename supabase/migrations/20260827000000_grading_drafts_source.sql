-- Mark the source of each grading draft (repo, lms, or cartridge submissions).
alter table if exists public.grading_drafts add column if not exists source text;
