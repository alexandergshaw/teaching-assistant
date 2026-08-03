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
// Section-divider/Recap/Next-Week/Appendix/Failure-Modes/Terminology
// flow slides to the coding contract too, deliberately, per Z4-AC0/AC1):
// 4 bullets/slide, 3-6 sentence notes, code on cycle slides, ~3.6 chars/
// token (measured from a real generated deck):
//   slides(N) = 10 fixed in-lecture (title, Case Study, Agenda, Failure
//     Modes, Documentation, Terminology, Recap, Next Week, Modern Tech,
//     References) + 6*N in-lecture per-concept slides (a Section divider, a
//     concept slide, Example, Walkthrough, Practice, Answer) + (2 + 4*N)
//     Post-Lecture Practice appendix slides (its own divider and intro,
//     plus 4 practice/answer slides per concept)
//     = 10*N + 12
//   ~1300 chars/slide worst case (4 bullets ~800 + notes ~700 + code ~300,
//     diluted across slide types, and the signpost slides - Agenda,
//     Section, Recap, Next Week - carry no code and are shorter
//     still, so this stays a conservative overestimate) / 3.6 chars-per-token
//   N=7 (MAX_CONCEPTS_PER_LECTURE) -> 82 slides -> ~106,600 chars -> about
//     29,600 tokens, still well under the applied worst case below, which
//     remains the binding constraint on this shared cap.
//
//   AMENDED (Group A): was "(7*N - 1)" per-concept slides / "11*N + 11" /
//     88 slides / ~31,800 tokens, which included a Bridge slide for every
//     concept but the last. Bridge slides were REMOVED from both contracts
//     (NO TRANSITION SLIDES - a deck audit found every one of them to be
//     filler). Every figure here moved DOWN, so the cap conclusion below is
//     if anything more conservative than before; recomputed rather than left
//     stale, since a comment that silently over-counts is how the previous
//     RCA22 drift started.
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
//   Section dividers, Recap, Next Week - see the module header
//   comment in src/lib/slide-prompt.ts) that added more deck-level and
//   per-concept slides than that count included. Entry 100 AC7's amendment
//   (docs/REGRESSION.md) already recomputed this to 85 slides; this comment
//   is corrected to match rather than left stale next to it.
//   slides(N) = 10 fixed deck-level slides (title, Case Study, Agenda,
//     Failure Modes, Documentation, Terminology, Recap, Next Week, Modern
//     Tech, Documentation & References) + in-lecture per-concept slides
//     (the first 2 concepts at 7 slides each = 14 - the full six-slide
//     cycle plus their Section divider; every later concept at 5 - the
//     four-slide core plus its Section divider) = 49
//     in-lecture slides at N=7, PLUS the Post-Lecture Practice appendix (1
//     divider + 1 intro slide + 4 slides per concept x 7 concepts = 30)
//   ~1500 chars/slide worst case (4 bullets ~800 + notes ~700, no code to
//     average down) / 3.6 chars-per-token
//   N=7 (MAX_CONCEPTS_PER_LECTURE) -> 79 slides (49 in-lecture + 30
//     appendix) -> about 118,500 chars -> roughly 32,900 tokens.
//
//   AMENDED (Group A): was 85 slides (55 in-lecture) / ~35,400 tokens, which
//     counted a Bridge slide for every concept but the last. Bridge slides
//     were REMOVED from both contracts (NO TRANSITION SLIDES). Every figure
//     moved DOWN, so the headroom below only grew.
//
// The CAP CONCLUSION IS UNCHANGED: the applied ceiling (~32,900) is still
// comfortably under 49152 (three-quarters of gemini-3.1-flash-lite's
// documented 64K-token output limit) - about 49% headroom over the
// recomputed ~32,900-token applied worst case, while still leaving 16,384
// tokens (25%) of the model's real output ceiling unused as pure buffer.
// The cap is deliberately NOT lowered to track the smaller deck: this
// number's job is to be a ceiling nothing realistic reaches, and trimming it
// toward the current estimate would just mean recomputing it again the next
// time the contract adds a slide. Never exceed the model's real 64K ceiling.
export const SCHEDULE_SLIDES_MAX_OUTPUT_TOKENS = 49152;
