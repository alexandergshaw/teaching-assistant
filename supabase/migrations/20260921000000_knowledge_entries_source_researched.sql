-- Adds 'researched' to knowledge_entries.source for entries the LLM research
-- pipeline stores directly (case-study-research.ts), as distinct from the
-- curated/wikipedia/stackexchange/manual sources already allowed. Idempotent:
-- drops and recreates the constraint, mirroring recording_files_kind_check's
-- growth pattern (see 20260719000000_recording_files_kind_narrated.sql and
-- 20260724000000_recording_files_kind_file.sql).

alter table public.knowledge_entries drop constraint if exists knowledge_entries_source_check;
alter table public.knowledge_entries add constraint knowledge_entries_source_check check (source in ('curated', 'wikipedia', 'stackexchange', 'manual', 'researched'));
