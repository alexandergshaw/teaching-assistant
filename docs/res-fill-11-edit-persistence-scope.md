# RES-FILL-11 - grading-edit persistence leaks across a live Canvas-URL change

Architecture / fix scope. No production code is written here. A `loop-checker`
reads this before any implementer does.

This is a **bug fix**, not feature work: no leverage claim is owed (seat trigger
fired: bug fix - `seats.md`, Acceptance criteria). It is a **data-integrity**
fix: assignment A's instructor-written feedback is persisted under assignment
B's storage key.

Every quantity below names the command that produced it, run from the repo root
in PowerShell / Git Bash on 2026-10-08 against HEAD (`a6d89640`).

---

## 1. The defect, measured against the tree (not the a39 doc)

The task brief cited `~:220-230` (resets) and `~:235-237` (persistence). Those
addresses have drifted since GR-POST-ONE-CONFIRM landed. Re-measured against the
current file:

- `GradingResults.tsx` is **996 lines** (`@(Get-Content src/app/components/GradingResults.tsx).Count`).
- The seven edit-state resets live in the adjust-state-on-render block
  `if (identity !== prevIdentity) { ... }` at **`GradingResults.tsx:259-269`**.
  Its gate is `identity`, defined at `:238` as
  `const identity = runResetKey(runKey, run);`. `runResetKey(runKey, run)`
  returns `runKey ?? run` (`gradingResultsHelpers.ts:747-749`). **The reset gate
  does not read `canvasUrl` at all.**
- The two `loadGradingResultsEdits(canvasUrl, run, editsSurface)` sites are at
  `:236` (lazy init) and `:261` (reset reseed)
  (`grep -n "loadGradingResultsEdits(canvasUrl, run, editsSurface)" src/app/components/GradingResults.tsx`).
- The persistence effect is at **`:274-276`**:
  `persistGradingResultsEdits(canvasUrl, edits, editsSurface);` with dependency
  array `[canvasUrl, edits, editsSurface]` at `:276`.

`canvasUrl` is a **live, mutable field prop**. On the primary surface it is
`GradingTab.tsx`'s own `const [canvasUrl, setCanvasUrl] = useState("")`
(`GradingTab.tsx:100`), bound to a text input the user types into
(`value={canvasUrl}` at `GradingTab.tsx:386`) and also set programmatically
(`setCanvasUrl(row.canvasUrl)` at `GradingTab.tsx:203`). `GradingTab.tsx:571`
passes `runKey={selectRunKey(phase, runId)}`; `selectRunKey` returns
`phase === "idle" ? undefined : \`incremental-${runId}\``
(`grading/incrementalRunPlan.ts:345`), which is **stable in `runId`** and
changes only on a new grading dispatch (`incrementalRunPlan.test.ts:425` pins
`selectRunKey("running",7) === selectRunKey("complete",7)`; `:426` pins it
changes with `runId`).

### The leak, step by step

1. A run for assignment A is displayed. The user has edited feedback; `edits`
   holds A's feedback in memory. `identity` is `incremental-<runId>` (or the run
   object for a no-`runKey` caller), fixed for the life of this run.
2. The user types a different Canvas URL **B** into the field (common: grade a
   zip first, then paste the Canvas URL to post; or correct a typo in the URL)
   **without starting a new run**. `canvasUrl` changes `A -> B`; `runId` does
   not change, so `identity` does not change.
3. The reset block (`:259-269`) does **not** fire - its gate is `identity`, not
   `canvasUrl` - so `edits` is NOT reseeded; it still holds A's feedback.
4. The persistence effect (`:274-276`) **does** fire - `canvasUrl` is in its dep
   array - and writes the in-memory `edits` (A's feedback) under
   `gradingResultsEditsKey(B, editsSurface)` = `ta-grading-results-edits:B`
   (`gradingResultsHelpers.ts:565-572`).
5. A's feedback is now persisted under B's key. When a real run for assignment B
   later mounts with `canvasUrl === B`, `loadGradingResultsEdits(B, runB, ...)`
   reads key B and `loadPersistedEdits` merges A's stored feedback onto B's
   seeded rows for every student whose name matches
   (`gradingResultsHelpers.ts:631-647`).

The a39 doc deferred this as a fork between two bad options: (1) add `canvasUrl`
to the reset deps - which would fire all seven resets on **every keystroke** in
the URL field, wiping in-progress edits (a worse defect); (2) leave it.

Affected surfaces (where `canvasUrl` can change mid-run): `GradingTab.tsx`
(classic zip/canvas) and `LiveFeedPanel.tsx`, which share GradingTab's
`canvasUrl` state. `GithubGradingPanel.tsx` always passes `""` and the grading
chat passes a per-session surface with its own `runKey`, so `canvasUrl` never
changes under them mid-run; the fix is byte-identical no-op for those (see 3.4).

---

## 2. The third option is sound and buildable - it is what this scope specifies

**Recommended reading, validated and adopted** (this is my architect reading
acted on per `AGENTS.md` SHAPE-5; it is NOT an owner ruling): decouple the
persistence KEY from the live `canvasUrl` field. Edits persist under **the URL
that produced THIS run**, captured when the run arrived - not whatever is
currently typed.

### 2.1 Does the run object carry a stable identity? Traced: no field, but the producing URL is capturable

`GradingRun` (`src/lib/grade/types.ts:380-401`) carries: `results`,
`rubricAreaNames`, `fullCreditChecklist`, `speedGraderUrl?: string | null`
(Canvas-source only; `null`/absent for zip, GitHub, chat), `sampleAnswer?`,
`rubricUsed?`, `rubricFingerprint?`. **It carries no `canvasUrl` field and no
assignment id.** The only per-run Canvas identity is `speedGraderUrl`, which is
absent for the zip/text runs that are exactly where this leak bites, so it is
NOT a usable universal key, and keying on it would change the stored key shape
and strand every instructor's existing edits (the exact hazard A36 documents at
`gradingResultsHelpers.ts:550-557`).

Therefore the run object does not hand us a ready stable identity string. **This
does NOT make option 3 unbuildable and is NOT an owner fork**, because the a39
recommended reading's own parenthetical - "the URL that produced THIS run" - is
recoverable without a run field: it is the value of `canvasUrl` at the instant
the run arrived. The reset block at `:259-269` is exactly "a run arrived," so
that is where we capture it.

### 2.2 The construction: a per-run snapshot of the producing URL

Hold the producing URL in component state that advances only when `identity`
advances - i.e. on the SAME trigger the reset block already uses. This makes the
persist key and the reset fire on one trigger instead of two divergent ones; the
asymmetry that is the bug becomes unrepresentable.

The three edits to `GradingResults.tsx`:

1. **Add snapshot state**, initialized to the URL live at first mount (which is
   the producing URL for the first run), next to the `edits` state at `:235`:

   ```
   // RES-FILL-11: the Canvas URL that produced the CURRENT run - the identity
   // the persisted edits belong to. Advances only when a new run arrives (the
   // identity block below), never when the live canvasUrl field is edited, so
   // typing a new URL cannot repoint an in-flight run's stored edits onto a
   // different assignment's key.
   const [editsKeyUrl, setEditsKeyUrl] = useState(canvasUrl);
   ```

2. **Re-snapshot inside the existing identity block** (`:259-269`), using the
   live `canvasUrl`, which AT RUN ARRIVAL is the URL that produced the run:

   ```
   if (identity !== prevIdentity) {
     setPrevIdentity(identity);
     setEditsKeyUrl(canvasUrl);            // <- new line
     setEdits(correctUngradedSeeds(run, loadGradingResultsEdits(canvasUrl, run, editsSurface)));
     ...
   }
   ```

3. **Key the persist effect on the snapshot** (`:274-276`):

   ```
   useEffect(() => {
     persistGradingResultsEdits(editsKeyUrl, edits, editsSurface);  // was canvasUrl
   }, [editsKeyUrl, edits, editsSurface]);                          // was canvasUrl
   ```

**The two LOAD sites (`:236`, `:261`) stay spelled
`loadGradingResultsEdits(canvasUrl, run, editsSurface)` verbatim.** At both
instants `canvasUrl === editsKeyUrl` (init: `editsKeyUrl` is initialized to
`canvasUrl`; reset: `setEditsKeyUrl(canvasUrl)` is queued in the same block with
`canvasUrl` as its value), so load is keyed identically whichever name is used.
Using `canvasUrl` at the load sites is also REQUIRED, not merely allowed: during
the reset render the `editsKeyUrl` state variable still holds its OLD value
(React has not committed `setEditsKeyUrl` yet), so reading `editsKeyUrl` there
would load under the previous run's key. Read `canvasUrl` - the value being
snapshotted - at both load sites.

No new helper function is introduced. A pure `nextEditsKeyUrl(prev, live,
isNewRun)` was considered and rejected: its only production call site is inside
the identity block where `isNewRun` is always `true`, leaving a production-dead
`false` branch - exactly the "a branch that can never fire" anti-pattern
`seats.md` Test seat warns against. The fix is intrinsically a component wiring
change (which value is threaded into the key), so there is nothing pure to
extract that is not artificial. This has a direct consequence for the oracle
layer - see section 4.0.

### 2.3 Why this fixes the leak AND avoids the keystroke-wipe

- **Leak closed.** On a bare URL keystroke, `canvasUrl` changes `A -> B` but
  `identity` does not, so the reset block does not run, so `editsKeyUrl` stays
  `A`. The persist effect's deps become `[editsKeyUrl=A, edits (unchanged),
  editsSurface (unchanged)]` - none changed - so the effect does NOT re-fire and
  does NOT re-persist under B. A's edits remain only under key A.
- **Keystroke-wipe not introduced.** The reset block's gate is UNCHANGED - still
  `identity !== prevIdentity`; `canvasUrl` is not added to it. A bare URL
  keystroke therefore does not run the block, so none of the seven `setEdits` /
  `setPostStatus` / `setPostSummary` / `setExpandedBox` / `setCodeRuns` /
  `setCodeRunning` / `setCodeOutputStudent` / `setBrowseFilesFor` resets fire
  (count: 8 setState calls in the block, `:260-268`; the brief's "seven" counts
  the state slices, treating `setPrevIdentity` as bookkeeping). This is strictly
  better than today, where the keystroke fired a spurious re-persist.

### 2.4 No stored data is stranded

For a run graded from URL A with no mid-run field edit, `editsKeyUrl === A ===`
today's `canvasUrl` at grade time, so the stored key is
`ta-grading-results-edits:A` - byte-identical to today. Behaviour changes ONLY
in the mutate-field-mid-run case. The key shape (`gradingResultsEditsKey`) is
untouched, so A36's legacy-key fallbacks and the W2 session-scoping are
unaffected.

---

## 3. Owning files and the minimal write set

### 3.1 `owns` (files the implementer EDITS)

| File | Change |
|---|---|
| `src/app/components/GradingResults.tsx` | The three edits in section 2.2: add `editsKeyUrl` state at `:235`, `setEditsKeyUrl(canvasUrl)` in the identity block (`:259-269`), and re-key the persist effect (`:274-276`) from `canvasUrl` to `editsKeyUrl`. Net +2 lines. |
| `src/app/components/grading-results/gradingResultsHelpersWiring.test.ts` | New `describe` block: the **load-bearing removal test** (section 4.1), following this file's own `CALL_PATTERN` + three-canary idiom (`:274-345`). Currently 345 lines (`@(Get-Content ...).Count`). |
| `src/app/components/grading-results/gradingResultsHelpersEditState.test.ts` | New `it`: the **supporting precondition test** (section 4.2), beside the existing FakeStorage persistence suite (`:407-520`). Currently 540 lines. |

No change to `gradingResultsHelpers.ts` (no new helper - section 2.2).

### 3.2 `adopted` (reads an EDITED file as source text; must stay GREEN; NOT edited)

Derivation command and output:

```
grep -rln "GradingResults.tsx" src/app/components/grading-results/*.test.ts
```
```
gradingResultsDisplayHelpers.test.ts
gradingResultsExtraction.wiring.test.ts
gradingResultsHelpers.test.ts
gradingResultsHelpersWiring.test.ts      <- in owns
gradingResultsPostOutcome.test.ts
postOneArming.test.ts
rubricProvenanceLeaf.test.ts
sortGradeRows.test.ts
ungradedDisclosure.test.ts               <- ADOPTED, load-bearing (below)
ungradedRowLabel.test.ts
```

The one that asserts on a line near the change:

- **`ungradedDisclosure.test.ts:568-573`** ("AC-6/S12: BOTH loadGradingResultsEdits
  call sites are wrapped in correctUngradedSeeds") matches
  `/correctUngradedSeeds\(run, loadGradingResultsEdits\(canvasUrl, run, editsSurface\)\)/g`
  against the component source and asserts `matches.length` is **exactly 2**.
  The fix leaves both load sites (`:236`, `:261`) spelled verbatim (section 2.2),
  so this stays green **by construction**. Constraint for the implementer: do
  NOT re-key the load sites to `editsKeyUrl`; only the persist site (`:275`) and
  its deps (`:276`) change.

The other eight are checked-safe:

- `gradingResultsExtraction.wiring.test.ts:333,338` mention `canvasUrl={canvasUrl}`
  only inside **inline fixture string literals** for a JSX-attribute parser -
  they do not read the real component's persist/reset region, so the fix cannot
  affect them (confirmed by opening both lines).
- `gradingResultsPostOutcome`, `postOneArming`, `rubricProvenanceLeaf`,
  `ungradedRowLabel`, `gradingResultsDisplayHelpers`, `sortGradeRows`,
  `gradingResultsHelpers` assert nothing on the persist effect, the identity
  block, or `canvasUrl` (grep for `persistGradingResultsEdits|canvasUrl|prevIdentity|useEffect|editsKeyUrl`
  returns no hit in their bodies except the fixtures noted above).

### 3.3 Not trivially revertible

Nothing. No migration, no shared-function signature change, no persisted-key
SHAPE change (`gradingResultsEditsKey` is untouched; only WHICH url the
component passes to the existing persist function changes). A revert is the
three edits in 2.2 undone.

### 3.4 Line ceiling

`GradingResults.tsx` is 996 (`@(Get-Content).Count`); the fix is +2 net lines ->
~998, under `LIMIT = 1000` (`src/file-size-ceiling.structure.test.ts:41`).
`GradingResults` is NOT in that test's `ALLOWED_OVERAGE` ratchet
(`grep -n "GradingResults" src/file-size-ceiling.structure.test.ts` returns
nothing), so no pin to bump. The wave gate MUST still run
`file-size-ceiling.structure.test.ts` unconditionally (it is the one canary
every gate carries; `this-repo.md:46-49`). If the implementer's comment lines
push it to the wall, drop comment lines - the code change is 2 lines and needs
no extraction.

---

## 4. The frozen oracle

### 4.0 Which layer the removal test binds to (the load-bearing shape decision)

The brief asked for the frozen oracle as "a `gradingResultsHelpers.test.ts` case
over `gradingResultsEditsKey` + `loadGradingResultsEdits` ... that ... reds" on
the sabotage. **Measured against the tree, a pure-helper test over those two
functions alone CANNOT observe this defect**, and I am recording the conflict
rather than adopting the instrument silently (`AGENTS.md`: refuse a ruling you
can disprove):

- `gradingResultsHelpersEditState.test.ts:470-479` ALREADY contains exactly that
  test ("keeps a different canvasUrl's persisted edits untouched") - two URLs,
  one run, asserts B's load returns seeded not leaked. It passes TODAY, with the
  bug shipping. Proof: the bug is the COMPONENT passing the live `canvasUrl` to
  `persistGradingResultsEdits`; `gradingResultsEditsKey` and
  `loadGradingResultsEdits` are pure and unchanged by the fix. The sabotage
  (revert the component to key off the live field) changes no line those
  functions see, so a test over only those functions stays green on the
  sabotage. It is necessary (it proves keys are URL-distinct, the precondition)
  but NOT sufficient.

This is the "surface is a layer" / "pin the artefact the user sees, not a proxy"
case. The defect lives entirely in the component's choice of argument, and **no
component is rendered by any test here** (`this-repo.md:134`,
`gradingResultsHelpers.ts:10-14`). Therefore the removal test must be a
**source-text wiring test over `GradingResults.tsx`** - the only instrument that
can observe which value the component threads into the key - following the exact
idiom already in `gradingResultsHelpersWiring.test.ts:274-345` (a pattern plus
canaries proving the detector discriminates). The pure-helper test stays as the
supporting precondition. I am keeping the brief's INTENT (an executable test
that reds when you revert to the live field) and correcting only the LAYER it
must live at.

### 4.1 The removal test (load-bearing) - `gradingResultsHelpersWiring.test.ts`

A new `describe("RES-FILL-11: edits persist under the run's producing URL, not
the live canvasUrl field")`. Reuse this file's `readStrippedSource` helper
(strips comments, `:286-290` / `:324-328`) so a pattern cannot match commented-out
code.

Object under comparison: the comment-stripped source of
`src/app/components/GradingResults.tsx`.

Assertions (each names its instrument and its direction of failure; spellings
are tolerant regexes per `MEMORY.md` "source-text tests over-specify" - pin the
FACT and the ordering, not exact whitespace):

1. **Persist is keyed on the snapshot, not the live field.**
   - `PERSIST_SNAPSHOT = /persistGradingResultsEdits\(\s*editsKeyUrl\s*,/`
   - `PERSIST_LIVE = /persistGradingResultsEdits\(\s*canvasUrl\s*,/`
   - Assert source matches `PERSIST_SNAPSHOT` AND does NOT match `PERSIST_LIVE`.
   - Direction of failure: RED if the persist call passes `canvasUrl` (the
     sabotage / today's bug).
2. **The persist effect's dependency array tracks the snapshot, not the live
   field.** Match the `useEffect(... persistGradingResultsEdits ...)` region and
   assert its dep array contains `editsKeyUrl` and does NOT contain a bare
   `canvasUrl` entry. Direction of failure: RED if `canvasUrl` is a persist-effect
   dependency (which is what makes a keystroke re-fire the write).
3. **The snapshot advances only on a new run.** `setEditsKeyUrl(` appears
   exactly once in the file, and that occurrence is within the
   `if (identity !== prevIdentity) { ... }` block. Instrument: count occurrences
   of `/setEditsKeyUrl\(/g` is 1; and the identity block region (from
   `if (identity !== prevIdentity)` to the matching close) contains it.
   Direction of failure: RED if the snapshot is updated anywhere reachable by a
   bare `canvasUrl` change (e.g. a `useEffect` on `[canvasUrl]`), which would
   reintroduce the leak by a different route.
4. **The reset gate does not newly read `canvasUrl` (keystroke-wipe guard).**
   Match the identity-block gate line and assert it is `identity !== prevIdentity`
   and does NOT reference `canvasUrl`. Direction of failure: RED if the reset
   block is re-gated on `canvasUrl` (option 1, the worse defect).

Three canaries proving the detectors discriminate (the idiom at `:292-305`):
- `PERSIST_SNAPSHOT` matches `"persistGradingResultsEdits(editsKeyUrl, edits, editsSurface)"` (real shape detected).
- `PERSIST_LIVE` matches `"persistGradingResultsEdits(canvasUrl, edits, editsSurface)"` (the pre-fix / sabotage shape is detectable).
- Neither pattern matches an unrelated call, e.g. `"persistRepoGradesUiState(canvasUrl, x)"`.

### 4.2 The supporting precondition test - `gradingResultsHelpersEditState.test.ts`

Add one `it` to the existing `describe("localStorage-backed persistence ...")`
block (`:407`), reusing its `FakeStorage` and `run` fixtures. This is the
brief's requested two-URL / one-run shape, labelled explicitly as the
PRECONDITION (keys are URL-distinct so persisting under A never reaches a B
load), with a comment stating it does NOT by itself catch the component bug -
4.1 does. Shape:

- Persist A's edited feedback under `urlA` via
  `persistGradingResultsEdits(urlA, { ...seeded, "Alice Smith": edited }, "canvas")`.
- Assert `loadGradingResultsEdits(urlB, run, "canvas")["Alice Smith"].strengths`
  equals the seeded value (not A's), and `loadGradingResultsEdits(urlA, run,
  "canvas")["Alice Smith"].strengths` equals A's. (This is essentially the
  existing `:470-479` test; if the checker prefers, cite that one as already
  discharging the precondition and add only the wiring test in 4.1 - do not
  duplicate an identical assertion. The load-bearing new code is 4.1.)

### 4.3 The sabotage that proves 4.1 catches the live bug

Revert the fix to key off the live field: change `GradingResults.tsx:275` back
to `persistGradingResultsEdits(canvasUrl, edits, editsSurface)` and `:276` deps
to `[canvasUrl, edits, editsSurface]` (and/or delete the `editsKeyUrl` state).
Expected: assertion 1 of 4.1 reds (`PERSIST_LIVE` matches / `PERSIST_SNAPSHOT`
does not), assertion 2 reds (`canvasUrl` back in the dep array). Run:

```
npm run test:paths src/app/components/grading-results/gradingResultsHelpersWiring.test.ts src/app/components/grading-results/gradingResultsHelpersEditState.test.ts
```

The implementer must perform this sabotage, record "before: N passing; after:
reverting the persist arg to canvasUrl -> M passed / K failed naming assertions
1-2; restored -> N passing," and restore via a cp-backup, NOT `git checkout --`
(`MEMORY.md` "Sabotage restore needs a copy"). The pure-helper test in 4.2 is
expected to STAY GREEN under this sabotage - that is the point of 4.0, and the
implementer should note it explicitly as the control proving 4.2 alone is
insufficient.

---

## 5. Gate and verify commands

Two or more test files, so use the wrapper, never a raw multi-path `vitest`
(`this-repo.md:52-66`):

```
npm run test:paths src/app/components/grading-results/gradingResultsHelpersWiring.test.ts src/app/components/grading-results/gradingResultsHelpersEditState.test.ts src/app/components/grading-results/ungradedDisclosure.test.ts src/file-size-ceiling.structure.test.ts
```

Plus the unconditional gates: `npx tsc --noEmit` (exit 0, no output), `npm run
lint` (exit 0, no NEW warning in the two edited files vs the same command before
the change - do not pin an absolute count, `this-repo.md:26`).
`ungradedDisclosure.test.ts` is listed in the gate because it reads the edited
component as source (section 3.2) and must be proven still green, not assumed.

---

## 6. Residual register

Each entry names an owner, an instrument, and the step that will measure it
(`iteration-caps.md:36-37`). All must be filed in `docs/BACKLOG.md` at disposal
or they are deletions.

- **RES-FILL-11-R1 (posting targets the live field, out of scope - observed, not
  fixed).** `handlePostGrades`/`handlePostOne` post via
  `postCanvasGradesAction(canvasUrl, payload)` (`:414`, `:496`) using the LIVE
  `canvasUrl`, not `editsKeyUrl`. So after grading run A and typing URL B, a
  Post sends run A's grades to B's gradebook. This is a DISTINCT data-integrity
  concern from the persistence-key leak this scope fixes, and it is arguably
  correct-by-design (you post to whatever assignment is currently targeted) -
  but it is the same "live field diverges from the run" family and a user could
  hit it. Owner: repo owner (product decision - is posting-to-current-target
  intended, or should a post also be pinned to the producing URL?). Instrument:
  a UX/data pass, then if confirmed a defect, its own scope + source-text or
  pure-helper test. Step: filed as a BACKLOG row; NOT started here (deliberately
  not expanding this fix's write set into the post handlers). This scope does
  NOT change the post path.
- **RES-FILL-11-R2 (component behaviour under a real mount is unverifiable
  here).** The fix's runtime behaviour (that React does not commit
  `setEditsKeyUrl` within the reset render, that the persist effect does not
  re-fire on a `canvasUrl`-only change) is argued from React semantics and
  pinned by source-text, because no component is rendered by any test in this
  repo (`this-repo.md:134,262`). Owner: repo owner. Instrument: a manual browser
  check (grade a run, type a different URL, reload, confirm the second
  assignment's rows are seeded-not-leaked) - requires env vars this checkout
  lacks (`this-repo.md:249-251`). Step: owner-only verification, listed in the
  BACKLOG owner section; NOT an agent step.

## 7. What I could not determine

- Whether the owner INTENDS posting to follow the live field or the producing
  URL (RES-FILL-11-R1) - a product call, not derivable from the code.
- Real runtime behaviour of the React effect/commit ordering - no component
  renders here; the guarantee is argued and source-text-pinned (RES-FILL-11-R2).

No baseline was written (that is the Baseline seat's step); this scope records
that `GradingResults.tsx` persistence/reset behaviour should be baselined into
`docs/REGRESSION.md` before hand-off if `grep -a` shows the area is uncovered.
