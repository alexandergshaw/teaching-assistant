# Adversarial check: `docs/a39-incremental-fill-architecture.md`

Round 1 of at most two. Subject committed at `3762538`, 1256 lines.

**VERDICT: NOT BUILDABLE as written.** 8 blockers, 10 major, 8 minor. Seven of
the eight blockers are render-only or instrument-only: they build, pass lint,
`tsc`, `next build`, every structure test and every vitest path, and produce a
surface an instructor cannot use. The design's own named weakest link is not the
weakest link, and section 5.2's central argument - that the mount count "is not
a proxy for exclusivity; it is exclusivity, restated" - is false at repo scope.

The SHAPE is right and should not be re-litigated. One header, one machine, one
mount, `reconcileRun` reused rather than re-implemented, tier 1 / tier 2 split,
and the refusal of both an `AbortController` and a third `stoppedBy` member are
all sound and I attack none of them. What fails is the DATA IDENTITY of the
object the fill feeds to `GradingResults`, the SCOPE of the instrument that is
supposed to make the double table unrepresentable, the ORDERING assumption under
the column union, and four places where a channel or a spender has no failure
path.

---

## 0. What I did and did not run

`git status --short` at the START of this pass:

```
 M src/lib/syllabus-upload-source.test.ts
 M src/lib/syllabus-upload-source.ts
?? docs/ruling-130.md
```

All three belonged to the live implementer on RULING 130 and none was touched
here. `git status --short` at the END of this pass:

```
?? docs/a39-incremental-fill-architecture-check.md
```

The difference is NOT my doing: that implementer's work landed during this pass
as `1e68edf` ("fix(sec): the third and last traversal site"), whose three files
are exactly the three that were dirty at the start
(`git show --stat --oneline 1e68edf`). **My write set is this one untracked
document.** Nothing under `src/` or `supabase/` was written, edited or reverted
by this pass; no `git stash`, no `git add -A`, no `git checkout --`.

This document is 906 lines on both counters
(`wc -l` -> 906; `@(Get-Content ...).Count` -> 906), ASCII, no BOM (first three
bytes `23 20 41` via `[IO.File]::ReadAllBytes`). `docs/` is out of
`src/file-size-ceiling.structure.test.ts`'s scope (`:114`, rooted at
`path.resolve(repoRoot, "src")`).

**I ran no vitest, no `npx tsc` and no `npm run build.`** `tsc` and `build` were
skipped because they are single-caller resources and an implementer is live
(instructed). vitest was skipped because every instrument I would want to prove
red requires editing production source to apply the mutation, which is outside
my write set. **Where I claim a test would go red I NAME THE MUTATION and say
so.** Where I claim a line says something, I opened it.

Sizes, both counters, run separately at the head of this pass:

| Path | `wc -l` | `@(Get-Content <path>).Count` | Doc says |
|---|---|---|---|
| `src/app/actions/grading.ts` | 946 | 946 | **941 - STALE** |
| `src/lib/grade/engine.ts` | 487 | 487 | **476 - STALE** |
| `src/lib/grade/extraction.ts` | 353 | 353 | **311 - STALE** |
| `src/app/components/GradingTab.tsx` | 620 | 620 | 620 |
| `src/app/components/GradingResults.tsx` | 906 | 906 | 906 |
| `src/app/components/grading/incrementalRunPlan.ts` | 199 | 199 | 199 |
| `src/app/components/grading/useIncrementalGradingRun.ts` | 192 | 192 | 192 |
| `src/app/actions/grading-incremental.ts` | 141 | 141 | 141 |
| `src/app/api/grade-run-item/route.ts` | 192 | 192 | 192 |
| `src/lib/grade/reconcile.ts` | 106 | 106 | 106 |
| `src/lib/grade/types.ts` | 432 | 432 | 432 |
| `src/app/page.tsx` | 703 | 703 | 703 |
| `docs/a39-incremental-fill-architecture.md` | 1256 | 1256 | 1256 |

The two counters agree on all thirteen. The three stale rows are `2f06261`'s
doing and the document could not have known them; the consequence is M1.

**Counting discipline.** No decision below rests on a bare `grep -c`. Every
count that decides something was taken twice by independent instruments: the
`<GradingResults` mount set from `grep -rn "<GradingResults"` across `*.tsx`
AND from the import sites (`grep "import GradingResults"`, three importers);
`formAction` from `grep -c "formAction"` (6, which COUNTS PROSE - a prop
declaration at `:60`, a destructure at `:83`, two comments at `:177` and `:319`)
cross-checked against `grep -n "formAction("` (2 real call sites, `:180` and
`:206`). The 4.3x-style gap is right there in this file: 6 against 2.

---

## 1. BLOCKERS

### B1. Per-arrival run identity destroys the instructor's work on arrived rows

**Class: RUN-IDENTITY-RESET. NEW.**

**This is the design's actual weakest link and the document does not mention it
anywhere.**

`GradingResults.tsx:220-230`:

```
220:  if (run !== prevRun) {
221:    setPrevRun(run);
222:    setEdits(correctUngradedSeeds(run, loadGradingResultsEdits(canvasUrl, run, editsSurface)));
223:    setPostStatus({});
224:    setPostSummary("");
225:    setExpandedBox(null);
226:    setCodeRuns({});
227:    setCodeRunning({});
228:    setCodeOutputStudent(null);
229:    setBrowseFilesFor(null);
230:  }
```

This is a REFERENCE comparison. The fill makes `run` a **new object on every
arrival** - section 6.1's `buildIncrementalRun` returns a fresh literal, and
section 10 states the intent explicitly ("Computing it on each arrival and
storing the result in state"). So on every row that lands, `GradingResults`
concludes a new run arrived and resets seven pieces of local state:

- `setExpandedBox(null)` - the expanded feedback box the instructor is TYPING IN
  collapses. Not persisted anywhere.
- `setBrowseFilesFor(null)` - an open "Browse all files" panel closes.
- `setPostStatus({})` / `setPostSummary("")` - the "Posted to Canvas" receipt on
  a row the instructor already posted vanishes, inviting a double post.
- `setCodeRuns({})` / `setCodeRunning({})` / `setCodeOutputStudent(null)` - a
  code-run output is discarded and an in-flight run's spinner state is lost.
- `setEdits(...)` re-reads from storage. That one mostly survives, because
  `GradingResults.tsx:235-237` persists on every `edits` change - but it is a
  reload, not a no-op, and it is the only one of the seven with a safety net.

On a 20-submission run this fires up to 20 times, every few seconds. **The
feature's entire premise is that the instructor works on early rows while later
ones land.** Built exactly as specified, they cannot.

Section 8 item 9 - "`GradingResults.tsx`. Not edited. At 906 lines it has 94 to
the ceiling, and the fill needs nothing from it: `banner` and `run` already
carry everything" - is the load-bearing false statement. The fill needs
`GradingResults` to distinguish "a new run" from "the same run, one row longer",
and it cannot.

**Nothing in this repo can see it.** vitest is node-env and renders no
component, so no gate exists or can exist. Group A goes fully green.

**The named mutation, for whoever fixes this:** there is no mutation that turns
an existing test red, and that is the finding. The instrument has to be new and
it has to be a reading instrument or an owner walk. The cheapest honest one: a
source-text assertion that `GradingResults.tsx`'s adjust-state-on-prop-change
guard is keyed on something other than run IDENTITY (a run token, a result
count, or an explicit `runKey` prop), plus owner-walk step "type a comment in
row 1, wait for row 2 to land, check the text is still there."

I do not prescribe the fix. Three shapes exist (a stable `runKey` prop; splitting
the reset into per-field conditions; hoisting `edits` out) and choosing among
them is a design decision, which is why this is a blocker rather than a note.

### B2. F5's object is one file; a third mount on the same edits surface is outside it, and the guard that actually enforces exclusivity is pinned by nothing

**Class: PROXY-COUNT-AT-THE-WRONG-SCOPE. NEW in this session - but it is the
SAME MECHANISM the document itself diagnoses in RULING 40, one level up.**

Section 5.2 argues the fill's count is categorically better than RULING 40's
`formAction(` count: "That is not a proxy for exclusivity; it is exclusivity,
restated." Measured, it is not.

```
grep -rn "<GradingResults" src --include=*.tsx | grep -v "\.test\."
  -> src/app/components/GithubGradingPanel.tsx:852
     src/app/components/GradingResults.tsx:181      (the definition)
     src/app/components/GradingTab.tsx:548
     src/app/components/GradingTab.tsx:598
     src/app/components/LiveFeedPanel.tsx:433
```

`LiveFeedPanel.tsx:442` is `editsSurface="canvas"`. `GradingTab.tsx:558` is
`editsSurface="canvas"`. **Same edits surface, two components.**
`GradingTab.tsx:551-557`'s own comment says what keeps them apart:

> "this mount and LiveFeedPanel.tsx's own GradingResults mount intentionally
> share GradingTab's `canvasUrl` state and are mutually exclusive in the UI
> (`source !== "livefeed"` above), so they share one edits-storage surface"

Exclusivity rests on the `source !== "livefeed"` conjunct at `:545` (and `:597`),
against `:298`'s `) : source === "livefeed" ? (` which is where `LiveFeedPanel`
mounts. F5 counts elements in `GradingTab.tsx` and pins nothing about that
conjunct. **Section 10's delta table does not list preserving it either** - it
lists deleting `:595-615`, destructuring the hook, `displayRun`/`progressLine`
reads, the banner, `shouldShowEmptyState` and the generated-rubric read. The
guard is not mentioned once in the whole document.

Drop it while merging the mounts and B2 returns in its original form: Auto Grade
populates `state.run` while `source === "livefeed"` (verified below in O3), so
`GradingTab`'s table and `LiveFeedPanel`'s table both render, both over
`editsSurface="canvas"`, both claiming to be the editable one - and **F5 reports
exactly 1, green.** A6 does not help: `autoGradeTransition.wiring.test.ts:183`'s
span clause is scoped to the region containing `styles.loadingState` and
`pending`, not to the results mount.

**Mutation that must be added and watched red:** delete `source !== "livefeed" &&`
from the surviving mount's guard. Today nothing goes red. The requirement F5 is
missing is the conjunct itself: assert the innermost enclosing brace span of the
one `<GradingResults` match contains `source !== "livefeed" &&` (or
`&& source !== "livefeed"`) and no `||`, borrowing A6's own conjunctive test at
`:180-183` rather than a presence check.

The corrective rule here - "pin the guard, not just the count" - is the same rule
the document applies to RULING 40. That is why this is worth having: the document
identified the class and then reproduced it.

### B3. The column union's monotonicity claim is false: arrivals are not in `sourceIndex` order, so an existing column CAN move and CAN be renamed

**Class: MONOTONICITY-ASSUMED-OVER-AN-UNORDERED-STREAM. NEW.**

Section 6.1 specifies `unionRubricAreaNames` as, when `criteriaNames` is empty,
"a first-seen union over arrived rows in **ascending `sourceIndex` order**,
deduped with `normalizeAreaName`", and concludes:

> "A union over a monotonically growing arrival set can only GROW, never reorder
> its existing prefix, so an existing column never moves."

The arrival set grows monotonically. **The `sourceIndex` ORDER over it does
not.** `useIncrementalGradingRun.ts:106` pushes in COMPLETION order from three
concurrent workers (`:119-120`, `INCREMENTAL_CONCURRENCY = 3` at
`incrementalRunPlan.ts:26`). Out-of-order completion is the entire point of the
pool. So:

- **Columns reorder.** Row 5 lands first with areas `[Clarity]`; row 2 lands
  second with `[Structure]`. Union in ascending `sourceIndex` order: after
  arrival 1 it is `[Clarity]`; after arrival 2 it is `[Structure, Clarity]`. The
  column the instructor has already read has MOVED.
- **Column headers are renamed.** Dedup is by `normalizeAreaName`
  (`prompts.ts:19`, which lowercases and strips punctuation) while the displayed
  name is the first-seen RAW spelling. Row 5 arrives with `"clarity"`, row 2 with
  `"Clarity (25%)"`; ascending-index order makes the header flip from `clarity`
  to `Clarity (25%)` after a row has been read.

This is exactly owner-walk item 2's stated failure direction - "a column
appearing, disappearing or reordering after a row has been read" - and the
document names item 2 as "the one whose failure silently changes a grade". It is
reachable BY THE DESIGN AS SPECIFIED, not by an implementation slip.

**The underlying tension the design does not name:** ascending-`sourceIndex`
order buys DETERMINISM (the final column set is independent of arrival order -
which is half of what the owner asked for) and forfeits PREFIX STABILITY.
Arrival order buys prefix stability and forfeits determinism. The document claims
both properties and specifies only the ordering that delivers one. Which to keep
is a design decision; that is why this blocks.

Only the `criteriaNames`-empty branch is affected - but that is the branch
section 6.3 devotes its second bullet to, and tier 1 narrows it without
eliminating it (a GENERATED rubric that does not parse lands here, as 6.3 itself
says).

**Instrument that is missing and is perfectly buildable here:**
`unionRubricAreaNames` and `buildIncrementalRun` are pure. Feed the same arrived
set in two different arrival orders and assert (a) the final `rubricAreaNames` is
identical, and (b) every intermediate prefix is a prefix of the next. Mutation:
the ascending-`sourceIndex` sort - one of (a) or (b) must go red, and which one
tells you which property was chosen. Section 11 routes this entirely to an owner
walk instead; see m8.

### B4. Section 6.1's "load-bearing" justification for recomputing from raw is factually wrong

**Class: LOAD-BEARING-RATIONALE-FALSE. NEW.**

The document's sharpest-sounding claim:

> "Applied forward instead, `reconcile.ts:79-84`'s stray-fold would append the
> same stray comments to `overallComment` again on every arrival - a comment that
> grows by one copy per student, on the field an instructor sends to the
> student."

Traced through `reconcile.ts:60-87`. After ONE reconcile against canonical `C1`,
every result's `rubricAreas` is **exactly** `C1` (`:68-78` builds `reconciled`
from `canonical` alone and `:85` replaces `rubricAreas` with it). The strays are
GONE from `rubricAreas`. On a second reconcile against `C2` where `C2 ⊇ C1`,
`byNorm` (`:63-67`) is built from `C1`'s names, every one of which is matched and
`byNorm.delete`d at `:74`. So `strays` at `:79` is `[]` and `:81`'s branch never
runs. **Nothing is re-appended. The comment does not grow.** The claim is
unreachable under the monotone growth the design itself guarantees.

The real apply-forward failure is different and arguably worse, and the document
does not state it: the stray's SCORE is destroyed. Its comment is folded into
`overallComment` at `:82-83` and its cell is dropped; when the union later grows
to include that area name, `:76` pushes `{ area: name, score: "", comment: "" }`
- a blank cell - while the comment text stays permanently mis-filed in
`overallComment`. So the score is lost forever and the comment is in the wrong
field.

The DECISION survives; only its argument is wrong. That still blocks, for two
reasons. First, the real mechanism implies a constraint the document never
states: `arrived` must retain RAW rows for the life of the run and must never be
replaced by reconciled output. Second, a later pass that proposes apply-forward
will correctly refute the reason given, find no growing comment, and reach the
wrong conclusion - which is precisely the failure mode section 5.4's "rejected
alternative, named so a later pass does not simplify back to it" exists to
prevent.

### B5. A NEW route divergence in the blank-rubric column set - the exact class section 4.2 polices

**Class: DIVERGENCE-INTRODUCED-WHILE-CLOSING-ONE. NEW.**

Section 4.2 is careful and correct about rubric synthesis: flattening the
zip/Canvas asymmetry "would make the incremental Canvas route generate a rubric
the whole-run Canvas route does not, which is a NEW divergence introduced while
closing an old one." Section 6 then introduces one.

`reconcile.ts:50-58`: when `criteriaNames` is empty, `reconcileRun` falls back to
**the single richest result's** areas -

```
51:  if (canonical.length === 0) {
52:    let richest: RubricAreaResult[] = [];
53:    for (const result of results) {
54:      const real = result.rubricAreas.filter((a) => a.area && a.area !== "Overall");
55:      if (real.length > richest.length) richest = real;
56:    }
57:    canonical = richest.map((a) => a.area);
58:  }
```

The whole-run path reaches that fallback: `engine.ts:350` is
`reconcileRun(results, criteria.map((c) => c.name))`, empty for an unparseable
rubric. The fill's step 2 passes a non-empty UNION as `criteriaNames`, so
`canonical.length > 0` at `:61` and **the fallback never runs on the incremental
route.**

Same zip, same rubric, two routes, two column sets: richest-single-result vs
union. That propagates to the CSV header (`buildCsvContent`) and to
`recomputeTotal`'s denominator (reached from `GradingResults.tsx:279`) - two of
the three downstream readers section 6.3 says are "all fixed by the same change".
Section 6.3's second bullet discusses this case as though it were parity, and
14.1's B3 row records it as resolved with no residual for the divergence.

The union is probably the BETTER behaviour. That is not the point: the document's
own standard is that a new divergence is either closed on both routes or recorded
as a residual with an owner, and this one is neither.

### B6. Tier 2 has no failure path, no observer, no instrument, and an unspecified merge order

**Class: FIRE-AND-FORGET-UNOBSERVED. NEW.**

Section 4.3: "`startReview` fires it WITHOUT awaiting". Section 10: "the tier-2
merge is a `.then` on a promise inside `startReview` that calls `setState`".

- **The failure path does not exist.** Because it is not awaited,
  `startReview`'s `try/catch` (`useIncrementalGradingRun.ts:171-172`) cannot see
  it, and its `finally` (`:173-180`) has already released the lock. A rejection -
  `requireAppOwner()` on an expired session, a provider 5xx, a transport failure
  - becomes an unhandled promise rejection. The instructor gets no signal at all
  that the two panels will never arrive; they simply never arrive. There is no
  error surface and no instrument. F12 asserts dispatch COUNTS per mode and
  nothing about what happens when the dispatch fails.
- **The merge order is unspecified, and one of the two readings flickers.**
  `buildIncrementalRun` is called IN THE POOL (section 10, and that placement is
  well argued) and takes `tier2` in its parameter object. If tier 2 lands
  mid-run, the pool's closure reads whatever it captured. Stored as `useState`,
  every subsequent arrival rebuilds the run with a stale `tier2` - so the
  full-credit checklist and sample answer **appear when tier 2 lands and
  disappear when the next row lands**, repeatedly. Stored in a `useRef` it works.
  The document names neither, and `useRef` is already imported
  (`useIncrementalGradingRun.ts:19`) so the react budget permits it.

Both failures are render-only. Group A green.

**Named mutations:** (a) make the tier-2 stub reject in
`useIncrementalGradingRun.lifecycle.test.ts` and assert the run still reaches
`phase === "complete"` with some observable tier-2 state (today there is nothing
to assert against); (b) land tier 2 between arrival 1 and arrival 2 in the
lifecycle harness and assert the built run still carries
`fullCreditChecklist.length > 0` after arrival 2 - a `useState`-backed
implementation goes red, a ref-backed one stays green.

### B7. The terminal `stopped` sentence cannot render in the case it exists for

**Class: CHANNEL-GATED-BY-THE-CONDITION-IT-MUST-SURVIVE. NEW.**

Section 7.2 routes the run-level terminal copy through `GradingResults`'s
existing `banner` prop - declared at `GradingResults.tsx:153`, rendered at
`GradingResults.tsx:541` - and says so approvingly ("No new prop, no new region,
and `GradingResults.tsx` is not edited").

But the mount is gated `run && run.results.length > 0` (`GradingTab.tsx:545`).
Press Stop before the first row lands - which the document itself says is a
window of "seconds to tens of seconds" (5.6) - and `results.length === 0`, so
there is no mount, so there is no banner, so **there is no terminal sentence.**
The `stopping` sentence at `:472-478` unmounts with `incrementalRunning`. The
instructor sees a form and nothing else.

Compounding it, F9's truth table is incomplete over its own six phases. It names
`running`, `stopping`, a null run, and "true for `complete`/`idle` with a
zero-result run". **`stopped` and `refused` are unspecified**, so the
empty-state sentence's behaviour in exactly the stopped-with-zero-rows case is
undecided too - and that sentence ("No supported submission files were found in
the zip archive.", `GradingTab.tsx:490`) says the opposite of the truth there,
which is the same defect 5.6 exists to fix.

Owner-walk item 4 - "a stopped run is distinguishable from a complete one" - is
unreachable in that case. F6 does not help: `selectDisplayRun("stopped", ...)`
returns the incremental run correctly; the problem is downstream of it.

**Mutation:** add a `phase === "stopped"`, `arrived = []` row to F9's table and a
`describeRunProgress` render-site assertion. The fix is a design choice (a
second channel outside the mount, or lower the mount's gate for terminal
phases), which is why this blocks rather than being a note.

### B8. `grading.ts` is granted with no line budget against a near-full cap, from a baseline that is 5 lines stale

**Class: UNBOUNDED-FILE-AGAINST-A-NEAR-FULL-CAP. NEW.**

Write-set row (line 766): `src/app/actions/grading.ts` | **edit, THE OTHER
CALLER** | **must SHRINK**. Every other row in that table carries a numeric
`-le`. This one carries a direction with no number and no derivation.

Measured: `wc -l src/app/actions/grading.ts` -> 946;
`@(Get-Content src/app/actions/grading.ts).Count` -> 946. Against
`src/file-size-ceiling.structure.test.ts:41`'s `const LIMIT = 1000;`, that is 54
lines of headroom, not the 59 the document's 941 implies. The wave that last
priced this file recorded `-le 945` (`docs/a39-waves.md:1038`); the file is
already 1 over that.

And the direction is not established, because the document never says what
`gradeAction` DOES with the header `resolveRunHeader` returns. Replacing four
lines with one call at two sites is a small win; destructuring the header,
threading `effectiveRubric` and `generatedRubric` through the two Promise.all
blocks, and deciding whether to apply `header.rubricUsed`/`rubricFingerprint`
(which would double-stamp over `engine.ts:360`'s existing
`...stampRubricProvenance(rubric)`) are all additions nobody has priced. Section
16 item 2 asserts "the change SHRINKS it" with no arithmetic anywhere.

This is the class the checker brief names from prior rounds: a file granted with
no line budget against a cap it nearly exceeds.

---

## 2. MAJOR

**M1. Every `grading.ts` citation past line 623 is stale by +5, including the one
F2 pins a string against.** `2f06261` inserted 5 lines at `grading.ts:618-623`.
Re-measured with `grep -n`:

| Doc says | Actually |
|---|---|
| `:743` `getSpeedGraderUrl` | `:748` |
| `:767` `gradeAction` run production | `:772` region |
| `:810` Canvas blank-instructions refusal | `:815` |
| `:812` "No rubric synthesis on the Canvas path" | `:817` |
| `:816-817` checklist + sample answer (Canvas) | `:821-822` |
| `:854` embedded zip branch | `:859` |
| `:882` zip blank-instructions refusal | `:887` |
| `:885-888` `effectiveRubric` block | `:890-893` |
| `:907-909` the grading `Promise.all` | `:912-914` |
| `:637` the other `generateRubric` caller | `:642` |

F2 requires the refusal message be "BYTE-IDENTICAL to `grading.ts:882`'s
`"Please provide assignment instructions."`". `:882` is now inside the embedded
zip branch. The STRING is still correct and still present at `:815` and `:887` -
I checked both - but the citation sends the implementer to the wrong line.

Conversely: **every `engine.ts` and `extraction.ts` citation in the document is
still exact**, because `2f06261`'s insertions land at `engine.ts:451+` and
`extraction.ts:168+`, after all of them. I opened each one:
`extraction.ts:135` (definition), `:145-148` (collision refusal), **`:149`
`groupSubmissionsByStudent(submissions, undefined, rawData, zipParents)`**,
`engine.ts:390` (`inferFileNameConvention`), `:391-396` (the grouping call),
`:350` (`reconcileRun`), `:360` (`stampRubricProvenance`), `:288-290` (the
spacer), `:293` (the invariant comment), `:296-298` (the class-trends clause).
The headline finding #9's two citations are correct.

Repair is mechanical and per `iteration-caps.md` a citation repair is not a
round.

**M2. The fill adds a SECOND import-graph edge and F11 accounts for only the
first.** F11 says of the `reconcile.ts:20` change: "There is no way to satisfy
one half alone", framing the fill's entire import-graph consequence as deleting
the frozen trail at `runtime-import-graph.test.ts:674` (verified: `:657` is
`const FROZEN_TRAILS = [`, `:674` is the reconcile trail). But section 9.2 also
puts `inferFileNameConvention` into `extraction.ts`, which today imports
`./types`, `../canvas`, `./constants`, `./utils`, `./collisionRefusal`,
`../submission-repo`, `./repo-content`, `../office-extract` and `jszip` - and
**not** `./rubric`. `FROZEN_TRAILS` is a per-direct-edge walk rooted at
`engine.ts` (`:679-702`), and `./extraction` is one of those edges. Whether a new
`lib/grade/engine.ts -> lib/grade/extraction.ts -> lib/grade/rubric.ts ->
lib/research/rubric-bank.ts -> lib/research/db.ts` trail appears depends on the
shared visited set inside that single walk (extraction already reaches
`rubric.ts` the long way, via `../canvas -> listings -> auto-zero -> grade-zeros
-> lib/grade.ts`, and that trail IS frozen). I could not determine which without
editing source. **Either answer makes the document wrong**: it omits a required
`FROZEN_TRAILS` addition, or it omits the reason none is needed. The
implementer discovers this at the gate with F11 telling them the answer is one
deletion.

F10 itself is SOUND and I confirmed it rather than taking it: `canvas-client-
boundary.runtime-graph.test.ts:82` is `treatUseServerAsWall: true`,
`runtime-import-graph.ts:241` honours it, and `grading-incremental.ts:1` is
`"use server"` - so `extraction.ts` is NOT client-reachable and the extraction
change cannot turn F10 red. `client-boundary-policy.ts:18` is
`export const FORBIDDEN_PATH_PREFIXES = ["lib/supabase"];` as cited, and
`research/db.ts:64` is the dynamic `import("@/lib/supabase/server")` as cited.

Also: the deep-equal F11 leans on is at `runtime-import-graph.test.ts:703`, not
the document's `:709-712`.

**M3. `use-server-exports.test.ts` already catches the class the document says
only `next build` can.** Section 9.3: "`npm run build` is run once and the gate
is the `Compiled successfully` LINE ... it is the only gate that catches a
`"use server"` module exporting a non-async binding, and this design adds an
export to one." `src/lib/use-server-exports.test.ts` - which is IN the
document's own `test:paths` list - exists for exactly that, and says so in its
header: "Guard against a build break that neither `tsc --noEmit` nor `vitest
run` can see ... this test exists so the NEXT instance is caught by `vitest
run`, in seconds, instead of by a failed build." The document under-credits its
own gate list and points the implementer at the slowest instrument.

**M4. Internal contradiction on `useIncrementalGradingRun.ts`'s bound.** Line
771 gives it `-le 300`. Line 939 says it "lands near 250, well under its
`-le 560`". `-le 560` is `incrementalRunPlan.test.ts`'s bound, one row above at
line 770. Both bounds happen to hold against the ~250 estimate, so this cannot
fail a gate - it can only make two readers gate on two different numbers.

**M5. Tier 1 step 6 drops `getSpeedGraderUrl`'s swallow, and the failure demotes
the whole route.** The whole-run path is
`await getSpeedGraderUrl(canvasUrl).catch(() => null)` at `grading.ts:748`, with
its own comment: "Best-effort: a failure here must not block grading." Tier 1
step 6 says it is `Promise.all`-ed with `extractCanvasEntries` and says nothing
about `.catch`. Without it, a SpeedGrader failure rejects the `Promise.all`,
lands in `grading-incremental.ts:117`, does not match the `"Refused: "` prefix,
and returns `mode: "whole-run"` at `:139`. So a best-effort deep link silently
demotes every incremental Canvas run to the whole-run path - a divergence from
the route it is meant to reach parity with, with no instrument and no residual.

**M6. Item #8 restores the scroll NODE but not the scroll TRIGGER, and the
obvious fix scroll-jacks the reader N times.** Verified: `GradingTab.tsx:212-216`
is `useEffect(() => { if (run && resultsRef.current) {
resultsRef.current.scrollIntoView(...) } }, [run])`, and `run` is
`state.run` (`:174`). One mount does give the incremental route a
`sectionRef` node (`:579-582`), which fixes `page.tsx:697`'s
`fallbackFocusRefs={[resultsSectionFallbackRef, previewFallbackRef]}` path -
both citations confirmed, along with `page.tsx:113`. But the effect's dependency
is still `state.run`, which never changes on an incremental run, so the scroll
still never fires. Change the dependency to `displayRun` and it fires on EVERY
arrival - owner-walk item 5's hazard ("the reader's row moving on screen")
applied to rows rather than panels, up to N times per run. The document specifies
neither and section 10's delta table has no line for it.

**M7. `buildIncrementalRun`'s `phase` parameter is never read by its own
specification.** Section 6.1's pseudocode returns `results`, `rubricAreaNames`,
`fullCreditChecklist`, `sampleAnswer`, `speedGraderUrl`, `rubricUsed`,
`rubricFingerprint` - nothing derived from `phase`. The terminal copy is
`describeRunProgress`'s (7.2) and is composed in `GradingTab`'s render. So the
implementer either writes a destructured parameter that trips
`@typescript-eslint/no-unused-vars` or drops it from a signature section 3
publishes as vocabulary "so no brief has to guess a spelling."

**M8. F14 is self-contradictory.** It requires asserting
`merged.length === arrived.length` AND "cases for a duplicate index". Under the
sorted-keys construction it prescribes, a duplicate `sourceIndex` collapses in
`bySourceIndex` (`incrementalRunPlan.ts:164-165`) and yields
`arrived.length - 1`. Both clauses cannot hold, and the document never says what
`mergeArrivedResults` SHOULD do with a duplicate - drop, last-wins, or throw. The
implementer must invent the behaviour that the requirement then measures. (Also
worth saying plainly: a duplicate index and an out-of-range index are both
unreachable from the pool, which claims its cursor with no intervening `await`
at `:100-102` - so F14 tests inputs the system cannot produce. That is defensible
for a pure function's total behaviour, but it is the same "cannot fail from the
call site" family as the B4 the document criticises, and the document should say
which it is.)

**M9. `1200ms` has no provenance at the line cited.** Section 4.3 gives the
whole-run cost as "`tier 1 + N items with a 1200ms spacer between each`
(`engine.ts:288-290`)". `engine.ts:288-290` reads `interRequestDelayMs`, set at
`engine.ts:202` from `getGeminiInterRequestDelayMs()`, defined at
`src/lib/gemini.ts:143` as
`parsePositiveInt(process.env.GRADE_INTER_REQUEST_DELAY_MS, DEFAULT_INTER_REQUEST_DELAY_MS, 0)`
with `DEFAULT_INTER_REQUEST_DELAY_MS = 1200` at `gemini.ts:67`. So 1200 is a
DEFAULT that an env var overrides, and this checkout has no `.env`. The document's
own rule is that every quantity names the command that produced it.

**M10. Section 9.3's derivation does not produce section 9.3's list.** The prose
says the `test:paths` list is "the UNION of all five outputs plus the three
structural gates." Measured against the pasted commands and the pasted list:
four content-producing greps were pasted, not five (two of the six commands are
canaries); **four** extra files follow, not three (`use-server-exports.test.ts`,
`file-size-ceiling.structure.test.ts`, `no-emojis.test.ts`,
`source-bytes.structure.test.ts`); and `src/app/actions/action-guard-coverage.test.ts`
is in the list but appears in NONE of the pasted outputs, so one gate path is
justified by nothing.

I checked all 33 listed paths for existence with a per-path `[ -f ]` loop:
**32 exist, 1 does not** - `src/lib/grade/run-header.test.ts`, which this wave
creates. Since `npm run test:paths` REFUSES with exit 1 and runs nothing if any
path is absent, the gate command as written cannot be used for the pre-change
baseline run F7 and F8 explicitly require ("run it against today's unchanged
file"). The document should carry two lists, or say to drop that one argument for
the baseline.

The list DOES use the wrapper correctly (`npm run test:paths --`, line 877) and
explicitly refuses a raw multi-path `vitest`. **No gate or instrument anywhere in
this document runs two or more test paths through a raw `vitest`/`npm test`
invocation.** Clean on that question.

---

## 3. MINOR

**m1.** `reconcile.ts:9-12`'s own header - "Imports only ./types and ./rubric
(W4-1/W4-2's own constraint, section 3.3 of docs/a39-waves.md) ... reconcileRun
must stay a pure leaf" - and `docs/a39-waves.md:1651` ("imports only `./types`
and `./rubric`, **`-le 250`**") both become false with the one-line import
change. RES-FILL-1 covers only `runtime-import-graph.test.ts`'s comment blocks.
Same class as RES-FILL-1, missed in a file that IS in the write set.

**m2.** `extraction.ts:130-134`'s contract becomes false: "Group a submissions
zip into per-student entries WITHOUT any LLM call (uses the deterministic
filename-convention parsing only). Feeds the Embedded Deterministic Engine,
which must never depend on a model." Section 9.2 adds an LLM branch to exactly
that function. I searched for an instrument pinning it
(`grep -rn "WITHOUT any LLM\|no LLM call\|never depend on a model" src --include=*.ts`)
and found none for this function - so only the comment is wrong, but the comment
is the only statement of the contract. The behaviour argument (an absent option
leaves `grading.ts:859` byte-identical) is sound and I confirmed `:859` is the
embedded zip branch.

**m3.** Section 7.3: "at most `INCREMENTAL_CONCURRENCY - 1 = 2` items are in
flight". At cancel time up to THREE are in flight -
`useIncrementalGradingRun.ts:119-120` starts `min(3, requests.length)` workers
and all three can be awaiting `postGradeRunItem` when `cancel()` fires; the
`cancelledRef` check is at the TOP of the loop (`:99`). The `-1` is unjustified.
The conclusion (bounded by `TOTAL_BUDGET_MS` once, not N times, because they
settle in parallel) is unaffected.

**m4.** Section 5.4: "Both `GradingTab` mounts are gated `source !== "livefeed"`".
There is ONE `GradingTab` mount (`page.tsx:543`, the only `<GradingTab` in the
tree). It means the two `<GradingResults` mounts. In a load-bearing reachability
paragraph that imprecision matters.

**m5.** 9.4 and section 2 call the incremental mount `:597`; `:597` is the guard,
`:598` is the element.

**m6.** Tier 1 step 6's "**`Promise.all`-ed with `extractCanvasEntries`** at
`grading-incremental.ts:71`" reads as a citation of existing structure. `:71` is
a bare `const extracted = await extractCanvasEntries(canvasUrl);`. It is a
proposal, not a measurement.

**m7.** The `banner` slot is already occupied: `GradingTab.tsx:583-590` passes
the `gradingTarget` "Grading <title>" banner. "No new prop, no new region" holds,
but the terminal sentence must COMPOSE with an existing conditional node, priced
at "+4" with no shape given and no instrument.

**m8.** Section 11 says "**Three requirements that deliberately have NO in-repo
instrument** ... the six visible effects in section 12" - three against six in
one sentence. And owner-walk item 2's column-stability half is NOT
instrument-less: `unionRubricAreaNames` and `buildIncrementalRun` are pure, so
B3's two-arrival-orders test is buildable here today. Routing that half entirely
to an owner walk is a gap wearing a principle's clothes. The other refusals are
principled: the `AbortController` refusal is correct on the evidence
(`route.ts:172-175` is already running and `bounded-race.ts` does not cancel
`work`), the third-`stoppedBy`-member refusal is correct and keeps W4-6a at one
line, and the per-item fingerprint echo genuinely cannot fail
(`incrementalRunPlan.ts:143-152` builds every body from one `plan.rubric`).

---

## 4. Answers to the questions the brief asked directly

**Can one `<GradingResults` element still render two tables?** Within one
`GradingTab` instance, no - one element not in a `.map(` renders once per pass,
and `page.tsx:543` is the only `GradingTab` mount, so the fragment/portal/
conditional attacks all fail. The argument is sound AT THAT SCOPE. It fails at
repo scope (B2), and the count's other weakness is that it cannot see the guard
that does the actual work.

**Is the count the kind of source-text pin that has failed here before?** Yes,
and the document's own RULING 40 analysis is the precedent. But note the count
itself is fine as an instrument - `[...src.matchAll(/<GradingResults(?=[\s/>])/g)]`
with the lookahead borrowed from `gradingResultsExtraction.wiring.test.ts:315` is
correct, and I confirmed that line is exactly where the document says and
documents exactly why (`<GradingResultsHandle>`). The defect is the OBJECT, not
the technique.

**Tier 1 / tier 2, verified from the code.** "At most two model calls before the
first row" is CORRECT. `inferFileNameConvention` (`rubric.ts:209-212`) is one
`callLlm`; `generateRubric` (`rubric.ts:243+`) is one `callLlm` with
`maxOutputTokens: 1500`; `extractRubricCriteria` (`rubric.ts:27`) is pure;
`stampRubricProvenance` is crypto; `getSpeedGraderUrl` is a Canvas call, not a
model call. Both ARE already on the whole-run critical path
(`grading.ts:890-893` and `engine.ts:390`). One qualification the table omits:
step 3 applies to the ZIP path only - `extractCanvasEntries` does no filename
grouping - and `routeGradingRun` (`incrementalRunPlan.ts:120-137`) pools gemini
only, so parity holds for both sources. **Can a non-awaited server action deliver
tier 2?** Mechanically yes; as specified, no - B6.

I also attacked tier 2's wire budget and found nothing: a generated rubric
carried into every per-item body could in principle exceed
`MAX_RUBRIC_CHARS = 20_000` (`route.ts:41`, enforced at `:110`) and turn all N
items into transport-failure rows with no refusal, but `generateRubric`'s
`maxOutputTokens: 1500` puts it an order of magnitude under. Not a finding.

**Is recomputing from raw load-bearing?** Yes, but not for the reason given -
B4. The machinery is NOT there for nothing; the document's justification for it
is false, and the real justification implies a constraint the document does not
state.

**RULING 129 against the headline finding #4.** It NARROWS it and does not
conflict with it. `2f06261` wired `disambiguateCanvasEntries` at three Canvas
sites - `extraction.ts`'s `extractCanvasEntries` (so the incremental Canvas prep
at `grading-incremental.ts:71` inherits it), `engine.ts:474-486`'s
`gradeCanvasUrl` (the whole-run Canvas path), and `grading.ts:618-623`'s
single-submission no-op - so the two CANVAS routes now agree on display names.
The zip-path divergence the document found (`extraction.ts:149` passing
`undefined` where `engine.ts:390-396` passes a real lookup) is untouched, its
two citations are still exact, and it is now the ONLY remaining naming
divergence between the routes. Two consequences the document could not have
known: `src/lib/grade/extraction.test.ts` grew 61 lines and is in the blast
radius (it IS in the owns list, so the gate list is fine), and RES-FILL-3's
premise - "two compositions of the same four steps" - is now understated, since
`assignUnclaimedLabel` has three call sites.

**The two owned assertions (A5 two -> one, A2 dropping `formAction`). The
reachability claim is CORRECT and both changes are justified.** Verified:
`handleAutoGrade` is `GradingTab.tsx:196-208` and calls `formAction(fd)` at
`:206` with no hook involvement; `grep -n "formAction("` returns exactly `:180`
and `:206`, matching A5's pinned 2 at
`autoGradeTransition.wiring.test.ts:159-172`; A2 is at `:126` as cited; A6's
`!spanText.includes("||")` is at `:183` as cited; W4-8's
`indexOf("incrementalRunning &&")` anchor is at `:336` as cited. Auto Grade lives
under `source === "livefeed"` (`:298`, `:309`) while both results mounts are
gated `source !== "livefeed"` (`:545`, `:597`), and `source` persists to
`localStorage` under `ta-grading-source` (`:103-106`, `:125-128`) - so the
sequence "Auto Grade, then switch source" is reachable and a stale non-`idle`
phase would make `selectDisplayRun` show the older incremental run instead of the
Auto Grade result. **Accept the ruling change.** But F7 tightens a count on the
same file where B2 shows the count's object is too narrow, so the same commit
must add the guard pin.

**The document's self-assessment of its weakest link is WRONG.** It names the
absence of an end-to-end oracle over `gradeAction` for the `resolveRunHeader`
extraction (section 11's second refused instrument, restated in section 16 item
2 as "That is the weakest link in this design"). That extraction replaces four
lines with one call at two sites; F1/F2/F3 cover the extracted function
directly; four existing `gradeAction` test files are already in the gate list
(`grading.guard.test.ts`, `grading.collisionRefusal.test.ts`,
`grading-checklist.test.ts`, `grading.budget.test.ts`); and its failure mode is
LOUD - a changed refusal string or a missing rubric shows up in the first run.
The refusal to build the oracle is principled.

**The actual weakest link is B1**, which the document does not mention at all:
a data-shape decision that silently destroys the instructor's in-progress work
on already-arrived rows, in a repo where no instrument can see it. B2 and B3 are
also weaker links than the named one. **This is the most useful thing in this
check.**

**The silent-green failure, named specifically.** Build the fill exactly as
written. Lint passes, `tsc` passes, `next build` prints `Compiled successfully`,
`npm test` is green at 1160 files / 23232 tests, F1-F14 are green, all twelve
Group A commands pass. Then: the instructor starts a 20-submission run, row 1
lands, they open its feedback box and start typing - and row 2 lands, the box
collapses (B1), the columns reorder under them (B3), and the "Posted to Canvas"
badge on the row they just posted disappears (B1). They press Stop; nothing says
the run stopped (B7). Tier 2 fails silently and the two panels never appear
(B6). Every one of those is invisible to every gate this repo has, because
nothing renders.

**The feature-already-exists case, at its strongest.** It is strong at the
CAPABILITY level and the document already treats it correctly. Concurrent
grading exists and runs: the pool (`useIncrementalGradingRun.ts:92-121`), the
per-item handler (`route.ts`), the plan leaf, the prep action. Every piece the
fill "adds" also already exists - on the whole-run path
(`grading.ts:815/887/890-893/912-914`, `GradingTab.tsx:495-532/547`). So the
fill's job is REACHABILITY, not capability, and this repo's own recorded lesson
is that the surface is a layer. The design's shape - one mount, one header, one
door - is the right answer to that, and DECISION 17 is not reopened here. No
reframing needed.

**The weakest requirement - implemented exactly as written and still producing a
bad result.** **F5.** One `<GradingResults` element, not inside a `.map(`,
implemented perfectly, and the double-table-over-one-edits-surface defect returns
the moment the `source !== "livefeed"` conjunct is dropped, with F5 green at
exactly 1 (B2). Runner-up: section 6.1's `unionRubricAreaNames` specification,
which implemented exactly as written reorders columns under the reader (B3).

**Disposition table (section 14), audited BEFORE the new round on its own
terms.** Mostly sound. The B1 widening to ten is correct and its two additions
are real. The B1b premise correction (7.1) is correct: `engine.ts:293`'s
invariant is a property of what `gradeStudentEntries` RETURNS and does not range
over a client-assembled run. The M4 row is correct - `incrementalRunPlan.ts:195-196`
does hardcode `mergedFileCount: 0` / `submittedFiles: []` while
`useIncrementalGradingRun.ts:108-111` holds `request.entry`. The RES-W4C-1
withdrawal is well founded and better than the document says: `GradingTab.tsx:595-596`'s
comment claims "rubricAreaNames here is a union" while `:601` samples
`incrementalResults[0]`, so the residual's own text was already false in the
tree. A6, A7, W4-6a/b, W4-8, W4-9c and W2-7 clause 2 all verified verbatim
against their cited lines. **One error: the B3 row** ("Resolved... All three of
its downstream consequences fall out of the one fix") is contradicted by B5 -
the same fix introduces a new divergence in two of those three consequences.

**A finding on the orchestrator's brief, not the design.** The brief's item 6
says the document "refuses to decide the disambiguated label's copy."
`grep -n "label\|disambigu" docs/a39-incremental-fill-architecture.md` returns
ZERO lines. That refusal belongs to RULING 129 and
`docs/a46-canvas-collision-scope.md`'s RES-A46R2-6, quoted verbatim in
`extraction.ts`'s new `disambiguateCanvasEntries` doc comment. Brief
contamination across items - the class the repo's own memory names. The
document's four actual withdrawals are the per-item provenance echo,
`state.warnings`, a third `stoppedBy` member and the `AbortController`; I judged
all four in m8 and B4's neighbourhood and three of the four are principled.

---

## 5. Attacks that found nothing

Listed because a clean section is only credible with its attempts shown.

1. **Can a fragment, a conditional with different props, a wrapper component or
   a portal make one `<GradingResults` render twice?** No, within one
   `GradingTab` instance. `page.tsx:543` is the only `<GradingTab` in the tree.
2. **Does the incremental route serve the `embedded` provider, so that adding
   the filename inference would create a NEW divergence with
   `grading.ts:859`'s deliberately inference-free branch?** No.
   `routeGradingRun` (`incrementalRunPlan.ts:123`) returns `"whole-run"` for
   every non-gemini provider, and `incrementalRunPlan.test.ts:71-74` pins it.
   The parity claim for #9 is exact. This was my strongest attack on the
   headline finding and it failed.
3. **Does the F10 client-boundary claim survive the extraction change?** Yes -
   `treatUseServerAsWall: true` (`canvas-client-boundary.runtime-graph.test.ts:82`)
   and `grading-incremental.ts:1` is `"use server"`.
4. **Is section 6.2's one-line import fix genuinely to a pure leaf?** Yes, all
   four hops opened: `prompts.ts:19` defines `normalizeAreaName`;
   `prompts.ts:1-2` imports only `type {...} from "./types"` and
   `{ getBaseFileName } from "./utils"`; `utils.ts:1-3` imports two type-only
   specifiers and `{ getMimeType } from "./constants"`; `constants.ts:1` is
   `const MIME_TYPES: Record<string, string> = {` with no imports at all.
   `rubric.ts:442` is the re-export as claimed. Behaviour-identical.
5. **Could a generated rubric blow `MAX_RUBRIC_CHARS` and fail every item
   silently?** No - `maxOutputTokens: 1500` against `20_000` chars.
6. **Does F5's "no `.map(` in the enclosing brace span" clause false-positive on
   today's correct first mount?** No. I read `GradingTab.tsx:545-593`: the
   innermost enclosing brace span of the `:548` tag is the `:545` JSX expression
   container, and it contains no `.map(` (the nearest are `:496` and `:538`,
   outside it).
7. **Does keeping `incrementalRunning` as a derived boolean really preserve
   W4-8?** Yes - `autoGradeTransition.wiring.test.ts:336` is
   `gtSource.indexOf("incrementalRunning &&")`, and the running/stopping
   progress region at `:472` retains it while the terminal sentence moves to the
   banner.
8. **Is W2-7 clause 2 really strengthened for free?** Yes -
   `rubricProvenanceLeaf.test.ts:93-101` uses bare `indexOf("<GradingResults")`,
   so "before the first" becomes "before the only" with one mount, no edit.
9. **Does any gate or instrument in this document run several test paths through
   a raw `vitest`?** No. Section 9.3 uses `npm run test:paths --` and names the
   hazard.
10. **Are `types.ts`'s client-importability and the 4.2 zip/Canvas asymmetry
    real?** Both yes. `types.ts:1` is the single type-only import as claimed, and
    `grading.ts:817`'s comment is verbatim "No rubric synthesis on the Canvas
    path", making the document's CORRECTION of `docs/ruling-116.md:17-20` a
    genuine and correct finding.
11. **Does the `test:paths` list contain a path that does not exist, so the gate
    would refuse?** Only `run-header.test.ts`, which the wave creates. All 32
    others exist. Reported as the M10 sequencing foot-gun, not a fabrication.
12. **Do `ruling-116.md`'s three flip-commit assertions exist?** Yes -
    `incrementalRunPlan.test.ts:54`, `:58`, `:77`. Section 15's claim is exact.

---

## 6. Stopping point

**What remains: DESIGN and RULINGS, in that order. Not measurement.**

Measurement is effectively done. Every `file:line` in the document was opened;
the stale ones are enumerated in M1 with their replacements; both counters agree
on all thirteen sizes; every gate path was checked for existence individually.
The one measurement I could NOT complete is M2's - whether adding
`extraction.ts -> ./rubric` produces a new `FROZEN_TRAILS` entry - because
determining it requires editing production source to apply the edge, which is
outside my write set with an implementer live. **Named mutation:** add
`import { inferFileNameConvention } from "./rubric";` to `extraction.ts` and run
`npm run test:paths -- src/lib/module-graph/runtime-import-graph.test.ts`,
reading the exit code from the command. Either it is red (a trail must be added)
or it is green (the document must say why). Whoever does it should do it before
writing any other line of the wave.

**What I did not check, and why:**

- `npx tsc --noEmit` and `npm run build` - instructed not to, single-caller
  resources with a live implementer. Every type-level claim in the document,
  chiefly that `GradingRunHeader`/`GradingRunTier2` in `types.ts` stay
  client-reachable, remains a reading claim. I confirmed the premise
  (`types.ts:1` is type-only) but not the conclusion.
- Any vitest run at all - no instrument can be proven red without a mutation, and
  every mutation is outside my write set. All eight mutations I would want are
  named at their findings.
- `class-trends.ts` over a partial run (RES-FILL-4). I read
  `engine.ts:296-298`'s comment, same as the author, and measured nothing. The
  residual's shape is correct.
- Whether `reconcileRun`'s frozen literal in `reconcile.test.ts` survives the
  import move. The document's argument (no behavioural change) is sound on
  reading and `reconcile.test.ts` is in the gate list; I did not run it.
- The three-way interaction between B1's fix, B7's fix and the 906-line ceiling
  on `GradingResults.tsx`. B1 probably requires editing that file, which section
  8 item 9 forbids on ceiling grounds, and B7 may too. **That interaction is the
  first thing the revision has to price**, and it may reopen the "not edited"
  claim - which is a design decision, not a measurement.

**Rulings that need a decision before a build wave, not another authoring
round:**

1. **B3's fork.** Determinism (sort by `sourceIndex`) or prefix stability (sort
   by arrival). The document promises both. One has to be chosen and the other
   recorded as a residual with an owner.
2. **B1's shape.** A `runKey` prop, per-field reset conditions, or hoisting
   `edits` - and whether `GradingResults.tsx` is editable at 906 of 1000 after
   all. Section 8 item 9 currently says no.
3. **B8's number.** `grading.ts` needs a numeric `-le` from its real 946, with
   the header's consumption shape specified enough to derive a direction.
4. **B5's disposition.** Union or richest-result for the blank-rubric column
   set, on BOTH routes, or a recorded residual naming which route is right.

Rounds used on this artifact: 1 of 2.
