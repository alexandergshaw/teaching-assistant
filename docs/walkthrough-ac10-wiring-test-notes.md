# AC-10 W2-wiring structure-test notes (SMOOTH-WALKTHROUGH / R-AC10-WIRING)

Author: `loop-test-author` (Opus), 2026-10-04. These are NOTES; the implementer
writes the test code from them. A fresh `loop-checker` reads this file first.

## 0. What this closes, and why it exists

The W1+W2 walkthrough-announcement wiring shipped CORRECT in `ffaba04f`
(verified clean at `a4b8fbaf`) but with ZERO machine guard. AC-10 of
`docs/walkthrough-announcement-clicks-scope.md:442` was deferred from the
W0+W1 notes to "W2 test notes" that were never authored, because W1 and W2
merged into one push. The pure run-decision FUNCTIONS already have a frozen-
oracle unit test (`walkthrough-run-decisions.test.ts`, confirmed at HEAD:
`shouldAutoDraft` R0-R8, `isRunComplete` C0-C5, `courseToAutoSelect` A0-A9).
What is unguarded is the WIRING: the panel's call sites that feed those
functions and act on their results. A future edit that re-points the auto-draft
effect, drops a predicate argument, moves the extraction-window set after the
await, makes the fresh-run reset unconditional, or computes
`courseToAutoSelect` without consuming it would pass tsc, eslint and the whole
suite today. This instrument reds a gate on exactly those regressions.

AC-10's own direction-of-failure (`:442`): "RED if the effect calls `generate`
without the predicate." These notes widen that to the five wiring facts + three
call sites the verifier pinpointed, each as a discriminating pin with a named
mutant.

## 1. The instrument class, stated plainly (this repo's ceiling)

**SOURCE-TEXT STRUCTURE TEST. No pin may depend on mounting, rendering, focus,
keyboard, or runtime effect scheduling.** vitest here is node-env and collects
only `src/**/*.test.ts`; NO component is rendered. Every pin reads a production
file as a STRING and asserts a substring / regex presence, absence, or
character-ORDER fact on it. The runtime claims this cannot make -- that the
effect actually runs, that `generate()` actually drafts, that the ref ordering
holds under React's scheduler -- are reading claims and are listed as residuals
in section 7, not asserted here.

**Comments are stripped before every code-behaviour pin.** The production files
carry comments that name every identifier this test pins (e.g.
`Panel:593` "shouldAutoDraft requires an empty slot", `Panel:338` "Set
synchronously, BEFORE the await below", `Setup:71-74` "courseToAutoSelect never
changes a persisted choice"). An unstripped presence match could stay GREEN off
a comment while the code it names was sabotaged. Strip first and the bad state
cannot hide in a comment.

## 2. Write set, test-file decision, and the governance constraint

**EXTEND the existing `src/app/components/walkthrough-announcement/walkthrough-announcement.structure.test.ts`. Do NOT create a new test file.**

Three reasons, each load-bearing:

1. That file ALREADY imports and mentions `stripComments`
   (`walkthrough-announcement.structure.test.ts:5`,
   `import { stripComments } from "@/app/components/ui/modalAdoptionScan"`). It
   is therefore ALREADY classified by the
   `src/tools/strip-comments-agreement.structure.test.ts` governance gate, which
   enumerates every `*.test.ts` that mentions the literal `stripComments` and
   reddens the repo-wide gate until each such file is classified. A NEW test
   file mentioning `stripComments` would red that gate until someone classified
   it -- a governance burden this small hardening job must not incur. Adding
   describe blocks to the already-classified file changes nothing about that
   gate (it enumerates FILES, not occurrences).
2. The W2 wave write set in the scope lists "the structure test" as the file
   (`docs/walkthrough-announcement-clicks-scope.md:470`).
3. The file already reads these exact source files with this exact idiom
   (per-describe `fs.readFileSync` of the panel and the setup hook), so the new
   blocks drop in beside `G6` / `A18 AC-6` without new machinery.

**Reuse the file's existing `stripComments` import. Do NOT add a second import,
and do NOT author a new comment-strip helper** (the trap: never name a new
helper `stripComments`, never introduce the literal into a NEW test). The
helper is a correct character-level tokenizer (`modalAdoptionSourceScan.ts:155`:
strips `//` line comments INCLUDING trailing, `/* */` blocks, preserves string
and template contents, preserves `\n` so it is CRLF-safe), confirmed by read --
so "strip then match" is sound here and is NOT the trailing-comment-blind
anchored `/^[ \t]*\/\/.*$/gm` form the traps card forbids.

- **No new `ta-` key. The five-key canary stays 5.** This instrument adds no
  persisted key and must not touch
  `walkthrough-announcement.structure.test.ts:118-124`.
- **No emojis, LF line endings, no `/s` regex flag** (TS1501). Section 6 shows
  how one pin needs dot-all behaviour and achieves it with `[\s\S]`, never `/s`.

## 3. Facts pinned, confirmed at HEAD by direct read

Every quantity below names the `file:line` I opened. Lines drift; the pins
anchor on stable text, not raw line numbers. All citations are HEAD as read this
session.

| # | Fact | Where (HEAD) |
|---|---|---|
| F1 | Auto-draft firing effect calls `shouldAutoDraft({...})` with `extracting: extracting \|\| batchInFlightRef.current`, `hasEmptySlot: readyToDraftCount > 0`, `alreadyDraftedThisStop: !autoDraftPendingRef.current`, `savedFormatsState` forwarded raw; result consumed via `if (!fire) return;` before `await generate()` | `WalkthroughAnnouncementPanel.tsx:603-621` |
| F2 | Once-per-stop arming effect: arms (`= true`) when `prevCapturingRef.current && !capturing`, forces `= false` while `capturing`, tracks `prevCapturingRef.current = capturing` | `Panel:596-602` |
| F3 | Extraction-window guard: `batchInFlightRef.current = true` set BEFORE the first `await`, cleared `= false` in a `finally` | `Panel:332-376` (set `:339`, await `:340`, finally clear `:372-373`) |
| F4 | Fresh-run gate: `batchBlocksRef.current = []` / `setLegibleBlockCount(0)` / `reset()` run ONLY inside `if (isRunComplete(slots)) {` | `Panel:569-588` (guard `:576-580`) |
| F5 | `courseToAutoSelect` CALLED and CONSUMED in the setup hook: `setCourseId((prev) => courseToAutoSelect(loaded, prev \|\| null) ?? prev)` | `useWalkthroughSetup.ts:12` (import), `:75` (call+consume) |

`readyToDraftCount` is `emptySlotIds(slots).length`
(`useAnnouncementDraftSlots.ts:508`), surfaced to the panel from the hook; the
panel pins only that it feeds `hasEmptySlot: readyToDraftCount > 0`. The
`savedFormatsState !== "loading"` comparison and every other predicate branch
live INSIDE `walkthrough-run-decisions.ts:27-38` and are already covered by
`walkthrough-run-decisions.test.ts` (R7); the call site forwards
`savedFormatsState` raw and that is all the wiring test pins there.

## 4. Pins (what the implementer writes)

All pins read STRIPPED source unless noted. Each slice asserts BOTH its anchors
resolve (`> -1`) before slicing -- the repo's "anchor-resolves at both ends"
rule. All reads are of files already read by this test file.

### Group A -- F1, the auto-draft call site (`Panel`)

Slice the FIRING EFFECT: `fireStart = stripped.indexOf("shouldAutoDraft({")`,
`fireEnd = stripped.indexOf("}, [capturing, extracting,", fireStart)`. Assert
both `> -1`. `fireBlock = stripped.slice(fireStart, fireEnd)`. Pins operate on
`fireBlock` so an identifier appearing ELSEWHERE in the panel (e.g.
`generate()` on the Generate button at `:806`, or the `extracting` state
declaration at `:329`) cannot satisfy them.

- **A1** `fireBlock` matches `/extracting:\s*extracting\s*\|\|\s*batchInFlightRef\.current/`.
  Fact: the extracting arg ORs in the in-flight ref, so the effect cannot fire
  into the take/await window.
- **A2** `fireBlock` matches `/alreadyDraftedThisStop:\s*!autoDraftPendingRef\.current/`.
  The `!` is load-bearing (negation of the pending ref).
- **A3** `fireBlock` matches `/hasEmptySlot:\s*readyToDraftCount\s*>\s*0/`.
- **A4** `fireBlock` contains `if (!fire) return;` (regex
  `/if\s*\(!fire\)\s*return;/`). The result is CONSUMED as a guard, not
  computed and dropped.
- **A5** `fireBlock` matches `/\bgenerate\(\)/`. The effect actually calls
  `generate` (the guarded action), proven inside the sliced effect, not
  anywhere in the file.

Not pinned here, by design: `capturing`, `pendingFrames`, `hasMaterial`,
`savedFormatsState`, `autoDraftOn` are REQUIRED fields of `AutoDraftState`
(`walkthrough-run-decisions.ts:8-19`), so omitting any is a tsc error, not a
silent wiring bug -- a presence pin on them would be redundant with the type
checker (see section 5, non-discriminating by construction).

### Group B -- F2, once-per-stop arming ref (`Panel`)

Slice the ARMING EFFECT: `armStart = stripped.indexOf("const prevCapturingRef = useRef(false);")`,
`armEnd = stripped.indexOf("const fire = shouldAutoDraft")`. Assert both `> -1`.
`armBlock = stripped.slice(armStart, armEnd)`. (The firing effect's own
`autoDraftPendingRef.current = false` at `:615` is AFTER `armEnd`, so it cannot
leak into this slice -- confirmed by HEAD line order.)

- **B1** `armBlock` matches `/prevCapturingRef\.current\s*&&\s*!capturing\)\s*autoDraftPendingRef\.current\s*=\s*true/`
  (armed on the true->false edge).
- **B2** `armBlock` matches `/if\s*\(capturing\)\s*autoDraftPendingRef\.current\s*=\s*false/`
  (forced false while capturing).
- **B3** `armBlock` matches `/prevCapturingRef\.current\s*=\s*capturing/`
  (edge tracking that makes B1 correct).

### Group C -- F3, extraction-window guard (`Panel`)

Slice `runExtraction`: `rxStart = stripped.indexOf("const runExtraction = useCallback")`,
`rxEnd = stripped.indexOf("}, [takeFrameBatch,", rxStart)`. Assert both `> -1`.
`rxBlock = stripped.slice(rxStart, rxEnd)`.

- **C1 (ORDERING, not presence)**: `setIdx = rxBlock.indexOf("batchInFlightRef.current = true")`,
  `awaitIdx = rxBlock.indexOf("await ")`. Assert `setIdx > -1`, `awaitIdx > -1`,
  and `setIdx < awaitIdx`. The set is synchronous, BEFORE the first await.
- **C2 (finally clear)**: `finallyIdx = rxBlock.indexOf("} finally {")`; assert
  `> -1`; `finallyBlock = rxBlock.slice(finallyIdx)`; assert
  `/batchInFlightRef\.current\s*=\s*false/`.test(finallyBlock).

### Group D -- F4, fresh-run-on-Start gate (`Panel`)

Slice `handleStartStop`: `hssStart = stripped.indexOf("const handleStartStop = useCallback")`,
`hssEnd = stripped.indexOf("}, [capturing, start, stop, slots, reset]);", hssStart)`.
Assert both `> -1`. `hssBlock = stripped.slice(hssStart, hssEnd)`.

- **D1 (guarded reset)**: `guardStart = hssBlock.indexOf("if (isRunComplete(slots)) {")`;
  assert `> -1`; `guardBlock = hssBlock.slice(guardStart, hssBlock.indexOf("(async () =>", guardStart))`;
  assert `guardBlock` contains all three of `reset()`,
  `batchBlocksRef.current = []`, and `setLegibleBlockCount(0)`. This pins that
  the reset + batch clear live INSIDE the `isRunComplete` guard, not that they
  merely exist. An unconditional reset (guard removed) fails the
  `guardStart > -1` assert; a reset moved OUTSIDE the guard fails the
  `guardBlock contains reset()` assert.

### Group E -- F5, `courseToAutoSelect` consume (`useWalkthroughSetup.ts`)

Read `setupSource` raw, `strippedSetup = stripComments(setupSource)`.

- **E1 (import, tsc-redundant -- include for readability, NOT as the
  discriminator)**: `strippedSetup` matches
  `/import\s*\{[^}]*\bcourseToAutoSelect\b[^}]*\}\s*from\s*"\.\/walkthrough-run-decisions"/`.
  Noted as tsc-backstopped: removing the import is a compile error because `:75`
  calls it, so this pin cannot discriminate a silent bug. It documents the seam;
  E2 is the real guard.
- **E2 (call + consume, the load-bearing pin)**: `strippedSetup` matches
  `/setCourseId\(\s*\(prev\)\s*=>[\s\S]*?courseToAutoSelect\([\s\S]*?\)\s*\?\?\s*prev\s*\)/`.
  Pins three facts at once: the result feeds `setCourseId`'s updater form
  (`(prev) =>`), that updater CALLS `courseToAutoSelect`, and the whole thing
  ends `?? prev)`. **Use `[\s\S]` for dot-all, NEVER the `/s` flag** (TS1501).
  Deliberately does NOT pin the arguments `loaded, prev || null`, so a
  legitimate arg refactor does not false-red; dropping `?? prev`, or lifting the
  result out of `setCourseId`, does.

## 5. Sabotage ledger -- one mutant per pin, each red-exactly-it

Every mutant is applied to the PRODUCTION source (never the test), the named pin
confirmed RED, then the source restored from a cp-backup (NEVER
`git checkout --`, which reverts to the index and destroys uncommitted work) and
the pin confirmed GREEN again. Discrimination column: does this mutant red
EXACTLY its pin and leave every other pin green? A mutant red-in-both or
green-in-both discriminates nothing and must be rebuilt.

| Pin | Mutant (edit to production) | Reds | tsc still passes? | Discriminates |
|---|---|---|---|---|
| A1 | `Panel:607` -> `extracting: extracting,` (drop `\|\| batchInFlightRef.current`) | A1 only | yes (both boolean) | YES |
| A2 | `Panel:612` -> `alreadyDraftedThisStop: autoDraftPendingRef.current,` (drop `!`) | A2 only | yes | YES |
| A3 | `Panel:610` -> `hasEmptySlot: readyToDraftCount >= 0,` | A3 only | yes | YES |
| A4 | delete `Panel:614` `if (!fire) return;` (unconditional auto-draft) | A4 only | yes | YES |
| A5 | in the firing effect replace `await generate();` with `await Promise.resolve();` | A5 only | yes | YES (the Generate button's `generate()` at `:806` is OUTSIDE the slice, so it cannot keep A5 green) |
| B1 | delete `Panel:599` (the arm line) | B1 only | yes | YES |
| B2 | delete `Panel:600` (the disarm line) | B2 only | yes | YES |
| B3 | delete `Panel:601` (`prevCapturingRef.current = capturing`) | B3 only | yes | YES |
| C1 | move `batchInFlightRef.current = true;` to AFTER `await Promise.resolve();` | C1 only (`setIdx > awaitIdx`) | yes | YES (C2's finally clear untouched) |
| C2 | delete `batchInFlightRef.current = false;` from the `finally` block | C2 only | yes | YES (C1's set still before await) |
| D1 | remove the `if (isRunComplete(slots)) {` wrapper, leaving reset/batch-clear unconditional | D1 only | yes | YES |
| E2 | `Setup:75` -> drop `?? prev`: `setCourseId((prev) => courseToAutoSelect(loaded, prev \|\| null))` | E2 only | yes | YES |

Second sabotage corroborating E2 (same pin, not a separate pin): replace
`:75` with `const _auto = courseToAutoSelect(loaded, courseId || null);` and no
`setCourseId` -- the "computes but does not consume" shape AC-10 names. This
also reds E2 (the `setCourseId(... ?? prev)` form is gone). Reported here as
corroboration that E2 catches BOTH of the scope's named sabotages, not as an
extra pin.

**No mutant above is red-in-both or green-in-both.** Every mutant is type-valid
(tsc passes), which is the whole point: these are exactly the silent wiring
regressions no other gate in this repo can see. If, when run, any mutant
survives, do NOT add an assertion until it dies -- first check whether the
mutant is bad (mutating the wrong object, or producing a tsc-forbidden state);
rebuild it and say so, per the test-seat rule.

## 6. Attacking the two riskiest pins before shipping (self-check)

**Flagged for the checker, tightest first:**

- **E2 is the pin most likely to be built too tight (spelling-brittle).** The
  `?? prev` tail is pinned as an exact literal. Justified as a frozen-literal
  exception: `?? prev` IS the fact. `courseToAutoSelect` returns `null` to mean
  "change nothing" (`walkthrough-run-decisions.ts:54-57`); the `?? prev`
  fallback is what turns that null into "keep the persisted/live choice". Drop
  it and a stale stored id silently blanks a persisted course -- the exact
  publish-to-the-wrong-place hazard the function's doc comment
  (`:47-53`) exists to prevent. So here the spelling is load-bearing, like a
  frozen copy literal. I deliberately relaxed EVERYTHING ELSE in the regex
  (`[\s\S]*?` around the arguments) so a legitimate arg refactor
  (`prev ?? null`, hoisting `loaded`, reflow) does NOT false-red -- only the two
  states AC-10 cares about (result not consumed; fallback dropped) red it.
  Adversarial check I ran against it by hand: the passing-but-wrong
  implementation `setCourseId((prev) => courseToAutoSelect(loaded, prev))` (drop
  `|| null`) still passes E2 -- correctly, because `|| null` is an internal
  normalisation the pure function's own A0/A1 rows already cover
  (`walkthrough-run-decisions.test.ts:84-85`), not a wiring fact; E2 is not the
  instrument for it, and claiming otherwise would be over-specification.

- **A5 is the pin most likely to be built too loose (presence-only).** A naive
  `panelSource.includes("generate()")` would stay GREEN even if the effect
  dropped its call, because the Generate button calls `generate()` at
  `Panel:806`. Mitigated by slicing to the firing effect (`fireStart..fireEnd`)
  BEFORE matching. The implementer MUST match `generate()` inside `fireBlock`,
  never the whole panel. If this is built whole-panel it is a dead pin.

## 7. Executable here vs. argued; residual register

**Executable here (this instrument):** F1-F5's SOURCE-TEXT presence / absence /
ordering facts, pins A1-A5, B1-B3, C1-C2, D1, E1(documentary)/E2. Each is proven
red by its section-5 mutant and green on restore.

**Argued, NOT asserted by any test here (reading claims only):**

- That the firing effect actually RUNS and that `generate()` actually produces a
  draft at runtime -- no component renders under vitest. Argued from the source;
  the owner Verify step (AC-13, OWNER) is the only observer.
- That the ref-ordering in F3 holds under React's scheduler at runtime. C1 pins
  the SOURCE order of the two statements; it does not prove the scheduler runs
  them in that order relative to a concurrent effect. Reading claim.
- That `readyToDraftCount === emptySlotIds(slots).length` inside the hook. The
  panel pin (A3) pins only the call site's use of `readyToDraftCount`; the
  derivation is at `useAnnouncementDraftSlots.ts:508` and is exercised by
  `useAnnouncementDraftSlots.test.ts`, not by this structure test.

**Residual register:**

| ID | Not proven by this instrument | Owner | Instrument | Step that measures it |
|---|---|---|---|---|
| R-AC10-a | The auto-draft effect fires once per stop and drafts at runtime | repo owner | real browser: capture, Stop, watch one draft appear with no second | AC-13 OWNER walk, Verify after W2 |
| R-AC10-b | The extraction-window ref prevents a mid-take auto-draft at runtime | repo owner | real browser: Stop while a batch is in flight | same walk |
| R-AC10-c | `readyToDraftCount` derivation in the hook | implementer + existing `useAnnouncementDraftSlots.test.ts` | that suite (already green) | already covered; named here so it is not mistaken for this test's job |
| R-AC10-d | E1 (import presence) is tsc-backstopped, not independently discriminating | n/a | tsc | every gate run; documented, not a guard |

Each residual names an owner, an instrument, and the step that measures it; none
is a silent deletion.

## 8. Satisfiability proof (red tests are satisfiable)

For a source-text test over ALREADY-SHIPPED code, the reference implementation
IS the HEAD source at `ffaba04f` (clean at `a4b8fbaf`). I verified by direct
read this session that every anchor and every pinned substring/ordering resolves
against HEAD (the `file:line` citations in section 3 are that evidence), so the
GREEN state is proven to exist -- the pins are not vacuous and not contradictory.
The implementer's remaining obligation is the RED half: apply each section-5
mutant, confirm the named pin reds and nothing else does, restore from a
cp-backup, and confirm green. I did not run vitest (I author notes; the
implementer runs them), and I say so rather than claim a run I did not make.

## 9. Gate command

Single file, so either form is valid; use the wrapper for consistency with the
repo convention. Every path exists / is produced by this instrument's write set
(the one extended file) -- no phantom path:

```
npm run test:paths -- src/app/components/walkthrough-announcement/walkthrough-announcement.structure.test.ts
```

If run alongside the pure-function suite, name both explicitly (NEVER a raw
multi-path `vitest`, which silently drops an unmatched argument):

```
npm run test:paths -- src/app/components/walkthrough-announcement/walkthrough-announcement.structure.test.ts src/app/components/walkthrough-announcement/walkthrough-run-decisions.test.ts
```
