-- Add 'narrated' to recording_files.kind for videos produced by the video-narration flow.
-- Idempotent: drops and recreates the constraint.

alter table public.recording_files drop constraint if exists recording_files_kind_check;
alter table public.recording_files add constraint recording_files_kind_check check (kind in ('recording', 'captioned', 'narrated'));
