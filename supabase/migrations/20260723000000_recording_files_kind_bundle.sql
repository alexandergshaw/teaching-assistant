-- Adds 'bundle' to recording_files.kind for generated course zips saved to the library. Idempotent.
alter table public.recording_files drop constraint if exists recording_files_kind_check;
alter table public.recording_files add constraint recording_files_kind_check check (kind in ('recording', 'captioned', 'narrated', 'bundle'));
