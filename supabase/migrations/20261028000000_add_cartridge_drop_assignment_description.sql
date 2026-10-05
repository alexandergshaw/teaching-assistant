-- Cartridge drops: store the instructor's real assignment description so the
-- unattended grading step grades against it instead of a two-label string
-- (RES-A39-3B). Additive and nullable; older drops keep the label fallback.
-- Written idempotently.

alter table public.cartridge_drops add column if not exists assignment_description text;
