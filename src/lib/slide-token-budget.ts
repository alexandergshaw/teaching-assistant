// Extracted out of src/app/actions/course-planning-grounding.ts (at the
// file's line cap) - a pure constant with no logic, so moving it here is a
// mechanical extraction, not a behavior change.
//
// The per-week slide-generation call plans MAX_CONCEPTS_PER_LECTURE
// (src/lib/lecture-concepts.ts) concepts, each with its own full cycle,
// plus post-lecture practice - not just one, which is what the old 12288
// cap was sized for. This single cap is shared by BOTH course kinds (the
// call site does not branch on courseKind), so it must cover whichever
// kind's worst case is larger - which, since the applied rewrite below,
// is the applied cycle, not the coding one.
//
// CODING worst case (RECOMPUTED for Group Z - see src/lib/slide-prompt.ts's
// SLIDE_STRUCTURE_REQUIREMENTS, which now ports the applied path's Agenda/
// Section-divider/Bridge/Recap/Next-Week/Appendix/Failure-Modes/Terminology
// flow slides to the coding contract too, deliberately, per Z4-AC0/AC1):
// 4 bullets/slide, 3-6 sentence notes, code on cycle slides, ~3.6 chars/
// token (measured from a real generated deck):
//   slides(N) = 10 fixed in-lecture (title, Case Study, Agenda, Failure
//     Modes, Documentation, Terminology, Recap, Next Week, Modern Tech,
//     References) + (7*N - 1) in-lecture per-concept slides (a Section
//     divider, a concept slide, Example, Walkthrough, Practice, Answer, and
//     a Bridge for every concept except the last, which has none) + (2 +
//     4*N) Post-Lecture Practice appendix slides (its own divider and intro,
//     plus 4 practice/answer slides per concept)
//     = 11*N + 11
//   ~1300 chars/slide worst case (4 bullets ~800 + notes ~700 + code ~300,
//     diluted across slide types, and the new signpost slides - Agenda,
//     Section, Bridge, Recap, Next Week - carry no code and are shorter
//     still, so this stays a conservative overestimate) / 3.6 chars-per-token
//   N=7 (MAX_CONCEPTS_PER_LECTURE) -> 88 slides -> ~114,400 chars -> about
//     31,800 tokens (up from the pre-Z4 estimate of ~26,000, but still well
//     under the applied worst case below, which remains the binding
//     constraint on this shared cap).
//
// APPLIED worst case (src/lib/slide-prompt.ts's APPLIED_STRUCTURE_
// REQUIREMENTS, rewritten around a six-slide cycle - Principle, In
// Practice, Artifact, Judgment Call, Your Turn, Model Response - plus two
// deck-level sections coding does not have, Failure Modes and
// Terminology): applied has NO code field at all (ever - see R3/entry 84
// in docs/REGRESSION.md), so nothing dilutes the per-slide estimate down;
// every cycle slide plausibly carries a full 4 bullets, not just a short
// caption the way a coding Example/Practice slide can:
//   RCA22 (RCA round 4): the arithmetic below used to derive the applied
//   worst case from a flat "8 fixed + 10*N" six-slide-cycle count (78
//   slides at N=7), which predates the P2 lecture-flow rewrite (Agenda,
//   Section dividers, Bridges, Recap, Next Week - see the module header
//   comment in src/lib/slide-prompt.ts) that added more deck-level and
//   per-concept slides than that count included. Entry 100 AC7's amendment
//   (docs/REGRESSION.md) already recomputed this to 85 slides; this comment
//   is corrected to match rather than left stale next to it.
//   slides(N) = 10 fixed deck-level slides (title, Case Study, Agenda,
//     Failure Modes, Documentation, Terminology, Recap, Next Week, Modern
//     Tech, Documentation & References) + in-lecture per-concept slides
//     (the first 2 concepts at 8 slides each = 16 - the full six-slide
//     cycle plus their Section divider and Bridge; the middle concepts at
//     6 each - four-slide core plus Section divider and Bridge; the LAST
//     concept at 5 - four-slide core plus Section divider, no Bridge) = 55
//     in-lecture slides at N=7, PLUS the Post-Lecture Practice appendix (1
//     divider + 1 intro slide + 4 slides per concept x 7 concepts = 30)
//   ~1500 chars/slide worst case (4 bullets ~800 + notes ~700, no code to
//     average down) / 3.6 chars-per-token
//   N=7 (MAX_CONCEPTS_PER_LECTURE) -> 85 slides (55 in-lecture + 30
//     appendix, up from the old 78-slide estimate) -> about 127,500 chars
//     -> roughly 35,400 tokens.
//
// The CAP CONCLUSION IS UNCHANGED: the applied ceiling (~35,400) is still
// comfortably under 49152 (three-quarters of gemini-3.1-flash-lite's
// documented 64K-token output limit) - about 39% headroom over the
// recomputed ~35,400-token applied worst case, while still leaving 16,384
// tokens (25%) of the model's real output ceiling unused as pure buffer.
// The fixed deck-level count and the appendix's per-concept cost both grew
// from the original estimate, but not enough to threaten the headroom this
// cap depends on. Never exceed the model's real 64K ceiling.
export const SCHEDULE_SLIDES_MAX_OUTPUT_TOKENS = 49152;
