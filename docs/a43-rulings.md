# A43 scope - orchestrator rulings, round 1, 2026-09-27

The check returned NOT BUILDABLE: 4 blockers, 6 majors, 8 minors, 2
orchestration findings, 4 of 10 residuals stale or defective. **Round 1 of two.**
Revision 2 proceeds on everything except B3, which goes to the owner.

I verified the three load-bearing claims myself before ruling: `expandTemplate`
runs at `generate.ts:385` and `buildDeckPrompt` at `:392`; the loop-items gate is
`items.length > 0` at `:365`; and `syllabus-templates.ts:246` states in its own
comment that `applyOfficeSections` deletes known paragraphs with no section, with
the write at `:267`. All three hold.

## RULING 49 - O1 IS MINE. I shipped wave 1 from an unchecked scope.

The check reports that wave 1 was implemented while it was still running, and it
is right. I dispatched the `materials` wiring off `docs/a43-scope.md` before that
scope had been checked, and it landed as `4080c2e`. `docs/DEV_LOOP.md` requires
the check **before its consumer reads it**, and I made the check the consumer's
follow-up instead of its gate.

It cost two things and the second is the real one. It cost the check accuracy -
it had to re-measure against HEAD because in-flight code kept appearing under it.
And it shipped a wave that **B3 says does not deliver the request.** The speed
felt like throughput; it was rework.

The rule, re-stated for myself: **a scope is not dispatchable until its check has
reported.** An unchecked scope may be revised, ruled on, or escalated - never
built from. No deadline pressure justifies it, because the wave bought early is
the wave now in question.

**`4080c2e` is NOT reverted.** It is correct code for a narrower claim, every
gate holds, and which claim is right is exactly the owner question in B3.
Reverting before that answer would destroy work that one of the two answers keeps
verbatim.

## RULING 50 - B1: A43-T IS A PORT, not a parallel build

The failure-mode-B census was measured on a subset: five production call sites in
four files, not two. The two it missed are decisive - `syllabus-templates.ts:267`
**is a template a generator fills**, and the whole A43-T mechanism already ships
for `.docx`: the owner uploads their own file, the model returns content only
keyed to the file own paragraph ids, and `applyOfficeSections` writes back under a
byte-for-byte contract, reached from the UI and from three workflow steps.

**Ruled: A43-T is a port of that action generalised over `OfficeKind`, not a new
`pptx-template.ts`.** Consequences the revision must carry:

- Wave 2 invention of a parallel module is withdrawn. Name the existing action and
  say what generalising it costs.
- **The leverage claim narrows and must be restated honestly.** GUARANTEED is
  still earned, but the denominator is "zero of the four DECK paths", not
  "nothing in the app does this". The check verified the narrower claim; the wider
  one is false.
- Q1 "the format question is genuinely open" is withdrawn - the tree answered it,
  for `.docx`, in shipped code.

## RULING 51 - B2: the deletion semantics are the likeliest bug and are unmentioned

`applyOfficeSections` **deletes a known paragraph that has no section**. The scope
never mentions this - not in the design, not in a wave, not in a residual. So the
most natural wave-2 implementation (emit sections for the paragraphs I filled)
silently deletes every other paragraph of the owner template, and the scope own
removal test is blind to it because it excludes the slide entries.

The check measured the blindness directly: wiping a slide entire paragraph content
still reports the non-slide entries byte-identical. **A test that is buildable
exactly as specified and cannot fail on the defect it is named for is worse than
one that does not build.**

Ruled: the revision states the deletion semantics where the design depends on
them, and the instrument becomes the one the landed test already uses -
XML-substring reconstruction (`office-edit.test.ts:93-106`) - not a
non-slide-entry comparison.

## RULING 52 - B4: the no-omitted-section rule, verbatim

DECISION 15 keeps the conversational ask, and the guarantee enforcement point is
not expressible as the scope has it: "drop the case study" as a CONTENT request
becomes an omitted section, which deletes the owner paragraph, which reaches the
template - which DECISION 15 forbids.

**Ruled, and this sentence goes into the revision as written: a dropped item is
emitted as an EMPTY section, never an omitted one, and no operation may remove a
`sourceId` from the section list.**

Second half: an append-shaped section is INERT - the landed test proves it does
not throw and does not change the slide count. So "add a slide about X" is
answered today by **measured silence**, and the revision owes a refusal path that
says why, per DECISION 15 third constraint.

## RULING 53 - the majors, carried without further argument

Five wrong `file:line` cites in a document that claimed every one was opened,
including one cited three times that is two lines off. The 79-82 slide figure is
inherited from a comment on a DIFFERENT pipeline and must be struck or
re-measured; the real constraint is stronger, since loop items are uncapped. The
warm interaction count does not improve (3 to 3), and the only numeric argument
benchmarks against a chat rather than against the surface being replaced. The
no-course claim was measured on one file while a sibling panel ships copy saying a
course gets picked. T2 has FOUR call sites and the fourth discards the truncation
count entirely, so the residual instrument is satisfied vacuously by the worst
instance. And three of wave 3 five OOXML edits already exist in the tree - only
`sldIdLst` is genuinely new.

One mechanism fixes the cite and count errors: **re-run the command and read its
output before writing the quantity or the citation.**

## RULING 54 - the fork: a deck-specific operation set

Adopted from the check. Grounds: nothing partial exists to extend, a general
dispatcher would own provider differences across a call site reached from roughly
78 places - a seam the loop routes to its top tier, not a deck row - and DECISION
15 own test (if it cannot be expressed as content it is not an operation) makes the
deck set closed by construction, which is the opposite of what a general mechanism
is for. The tree also already has the closed-vocabulary-plus-coercion pattern.

Cost of being wrong is one re-implementation, which DECISION 15 already accepts.

## TO THE OWNER - one terminating question, about what I already shipped

**B3 is the silent-green failure and only the owner can settle it.** `materials`
enters the prompt at `generate.ts:114`, inside `buildDeckPrompt`, which runs at
`:392` - **after** `expandTemplate` has already fixed the slide list at `:385`. So
the upload improves the WORDING of slides about concepts the instructor still
types by hand. Nothing derives a topic list from the file. Every gate passes: the
types, the lint, the build, a wiring test asserting `materials` reaches the
context, and all three of the scope own constraints.

> **A deck from an uploaded source: do you want the app to DERIVE the deck topic
> list from the file you upload, or do you want to keep typing the concepts and
> have the uploaded file only improve the wording?**

- **Derive it.** `4080c2e` as shipped does not do that. A new pre-pass must turn
  the source into loop items BEFORE `expandTemplate`, and the one-control
  constraint must be rewritten to allow a reviewable derived-concepts list.
- **Keep typing.** `4080c2e` is correct as it stands, the constraint holds, and the
  row title and leverage paragraph must narrow - the honest description becomes
  "your deck wording is grounded in your file", not "a deck from your file".

Either answer ends the activity. I recommend **derive it**, because the row words
are "make a slide deck given an uploaded content source" and the second option
does not do that - but the second is cheaper and already built, so it is a real
choice, not a formality.
