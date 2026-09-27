# A25 scope - orchestrator rulings, round 1, 2026-09-27

The check returned NOT BUILDABLE: 5 blockers, 9 majors, 4 minors. **Round 1 of
two.** Three blockers are rulings and do NOT go back to the seat; two are design;
one class is mechanical measurement. One terminating question goes to the owner
and gates nothing.

I verified the two that decide the row. The key count behind B1's counter-evidence
and the identity option B3 says already ships are both real, and the check's own
canary discipline held throughout - it widened the absence search past the scope's
single pattern rather than accepting it.

## RULING 59 - B1 IS A REPEAT, AND IT GETS A STANDING RULE, not another patch

**This is the second scope TODAY to invent a blocking privacy premise.** A24's
check found its blocking rule asserted only a four-key list with the real
sentence living in a test's description; A25's check finds its foreclosure built
from a UI-staleness rule about un-posted scores, a test that says in its own body
that its negative search was NOT performed, and a "ruling" that exists in the tree
only as a comment about a roster in one panel.

And the decisive fact: **DECISION 3 already existed when that scope was written,
and DECISION 10 settles the question outright** - on-device persistence accepted,
explicitly because it is "the same class of data the app already persists there
under other keys." The scope never cites the decisions file at all. Live code
agrees: a grading table is persisted today under a `ta-` key whose own quota
message enumerates student names, roster matches, scores and feedback.

Per the caps card a REPEAT goes to disposal now and its second attempt must change
KIND, not strength. So the corrective rule is not "cite precedent more carefully":

> **No seat-derived reading of precedent may foreclose a branch where an owner
> decision on the same question exists. Check the decisions record FIRST; if one
> bears on the question, the orchestrator rules on the decision and the seat does
> not reason from inferred precedent at all.**

That is added to `docs/loop/traps-spec.md` in this same commit so the next scope
inherits it rather than rediscovering it. **Ruled: the foreclosure is withdrawn.
Persistence is available to this design.**

## RULING 60 - B2 is the silent-green failure and the revision must re-place the feature

The recommended gate makes the feature unreachable **in its own steady state**. The
host loads PENDING drafts only, the course dropdown's options ARE the names
collected from those pending drafts, and wave 2 gates the panel on a course being
selected. A25's subject is REVIEWED runs. So a course whose runs are all reviewed
contributes no name, cannot be selected, the filter falls back to "all", and the
panel never renders - appearing only while an unreviewed draft happens to exist,
and vanishing on review.

Nothing here can catch that: no component renders under this suite. A file the
scope itself cites spells the mechanism out in words.

Ruled: the revision re-places this feature on a surface that is not the
pending-drafts tab, and states the reachability condition as a requirement with an
instrument. Drafted Grades is by construction the pending surface - that is not a
gate to tune, it is the wrong host.

## RULING 61 - B3: the identity fork omitted the option the tree already implements, and the repo has a rule against the one it chose

A stable id IS available on the stored entry - `canvasUrl` is a field on it,
`parseCanvasCourseId` exists, and **the recommended host already applies exactly
that to one of these entries.** So the option the scope omitted costs zero type
change.

Worse, the scope recommends raw string matching as "consistent with precedent"
while the repo holds a dedicated module ruling against it in its own header -
matching on the parsed course id AND host, "never raw string equality", and
"COURSE ID must match on both sides, full stop."

**Ruled: key on the parsed course id, per that module's rule.** Offline runs, whose
push site sets an empty url, are a NAMED remainder with a distinguishing flag -
not a silent one. And R-A25-2 is re-written with a real instrument and step: a
collision between two same-named courses is silent and gradebook-adjacent, so
"only if the owner reports it" is not a disposition.

## RULING 62 - the mechanical class, and the residual class

B4 and M2 are one class: **a quantity or citation written without re-running the
command.** B4's named instrument produces NO output (exit 1) while its conclusion
happens to be true - the "right answer without having checked" shape. M2 quotes
three `this-repo.md` figures verbatim inside the paragraph announcing that
everything was re-measured; the real numbers are 11 higher. M3 names the wrong
enforcing gate for a file that is deliberately exempt from it.

Five residuals lack an owner, an instrument or a step. Under the anti-gaming rule
that is ONE class: every residual gets all five fields, and an instrument that is a
remedy is not an instrument.

## RULING 63 - M1 reframes the row, and M6 corrects its leverage

The reuse survey missed the closest comparable subsystem. `src/lib/course-intel/`
already holds a cross-assignment reducer, keyed on a stable Canvas course id, with
stated denominators, no model call, and a live surface. A25 as scoped builds a
second one over a weaker join key on the wrong surface without ever comparing.

It is NOT a duplicate - that subsystem has no rubric-area breakdown, because
Canvas does not hold this app's rubric areas - so the reframing is real but
partial, and it is the owner question below.

And the leverage claim is corrected: the scope re-points its corpus half at
automatic population, which is REMOVED SETUP - the thin click-cost branch - then
blames the thinness on a blocked sibling row. The half that survives is the one it
states second and does not build on: a counted aggregate over typed rubric areas
with a stated denominator and no model call. So "wait for the other row" is the
wrong remedy.

## TO THE OWNER - one terminating question, gating nothing

A25 would build a cross-assignment trend reducer over stored grading drafts. This
app already has one in `src/lib/course-intel/` - keyed on a stable Canvas course
id, rendering stated denominators, reachable from the course page, no model call -
but with no rubric-area breakdown, because Canvas does not hold this app's rubric
areas.

> **(A)** Build A25 as its own layer over stored grading drafts, keyed on the
> parsed Canvas course id, with offline runs named as a gap, on a surface that is
> NOT the pending-drafts tab; or **(B)** add rubric-area history as an additional
> signal inside the existing subsystem, reusing its id, denominators and surface.

**Recommendation: (A).** Rubric areas exist only in this app's grading runs while
that subsystem reads Canvas, so (B) means teaching a live-Canvas reader to read a
draft table - a bigger seam than a new reducer. **Cost of being wrong:** a second
trend subsystem whose per-course grouping can disagree with the first one's, on a
surface the instructor reaches differently.

Either answer ends the activity. Everything else above is settled by ruling or
measurement without it.
