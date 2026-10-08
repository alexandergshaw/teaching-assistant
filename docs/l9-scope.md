# L9 scope (revision 4) - source-scanning tests satisfied by commented-out code, re-scoped after A42 landed

Seat: loop-seat, 2026-10-04. Recon and recommendation only: no production or test
file was edited and no tree mutation was run. Write set of this pass: exactly
`docs/l9-scope.md` (revision 3, 761 lines, is preserved in git at `b6df049c`;
`wc -l` on the prior file before overwrite).

Inputs opened: `docs/DEV_LOOP.md`, the L9 row (`docs/backlog.yml:295-306`), the A42
row (`docs/backlog.yml:727-742`), the prior `docs/l9-scope.md` (sections 0, 4, 5, 7,
8, 10, 11), `docs/l9-wave1-classification.md` (sections 3.5-3.9, 4, 6, 8),
`docs/a42-census-scope.md` (sections 5, 9, 11), `docs/a42-w2-test-notes.md:523-540`,
`docs/loop/this-repo.md` section 1 and the gate table, and every source file cited
below.

---

## 0. Answer first

**Recommendation: MINIMAL-TARGETED-FIX, then close L9. Do not run the rev-3 waves 2a,
3 or 4 as sweeps. Fold nothing new into R-W2-1; L9 hands its one overlapping item to it.**

- L9 as filed has three axes. After A42 and L9's own landed work (`61252607`,
  `712aa42b`, `b53faa6d`, `89980daf`, `01b2f30d`, `2a924ef5`), two are closed or
  owned elsewhere and ONE is genuinely distinct and still live: a PRESENCE scanner
  that reads RAW source and is satisfied by a comment. Exactly **one** such
  live-armed instance exists at HEAD among the places I probed
  (`steps.grading-draft-flow.ts`, via `grade-result-doors.wiring.test.ts`).
- The cheapest change that closes the real defect is a two-file test edit (F1) plus an
  optional one-bullet trap-card entry (F2). It needs no new helper, no ratchet, no
  census.
- The row's original premise ("an ABSENCE assertion must NOT strip comments") does not
  hold, and was already withdrawn by Ruling 72 in rev 3; this pass adds the
  post-A42 measurements that confirm it (section 3).

**Terminating question for the orchestrator (every answer ends the activity):** L9
closes as F1+F2 (recommended), or as F1+F2 plus the rev-3 coverage ratchet (Wave 3).
The ratchet is the only item this pass withdraws that someone could still want;
reasons in section 4. Whichever is chosen, L9 ships as stated with the rest recorded
in the section 6 residuals.

---

## 1. Census at HEAD, every number with its command

Run from the repo root, `bash`, 2026-10-04. Canary: `grep -rlF 'ZZCANARYNONEXISTENT9' src | wc -l` returned `0`
(the tool distinguishes presence from absence; `grep -P` was not used).

| Quantity | Command | Value |
|---|---|---|
| test files that call `readFileSync` | `grep -rl readFileSync src --include=*.test.ts \| wc -l` | 253 |
| test files mentioning the word `stripComments` | `grep -rl stripComments --include=*.test.ts src \| wc -l` | 87 |
| files (any `.ts`/`.tsx`) spelling the `[\s\S]*?\*\/` block regex | `grep -rlF '[\s\S]*?\*\/' src --include=*.ts --include=*.tsx \| wc -l` | 99 (all test files; none outside `*.test.ts`) |
| files importing the tokenizer module | `grep -rl "modalAdoptionSourceScan" src --include=*.ts \| wc -l` | 18 |
| of those, test files that read source (`comm -12` vs the readFileSync list) | `comm -12 T.txt R.txt \| wc -l` | 16 |
| regex strippers NOT on the tokenizer (`comm -23` of the 99 vs the 18) | `comm -23 A.txt T.txt \| wc -l` | 96 |
| `*.structure.test.ts` files | `find src -name "*.structure.test.ts" \| wc -l` | 39 |

Drift, stated plainly: the row cites 203 readFileSync files (2026-09-22) and
`docs/l9-scope.md` rev 3 cites 210 (2026-09-27, a python walk); the grep above is 253.
The row's own two instruments (grep vs PowerShell `Select-String`) were never
re-compared; I did not re-run the PowerShell form. The census is a moving floor and
cannot seed a frozen allowlist (section 4).

---

## 2. Classification of the scanners L9 is about

Three buckets, per the brief. "Overlap with A42" is measured, not asserted.

### (i) Fixed by A42 - converted to the string-aware tokenizer

16 test files that import `stripComments` from
`src/app/components/ui/modalAdoptionSourceScan.ts:155` (the tokenizer) and read
source. A42 W1 `ca8851ee` (pins) and W2 `431517ab` (conversion) plus the earlier
`28fcc63f`. The five W2 scanners are listed in
`src/tools/strip-comments-agreement.structure.test.ts:451-470` (EXCLUSIONS).
Three further files still spell the block regex but are not source scanners of the
trigger class: `page-module-css-classes.test.ts:129,365`,
`page-module-css-orphan-classes.test.ts:87,112,334` (CSS-text strips, A42 census
R-3, `docs/a42-census-scope.md:594`) and `buttonVariant.test.ts:94` (reads
`buttonVariant.ts` only, which has no `accept=` attribute).
This bucket is A42's axis (string-UNAWARE strip). It is not L9 and L9 does not touch it.

### (ii) Covered by A42's R-W2-1 - the other regex strippers

`docs/a42-w2-test-notes.md:525` R-W2-1 ("The 97 other `[\s\S]` block-regex strippers",
owner a later A42 R2 widening, step: "the chunk that edits any of them, or an explicit
W3"). Today that population is **96** (section 1, `comm -23`). This is also L9's
rev-3 "97 files that already strip" population: the same files, audited from the
other axis.

Both axes were measured already and neither is live:

- A42 axis (strip is string-unaware): `docs/a42-census-scope.md:346-362` traced every
  reader of the 21 corruptible files with a runtime read trace plus decision replay:
  "none produced a wrong verdict today". `docs/a42-census-scope.md:552-556`
  records the residual honestly (a route the trace cannot see: `readFile`, streams).
- L9 axis (strip in the wrong direction): `docs/l9-wave1-classification.md:475-498`
  measured 0 assertions on a stripped subject whose expected value targets a comment,
  with a discriminating detector (3 synthetic controls fire; 4 raw-subject hits in
  the 97; 1 real file-content instance in the sibling corpus). Bounded claim at
  `:500-504`.

So (ii) is one population with one owner; L9 adds no work to it. Recommendation:
HAND OVER, do not duplicate (section 5, D8).

### (iii) Genuinely distinct L9 - PRESENCE direction on RAW text (no stripper at all)

This is the only axis A42 cannot reach: an assertion that something IS present in
code, over text that was never stripped. Probes run this pass (scratchpad scripts,
`node --experimental-strip-types`, the tokenizer `stripComments` imported from
`modalAdoptionSourceScan.ts`, each with a canary):

| Scanner | What was measured | Result | Verdict |
|---|---|---|---|
| `src/lib/grade/grade-result-doors.wiring.test.ts:78-80` `referencesUngradedFlag`, applied at `:141` to raw `fileSources` (`:100`) | 9 caller/builder pairs over `src/` (the test's own `DOOR_BUILDER_NAMES`, `:45`), the CURRENT predicate on raw vs tokenizer-stripped source | 8 of 9 true on code; **`src/lib/workflows/registry/steps.grading-draft-flow.ts` for `postCanvasGradesAction`: raw true, code FALSE** (satisfied only by the comment at `:598-601`) | **LIVE-ARMED. F1.** |
| `src/app/actions/action-guard-coverage.test.ts:122-135`, `GUARD_CALL` (`:61`) on raw export bodies | 103 use-server modules, 504 exported actions: guard match raw vs stripped | 475 guarded raw = 475 code; `requireAppOwner` 105 = 105; 0 differ; canary (a comment-only guard fixture) reads true raw / false stripped | Clean today. No change. |
| `src/lib/canvas-client-boundary.test.ts:132-181` `findClientUnsafeBarrelImports` (rev-3 Wave 2a candidate) | the real `^import ... from "@/lib/canvas(-modules)?"` pattern, raw vs stripped, over all non-test `src` | 118 raw hits = 118 code hits; 0 block-commented; canary (`/* import ... */` fixture) true raw / false stripped | Dormant, and the failure direction is a loud false RED, never a false pass. WONT-DO. |
| the remaining undefended presence scanners (99 by wave 1, section 4.2 of the classification) | not probed | unknown | Residual RR1, triggered not scheduled |

Why F1 is a test-instrument defect and not a product defect: the file does handle
the ungraded case in real code (`gradedResults`/`ungradedResults` imported at
`steps.grading-draft-flow.ts:20` and called at `:296-297`; the guard comment at
`:598-601` describes a `typeof userId` gate). The predicate only recognises the
words `ungraded` and `isUngraded` (`\bungraded\b` does not match `ungradedResults`),
so the one place it can see is the comment. The test passes for the wrong reason and
would stay green if lines 20, 296 and 297 were deleted. The row's earlier second
instance, `useRepoGradesGradingActions.ts`, now passes on code (probe: raw true,
code true), i.e. already repaired.

---

## 3. Should absence assertions strip? Per assertion class

The row's rule ("an assertion that something is ABSENT must NOT strip") is
withdrawn, on measurements:

- Code-behaviour absence ("never imports X", "no argument-less `new Date()`",
  `docs/l9-wave1-classification.md:408-409`): stripping is CORRECT. A commented-out
  forbidden call is inert; failing on it is a false positive that teaches authors to
  delete useful history. No measured instance in the corpus has a forbidden token
  that is both commented out and one step from live.
- File-content absence/presence (byte scanners, line ceilings, Markdown corpora, the
  authorized emoji exception): must NOT strip. Verified they do not:
  `grep -c stripComments src/lib/no-emojis.test.ts` returns `0`, and the same for
  `src/source-bytes.structure.test.ts`. The full list is
  `docs/l9-wave1-classification.md:363-387`; the three real mixed subjects were
  already split at `b53faa6d`.
- "One uncomment away" is the only argument for no-strip-on-absence, and it has no
  evidence behind it in this tree; the cost of acting on it (making commented-out
  history fail) is a broad false-red population.

So there is no "no-strip-for-absence" change to make anywhere. Absence handling is
already per-subject (Ruling 72) and correct as shipped.

---

## 4. F1, F2, and what is withdrawn

### F1 - the one fix (write set: two test files)

1. `src/lib/grade/grade-result-doors.wiring.test.ts` (148 lines, `wc -l`):
   - import `stripComments` from `@/app/components/ui/modalAdoptionSourceScan`
     (precedent: `buttonVariant.test.ts:27`; a non-test module, so the no cross-test
     import rule does not apply).
   - `:100` store `stripComments(fs.readFileSync(file, "utf8"))`. Cost measured: the
     tokenizer over all 1676 non-test `src` files, 19462700 bytes, took 502 ms
     (`time.mts`, scratchpad), so eager stripping is well inside the file's 30000 ms
     timeout (`:41`).
   - `:78-80` widen the predicate to also accept `ungradedResults` and
     `gradedResults` (both are real filters that keep ungraded rows out); state in the
     comment that the scanned text is comment-stripped and why (cite F1's instance).
     Effect measured: with the widened predicate on stripped code all 9 pairs are
     true, and every builder keeps at least one caller
     (`postCanvasGradesAction` 3 on code: GradingResults.tsx,
     useRepoGradesGradingActions.ts, steps.grading-draft-flow.ts;
     `repoGradesPosting.ts` drops out as a comment-only mention, which is correct).
   - `:82-94` canaries: add a comment-only fixture that must read false after
     `stripComments`, and `ungradedResults(rows)` that must read true.
2. `src/tools/strip-comments-agreement.structure.test.ts` (956 lines): add ONE
   `EXCLUSIONS` entry for the doors test in the A42 style. Required, not optional:
   that file's enumeration test (`:515-545`) fails repo-wide for any test file that
   mentions the literal `stripComments` and is unclassified, including
   `ALL_DEFINED.length + Object.keys(EXCLUSIONS).length === mentioning.length`
   (`:544`). Ceiling: 956 + about 2 lines is under 1000
   (`src/file-size-ceiling.structure.test.ts:41`).

Pass conditions, each naming object, instrument, direction:

- P1 object: every stripped caller of each of the four builders. Instrument:
  `npm run test:paths -- src/lib/grade/grade-result-doors.wiring.test.ts` (read from
  `Test Files N passed`, exit code taken directly, not through a pipe). Fails (red)
  if any caller has no code-level ungraded reference.
- P2 non-vacuity, in this order, with a `cp` backup and NO `git stash`/`git checkout --`
  (`docs/loop/` sabotage rule; one agent at a time on the tree):
  a. BEFORE the fix, comment out `steps.grading-draft-flow.ts` lines 20, 296, 297,
     run the OLD doors test: expect GREEN (proves the defect was armed).
  b. AFTER the fix, repeat the same mutation: expect EXACTLY ONE failure, the
     `every caller of postCanvasGradesAction also references the ungraded flag` test.
  c. Restore from the backup, re-run: green again. Record the verbatim red output.
- P3 object: the enumeration equation at `strip-comments-agreement.structure.test.ts:544`.
  Instrument: `npm run test:paths -- src/lib/grade/grade-result-doors.wiring.test.ts src/tools/strip-comments-agreement.structure.test.ts src/file-size-ceiling.structure.test.ts src/source-bytes.structure.test.ts src/lib/no-emojis.test.ts`.
  Fails if the doors test is unclassified, over 1000 lines, or introduces an emoji or
  non-text byte.
- Gate otherwise: `npx tsc --noEmit` (one caller only), `npm run lint` exit 0 with no
  NEW warning in the two written files, per `docs/loop/this-repo.md` section 1.

Cost: one Sonnet implementer dispatch, two files, about 15 lines net, one sabotage
cycle. No token measurement exists for the alternatives; the comparison is by touched
surface (2 files versus up to 99 files and 510 subjects).

### F2 - one trap-card bullet (optional, docs only, shared file)

Add one bullet to `docs/loop/traps-tests.md` (105 lines): a presence assertion over
raw source is satisfied by a comment; for a code-behaviour subject strip with the
tokenizer imported from `modalAdoptionSourceScan.ts` (never a hand-rolled regex) and
classify the file in `strip-comments-agreement.structure.test.ts` EXCLUSIONS; leave
file-content subjects raw; instance: F1. This is the class-level prevention at zero
census cost. It is a shared file (`docs/loop/traps-tests.md` is also named at
`src/tools/vitest-paths/gate-commands.structure.test.ts:284`, which scans it for raw
multi-path commands), so run a disjointness check against other `docs/loop` editors
first (`git status --short docs/loop` was empty at this pass) and add
`src/tools/vitest-paths/gate-commands.structure.test.ts` to the wrapper line.

### Withdrawn, with reasons

- **Wave 3 coverage ratchet.** A name-level census seeded from a proxy that
  `docs/l9-wave1-classification.md:716-727` shows is wrong five ways; its own
  construction needs six steps and still cannot see split subjects or M-SLICE
  (`:777-785`); and it freezes a number that read 203, 210 and 253 on three dates in twelve days (three different instruments, so the drift is a floor, not a rate).
  It would also bless files whose stripper runs but is wrong (rev-3 R7). Cost high,
  yield measured at one live instance.
- **Wave 2a canvas-client-boundary block-comment awareness.** Section 2 (iii):
  118/118, 0 block-commented, false-red direction only.
- **Wave 2a bulk per-assertion check of the 78 absence-asserting files, and Wave 4's
  sweep canaries.** Wave 1 measured the wrong-direction count at 0; section 3.
- **Wave 4 as a protocol.** KEPT only as P2 above for F1.

---

## 5. Disposition table (prior requirements, each by location)

Prior = rev 3 at `b6df049c` (section/ID) plus `docs/l9-wave1-classification.md`
residuals.

| # | Prior requirement | Disposition |
|---|---|---|
| D1 | Rev3 W1 triage (three-part write set) | KEPT as DONE: `2a924ef5`, `b53faa6d`, `712aa42b`, `89980daf`, `01b2f30d` (row note, `docs/backlog.yml:305`) |
| D2 | Rev3 W2a canvas-client-boundary `/* */` awareness (absorbed rev3 R2) | WITHDRAWN: dormant, 118/118 probe, false-red only; no enforcer lost (its fixtures at `canvas-client-boundary.test.ts:203-277` stay) |
| D3 | Rev3 W2a bulk subject-based fix of absence scanners | WITHDRAWN: wave 1 measured 0 wrong-direction (`l9-wave1-classification.md:483`); Ruling 72 already says strip code-behaviour |
| D4 | Rev3 W2b doors test plus `steps.grading-draft-flow.ts`, predicate decision | KEPT as F1 (decision made: widen to `ungradedResults`/`gradedResults`, section 4) |
| D5 | Rev3 W3 ratchet (Ruling 74 gate) | WITHDRAWN pending the section 0 question; protected nothing executing |
| D6 | Rev3 W4 / section 6 sabotage protocol (8 steps, concurrency clause) | KEPT, narrowed to F1's P2 |
| D7 | Ruling 72 (classify by subject) | KEPT, section 3 |
| D8 | Rev3 R5 / wave1 R5 (the 97/930 subjects not positively classified) | HANDED to A42 R-W2-1 (`docs/a42-w2-test-notes.md:525`); obligation: positive subject classification of the 96 on the step "the chunk that edits any of them" |
| D9 | Wave1 R4 (`page-module-css-orphan-classes.test.ts` reads `docs/`, unadjudicated) | HANDED to A42 census R-3 (`docs/a42-census-scope.md:594`); obligation: adjudicate once `docs/css-orphans.md` is settled (`git status --short` still shows it modified today) |
| D10 | Wave1 R6 A6/A7 (`runtime-import-graph.test.ts` scan/trails, depends on the production resolver's comment handling) | KEPT as RR2 below |
| D11 | Wave1 R6 A1-A5 (exact-set key scans, module-boundary rule) | WITHDRAWN: failure direction is red either way; no instance found; no enforcer protected |
| D12 | Wave1 R1-B, R3-B, R3-SQL (instrument holes in the scratch census) | WITHDRAWN with the census/ratchet they served (D5) |
| D13 | Wave1 R7 (`modalAdoptionScan.ts` trailing-comment blindness) | CLOSED: `712aa42b` |
| D14 | Rev3 R5/R8, wave1 R9 (stale prose and state in `docs/backlog.yml` L9 row) | KEPT as RR3; the row still reads `state: 'unscoped'` and still states the withdrawn binary rule at `docs/backlog.yml:305` |
| D15 | Rev3 R6 (sibling-branch breakage) | WITHDRAWN: F1 touches two test files; the standard regression pass covers it |
| D16 | Rev3 R7 (ratchet is name-level) | WITHDRAWN with D5 |
| D17 | Ruling 73 (L9 and A42 stay separate) | KEPT and now trivially satisfied: the only shared item is R-W2-1, which A42 owns |
| D18 | Rev3 leverage section (no claim, chore on the loop's own instruments) | KEPT unchanged; F1/F2 change no code a user reaches |

---

## 6. Residual register (owner, instrument, step)

| # | Not proven now | Owner | Instrument | Object / direction of failure | Step |
|---|---|---|---|---|---|
| RR1 | Whether other undefended presence scanners among the 99 are satisfied only by comments (rev-3 "R4"). Two of the highest-value were probed (504 guards, 118 barrel imports); the rest were not | `loop-test-author` | The F1 probe shape: for the scanner's own predicate, count raw-pass versus tokenizer-stripped-fail on its real target, with a comment-only fixture canary | The scanner's real target; a raw-pass/code-fail pair is a live-armed instance (red direction after the fix) | The next chunk that edits any scanning test among the gap or adds a presence scanner, if F2 did not already steer it. Triggered, not scheduled |
| RR2 | Whether `src/lib/module-graph/runtime-import-graph.ts` already excludes commented-out imports, which decides `runtime-import-graph.test.ts:310,313,689,690` | whoever next edits that module or test | Read its tokenizer/resolver comment handling; run a comment-only import fixture | The graph the PAT-guard closure depends on; a commented import counted as an edge | Next edit of that module or its test |
| RR3 | `docs/backlog.yml` L9 row is stale: `state: 'unscoped'`, `owns: []`, withdrawn binary rule in the note | orchestrator | `npm run backlog:render` then `npm run backlog:check-generated`; set `owns` to the F1 paths | the L9 row; a later session designs against stale prose | The disposal commit for this scope |
| RR4 | The R-W2-1 population (96) is not proven free of a wrong verdict through a read route the A42 trace cannot see (`readFile`, streams, `ts.sys`) | A42 R2 widening (existing owner) | A42's AST enumeration plus read map | the 96 regex strippers; wrong verdict from a corrupted span | The chunk that edits any of them, or A42 W3 |
| RR5 | Not verifiable here: any rendered behaviour (no component is rendered by any test, `docs/loop/this-repo.md` section 2); the PowerShell versus grep census disagreement was not re-compared | owner / next census | `Get-ChildItem ... Select-String` form | census only | Whenever a census is next re-run |

---

## 7. Final gate for this pass

Wrapper line run before writing (all green, EXIT 0, baseline for the F1 files):

```
npm run test:paths -- src/lib/grade/grade-result-doors.wiring.test.ts src/tools/strip-comments-agreement.structure.test.ts src/lib/canvas-client-boundary.test.ts
Test Files  3 passed (3)
     Tests  46 passed (46)
COVERED src/lib/grade/grade-result-doors.wiring.test.ts files=1 passed=7
COVERED src/tools/strip-comments-agreement.structure.test.ts files=1 passed=24
COVERED src/lib/canvas-client-boundary.test.ts files=1 passed=15
```

Negative control observed: the wrapper refuses a nonexistent path
(`PRE-CHECK FAILED ... does not exist on disk`), so it does not drop unmatched paths.

Not run in this pass: `npx tsc --noEmit` and `npm run lint` (no code was written).
Not determinable here: rendered behaviour and the census-instrument disagreement
(RR5).

Post-write structural gates (this file is inside both gates' scan population):

```
npm run test:paths -- src/lib/no-emojis.test.ts src/source-bytes.structure.test.ts
Test Files  2 passed (2)
     Tests  21 passed (21)
```

`git status --short` filtered to `l9|src` after writing: ` M docs/l9-scope.md` only.
