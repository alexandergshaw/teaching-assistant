# A3 provenance - orchestrator rulings, round 1, 2026-09-23

The check returned NOT BUILDABLE: 4 blockers, 10 majors, 5 minors. **Round 1 of
two.** Revision 2 proceeds; one item goes to the owner as a terminating question.

Not reopened - the check re-derived and confirmed: 27 of 55 in BOTH directions,
with the 28 unread property names derived independently rather than by
subtraction; all 21 line counts across three instruments; the guard pin, the
nine keys, every staleness citation, every migration citation, the leverage
denominators, and the disposition table. Measurement is finished on this row.

## RULING 43 - BL-1 is the blocker: the row shape omits what the panel needs

`AskAiProvenance` and the enumerated columns omit `question` and `answer`, while
three other sections require them. Every acceptance criterion still passes -
they test a pure diff, copy strings, a line count and a guard pin, and **none
asserts a row carries its own question** - so the panel ships five identical
lines with no way to tell which question any of them is about.

That is the silent-green shape this project is organised against, and it is a
BLOCKER rather than a major because migrations auto-apply to production on push:
a wrong column set is not a local mistake here.

## RULING 44 - BL-2: the instrument forbids the artifact's own sentence

AC-5 fails on any string containing "answered from", and the scope's own S4
sentence begins with exactly that. Three non-identical forbidden-verb lists
exist, and AC-5 drops the scoping that made the ban coherent.

**The copy is CLEAN** - the check confirms no proposed sentence claims the model
USED anything, which was the thing I most wanted checked. It is the instrument
that is wrong. Collapse the three lists into ONE, scoped, and make the ban
express the requirement (no delivery or usage claim) rather than a token.

## RULING 45 - BL-3: a wave that cannot satisfy its own instruction

The prompt is to be extracted into a named exported constant, assigned to a
`"use server"` file, where a sync export is forbidden by a shipped test. The
precedent cited puts its constant in a plain lib leaf; this wave has no such
leaf. Add one to the write set or drop the extraction.

## RULING 46 - BL-4: a blanket claim that citations were opened, falsified

The scope cites `docs/a39-waves.md:1882` in a commit where that file is 1864
lines. Its conclusion survives - the check independently verified the
fingerprint has not moved - but the sentence "every citation below was opened
this pass" is false and must be STRUCK, not softened. A blanket claim of
verification is worth less than none, because it stops the next reader checking.

## RULING 47 - the majors, carried

Fix without further argument: AC-4's pass condition is unobservable by vitest;
its oracle is silently partial unless the fixture sets all 27 read fields, which
is exactly how a sibling oracle missed a defect before; `includeStudentData` is
unpinned on both sides of the diff, so a mismatch reports three facts removed on
every row with all gates green; R-MODEL-1 pins the wrong file; and the
recommended split routes the provenance record through the browser with no
stated cost.

**And the one the survey missed: B1 ALREADY SHIPS A PROVENANCE SENTENCE**
(`SCHEDULE_ANSWER_MARKER`, `week-numbering.ts:191`, appended at five sites,
pinned both positively and negatively). S4 duplicates it unsynchronised. Reuse
it or say why not.

## RULING 48 - rendering nothing on the deterministic branch is WRONG

The check agrees the branch behaves as described, and then makes the point the
scope missed: on a panel where four other states render a verdict, **absence
reads as "nothing changed"** - which the scope's own rule forbids as a sentence
and which it then delivers by omission. Floor: an explicit negative sentence.
Better: re-run the computation against today's clock. Budget the cost the plan
does not - that function is module-private in a `"use server"` file and must
move to a lib leaf.

## TO THE OWNER - one terminating question

**On a facts-shape version mismatch, what should the panel do?** The current
spec refuses all comparison, which turns the deliverable off for every
pre-bump answer - and the shape has already been bumped once, with this wave
bumping it again. The alternative is to compare the labels present in both
versions and report the list change separately.

**Recommendation: compare what is comparable and report the difference.**
Refusing everything means the feature is dark exactly when an instructor most
wants it - after something changed.
