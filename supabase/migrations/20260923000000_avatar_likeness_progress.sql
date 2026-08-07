-- Avatar Studio: surface Tavus's training_progress on avatar_likenesses so
-- the UI has something to read during the 3-4 hour training wait (an
-- earlier acceptance criterion this repo had not yet met - getTavusFace in
-- src/lib/tavus.ts already fetches training_progress from the provider, but
-- nothing persisted it, so there was nothing for the UI to display).
--
-- DISPLAY ONLY. This value is never used to infer a stall or to drive a
-- timeout - the Tavus FAQ says it legitimately sits at one value while a
-- step processes, so a poll loop that has not seen it move for a while is
-- not evidence of anything. See refreshAvatarLikenessAction in
-- src/app/actions/media-likeness.ts and AvatarLikeness.trainingProgress in
-- src/lib/avatar-likeness.ts for where this is read and written.
--
-- Versioned 20260923000000 deliberately, one above the newest already-
-- applied migration (20260922000000_avatar_likenesses.sql): this repo's
-- migration version is a monotonic counter, not a real date, and
-- `supabase db push` rejects a local migration that would sort before one
-- already applied. Written idempotently, like every migration in this repo.

alter table public.avatar_likenesses
  add column if not exists training_progress text;
