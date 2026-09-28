-- Cartridge drops: track which scope (a course/assignment pair, or an
-- uploaded archive) the persisted rubric text actually came from, per
-- DECISION 16 - the drop row discloses presence plus origin. Additive only;
-- safe to re-apply.
-- Written idempotently.

alter table public.cartridge_drops add column if not exists rubric_origin_scope text;
