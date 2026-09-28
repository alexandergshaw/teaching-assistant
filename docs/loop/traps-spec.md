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

**At the SECOND round on one artifact, stop patching instances: name the
class and move it.** (This card said "third round" until 2026-09-23, when the
owner capped every activity at two rounds - `AGENTS.md`, "Two rounds, then
ask". There is no third round to notice the pattern in, so the move has to
happen a round earlier, and anything still unsettled after it goes to the
owner rather than into another cycle.) Three separate chunks each took six to nine revision rounds of
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

**A seat-derived reading of precedent may not foreclose a branch when an owner
decision on the same question exists.** Added 2026-09-27 after TWO scopes in one
day invented a blocking premise from inferred precedent. One built a foreclosure
from a rule that asserts only a four-key list, with the sentence it relied on
living in a test's `it()` description. The other built one from a UI-staleness
rule about un-posted scores, a test whose own body says its negative search was
NOT performed in that wave, and a "ruling" that exists in the tree only as a
comment about a roster in one panel - while an owner decision settling the exact
question sat in `docs/owner-decisions-*.md`, uncited, and live code persisted the
same class of data under an existing key whose quota message enumerates it.

Both scopes then designed around a constraint that was not there, which is
expensive in the worst way: the cheap branch gets priced as the expensive one and
the item grows a wave it does not need.

THE RULE: check the decisions record FIRST. If a decision bears on the question,
the ORCHESTRATOR rules on the decision and the seat does not reason from inferred
precedent at all. If no decision bears on it, a precedent may only foreclose a
branch when the passage doing the forbidding is QUOTED and its scope is stated -
an `it()` description is not an assertion, a comment is not a ruling, and a rule
about one surface does not bind another. State what the passage forbids, and state
what it does not.

**An absence claim may not rest on WHERE A GRAPH WALK'S TRAIL BEGINS.** Added
2026-09-27 after a scope exonerated eight call sites by observing that all 17 of a
file's boundary violations had trails starting at one re-export barrel, and concluded
the file's own code was therefore clean.

The walker in `src/lib/module-graph/runtime-import-graph.ts` shares ONE `visited` set
across the whole walk and returns early on a revisit, and a violation's `trail`
records whichever path reached the importing file FIRST. So "every trail begins at X"
is COMPATIBLE with a second, independent import of the same file reaching the
forbidden resource through a module the walk had already visited. **Trail-prefix
attribution under a shared visited set is not an absence proof** - it is a statement
about traversal order.

THE VALID PROOF IS ONE WALK PER DIRECT EDGE, rooted at each import in turn, reporting
a violation count for each. Measured on the file in question: 18 edges, exactly ONE
producing 17 violations and the other 17 producing zero each. That distinguishes "this
file's graph contains the resource" from "this file's own call reaches it", which is
what RULING 84 requires and what a trail prefix cannot show.

Two corollaries. A walk must STATE WHICH TARGETS IT FORBADE - a walk against a subset
of the owner-private resources is a partial result and must be labelled one, which is
the gap RULING 90 closed. And this is the fifth shape in one day where an absence
claim failed on the INSTRUMENT rather than the pattern, after an `--include` flag that
missed `.tsx`, a relative import specifier invisible to an alias filter, a
single-line grep against multi-line export blocks, and a census grep blind to files
already migrated off a deprecated alias. The general rule: **when a count appears to
settle a question, ask whether the instrument can even observe the thing it is being
read as settling.**

**`grep -c` counts lines that contain the word, not real occurrences of the symbol -
and every brief that cites a call-site count for a boundary or a bound is trusting
that difference away.** RULING 135: four wrong numbers went into sub-wave briefs in
one session, all from the same cause.

1. `src/app/actions/repo-grades.ts`, guard family `{requireUser, requireAppOwner}`:
   `grep -cE "requireUser|requireAppOwner"` reports **3**; the real guard call-site
   count is **2** - the third line is the `import { requireUser, requireAppOwner }`
   statement, which mentions both names and calls neither.
2. `src/app/actions/course-hub-integrations.ts`, guard family `{requireUser,
   requireAppOwner, requireOwner}`: the combined `grep -cE` reports **15**; the real
   count is **10** - the gap is the import line plus four comment lines discussing
   `requireOwner()`, a deprecated alias the file's own JSDoc names and never calls.
3. `src/app/actions/grading.ts`, same guard family, counted per symbol and SUMMED
   (`grep -c "requireUser"` = 18, `grep -c "requireAppOwner"` = 4, added by hand to
   22): the real count is **20** - both guards are imported on one shared line, so
   summing two single-symbol greps counts that one line twice.
4. An area slug taken from a grep hit that sat inside a comment stating what an area
   must NOT be named - filed as a live row against a name nothing in the code used.

**A constraint stated in a brief is not a gate; if it matters, it needs a
command.** RULING 139: a brief for `docs/ruling-136.md` said, in words, "no
vitest arrow glyphs in any doc." The doc was written with two pasted arrow
glyphs anyway, the orchestrator committed it, and a sibling agent working on
an unrelated file found the break - `src/lib/no-emojis.test.ts` flagged it,
and it cascaded into `src/tools/backlog/closure-runner.test.ts`, which spawns
`no-emojis.test.ts` as a real subprocess and expects exit 0. One pasted glyph
failed two test files. The gate existed and worked; nobody ran it before the
commit. `npm run docs:gate` now packages the checks a docs-only or
docs-touching commit needs (`no-emojis.test.ts`,
`source-bytes.structure.test.ts`, `gate-commands.structure.test.ts`, via the
`test:paths` wrapper) into one command with no judgement in it - see
`docs/ruling-139.md` for the membership reasoning and the documented gap (it
does not run `closure-runner.test.ts`, so it surfaces the direct emoji
failure but not that cascade).

**The reliable instrument in every case turned out to be a SECOND, INDEPENDENT
ONE, not a better regex.** A comment-stripping regex only encodes half the lesson
(instance 3's defect is an arithmetic mistake across two clean greps, not a comment
leaking through one). `src/tools/symbol-count/count.ts` runs two instruments that do
not share a failure mode - a TypeScript AST walk (`ts.createSourceFile`, the same
parser `src/lib/module-graph/runtime-import-graph.ts` already uses, never a pattern
over raw text) that classifies every real Identifier as a declaration, a call, or a
bare reference, and a lexical scan (`ts.createScanner`, the compiler's own tokenizer,
not a fourth hand-rolled comment stripper) that separately counts occurrences inside
comments and inside string/template literals - and reports where the two disagree
instead of collapsing them into one number. Proven against all three files above in
`src/tools/symbol-count/count.test.ts`'s header comment and this ruling's own report:
the tool's call-site count matches the real count in every instance; `grep -c` does
not, in any of them. The tool also states, in its own output, what no source-level
scan can see - a symbol assembled by string concatenation or built inside a template
literal's `${...}` - because that requires running the program, not reading it.
