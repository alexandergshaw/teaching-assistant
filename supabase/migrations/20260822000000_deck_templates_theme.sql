-- Add theme column to deck_templates for Chunk 6 (background color/gradient + font color)
alter table if exists public.deck_templates add column if not exists theme jsonb not null default '{}'::jsonb;
