-- "Deck template should default to just pull from the type of class it is
-- (coding or applied)": a course kind ("coding" | "applied" -
-- src/lib/course-kind.ts's own vocabulary, the SAME two values Course
-- Build/Refresh/Kickoff already use for pedagogy - never a third) stored
-- directly on a deck template, so a CUSTOM (user-created) template can be
-- tagged for a kind exactly like the two built-in coding presets already are
-- (preset-coding-lecture/preset-sdlc-lecture - decks/presets.ts). This is a
-- REAL field, matched by defaultDeckTemplateIdForCourseKind on its FIELD
-- VALUE - never inferred from a template's own name or id. That distinction
-- is load-bearing: a real production run used a bare UUID
-- (2f3a1972-fcaf-403b-87e3-b6198067d72e) as a user-created template's id,
-- which a name/id lookup table is structurally incapable of covering.
--
-- Nullable, no default, no CHECK constraint - same shape as course_hub's own
-- course_kind column (20260918000000_course_hub_course_kind.sql), validated
-- in app code via courseKindOrNull (src/lib/course-kind.ts) rather than at
-- the database layer. Null means "kind-neutral" (not tagged for either
-- kind) - every existing template (built-in or custom) reads as null and
-- keeps its exact current effective behavior with no backfill required:
-- defaultDeckTemplateIdForCourseKind only ever consults DECK_PRESETS this
-- pass, so a custom template's course_kind is stored for a later pass to
-- read, not yet consulted by the default-resolution function itself.
--
-- Written idempotently.

alter table public.deck_templates
  add column if not exists course_kind text null;
