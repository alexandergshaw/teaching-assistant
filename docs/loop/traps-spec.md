# Traps: specification and measurement

---

**No unmeasured number in any artifact.** Every quantity names the command that
produced it. The toll from skipping this, all real: a count of 13 where the true
value was 11; a ratio imported from a sweep that measured a different quantity;
"three enforcers" where there were five; "seven matching files" where there were
41.

**Instruments disagree, and the disagreement is large.** Measured in this
checkout on `src/app/components/grading-recording/GradingRecordingPanel.tsx`:
`@(Get-Content $f).Count` returns **964**; `(Get-Content $f | Measure-Object
-Line).Lines` returns **922**. Forty-two lines apart on the same file. `wc -l`
from the Bash tool agrees with the first. Use `@(Get-Content <file>).Count`;
never `Measure-Object -Line`.

**An off-by-one in the enforcing instrument becomes an off-by-one in the
ruling.** `content.split("\n").length` counts the empty string after a trailing
newline as a line, so `src/app/actions/canvas-inbox.ts` - exactly 1000 lines by
the mandated measurement - came out at 1001 and failed a ceiling it was not
over. `src/lib/count-lines.ts` exists to make every gate agree with the command
a human would run.

**Every pass condition names three things:** the object under comparison, the
instrument that produces each quantity in it, and the direction of failure. A
rule that prevented a count rising but not falling once collided with a chunk
whose own criteria made that count fall.

**The orchestrator's enumeration is a FLOOR, never the set.** A list of "tests
that read a source file by path" was wrong three rounds running. Any brief that
hands over such a list must require the receiver to derive the set with its own
instrument and report what the list missed.

**At the third round on one artifact, stop patching instances: name the class
and move it.** Three separate chunks each took six to nine revision rounds of
their acceptance criteria. What ended each was moving work to the seat that
could settle it - mechanism specification to the architect, global-invariant
accounting to the plan where it is measured against the real tree, oracle
construction to the test seat. One chunk's criteria went from 748 lines to 268
and got better. Criteria keep only what a user experiences and the failures the
tests must catch. The full protocol is in `iteration-caps.md`.

**Brief from the tree, not from the doc.** A design document records decisions,
not what exists. Two subagent briefs in one day asserted that something existed
because a doc said so; both receivers built against something imaginary. Grep
before writing "X already exists" into a brief.

**An assignment must include the file that CALLS the new export.** A group that
adds an export without its caller ships dead code with every gate green. The
corollary bites too: never ship a loosened guard without the feature it was
loosened for.

**Verify reachability, not just correctness.** A capability can be correct,
tested, and completely unreachable, with every gate green. Trace the path from
the user-facing control to the code and name each hop. In this repo a sub-tab
needs five separate edits - a launch-view union, a runtime validator array, a
`recView` union, a hand-written `||` restore ladder, and a tab-strip literal -
and omitting the ladder leaves the structure test green while the view reverts
to the default on every reload.

**New step inputs are skipped unless every preset that uses the step binds
them.** A run form only shows bound inputs, so an unbound one is invisible
rather than empty. Trace value flow end to end before patching a branch.

**A design doc's "the feature already exists" claim reframes the work and must
be acted on in the same turn.** When a checker finds that the requested
capability is already built and merely unreachable, the real job is reachability
- state that and start it, rather than continuing to spec a second copy.

**A design can state a constraint in bold and then violate it in a later
section, and nobody notices because both halves read as correct.** The A9 seam
round 1 ruled, in bold, that a frozen `{name, text}` tombstone list must not be
stored beside the accumulator, and gave the mechanism: `findContinuationOverlap`
matches the TAIL of the earlier text, so a frozen tail stops abutting once the
capture scrolls on. Four sections later the persistence layer defined exactly
that list and wrote it ONCE, at removal. Every sentence in both sections was
individually defensible. Together they reintroduced the owner's original bug
across a reload - the fix for the defect restoring the defect.

Two things make this class survive a normal read. First, the contradiction is
between a RULING and a DATA STRUCTURE, which live in different registers and
different sections. Second, every acceptance test ran inside one session, and
the contradiction only shows up across a process boundary. When a design bans a
shape, grep the rest of that same design for the shape - and check whether any
acceptance criterion crosses the boundary the ban was about.

The fix that held was not a patch: the tombstone stopped being a RECORD and
became a PROJECTION of the live accumulator entry, re-derived on every advance.
Prefer the construction that makes the banned state unrepresentable over the
assertion that it is absent - `seats.md` already says this, and this is what it
looks like in practice.

**A pass condition narrower than the defect it closes goes green on a partial
fix.** A8's embedded-grader chunk tabulated eleven signals, found seven reading
a flattened union, then wrote its direction of failure as "RED if the two
fixtures produce the same Quality proxies score" - one column of four. Its own
prose meanwhile declared two columns clean that its own table marked flattened.
Implemented exactly as specified it would fix four signals, leave three
flattened, and pass. When a spec contains a table of instances, the pass
condition must range over the table, and any prose that exempts part of it is a
contradiction to resolve before hand-off, not a summary.

