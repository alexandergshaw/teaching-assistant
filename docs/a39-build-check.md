# A39 build check: wave 2 and wave 3a-i, as built

Fresh adversarial verification over shipped code, by an agent that did not build
it. Commits under check: `8a977b1` (wave 2, rubric memory + version
provenance), `87fb303` (wave 3a-i, the Snapshot panel extraction), `86d932c`
(the closure assertion that closed W2-5). Context read: `c031050` (wave 1),
`docs/a39-waves.md` 6 and 8.2, `docs/owner-decisions-2026-09-23.md` DECISIONS
3, 9, 10.

Every quantity below names the command that produced it. Every sabotage was
applied to the real tree, run, and restored from a `cp` backup held outside the
repo; `git status --short` shows zero diff on every path this check touched (see
"Tree state" at the end).

**Snapshot caveat.** At dispatch, wave 3b and wave 5 were in flight. They landed
during this check (`5122b49`, `775f26b`), so `SnapshotGradingPanel.tsx`,
`GradingTab.tsx`, `LiveFeedPanel.tsx` and
`snapshot-grading.structure.test.ts` were clean when measured here. Other agents
are still writing `grading-recording/`, `walkthrough-announcement/` and
`src/lib/decks/`. Citations into those directories are snapshots as of this pass
and must be re-checked before being relied on.

---

## Verdict

**DEFECTIVE.** 3 BLOCKER, 4 MAJOR, 3 MINOR.

The shipped CODE does what wave 2 said, in the current tree, on the Gemini
provider path. What it does not have is an instrument that can fail. The
feature's entire claimed mechanism can be deleted, and a stored value can be
routed into the rendered provenance line, with every gate the wave named
printing green and exiting 0. That is not a documentation gap: it means the
leverage claim DECISION 3 made the whole point of this row is, today, a reading
claim.

Wave 3a-i hit its number honestly (881 against a target of 940, both counters
agreeing) and four of its five repointed anchors preserve intent. The fifth,
plus one of the four, moved their subject across the new seam and left the seam
itself unasserted - proven by two sabotages that disconnect real controls and
stay green.

---

## 1. The leverage claim, attacked hardest

### What the code actually does - correct

- `src/lib/grade/engine.ts` stamps the pair at three return sites, `:408-409`,
  `:450-451`, `:506-507` (`grep -n "rubricUsed: rubric," src/lib/grade/engine.ts`
  returns 3 lines; canary `grep -n "rubricUsedZZZ" ...` exit 1). The value
  stamped is `gradeStudentEntries`'s own `rubric` parameter, the same string
  passed to `extractRubricCriteria(rubric)` at `:202` and
  `buildSystemPrompt(..., rubric, criteria)` at `:203`. So the stamp is the text
  that actually graded, not a separately persisted one.
- `src/lib/grade/rubricProvenance.ts:19-30` reads only `run.rubricUsed` /
  `run.rubricFingerprint`.
- Nothing outside `engine.ts` writes the pair. Command:
  `grep -rn "rubricUsed\|rubricFingerprint" src --include=*.ts --include=*.tsx | grep -v "\.test\.ts"`
  - the only other occurrences are the two rebuilders
  (`grading-drafts.ts:182-183`, `github-grading-run-store.ts:292-302`), the type
  (`types.ts:349-350`), the reader, and an unrelated local named `rubricUsed` in
  `repo-grades/useRepoGradesBulkGrade.ts`.
- `serializeGithubGradingRun` (`github-grading-run-store.ts:90-122`) spreads
  `stripGradingRunForDraft(input.run)`, so the write side preserves the pair;
  `stripGradingRunForDraft` (`workflows/grading-review-rows.ts`) is a spread as
  the plan recorded.

So in the tree as it stands, editing a stored rubric cannot change what a past
run reports. **The mechanism is real.** Everything below is about whether
anything would notice if it stopped being real.

### BLOCKER 1 - W2-3, "THE REMOVAL TEST", cannot fail against its own stated sabotage

`src/lib/grade/rubricProvenance.test.ts:49-65`. Its own comment states the
sabotage it defends against: "A sabotaged implementation that instead called
loadRubricMemory and returned ITS text would diverge from this test the moment
the store and the run disagree, which the next test proves."

It does not prove it. `mutatedStoreValue` at `:57-60` is a local object literal.
It is never written to any store, and `describeRunRubricProvenance` has no
parameter through which it could arrive. `expect(line).not.toContain(mutatedStoreValue.rubric)`
at `:63` is true by construction for any implementation that derives its string
from `graded` alone.

Sabotage applied, exactly as W2-3 words it - `describeRunRubricProvenance` made
to call `loadRubricMemory("ta-grading-rubric-memory", "upload:any")` and prefer
its text and a `"storedversion"` fingerprint:

```
npm run test:paths -- src/lib/grade/rubricProvenance.test.ts src/app/components/grading-results/rubricProvenanceLeaf.test.ts
 Test Files  2 passed (2)
      Tests  15 passed (15)
EXIT=0
```

GREEN. Restored; both files green again at baseline.

The deeper reason it cannot fail: `rubric-memory.ts:37` returns `{}` when
`typeof window === "undefined"`, and `vitest.config.ts` is `environment: "node"`.
`rubricProvenance.test.ts` installs no `window`/`localStorage` stub (contrast
`rubric-memory.test.ts:33-45`, which does). So in this environment the store is
**unpopulatable** from that file, and "mutate the store and confirm the reported
fingerprint is unchanged" is not an experiment that file can run at all. The
brief asked me to perform that mutation; the honest report is that the
instrument's own harness makes it impossible, which is the finding.

Class: **"the instrument reports on something adjacent to its claim"** -
**REPEAT-OF** the W2-5 class the orchestrator already recorded in `b506b35` and
closed in `a18abcf`. Same corrective rule for both: prove the instrument goes
RED under the exact mutation its own comment names, before counting it as
coverage. Third instance in this row if W2-5's two are counted.

### BLOCKER 2 - the claimed mechanism is deletable with wave 2's OWN FULL GATE green

All three `engine.ts` stamp sites removed (both lines at each site), then wave
8.2's gate run verbatim, all 29 arguments:

```
npm run test:paths -- <the 29 paths printed at docs/a39-waves.md:1315>
 Test Files  29 passed (29)
      Tests  734 passed (734)
EXIT=0
```

Also green under the same mutation, as a narrower control:
`engine.test.ts`, `engine.ungraded.test.ts`, `rubricProvenance.test.ts`,
`grade-result-allowlist-coverage.test.ts`, `rubricProvenanceLeaf.test.ts`,
`grading-drafts.test.ts`, `github-grading-run-store.test.ts` - 7 files, 121
tests, exit 0.

With the stamps gone, `run.rubricUsed` is `undefined` on every run,
`describeRunRubricProvenance` returns `null`, `RubricProvenance` returns `null`,
and the provenance line disappears from the product entirely. No file in the
suite asserts that grading produces the pair:
`grep -rln "rubricUsed" src --include=*.test.ts` returns five files, and the
three outside `rubricProvenance.test.ts` / `grade-result-allowlist-coverage.test.ts`
are `repo-grades/*` files using an unrelated local of the same name.

This is the silent-green failure in its purest form: the wave's own gate cannot
distinguish "shipped" from "never built".

Class: same as BLOCKER 1 - **REPEAT-OF "the instrument reports on something
adjacent to its claim"**. Deliberately not relabelled: one corrective rule
("sabotage-prove each instrument against the mutation that removes the claim")
fixes both, and `iteration-caps.md` calls a relabel here buying a round.

### MAJOR 1 - two of the three producers of a rendered `GradingRun` never stamp the pair

`engine.ts` is not the only producer of a run that `GradingTab` renders.
`GradingTab.tsx:171` is `const run = state.run;`, and `state` is
`GradeActionState` from `src/app/actions/grading.ts`, which has three provider
branches:

| Provider | Producer | Stamps the pair? |
|---|---|---|
| `gemini` | `engine.ts` `gradeSubmissions`/`gradeEntries`/`gradeCanvasUrl` | yes |
| `other` | `gradingApiToRun` (`src/app/actions/grading-run-mapping.ts:27-33`), reached via `gradeZipViaEngine` at `grading.ts:846-850` and `:688-699` | **no** |
| `embedded` | `gradeEntriesEmbedded` (`src/lib/embedded-grader/index.ts:119-123`), reached at `grading.ts:853-878` | **no** |

Both are user-selectable (`GradingTab.tsx:89` `useLlmProvider()`, branches at
`:129-131`, `:165`, `:414`). Both grade against a real rubric text that is in
scope at the call site (`grading.ts:676-681` for `other`, `:857` for
`embedded`). On both, the provenance line renders as nothing at all, silently -
no "unknown", no absence notice. The wave plan's own phrasing, "All three, or
'every run carries the pair' is false on two of them" (8.2), enumerated
`engine.ts`'s return sites and never asked whether `engine.ts` is the only
producer. It is not.

Consequence for the claim: "a run reports the rubric and fingerprint it ACTUALLY
used" holds on one of three provider paths. Nothing measures the other two.

### MAJOR 2 - the "STRUCTURAL" half of the claim is unenforced, and the type argument is false on its own terms

The commit message says the claim "survives because the provenance reader's
parameter type cannot see the storage shape at all."

Two problems.

1. `Pick<GradingRun, "rubricUsed" | "rubricFingerprint">` is a structural type
   whose `rubricUsed` is `string | undefined`. `RubricMemoryEntry.rubric` is
   `string`. So `describeRunRubricProvenance({ rubricUsed: loaded.entry.rubric })`
   typechecks. The `Pick` narrows what the reader can SEE of a run; it does not
   stop a caller handing it a store-derived value.
2. Nothing pins the signature or the mount. `grep -rn "Pick<GradingRun" src --include=*.test.ts`
   finds it only inside `rubricProvenance.test.ts:44`'s own comment (canary
   `Pick<GradingRunZZZ` exit 1). `rubricProvenanceLeaf.test.ts:64-70` checks that
   **`RubricProvenance.tsx`** does not mention `rubric-memory` - but
   `GradingTab.tsx`, which mounts it, imports `loadRubricMemory` at its `:22`
   and is not checked for this at all.

Proven. `GradingTab.tsx:515` changed from `<RubricProvenance run={run} />` to
`<RubricProvenance run={{ ...run, rubricUsed: rubric }} />` - feeding the live
textarea state, which is exactly what `rubric-memory` restores into:

```
npm run test:paths -- src/app/components/grading-results/rubricProvenanceLeaf.test.ts src/lib/grade/rubricProvenance.test.ts src/app/components/grading-results/gradingResultsHelpersWiring.test.ts src/app/components/autoGradeTransition.wiring.test.ts
 Test Files  4 passed (4)
      Tests  54 passed (54)
EXIT=0
```

That is the answer to "find any path where a stored value could reach the
rendered provenance line": there is one, it is one line long, it is in the file
that already holds the store import, and no instrument sees it. Restored.

### The strongest version of "this already exists"

Weak, and it should be said plainly rather than padded. `rubricFingerprint`
already existed and was already used as a content id -
`rubric-bank.ts:70` sets `id: rubricFingerprint(rubric)` on its upsert - so the
fingerprint mechanism is pre-existing and wave 2 MOVED it
(`research/rubric-fingerprint.ts`, 20 lines) rather than inventing it. Rubric
persistence also pre-existed, as DECISION 3 itself records
(`ta-repo-grades-rubric`, one global slot). What is genuinely new is narrow and
real: two optional fields on `GradingRun`, stamped at grade time, plus a 21-line
leaf that renders them. The reframe is not "already built" - it is "the new part
is 3 lines of mechanism and 0 lines of instrument".

---

## 2. The two guards recorded as deliberate - BOTH ENFORCED

This section is sound. Both guards exist in code and both have an instrument
that goes RED when the guard is removed.

**Guard A - an empty scope restores NOTHING.** `rubric-memory.ts:114`
`if (!scope) return null;`, with the reasoning at `:17-25`.

Sabotage: that line deleted.

```
npx vitest run src/lib/grade/rubric-memory.test.ts
 x returns null for an empty scope even when another scope has a saved entry
   AssertionError: expected { entry: { rubric: 'Old rubric text', ... }, scope: 'upload:last-weeks-file.zip' } to be null
 Test Files  1 failed (1)
      Tests  1 failed | 6 passed (7)
EXIT=1
```

RED at `rubric-memory.test.ts:60`. Restored.

**Guard B - a fallback is labelled with the scope it CAME FROM.**
`rubric-memory.ts:132-138`; `describeRubricOrigin` reads `loaded.scope`, and
`:135` compares it against `requestedScope` only to choose the wording.

Sabotage: `describeScope(loaded.scope)` changed to `describeScope(requestedScope)`.

```
npx vitest run src/lib/grade/rubric-memory.test.ts
 AssertionError: expected 'Rubric restored from your last saved ...' to contain 'report-a.docx'
 at src/lib/grade/rubric-memory.test.ts:89
 Test Files  1 failed (1)
      Tests  1 failed | 6 passed (7)
EXIT=1
```

RED. Restored. The test also asserts `not.toContain("report-b.docx")` at `:90`,
so the borrowed-rubric-masquerading case is covered in both directions.

Both callers gate correctly too: `GradingTab.tsx:205-224` restores only inside
`handleUploadFileChange` after a file name exists, and
`CartridgeDropPanel.tsx`'s effect computes `cartridgeRubricScope(course, assignment)`
which returns `""` until both labels are filled, so the library guard and the
caller guard agree rather than one relying on the other.

---

## 3. The three serializer instruments

**The brief's premise is wrong in two ways, and both matter.**

**(a) Wave 2 did not bump them.** `git show --stat 8a977b1` lists 16 files;
`snapshot-row-serialization.test.ts` and `snapshot-row-serialization.ts` are not
among them. `git log --oneline -5 -- src/app/components/snapshot-grading/snapshot-row-serialization.test.ts`
names `da03e20 feat(a24)` as the commit that moved them. Attributing them to
wave 2 sent this check at the wrong commit; the substance was still worth
verifying, and it is sound:

- exact key set, `snapshot-row-serialization.test.ts:95-117`: **18 entries**
  (`id, studentName, state, error, userEdited, totalScore, strengths,
  improvements, overallComment, shotReports, rubricAreas, missingRoles,
  instructionLikeContent, instructionLikeContentQuote, imageFallbackNote,
  evidenceDropped, strengthsNotice, cohortKey`).
- degradation-coverage set, `:373-397`: `actualKeysToDegrade` is DERIVED from
  `Object.keys(full)` minus a 9-name `excluded` set, compared against a
  hand-mirrored 9-name list that includes `cohortKey`.
- `it.each` table, `:399-411`: 9 rows, including `["cohortKey", 42, undefined]`.

All three are consistent at 18/9/9, and the coverage set derives one side from
the real object, so the hand-mirror cannot drift silently. Good instrument.

**(b) MAJOR 3 - "adding a 19th field to the type ALONE still fails loudly" is
FALSE.** The three assertions fail when a field is added to the CODEC. They are
silent when a field is added to the TYPE and forgotten in the codec - which is
the failure mode DECISION 4's sentence claims they catch.

- `toWire` (`snapshot-row-serialization.ts:56-115`) builds an explicit object
  literal and never spreads, so a type-only field never appears in
  `Object.keys(result)`; the 18-key assertion stays green.
- `actualKeysToDegrade` is computed from `Object.keys(full)` where `full` is
  `toWire(...)`, so it stays green for the same reason.
- There is no compile-time exhaustiveness guard over the row type:
  `grep -rnE "Exclude<keyof (SnapshotAssessmentRow|SnapshotRow)" src/app/components/snapshot-grading/`
  exits **1**; the same pattern shape against a name that does exist,
  `grep -rnE "Exclude<keyof (GradingRun)" src/lib/grade-result-allowlist-coverage.test.ts`,
  exits 0 and prints `:317`. So the search is valid and the absence is real.

The codec's own header already says this, honestly and at length, at
`snapshot-row-serialization.ts:46-54` ("nothing here would catch a NEW,
legitimate field being added to the type and silently never written or read by
this codec"). The source is right; DECISION 4's sentence, and the brief that
inherited it, are wrong. Fixing this is a one-line correction to the decision
record plus, if wanted, an `Exclude<keyof SnapshotAssessmentRow, ...>` guard
mirroring the one wave 2 DID build.

**What wave 2 built here, and it is the good instrument of this row.**
`grade-result-allowlist-coverage.test.ts:305-386` adds `ALL_GRADING_RUN_FIELDS`
(7 names), a compile-time `MissingRunFields extends never` assertion at
`:317-319`, a `runSentinel()` and two round-trip preservation tests. Both halves
verified to fail:

- Field added to `GradingRun` and not to the list (`zzzCheckerThrowawayField?: string`
  appended to `types.ts`):
  `npx tsc --noEmit --incremental false` ->
  `src/lib/grade-result-allowlist-coverage.test.ts(319,7): error TS2322: Type 'boolean' is not assignable to type '["add the missing field(s) to ALL_GRADING_RUN_FIELDS above", "zzzCheckerThrowawayField"]'`, exit **2**. Restored; re-run clean, exit **0**.
- `rubricUsed` line deleted from `coerceGradingRun` (`grading-drafts.ts:182`):
  `npx vitest run src/lib/grade-result-allowlist-coverage.test.ts` ->
  `AssertionError: field "rubricUsed" was not preserved by coerceGradingRun: expected undefined to deeply equal 'SENTINEL_rubricUsed'`,
  1 failed / 9 passed, exit **1**. Restored.

That is the pattern the rest of this wave needed and did not get.

---

## 4. The extraction's anchors

`87fb303` moved 196 lines out of the panel into `SnapshotCaptureSection.tsx`
(169 lines) and `SnapshotInstructionsSection.tsx` (129 lines), and repointed five
checks across two structure tests. Measured:

```powershell
@(Get-Content src/app/components/snapshot-grading/SnapshotGradingPanel.tsx).Count   # 953 today
# at 87fb303: 881   (git show 87fb303:<path> | Get-Content, and wc -l agrees at 881)
```

881 against the 940 target, both counters agreeing, and each leaf inside its
`-le 300` budget. The ceiling arithmetic was met honestly and by the grouped
shape RULING 33 predicted.

Anchor-by-anchor:

| Repointed check | Verdict |
|---|---|
| `snapshot-autofire.structure.test.ts:157-166` - `onClick={() => void handleRead()}` widened to `/\w+=\{\(\)\s*=>\s*void handleRead\(\)\}/` | **WEAKER, see BLOCKER 3** |
| `snapshot-autofire.structure.test.ts:407-424` - `onClick=` literal to `onGrade={() => void handleGrade()}` containment window | intent preserved; still bounds every `handleGrade(` call site in the panel to one literal's span, with a `toBeGreaterThan(-1)` presence assertion first |
| `snapshot-grading.structure.test.ts:669-737` - AC 17 disclosure repointed to `SnapshotInstructionsSection.tsx` | intent preserved. Both anchors are asserted to resolve (`:734-737`) before any slice is asserted on, so it goes RED not vacuous |
| `snapshot-grading.structure.test.ts:768-784` - SHOULD-FIX 6 checkbox repointed, setter renamed | **WEAKER, see BLOCKER 3** |
| `snapshot-grading.structure.test.ts:892-924` - RES-N15-4 repointed from the panel to the directory's combined source | intent substantially preserved, two loose anchors; see MINOR 3 |

Two sabotages proving each repoint can still fail at all:

- `SnapshotInstructionsSection.tsx:114` `onChange={(e) => onAutoGradeArmedChange(e.target.checked)}`
  -> `onChange={() => onAutoGradeArmedChange(true)}`:
  `npx vitest run .../snapshot-grading.structure.test.ts` -> 1 failed / 75 passed,
  exit 1, naming `:782`.
- `SnapshotCaptureSection.tsx:110` `if (images.length > 0) void handleFiles(images, "drop");`
  -> `void 0;`: same file -> 1 failed / 75 passed, exit 1, naming the
  `handleFiles(` match.

Both restored.

### BLOCKER 3 - two repointed anchors moved their subject and left the new seam unasserted

The repointed assertions now read the LEAF, where `autoGradeArmed`,
`onAutoGradeArmedChange` and `onRead` are prop names. Nothing asserts that the
panel binds those props to anything real. Both halves proven by sabotage:

**(i) the auto-grade arming checkbox can be disconnected.**
`SnapshotGradingPanel.tsx:815` `onAutoGradeArmedChange={setAutoGradeArmed}` ->
`onAutoGradeArmedChange={() => {}}`:

```
npm run test:paths -- .../snapshot-grading.structure.test.ts .../snapshot-autofire.structure.test.ts .../useSnapshotAutoGrade.wiring.test.ts
 Test Files  3 passed (3)   Tests  119 passed (119)   EXIT=0
npm run test:paths -- .../snapshot-role-setrole-callsites.structure.test.ts .../autoGradeTransition.wiring.test.ts .../p11-containment-snapshot.test.ts src/lib/no-emojis.test.ts
 Test Files  4 passed (4)   Tests  47 passed (47)   EXIT=0
```

Every reader of that panel green while the checkbox controls nothing. Before
`87fb303`, the same defect was RED, because the assertion read the file where
`setAutoGradeArmed` was in scope: the old literal was
`onChange={(e) => setAutoGradeArmed(e.target.checked)}` in the panel itself.

**(ii) the Read button can be made dead.** `SnapshotInstructionsSection.tsx:120`
`<Button variant="outlined" onClick={onRead} ...>` with `onClick={onRead}`
removed:

```
npm run test:paths -- .../snapshot-autofire.structure.test.ts .../snapshot-grading.structure.test.ts
 Test Files  2 passed (2)   Tests  93 passed (93)   EXIT=0
```

`grep -rn "onRead" src --include=*.test.ts` returns only two lines, both inside
the repoint's OWN comment at `snapshot-autofire.structure.test.ts:160,162`. The
comment asserts "the leaf's own `<Button onClick={onRead}>` is the click
wiring"; no test does. Both restored.

This is the class the brief predicted, and it is worse than a weakened regex:
DECISION 7 accepted `.tsx` leaves with no oracle on the explicit premise that
"the three instruments that remain" (`docs/a39-waves.md:977`) still hold. Two of
those three now bind to the leaf's internal prop names, so the panel-to-leaf
seam that the extraction CREATED is the one thing nothing checks. The corrective
rule is narrow and mechanical: when an extraction moves an anchor's subject into
a new leaf, the write set owes one added assertion pinning the panel's hand-off
(`onAutoGradeArmedChange={setAutoGradeArmed}`, `onRead={...}`, `onGrade={...}`)
and one pinning the leaf's consumption (`onClick={onRead}`).

Class: **"an extraction splits an anchor's subject and leaves the new seam
unasserted"** - **NEW**. It is adjacent to this repo's recorded
`verify-reachability-not-just-correctness` memory but not the same rule: the
capability here is reachable and correct, and what is missing is the assertion,
not the wiring.

---

## 5. The closure assertion (`86d932c`) - SOUND

- **Count verified against the tree.** `FROZEN_TRAILS` at
  `runtime-import-graph.test.ts:551-561` holds **9** entries, and the tree
  produces exactly 9: baseline `npx vitest run src/lib/module-graph/runtime-import-graph.test.ts`
  -> 174 passed, exit 0, including the deep-equal.
- **It catches the W2-5 sabotage.** `engine.ts:32` import changed from
  `"../research/rubric-fingerprint"` to `"../research/rubric-bank"` (which
  re-exports the function, so it typechecks):

```
npx vitest run src/lib/module-graph/runtime-import-graph.test.ts
 x R-16 ... engine.ts reaches exactly the frozen set of server-only trails today (positive control: non-empty)
   AssertionError: expected [ ...(10) ] to deeply equal [ ...(9) ]
 Test Files  1 failed (1)   Tests  1 failed | 173 passed (174)   EXIT=1
```

  10 against 9. Restored. This is the instrument the rest of wave 2 lacks, and
  the per-direct-edge walk genuinely defeats the memoisation hole the commit
  message describes.
- **The positive control cannot pass on an empty result.** `:589-593` asserts
  `expect(trails.length).toBeGreaterThan(0)` BEFORE the deep-equal, and the
  second test ends `expect(total).toBeGreaterThan(0)` at `:611`. An empty walk
  fails both, so a broken resolver cannot present as clean.

One note, not a finding: the frozen literal pins nine trails through
`lib/canvas/*`, so any unrelated change to the Canvas import chain turns it red.
That is the intended cost of an exact-trail oracle and the failure is legible.

---

## 6. The fold caps - ALL THREE PRESENT

```
grep -n "minRows\|maxRows" src/app/components/GradingTab.tsx
379:  minRows={10}   380:  maxRows={20}
396:  minRows={10}   397:  maxRows={20}
grep -n "minRows\|maxRows" src/app/components/CartridgeDropPanel.tsx
463:  minRows={4}    464:  maxRows={12}
canary: grep -n "minRowsZZZ" src/app/components/CartridgeDropPanel.tsx -> exit 1
```

The third field the architecture named - `CartridgeDropPanel.tsx`'s
`minRows={4}` with an action control below it, which an earlier check flagged as
uncapped - **is now capped** at `maxRows={12}`. All three are pinned by
`rubricProvenanceLeaf.test.ts:73-91`, which extracts the enclosing `<TextField`
tag per `id` and asserts `maxRows` inside that tag rather than anywhere in the
file, and asserts the `id` resolved first. That instrument is correctly built.

---

## 7. DECISION 9's transition rule

**Recorded at the key definitions: YES.** `GradingTab.tsx:49-53` and
`CartridgeDropPanel.tsx:29-33` both carry it, in the same words: "DECISION 9
... ships with no exact-set canary; write one when a sixth `ta-` key lands in
this directory, covering all of them."

### MAJOR 4 - the trigger as recorded is already satisfied 75 times over, so it cannot fire

Both keys live in `src/app/components/` (root). Counted, non-recursive,
non-test files only:

```
for f in src/app/components/*.tsx src/app/components/*.ts; do
  case "$f" in *.test.ts|*.test.tsx) continue;; esac
  grep -ohE '"ta-[a-zA-Z0-9-]+"' "$f"
done | sort -u | wc -l
-> 75
canary: grep -oE '"ta-ZZZNOSUCH"' src/app/components/GradingTab.tsx -> exit 1
```

75 distinct `ta-` keys, in 19 files, before wave 2 added its two. "A sixth key
lands in this directory" happened years of commits ago. A future reader who
follows the instruction at the key definition will count 6+ immediately, and
will then either write a 75-key exact-set canary over a directory the residual
itself calls "hundreds of files", or conclude the rule is void. Neither is the
deferral DECISION 9 authorised; the decision's own words are that without the
transition clause "this is a permanent hole rather than a deferral".

The residual behind it words the trigger differently and more defensibly -
`docs/a39-waves.md:3017` (RES-W-4) and `docs/a39-architecture.md:2365`
(RES-A39A-11) both say "a SIXTH persisted key appearing in either uncovered
location - a TRANSITION from the two this wave lands". That is measurable. **The
divergence is the defect**: the measurable form lives in two planning documents
nobody reads at edit time, and the unmeasurable form is the one sitting in the
source beside the key.

The residual's own instrument also does not produce the baseline it claims.
Quoted verbatim from RES-W-4: "`grep -rno "ta-[a-z-]*" src/app/components/*.tsx | sort -u`
... measured at the wave-2 gate to establish the baseline count of two". Run
verbatim:

```
grep -rno "ta-[a-z-]*" src/app/components/*.tsx | sort -u | wc -l   -> 156
grep -rho "ta-[a-z-]*" src/app/components/*.tsx | sort -u | wc -l   ->  88
canary: grep -rno "taZZZ-[a-z-]*" src/app/components/*.tsx | sort -u | wc -l -> 0
```

156 lines, 88 distinct strings. Not two, and no filter in the command reduces it
to two. So the baseline "count of two" was never produced by the instrument that
is recorded as having produced it - an entry-gate violation of
`iteration-caps.md` rule 1, inside the very residual DECISION 9 made mandatory.

Minimal fix, and it is one edit in each of two source files plus one in the
residual: state the trigger as the residual's own transition ("a sixth
rubric-memory-style key beyond the two this wave lands") and name the instrument
that counts THOSE - e.g. the keys passed as `storageKey` to `rubric-memory.ts`,
which is a 2-element set today and is countable
(`grep -rn "RUBRIC_MEMORY_STORAGE_KEY\|rubric-memory" src --include=*.tsx`).

DECISION 10 (on-device lingering accepted) needs nothing: the data stays in
`window.localStorage` under `ta-` keys via `rubric-memory.ts:54-61`, exactly as
accepted, and no code path sends it anywhere.

---

## 8. Ceilings and budgets, measured at `8a977b1`

Counts from `git show 8a977b1:<path> | wc -l`; current-tree counts cross-checked
with `@(Get-Content <path>).Count` and both counters agree on every file below.

| File | Gate (8.2) | At `8a977b1` | Verdict |
|---|---|---|---|
| `src/lib/grade/engine.ts` | `-le 520` | 517 | pass |
| `src/lib/grade/types.ts` | `-le 430` | 415 | pass |
| `src/app/components/GradingTab.tsx` | `-le 560` | 557 | pass |
| `src/app/components/CartridgeDropPanel.tsx` | `-le 600` | 600 | pass, by zero |
| `src/lib/grading-drafts.ts` | `-le 400` | 377 | pass |
| `src/lib/github-grading-run-store.ts` | `-le 530` | 515 | pass |
| `src/lib/grade-result-allowlist-coverage.test.ts` | `-le 380` | 386 | **over by 6** |
| `src/lib/research/rubric-bank.ts` | must not rise (120) | 120 | pass |

All seven created files are inside their stated budgets (157/137/20/37/65/21/125
against 250/350/120/150/300/150/200).

MINOR 1: the 386 overage is disclosed and argued in `8a977b1`'s own commit
message and I agree with the ruling - the alternative was weakening the one
instrument in this wave that provably fails. Recorded here so the number is not
re-discovered as a surprise.

MINOR 2: `GradingTab.tsx` is **566** today (`@(Get-Content).Count`), past wave
2's `-le 560`, from wave 5's additions in `775f26b`. No gate in 8.2 or 8.5 now
bounds it, and the only backstop is the repo-wide 1000. Worth a line in whatever
wave touches it next; not a wave-2 defect.

MINOR 3: RES-N15-4's repointed block takes `stripped.indexOf("<input")` over the
whole directory's combined source (`snapshot-grading.structure.test.ts:903`) and
`stripped.indexOf('component="label"')` likewise (`:917`). Today exactly one
non-test file in the directory has either
(`grep -rn 'type="file"' src/app/components/snapshot-grading/` -> one hit at
`SnapshotCaptureSection.tsx:106`; canary `type="fileZZZ"` exit 1), so it binds
correctly. It will bind to the wrong element the first time another file in that
directory gains an `<input` or a `component="label"`. The block's own onChange
assertions re-anchor from `type="file"` so the load-bearing half survives; the
`component="label"` + `role={undefined}` proximity check does not.

---

## 9. The weakest requirement

**W2-3.** It is the one clause that was implemented exactly as written and still
produces a bad result. The plan told the implementer to build a removal test
whose sabotage is "make `describeRunRubricProvenance` read the CURRENT store".
The implementer built a file that names that sabotage, explains it, and asserts
something else. Every reviewer downstream then sees a `describe` block literally
titled "W2-3: the removal test" and counts it as the leverage claim's proof. The
requirement's wording made the sabotage sound self-evidently checkable in a
module that, in a node-environment suite with no `window`, cannot observe a
store at all. A clause that had said "the removal test must be RUN against the
sabotaged implementation and its RED output pasted into the wave report" would
have caught it, because the red output does not exist.

---

## 10. Gate and instrument hygiene of this check

- Every multi-path run used `npm run test:paths --`; every single-path run used
  `npx vitest run <one path>`. No raw multi-path `vitest run` was issued, so no
  argument could be silently dropped.
- Every absence claim above is paired with a canary on the same instrument, and
  no exit status was read through `cat` or `head`. One early attempt did read
  `head`'s status instead of `grep`'s and was re-run correctly; the corrected
  command and both exits are the ones quoted (section 3(b)).
- `npx tsc --noEmit --incremental false` was used rather than plain `tsc`, so no
  `tsconfig.tsbuildinfo` was written and the one-caller rule was not violated
  while sibling agents were running.
- Every sabotage was restored from a `cp` backup outside the repo. No
  `git stash`, no `git checkout --`.

---

## Findings, by severity

**BLOCKER**

1. W2-3, the leverage claim's removal test, cannot fail against the sabotage its
   own comment names. Proven green, exit 0.
   Class: **the instrument reports on something adjacent to its claim** -
   **REPEAT-OF** the W2-5 class recorded in `b506b35` / `a18abcf`.
2. The claimed mechanism is deletable with wave 2's entire 29-argument gate
   green (734 tests, exit 0).
   Class: same - **REPEAT-OF "the instrument reports on something adjacent to its
   claim"**. Not relabelled; one corrective rule fixes both.
3. Two repointed extraction anchors left the panel-to-leaf seam unasserted: the
   auto-grade checkbox can be disconnected and the Read button made dead, both
   with every panel reader green, exit 0.
   Class: **an extraction splits an anchor's subject and leaves the new seam
   unasserted** - **NEW**.

**MAJOR**

1. `gradingApiToRun` and `gradeEntriesEmbedded` render runs with no provenance;
   the claim holds on one of three provider paths, unmeasured on two.
2. The "structural" half of the claim is unenforced - no test pins the `Pick`
   signature or the mount, and the `Pick` type accepts a store-derived literal.
   Proven: a one-line change routes the live store-restored rubric into the
   rendered line, 54 tests green.
3. "Adding a 19th field to the type ALONE fails loudly" is false; there is no
   row-level exhaustiveness guard (exit 1, canary exit 0) and `toWire` is an
   explicit literal. The codec's own header already says so.
4. DECISION 9's transition trigger, as recorded at both key definitions, is
   already satisfied (75 distinct `ta-` keys measured in that directory) and its
   residual's instrument returns 88, not the 2 it claims to have established.

**MINOR**

1. `grade-result-allowlist-coverage.test.ts` at 386 against `-le 380` - ruled
   and disclosed; agreed.
2. `GradingTab.tsx` at 566, past wave 2's `-le 560`, from wave 5; unbounded now.
3. RES-N15-4's directory-wide `indexOf("<input")` and `component="label"`
   anchors will bind to the wrong element as soon as a second file in that
   directory grows one.

---

## Stopping point

**Measurement**, then **rulings**.

*Measurement* first, because it is not capped and it is what everything above
turns on: the three assertions this row needs do not exist yet and none of them
is an argument.

1. An executing assertion that grading produces the pair - one test calling
   `gradeEntries` with a mocked provider and asserting `run.rubricFingerprint`
   equals `rubricFingerprint(rubric)`. This is the one that makes BLOCKER 2
   impossible, and it must be sabotage-proven by deleting a stamp site.
2. A real W2-3: stub `window`/`localStorage` in `rubricProvenance.test.ts` the
   way `rubric-memory.test.ts:33-45` already does, write a different rubric into
   the store, and assert the reported fingerprint is unchanged - then confirm it
   goes RED against the store-reading implementation quoted in section 1.
3. Two hand-off assertions for the extraction seam, one per direction, each
   sabotage-proven.

*Rulings*, because two of these are decisions no seat can take:

- **MAJOR 1 is a scope call.** Stamping the two non-Gemini producers is a small
  change in files outside wave 2's write set; rendering nothing on those paths
  may also be an acceptable, stated limit. Either is defensible; silently
  shipping a claim that holds on one of three paths is not. This is
  `iteration-caps.md` disposal (b).
- **MAJOR 4 needs a trigger the orchestrator will actually honour.** The source
  comment and the residual say different things, and the residual's instrument
  does not produce its own baseline. Pick one form, put it where an editor sees
  it, and name a command that counts the right set.

**For the owner**, one item only, and it is MAJOR 3 crossed with DECISION 4:
the decision record asserts that the 18-key assertions are "the only place a
forgotten cohort field fails loudly". They are not, and no instrument in this
repo catches that case for `SnapshotAssessmentRow`. The owner accepted the
digest on the strength of that stated safety net. Whether to build the missing
`Exclude<keyof SnapshotAssessmentRow, ...>` guard (wave 2 shows it is about
three lines) or to correct the sentence and accept the gap is a product call,
not a round.

Nothing here asks for another argument round. Every finding above is closable by
a test that either passes or fails.
