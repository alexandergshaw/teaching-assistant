# Adversarial check: RES-FILL-6 provenance-guard test notes

Checker (fresh, did not author). Target:
`docs/res-fill-6-provenance-guard-notes.md`. Read-only pass; every quantity below
names the command that produced it, run 2026-09-29 at the repo root.

VERDICT UP FRONT: the design is BUILDABLE by an implementer as written. Both
load-bearing corrections hold. Two minor findings, both RESIDUAL, neither blocks
the build. No blockers.

---

## The two load-bearing facts, confirmed explicitly

### Producer set is NINE (not six) - CONFIRMED

Command (the design's, re-run verbatim):
`grep -rnE "\)\s*:\s*(Promise<)?GradingRun>?\s*\{" src --include=*.ts | grep -v "\.test\.ts"`
-> exactly 9 lines, identical to the design's Section 2.1 list. Each resolves to
a real GradingRun-returning function (all opened):

- grading-run-mapping.ts:38 -> `gradingApiToRun` (name at :34), stamps :42 FRESH
- incrementalRunPlan.ts:260 -> `buildIncrementalRun`, PASS-THROUGH (:273-274)
- embedded-grader/discussion.ts:442 -> `gradeDiscussion` (:437), stamps :498 FRESH
- embedded-grader/index.ts:125 -> `gradeEntriesEmbedded` (:121), stamps :227 FRESH
- engine.ts:198 -> `gradeStudentEntries` (`async function` at :188, NOT exported),
  stamps :360 FRESH
- engine.ts:371 -> `gradeSubmissions` (:365), MIXED (empty branch :411, else
  delegates :415)
- engine.ts:437 -> `gradeEntries` (:430), PASS-THROUGH (body `return
  gradeStudentEntries(...)` :438)
- engine.ts:452 -> `gradeCanvasUrl` (:446), MIXED (empty branch :466, else
  delegates :479)
- grading-review-rows.ts:90 -> `stripGradingRunForDraft`, TRANSFORM-EXCLUDED (:91
  `return { ...run, results: ... }`)

Every disposition in the design's Section 2.1 / Section 6 table matches the
source. The design missed no producer and named none that is not there.

Nuance (not a defect in the guard): the ROW literally said "six existing non-test
call SITES" and called run-header.ts "the fill's new ... caller" - i.e. it counted
stamp CALL SITES (six existing + run-header's new one = seven `stampRubricProvenance(`
calls, confirmed by `grep -rn "stampRubricProvenance" src --include=*.ts | grep -v
"\.test\."`), not producers. The design frames this as "the row said six
[producers]" and "the row calls run-header.ts a new producer". The framing
overstates the row's error - the row and the design actually AGREE that
run-header.ts is a stamp-caller, not a GradingRun producer. This does not
propagate into a wrong guard (see Finding 2).

### Three false positives of the naive body-scan - CONFIRMED

Opened all three; none contains a `stampRubricProvenance` call in its own body,
and each returns a correctly-stamped run:

- `gradeEntries` (engine.ts:437-439): `return gradeStudentEntries(...)`; the run
  is stamped by `gradeStudentEntries` (:360). Proven green by
  `rubric-stamp.wiring.test.ts:55-74` (read - it drives `gradeEntries` and asserts
  the pair).
- `buildIncrementalRun` (incrementalRunPlan.ts:260-276): passes
  `header.rubricUsed`/`header.rubricFingerprint` through as `StampedRubricText`
  casts (:273-274); no stamp call. The header pair is stamped one hop upstream in
  `resolveRunHeader` (run-header.ts:50).
- `stripGradingRunForDraft` (grading-review-rows.ts:90-92): preserves the incoming
  pair via `...run`; no stamp call; RULING-57-excluded per
  rubric-provenance-stamp.ts:9-11.

So the design's core justification for rejecting the row's naive body-scan and for
the two-instrument split is sound: the naive scan would flag exactly these three
on a correct tree.

---

## The remaining attacks, run

### run-header.ts is not a producer (task point 2) - RUN, CONFIRMED
`resolveRunHeader` returns `Promise<GradingRunHeader>` (run-header.ts:37). The
producer regex correctly excludes it: I tested `/\)\s*:\s*(?:Promise<)?GradingRun>?\s*\{/g`
against `Promise<GradingRunHeader> {` -> NO MATCH (`GradingRun` followed by
`Header` fails `>?\s*\{`). run-header.ts is absent from the 2.1 output.
`buildIncrementalRun` genuinely carries the header pair into the run it returns
(incrementalRunPlan.ts:273-274). run-header.ts:21-30 does forbid double-stamping
in words ("spreading this header's pair onto the same object would double-stamp
it, with spread order silently deciding which value wins").

### RULING 57 true invariant "stamped somewhere on the path" - RUN, CONFIRMED
rubric-provenance-stamp.ts:1-27 read. It excludes `stripGradingRunForDraft`
because it "transforms an already-produced run, it does not produce one" (:9-11).
That reasoning generalizes to pass-through producers, which is exactly the
design's reading. The two-instrument split rests on this and it holds.

### Instrument A leaf and shape (task point 5) - RUN, CONFIRMED
`src/app/components/ui/modalAdoptionSourceScan.ts` exists, is a plain `.ts` (not
`.test.ts`), and exports `walkFiles` (:56), `stripComments` (:155),
`toRepoRelativePosix` (:386). Its header (:20-23) states it is already imported by
`useMessageReplies.wiring.test.ts` and `walkthrough-announcement.structure.test.ts`
- so importing it re-runs no describe block. `stripComments` is the RULING-79
character-scanning tokenizer (:135-229): it handles block comments, strings,
templates and regex literals, scans char-by-char (CRLF-safe by construction), and
is NOT a naive line stripper - so the L13 "naive stripper is blind" failure is
avoided. The "frozen expectation, live-derived set" shape is the headless-count
canary pattern, as the design claims. A caveat worth stating: the module is
TEST-ONLY infra (imports `node:fs`); the new file must be a `.test.ts` so the
`modalAdoption.wiring.test.ts` bundle guard does not fire - the design's Section 11
keeps it a test file, so this is fine.

### Instrument B precedent and seam (task point 6) - RUN, CONFIRMED
`rubric-stamp.wiring.test.ts` read in full: it drives `gradeEntries` (:59), mocks
`../gemini`, `../llm` (`callLlm`), `../code-runner` (:12-25) - never `fetch` -
asserts the pair equals `stampRubricProvenance`-derived values built at test time
(:72-73), and anchors on the SENT text (:66-70) to defeat the arbitrary-string
tautology. B extends a real precedent, mocks the seam not fetch.

### The arrow gap / R1 honesty (task point 7) - RUN, CONFIRMED
Tested the exact regex in node:
- `export function makeBareRun(): GradingRun { ... }` -> MATCH (B1 caught by A)
- `export const makeBareRun = (): GradingRun => ({...})` -> NO MATCH (B2 misses)
- `= (): GradingRun => { ... }` -> NO MATCH
- `(): GradingRun | null { ... }` -> NO MATCH (union missed; also why
  `selectDisplayRun` at incrementalRunPlan.ts:280 is correctly absent)
- `Promise<GradingRun>` -> MATCH; `Promise<GradingRunHeader>` -> NO MATCH

So R1's disclosed gap is real, demonstrated, and honestly scoped: the guard is
complete for the CURRENT tree, not for future arrow/union producers. And there
are NO arrow or union producers today - a raw-source run of the multiline regex
(see next) returns exactly the nine `function`-declaration producers, so the
"none exist today" claim holds.

### Satisfiability / green today / no live bug (task point 8) - RUN, CONFIRMED
All nine producers stamp, delegate-to-a-stamper, pass a stamped pair through, or
transform-preserve one - none is unstamped. No real provenance bug in the tree;
the design's "found none" is correct. Divergence check I added (the design did
not run this one): the design freezes `EXPECTED_PRODUCERS` from the LINE grep
(nine) but Instrument A derives the set live with a MULTILINE JS RegExp over
comment-stripped source. Those two could diverge on a multi-line signature or a
commented match. I ran the multiline regex `/\)\s*:\s*(?:Promise<)?GradingRun>?\s*\{/g`
over raw (unstripped) non-test `src/**/*.ts`: exactly 9 matches, same locations as
the grep. So no divergence today and Instrument A is green on the current tree
(FP1 passes). The design's Section 6 note "re-run at implementation time and
reconcile any delta before freezing" plus FP1 are the backstop if the tree moves;
today there is nothing to reconcile.

### Stale comment R3 (task point 9) - RUN, CONFIRMED, STILL OWED
rubric-provenance-stamp.ts:4-8 says the grep gives "five hits" then names SEVEN
functions and omits `buildIncrementalRun` and `stripGradingRunForDraft` (the
latter deliberately, at :9-11). Internally inconsistent (5 vs 7) and drifted from
the measured 9. The comment is STILL STALE right now (I read it this pass); the
design assigns the fix to the implementing chunk (R3), which is correct and NOT
yet done. Flagging as owed, per the task.

### Multi-path silent-drop risk (task point 4 / traps-tests) - RUN, EMPTY
The design's Section 11 instructs `npm run test:paths <p1> <p2> ...` for two or
more files and `npx vitest run <path>` for a single file (Section 8 uses the
single-file form). No raw multi-path `vitest`/`npm test` is prescribed. The
silent-argument-drop trap is not present.

---

## Findings

### Finding 1 - RESIDUAL - class: unnamed-seam-entry-point (NEW)
`file:line`: design Section 5 Instrument B table row "gradeStudentEntries
(engine.ts)" and Section 6 EXPECTED_PRODUCERS entry
`engine.ts::gradeStudentEntries` (coveredBy "behavioural: gradeStudentEntries
driver"), against `src/lib/grade/engine.ts:188` (`async function
gradeStudentEntries` - NOT exported).

`gradeStudentEntries` is an internal function; a test cannot import it. The design
lists it as a driver target and a distinct blank-rubric case without naming the
entry point. The seat's own obligation #3 (seats.md:457-465) forbids adding an
export or reaching past the seam, so an implementer who reads the row literally
could either hit a non-export compile error or (worse) add an export. Both
`gradeStudentEntries` cases are reachable through the exported wrapper
`gradeEntries` (fresh non-blank is already the existing wiring test; the
blank-rubric case is `gradeEntries([entry()], "...", "", "gemini")` -> both fields
`undefined`). Shortest fix: one clause naming `gradeEntries` (or
`gradeSubmissions`/`gradeCanvasUrl`) as the production entry point for the
`gradeStudentEntries` coverage, so no one exports the internal. Non-blocking: the
design's intro ("drive it through the real production path") and the `gradeEntries`
"ALREADY COVERED" row point a careful implementer to the right approach.

### Finding 2 - RESIDUAL - class: source-mischaracterization (NEW)
`file:line`: design Section 0 ("The row names 6 stamp call sites and a 'new
run-header.ts producer'") and Section 2.4 ("The task and the row title both call
run-header.ts a 'new producer'"), against backlog.yml RES-FILL-6 title ("the
fill's new run-header.ts CALLER") and its instrument (which lists "the six
existing non-test call SITES").

The row counted stamp CALL SITES and called run-header.ts a CALLER - it did not
claim run-header.ts is a GradingRun producer. The design's "correcting the row"
framing attacks a position the row did not take; the two in fact agree. This is
cosmetic: the design's substantive producer analysis (nine, verified) and its
run-header.ts treatment are correct, so nothing wrong reaches the implementer. No
fix required; noting for the record so the "the row was wrong" framing is not
inherited as fact.

---

## Attacks that came back EMPTY (run-and-empty)

- Producer set completeness / correctness: empty (all nine verified).
- Three-false-positive premise: empty (all three verified as bodyless-stamp).
- run-header.ts scoping and buildIncrementalRun pass-through: empty.
- Instrument A leaf existence, export surface, .test.ts safety, tokenizer
  robustness: empty.
- Instrument B seam discipline (mocks seam not fetch) and tautology anchor: empty.
- Regex arrow/union gap honesty and "no such producers today": empty.
- Green-today satisfiability, including the line-grep vs multiline-regex
  divergence I added: empty (both yield nine).
- Multi-path test-command trap: empty.
- Name-resolution correctness of Instrument A (last `function\s+NAME` before each
  match resolves to the owning function, incl. the non-exported
  `gradeStudentEntries`): empty - each `): ...GradingRun {` immediately follows its
  own `function <name>(` signature, so no cross-resolution.

---

## Verdict and counts

- Verdict: BUILDABLE AS WRITTEN. Both instruments, the sabotages (A1/A2/A3 red on
  B, B1 red on A, B2 green on A as the disclosed residual), the frozen expectation
  (nine, green today), and FP1/FP2 are all implementable and internally
  consistent.
- Blockers: 0.
- Residuals: 2 (Finding 1 - name the production entry point for the
  `gradeStudentEntries` driver so no one exports the internal; Finding 2 -
  cosmetic source-mischaracterization). Plus the design's own R1-R4, which I
  confirmed are real and honestly scoped; R3 (stale comment) is still owed and
  correctly assigned to the implementing chunk.

## Stopping point

DESIGN is sound; MEASUREMENT is sound (I re-ran every quantity and added the
line-grep-vs-multiline-regex divergence check the design omitted - it too is
clean). What remains is the one worth-fixing wording clause (Finding 1) so an
implementer does not export an internal, and the already-owed comment fix (R3).
Nothing in RULINGS is contested. Stopping.
