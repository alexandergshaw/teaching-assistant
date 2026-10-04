# RG-PERSIST-RESULTS: AC and test notes (F3=YES, Option A, security contract M1-M4)

Seat: test-notes / oracle (`docs/loop/seats.md`, "Test seat"). Item:
RG-PERSIST-RESULTS (A7 wave W5). Owner decision: **F3 = YES, Option A**
(2026-10-04) - persist repo-grader graded results across reload to
`localStorage` under `ta-repo-grades-cells`, with the security contract.

Authored 2026-10-04. Measured against the WORKING TREE at this session's start
(an auto-commit process moves HEAD; `git status --short` showed the Wave A
sticky-header build in flight, which matters for the R-2 count below). Inputs
read in full: the data-seat doc `docs/repo-grader-w5-persist-data-seat.md`
(committed 14dfc505) and the security ruling
`docs/repo-grader-w5-persist-security.md` (committed 190ee452).

**Status: NOTES ONLY. No production or test code was written** (the caller
scoped this seat notes-only). Consequence for this seat's usual obligation to
prove the red tests satisfiable by a reference implementation: that proof moves
to the W5 implementer's TDD step and is called out as a hard handoff in
section 7. Every assertion below is labelled executable-here or argued in
section 6; nothing argued is asserted as verified.

Every quantity names its instrument. Instruments used this pass:
`wc -l`, `git show HEAD:<path>`, `grep -n`, and the Read tool (1-based line
numbers), each cited inline.

---

## 0. What the user gets, and what this is NOT (acceptance, owner's words)

The owner asked that graded results survive a reload. After F3=YES:

- A reload (or a tab switch and back) while signed in keeps every graded cell's
  score, the three feedback boxes, the composed comment, the rubric-area
  breakdown, the posted/skipped/error marker, and the graded-at date, **per
  course**. The instructor does not re-grade and does not re-type edits.
- It does NOT survive a **sign-out** or an **owner change**: the key is swept
  (security ruling 4.2 case b, M1 below). This is the privacy guarantee, not a
  gap - stated here so "survives reload" is not mis-sold as "survives sign-out".
- **Files and code-run output do not come back.** `submittedFiles` and
  `codeExecution` are never persisted (the heavy, sensitive fields). They
  return only by pressing Grade again (a model call). The restored-results
  banner says so.

No LEVERAGE CLAIM is authored here: this is persistence of existing graded
output, not a new user-reachable capability class, and the criteria seat
records that as the fired trigger. The removal-test obligation therefore does
not apply; the nearest "advantage removed" check is the double-post guard (the
`posted` marker surviving reload), pinned behaviourally by P3/P4, not framed as
a leverage removal test.

---

## 1. The persisted shape - the frozen oracle, stated as a CONSTRUCTION

### 1.1 The source type and the exhaustive partition (measured)

`RepoGradeCellEdit` has **15 members**
(`repoGradesCellEdits.ts:55-154`, read): `score, comment, strengths,
improvements, resubmitNotice, grading, gradeError, postStatus, postMessage,
rubricAreas, generatedScore, generatedComment, submittedFiles,
submissionTruncated, codeExecution`.

`RepoGradePostStatus` is the **5-member** union
`"idle" | "posting" | "posted" | "error" | "skipped"`
(`repoGradesRows.ts:77`, read).

Partition for persistence (15 = 11 kept + 4 dropped), matching the data seat
and the security seat:

- **KEEP (11):** score, comment, strengths, improvements, resubmitNotice,
  postStatus, postMessage, rubricAreas, generatedScore, generatedComment,
  submissionTruncated.
- **ADD (1):** `at` (ISO timestamp, caller-supplied so the mapper stays pure;
  eviction key and the banner date).
- **DROP (4):** grading, gradeError, submittedFiles, codeExecution.

So the persisted cell is **12 fields**. rubricAreas/generatedScore/
generatedComment are kept because they are posting-guard inputs, not decoration
(`repoGradesPosting.ts:296-300, 347-352, 370-376` per data seat 1.2); dropping
or emptying them silently changes what posts. They must round-trip exactly
(P3 below). `comment` and `generatedComment` are stored twice on purpose
(the A13 edited-vs-generated comparison); that duplication must NOT be
"optimised" away.

### 1.2 The frozen oracle (FR-1), a construction not a guess

The persisted cell's key set is built by enumerating the 12 fields on write.
The oracle is the sorted literal:

```
FROZEN_PERSISTED_CELL_KEYS = [
  "at", "comment", "generatedComment", "generatedScore", "improvements",
  "postMessage", "postStatus", "resubmitNotice", "rubricAreas", "score",
  "strengths", "submissionTruncated"
]   // 12, sorted
```

This is constructible from the tree TODAY: it is exactly KEEP(11)+`at`, and the
partition above is exhaustive over the 15-member source type (verified by
reading the type). A checker can reconstruct it from `repoGradesCellEdits.ts`.

### 1.3 The "posting" -> "error" rule (frozen copy literal)

`"posting"` is not a member of the persisted `postStatus` union, so an in-flight
post is **unrepresentable** in storage (construction, not sanitised-on-read).
When `toPersisted` is handed an edit whose live `postStatus` is `"posting"`, it
MUST emit:

- `postStatus: "error"`
- `postMessage:` the frozen string
  **`"A reload interrupted this post. Check the Canvas gradebook before re-posting."`**

This is one of the two places the spelling IS the fact (a frozen copy literal),
so the test pins the exact string. It must NOT map to `"idle"` (would hide that
a post may have reached Canvas; posting is neither reversible nor idempotent,
`RepoGradesGrid.tsx:24-27`) and must NOT drop the cell.

---

## 2. The MANDATORY requirements - each names object, instrument, direction, sabotage

No component renders under vitest (`src/**/*.test.ts`, node-env). Every
instrument below is therefore a **node-env unit test** over a pure function, or
a **source-structure test** over file text. Where the only honest enforcer is a
render, the item is an **OWNER WALK** and is named as such - never asserted as
verified by a green suite.

Proposed leaf: `repoGradesResultsStore.ts` (pure: `toPersisted`, `parseStoredCells`,
`restoreRepoGradeCells`, `evictToBudget`, `persistRepoGradeCellsTo(storage,...)`,
`clearRepoGradeCellsIn(storage,...)`, `describeRestoredRepoGradeCells`). Key
literal and the `typeof window`-guarded wrappers live in `repoGradesUiState.ts`
(next to LOG_KEY), so the key canary sees the literal and S4 confines it; the
leaf imports the key CONSTANT, never re-spells the literal. The leaf takes a
`{getItem,setItem,removeItem}` storage seam so quota/eviction is node-testable
(drive the production path with an injected seam - `seats.md` test practice 3).

### FR-1 (data P1): enumerated write, exact 12-key set

- **Object:** `Object.keys(toPersisted(edit, at)).sort()` for a fully populated
  `RepoGradeCellEdit`.
- **Instrument:** `toEqual(FROZEN_PERSISTED_CELL_KEYS)` (node-env).
- **Fails when:** the set gains a member (a dropped field leaked) OR loses a
  member (a guard input dropped) - both directions.
- **Sabotage (MUST be shown RED):** replace the enumerated body with
  `{ ...edit, at }`. Keys become 16 (adds grading, gradeError, submittedFiles,
  codeExecution) -> `toEqual` RED. Restore to enumerated -> GREEN. **Discriminates.**

### FR-2 (data P2 + security M2): forbidden fields never serialized

- **Object:** `JSON.stringify(toPersisted(edit, at))` for an edit carrying
  **unique sentinel markers** planted in every dropped/sensitive field:
  `gradeError = "ZZMK_GRADEERR"`, `submittedFiles = [{ name, extension,
  previewContent: "ZZMK_PREVIEW", previewTruncated, mimeType }]`,
  `codeExecution = { ..., stdout: "ZZMK_STDOUT", stderr: "ZZMK_STDERR",
  compileOutput: "ZZMK_COMPILE" }`.
- **Instrument:** assert the serialized text contains none of the sentinels
  (`expect(json).not.toContain("ZZMK_...")` for each), AND the parsed object's
  keys equal the frozen 12 (so the property names gradeError / submittedFiles /
  codeExecution / grading are absent). The forbidden-key check is on the
  ENUMERATED key set, not an arbitrary substring over common words
  ("grading" can legitimately appear inside `comment` prose - do NOT substring
  for it).
- **Also:** the visible `persistError` string embeds NO cell content - a fixed
  string, pinned (FR-7 below).
- **Fails when:** any sentinel appears in the serialized blob, or a forbidden
  property name is present.
- **Sabotage (MUST be shown RED):** the `{ ...edit, at }` spread mutant -
  `ZZMK_STDOUT`/`ZZMK_PREVIEW` land in the blob -> RED. **Discriminates.**

### FR-3 (data P4): "posting" narrows to "error", and only "posting"

- **Object:** `toPersisted(edit, at).postStatus` and `.postMessage` for an edit
  with `postStatus: "posting"`; and separately for each of
  `"idle"/"posted"/"error"/"skipped"`.
- **Instrument:** for `"posting"` input, assert `postStatus === "error"` AND
  `postMessage ===` the frozen string (1.3). For each non-posting input, assert
  `postStatus` is unchanged and (for non-"error") `postMessage` is passed
  through, not overwritten (node-env).
- **Fails when:** a `"posting"` input yields `"posting"`, `"idle"`, a dropped
  cell, or a wrong message; OR a non-posting input is rewritten to `"error"`.
- **Sabotage (two mutants, both MUST be shown RED):**
  (a) `postStatus: edit.postStatus as PersistedStatus` (cast passes "posting"
  through) -> the `"posting"` case asserts `"error"` -> RED; the non-posting
  cases stay GREEN. (b) map `"posting"` -> `"idle"` -> RED on the message and
  status. **Both discriminate** (and the non-posting cases prove the conversion
  does not over-fire - RED in both directions check).

### FR-4 (data P3): the posting guard round-trips - DRIVE THE PRODUCTION PATH

- **Object:** the output of the real `buildRepoGradePostPlan` on a candidate row
  built from `edit`, versus from `restoreRepoGradeCells` applied to
  `parseStoredCells(JSON.stringify(blob-containing-toPersisted(edit)))`.
- **Instrument:** call the real `buildRepoGradePostPlan` /
  `checkRowPostability` (pure, node-env - confirm the exact signature at build;
  data seat cites `repoGradesPosting.ts:255-335, 347-376`) on both, and assert
  the two plans agree on `postable`, `skipped`, and whether the rubric breakdown
  is included. Driving the real planner, not re-implementing it, is what makes
  this faithful (practice 3); do NOT assert a hand-copied plan literal.
- **Fails when:** the plans differ - i.e. a guard input (rubricAreas,
  generatedScore, generatedComment) did not round-trip exactly.
- **Sabotage (MUST be shown RED):** a mutant that persists `generatedScore: null`
  (or empties `rubricAreas`). On restore, `repoGradeScoreWasEdited(current, null)`
  becomes true, the breakdown is suppressed, the plans diverge -> RED.
  **Discriminates.** Note (honest): this exercises the guard INPUTS round-trip;
  the actual Canvas post is never called (network-blocked), so it proves the
  payload would be identical, not that Canvas received it.

### FR-5 (data P5 + F4): tolerant typed parse, drop bad CELL keep siblings, null-prototype

- **Object:** `parseStoredCells(raw)` for (a) a blob with one malformed cell
  among valid ones, (b) a non-JSON string, (c) a blob whose containers use a
  folder named `constructor` and one named `__proto__`.
- **Instrument (node-env):**
  (a) assert the valid siblings survive and only the bad cell is absent;
  (b) assert it returns an empty container, never throws;
  (c) after `restoreRepoGradeCells(parseStoredCells(...))`, assert
  `getRepoGradeCellEdit(restored, repo, "constructor")` deep-equals
  `defaultRepoGradeCellEdit()` (NOT `Object`/a function).
- **Construction (makes the bad state unrepresentable):** the parser builds every
  container with `Object.create(null)` (or a `Map`) and copies fields by hand
  with `typeof` checks - the `mapRecordingFile` / "typed rows collapse to never"
  lesson applied to `JSON.parse`'s `unknown`. No raw cast, no spread.
- **Fails when:** it throws on malformed input, drops a VALID sibling, returns a
  partial cell, or an inherited prototype member resolves as a cell.
- **Sabotage (two mutants, both MUST be shown RED):** (a) build the container
  with `{}` instead of `Object.create(null)` -> the `constructor`/`__proto__`
  case returns `Object`/a function as a cell -> RED. (b) `return JSON.parse(raw)`
  with no per-cell validation -> the malformed-sibling case restores a partial
  cell (or throws on non-JSON) -> RED. **Both discriminate.** Note: W5 must not
  WIDEN the pre-existing `getRepoGradeCellEdit` prototype hazard the data seat
  flagged (F4) - this test pins that the restored container does not.

### FR-6 (data P6 + eviction): byte budget, oldest-first, quota retry, no content in error

- **Object:** `persistRepoGradeCellsTo(storage, courseId, slice, now)` against a
  **fake storage**, and `evictToBudget(blob)` directly.
- **Instruments (node-env), four separate pins:**
  1. **Over budget evicts oldest-`at` first.** Build a course slice whose
     serialized length exceeds the budget, with cells of distinct, known `at`.
     Assert the SURVIVORS are the newest and the DROPPED are the oldest.
  2. **Under budget preserves all.** A slice under budget: every cell survives,
     nothing evicted. (Pins 1 and 2 together bound `RESULTS_MAX_CHARS`
     behaviourally - a mutant setting it to `0` fails pin 2, a mutant setting it
     to `Infinity` fails pin 1 - WITHOUT the test reading the constant's value,
     avoiding the "assertion reads the value the impl reads" trap.)
  3. **QuotaExceededError -> evict 25% -> retry once -> success.** A fake
     `setItem` that throws a `QuotaExceededError` on the first (full) write and
     accepts the second (reduced) write. Assert the retried write landed and NO
     `persistError` was raised.
  4. **Second failure -> visible persistError embedding NO cell content.** A
     fake `setItem` that always throws. Assert a `persistError` IS raised, it is
     the FIXED string (FR-7), it contains none of the FR-2 sentinels, and the
     call does not throw into the caller.
- **Fails when:** eviction drops the newest; under-budget data is evicted; a
  single throw gives up without the evict-and-retry; success is reported while
  nothing was stored; or the error text embeds a cell field.
- **Sabotage (three mutants, each MUST be shown RED, each flagged whether it
  discriminates):**
  (a) sort eviction **descending** (`b.at.localeCompare(a.at)`) -> pin 1 RED
  (survivors are oldest). **Discriminates.**
  (b) build `persistError` as `` `Could not save ${cell.comment}` `` ->
  pin 4's sentinel check RED. **Discriminates.**
  (c) remove the retry (`catch { setPersistError(...) }` with no evict+retry) ->
  pin 3 RED (success never happens though the reduced write would fit).
  **Discriminates.**

### FR-7: the persistError string is fixed and content-free

- **Object:** the exported `persistError` message (a pure constant or pure
  builder in the leaf, like `describeRestoredGithubGradingRun`).
- **Instrument:** node-env assertion of the exact string; and FR-6 pin 4 asserts
  it embeds no sentinel.
- **Fails when:** the message interpolates any cell field.
- **This is the second frozen copy literal** (spelling is the fact). Proposed:
  `"Saved grading results could not be stored (browser storage is full). Your
  work is still here for this session but may not survive a reload."` -
  wording is the implementer's to set, but it MUST be a fixed literal pinned by
  this test and contain no cell content.

---

## 3. The security contract M1-M4 - each an instrument

### M1 - THE PRIVACY GUARANTEE, and the pin most likely to be built loose

**Requirement:** `ta-repo-grades-cells` stays on the sweep ERASE path, pinned by
a **direct erase-list membership assertion**, because the existing keep-list
smell test CANNOT catch a mis-keep of this key.

- **Object:** `shouldKeepLocalStorageKey("ta-repo-grades-cells")`.
- **Instrument:** add `"ta-repo-grades-cells"` to the erase-list array in
  `src/lib/client-state-sweep.test.ts:43-56` (the `it("erases prefixed keys...")`
  block), whose loop asserts `shouldKeepLocalStorageKey(key) === false` per
  entry. Gate: `npm run test:paths src/lib/client-state-sweep.test.ts`.
- **Fails when:** the call returns `true` - which happens if the key is added to
  `DEVICE_PREFERENCE_KEYS` (`client-state-sweep.ts:45`) or the matcher becomes
  prefix/substring-based.
- **Sabotage (MUST be shown RED):** add `"ta-repo-grades-cells"` to
  `DEVICE_PREFERENCE_KEYS`. The erase-list assertion for that key goes RED.
  Restore -> GREEN. **Discriminates cleanly (RED only under the mis-keep).**

**WHY THIS IS THE LOOSE ONE (flagged, with the measurement):** the keep-list
smell test at `client-state-sweep.test.ts:117-125` bans keep-list entries whose
lowercased name contains any of `instructor, course, grading, workflow,
institution, prompt`. **None of those six is a substring of
`"ta-repo-grades-cells"`** - critically `"grades"` is not `"grading"`. I
confirmed this against the file (read); it reproduces the security seat's
`node -e` result (all six `includes` are `false`,
`repo-grader-w5-persist-security.md:211-214`). So if the implementer "makes the
key survive" by adding it to `DEVICE_PREFERENCE_KEYS`, the size cap (`<= 6`,
currently 1) still passes AND the smell test still passes - the ONLY instrument
that catches it is the direct erase-list membership assertion. A build that adds
the key to the erase-list array (correct) but reasons "the smell test covers
it" has the guarantee resting on a test that is blind to this exact key. The
bad state to make unrepresentable is "key kept"; the construction is the direct
`=== false` pin. **Do not** lengthen the smell-word denylist to "fix" this (a
denylist standing in for an unbounded set is the forbidden move,
`iteration-caps`); the membership assertion is the walled instrument.

### M2 - enumerated write + forbidden set

Discharged by **FR-1 + FR-2** above. Security M2 adds the sensitive property
names to FR-1's key-set check (gradeError, submittedFiles, codeExecution are
absent because the key set is exactly the frozen 12) and the sentinel check to
FR-2. The names `student/userId/canvasUserId/gradedRepo/gradedRef/rubricText`
are not on `RepoGradeCellEdit`, so they cannot be written from a valid edit; the
realistic write-side leak is the spread, caught by FR-1/FR-2. Owner-walk note:
`postMessage` may carry an unenumerated `result.error` from the post action
(security R-S7) - the implementer must either enumerate those strings or persist
a fixed skip/error string; routed as a residual, not blocked here.

### M3 - user-reachable Discard, with confirm (MUST per security)

**Requirement:** a "Discard saved results for this course" control with a
`window.confirm`, modelled on the log's Clear.

Precedent (read): `RepoGradesLogPanel.tsx:127-137` `handleClear` -
`window.confirm(` ...count... `)` then `onClear()` + `onAnnounce(...)`; wired at
`index.tsx:955-959` (`onClear={() => setLog([])}`).

- **Object (testable half):** `clearRepoGradeCellsIn(storage, courseId)` - the
  pure clear.
- **Instrument (node-env):** against a fake storage holding two courses, assert
  after clear that `courseId`'s slice is absent AND the OTHER course's cells are
  untouched. Plus a **source-structure pin** (in the structure test, using
  `withoutLineComments` - see section 5) that index.tsx (or the panel) passes a
  discard handler to a control and that the handler source contains a
  `window.confirm(` call and calls the clear function.
- **Fails when:** the course slice remains, another course loses its cells, or
  no non-test source wires a confirm + clear to a control.
- **Sabotage (node-env, MUST be shown RED):** (a) clear ALL courses (write `{}`)
  -> the other-course-untouched assertion RED; (b) clear nothing (no-op) -> the
  slice-absent assertion RED. **Both discriminate.**
- **OWNER WALK (named, not asserted):** that the control actually renders, is
  reachable, and the confirm dialog appears and the state empties on click - no
  component renders under vitest. Residual RES-W5T-1.

### M4 - erase stays the mechanism; no second copy, no bypass

- **Instrument 1 (key canary, executable):** bump `FROZEN_KEYS` 18 -> 19 and the
  K1 title in `repoGradesStorageKeys.structure.test.ts:19-42` **in the same
  commit** that adds `"ta-repo-grades-cells"` to `repoGradesUiState.ts`. The
  canary derives keys with `/"(ta-[a-z0-9-]*)"/g` over `repoGradesUiState.ts`
  only, so the key MUST be a quoted literal in that file (not a template literal,
  not another file) or it is invisible. Gate:
  `npm run test:paths src/app/components/repo-grades/repoGradesStorageKeys.structure.test.ts`.
  - **Direction / sabotage:** a new key without the bump -> K1 RED (19 != frozen
    18); a bump without declaring the key -> K1 RED (18 != 19). The existing
    canary already discriminates in both directions; W5 just lands both halves
    together.
- **Instrument 2 (S4 confine, executable):** `grep` over `src` excluding
  `*.test.ts` for the literal `ta-repo-grades-cells` - exactly ONE non-test file
  matches (`repoGradesUiState.ts`). The leaf references the key CONSTANT, not the
  literal. Fails when any other non-test file spells the literal (a new read/
  export/diagnostic path). State the FACT (one home), not a spelling test over
  the leaf.
- **ARGUED (not a behavioural test):** "no write path bypasses `setCacheOwner`"
  and "no cells duplicated into a second key/IndexedDB/cookie". The sweep is
  driven by `SupabaseProvider` which does not run under vitest; the honest
  enforcers are instrument 1 (a second `ta-` key in `repoGradesUiState.ts`
  reddens the canary), instrument 2 (a second key elsewhere is caught by the
  confine grep IF it reuses the literal - a template-literal second key is NOT
  caught, which is exactly why the canary's single-file scan requires the
  literal to live where it can see it), and a verifier reading that the leaf's
  only `setItem`/`removeItem` targets are the one key. Residual RES-W5T-2.

---

## 4. Restore wiring and the Discard control - source pins + owner walks

Nothing here is proven by a green suite; these are READING/source claims, said
so plainly.

- **Restore plugs into the course-change branch** at `index.tsx:553-574` (read;
  the branch resets `cellEdits` at `:555` and restores the log at `:557`).
  Change `:555` from `setCellEdits(EMPTY_REPO_GRADE_CELL_EDITS)` to
  `setCellEdits(restoreRepoGradeCells(loadRepoGradeCells(uiState.courseId)))`.
  **Source pin (structure test, `withoutLineComments`):** the branch keyed on
  `uiState.courseId !== cellStateResetForCourse` calls the load/restore function
  with `uiState.courseId`.
- **Persist from an effect**, mirroring the log effect at `index.tsx:593-596`
  (read), guarded by `cellStateResetForCourse === uiState.courseId` (the
  first-commit hazard closure - without it an effect fires with the empty
  default and overwrites stored data before restore ran). **Source pin:**
  index.tsx calls `persistRepoGradeCells(uiState.courseId, ...)` inside an effect
  that returns early unless `cellStateResetForCourse === uiState.courseId`.
- **Filter on read, never delete on read.** Restore loads the WHOLE course
  slice; the grid shows only cells matching current scan rows (the row model
  only emits scan rows, so a cell for a repo not in the scan is simply never
  looked up); the stored blob is never rewritten to drop unmatched cells. At
  restore time `model` is null (scan not settled), so no roster filtering is even
  possible there. **Testable piece:** `restoreRepoGradeCells(parseStoredCells(x))`
  returns every stored cell unchanged and performs NO write/remove during load
  (a load reads only). **Sabotage:** a mutant that removes unmatched cells from
  storage on load -> the "load writes nothing" assertion RED.
- **Delete the stale comment** at `index.tsx:178-192` ("never persisted to
  localStorage ...") in the W5 diff - it is the justification F3 reverses. Not a
  test, a diff requirement the verifier confirms.
- **OWNER WALK (named):** that a reload actually re-shows the graded cells, that
  the banner shows, and that Discard empties the grid. Residual RES-W5T-1.

- **Restored-results banner** (data seat 2.5, security S3): a pure builder in the
  leaf (`describeRestoredRepoGradeCells`), wording pinned by a node-env test like
  `describeRestoredGithubGradingRun` (`github-grading-run-store.ts:418`, read).
  This is the THIRD frozen-copy-literal site. Shown only when at least one
  restored cell matches a displayed row (reachability is an owner walk). Classed
  SHOULD (S3) - if omitted, residual, not a defect.

---

## 5. The comment-strip helper - a hard gate hazard for the structure test

The structure test (restore wiring, M3 wiring, filter-on-read) reads source and
must strip comments so a comment mentioning a banned token does not trip a "must
not contain" check.

- **Use `withoutLineComments`, NEVER `stripComments`, and never mention that
  literal in the new test file.** `src/tools/strip-comments-agreement.structure.test.ts`
  enumerates every `*.test.ts` that MENTIONS `stripComments` and reddens the
  gate repo-wide until the file is classified (verified: its classified list at
  `:379-380` already names `repoGrades.wiring.test.ts` and
  `repoGradesFeedbackAndFiles.wiring.test.ts`). A new W5 test spelling
  `stripComments` would redden the whole gate.
- **Duplicate the helper; do NOT import it from another `*.test.ts`** (importing
  re-runs that file's describe blocks). Copy the CRLF-safe, unanchored form
  already used by the in-flight Wave A sticky test
  (`repoGradesWaveASticky.structure.test.ts:18-24`, read):

  ```
  function withoutLineComments(src: string): string {
    return src
      .replace(/\/\*[\s\S]*?\*\//g, "")
      .split(/\r?\n/)
      .map((l) => l.replace(/\/\/.*$/, ""))
      .join("\n");
  }
  ```

  The `/\/\/.*$/` is UNANCHORED (catches trailing comments); the anchored
  `/^[ \t]*\/\/.*$/gm` form is trailing-comment-blind and has a defeat on record.
- No `/s` (dotAll) flag anywhere (passes vitest, fails tsc TS1501). The block
  form above uses `[\s\S]`, which is correct.

---

## 6. Executable here vs argued (never blur these)

**Executable under vitest (node-env), this checkout:**
FR-1, FR-2, FR-3, FR-4 (drives the real planner), FR-5, FR-6 (all four pins via
injected fake storage), FR-7, M1 (erase-list assertion), M2 (= FR-1/FR-2), M3
pure-clear half, M4 instrument 1 (key canary) and instrument 2 (confine grep),
the restored-results banner wording, and the restore/persist/discard SOURCE pins
(structure test over file text).

**Argued or OWNER WALK only (labelled, not asserted as verified):**
- That a reload re-shows cells, the banner renders, Discard empties the grid, the
  confirm dialog appears - no component renders (RES-W5T-1).
- That nothing bypasses `setCacheOwner` and no second copy exists via a
  template-literal key or IndexedDB - partly argued (RES-W5T-2); the canary only
  catches a literal key in `repoGradesUiState.ts`.
- That the persisted blob is actually swept on a real sign-out / expiry - a
  reading of the sweep code and auth-js (security 4.2); owner walk R-S3/R-S4.
- FR-4 proves the post PAYLOAD is identical across a round-trip, not that Canvas
  received it (network-blocked).
- **Satisfiability of the red tests is NOT proven by this seat** (notes-only
  scope). The W5 implementer MUST get a reference implementation green against
  these notes before claiming them satisfiable, and report any assertion no
  implementation can satisfy (practice 1). This is the one obligation this seat
  could not discharge; it is handed over explicitly, not silently dropped.

---

## 7. Canary / gate obligations (same commit as the feature)

- **Storage-key canary 18 -> 19:** `repoGradesStorageKeys.structure.test.ts`
  FROZEN_KEYS and the K1 title, same commit (M4). Key literal in
  `repoGradesUiState.ts` or the canary never sees it.
- **R-2 frozen roots +1 PER NEW LEAF, measured at build - NOT a hardcoded
  number.** `git show HEAD:...repoGradesFeedbackAndFiles.wiring.test.ts` counts
  **35** frozen basenames at HEAD (committed; StickyHeader not yet in). The
  WORKING TREE already shows **36** (`RepoGradesStickyHeader.tsx` added by the
  in-flight Wave A sticky build, `git status --short` M on the wiring test, new
  `??` RepoGradesStickyHeader.tsx). So the data seat's "35 -> 36" was right
  against HEAD, but if Wave A lands first, W5's new `repoGradesResultsStore.ts`
  bumps **36 -> 37**, and the `it(... names exactly the N frozen basenames ...)`
  title must track N. **Measure the current frozen count at build and add exactly
  +1 per new non-test `.ts/.tsx` leaf, same commit.** The W1 wave left main red
  by missing exactly this bump (data seat 2.4; `docs/BACKLOG.md` A7 "W1-GATE
  MISS").
- **1000-line ceiling:** `index.tsx` is **965** lines now (`wc -l`; was 960 in
  the data seat - the tree moved), 35 of headroom. The restore line, the persist
  effect (~4 lines), the discard handler (~6 lines) minus the deleted
  `:178-192` comment net well under 35, but index.tsx is shared with Wave A /
  RG-NAME-COLUMNS / A7 (the BUILD serializes disjoint in time). **Re-measure
  `@(Get-Content src/app/components/repo-grades/index.tsx).Count` at build; keep
  under 1000.** Prefer landing the restore as a thin call into the leaf.
- **CSS orphan:** if the Discard control adds any CSS, the css-orphan gate
  applies; prefer reusing `pageStyles.linkButton` (the log's Clear button class,
  `RepoGradesLogPanel.tsx:159`) so no new class is added.
- **No emojis; LF line endings; no `/s` regex flag; no `stripComments` mention
  in any new test** (section 5).

**Gate command (two-or-more paths -> `test:paths`, never raw multi-path vitest -
the union filter silently drops unmatched args):**

```
npm run test:paths src/app/components/repo-grades/repoGradesResultsStore.test.ts src/app/components/repo-grades/repoGradesResultsPersist.structure.test.ts src/lib/client-state-sweep.test.ts src/app/components/repo-grades/repoGradesStorageKeys.structure.test.ts src/app/components/repo-grades/repoGradesFeedbackAndFiles.wiring.test.ts
```

(The structure-test and leaf-test filenames are proposals; whatever the
implementer names them, each path must be credited at least one executed passing
file in the wrapper's per-argument `COVERED` line.)

---

## 8. Forks and the one flagged pin

- **FLAGGED LOOSE PIN: M1** (section 3) - the erase-list/smell-test guard. A
  keep-listed key silently defeats the privacy sweep, and the smell test is
  blind to this exact key name. The construction (direct `=== false` membership
  assertion) is required; do not substitute a lengthened smell-word denylist.
- **FORK (architect, not this seat): S1 owner stamp.** The security ruling S1
  proposes an `{o: ownerMarker, c: ...}` envelope captured at hydration, which
  moves restore OUT of the render-phase branch and touches the first-commit
  hazard guard (security S1 trap 2). It is SHOULD, and the architect decides
  whether to adopt it. If adopted, the outer persisted type gains the envelope
  and the restore placement changes - the FR-5 parse oracle then also pins
  "wrong owner marker -> empty, same owner -> restored, owner null -> no write".
  Recommended reading (acted on nowhere - this is a note): **omit S1 for v1**,
  land at exact parity with the log and results-edits (neither stamps), record
  as residual R-S2. Either architect answer terminates: adopt (add the envelope
  oracle) or omit (residual). No code started; this is the test seat flagging
  the fork for the architect per the two-rounds rule.
- **No other fork.** The byte budget constant value, the 25% eviction step, the
  banner wording, and v1-vs-v1.1 (`codeRunSummary`, `postedAssignmentId`) are
  implementer defaults inside the owner's F3=YES decision, pinned behaviourally
  (FR-6) not by value.

---

## 9. Residual register (owner, instrument, step)

| Id | Not proven here | Owner | Instrument | Step that measures it |
|---|---|---|---|---|
| RES-W5T-1 | Reload re-shows cells, banner renders, Discard empties grid + confirm dialog (no component renders under vitest) | owner | OWNER WALK in the running app after one real grade | W5 verify / owner walk |
| RES-W5T-2 | No `setCacheOwner` bypass; no second copy via template-literal key or IndexedDB (canary only sees a literal key in repoGradesUiState.ts) | W5 implementer + verifier | source read of the leaf's only setItem/removeItem targets + M4 instruments 1-2 | W5 build + verify |
| RES-W5T-3 | Red tests proven satisfiable by a reference implementation (this seat was notes-only) | W5 implementer | reference impl green against these notes before the real code | W5 build, before claiming satisfiable |
| RES-W5T-4 | `buildRepoGradePostPlan`/`checkRowPostability` exact node-env signature (cited, not re-opened this pass) | W5 implementer | open `repoGradesPosting.ts:255-376` and confirm pure + importable | W5 build, FR-4 |
| RES-W5T-5 | `postMessage` may carry an unenumerated `result.error` (security R-S7) | W5 implementer | enumerate `postCanvasGradesAction` error returns, or persist a fixed string | W5 build |
| R-S2 (from security) | No owner stamp (S1 omitted) - parity with log/results-edits | architect (W5) / orchestrator (older stores) | S1's parse-with-marker test if adopted | W5 architect pass |

Every residual names all three (owner, instrument, step); none is a deletion.

---

## 10. Commands that produced this document's measured facts

- `wc -l src/app/components/repo-grades/index.tsx` -> **965**.
- Read: `repoGradesCellEdits.ts:55-154` (15 members), `repoGradesRows.ts:77`
  (5-member `RepoGradePostStatus`), `client-state-sweep.ts:45,146-154`,
  `client-state-sweep.test.ts:42-56,111-125`,
  `repoGradesStorageKeys.structure.test.ts:13-42` (FROZEN_KEYS = 18),
  `repoGradesUiState.ts` (whole; key literals; LOG_KEY idiom),
  `github-grading-run-store.ts` (whole; parse/persist/banner idiom),
  `RepoGradesLogPanel.tsx:114-159` (Clear precedent),
  `index.tsx:160-239,540-609,955-959`,
  `repoGradesWaveASticky.structure.test.ts:18-40` (withoutLineComments form).
- `git show HEAD:...repoGradesFeedbackAndFiles.wiring.test.ts` -> **35** frozen
  R-2 basenames committed; working tree (Wave A in flight) shows **36**.
- `grep -n` over `src/tools/strip-comments-agreement.structure.test.ts` -> the
  classified list at `:379-380` already names the two repo-grades wiring tests.
- Smell-word check (read, reproduces security `node -e`): none of
  `instructor/course/grading/workflow/institution/prompt` is a substring of
  `ta-repo-grades-cells`.
