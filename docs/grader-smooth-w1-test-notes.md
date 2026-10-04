# GRADING-CHAT grader smoothing - W1 (pure leaves) TEST NOTES + ORACLES

Status: test notes, authored by `loop-test-author` (Opus). To be checked by a
fresh `loop-checker` before any implementer reads them. These notes decide WHAT
is measured and HOW it fails for W1; the implementer writes the test CODE from
them.

Source scope: `docs/grader-smooth-scope.md` (recon-sound, checked REVISE).
Rulings folded in and treated as settled here: **B1** (silent-green fix - new
grading-chat key canary), **B2** (leverage honesty - R1 is click-cost, not
integration), **I1** (fill-precedence design). Where a ruling and the raw scope
text disagree, the ruling wins and the note says so.

W1 ships three NEW pure leaves under `src/app/components/grading-chat/` plus one
NEW directory key canary. Per the scope's leaves-with-their-caller rule, the W1
leaf files land in the SAME commit as their W2 callers (an exported leaf with no
caller trips the wave gate). So "W1" below means "the leaf modules and their
tests"; they are committed with W2.

## 0. What is executable here vs only argued

EXECUTABLE under vitest (node env, `src/**/*.test.ts`, network-blocked):
- `resolveSetupFill` leaf - pure, frozen table (section 2).
- `submitFilesSequentially` leaf - pure+async with a mocked `submit`, no real
  fetch (section 3).
- `chatSetupMemory` leaf - pure scope derivation + localStorage wrappers over an
  in-memory `FakeStorage` (section 4).
- The B1 directory key canary - a source-text `fs` scan (section 5).

ARGUED ONLY (carried to W2, or owner-verified; NEVER asserted as verified here):
- The W2 wiring facts in section 6 (await-ordering, stale-closure fix, legacy
  read-ONCE lifecycle, error placement). No component renders under vitest, so
  these are source-order claims (W2) or owner browser-walk claims.
- The actual click/scroll/cursor savings (AC-C*, AC-S*). RULING B2: R1's
  advantage is CLICK-COST, which no vitest test can measure here. Residual R-1.

## 1. Measurement ledger (every quantity names its command)

- grading-chat `ta-` key population TODAY = 3, over 4 non-test files. Command
  (run from repo root, 2026-10-04, HEAD at session start):
  ```
  node -e 'const fs=require("fs"),path=require("path");const dir="src/app/components/grading-chat";
  const files=fs.readdirSync(dir).filter(f=>/\.(ts|tsx)$/.test(f)&&!f.endsWith(".test.ts")&&fs.statSync(path.join(dir,f)).isFile());
  const combined=files.map(f=>fs.readFileSync(path.join(dir,f),"utf8")).join("\n");
  const re=/(?<![a-zA-Z0-9_])ta-[a-z0-9-]*[a-z0-9]/g;const found=new Set();let m;
  while((m=re.exec(combined)))found.add(m[0]);console.log(files.length,JSON.stringify([...found].sort()));'
  ```
  Output: `4 ["ta-grading-chat-input-mode","ta-grading-chat-instructions","ta-grading-chat-rubric"]`
- `componentStorageKeys.structure.test.ts` scans `src/app/components/`
  NON-RECURSIVELY (`fs.readdirSync` + `statSync(...).isFile()`,
  `:103-108`). `grading-chat/` is a subdirectory, so that canary does NOT see
  grading-chat keys and the new key does NOT belong in its `EXPECTED_TA_KEYS`.
  Opened and confirmed `:101-116`, `:234-235`. This is RULING B1's basis.
- The shared cross-surface key `ta-grading-rubric-memory` IS in that top-level
  canary's frozen list (`:158`) - it is written by GradingTab-class surfaces,
  not by grading-chat. The chat's new key must be a DISTINCT key (a39
  architecture 6.2/6.3, "one key per calling surface"): see section 4.
- Satisfiability + discrimination: reference implementations of all three leaves
  and the canary were built and run GREEN (4/4) under plain node, and every
  sabotage in sections 2-5 was run against a mutant and observed RED, except the
  one explicitly labelled NO-KILL. Harness:
  `<scratchpad>/ref/check.js`, `<scratchpad>/ref/sabotage.js` (throwaway, not
  committed). See each section for the per-sabotage result.

## 2. Leaf: `resolveSetupFill({ typed, canvasMeta, storedMemory })`

New file: `src/app/components/grading-chat/chatSetupFill.ts` (+ `chatSetupFill.test.ts`).

OBJECT under test: the setup-field fill decision (RULING I1 precedence).
INSTRUMENT: a pure-function frozen-table test; each row is a hand-frozen literal
expected value, independent of the implementation.
DIRECTION of failure (worst first): a NON-BLANK typed field is REPLACED by a
fetched/stored value (AC-R1 worst case); then a wrong tier wins; then per-field
independence lost.

### 2.1 Contract (the leaf's shape; exact types are the architect's to finalise)

```
type FillSource = "typed" | "canvas" | "memory" | "blank";
interface ResolveSetupFillInput {
  typed:        { instructions: string; rubric: string };         // current field text
  canvasMeta:   { instructions: string; rubric: string } | null;  // from a Canvas-URL submit, else null
  storedMemory: { instructions: string; rubric: string } | null;  // resolved persisted fallback, else null
}
interface ResolveSetupFillResult {
  instructions: string; rubric: string;
  instructionsSource: FillSource; rubricSource: FillSource;
}
```

PRECEDENCE, applied PER FIELD independently (I1):
1. typed field non-blank (`.trim().length > 0`) -> ALWAYS wins, never overwritten.
2. else canvasMeta value non-blank -> canvas.
3. else storedMemory value non-blank -> memory.
4. else -> blank (`""`).

**I1 boundary, stated so the checker can hold the line.** I1 names a FOURTH
tier - the legacy global keys read ONCE as last fallback, never rewritten. That
tier is NOT a `resolveSetupFill` input: I1 scopes the leaf to exactly
`{typed, canvasMeta, storedMemory}`, and the scoped-memory-OR-legacy resolution
plus the read-once/never-rewrite behaviour live UPSTREAM (the panel resolves
which persisted value to pass as `storedMemory`; the never-rewrite half is
measured in leaf 4 section 4.4 and the read-ONCE lifecycle is a W2 wiring fact,
section 6). So this leaf arbitrates three tiers, not four. Do not add a `legacy`
param to this leaf to "complete" the precedence - that would duplicate leaf 4
and the W2 wiring and give two instruments for one fact.

"Non-blank" = trimmed non-empty. A whitespace-only typed field counts as blank
(so Canvas/memory can fill). This is a deliberate decision, pinned by case 6.

### 2.2 Frozen oracle table (the expected column is literal, not computed)

| # | typed (ins/rub) | canvasMeta (ins/rub) | storedMemory (ins/rub) | => instructions / rubric | sources |
|---|---|---|---|---|---|
| 1 | `T-INS` / `T-RUB` | `C-INS` / `C-RUB` | `M-INS` / `M-RUB` | `T-INS` / `T-RUB` | typed / typed |
| 2 | `` / `` | `C-INS` / `C-RUB` | `M-INS` / `M-RUB` | `C-INS` / `C-RUB` | canvas / canvas |
| 3 | `` / `` | null | `M-INS` / `M-RUB` | `M-INS` / `M-RUB` | memory / memory |
| 4 | `` / `` | `` / `` (present, empty) | `M-INS` / `M-RUB` | `M-INS` / `M-RUB` | memory / memory |
| 5 | `` / `` | null | null | `` / `` | blank / blank |
| 6 | `   ` / `\t\n` | `C-INS` / `C-RUB` | null | `C-INS` / `C-RUB` | canvas / canvas |
| 7 | `T-INS` / `` | `C-INS` / `C-RUB` | null | `T-INS` / `C-RUB` | typed / canvas |
| 8 | `` / `` | `` / `` | null | `` / `` | blank / blank |

Row 1 is the AC-R1 worst-failure guard. Row 6 is the trim edge. Row 7 is
per-field independence. Rows 4 and 8 separate "canvas object present but empty"
from "no canvas object" so a mutant that treats `{instructions:""}` as "canvas
wins with empty" is caught.

The axes (typed-blank vs non-blank vs whitespace; canvas null vs empty vs
present; memory null vs present) come from this table, NOT from the function -
the generator is the function under test and the expected values are frozen
literals, so no branch shares a hardcoded axis with its own oracle.

### 2.3 Sabotages (all run against a mutant; all observed RED, then GREEN on restore)

- **S1** - check canvas before typed. RED on row 1 only (instructions becomes
  `C-INS`); row 6's typed value is whitespace, so S1 and the correct function
  both return `C-INS` there (checker correction I-1; row 6's real discriminator is S2).
  DISCRIMINATES (the worst-failure kill).
- **S2** - drop the trim (use `typed !== ""`). RED on row 6 (returns the
  whitespace as `typed` instead of letting canvas fill). DISCRIMINATES.
- **S3** - never consult `storedMemory`. RED on rows 3 and 4 (blank instead of
  `M-INS`). DISCRIMINATES.
- **S4** - resolve both fields from the instructions decision (lose per-field
  independence). RED on row 7 (`rubricSource` becomes `typed`/wrong). DISCRIMINATES.

Satisfiability: reference impl green on all 8 rows.

## 3. Leaf: `submitFilesSequentially(files, submit)`

New file: `src/app/components/grading-chat/chatFileBatch.ts` (+ `chatFileBatch.test.ts`).
R6 multi-file intake.

OBJECT: the multi-file batch driver (K files -> K awaited submits, outcomes in
input order, no outcome dropped).
INSTRUMENT: a unit test with a MOCKED `submit` (no real fetch; `vitest.setup.ts`
throws on any unmocked fetch - section 7). The mock records call order and a
live in-flight counter.
DIRECTION of failure: outcome order != input order; a refusal dropped; fewer
than K submit calls; or more than one submit in flight at once.

### 3.1 Contract

```
function submitFilesSequentially<T>(
  files: readonly File[],
  submit: (file: File) => Promise<T>,
): Promise<T[]>
```
Awaits `submit(file)` for each file IN ORDER, pushes each resolved outcome in
input order, returns the K outcomes. It does not inspect `T`; a refusal is just
another outcome, so nothing is dropped by construction. (Keep it generic over
`T`; the panel instantiates `T = SubmitOutcome`, the driver's
accepted|refused union, at the W2 call site.)

### 3.2 Assertions (frozen over 4 files, one of which the mock refuses)

Mock: `submit("c")` resolves `{kind:"refused", reason:"bad c"}`, every other
file resolves `{kind:"accepted", tag:file}`; each call increments a
`concurrent` counter on entry, awaits a 1ms tick, decrements on exit, and pushes
the file into a `calls` array at entry.

1. `out.length === files.length` (= 4).
2. `calls` deep-equals `["a","b","c","d"]` (submit called once per file, in order).
3. `out` mapped to `tag ?? reason` deep-equals `["a","b","bad c","d"]` (outcomes
   in input order; the refusal is present at its input position, not dropped).
4. `out[2].kind === "refused"` (the middle refusal survives and does not halt the
   batch).
5. `maxConcurrent === 1` (sequential: never more than one submit in flight).

### 3.3 Sabotages

- **S1** - `Promise.all(files.map(submit))` instead of the sequential loop. RED on
  assertion 5 (`maxConcurrent` reaches 4). **Assertion 3 (order) does NOT fire -
  `Promise.all` preserves array order - NO KILL from the order assertion.** This
  is the discrimination that matters: the SEQUENTIALITY claim is carried ONLY by
  the concurrency counter (assertion 5); the order/count assertions cannot see a
  parallel implementation. Verified: assertion 5 RED, assertion 3 GREEN under
  this mutant. Do not drop assertion 5 thinking order covers it.
- **S2** - push only accepted outcomes (`if (o.kind==="accepted") out.push(o)`).
  RED on assertion 1 (length 3 != 4). DISCRIMINATES.
- **S3** - `break` on the first refusal. RED on assertion 2 (calls = `["a","b","c"]`,
  length 3 != 4). DISCRIMINATES.
- **S4** - `out.unshift(...)` (reverse output order). RED on assertion 3 (order).
  Length stays 4, so assertion 1 does NOT catch it - assertion 3 is the
  discriminator. DISCRIMINATES.

Satisfiability: reference impl green on all 5 assertions.

Note on scope: this leaf owns ONLY the ordering/completeness/sequentiality of the
batch. Per-file refusal TEXT (unsupported type, over-budget) is produced by the
existing `prepareChatSubmissionAction`/driver path and is NOT re-tested here -
the mock stands in for `submit`, so a change to refusal wording cannot break this
leaf, by design.

## 4. Leaf: `chatSetupMemory` (R2 scope-by-Canvas-URL)

New file: `src/app/components/grading-chat/chatSetupMemory.ts` (+ `chatSetupMemory.test.ts`).
Wraps the EXISTING `src/lib/grade/rubric-memory.ts` (`saveRubricMemory`,
`loadRubricMemory`, `describeRubricOrigin`, `describeRubricScope`) under one NEW
`ta-` key. `rubric-memory.ts` is imported only, NOT edited in W1 (confirmed in
the scope's collision list `:160`).

OBJECT: the chat's scoped rubric memory and its origin label.
INSTRUMENT: a unit test over the leaf's functions, using an in-memory
`FakeStorage` + `window`/`localStorage` globals set in `beforeEach` and restored
in `afterEach` - DUPLICATE this harness from `rubric-memory.test.ts:9-45`; do
NOT import it (cross-test-file import re-runs its describe blocks - section 7).
DIRECTION: two assignments' text cross-restore; an origin label claims the
requested scope on a fallback; or a legacy key is rewritten.

### 4.1 Contract

```
export const CHAT_RUBRIC_MEMORY_KEY = "ta-grading-chat-rubric-memory";
export function deriveChatScope(canvasUrl: string): string;           // "" for a blank/unusable url, else "canvas:" + trimmed url
export function saveChatSetupMemory(scope: string, entry: { rubric: string; instructions?: string }): void;
export function loadChatSetupMemory(scope: string): LoadedRubricMemory | null;
export function describeChatSetupOrigin(loaded: LoadedRubricMemory, requestedScope: string): string;
```
`saveChatSetupMemory`/`loadChatSetupMemory`/`describeChatSetupOrigin` delegate to
the matching `rubric-memory.ts` functions passing `CHAT_RUBRIC_MEMORY_KEY`.
`deriveChatScope` is pure.

### 4.2 `deriveChatScope` - frozen (pure, strongest assertions here)

- `deriveChatScope("") === ""` and `deriveChatScope("   ") === ""` (blank =
  "nothing known yet"; an empty scope makes `saveRubricMemory` a no-op and
  `loadRubricMemory` return null - the wrong-grades-look-right trap is closed by
  construction, rubric-memory.ts `:97-126`).
- `deriveChatScope(URL_A) === "canvas:" + URL_A` for
  `URL_A = "https://school.instructure.com/courses/1/assignments/2"`.
- `deriveChatScope(URL_A) !== deriveChatScope(URL_B)` for a different assignment
  URL `URL_B = ".../assignments/9"` (distinct assignments -> distinct scopes).

### 4.3 Scope-by-URL: no silent cross-restore, origin always labelled

- Save A=`RUBRIC-A` under `deriveChatScope(URL_A)`, save B=`RUBRIC-B` under
  `deriveChatScope(URL_B)`. Then `loadChatSetupMemory(deriveChatScope(URL_A)).entry.rubric === "RUBRIC-A"`
  and `...(URL_B)... === "RUBRIC-B"` (exact-scope restore; no crossing).
- `loadChatSetupMemory("") === null` (empty scope never restores).
- Fallback is labelled: with only A saved, `loadChatSetupMemory(deriveChatScope(URL_B))`
  returns A's entry with `.scope === deriveChatScope(URL_A)` (the last-used
  fallback, rubric-memory.ts `:119-125`). Then
  `describeChatSetupOrigin(loaded, deriveChatScope(URL_B))`:
  - is non-empty;
  - CONTAINS `URL_A` (names the scope it actually came from);
  - does NOT contain `URL_B` (never claims the requested scope on a fallback).

  Pin the FACTS above, NOT the exact sentence wording. `describeRubricScope`
  (`rubric-memory.ts:145-151`) has no `canvas:` case, so it returns the raw
  `"canvas:<url>"`; the origin reads literally as `Rubric restored from your last
  saved rubric (canvas:https://...), saved N minutes ago.` That is functional but
  leaks the prefix - see residual R-GC-ORIGIN. Asserting only "contains URL_A,
  not URL_B, non-empty, fallback-form" keeps this test green whether the
  architect accepts the raw prefix OR later adds a `canvas:` case to
  `describeRubricScope` (an edit to `src/lib/grade/`, OUT of W1 scope).

### 4.4 Legacy keys never rewritten (the "never rewritten" half of I1 tier 4)

- Pre-seed `FakeStorage` with `ta-grading-chat-instructions = "LEGACY-INS"` and
  `ta-grading-chat-rubric = "LEGACY-RUB"`. After `saveChatSetupMemory(scope, {rubric:"RUBRIC-A"})`:
  - `getItem("ta-grading-chat-instructions") === "LEGACY-INS"` (untouched);
  - `getItem("ta-grading-chat-rubric") === "LEGACY-RUB"` (untouched);
  - `getItem(CHAT_RUBRIC_MEMORY_KEY) !== null` (the new key was written).

  The read-ONCE half (the panel reads the two legacy keys exactly once per
  session for a non-Canvas session, never on later submits) is a LIFECYCLE fact
  that only the panel can carry - section 6, W2 wiring, owner/wiring instrument.
  This leaf proves only that the SAVE path does not write the legacy keys.

### 4.5 Sabotages

- **S1** - `deriveChatScope` returns a constant (ignores the URL). RED on 4.3:
  A and B land under the same scope, the second overwrites the first,
  `loadChatSetupMemory(URL_A)` returns `RUBRIC-B`. DISCRIMINATES.
- **S2** - `describeChatSetupOrigin` builds the label from the REQUESTED scope
  instead of `loaded.scope`. RED on 4.3 (label contains `URL_B` / omits `URL_A`).
  DISCRIMINATES. (This is the exact "fabricated label" failure
  `rubric-memory.test.ts:52-54` was written to catch, re-asserted at the chat seam.)
- **S3** - save writes a legacy key (`setItem("ta-grading-chat-rubric", ...)`).
  RED on 4.4 (legacy value changed). DISCRIMINATES.

Satisfiability: reference impl green on 4.2-4.4.

## 5. The B1 directory key canary (RULING B1 / DECISION 3 obligation)

New file: `src/app/components/grading-chat/grading-chat-storage-keys.structure.test.ts`
(a non-enumerated name; it must NOT contain the literal `stripComments` -
section 7).

WHY it exists: DECISION 3 (`owner-decisions-2026-09-23.md:99-100`) requires the
relevant exact-key-set canary to be bumped in the SAME commit that adds a `ta-`
key, and RULING B1 establishes that grading-chat has NO such canary today
(`componentStorageKeys.structure.test.ts` is top-level-only, non-recursive -
section 1). Adding the R2 scoped-memory key `ta-grading-chat-rubric-memory` is
the trigger. DROP any DECISION-9 sixth-key citation: DECISION 9 counts
`src/app/components/` (the parent dir), not this subtree, and does not bind
grading-chat.

OBJECT: the exact set of `ta-` tokens in grading-chat's non-test source.
INSTRUMENT: an `fs` scan, NON-RECURSIVE, over non-test `.ts`/`.tsx` files in
`src/app/components/grading-chat/`, over RAW (comment-included) source, with the
same quote-free negative-lookbehind pattern the precedent uses
(`componentStorageKeys.structure.test.ts:116`):
`/(?<![a-zA-Z0-9_])ta-[a-z0-9-]*[a-z0-9]/g`.
DIRECTION: a `ta-` key (quoted or template-literal) added or removed without
updating the frozen list.

### 5.1 Frozen oracle (a CONSTRUCTION, provably reachable)

`EXPECTED = {the 3 keys measured in section 1} plus {CHAT_RUBRIC_MEMORY_KEY}`, sorted:
```
[
  "ta-grading-chat-input-mode",
  "ta-grading-chat-instructions",
  "ta-grading-chat-rubric",
  "ta-grading-chat-rubric-memory",
]
```
Construction is reachable: the 3 existing keys are present today (section 1
command output); the 4th is the one new constant W1 adds, defined in
`chatSetupMemory.ts` (section 4.1). The greedy pattern matches each quoted
literal independently, so `ta-grading-chat-rubric` and
`ta-grading-chat-rubric-memory` appear as two distinct entries (verified in the
reference run - they are separate string literals on separate lines). Total = 4;
this satisfies AC-R6 ("the panel's keys total 4").

### 5.2 Assertions (precedent shape, `componentStorageKeys...:216-259`)

1. Population control: `files.length > 3` (a scan over a renamed/emptied
   directory proves nothing; `readdirSync` throws on a missing dir, so emptiness
   is not silent, but a wrong-population scan is caught by assertion 3 anyway).
2. `keys.length > 0`.
3. `keys` deep-equals `EXPECTED` - the load-bearing assertion.
4. Add-guard: `collectTaKeys(source + '\nconst x = "ta-new-canary-field";\n')` does
   NOT equal `EXPECTED`.
5. Template-literal add-guard: appending `` `ta-new-template-${id}` `` likewise
   breaks the set (proves the pattern catches interpolated keys' literal prefix).
6. Remove-guard: replacing an existing key literal with `"REMOVED"` breaks the set.

### 5.3 The comment-false-positive hazard, and the implementer constraint it forces

The scan is over RAW source (matching the precedent's "inventory every mention,
including documentation" policy). Therefore any OTHER `ta-` literal that appears
ANYWHERE in a grading-chat non-test file - including in a code COMMENT - becomes
a member of the set and reddens assertion 3. Two concrete traps:
- `chatSetupMemory.ts` wraps `rubric-memory.ts`, whose own module comment (line 9)
  cites the `ta-repo-grades-rubric` warning (checker correction I-2: this, not
  the shared cross-surface key, is the real copy hazard).
  If the implementer copies that prose with the literal keys intact, the scan
  picks them up and the canary goes RED.
- **IMPLEMENTER CONSTRAINT (pinned by this very canary):** the ONLY `ta-` literal
  any grading-chat non-test file may contain is one of the four in `EXPECTED`.
  Reference the shared Repo-Grades slot and the shared cross-surface key BY
  DESCRIPTION, never by their literal `ta-...` spelling. If a fifth `ta-` token
  is genuinely needed, add it to `EXPECTED` in the same commit - that is the
  canary doing its job, not a reason to loosen it.

### 5.4 Sabotages

- **S1** - implementer adds the new key constant but does NOT update the canary's
  `EXPECTED` (the silent-green DECISION-3 violation this canary exists to catch).
  RED on assertion 3 (found has 4, EXPECTED frozen at 3). DISCRIMINATES. (In
  these notes `EXPECTED` is already the 4-set, so the equivalent sabotage is
  "ship the key, revert EXPECTED to the old 3-set" - same red.)
- **S2** - canary scans RECURSIVELY or includes test files. The population and
  the key set change (test files / future subdirs leak in). Caught by assertion 3
  drifting. Stated so the checker holds the non-recursive, non-test scope.
- **NON-DISCRIMINATING to avoid:** a mutation that only renames the canary file
  or reorders `EXPECTED` by hand - the test sorts both sides, so reordering is a
  no-op and must NOT be offered as a kill.

Satisfiability: reference canary green on the 4-set and both add/remove guards.

## 6. W2 wiring facts carried forward (NOT executable in W1; do not assert here)

These are the stale-closure fix and the integration-removal half of AC-R1. They
are source-order claims for a W2 `GradingChatPanel.wiring.test.ts` (W2's own test
notes own them); listed so the checker can confirm W1 does not try to measure
them and so nothing is dropped:

- **W2-AR1 (await-before-beginSession).** On a Canvas-URL submit with both fields
  blank, the panel must `await fetchCanvasMetaAction(url)` and pass the FETCHED
  values EXPLICITLY into `beginSession({assignmentInstructions, rubric})` - never
  rely on the `ensureSession` closure, which reads stale `instructions`/`rubric`
  state (`GradingChatPanel.tsx:98-107`, `useContinuousGradingRun.ts:212-231`).
  Instrument (W2): a source-order assertion that the `fetchCanvasMetaAction(` call
  precedes the `beginSession(`/`ensureSession(` call in the Canvas-URL branch, and
  that `beginSession` is passed the resolved values, not the state variables.
  DIRECTION: deleting the fetch, or passing state instead of fetched values,
  reddens it. This is the "deleting the fetch reddens the await-before-beginSession
  wiring" half of AC-R1.
- **W2-AR1b (precedence wired through the leaf).** The panel feeds
  `resolveSetupFill` with `typed` = current field state, `canvasMeta` = the fetch
  result, `storedMemory` = `loadChatSetupMemory(deriveChatScope(url))` - so the
  pure-leaf precedence (section 2) actually governs what fills. The pure leaf's
  row-1 guard is the W1 half of AC-R1 ("the pure leaf catches a non-blank typed
  field being overwritten").
- **W2-LEGACY-ONCE.** The two legacy global keys are read exactly ONCE (session
  start, non-Canvas session) and never rewritten thereafter. Section 4.4 proves
  the SAVE path does not rewrite them; the read-ONCE lifecycle is W2/owner.
- **W2-ERR-PLACEMENT (R5/AC-S4).** submitError must render in the same viewport as
  the composer. Owner browser-walk only (no render here). Residual R-2.

## 7. Constraints checklist (the implementer must satisfy all; the checker verifies)

- `npm run test:paths <p1> <p2> ...` for any multi-file run - NEVER a raw
  multi-path `vitest`/`npm test` (it drops unmatched args and exits 0). The W1
  set to enumerate at the wave gate: the three new leaf tests, the new canary,
  AND the pre-existing `GradingChatPanel.structure.test.ts`,
  `componentStorageKeys.structure.test.ts`,
  `src/lib/grade/rubric-memory.test.ts`, and
  `src/tools/strip-comments-agreement.structure.test.ts` (the last two/four are
  REGRESSION guards - adding files/keys must not disturb them).
- No test imports a helper from another `*.test.ts`. DUPLICATE the `FakeStorage`
  + window-global harness into `chatSetupMemory.test.ts` (copy from
  `rubric-memory.test.ts:9-45`). Do NOT import `withoutLineComments` from
  `GradingChatPanel.structure.test.ts`.
- No new test file names a comment-strip helper `stripComments` or mentions that
  literal. The W1 leaf tests need NO comment stripping (they import and call
  functions); the canary scans raw source (no stripping). So the
  `strip-comments-agreement.structure.test.ts` enumeration is NOT triggered - keep
  it that way (confirmed: that gate enumerates only files MENTIONING the literal
  `stripComments`, `:507-521`).
- No `vi.mock("@/lib/supabase/auth")` anywhere in these tests (the wholesale-auth
  canary `wholesale-auth-mock-population.structure.test.ts`). None of the W1
  leaves touch auth, so this is free - do not introduce a mock that trips it.
- No real `fetch`/`canvasFetch`: the `submit` in leaf 3 is a plain mock function;
  nothing in W1 calls Canvas. `vitest.setup.ts` throws on any unmocked fetch.
- No `/s` (dotAll) regex (passes vitest, FAILS tsc TS1501). The canary pattern
  uses no `/s`.
- No emojis anywhere.
- W1 leaf files are pure client-safe TypeScript, NO server imports (the
  client-bundle guard): `chatSetupFill.ts` and `chatFileBatch.ts` import nothing
  but types; `chatSetupMemory.ts` imports only from `src/lib/grade/rubric-memory.ts`
  (already client-safe - it is `window.localStorage`-only, no server import).
- Do NOT edit `GradingResults.tsx` or `page.module.css`. Do NOT touch
  walkthrough/recording or repo-grader files. This build's surface is
  `src/app/components/grading-chat/**` only.
- The exported leaves land in the SAME commit as their W2 callers (leaves-with-
  their-caller; an exported leaf with no caller trips the wave gate). The B1
  canary and the `CHAT_RUBRIC_MEMORY_KEY` constant land in that same commit.

## 8. Residual register (owner / instrument / step)

- **R-1** (click-cost leverage, RULING B2). R1's advantage is fewer clicks /
  shorter cursor path, which NO vitest test measures (no component renders). The
  W1 leaf tests prove the auto-fill mechanism is PRESENT and SAFE (never clobbers
  typed text), NOT that it saves clicks. Owner: instructor/owner. Instrument: the
  browser walk at 1366x768 for AC-C1/AC-C2 (felt click count). Step: after W2/W3.
  Do not let a green W1 suite be read as evidence of the click saving.
- **R-2** (error placement, scroll, cursor px - AC-S1..S4). Owner: owner.
  Instrument: browser walk. Step: after W2 and W3.
- **R-GC-ORIGIN** (origin label prefix leak). `describeRubricScope`
  (`rubric-memory.ts:145-151`) has no `canvas:` case, so a chat origin label reads
  `...(canvas:https://...)...`. Owner: architect. Instrument: open
  `describeRubricScope`; decide accept-raw vs add a `canvas:` case (an edit to
  `src/lib/grade/`, OUT of W1 scope). Step: W2 copy. Section 4.3 is written to stay
  green under either resolution.
- **R-GC-ROTATE** (scope-key normalisation). `deriveChatScope` uses the trimmed
  URL verbatim; two URLs that differ only by trailing slash/query/case will not
  collapse to one scope. Accepted for W1 (distinctness is all the tests need).
  Owner: architect. Instrument: a leaf test over normalised URL pairs, if the
  architect chooses to normalise. Step: W2 plan.
- **W2-LEGACY-ONCE** (read-once lifecycle). As section 6. Owner: owner/wiring.
  Instrument: W2 panel wiring + browser walk. Step: W2.
- **R6-FILE-REFUSAL-WORDING.** Per-file refusal text is produced outside this
  leaf (driver/`prepareChatSubmissionAction`), so leaf 3 does not assert it. Not a
  deletion: it is already covered by the existing intake path; named here so the
  checker does not read its absence from W1 as a gap.
