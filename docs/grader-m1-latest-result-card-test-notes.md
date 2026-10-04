# GRADER-WORKFLOW-OVERHAUL M1: latest-result card - TEST NOTES (oracle + sabotage)

Status: test notes, authored by the test-notes/oracle seat (Opus). No production
or test code written here - this file is the instrument spec an implementer
builds from and a fresh `loop-checker` reads first. Author from the tree, measure
do not recall; every quantity below names the command or `file:line` that
produced it.

Consumes scope `docs/grader-workflow-overhaul-scope.md` (SHIPped round-2, commit
`30c2510a`). RULINGS carried in verbatim from the dispatch: **F1 = READ-ONLY card
(no Post), F2 = mechanism M1, the card is grading-chat-LOCAL, GradingResults.tsx
BYTE-UNTOUCHED.**

## 0. Tree state and measurement rig

- HEAD at authoring: `git rev-parse --short HEAD` = `e43dbedd`.
- `git ls-files '*.test.ts' | grep -i frozen` = **NONE**. There is NO frozen-roots
  canary test anywhere in the tree (the `frozen-roots` string lives only in
  `docs/*` for the repo-grades dir). See section 7 for what this means for a new
  grading-chat file.
- `git ls-files 'src/app/components/grading-chat/*.test.ts'` = 7 test files
  (listed in section 7). The two structure tests this wave edits/leans on are
  `GradingChatPanel.structure.test.ts` and `grading-chat-storage-keys.structure.test.ts`.
- Opened and cited at HEAD: `src/lib/grade/types.ts`
  (`GradeResultBase` :212-271, `GradedResult` :277-280, `UngradedResult` :290-293,
  `GradingRun.results: GradeResult[]` :348, `isUngraded` :200-202, `gradedResults`
  :204-206, `NotAttemptedOutcome.sourceIndex` :150, `GradingFailedOutcome.sourceIndex`
  :164); `src/app/components/grading/incrementalRunPlan.ts:174-184`
  (`mergeArrivedResults`, ascending `.sort((a,b)=>a-b)` :181-183, last-wins `Map.set`
  :179); `src/app/components/grading/incrementalRunPlan.test.ts:140-199` (the
  inherited pins); `src/lib/grade/reconcile.ts:86-112` (order-preserving `.map`);
  `src/app/components/grading-chat/GradingChatPanel.tsx` (`busy` :165, `hasRows`
  :166, `<GradingResults>` mount :219-228, sticky composer wrapper :234-241);
  `src/app/components/grading-chat/useContinuousGradingRun.ts`
  (`results: readonly GradeResult[]` :103, `run: GradingRun | null` :104);
  `src/app/components/grading-chat/GradingChatPanel.structure.test.ts` (full);
  `src/app/components/grading-chat/grading-chat-storage-keys.structure.test.ts` (full);
  `src/app/components/grading-chat/grading-chat.module.css` (full, 63 lines);
  `src/app/components/courses/page-module-css-orphan-classes.test.ts` (full,
  `PINNED_ORPHAN_CEILING = 118` :316, ratchet fires BOTH ways :431 and :436);
  `src/app/components/grading-results/gradingResultsHelpers.ts:216`
  (`FEEDBACK_FIELDS = ["strengths","improvements","resubmitNotice"]`);
  `src/app/components/grading-results/RowFeedbackBoxes.tsx:115` (the matrix maps
  FEEDBACK_FIELDS).

Not run: tsc, lint, vitest, build, any render. Nothing renders under vitest here
(node-env, collects only `src/**/*.test.ts`), so every machine criterion below is
a PURE-LEAF unit test or a SOURCE/STRUCTURE pin. Everything about rendered
markup, scroll distance, focus, or visual adjacency is OWNER-verified and is
labelled as such, never asserted as verified.

---

## 1. What M1 builds (restated only enough to anchor the pins)

A new, read-only "latest result" card rendered with the sticky composer in the
grading-chat panel, showing the newest ARRIVED result in full so the instructor
reads what they just submitted without hunting the bulk matrix. Two new leaves +
wiring, all grading-chat-LOCAL:

- `latestGradedResult.ts` - a pure selector `selectLatestResult`.
- `LatestResultCard.tsx` - a read-only display of one `GradeResult`.
- wiring in `GradingChatPanel.tsx` + card classes in the EXISTING
  `grading-chat.module.css`.

"Newest" = the newest SUBMITTED entry that has ARRIVED = highest `sourceIndex`
among arrived rows = **the LAST element of the already-ascending-sorted
`run.results`**. It is NOT "most recently graded in wall-clock terms": `busy`
is `headerState === "resolving"` only (`GradingChatPanel.tsx:165`), so the
composer is not disabled and the instructor can keep submitting while earlier
rows are in flight; `INCREMENTAL_CONCURRENCY` (3) means a multi-entry batch can
ARRIVE out of order, so for such a batch the card shows the last entry of the
batch (its highest `sourceIndex`) - a stable target even though arrival order is
not.

---

## 2. THE LOAD-BEARING FACT about the data (why (a) and (b) are split)

A graded result has **NO top-level `sourceIndex`**. That field exists ONLY on the
two ungraded variants, nested inside `ungraded`: `NotAttemptedOutcome.sourceIndex`
(`types.ts:150`) and `GradingFailedOutcome.sourceIndex` (`types.ts:164`).
`GradeResultBase` (:212-271) and `GradedResult` (:277-280) carry none. Measured:
`grep -n "sourceIndex" src/lib/grade/types.ts` returns only :150 and :164.

Therefore the newest result CANNOT be found by comparing a field a graded row
has. It is found BY POSITION: `selectLatestResult(run) = run.results.at(-1) ?? null`.
That is correct **only because** `mergeArrivedResults` has already ordered
`run.results` ascending by `sourceIndex` (`incrementalRunPlan.ts:181-183`). So:

- **The `.at(-1)` leaf proves NOTHING about "newest" on its own.** Stated plainly,
  as the dispatch requires. Its own test proves only "returns the last element of
  the array it is given, null on empty, shape intact."
- **The "newest = last" guarantee is INHERITED** from the ascending-sort invariant
  in `mergeArrivedResults`, which is ALREADY pinned (section 4, AC-M1(b)). AC-M1
  measures the two halves SEPARATELY so the inherited half is not left as an
  unmeasured assumption.

`reconcile.ts:86-112` rebuilds each row via `.map` (order-preserving), so it is in
the chain between the engine and `run.results` but does not reorder; M1 neither
owns nor edits it. Noted, not pinned.

---

## 3. REQUIREMENT TABLE (object / instrument / direction of failure)

Every row names the OBJECT under comparison, the INSTRUMENT producing each
quantity, and the DIRECTION of failure. "src pin" = source/structure text pin
(nothing renders). "owner" = routed to the owner walk, argued not asserted.

| ID | Object | Instrument | RED (direction of failure) |
|----|--------|-----------|----------------------------|
| M1(a) | `selectLatestResult` leaf | NEW `latestGradedResult.test.ts`, frozen-literal oracle | returns non-last element; returns a new/projected object (shape lost); returns non-null on empty results; returns last GRADED instead of last ARRIVED |
| M1(b) | `mergeArrivedResults` ascending order | EXISTING `incrementalRunPlan.test.ts:140-146,154-162,164-166,180-189` (NAMED, not re-authored) | `results` returned in any order other than ascending by `sourceIndex`, or last-wins dropped |
| M2 | `GradingChatPanel.tsx` wiring (the surface is a LAYER) | src pin in EXISTING `GradingChatPanel.structure.test.ts` | leaf imported but never CALLED on `driver.run`; card mounted on a stub/literal; card not between the sticky wrapper and the composer |
| M3 | `LatestResultCard.tsx` content | src pin (new describe, same file or a new `LatestResultCard.structure.test.ts` in grading-chat) | card shows a proxy (badge/count/`data-` attr) instead of the grade `totalScore` and the three FEEDBACK_FIELDS |
| M4 | grading-chat `ta-` key set | EXISTING `grading-chat-storage-keys.structure.test.ts` | a 5th `ta-` key lands (set != frozen 4) |
| M5 | classes added to EXISTING `grading-chat.module.css` | EXISTING `page-module-css-orphan-classes.test.ts` | a class is defined-but-unapplied (orphan count rises off 118) |
| M6a | shared matrix component | `git status --short` at the wave gate | any edit to `GradingResults.tsx`, `grading-results/*`, or `useResultsSort.ts` |
| M6b | New session confirm | EXISTING `GradingChatPanel.structure.test.ts:112-119` | `window.confirm` removed from / reordered after `driver.reset()` |
| M6c | F1 read-only (no Post/Edit control) | OWNER verification (NOT a machine pin - see 4.M6) | a visible Post/Edit/grade control on the card |

---

## 4. CRITERIA, ORACLES, AND SABOTAGES (full detail)

Pin the FACT and the ordering, never the spelling - except the frozen oracle
below, where identity against a NAMED const IS the fact. Reuse the EXISTING
`withoutLineComments` helper in `GradingChatPanel.structure.test.ts`
(`.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/[^\n\r]*/g, "")` - the CRLF-safe
UNANCHORED line-comment form). Do NOT author a new comment-strip helper and do
NOT write the literal `stripComments` in any new test (the repo-wide enumerator
`src/tools/strip-comments-agreement.structure.test.ts` reddens on that literal).
No `/s` dotAll flag (passes vitest, fails tsc TS1501). No emojis. LF only.

### AC-M1(a) - the leaf. The frozen-literal oracle.

**Leaf under test (implementer writes it; spelled here as the FACT, not forced
spelling):** `selectLatestResult(run: GradingRun): GradeResult | null`, body
equivalent to `run.results.at(-1) ?? null`. Position-based, not field-comparing.
No React, no I/O, no server import (client-bundle-safe pure leaf).

**Oracle construction (prove it is constructible from the tree):** the test
declares its OWN local factories - it MUST NOT import from
`incrementalRunPlan.test.ts` or any other `*.test.ts` (that re-runs the imported
file's describe blocks; see the no-cross-test-file-imports rule). Build:

- `const gradedA: GradedResult = { student: "Ada", overallComment: "", strengths: "s-ada", improvements: "", resubmitNotice: "", rubricAreas: [], totalScore: "9/10", feedback: "", mergedFileCount: 1, submittedFiles: [] };`
  (a second graded row `gradedB` with distinct field values, e.g. `student: "Boris", totalScore: "7/10"`).
- `const ungradedU: UngradedResult = { student: "Uma", overallComment: "", strengths: "Not graded...", improvements: "", resubmitNotice: "", rubricAreas: [], totalScore: "", feedback: "", mergedFileCount: 0, submittedFiles: [], ungraded: { kind: "not-attempted", stoppedBy: "submission-count-bound", sourceIndex: 2, student: "Uma", message: "Not graded..." } };`

These literals are TYPE-CHECKED by `tsc --noEmit` (in the gate): a missing or
mistyped field fails the type gate, so the oracle's shape is itself verified. The
construction is possible - every field is required/optional per `types.ts:212-293`
and all values are plain primitives/empties.

**Frozen cases (assert against the NAMED const, NEVER against `results.at(-1)` -
comparing the function to its own definition is the tautology trap):**

1. `selectLatestResult({ ...runOf([gradedA, gradedB]) })` `=== gradedB` (identity,
   `toBe`). Last element returned by reference.
2. `selectLatestResult(runOf([gradedA, ungradedU]))` `=== ungradedU` (identity).
   The LAST element is returned even when it is UNGRADED - proves position-based,
   not graded-only. Additionally `isUngraded(result) === true` (the discriminator
   reachable on the row itself, `types.ts:200-202`).
3. `selectLatestResult(runOf([ungradedU, gradedB]))` `=== gradedB` (identity) and
   `result.ungraded === undefined` (graded discriminator preserved). **Note the
   oracle asserts the graded/ungraded DISCRIMINATOR (`ungraded`), never a
   `sourceIndex` on a graded row - a graded row has none (section 2).**
4. `selectLatestResult(runOf([]))` is `null` - assert with `toBeNull()`, NOT
   `toBeFalsy()` (see S2: `undefined` is falsy but is the wrong value).

`runOf(results)` is a tiny local helper building a minimal `GradingRun`
(`{ results, rubricAreaNames: [], fullCreditChecklist: [] }` plus any other
required `GradingRun` fields per `types.ts:347`) - duplicated locally, not
imported.

**Sabotages for AC-M1(a)** (named mutation; RED expected; GREEN after restore):

- **S1** `.at(-1)` -> `.at(0)`. Case 1 returns `gradedA`, oracle expects `gradedB`
  -> **RED**. Restore -> GREEN. **Discriminates: YES.**
- **S2** drop `?? null` (`return run.results.at(-1);`). Case 4 gets `undefined`;
  `toBeNull()` -> **RED**. Restore -> GREEN. **Discriminates: YES - but only if the
  assertion is `toBeNull()`.** `toBeFalsy()` would pass on `undefined` and
  discriminate NOTHING here; the oracle MUST use `toBeNull()`.
- **S3** return a spread `return { ...run.results.at(-1) } as GradeResult;`. Cases
  1-3 identity `toBe` -> **RED** (new reference). Restore -> GREEN. **Discriminates:
  YES.** (This is why the oracle uses `toBe` identity, not a field-by-field
  deep-equal that a spread would satisfy.)
- **S4** return last GRADED only
  (`return gradedResults(run.results).at(-1) ?? null;`, using the real
  `types.ts:204` helper). Case 2 returns `gradedA` (last graded), oracle expects
  `ungradedU` -> **RED**. Restore -> GREEN. **Discriminates: YES.** This guards the
  load-bearing "newest ARRIVED regardless of graded/ungraded" semantic; without
  case 2 this mutation would survive.

**Satisfiability (elevated-seat obligation 1, reasoned not coded because the
dispatch forbids writing code):** the body `return run.results.at(-1) ?? null;`
satisfies every case by inspection - case 1-3 return the array element BY
REFERENCE (identity holds), case 4 returns `null`. No case contradicts another.
The red set is therefore satisfiable by the one-line leaf. I did NOT build an
isolated reference tree (code is out of scope for this seat); satisfiability here
is trivial enough to establish by inspection, and I say so rather than claim a
green run I did not perform.

### AC-M1(b) - the inherited upstream invariant. NAMED, not re-authored.

Object: `mergeArrivedResults` (`incrementalRunPlan.ts:174-184`). The ascending
order the leaf inherits is ALREADY guarded, at HEAD, by:

- `incrementalRunPlan.test.ts:140-146` - returns arrived rows ASCENDING by
  `sourceIndex` regardless of arrival order.
- `:154-162` - the **WATCHED** mutation: an implementation keyed on ARRIVAL ORDER
  instead of `sourceIndex` goes RED here.
- `:164-166` - empty input returns `[]`.
- `:180-189` (+ the watched first-wins mutation :191-199) - LAST-WINS on a
  duplicate `sourceIndex`, by identity.

**AC-M1(b) is SATISFIED by naming these pins.** Do NOT author a duplicate (a
second copy comparing `mergeArrivedResults` to itself would be a tautology, and
the dispatch forbids it). Direction of failure: `mergeArrivedResults` returns
`results` in any non-ascending order, or drops last-wins -> the pins above go RED.
Discrimination is OWNED by the existing watched mutation at :154-162 - already
proven RED against the arrival-order implementation. M1 does not edit
`incrementalRunPlan.ts`, so these cannot regress from an M1 change; see the gate
note in section 6 on whether to include this file in the confirmatory run.

### AC-M2 - reachability: the surface is a LAYER (THE pin most likely built loose)

This is the repo's twice-shipped defect class (a library + a surface with no
layer between them, both verifies green - memory
`verify-reachability-not-just-correctness`). The loose build to defend against:
the implementer mounts the card and feeds it `driver.run.results.at(-1)` INLINE,
leaving `selectLatestResult` an UNCALLED dead export - both a leaf-correct test
and a card-present test pass while the actual leaf ships dead.

Object: `GradingChatPanel.tsx`. Instrument: new describe block(s) in the EXISTING
`GradingChatPanel.structure.test.ts`, reusing its `read(PANEL)` and
`withoutLineComments`. Pins:

1. **Both leaves are imported from their own modules** (proves the module seam
   exists, leaf is a separate file): `withoutLineComments(read(PANEL))` matches an
   import of `LatestResultCard` from `"./LatestResultCard"` and of
   `selectLatestResult` from `"./latestGradedResult"`. Tolerant of default-vs-named
   export form; pin the IDENTIFIERS and the specifier, not the import style.
2. **The leaf is CALLED on the live run** (kills the dead-leaf build): the panel
   source contains a `selectLatestResult( ... )` call whose argument slice (from
   the call token to its matching `)`) contains `driver.run`. RED if
   `selectLatestResult` is imported but never called, or is called on a stub.
3. **The card is mounted:** `source.indexOf("<LatestResultCard")` > -1.
4. **The card sits with the sticky composer, above the composer** (ties the pin to
   the 0-scroll goal as far as source can - see the SEAT RULING below):
   `indexOf("chat.stickyComposer") < indexOf("<LatestResultCard") < indexOf("<ChatComposer")`.
5. **The card mount is NOT a stub:** the card-mount slice (from `<LatestResultCard`
   to the next `/>` or `>`) contains a `{` JS interpolation and does NOT match a
   literal stub (`result={null}`, `result={[]}`, `result={{}}`, `result={undefined}`).

**Honest residual (do not pretend source text proves more than it does):** pins 2
and 5 together prove the leaf is called on the live run and the card is fed a JS
value, but SOURCE TEXT alone cannot prove the identifier the card receives is the
same value `selectLatestResult` returned (the implementer may bind it to a
variable and pass that). That last link is enforced by the TYPE GATE, not by text:
`LatestResultCard` declares `result: GradeResult | null`, so `tsc --noEmit` (in
the gate) rejects feeding it anything but the leaf's output type, and lint's
no-unused rejects an imported-but-unused `selectLatestResult`. The pin establishes
presence + call-on-live-run + position; tsc/lint close the flow. RES-M-D records
the remainder.

**SEAT RULING on position (surfaced because the scope left it open and it is
load-bearing):** the scope says the card goes "inside or just above
`chat.stickyComposer`." For AC-R2 (reading the newest result costs 0 page scroll
at N = 10, 40 rows), the card MUST stay in view as the matrix grows - which means
it must be INSIDE the sticky wrapper (or its own sticky element), NOT a non-sticky
element above the matrix. A "just above the matrix, non-sticky" card scrolls out
of view exactly when rows pile up, passing a naive "card before composer" pin
while failing AC-R2. Pin 4 therefore requires the card BETWEEN the sticky-wrapper
open and the composer. This is my recommended reading; it is a design detail the
scope left as a choice, flagged in section 8.

**Sabotages for AC-M2:**

- **S1** feed the card a stub: `<LatestResultCard result={null} />`. Pin 5 (stub
  denylist) -> **RED**; pin 2 may still pass if `selectLatestResult` is called
  elsewhere, so pin 5 is the discriminating one here. **Discriminates: YES.**
- **S2** inline the computation, drop the leaf call:
  `<LatestResultCard result={driver.run.results.at(-1) ?? null} />` and remove the
  `selectLatestResult` import/call. Pin 2 (no `selectLatestResult(` call) ->
  **RED**; lint no-unused also fires if the import is left. **Discriminates: YES** -
  this is the exact dead-library build the pin exists to catch.
- **S3** move the card above the matrix, outside the sticky wrapper. Pin 4 ordering
  -> **RED** (`<LatestResultCard` no longer between `chat.stickyComposer` and
  `<ChatComposer`). **Discriminates: YES at the structural level.** The VISUAL
  0-scroll claim remains OWNER (RES-M-A); the pin catches the gross structural
  regression, not the pixel.

### AC-M3 - the card renders the user-visible content, not a proxy

Object: `LatestResultCard.tsx`. Instrument: a source-structure pin (a new describe
in `GradingChatPanel.structure.test.ts` reading a new `CARD` constant, or a sibling
`LatestResultCard.structure.test.ts` - either is fine; if a new test file, name it
WITHOUT the `stripComments` literal and duplicate any helper). Pins over
`withoutLineComments(read(CARD))`:

1. References the grade: contains `totalScore`.
2. References ALL THREE feedback fields: contains `strengths` AND `improvements`
   AND `resubmitNotice` - OR imports `FEEDBACK_FIELDS` from
   `"../grading-results/gradingResultsHelpers"` and maps it (matching the matrix's
   own `RowFeedbackBoxes.tsx:115`). Importing that CONSTANT is read-only and does
   NOT edit the shared component (AC-M6 bans EDITS to grading-results/*, not
   imports of its constants).

Direction of failure: RED if the card surfaces a proxy - a `data-` attribute, a
badge, or a `.length`/count - in place of the grade and the three feedback
sections.

**Sabotages for AC-M3:**

- **S1** card renders only `result.student` and a "Graded" badge. Pins 1 and 2 ->
  **RED** (no `totalScore`, no feedback fields). **Discriminates: YES.**
- **S2** card renders `result.overallComment` only (the composed blob) instead of
  the three fields. Pin 2 -> **RED**. **Discriminates: YES against the scope's
  "three feedback sections in full."** FLAGGED as a fork (section 8): if the owner
  prefers the single composed `overallComment`, pin 2 relaxes to "contains
  `overallComment` OR the three field names" - but as authored the scope says three
  sections, so the pin requires three.

**Deliberately NOT a hard machine pin: the ungraded-disclosure APPEARANCE.** On an
ungraded row the three fields may be `""` and `ungraded.message` / `strengths`
carry the reason (`types.ts:224`). Whether the card DISPLAYS the ungraded state
distinctly is rendered appearance - OWNER (RES-M-B). The leaf test case 2 already
proves the ungraded SHAPE reaches the card; forcing a `ungraded`/`isUngraded`
reference in the card source would over-specify (a card rendering `strengths`
already shows the reason). Routed to owner, not asserted.

### AC-M4 - no new persisted key (canary stays 4)

Object: the grading-chat `ta-` key set. Instrument: EXISTING
`grading-chat-storage-keys.structure.test.ts` - it scans ALL non-test `.ts/.tsx`
in `src/app/components/grading-chat/` (raw source, comments included) and asserts
the set equals the frozen four (`:13-18`). The two NEW files
(`latestGradedResult.ts`, `LatestResultCard.tsx`) are auto-included by that scan
(`nonTestFiles()` :28-32), so no edit to the canary is needed; a stray `ta-` key
in either new file breaks the set automatically. M1 as ruled adds NO key (the card
is driven by run state, not a user toggle).

**Sabotage:** add `const k = "ta-latest-result-open";` to `LatestResultCard.tsx`.
Set != frozen four -> **RED** (`:48-50`). Restore -> GREEN. **Discriminates: YES**
(the canary's own :52-58 tests already prove a new quoted/template key breaks it).

### AC-M5 - new CSS is applied (orphan ratchet stays 118)

Object: the classes M1 adds to the EXISTING `grading-chat.module.css` under the
`chat` binding. Instrument: `page-module-css-orphan-classes.test.ts`
(auto-discovers every `*.module.css` under `src/`, :80; `PINNED_ORPHAN_CEILING =
118`, :316). The ratchet fires in BOTH directions: `.toBeLessThanOrEqual(118)`
:431 AND `.toBe(118)` :436 - so a rise fails AND a stale-high pin fails. A class
defined in the module but never referenced as `chat.<name>` (or `binding.<name>`
in the card) raises the orphan count to 119 -> **RED**. Fix is to APPLY or DELETE
the class, NEVER to raise the pin (the failure message :422-425 says so).

Constraints: card classes go in the EXISTING `grading-chat.module.css` - NO new
module (so no new stylesheet for the discovery walk, and the grading-chat dir
stays at ONE module). Every added `.className` must be referenced via the local
`chat` binding in `GradingChatPanel.tsx` and/or via the card's own binding of the
SAME stylesheet (the orphan scanner resolves references per importing file by
resolved path, :165-176, so the card importing `grading-chat.module.css` and
referencing `styles.latestCard`/`chat.latestCard` counts). Do NOT touch
`page.module.css`.

**Sabotages for AC-M5:**

- **S1** add `.latestResultCard { padding: var(--space-4); }` to the module and
  never reference it. Orphan count 118 -> 119 -> **RED** (both :431 and :436).
  Restore -> GREEN. **Discriminates: YES.**
- **CORRECT-STATE CHECK (not a sabotage, stated so the ratchet is not mistaken for
  a trap):** add `.latestResultCard` AND reference `chat.latestResultCard` in the
  panel/card. Count stays 118 -> GREEN. This is the expected passing state; it
  confirms the ratchet does not block correctly-applied new classes.

### AC-M6 - confirms kept, shared matrix untouched, card read-only (F1)

- **M6a (shared untouched).** Instrument: `git status --short` at the wave gate
  against the write set. Direction: RED if it shows ANY edit to
  `src/app/components/GradingResults.tsx`, `src/app/components/grading-results/*`,
  or `src/app/components/grading-results/useResultsSort.ts`. The matrix's
  persisted `edits` state lives inside `GradingResults.tsx`; M1 duplicates none of
  it. **Sabotage:** touch `GradingResults.tsx` (even whitespace) -> `git status`
  shows it -> **RED**. **Discriminates: YES.**
- **M6b (confirm kept).** Instrument: EXISTING
  `GradingChatPanel.structure.test.ts:112-119` - `window.confirm(` present in
  `handleNewSession` AND ordered BEFORE `driver.reset()`. Direction: RED if the
  confirm is removed or reordered. **Sabotage:** delete the `window.confirm` line
  -> :117 **RED**. **Discriminates: YES.**
- **M6c (F1 read-only - the one that CANNOT be a trustworthy machine pin, and I say
  so).** A source denylist such as "the card does not contain the string 'Post'"
  is the keyword-guard trap this seat exists to refuse: it is defeated by four
  appended words that keep the token and change the meaning, and it bans the
  owner's own vocabulary. **I do NOT author it.** The honest enforcement is:
  (i) M6a - a Post on the card needs the matrix's persisted edit/post state, which
  means either editing `GradingResults.tsx`/grading-results (caught by M6a) or
  adding a new post-action file to the write set (caught by the wave-gate write-set
  check); (ii) for the dominant text/file case a Post is structurally impossible -
  those rows carry no `userId` (`GradingResults.tsx:312-318,641` gate Post on
  `typeof userId === "number"`); (iii) OWNER verification that the rendered card
  shows no actionable Post/Edit/grade control (RES-M-C). **A sabotage that adds a
  Post button to the card which reads an INLINE/LOCAL post path (not the matrix's
  state) would go GREEN on the whole machine gate - it discriminates NOTHING at the
  machine level.** That is precisely why F1 is an owner-verified RULING here and not
  a machine pin; recorded as RES-M-C, not dressed up as coverage.

---

## 5. EXECUTABLE vs ARGUED (explicit, per the non-negotiable)

**Executable here (vitest node-env / git / tsc), will go RED on the named
mutation:** AC-M1(a) S1-S4; AC-M1(b) (inherited, already red against :154-162);
AC-M2 S1-S3 (source-text structure); AC-M3 S1-S2 (source-text structure); AC-M4
(key canary); AC-M5 S1 (orphan ratchet); AC-M6a (git status); AC-M6b (confirm
pin). Plus `tsc --noEmit` type-checking the oracle literals and the card's
`result` prop.

**Argued / OWNER-verified, NOT asserted as verified (nothing renders under
vitest):**
- AC-R1/R2/R3 felt scroll/click and 0-px claims (scope section 5 OWNER block) -
  the SMOOTH-BASELINE walk is the instrument. No pixel pin invented.
- Visual adjacency of the card to the composer and "reads with 0 scroll" - the
  structural pin AC-M2 pin 4 is the closest source proxy; the pixel is owner
  (RES-M-A).
- The identifier actually flowing from leaf output into the card's displayed value
  beyond presence+call+type (RES-M-D).
- The ungraded-disclosure appearance (RES-M-B).
- F1: no actionable control on the rendered card (RES-M-C) - machine denylist
  deliberately declined.

---

## 6. GATE COMMAND

Two-or-more test files -> `npm run test:paths`, never a raw multi-path vitest
(which silently drops unmatched paths and exits 0). Explicit paths:

```
npm run test:paths -- \
  src/app/components/grading-chat/latestGradedResult.test.ts \
  src/app/components/grading-chat/GradingChatPanel.structure.test.ts \
  src/app/components/grading-chat/grading-chat-storage-keys.structure.test.ts \
  src/app/components/courses/page-module-css-orphan-classes.test.ts
```

Then, once: `npx tsc --noEmit` (no `/s` dotAll flag anywhere in the diff - it
passes vitest and fails tsc TS1501). Then `git status --short` against the wave's
write set (AC-M6a). If AC-M3 is authored as a separate
`LatestResultCard.structure.test.ts`, add that path to the `test:paths` list.

**Confirmatory (optional, belt-and-suspenders):** add
`src/app/components/grading/incrementalRunPlan.test.ts` to the run to show AC-M1(b)
is green. M1 does NOT edit `incrementalRunPlan.ts`, so those pins cannot regress
from an M1 change; including the file only confirms the inherited guarantee is
live, it is not required by the write set.

---

## 7. CANARY REALITY for grading-chat (stated explicitly, per the dispatch)

- **No frozen-roots / R-2 canary exists for grading-chat.** Measured:
  `git ls-files '*.test.ts' | grep -i frozen` = NONE. The `frozen-roots` concept
  is repo-grades-specific (its matches are all in `docs/*`). Therefore a NEW
  grading-chat file (`latestGradedResult.ts`, `LatestResultCard.tsx`, and an
  optional new `*.structure.test.ts`) needs **NO R-2 roots bump** - there is no
  roots canary in this directory to bump. The repo-grades R-2 bump the dispatch
  wondered about does NOT apply here (different directory, no such test).
- **Key canary (`grading-chat-storage-keys.structure.test.ts`) auto-covers new
  files.** It walks all non-test `.ts/.tsx` in the dir (:28-35). Adding
  `latestGradedResult.ts` + `LatestResultCard.tsx` keeps `files.length > 3` (:41),
  so the "scans a real population" canary still passes; the frozen-key set stays at
  four as long as neither new file contains a `ta-` literal.
- **Orphan ratchet auto-covers the module.** It auto-discovers every `*.module.css`
  under `src/` (:80); adding classes to the EXISTING `grading-chat.module.css`
  (no new module) keeps the module count stable and the ratchet at 118 as long as
  every new class is referenced.
- **grading-chat test files at HEAD (7):** `GradingChatPanel.structure.test.ts`,
  `chatFileBatch.test.ts`, `chatSetupFill.test.ts`, `chatSetupMemory.test.ts`,
  `chatSubmissionIntake.test.ts`, `grading-chat-storage-keys.structure.test.ts`,
  `useContinuousGradingRun.lifecycle.test.ts`.

---

## 8. RESIDUAL REGISTER (owner / instrument / step - missing any one is a deletion)

Mirrors the scope's RES-GWO-1..6 that pertain, plus the test-seat residuals this
notes file introduces. The scope's authoritative copy is on the backlog row
(commit `3f0fb1f4`); this is a working copy, not a substitute.

- **RES-M-A (= RES-GWO-1/2, AC-R1/R2).** Real page + horizontal scroll to read the
  just-graded result, pre/post build, at N = 1/10/40 rows. Owner: repo owner.
  Instrument: SMOOTH-BASELINE `docs/run-setup-baseline-walk.md` snippet 1 stage B,
  EXTENDED to measure composer-to-newest-result-feedback distance. Step: before and
  after the M1 build.
- **RES-M-B (= RES-GWO-3, AC-R3).** Legibility of the three feedback sections, and
  the ungraded-disclosure appearance, in the card vs the matrix cell. Owner: owner.
  Instrument: the walk, reading one graded and one ungraded result in the card.
  Step: after the M1 build.
- **RES-M-C (F1 read-only).** No visible Post/Edit/grade control on the card.
  Owner: owner/reviewer. Instrument: eyes on the rendered card (a source denylist
  is the keyword-guard trap, deliberately not authored - AC-M6c). Step: the UX
  pass on the as-built diff, before push.
- **RES-M-D (leaf-to-card value flow).** That the value the card DISPLAYS is the
  leaf's output, beyond source presence + call-on-live-run + prop type. Owner:
  owner. Instrument: tsc types the card's `result` prop as the backstop; the walk
  confirms the displayed value is the latest submission. Step: after the M1 build.
- **RES-GWO-4 (matrix horizontal-scroll magnitude), RES-GWO-5 (F1 Canvas-URL post
  from the card), RES-GWO-6 (SMOOTH-BASELINE dependency)** - carried from the scope
  unchanged; owner/walk; before any posting build / fold into SMOOTH-BASELINE.

---

## 9. FLAGS: the loose-build risk, the forks, and the collision

- **THE ONE PIN MOST LIKELY TO BE BUILT LOOSE: AC-M2 (surface-is-a-layer).** An
  implementer can mount the card and feed it `driver.run.results.at(-1)` inline,
  shipping `selectLatestResult` as a dead uncalled export with every other gate
  green - the repo's twice-shipped defect. AC-M2 pin 2 (leaf CALLED on `driver.run`)
  + lint no-unused is the specific guard; the checker must confirm the implementer
  did not inline past the leaf.
- **FORK (M3 content shape):** three separate feedback fields (scope's wording,
  what the pin requires) vs the single composed `overallComment`. Recommended:
  three fields (matches the scope and the matrix's RowFeedbackBoxes). If the owner
  prefers the composed blob, AC-M3 pin 2 relaxes to "three field names OR
  `overallComment`." Every answer terminates: the pin is authored to the three-field
  reading; the owner's answer is applied as transcription.
- **SEAT RULING surfaced (M2 position):** the card renders INSIDE the sticky
  composer wrapper (recommended), not merely "just above the matrix," because a
  non-sticky card above the matrix fails AC-R2 at N rows. The scope left this as
  "inside or just above"; I pinned INSIDE. If the owner wants it strictly above the
  composer but outside the sticky wrapper, AC-M2 pin 4 changes and AC-R2's
  0-scroll-at-N claim is at risk - flag for the owner.
- **FORK (F1, carried from scope):** card read-only (ruled, recommended) vs card
  also posts Canvas-URL rows (enters GR-POST-ONE-CONFIRM, touches shared state).
  Authored to read-only (RES-GWO-5 / RES-M-C).
- **COLLISION:** `grading-chat/` overlaps the complete SMOOTH-GRADER grader work.
  An M1 build must be DISJOINT IN TIME from any grading-chat/SMOOTH-GRADER build -
  never concurrent (scope section 7). The orchestrator confirms no grading-chat
  build is in flight (`git status --short src/app/components/grading-chat` empty)
  before dispatching the M1 build.

---

## 10. Command ledger

Reads: `docs/grader-workflow-overhaul-scope.md` (full); `src/lib/grade/types.ts`
(:140-309, :347-348); `src/app/components/grading/incrementalRunPlan.ts`
(:160-184); `src/app/components/grading/incrementalRunPlan.test.ts` (:130-199);
`src/lib/grade/reconcile.ts` (:80-119);
`src/app/components/grading-chat/GradingChatPanel.tsx` (:155-244);
`src/app/components/grading-chat/GradingChatPanel.structure.test.ts` (full);
`src/app/components/grading-chat/grading-chat-storage-keys.structure.test.ts`
(full); `src/app/components/grading-chat/grading-chat.module.css` (full);
`src/app/components/grading-chat/useContinuousGradingRun.ts` (:1-148 header/types);
`src/app/components/courses/page-module-css-orphan-classes.test.ts` (full).

Commands: `git rev-parse --short HEAD` (e43dbedd);
`git ls-files '*.test.ts' | grep -i frozen` (NONE);
`git ls-files 'src/app/components/grading-chat/*.test.ts'` (7 files);
`grep -n "FEEDBACK_FIELDS"` (gradingResultsHelpers.ts:216);
Glob `**/incrementalRunPlan*.ts`, `**/grading-chat/**`.

Not run: tsc, lint, vitest, build, any render. Not determined (cannot be, here):
rendered scroll/horizontal distances and the fold; whether the card is visually
composer-adjacent; the owner's ratified numeric targets; the three-field-vs-blob
rendering choice (fork); whether the card is inside-vs-above the sticky wrapper if
the owner overrides the seat ruling.
