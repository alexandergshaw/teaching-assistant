-- Per-course hidden built-in tiles (tile keys removed from that course's card
-- only; the shared layout and the tile's data are untouched). Idempotent.

alter table public.course_hub add column if not exists hidden_tiles jsonb not null default '[]'::jsonb;
