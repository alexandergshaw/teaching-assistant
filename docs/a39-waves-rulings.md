# A39 waves - orchestrator rulings, round 1, 2026-09-23

The check of `docs/a39-waves.md` returned NOT BUILDABLE: 5 blockers, 8 majors,
5 minors. **This is round 1 of two**, so revision 2 proceeds - except for
BLOCKER 2, which goes to the owner as a terminating question because no
revision can settle it.

What held, and is not reopened: **all four of the plan's corrections**, each
verified independently by the check. The platform body cap really does apply to
Route Handlers exactly as to Server Actions (`upload-budget.ts:5-7`), so the
architecture's 4.4 is false and the plan's replacement reason holds on its own
merits (`grading.ts:881-883` grades server-side from the archive, with no
re-upload). `raceWithTimeout` really has three `.tsx` callers. All six
recomputed `grading.ts` citations opened correct - and they were OPENED, not
re-derived, which is the standard. The 989/940 arithmetic checks out.

Also verified sound: every gate argument is a `.test.ts` path, no raw multi-path
`vitest` anywhere, three gates actually run with exit codes read from files,
26 line counts reproduce on both counters, all 13 residuals carry five fields,
RES-A39A-3's superseded premise is handled honestly, roughly 30 spot-checked
citations are accurate, and the one-commit decision for the handler wave is
right.

## RULING 37 - BLOCKER 2 GOES TO THE OWNER. It is a genuine deadlock.

The plan's section 6.1 mandates the extracted leaf be **plain `.ts`, never
`.tsx`**, so it can carry a `.test.ts` oracle. My own **RULING 33** says the
constraint is **fewer, larger components** - and that arithmetic was measured
over JSX component boundaries, all three of which already ship as `.tsx` in that
directory.

**A `.ts` file cannot hold JSX. A `.tsx` component has no oracle, because
nothing renders under vitest here.** So the write set forbids the only shape
that reaches the 940 gate, and the two constraints cannot both be satisfied.

This is not a defect in the plan and no revision resolves it: it collides a
CLOSED architecture's terminal shape ruling against an orchestrator ruling, and
picking either costs something real. It is therefore a terminating question, and
it is stated in the owner section below with a recommendation.

**Until it is answered, wave 3a-i is not dispatched.** Everything else proceeds.
And note the consequence that makes this urgent rather than academic: RULING 32
gates A24 on that same extraction, so this blocks two items.

## RULING 38 - two gate greps that cannot match, and one that is red today

`docs/a39-waves.md:1036`, `:1440` and `:1524` put `|` in a pattern with neither
`-E` nor an escape, so both return nothing and exit 1. **Wave 3b's W3-2 gate
therefore passes today, before anything is deleted** - a gate that cannot fail.

Worse, corrected with `-E`, W4-6 returns **30 lines across 10 files**, so its
stated PASS condition ("only the five known writers") is RED on today's tree
before an implementer writes a line. Fix the pattern, then re-derive the PASS
condition from what the corrected command actually returns - do not tune the
command until it agrees with the sentence.

This is the third instrument-shaped defect this project has found today where a
command silently matched nothing: an absence piped through `head`, an
`--include` filter excluding `.tsx`, and now an unescaped alternation. The
common shape is a command that returns nothing for a reason unrelated to the
claim. **Every absence in revision 2 gets a canary proving the command fires**,
and that now explicitly includes proving the PATTERN is valid, not just that the
file was read.

## RULING 39 - W4-9 cannot be built where the plan puts it

The press-twice instrument's object is `handleStartReview` and `formAction`
counted - both defined inside `GradingTab.tsx`, which nothing renders. The
shipped precedent works only because `handleGradeColumn` is returned by a `.ts`
hook (`useRepoGradesBulkGrade.lifecycle.test.ts:70`).

So as written, an implementer can only count pool dispatches, and **the double
spend that deleting `action={formAction}` exists to close is measured by
nothing.** That is the defect in its purest form: the fix ships, the gate is
green, and the thing it was for is unmeasured.

Ruled: either the handler moves behind a `.ts` seam that the shipped harness
technique can reach, or the instrument changes to something that can actually
observe two presses. Revision 2 picks one and says which - and if the honest
answer is that it cannot be measured here, it says THAT and routes it to owner
verification rather than shipping a green gate that proves nothing.

## RULING 40 - the whole-run return with no consumer, and a pin it would break

`prepareGradingRunAction`'s `mode: "whole-run"` return has no consumer: S5 routes
on the client-side sync path, W4-12 asserts a server-side whole-run for an
over-budget entry, and nothing says what the client does with it. The plan's own
A5 replacement pins `formAction(` to EXACTLY TWO, which a third fallback breaks.

This is a REPEAT of the class this repo has a memory for - a wave whose file list
omits the file that consumes the new capability, so it ships dead with every gate
green. Name the consumer, or delete the return.

## RULING 41 - the security canary proves one of its three checks

The guard-removed fixture fails only check 1; the `content-type` and
`maxDuration` presence checks pass on it unchanged, and only check 1 is a real
presence-then-comparison pair. Since `action-guard-coverage.test.ts:123` skips
every non-`"use server"` file and is green either way, this canary is the ONLY
thing standing behind the handler's guard - so it must actually exercise all
three, with a separate fixture per check if that is what it takes.

## RULING 42 - the majors, carried

Fix in revision 2 without further argument: no wave gate runs `npm test` while
wave 4b edits `src/lib/grade.ts`, two of whose source-text readers are in no
wave; waves 3b/4/5's file sets were never derived by the stated instrument (the
check re-derived them and the licences ARE empty, so the conclusion stands and
only the evidence is missing - paste it); architecture pass conditions **W4-7 -
the leverage claim's only measurement - and W2-6** are dropped with no
disposition table, which is how a leverage claim quietly becomes unmeasured;
RES-A39A-15's step lands in a wave that does not carry it; the "12 citations at
703+" does not reproduce because `awk '$1>=703'` string-compares; nine new
handler-wave files have no line budget; and three of wave 3b's five ceiling
gates are dropped while `snapshot-grading.structure.test.ts` is at 863 against
an 890 bound with a +68-shaped addition.

## TO THE OWNER - one terminating question

**The extraction's shape.** The plan requires the extracted leaf to be plain
`.ts` so it can carry a real oracle; the arithmetic that reaches the line ceiling
requires JSX components, which must be `.tsx` and which nothing can render here.
Both cannot hold.

- **(a) `.tsx` components, no oracle.** Reaches the gate. The extraction is
  verified by source-text structure assertions and by the ceiling number itself,
  and correctness of the moved markup is an owner check in a browser. This is
  what the three shipped siblings in that directory already do.
- **(b) `.ts` leaves with oracles.** Keeps the strongest instrument, but the
  measured landing zones say it does not reach 940 - so the feature waits on a
  larger restructuring of a 989-line panel.
- **(c) Ship the feature without the extraction**, accepting the panel stays near
  the ceiling.

**Recommendation: (a).** The oracle is not free, but it is not the only
instrument - the ceiling gate is a real measurement, the structure assertions
catch relocation, and (b) pays for a stronger instrument with an item that does
not ship. (c) is refused on this project's own grounds: a ceiling with
exceptions stops being measured.

Whichever is chosen ENDS this activity, per `AGENTS.md`'s two-round rule.
