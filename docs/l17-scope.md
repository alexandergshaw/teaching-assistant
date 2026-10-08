# L17 scope - do the GradeResult / GradingRun guards adopt the derived-key idiom?

Seat: loop-seat (scope / recon only). Recon at HEAD 48c794de on 2026-10-04. Read-only: no `src/` file was edited, no
`tsc` was run on the real tree (single-caller rule, `docs/loop/this-repo.md:148-151`, and the A42 sibling is live).
Every quantity below names its command or `file:line`; anything NOT measured on the real tree is labelled TOY or
READING.

## 0. Recommendation, up front

**MIXED: do ONE cheap fix and CLOSE the rest WONT-DO with the weakness recorded at the guard.** Do not adopt the
derived-from-serializer form for the five older serializers.

| Part | Decision | Cost |
|---|---|---|
| F2: `keyof GradeResult` at `grade-result-allowlist-coverage.test.ts:74` is the union-intersection form and silently misses a field added to ONE member only | DO, one line, same file | test file only |
| F1: type gate satisfiable by bumping the maintained array (the row's complaint) | CLOSE WONT-DO + record the weakness at the guard (comment, section 5) | comment only |
| Adopt `ReturnType<typeof serializer>` derivation on 5 serializers | NOT recommended now; priced in section 6 so the owner can overrule | 3 production files + 1 test redesign |

Confidence: moderate. What would flip it to "adopt": any evidence of a field dropped by an out-of-loop edit, or an
owner wish that tsc alone (the only push-time gate) enforce serializer coverage. That is a product-of-process call, so
section 7 puts it to the owner as a question whose every answer terminates.

## 1. Corrections to the brief (read these first)

1. **The shipped precedent is not a unique-symbol-key idiom.** It derives the key set from the function's inferred
   return type: `export type SnapshotRowWireShape = ReturnType<typeof toWire>`
   (`src/app/components/snapshot-grading/snapshot-row-serialization.ts:145`), with `toWire` declared WITHOUT a return
   annotation (`:56`, command: `grep -n "function toWire" <file>`). The guard is
   `Exclude<keyof SnapshotAssessmentRow, keyof AssessmentRowCore | keyof SnapshotRowWireShape>` at
   `snapshot-row-serialization.test.ts:33`.
2. **The unique-symbol fact is a reason the ARRAY form could not be used there, not the idiom itself.**
   `AssessmentRowCore` carries `declare const NOT_POSTABLE: unique symbol` (`assessment-row.ts:45`; test comment
   `snapshot-row-serialization.test.ts:14-19`).
3. **Neither older type has a private unique-symbol key.** Command: `grep -rn "unique symbol" src --include=*.ts*`
   returns exactly three lines: `assessment-row.ts:45`, `src/lib/grade/types.ts:342`, and the test comment. The
   `types.ts:342` symbol (`STAMPED_RUBRIC_PROVENANCE_BRAND`) is the key of the VALUE type `StampedRubricText`
   (`types.ts:343-345`), used as the value type of `GradingRun.rubricUsed/rubricFingerprint` (`:366-367`); it is not a
   key of `GradingRun` or `GradeResult`. So the row note's "check whether either older type has the same property"
   (backlog.yml:293) answers NO by grep. (Not confirmed by running tsc at HEAD; the existing array guard compiling is
   the corroboration - `docs/a39-build-check.md:323-326` records it compiling clean at 2b5b4c77-era and failing only
   when a field was added.)

## 2. The two older guards (located)

Both live in one file, `src/lib/grade-result-allowlist-coverage.test.ts` (389 lines, command:
`wc -l`; 4 commits in its history, `git log --oneline --follow -- <file> | wc -l`).

| Guard | Maintained array | Type assertion | Hand-listed names |
|---|---|---|---|
| GradeResult | `ALL_GRADE_RESULT_FIELDS` `:49-67` | `MissingFields = Exclude<keyof GradeResult, (typeof ALL_GRADE_RESULT_FIELDS)[number]>` `:74`, asserted `:76` | 17 |
| GradingRun | `ALL_GRADING_RUN_FIELDS` `:308-316` | `MissingRunFields = Exclude<keyof GradingRun, ...>` `:318`, asserted `:320` | 7 |
| (third, outcome descriptor) | `ALL_UNGRADED_OUTCOME_FIELDS` `:87-94` | `:95-102`, uses `keyof A \| keyof B` (union OF keyofs) | 6 |

The row names two types; there is a third array of the same shape. It is not a GradeResult/GradingRun serializer
guard (it covers `NotAttemptedOutcome | GradingFailedOutcome`, `types.ts:162-172`) and it is already written in the
distributive-safe form (`:81-83` explains why). Out of L17 scope unless the owner wants uniformity; flagged so the
count is honest (the row says "two", the file has three).

Serializers the arrays are meant to cover (all hand-enumerated literals, none spreads `...result`):

| Serializer | Type covered | Location | Return annotation | Branches |
|---|---|---|---|---|
| `stripGradeResultForDraft` | GradeResult | `src/lib/workflows/grading-review-rows.ts:40` (literal `:47-82`, returns `:83-86`) | `: GradeResult` | 2 |
| `coerceGradeResult` | GradeResult | `src/lib/grading-drafts.ts:94` (literal `:110-147`, returns `:155-159`) | `: GradeResult \| null` | 2 + null |
| `parseGradeResult` | GradeResult | `src/lib/github-grading-run-store.ts:183` (literal `:242-259`, returns `:265-268`) | `: GradeResult \| null` | 2 + null |
| `coerceGradingRun` | GradingRun | `src/lib/grading-drafts.ts:162` (literal `:168-191`) | `: GradingRun \| null` | 1 |
| `parseGradingRun` | GradingRun | `src/lib/github-grading-run-store.ts:271` (literal `:302-310`) | `: GradingRun \| null` | 1 |

`stripGradingRunForDraft` is NOT an allowlist: it spreads `{ ...run, results: ... }`
(`grading-review-rows.ts:90-92`), so a new GradingRun field survives it. `serializeGithubGradingRun`
(`github-grading-run-store.ts:91-124`) reuses the strip plus a spread, also not an allowlist. Only 4 of the 5 are
private functions (`strip...` is exported); the other four are reached in tests through
`coerceGradingDraftPayload`, `serializeGithubGradingRun` / `parseStoredGithubGradingRun`.

## 3. Are they robust? Findings

### F1 - the type gate is satisfiable by bumping the array (the row's own claim): CONFIRMED, but narrower than the row implies

Mechanism (READING, then TOY): all five serializers carry an explicit return annotation. For a REQUIRED new field,
omitting it from the literal is already a tsc error AT the serializer. TOY, `probe3.ts` (scratchpad):
`node node_modules/typescript/bin/tsc --noEmit --strict --target es2022 probe3.ts` -> exit 2, `TS2322 ... is missing
the following properties from type 'Ungraded': ungraded, newRequired`. So the maintained-array weakness bites only for
a new OPTIONAL field. Optional fields today: `codeExecution`, `gradedRepo`, `gradedRef`, `submissionTruncated`,
`determination` on the base (`types.ts:244,250,251,261,270`) and `speedGraderUrl`, `sampleAnswer`, `rubricUsed`,
`rubricFingerprint` on the run (`types.ts:353,356,366,367`). `submissionTruncated` - an optional field - is the field
the file's own header says was dropped once (`grade-result-allowlist-coverage.test.ts:7-9`).

TOY, `probe.ts`: type has `newOptional?`, array bumped to include it, annotated serializer never writes it ->
tsc reports ONLY the two derived-form lines (29, 30); the array-form assertion (line 12) and the annotated serializer
produce NO error. That is the measured gap: bump the array, touch no serializer, `tsc` green.

What catches it today is the runtime half: the sentinel must carry the field (`:203-217`), then the three round trips
must preserve it (`:227-300`, `:349-389`). Measured: `npx vitest run src/lib/grade-result-allowlist-coverage.test.ts`
-> `Test Files 1 passed (1)`, `Tests 10 passed (10)`, `Duration 1.27s`. The runtime half was sabotage-verified to fail:
`docs/a39-build-check.md:327-330` (deleting the `rubricUsed` line from `coerceGradingRun` -> `AssertionError ... was not
preserved by coerceGradingRun`, 1 failed / 9 passed).

The weakness is therefore REAL but gated by process: the pre-push gate runs lint + tsc + build and NO vitest
(`docs/loop/this-repo.md:30-40`), while every in-loop wave gate and verify runs vitest. The gap is exposed only to an
edit that never passes through `npm test` before push.

### F2 - NEW, not in the row: `keyof GradeResult` misses a field added to one union member only

`GradeResult = GradedResult | UngradedResult` (`types.ts:295`). `keyof` of a union is the INTERSECTION of the members'
keys. `MissingFields` at `:74` uses `keyof GradeResult`. The file already documents this exact trap for the outcome
union (`:81-83`, "silently drops a member-only field") and avoids it there (`:95-98`), but does not apply it at `:74`.
Today it is masked because both members declare the same two discriminator keys (`userId` `types.ts:278,291`;
`ungraded` `:279,292`) and everything else is on `GradeResultBase`. A field added to `GradedResult` or `UngradedResult`
alone is invisible to the guard.

TOY, `probe2.ts`: field on `Ungraded` only, array unchanged ->
`Exclude<keyof GR, ...>` form: NO error (line 8); distributive `T extends unknown ? keyof T : never` form: `TS2322 ...
["distributive missing", "onlyOnUngraded"]`, exit 2. Not run against the real types (see residual R1).

The same row-sized weakness does NOT apply to the run guard: `GradingRun` is a plain interface
(`types.ts:347`), not a union.

### What does NOT need changing

- The runtime half of both guards (sentinels + round trips) is correct and sabotage-verified (F1 above).
- `keyof` of the TOY derived-from-serializer form, used naively on a two-branch return, is a permanent false positive
  (`probe.ts` line 29: `["naive missing", ...]`) - the derived form needs the distributive helper too (section 6).

## 4. Why not just adopt the derived form (cost, measured by reading)

1. **The array has two jobs.** It is the type-level exhaustiveness list AND the runtime iteration list
   (`:204`, `:224`, `:343`, `:365`, `:385`; `RUN_FIELDS_TO_COMPARE` `:338`). The row says the maintained arrays "go away
   in the same change" (backlog.yml:287). They cannot simply go away: the runtime half needs a field list. Replacing it
   means re-deriving the list from the sentinels (e.g. `Object.keys` of both sentinels, sentinels retyped so a missing
   optional key is a type error) - a redesign of a 389-line test file whose runtime half is working. This repo's own
   record (memory: "Refactors disarm tests") says a consolidation of this kind risks turning a guard into a tautology.
2. **Five annotations dropped, four private functions get a type export.** `ReturnType` of an annotated function is the
   annotation (`GradeResult | null`), useless; the precedent works because `toWire` is unannotated
   (`snapshot-row-serialization.ts:56`). Adopting means removing the annotation on all five serializers (one exported,
   one crossing the localStorage boundary and one the drafts DB boundary) and re-asserting assignability another way,
   with caller ripple that only `npx tsc --noEmit` can show - and I did not run it. No `"use server"` / `"use client"`
   in the three production files (command: `grep -n "use server\|use client" <3 files>` exit 1), so a type export is
   legal there.
3. **Union branches.** The three GradeResult serializers return two object shapes (+ null). The derived key set needs
   `NonNullable<ReturnType<...>>` plus the distributive `AllKeys<T>` (TOY `probe.ts` lines 25-30); naive `keyof` is a
   permanent false positive.
4. **Benefit is gated by process (F1).** The runtime half already reds on the same defect in a 1.27 s file that every
   wave gate runs.

## 5. The minimal close, specified

Write set (all disjoint from `src/tools`): `src/lib/grade-result-allowlist-coverage.test.ts` ONLY. No new file, so no
directory canary is triggered.

1. **F2 fix** (one line family). Introduce a local helper above `:74` and use it at `:74`:
   `type AllKeys<T> = T extends unknown ? keyof T : never;` and
   `type MissingFields = Exclude<AllKeys<GradeResult>, (typeof ALL_GRADE_RESULT_FIELDS)[number]>;`
   Leave `:318` (`GradingRun`, not a union) and `:95` (already distributive-safe) untouched. The runtime half uses
   `keyof GradeResult` in `fieldsFor` (`:222-225`) and `ALL_GRADE_RESULT_FIELDS.filter` - unchanged.
2. **F1 record at the guard.** Amend the header comment `:12-17` (it currently says "Add a field to GradeResult
   without adding it here and `npx tsc --noEmit` fails", which is true but reads as full coverage). Add a paragraph,
   no emojis, stating: the type gate proves only that the array names every key; for a new OPTIONAL field bumping the
   array satisfies tsc without touching any serializer (required fields are caught at the serializer by its return
   annotation); the field reaching the serializers is enforced only by the runtime sentinel half, which the pre-push
   gate does not run (`docs/loop/this-repo.md:30-40`); contrast with
   `snapshot-row-serialization.ts:119-145`, which derives from the return type. Quote the real measured red/green
   outputs from step 3 below in that paragraph, not the toy ones.
3. **Real-tree sabotage (the proof the row demands, backlog.yml:293: "if the red output does not exist the instrument
   does not exist"):**
   - (a) BEFORE the F2 fix: with a `cp` backup of `src/lib/grade/types.ts`, add `probeOnlyOnUngraded?: string;` to
     `UngradedResult` only. `npx tsc --noEmit --incremental false` must exit 0 (proves the gap is real on the real
     types). Restore from the copy.
   - (b) AFTER the F2 fix: same mutation; `npx tsc --noEmit --incremental false` must exit nonzero with
     `src/lib/grade-result-allowlist-coverage.test.ts(<line>,7): error TS2322 ... "probeOnlyOnUngraded"`. Restore.
   - (c) F1 record: with the same backup discipline, add `probeOptional?: string` to `GradeResultBase`, add
     `"probeOptional"` to the array, touch nothing else: `tsc` must exit 0 (the measured weakness), and
     `npx vitest run src/lib/grade-result-allowlist-coverage.test.ts` must show the sentinel assertion failing
     (`... is missing field "probeOptional"`). Restore.
   - These mutate `src/lib/grade/types.ts`, which the just-landed grading wave and any live sibling in `src/lib/grade`
     may also touch; run only when `git status --short` shows nothing else under `src/lib/grade`, and as the SOLE
     `tsc` caller. Never `git checkout --` to restore (memory: sabotage restore needs a copy).
4. **Gate** (pass condition names object, instrument, direction):
   - Object: `src/lib/grade-result-allowlist-coverage.test.ts` at the built tree vs HEAD. Instrument: `npx tsc
     --noEmit` (no output, exit 0, `this-repo.md:25`). Fails if any output.
   - Object: the same file's runtime tests. Instrument: `npx vitest run src/lib/grade-result-allowlist-coverage.test.ts`
     (single path, so the raw command is allowed, `this-repo.md:52-57`). Must still read `Tests 10 passed (10)`; a
     different count means the edit changed a test.
   - If the verify spans more than that file, use `npm run test:paths <p1> <p2>` one path per argument and quote its
     per-argument COVERED lines. No such span is planned.
   - Structural canaries: `src/source-bytes.structure.test.ts` (no BOM/control bytes) and `src/lib/no-emojis.test.ts`
     (the edit adds a comment); run both by path via `npm run test:paths` if the verify runs more than one.

If the owner chooses WONT-DO for F2 as well, the comment in step 2 alone discharges the row per its own instrument
(backlog.yml:291, "or the weakness is recorded at the guard itself"). F2 is recommended because it is one line and the
file already knows the trap.

## 6. If the owner wants the derived adoption anyway (priced, not recommended)

One wave, all five serializers together (never one type only: that leaves two idioms in one file, which backlog.yml:287
forbids). Write set: `src/lib/workflows/grading-review-rows.ts`, `src/lib/grading-drafts.ts`,
`src/lib/github-grading-run-store.ts`, `src/lib/grade-result-allowlist-coverage.test.ts`. Steps: drop the five return
annotations; `export type XWireShape = NonNullable<ReturnType<typeof f>>` per function (as
`snapshot-row-serialization.ts:145`); guard `Exclude<AllKeys<GradeResult>, AllKeys<XWireShape>>` per GradeResult
serializer and `Exclude<keyof GradingRun, keyof XWireShape>` per run serializer; keep an assignability assert so a
serializer's output stays assignable to its public type; decide the array question (Object.keys of retyped sentinels vs
retain-for-runtime) in a test-author pass BEFORE any code. Verify gate adds a full `npx tsc --noEmit` (ripple on the
callers: `grep -rln "coerceGradingDraftPayload\|parseStoredGithubGradingRun\|serializeGithubGradingRun\|stripGradeResultForDraft" src`
lists 11 files, measured). Sabotage: the same two mutations as 5.3(a)/(c), expecting RED from tsc this time.

## 7. Question for the owner (every answer terminates the activity)

This activity produces one of two things; which do you want?

- **X (recommended): close L17 WONT-DO for the derived adoption**, ship F2 (one line) plus the recorded-weakness
  comment in `grade-result-allowlist-coverage.test.ts`. About a test-file-only change; leaves new-optional-field
  coverage at the pre-push gate to the runtime half, which that gate does not run.
- **Y: adopt the derived form** across the five serializers, one wave, section 6, with the array redesign decided
  first.

Either answer ends this scope. Neither reopens the other: X ships section 5; Y ships section 6 and section 5 step 3(a)
becomes its baseline.

## 8. Residual register

| # | Not proven now | Owner | Instrument | Step that measures it |
|---|---|---|---|---|
| R1 | F2 and F1 were shown on TOY mirrors (`probe.ts`, `probe2.ts`, `probe3.ts`), not on the real `GradeResult`/`GradingRun`. tsc was not run at HEAD on the real tree by this seat | build implementer, then verify seat | real-tree mutations in 5.3(a)(b)(c), outputs pasted | the build wave's verify, as the sole `tsc` caller |
| R2 | New-optional-field coverage at the PRE-PUSH gate stays with the runtime half (if X). A cheap closer exists but is a gate decision outside L17: add this 1.27 s test file to the pre-push fast canaries (`this-repo.md:39` already names that as the stronger option) | orchestrator (files a row if the owner wants it) | `npx vitest run src/lib/grade-result-allowlist-coverage.test.ts` duration (measured 1.27 s) against the pre-push budget | a new loop-maintenance row, not this one; no step exists yet - treat as RELOCATED, to be filed by the orchestrator at disposal |
| R3 | The third array `ALL_UNGRADED_OUTCOME_FIELDS` (`:87`) is outside the row's "two older types"; left as is | owner | none needed - it already uses the union-of-keyofs form (`:95-98`) | none; recorded so the "two guards" count in the row is corrected to three arrays |
| R4 | Whether dropping the five annotations (option Y only) ripples to callers | build implementer | `npx tsc --noEmit` on the built tree | Y's wave verify |

## 9. Housekeeping note

Scratchpad files `probe.ts`, `probe2.ts`, `probe3.ts` were written to this session's shared scratchpad directory; the
names collided with pre-existing scratch files from earlier tasks, which they overwrote. Scratch only; no repo file was
touched by this scope except this document.
