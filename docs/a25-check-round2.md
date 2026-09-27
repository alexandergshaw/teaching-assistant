# A25 scope check, ROUND 2 (terminal)

Subject: `docs/a25-scope.md` revision 2, committed at 6a957ad. Fresh checker; I
did not author it. Round 1 was `docs/a25-check.md` (NOT BUILDABLE, 5/9/4) plus
`docs/a25-rulings.md` RULINGS 59-63. **There is no round 3**, so every finding
below is shaped to be used as it stands: each carries a disposition of
**(i)** fixable by an implementer from this scope plus this finding,
**(ii)** a decision only the owner can make, or **(iii)** a reason a NAMED part
must not be dispatched while the rest can.

All commands were run in this checkout on 2026-09-27 from the Bash tool unless
marked PowerShell. Every quantity names the command that produced it. Every
absence claim carries a canary. Two instruments are named for every line count.

**Nothing in the repo was mutated.** Where a sabotage would have required
editing production code, I **transcribed the assertion into a Python script in
my scratchpad and evaluated it over a copy** - this is stated at each point.
`git status --short` at the end of this pass is pasted in my hand-back; the only
path this document's authoring touched is `docs/a25-check-round2.md`.

---

## 0. Verdict

**BUILDABLE IN PART.**

Counts: **4 BLOCKER, 5 MAJOR, 7 MINOR.**

Shape of the round: **three of the four blockers are REPEATs or land on an
instrument the artifact newly asserted is sound.** Per `iteration-caps.md`, a
REPEATED finding means the artifact is wrong, not that the thing being designed
is underspecified. But the fourth blocker lands on **the orchestrator's own
owner question**, which is the signal cap 2 exists to catch. So the honest
reading is BOTH shapes at once, in different places:

- **The instruments are wrong the same way round 1 said they were wrong.** Round
  1's B5 class ("an instrument whose assertion cannot fail for the reason
  claimed") recurs three times, in REQ-5, REQ-11 and REQ-4 - each time with a
  new sentence asserting that this time it fires. That is an artifact defect.
- **The branch question is underspecified**, and answer (B) does not terminate.
  That is not the seat's defect; it is the question's.

---

## 1. BLOCKERS

### B1 - REQ-2 and REQ-8 cannot both hold, and REQ-8's other root is RED on arrival

**Class: two requirements in one artifact that cannot both be satisfied (a
construction-vs-ban collision).** **NEW.**

REQ-8 (section 8, and the register at `:872`) adopts the transitive-import ban
at `src/app/components/drafted-grades/classTrendsDraft.not-postable.test.ts`,
citing its `FORBIDDEN_PATH_PREFIXES` at `:58`. Every cited line number is exact
(`grep -n "FORBIDDEN_PATH_PREFIXES" <path>` -> `46, 58, 69`;
`grep -n "function isForbiddenPath" <path>` -> `67`;
`grep -n "function walkForForbiddenImports" <path>` -> `119`;
`grep -n "^describe(\|^  it(" <path>` -> `150, 151, 173, 185, 186, 198, 199,
207, 208`, so the three canaries at `:151`/`:173`, `:185` and `:198` are where
the scope says). The prefix list is verbatim:

    58:const FORBIDDEN_PATH_PREFIXES = ["app/actions", "lib/canvas", "lib/lms-generation", "lib/llm", "lib/gemini"];

That file's own header (`:66-70`, opened) states the matching is
"character-by-character prefix matched, never segment-by-segment", deliberately,
so `canvas-modules.ts` matches as well as `canvas-modules/`.

**Instance 1.** REQ-2 (section 4.2) *requires* the reducer to value-import
`parseCanvasCourseId` from `@/lib/canvas-url`, and makes the absence of that
import a RED condition. `"lib/canvas-url.ts".startsWith("lib/canvas")` is
`true`, so the walker records a violation on the reducer's very first commit.
This is not inference: the walker's own violation format lists exactly this edge
elsewhere in the tree today.

**Instance 2.** REQ-8's second root is "the new surface". Under branch (A) that
surface must read the corpus with the browser client (REQ-6, section 5.2), i.e.
value-import `@/lib/grading-drafts`. And `src/lib/grading-drafts.ts:25` is
`import { restoreStampedRubricText } from "./grade";` - a **value** import of
`src/lib/grade.ts`, the barrel, which re-exports `./grade/engine` (`grade.ts:16`),
`./grade/rubric` (`:8`) and `./grade/extraction` (`:12`).

**Measurement.** I transcribed `isForbiddenPath`, `resolveSpecifier`,
`valueImportSpecifiers` and `walkForForbiddenImports` from that test file into
`<scratchpad>/walker.py` and ran it over candidate roots. **No repo file was
edited.** Controls first:

| Root set | violations |
|---|---|
| CONTROL A - the cited test's own canary-3 roots (layer C) | **0** (matches the shipped test's expectation) |
| CONTROL B - its own positive control, `WalkthroughAnnouncementPanel.tsx` | **7** (non-empty, as canary 2a requires) |
| `src/lib/grading-drafts.ts` (wave 1's own file) | **4** |
| `src/app/components/courses/AskAiModal.tsx` (the cited precedent surface) | **2** |
| `src/lib/grade/class-trends.ts` | 0 |
| `src/app/components/ui/ModalShell.tsx` | 0 |

The four on `grading-drafts.ts`:

    lib/grade/rubric.ts     value-imports "../llm"    -> lib/llm.ts
    lib/grade/extraction.ts value-imports "../canvas" -> lib/canvas.ts
    lib/grade/engine.ts     value-imports "../gemini" -> lib/gemini.ts
    lib/grade/engine.ts     value-imports "../llm"    -> lib/llm.ts

Both controls behaving correctly is what makes the four a measurement rather
than a transcription artefact.

**Why it is a blocker and not a note.** REQ-8 is the *only* removal test the
scope offers for its leverage claim, and REQ-9's Instrument column is literally
"REQ-8's walker, plus a source-text assertion". So REQ-8 collapsing takes the
leverage claim's instrument with it. The scope also asserts REQ-8 "changes KIND
... as cap 1 requires" and is "the one this repo has sabotage-proven" - both
sentences are true of the cited test over ITS roots and false of the proposed
test over A25's roots. The reuse does not transfer, and the reason is the graph,
exactly as the brief suspected.

Note the irony the scope never sees: **REQ-10 exists to ban the `@/lib/grade`
barrel in client code, and the file wave 1 must edit already value-imports that
barrel** - which is precisely what poisons REQ-8's graph.

**Disposition: (iii) for REQ-8 and REQ-9's walker half, (i) for the rest.**
REQ-8 as written must not be dispatched. The available repairs all change the
instrument's definition, so this is design, not transcription:

- root only at the reducer, with a prefix list narrowed to
  `["app/actions", "lib/canvas.ts", "lib/canvas/", "lib/canvas-core",
  "lib/canvas-modules", "lib/lms-generation", "lib/llm", "lib/gemini"]` - which
  re-admits `canvas-url.ts` and must carry a new canary proving the narrowing
  did not re-open the trailing-slash hole the cited header spends a paragraph
  on; **and**
- either sever `grading-drafts.ts`'s barrel edge (import
  `restoreStampedRubricText` from `./grade/rubric-provenance-stamp` directly -
  note `src/lib/grade/rubric-provenance-stamp.ts` is currently UNTRACKED and
  held by a sibling agent, so this is not wave-1 safe today), or drop the
  surface as a root and accept that the traced deletion ("replace the aggregate
  with a model summary") happens in a file the test no longer watches.

The second bullet is the load-bearing one: **with the surface un-rooted, the
removal test cannot fire on the deletion section 8 traces.** Someone must decide
which, and it is not the implementer's call from this text alone.

---

### B2 - REQ-11's instrument omits the one hop that turns the click into the guard's value, so it is green over a dead capability

**Class: a pass condition narrower than the defect it closes.**
**REPEAT-OF round 1's B5** ("an instrument whose assertion cannot fail for the
reason claimed"). Same corrective rule: enumerate the mutations and check that
each changes an asserted value.

I opened all four hops. **Every one is exactly where the scope says:**

| Hop | Cited | Measured (`sed -n`) |
|---|---|---|
| 1 | `CourseRow.tsx:687` | `687: <button type="button" className={styles.linkButton} onClick={() => onAskAi(course)}>` |
| 2 | `CourseRow.tsx:82` / `:126` | `82: onAskAi: (course: Course) => void;` / `126: onAskAi,` |
| 3 | `CoursesTable.tsx:160` / `:203` / `:734` | prop type / destructure / `onAskAi={onAskAi}` |
| 4 | `CoursesTab.tsx:88` / `:367` / `:448` | `useState<Course \| null>` / `onAskAi={(course) => setAskAiCourse(course)}` / the mount |

The chain is sound and the host choice answers RULING 60 correctly. The
**instrument** does not.

REQ-11's Object is "the four hops above". Its Instrument enumerates four
assertion groups: the trigger's `onClick` in `CourseRow.tsx`; the prop name in
`CoursesTable.tsx`'s props type plus the pass-through; **the mount in
`CoursesTab.tsx` and its guard expression containing only the modal-open state
identifier**; and the new panel importing `ModalShell` and the reducer.

Hop 4 has three parts (`:88` state, `:367` handler, `:448` mount). **The
instrument asserts the mount and never the handler.** So this mutation passes
every enumerated assertion:

    // CoursesTab.tsx, at the <CoursesTable .../> call site
    onTrends={() => {}}

tsc is green (the prop's type is satisfied). lint is green. `next build` is
green. vitest is green - node-env, and `docs/loop/this-repo.md` section 2 plus
`docs/loop/seats.md:56` both state no component is rendered by any test here.
REQ-11 is green: the trigger exists, the prop name appears, the pass-through
exists, the mount exists, the guard names exactly one identifier, the panel
imports `ModalShell` and the reducer. And the modal never opens. **The
capability is dead with every gate green** - which is round 1's B2 outcome
reproduced in the new host, by the instrument written to prevent it.

The variant that sets the wrong state variable
(`onTrends={(c) => setAskAiCourse(c)}`) passes identically.

The scope earns partial credit here: the assertion it DOES specify (guard names
only the modal-open state) genuinely catches the *specific* round-1 mutation
(`{trendsCourse && effectiveCourseFilter !== "all" && <Modal/>}` goes RED). The
defect is that the Direction of failure says "RED if any hop is missing" while
the Instrument ranges over three hops and a bit - the `traps-spec.md` narrower-
pass-condition class verbatim.

**Disposition: (i).** An implementer can fix this from this finding: add, over
`CoursesTab.tsx`, (a) the `<CoursesTable` call site carries the new prop, and
(b) the expression assigned to it contains the identifier of the `useState`
setter from hop 4's `:88` declaration. Both are extractable by regex from
comment-stripped source, in the same idiom, and both go RED on the no-op
mutation above.

---

### B3 - REQ-5's recorder does not catch the mutation that reproduces round 1's blocker, and REQ-5 never states the population

**Class: a pass condition narrower than the defect it closes (half A) plus a
quantity derived from an unstated population (half B).**
**REPEAT-OF round 1's B5 (half A) and REPEAT-OF round 1's B2 (half B).**

The cited idiom is real and exactly located: `describe("createGradingDraft"...)`
opens at `src/lib/grading-drafts.test.ts:269` and the file is 334 lines
(`wc -l` -> 334; PowerShell `@(Get-Content ...).Count` -> 334), so "`:269-334`"
is exact. There is no existing enforcer it collides with: `grep -rn 'eq("status"'
src --include=*.test.ts` exits 1 with no output, canary
`grep -rn 'eq("user_id"' src --include=*.test.ts | wc -l` -> 4, so the pattern
and the filter both work and the negative is real.

**Half A - the mutation it misses.** REQ-5's Object is "the sequence of
`.eq(column, value)` pairs the function sends". The defect it protects against
is "the aggregate is computed over the pending population". This reintroduces
that defect with REQ-5 green:

    const { data } = await table(supabase).select("*").eq("user_id", userId).order("created_at", ...);
    return (data ?? []).filter((r) => r.status === "pending").map(mapRow);

Recorded pairs: `[["user_id", id]]`. Contains `["user_id", ...]`: yes.
Contains `["status","pending"]`: no. **GREEN.** And the function returns the
pending population. The scope states at `:494-496` that this assertion "fails on
the exact edit that would reintroduce the blocker" - that sentence is false. It
fails on one spelling of that edit. This is the same overclaim shape round 1
named in B5, with a different instrument.

**Half B - the population is never stated.** REQ-5 is written entirely as a
negative. Section 5.1 says "A25's subject is REVIEWED runs, so the new function
must not carry that filter"; section 10.1 calls it "the reviewed-inclusive list
function". Neither says whether the population is *reviewed only* or *all
statuses*. Both implementations pass REQ-5's recorder - `.eq("status",
"reviewed")` is recorded, and the assertion only forbids `["status","pending"]`.
The two produce **different values for REQ-8a's cross-assignment denominator**
("how many of the term's assignments carried this area"): reviewed-only silently
omits every assignment still awaiting review. REQ-8a's own instrument feeds the
reducer three entries directly, so it cannot see the difference; REQ-4 then
renders the number; RES-2 and RES-4 read it as truth. A term denominator that is
wrong by the size of the review queue, with every gate green.

That is RULING 60's mechanism - a rendered quantity derived from the wrong
population - relocated from a gate to a denominator, which is why it is a REPEAT
rather than a new class: the corrective rule is the same one round 1 issued,
"state the population each value is derived from."

**Disposition: (i) for half A, (ii)-then-(i) for half B.** Half A: change the
Object from the eq-pairs to **the rows the function returns** - the same fake
client resolves `order()` to a fixture containing one `pending` and one
`reviewed` row, and the assertion is that both come back. That catches the
post-query filter, the `status = reviewed` filter and the `.eq("status",
"pending")` regression with one assertion, and it executes with no database.
Half B: someone must say which population A25 counts. It is a one-line product
call (I recommend **all statuses**, because the denominator's English is "the
term's assignments"), and once stated it is transcription.

---

### B4 - the owner question does not terminate: applying answer (B) reopens five requirements the answer does not touch, and section 0's own part-table contradicts the register

**Class: an either-answer claim that is false, so the terminating question is
the wrong question.** **NEW** - and it lands on the orchestrator's artifact, not
the seat's.

Section 13 closes: "Under (B) sections 6.3 and 10.2's branch-(B) paragraph
replace section 6.2, REQ-6 inverts, REQ-12 goes vacuous, REQ-9 becomes
load-bearing, and RES-5 activates. **Nothing else in this document changes, and
nothing in it needs re-deciding to apply either answer.**" Section 0's table
makes the same claim per part. I picked (B) and walked the register at `:863-877`.
Five things change that section 13 does not name, and one of them is fatal:

1. **REQ-8 (branch column: "both") is not merely different under (B) - it is
   structurally impossible.** Under (B) the surface is Course Intel, which
   *reads Canvas*. Walker run over branch-(B) roots (same transcribed script, no
   repo file edited):

   | Root | violations |
   |---|---|
   | `src/app/api/course-intel/ask/route.ts` | **10**, including `lib/course-intel/canvas-readers.ts value-imports "@/lib/canvas" -> lib/canvas.ts` and `"@/lib/canvas-core"`, and the route's own `"@/lib/llm" -> lib/llm.ts` |
   | `src/app/components/course-intel/index.tsx` | **1** (`useCourseIntel.ts -> app/actions/course-intel.ts`) |
   | `lib/course-intel/concern.ts`, `engagement.ts`, `context-block.ts`, `offline-payload.ts` | 0 each |

   A ban on reaching `lib/llm` cannot be rooted at a surface whose whole job is
   to call a model. Under (B), REQ-8 has to be replaced by the receipt pattern,
   not "kept identical".

2. **REQ-4** ("The surface renders `unkeyableEntryCount` ... in the same
   sentence as the denominator"; Object: "the rendered summary"; branch: both).
   Under (B) there is no rendered summary - the count becomes a fact in a prompt
   and the output is model prose. Section 6.3 restates REQ-11 for (B) and says
   nothing about REQ-4.
3. **REQ-8a** (Object: "the two numbers in the rendered summary"; branch: both).
   Same problem.
4. **REQ-10** (Object: "the new panel's import statements"; Direction: "RED if a
   bare `from "@/lib/grade"` appears in a client component"; branch: both).
   Under (B) there is no new client component, so REQ-10 goes vacuous - an
   un-named third vacuum alongside REQ-12.
5. **RES-1** (Object: "whether the shipped surface READS well - layout,
   placement in the row"; Direction: "Fails if the owner opens the surface ...
   and cannot tell, from the panel alone"). There is no row and no panel under
   (B). RES-1 must be rewritten, and section 10.3 already half-knows this ("the
   UX seat still does [fire], because the answer's copy changes").

**And section 0's part-table contradicts the register independently of the
branch.** The table marks "Sections 3, 4, 5 ... **YES** dispatchable" and
"Section 6 - the surface ... **NO - NOT DISPATCHABLE**". But **REQ-4 is stated
in section 4 and is a requirement on the surface** ("The surface renders
`unkeyableEntryCount`", `:460`). A part cannot be both dispatchable and about a
non-dispatchable surface. Same for REQ-8a, stated in section 5.4 (marked YES)
with its Object in "the rendered summary".

`iteration-caps.md` cap 2: "Applying an accepted decision is transcription, not
a round, and it must not reopen anything the decision did not touch - **if it
seems to, the question was the wrong one**." It does, so it is.

**Disposition: (iii) plus a re-shape, stated in section 6 below.** Do not put
the question to the owner in its current form. Either narrow it so both answers
are genuinely terminal, or accept that (B) is a re-scope and ask a question
whose (B) branch says so.

---

## 2. MAJOR findings

**M1 - the disposition table's own count is wrong on all four figures, in the
paragraph that announces every number was re-measured.**
**Class: an unmeasured quantity. REPEAT-OF RULING 62's class** ("a quantity or
citation written without re-running the command").

`docs/a25-scope.md:99-101`: "Count: 8 kept, 2 handed over, 11 withdrawn, 4
promoted from residual to requirement."

Measured by parsing the table's own rows (`<scratchpad>/table.py`, which locates
the header row and the `Count:` line and counts the Disposition cell's leading
keyword) and confirmed by grep:

| | `grep -c` on `docs/a25-scope.md` | result | scope says |
|---|---|---|---|
| kept | `grep -c "| \*\*KEPT" docs/a25-scope.md` | **12** | 8 |
| handed over | `grep -c "| \*\*HANDED OVER" docs/a25-scope.md` | **1** | 2 |
| withdrawn | `grep -c "| \*\*WITHDRAWN" docs/a25-scope.md` | **14** | 11 |
| promoted | `grep -c "PROMOTED to REQ" docs/a25-scope.md` | **3** | 4 |

Total data rows: **27** (`table.py`). 8+2+11 = 21; 8+2+11+4 = 25. Neither
reaches 27 under any reading. One figure is reachable by one convention
(14 withdrawn minus 3 promoted = 11), but that convention makes "4 promoted"
wrong, and no convention yields 8 kept (only 3 rows are unqualified `KEPT`) or
2 handed over (the table contains exactly one `HANDED OVER` row).

This is entry gate 3's audit line - the number a checker is told to audit before
reading the round on its own terms - in a document whose opening states "every
command below was re-run in this checkout on 2026-09-27 and its output read
before the sentence around it was written". No command produced this one.
**Disposition: (i).**

**M2 - REQ-6's pass condition binds the wrong object, and both halves are
demonstrably wrong right now.**
**Class: a pass condition whose instrument measures something other than what it
protects.** **NEW.**

REQ-6 (`:510-513`): "**Instrument:** `git status --short` against the wave's file
list at the wave gate, plus `@(Get-Content src/app/actions/grading.ts).Count`
unchanged at 941. **Direction of failure:** the wave fails if
`src/app/actions/grading.ts` appears in `git status --short`."

Measured this pass:

    $ git status --short          ->  M src/app/actions/grading.ts   (a sibling agent holds it)
    $ wc -l src/app/actions/grading.ts                 -> 941
    $ git show HEAD:src/app/actions/grading.ts | wc -l -> 941

So **right now**: the file IS in `git status --short` (REQ-6 would fail the wave
for a sibling's work), and its line count IS unchanged at 941 **despite being
modified** (REQ-6's other half would pass a real edit). Both halves fail, in
opposite directions, against the same file on the same day. A repo-wide
`git status --short` filtered on one filename cannot distinguish "this wave
touched it" from "someone else holds it" - the scope itself knows this and says
so for disjointness in 10.1 ("intersected mechanically ... not eyeballed"), then
does not apply it to REQ-6. **Disposition: (i)** - the correct object is the
wave's own diff (e.g. `git diff --name-only` against the wave's start commit, or
the wave-gate intersection 10.1 already mandates), and the count check must be a
content hash or a diff, not a line count.

**M3 - REQ-4's instrument cannot distinguish "the count is read" from "the count
is rendered when non-zero", and the residual that would catch it reads the
rendered number.**
**Class: a pass condition narrower than the defect it closes.
REPEAT-OF round 1's B5.**

REQ-4's requirement is "The surface renders `unkeyableEntryCount` whenever it is
non-zero, in the same sentence as the denominator". Its Instrument is "a
source-text wiring assertion that the surface's render path reads
`unkeyableEntryCount`". A source-text test cannot see "whenever non-zero" or
"in the same sentence" - it can only see the identifier, and
`const { unkeyableEntryCount } = report;` satisfies "reads". Nothing here
renders.

The compounding part is what makes it MAJOR rather than minor: **RES-2's
direction of failure is "Fails if that number is non-zero for a course the owner
expects history for."** If the render is broken or inverted, the owner sees
nothing, reads it as zero, and RES-2 closes clean. The one instrument outside
the suite is pointed at a number that the suite cannot prove is on screen.
RES-1 covers legibility, not presence. **Disposition: (i)** - pin the render
site, not the identifier: assert the identifier appears inside the JSX return
region and inside the same expression as the denominator field, with a canary
fixture where it appears only in a destructure and the checker must fire.

**M4 - the CSS orphan ratchet is exact BOTH ways, and the scope's own
zero-new-CSS recommendation is the thing that makes the count FALL.**
**Class: a one-directional reading of a two-directional gate.** **NEW.**

Section 6.2's "Zero new CSS" paragraph cites
`page-module-css-orphan-classes.test.ts:290` (`PINNED_ORPHAN_CEILING = 120`,
exact - `grep -n "PINNED_ORPHAN_CEILING" <path>` -> `290, 334, 336, 337, 339,
340, 342, 343, 344, 346, 351`) as a reason reusing existing classes is safe. Open
`:346-351`:

    expect(totalOrphanCount, message).toBeLessThanOrEqual(PINNED_ORPHAN_CEILING);
    // ... Fail loudly on drift too ...
    expect(totalOrphanCount, message).toBe(PINNED_ORPHAN_CEILING);

`toBe`, not `toBeLessThanOrEqual`. The message at `:343-344` says so in words:
"Orphan count FELL ... lower `PINNED_ORPHAN_CEILING` ... in this same change".

And the recommended plan aims straight at the falling direction. `AskAiModal.tsx`
imports `../../page.module.css` at `:12`, and the scope tells the new modal to
follow it exactly. `docs/css-orphans.md:58` (generated by that same test,
`:354`): **`src/app/page.module.css` has 110 orphan candidates of 544 defined
classes** - of a repo-wide total of 120 at `:19` - and the list at `:60-73`
includes a whole modal family (`.chatModal`, `.chatModalHeader`,
`.chatModalClose`, `.chatModalMessages`, ...). A new modal that reuses any one of
those 110 makes the count fall, and the wave goes RED until the pin is lowered
in the same commit. Section 10.2's branch-(A) write set says nothing about it.

This is `traps-spec.md`'s own recorded collision ("a rule that prevented a count
rising but not falling once collided with a chunk whose own criteria made that
count fall"). **Disposition: (i), wave 2 only** - add
`page-module-css-orphan-classes.test.ts` to wave 2's write set with the
obligation to lower the pin to the measured value in the same commit.

**M5 - REQ-8's "reuse" cannot be an import in this repo, and the scope never
says the walker must be duplicated.**
**Class: an obligation discharged by citing a file without stating how the
receiver obtains it.** **NEW.**

REQ-8 says "**Instrument:** that walker, run over the new roots." The cited
walker lives inside a `*.test.ts` file, and that file's own header (`:23-25`)
records the rule: "DUPLICATED, not imported, from
`canvas-client-boundary.transitive.test.ts` - this repo's own rule forbids
cross-test-file imports (re-running that file's describe blocks as a side
effect)." An implementer reading REQ-8 literally would `import
{ walkForForbiddenImports } from "../drafted-grades/classTrendsDraft.not-postable.test"`
and silently re-run layer C's whole suite inside the new file. The requirement
must say "duplicate the walker and its three canaries". **Disposition: (i).**

---

## 3. MINOR findings

**m1 - the producer enumeration is a floor presented as the set, and the scope
lists the missing producer itself two sections earlier.**
**REPEAT-OF round 1's B3's class** (an enumeration stated as exhaustive).

Section 4.3 writes "Of the sites that build a `GradingRunEntry` which reaches a
`grading_drafts` row:" and gives eight rows. Measured, the set is nine:
`src/lib/workflows/registry/steps.grading-draft-flow.ts:283-290` pushes a
`GradingRunEntry` (`runs.push({ courseName, assignmentName, canvasUrl:
row.canvasUrl ?? "", ... })`) into `runs` declared at `:224`, stripped at `:329`
and persisted by `saveGradingDraftAction` at `:331`. Section 3.1 of the same
document lists `steps.grading-draft-flow.ts:224` among its eight
`GradingRunEntry[]` hits, so the document saw it and the 4.3 table dropped it.

`grep -rn "runs.push(" src --include=*.ts --include=*.tsx | grep -v "\.test\."`
-> 8 hits, of which 4 are `src/lib/docx.ts` (unrelated `TextRun`s) and 4 are
grading producers (`cartridge:224`, `draft-flow:283`, `grading-run:497`,
`grading-run:554`). Canary: the same grep for `runsZZZ.push(` exits 1.

**The conclusion survives.** Draft-flow's plan rows come only from LMS-bearing
tiles (`:148 const withLms = tiles.filter((t) => (t.canvasUrl ?? "").trim())`,
with `:136`'s comment saying offline tiles "are SKIPPED entirely"), so its
`canvasUrl` is non-empty and it is not a fifth empty-url producer. The "four
draft-reaching producer sites emit an empty `canvasUrl` with `offline`
undefined" count is correct, and RES-2's four named sites are correct.
**Disposition: (i)** - add the ninth row.

**m2 - "`.eq("user_id", userId)` at `:302` is its only filter" is false.**
Section 3.2 item 3. `git show HEAD:src/lib/grading-drafts.ts | grep -n
'\.eq('` -> `getGradingDraft`'s filters are `:302 .eq("user_id", userId)` **and
`:303 .eq("id", id)`**. The point being made (no status filter) survives.

**m3 - `classTrendsRunCohort.ts`'s barrel warning is at `:26-29`, cited as
`:24-27`.** REQ-10 (`:879-881`). `sed -n '24,29p'` shows `:24` is the tail of a
different warning ("killing the disclosure line below."), `:25` is a bare `//`,
and the barrel sentence runs `:26-29` - so the cited range's first two lines are
a different claim and it omits the two lines carrying the reason. The file is 181
lines (`wc -l` -> 181), as stated.

**m4 - "10 lines across three existing files" is 12 by the precedent it says it
counted.** Section 6.2. Measured from the `AskAiModal` precedent: `CourseRow.tsx`
carries it at `:82` (props type), `:126` (destructure) and `:687-689` (the
three-line `<button>`) = **5 lines**, not 3. `CoursesTable.tsx` `:160`, `:203`,
`:734` = 3, correct. `CoursesTab.tsx` `:28` (import), `:88`, `:367`, `:448` = 4,
correct. Total 12. The claim is labelled "counted from the precedent rather than
estimated".

**m5 - section 5.3 overclaims what REQ-7 bounds.** "what is required instead is a
bound on what the aggregate can carry" - REQ-7's Object is "the reducer's source
text", so it bounds what the *reducer reads*, not what the aggregate carries. The
whole payload (including every `student` name and `feedback` string, kept by
`stripGradeResultForDraft` at `grading-review-rows.ts:48` and `:61` - both exact)
still reaches the browser under REQ-6. The scope is honest that the over-fetch is
accepted; only this sentence is wrong.

Also: if wave 10.1's reducer folds `AreaTrend` values (as 10.1 says) rather than
raw `rubricAreas`, it touches no `GradeResult` field at all and REQ-7 is
satisfied vacuously - which is fine, but worth the implementer knowing so they
do not contort the design to make REQ-7 meaningful.

**m6 - two of section 2's citations went stale AT HEAD during this check.** Not
an artifact defect - the scope's figures were correct at its own commit, e25e56d
- but they are wrong now, and wave 1's write set is one of the two files:

    # early in this pass (e25e56d at HEAD, a sibling holding the file uncommitted)
    $ wc -l src/lib/grading-drafts.ts                    -> 384
    $ git show HEAD:src/lib/grading-drafts.ts | wc -l     -> 377
    PS> @(Get-Content 'src/lib/grading-drafts.ts').Count  -> 384

    # after the sibling committed, measured at the end of this pass
    $ git log --oneline -1   -> 2b5b4c7 feat(a39): provenance on all three producers ...
    $ wc -l src/lib/grading-drafts.ts -> 384    (scope's section 2 table says 377)
    $ grep -n "^export interface GradingRunEntry" src/lib/grade/types.ts -> 379
                                                (scope's section 2 says 362)

So `grading-drafts.ts` is 384 and `GradingRunEntry` is at `:379` at HEAD now.
Every `grading-drafts.ts` line number in section 3.2 (`:248, 254, 255, 272, 280,
281, 295, 302, 344, 361, 373`) and section 10.1 (`:254, 280, 302, 344, 361,
373`) shifts with it - I verified all of them against e25e56d, where they were
exact. This is round 1's m4 recurring on schedule ("a revision that re-cites
without re-measuring will now be wrong"). Wave 1's write set includes
`src/lib/grading-drafts.ts` and `src/lib/grading-drafts.test.ts`, so section
10.1's own instruction to intersect the write set mechanically at dispatch time
is correct, mandatory, and must be paired with re-deriving those line numbers
rather than pasting them.

**m7 - `docs/loop/this-repo.md` is NOT stale on the counter gap, contrary to the
brief.** Stated because the brief told me to treat four figures as stale and one
of them is not. `sed -n '1,12p' docs/loop/this-repo.md` reads "disagree - by 42
on the file below, and RE-MEASURED 2026-09-23 ACROSS 13 FILES, by anywhere from
15 to 138 ... So 42 is the smallest recorded gap and not the worst case". The
scope's paraphrase at `:160-163` is exact. The other three brief-flagged
staleness items ARE real and the scope handles all three correctly (see section 5).

---

## 4. Withdrawal audit (the brief's highest-value item)

Entry gate 3 requires this before reading the round on its own terms. The table
is at `docs/a25-scope.md:69-97`; it has **27 data rows**, and its summary count
is wrong (M1). On the substantive question the brief asked - **did any withdrawal
quietly drop a requirement round 1 raised, and did any withdrawal remove an
executing enforcer?** - I checked all 14 withdrawals and every round-1 finding.

**Result: the claim holds. No withdrawal removes an executing enforcer, and no
round-1 finding was silently dropped.** The count is wrong; the substance is not.

Enforcer checks, each with its command:

| Withdrawn item | Could an executing test have been protecting it? | Measurement |
|---|---|---|
| `deleteGradingDraft` "one caller, never automatic" | **No.** No test asserts a caller count | `grep -rn "deleteGradingDraft" src --include=*.test.ts` -> 6 hits, all `vi.fn()` mocks of `deleteGradingDraftAction` in four `steps.grading-repos.*.test.ts` files; none asserts how many callers exist. Canary: the same grep for `deleteGradingDraftZZ` exits 1 |
| "nothing reads a reviewed row back" | **No.** `grep -rn "listReviewedGradingDrafts" src` exits 1; canary `grep -rln "listPendingGradingDrafts" src \| wc -l` -> 5 | correct as the scope states |
| Sec 2.2 Option A / Option B (raw `courseName` key) | **No.** No test compares `courseName` for identity | `grep -rn 'eq("status"' src --include=*.test.ts` exits 1 and `grep -rn "courseName ===" src --include=*.ts --include=*.tsx \| grep -v "\.test\."` -> 2 hits, neither an identity comparison (round 1 established this; it reproduces) |
| Sec 2.4 the privacy foreclosure | **No.** Settled by RULING 59; not re-argued here | - |
| Sec 3.1 Candidate 1 (the `effectiveCourseFilter` gate) | **No.** Nothing renders | `docs/loop/seats.md:56`, `this-repo.md` section 2 |
| Sec 3.1's misattributed 1000-line ceiling | **No - and the real enforcer is correctly named and still executing** | `grep -n "RecordingTab" src/file-size-ceiling.structure.test.ts` -> `31` (comment) and `52` (inside `COVERED_BY_RECORDING_SPLIT_CHECK`); `sed -n '56,62p' src/app/components/recording/recording-split.structure.test.ts` -> `58: it("should keep RecordingTab.tsx under 1000 lines"`. Both exactly as the scope says |
| Sec 4 "`DraftedGradesTab`'s own three" `ta-drafts` keys | **No.** No test names any `ta-drafts` key | `grep -rn "ta-drafts" src --include=*.test.ts` exits 1 with no output. Canary that the literal is greppable at all: `grep -rln "ta-drafts" src` -> `DraftedGradesTab.tsx`, `home/useAppNavigation.ts` |
| Sec 5 CORPUS-is-earned / sequence after N13b | **No.** `blocked_by: []` is unchanged from HEAD, so nothing the backlog structure test reads changed | `grep -n "id: 'A25'" docs/backlog.yml` -> `457`; canary `grep -n "id: 'A25ZZZ'"` exits 1 |
| R-A25-2 / -4 / -6 (promoted) | **No.** All three were residuals with no instrument, which is why they were promoted | round 1 M7/M8/M9, reproduced |
| R-A25-7 (withdrawn as duplicate) | **No.** Its instrument was "reading claims only" | round 1 M9 |

Round-1 findings, each traced to a surviving home: B1 -> RULING 59 row.
B2 -> RULING 60 row + section 6.1. B3 -> section 4 (REQ-1..4). B4 (the
`entry.courseName ===` phantom instrument) -> moot, its home section 2.2 is
withdrawn wholesale. B5 -> REQ-8 (which is now B1 of this round).
M1 -> section 3.3 + the owner question. M2 -> section 6.1's corrected figures
(measured: `grep -n "toHaveLength(12)\|toHaveLength(11)\|panelTargets.size"
src/app/components/recording/recording-split.structure.test.ts` -> `143, 198,
230`, exactly as the scope now states, and `this-repo.md:153` still prints the
stale `132/187/219`; canary `grep -n "toHaveLength(9999)"` exits 1).
M3 -> the exemption row. M4 -> section 7's DECISION 3 obligation (verified
verbatim at `docs/owner-decisions-2026-09-23.md:99-100`). M5 -> section 10.1,
honestly unresolved rather than papered over. M6 -> section 8.
M7/M8/M9 -> section 11's five-field register. m1 -> the "four, not three" row.
m2 -> REQ-7 (`student` now named). m3 -> superseded by this revision's own
canary discipline. m4 -> section 2's re-measurement.

**One round-1 finding is answered less completely than the table implies**, and
it is worth the orchestrator's attention because it is the M5 caller rule:
section 10.1 states plainly that **wave 1 still does not satisfy the caller
rule** and offers two dispositions rather than fixing it. That is honest and
correct - but the disposition table's row reads "**KEPT, and revision 1 violated
it** ... Fixed in section 10 by putting the reducer's caller in wave 1", and
section 10.1 says the opposite in its own words ("this wave does not satisfy it
on its own"). Those two sentences contradict. The section 10.1 version is the
true one. **Recorded as part of M1's class** (a summary written without
re-reading what it summarises) rather than as a separate finding.

---

## 5. What is sound - stated once, not padded

I verified these and am not re-litigating them.

- **The RULING 61 correction is right, and it is load-bearing.** I re-measured
  every row of the producer table at `:417-424` by `sed -n` on each file: online
  `grading-run.ts:497-505` (`row.canvasUrl ?? ""`, no `offline`); offline
  `:554-560` (`""` at `:557`, `true` at `:559`); `grading-cartridge.ts:216-223`
  (`""` at `:219`, `true` at `:221`); `grading-repos.grade-repo.ts:462-469`
  (`""` at `:465`, no `offline`); `grading-repos.helpers.ts:339-347`
  (`canvasUrl: assignmentUrl` at `:342`, and the caller passes `assignmentUrl:
  ""` at `:428`); `grading-repos.ts:271-277` (`""` at `:274`) and `:321-327`
  (`""` at `:324`); `actions/grading.ts:312-320`
  (`${baseUrl}/courses/${courseId}/assignments/${assignmentId}` at `:315`).
  **Four sites emit an empty `canvasUrl` with `offline` undefined - confirmed.**
  `grep -c "offline" src/lib/workflows/registry/steps.grading-repos.ts` -> `0`,
  exit 1; canary `grep -c "GradingRunEntry"` on the same file -> `4`. RULING 61's
  "distinguishing flag" is indeed false for four of them, and the seat was right
  to correct a ruling with measurement.
- **The replacement definition covers every producer, including the ninth the
  table missed** (m1). REQ-3 defines the remainder as `parseCanvasCourseId(
  entry.canvasUrl) === null`, which is a property of the *stored value*, not of
  the producer - so it is producer-independent by construction, which is
  strictly better than an enumeration. `src/lib/canvas-url.ts:87-90` is exactly
  as cited (`url.match(/\/courses\/(\d+)/)` at `:88`).
- **`courseId:` in `steps.grading-run.ts` is at `62, 110, 200, 223, 398`** -
  exactly the five the scope prints, with `:110` carrying `courseId: "", // no
  local tile`. The Option-B gap is real.
- **REQ-2's do-not-reuse argument is correct.**
  `findCourseForCanvasUrl` at `:292`, the two `if (!normalizedAcronym) return
  null;` at `:351` and `:369`, `function hostOf` unexported at `:106`, the
  host-less `/courses/<id>` doc comment at `:193`, the header's "never raw string
  equality" at `:3` and "COURSE ID must match on both sides ... full stop" at
  `:180` - all exact.
- **Section 3.1's absence claim reproduces with canaries.** `grep -rn
  "GradingRunEntry\[\]" src --include=*.ts --include=*.tsx | grep -v "\.test\."`
  -> 8, at exactly the eight sites listed. `grep -rn "Array<GradingRunEntry" src`
  exits 1. `grep -rln "trend\|Trend" src/lib/course-intel/` exits 1;
  `grep -rln "grading_drafts\|grading-drafts" src/lib/course-intel/
  src/app/api/course-intel/` exits 1; canary `grep -rln "supabase"
  src/lib/course-intel/ | head -3` returns three files. The feature-already-
  exists case is correctly argued at its strongest and correctly rejected: a
  cross-assignment course-scoped reducer with stated denominators and no model
  call DOES exist (`concern.ts`, `computeEngagementSet` at `engagement.ts:435`,
  `types.ts:189` and `:555`, `ask/route.ts:525/:777/:868`, `page.tsx:20/:662` -
  all exact), and it carries no rubric-area vocabulary.
- **Section 3.2's three corrections are all correct**, at HEAD line numbers:
  `.eq("user_id")` at `254, 280, 302, 344, 361, 373`, `.eq("status")` at
  `255, 281`, `listPendingGradingDrafts` `:248`,
  `findPendingGradingDraftForWorkflow` `:272`, `getGradingDraft` `:295`,
  `getGradingDraftAction` `:374` with `status: "pending" | "reviewed"` at `:380`,
  `deleteGradingDraftAction` `:424` calling `:430`, `DraftedGradesTab.tsx:193`,
  `findEquivalentOrReplaceableDraft`'s `deleteGradingDraftAction` at
  `grade-repo.ts:127`, and the attended discard step at `grading-repos.ts:133`
  inside the block opening at `:118`.
- **Section 6.1's Drafted Grades case is airtight**: `:151`/`:173`, `:362`,
  `:368`, `:485-490`, `collectCourseNames` `:53-62` adding at `:57`,
  `resolveEffectiveCourseFilter` `:78-81` with its doc comment `:71-77`. All
  exact. RULING 60 is applied correctly.
- **Both line-count instruments agree on all 24 files in section 2's table.**
  I re-ran `wc -l` over all 24 in one command: 23 of 24 match the scope exactly;
  the one exception is `src/lib/grading-drafts.ts` (m6), and `git show HEAD:` of
  that file returns 377, the scope's figure. `find src -name "*.wiring.test.ts"
  | wc -l` -> **79**; `find src -name "*.structure.test.ts" | wc -l` -> **22** -
  the scope's own re-measurement, confirmed, and `this-repo.md:119-120`'s 68/17
  correctly not quoted. `src/app/actions/grading.ts` is genuinely absent from
  `ALLOWED_OVERAGE` (read in full, `:75-93`: four entries, all `*.test.ts`), so
  the 59-line headroom is right.
- **The wire-boundary passage is quoted with its scope correctly stated** and
  correctly not turned into a foreclosure (`offline-payload.ts:11-18` and
  `rubricAreas: []` with its reason at `:207-210`, both exact; the
  `grading-row-serialization.ts:308-317` "never reaches storage" passage exact).
  This is the traps-spec rule added on 2026-09-27 being obeyed.
- **The leverage narrowing is correct against `leverage.md` as it stands.**
  GUARANTEED is at `:42` and its definition ("an output property the code holds
  regardless of what the model returns - including holding it by making no model
  call at all") fits a count with no model call. The struck Click-cost row is at
  `:64` and says what the scope says it says. `:146-149` is the removal-test
  rule. `:151-165` records the 5-passing-to-4-passed/1-failed sabotage. The
  `class-trends.ts:8` "No model call, no network, no storage" header is exact, as
  is `a39-research.md:554` and `:566`. **The drift claim is also right**:
  `leverage.md:42` cites `:773-781` and `:864-871` while
  `sed -n "525p;777p;868p" src/app/api/course-intel/ask/route.ts` puts
  `computeConcernSet` at `:777` and `unexplainedStudentIndices` at `:868`.
  One substantive caveat, stated rather than scored: the `rubricAreas` the count
  ranges over were themselves produced by a model, so the guarantee is over the
  *count*, not over the areas. The scope's wording ("A25's number is the count or
  it is red") is careful enough that this is not a defect - and cross-run area
  identity is already handled, because `AreaTrend.area` is the normalized key
  (`class-trends.ts:125-126`, "Normalized area key (normalizeAreaName), used for
  grouping"), which 10.1's "fold each group's per-area `AreaTrend` values"
  inherits. An implementer who instead re-reads raw `rubricAreas` must normalize;
  worth one sentence in the plan.
- **Section 7's persistence measurement is exact.** `grep -rnoE 'const [A-Z_]+ =
  "ta-[a-z0-9-]+"' src/app/components/courses/` -> **9** declarations at
  `CoursesTable.tsx:50,51,52`, `WeeklyChecklistCell.tsx:160`,
  `WeeklyChecklistOverviewModal.tsx:84-88`. Canary with prefix `"zz-` -> 0.
  `grep -rn "ta-courses\|ta-weekly-checklist" src --include=*.test.ts` -> exactly
  one line, `home/useAppNavigation.test.ts:102`, pinning `ta-courses-section` (a
  navigation key). `grep -c "it("
  src/app/components/courses/weekly-checklist-overview-window.test.ts` -> 19, and
  `grep -n "ta-"` on it returns nothing. DECISION 3 (`:99-100`), DECISION 9
  (`:237-244`) and DECISION 10 (`:247-250`) are all verbatim. REQ-12's
  recommendation (ship with no control, making it vacuous) is the right call.
- **The migration and strip-allowlist citations are exact**: table `:7-15`, index
  `:17-18`, RLS `:20`, policies at `:23/28/33/38`, no index on `status`;
  `stripGradeResultForDraft` at `:40` with `const shared = {` at `:47` and
  `student/overallComment/strengths/improvements/resubmitNotice/rubricAreas/
  totalScore/feedback/mergedFileCount` at `:48/49/56/57/58/59/60/61/62`.
  `grep -rln "grading_drafts" supabase/migrations/` -> 4 files.
  `buildAreaSummary` at `:207` with its per-submission string at `:208`;
  `AreaTrend` `:124-153`, `ClassTrendsReport` `:155-174`, `classifyDirection`
  `:184`, thresholds at `:114-115`; `rubricAreas` read only at `:288`
  (`grep -n "rubricAreas" src/lib/grade/class-trends.ts` -> `267, 269, 284, 288`).
  The `DEFAULT_MAX_SUBMISSIONS` staleness correction is right
  (`grep -n "DEFAULT_MAX_SUBMISSIONS" src/lib/gemini.ts` -> `32:const
  DEFAULT_MAX_SUBMISSIONS = 40;`, against `class-trends.ts:18`'s "(5)").
- **No gate or instrument in the document runs two or more test paths through a
  bare runner.** I checked explicitly, because the brief asks. The only
  multi-path command is section 14's, and it uses the wrapper. I then EXECUTED
  the document's own closing gate plus the gate that polices exactly this:

      $ npm run test:paths -- src/tools/vitest-paths/gate-commands.structure.test.ts \
            src/lib/no-emojis.test.ts src/source-bytes.structure.test.ts
      EXIT=0
      Test Files  3 passed (3) / Tests  49 passed (49)
      COVERED src/tools/vitest-paths/gate-commands.structure.test.ts files=1 passed=28
      COVERED src/lib/no-emojis.test.ts files=1 passed=18
      COVERED src/source-bytes.structure.test.ts files=1 passed=3

  Exit code read from the command, not through a pipe. The `COVERED` lines prove
  no path was silently dropped. `gate-commands.structure.test.ts` holds a frozen
  exact-both-ways set of raw multi-path hits across `docs/**/*.md` (`:206-211`,
  "15 hits in 8 files"), and it passes with `docs/a25-scope.md` present - so the
  document introduces none. `no-emojis.test.ts:237/:254` confirm the scan covers
  `docs/*.md`, both exact.

---

## 6. Dispatchable as it stands / not dispatchable

**DISPATCHABLE NOW, unchanged:**

- **Section 3** (what exists; the reuse survey; the durability argument) - a
  reference, not a work item, and accurate.
- **Section 4.1-4.2: REQ-1 and REQ-2.** Both instruments execute, both go RED on
  the mutation they name, and REQ-1's is the pure-function test round 1 asked for
  by name. REQ-2 is dispatchable *as a requirement on the reducer's imports*; it
  is what collides with REQ-8, and REQ-2 is the half that should survive.
- **REQ-3** (count, never drop, the unkeyable). The strongest requirement in the
  document: producer-independent by construction, and its instrument is a
  three-entry unit test with the right direction of failure ("RED if the count is
  derived from `entry.offline` rather than from the parse result").
- **Section 10.1's wave-1 write set**, with three amendments that are not
  optional: (a) REQ-5's instrument changed per B3, (b) the population stated per
  B3 half B, (c) the disjointness intersection re-run at dispatch, because
  `src/lib/grading-drafts.ts` is currently held by a sibling (m6).
- **RES-3, RES-4** and the five-field register discipline in section 11.

**DISPATCHABLE ONLY WITH THE NAMED REPAIR (all (i)):**

- **REQ-5** - repair per B3: assert the *rows returned*, not the eq-pairs.
- **REQ-6** - repair per M2: the object is the wave's own diff, not repo-wide
  `git status --short` on a filename, and not an absolute line count.
- **REQ-4** - repair per M3: pin the render region, not the identifier.
- **REQ-11** - repair per B2: add the two assertions over `CoursesTab.tsx`'s
  handler. With them, REQ-11 becomes a genuine reachability instrument and
  section 6.2 is the correct answer to RULING 60.

**NOT DISPATCHABLE:**

- **REQ-8, and REQ-9's walker half** (B1). Needs a decision on the ban's
  boundary and on whether the surface can be a root. Until then the leverage
  claim in section 8 has **no removal test**, which is the same position round 1
  left it in.
- **Sections 6.2 / 6.3 / 7 / 10.2 / 10.3** - the scope already marks these NOT
  DISPATCHABLE pending the branch answer, and that is correct. Add M4's orphan-
  ratchet obligation to wave 2's write set when it unblocks.
- **REQ-12** - already correctly gated behind the branch, and correctly
  recommended into vacuity.

---

## 7. The question that must go to the owner INSTEAD of being fixed

Section 13's question cannot be sent as written (B4). Two things are wrong with
it: branch (B) is not terminal, and the recommendation's own cost list is
incomplete in a way that would change an owner's answer. Shaped so **every
answer ends the activity**:

> **A25 folds your stored grading runs into a per-course, per-rubric-area trend
> over a term. It is ready to build as its own layer, opened from a course's row
> in the Courses tab where "Ask AI" opens from today. The alternative - folding
> it into Course Intel instead - is not a smaller version of the same item; it is
> a different item, because Course Intel's answer is model prose and its code
> reads Canvas, so the counted number would have to be re-built as a receipt over
> that prose and the guard that keeps the count model-free cannot be pointed at
> that surface at all (measured: an import ban rooted at
> `src/app/api/course-intel/ask/route.ts` reports 10 violations today, including
> the route's own `@/lib/llm`). Five of the twelve requirements would have to be
> re-written, not inverted.
>
> So: **(A)** build A25 as its own layer off the Courses tab, as scoped - **or
> (B)** close A25 and file the Course Intel version as a new row, to be scoped
> from scratch.
>
> **Recommendation: (A).** **Cost of being wrong:** two per-course trend surfaces
> the instructor reaches differently, both computing "which runs belong to this
> course" with the same function on the same field (`parseCanvasCourseId` on a
> stored `canvasUrl`), which is what keeps the disagreement bounded.

Under (A), this scope ships as it stands with the repairs in section 6 applied
and B1 routed to the wave-2 architect as a stated residual. Under (B), A25 closes
and nothing here needs re-deciding, because nothing here gets applied. Either
answer terminates.

**One further decision belongs to the orchestrator, not the owner, and not to
another round:** the boundary of REQ-8's import ban (B1). Three options are
listed there; each is a one-line ruling; none is a seat revision.

---

## 8. Stopping point

**Rulings, then measurement - in that order.**

- **B1 is rulings.** The ban's prefix list and root set are a boundary decision.
  No seat revision settles whether `lib/canvas-url.ts` should be inside a ban
  written to stop Canvas *writes*, and `iteration-caps.md`'s routing table says
  when the stopping point is rulings the orchestrator rules and does not
  re-dispatch the author.
- **B4 is rulings**, and it lands on the orchestrator's own question. That is the
  outcome cap 2 was written to produce.
- **B2, B3, M2, M3, M4, M5 are measurement** - each is a named change to a named
  instrument, with the mutation it must catch written down, buildable by an
  implementer without re-deciding anything.
- **M1 and the minors are mechanical.**

Nothing here is *design* in the sense that would need another scope. The design
- the host, the join key, the counted remainder, the denominators - survived this
round. The instruments did not.
