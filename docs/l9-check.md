# L9 scope check - round 1 of at most two

Checker: `loop-checker`, fresh, did not author `docs/l9-scope.md`. Artifact
under check: `docs/l9-scope.md` at `4b33346`, 541 lines
(`@(Get-Content docs/l9-scope.md).Count` was not used; `wc -l docs/l9-scope.md`
returns 541).

Write set of this pass: exactly `docs/l9-check.md`. No production or test file
was mutated. Every mutation below was evaluated over scratchpad copies or over
extracted-verbatim predicates run in memory under
`node --experimental-strip-types`; the real files were read only.

**VERDICT: BUILDABLE IN PART.** 5 blockers, 5 majors, 5 minors. Waves 1 and the
remedy comparison are dispatchable with the corrections named below. Waves 2a,
2b, 3 and 4 must not be dispatched as they stand.

---

## Method and instruments

Every quantity below names the command or script that produced it. Scripts live
in this session's scratchpad
(`C:\Users\alexa\AppData\Local\Temp\claude\C--Users-alexa-OneDrive-Documents-Projects-teaching-assistant\e8e96e62-aa3d-4508-b28a-354d4d297572\scratchpad`):
`census.py`, `diffA.py`, `mk_proof1.py`/`proof1.ts`, `mk_proof2.py`/`proof2.ts`,
`which_lines.ts`, `wave2a.py`, `wave2a_floor.py`, `wave2a_refine.py`, `row.py`.

All regex literals containing backslashes were built with `chr(92)` inside a
`.py` file written by the `Write` tool, never typed into a shell heredoc - the
same failure the artifact itself reports hitting.

Every absence claim below carries a canary. `census.py` prints
`stripCommentsZZCANARYZZNONEXISTENT` = 0 files against `readFileSync` = 209
files on the same corpus with the same reader; `wave2a_floor.py` prints its
absence-assertion regex finding 0 hits for a variable name that cannot exist and
142 for the real one on the same corpus.

`npx tsc --noEmit` was NOT run: this pass wrote no TypeScript. The brief records
it currently exits non-zero on a live sibling's `src/lib/grade*` files.

---

## Section 0 audit - the disposition table, before reading the new round

Audited against `git show 7858741:docs/l9-scope.md` (455 lines by
`wc -l`; the brief said 456).

Six of the table's seven rows hold. **Three obligations the prior pass raised
are gone from the new text while the table reports them KEPT.** That is
blocker B1 and it is the highest-value finding in this check.

| Prior content | Table says | Holds? |
|---|---|---|
| Section 0, L9/A42 ordering tension | KEPT (ORD-1) | YES. Re-verified: A42 `state` is `unscoped` (`row.py A42 98`), `blocked_by` `-`. |
| Section 1 census 205/70/22/77, gap 113 | KEPT, updated | PARTLY. The four headline numbers are re-measured honestly. The prior section's enumerated 22-file inline-stripper list and its 8-file per-file classification are not carried anywhere - see B1(c). |
| Section 2a ModalShell citation | WITHDRAWN, reason fixed | YES. `sed -n '278,294p' src/app/components/snapshot-grading/snapshot-grading.structure.test.ts` shows `:292` as `expect(modalShellSource).toMatch(/role="dialog"\s*aria-modal="true"/)`, exactly as described. A replacement presence proof is supplied. Correct withdrawal. |
| Section 2b absence-direction proof | KEPT, re-verified | The PROOF is kept and reproduces (below). The prior Section 3's owed DECISION attached to it is not - B1(a). |
| Section 3 remedy space | KEPT, restated and extended | NO. B1(a). |
| Section 4 wave plan | KEPT, renumbered | Structurally yes; the write sets are wrong - B2, B3. |
| Residuals R1-R6 | KEPT, renumbered, R2/R3/R4 reworded | NO for R3 (object replaced, not reworded - B1(b)), degraded for R2 (M1) and R5 (M3). |

---

## BLOCKERS

### B1 - the disposition table asserts KEPT for three obligations the new text does not carry

**Class: RESTRUCTURING-DROP-UNDER-KEPT. NEW.**

A class is the mechanism, and the mechanism here is one: a table row maps a prior
requirement to a SECTION LABEL that survived, while the OBLIGATION inside it did
not. One corrective rule fixes all three - trace each prior requirement to the
sentence in the new document that carries it, not to the section heading.

**(a) The owed decision on comment-AWARE matching for absence guards.** Prior
`docs/l9-scope.md` Section 3 (prior file lines 324-332) states:

> "Whoever authors the triage rule owes a decision on whether absence guards
> need comment-AWARE matching ... rather than the binary 'strip or do not
> strip' the row currently frames."

The new Section 2 (`docs/l9-scope.md:174-177`) re-adopts that binary framing as
"unchanged and re-adopted here" and the owed decision appears nowhere in the new
document. Section 0's row for prior Section 3 claims KEPT and "restate[d] and
extend[ed]".

This is not cosmetic. It is the precise decision that would have sized and
fenced Wave 2a (B2) and given the absence-direction finding a wave (B5). The
prior pass raised it; this revision withdrew it without saying so.

**(b) Prior R3's object and instrument.** Prior R3: "a third stripping idiom
under a third name ... would hide inside the 113 uncounted", owner
`loop-test-author`'s wave 1, instrument "Extend R1's script to flag any function
whose body contains a `.replace(` call removing `/\*` or `//` sequences by ANY
name". New R3 records a different thing entirely - the 111-vs-114 one-file
disagreement. New Section 1 (`docs/l9-scope.md:139-141`) says the third-idiom
caveat is "Recorded as Residual R3", and R3's row does not record it. So that
obligation now has no owner, no instrument and no step, which
`iteration-caps.md:167` rules is a deletion.

**(c) Prior Wave 1's three-part write set.** Prior Wave 1 enumerated three
inputs: the gap files, the 22 inline-strippers "to confirm they are correctly
classified as already-defended", and the 8 word-without-literal files "to
confirm the 2 line-comment-only files and the 1 hand-rolled parser are correctly
left alone, and that the 2 import-only files correctly inherit whatever
`modalAdoptionScan.ts` ends up doing". New Wave 1 (`docs/l9-scope.md:397-405`)
collapses this to "the 208-file `readFileSync` population". The
`modalAdoptionScan.ts` inheritance obligation - the only one of the three that
is not implied by the larger population, because it is about a fix that has not
happened - is gone.

**Disposition:** fixable in the one revision. Re-carry all three, and re-issue
the table with a text location per row rather than a section name.

---

### B2 - Wave 2a is reported empty; it measures at least 95 assertions in 30 files, and the rule as re-adopted would also delete 21 of the repo's stripper canaries

**Class: WAVE SIZED FROM A SAMPLE OF ONE FILE THE SCOPE'S OWN PROXY CANNOT SEE.
NEW.**

`docs/l9-scope.md:415-418` gives Wave 2a's file list as "produced by Wave 1. None
confirmed by this pass's sampling", on the strength of one sampled file.

Measured (`wave2a_refine.py`, a Python walk over `src/`, canaried):

| Quantity | Result |
|---|---|
| `*.test.ts` files stripping comments by any of the three searched idioms (word `stripComments`, `[\s\S]*?\*\/`, `[^]*?\*\/`) | **97** |
| Of those, also carrying a `.not.toContain(`/`.not.toMatch(` assertion | **78 files, 446 occurrences** (upper bound, per-file) |
| Absence assertions applied to a variable PROVABLY assigned from a stripping call | **142 occurrences, 44 files** |
| Of those, the stripped text came from a REAL source file (`readFileSync`) | **95 occurrences, 30 files** |
| Of those, the stripped text was a SYNTHETIC fixture - i.e. the stripper's own canary | **21 occurrences, 15 files** |
| Unresolved by the heuristic | 17 occurrences, 9 files |

Under the triage rule Section 2 re-adopts verbatim ("an assertion that something
is ABSENT must NOT strip comments"), the 95 are Wave 2a candidates. Named
instances, each verifiable directly:
`src/app/components/content-tab/courseItemsView.wiring.test.ts:114`
(`expect(stripped).not.toMatch(/updateModuleItemAction/)`, `stripped` from
`stripComments(viewSource)`);
`src/app/components/content-tab/modules/bulkModulesSection.wiring.test.ts:192,303,309,513`;
`src/app/actions/carry-module-pattern.test.ts:647,651,655`.

**The second half of this blocker is worse than the first.** 21 of the 142 are
the assertions that PROVE the strippers work - e.g.
`src/app/components/autoGradeTransition.wiring.test.ts:32`,
`expect(stripped).not.toContain("used to live here")` inside a describe block
literally named "stripComments (canary first)". The rule applied mechanically
orders their removal, which would disarm the only instruments in this repo that
watch a stripper fail. Wave 2a has no exclusion for them and Wave 1's three
buckets (presence / absence / comment-content) have no fourth bucket for "an
absence assertion whose subject IS the stripper's own output".

**Disposition:** fixable in the one revision for the sizing and the exclusion.
The underlying rule question is B1(a)'s dropped decision and is the owner
question at the end of this document.

---

### B3 - Wave 2b's write set omits the file the fix breaks; "could ship standalone" is false

**Class: ASSIGNMENT OMITS THE FILE THE CHANGE BREAKS. NEW in this artifact
chain** (the repo has the class recorded, which is why it is a blocker and not a
major).

`docs/l9-scope.md:426-431` names one Wave 2b candidate,
`src/lib/grade/grade-result-doors.wiring.test.ts`'s `referencesUngradedFlag`, and
concludes "it is NOT blocked on A42 and could ship standalone".

Measured by extracting `DOOR_BUILDER_NAMES`, `collectSourceFiles`,
`callsBuilder` and `referencesUngradedFlag` VERBATIM from
`src/lib/grade/grade-result-doors.wiring.test.ts:45-80` and running the test's
own caller predicate over the real tree (`proof1.ts`, 1592 non-test `.ts`/`.tsx`
files walked), each caller evaluated raw and comment-stripped:

```
BUILDER postCanvasGradesAction: callers=4
   src\app\components\GradingResults.tsx                        raw=true stripped=true
   src\app\components\repo-grades\repoGradesPosting.ts           raw=true stripped=true
   src\app\components\repo-grades\useRepoGradesGradingActions.ts raw=true stripped=true
   src\lib\workflows\registry\steps.grading-draft-flow.ts        raw=true stripped=false  <== COMMENT-ONLY
   raw missing (test red today): 0   stripped missing (test would go red): 1
```

Confirmed per line (`which_lines.ts`, the verbatim predicate applied line by
line): `src/lib/workflows/registry/steps.grading-draft-flow.ts` has exactly
three lines satisfying `referencesUngradedFlag`, and **all three are comments**
- `:598`, `:600`, `:601`. Its live references are `ungradedResults` at `:20` and
`:297`, which `/\bungraded\b/i` cannot match because of the word boundary before
`Results`.

Two consequences the artifact does not carry:

1. **The fix is not one file.** Adding comment-stripping to
   `referencesUngradedFlag` turns `grade-result-doors.wiring.test.ts` RED on
   `src/lib/workflows/registry/steps.grading-draft-flow.ts`, which is not in
   Wave 2b's write set. The wave must either include that file or state the
   exclusion.
2. **The fix needs a predicate decision, not just a stripping call.** Because
   `ungradedResults(` does not satisfy the predicate, "does this file
   acknowledge the flag" and "does the predicate see the acknowledgement" are
   different questions for this file. Wave 2b's brief mentions neither.

This is also, incidentally, a **stronger live instance of L9 than the one the
scope chose**: for `steps.grading-draft-flow.ts` the test's verdict is carried
100% by prose today, so deleting a documentation comment turns a green wiring
test red and deleting the real gate leaves it green. The scope reports that the
only such armed instance it could prove was the one already fixed at `6125260`.

**Disposition:** fixable in the one revision.

---

### B4 - Wave 3 freezes a ratchet over a population its own census cannot see, including both of the scope's proof files

**Class: RATCHET FROZEN OVER A POPULATION ITS OWN CENSUS CANNOT SEE. NEW.**

`docs/l9-scope.md:351` specifies Shape (3) as: enumerate `readFileSync` test
files, "classify presence/absence via Section 1's proxy, and assert the
'undefended presence' file list against a FROZEN allowlist that may only
shrink". `:434-438` schedules it as a wave that "Ships independently of 2a/2b's
timeline", and `:406-408` seeds it "from today's census, so the ratchet can ship
in this wave's tail without waiting for the full per-assertion triage to finish".

Measured (`census.py`, over my 112-file gap):

| Quantity | Result |
|---|---|
| Gap files containing `.toBe(true)`/`.toBe(false)` | 57 |
| Of those, counted in NEITHER proxy population | **19** |
| `src/lib/grade/grade-result-doors.wiring.test.ts` - presence-shaped by proxy? | **False** (absence-shaped: also False) |
| `src/lib/canvas-client-boundary.test.ts` - presence-shaped by proxy? | **False** (absence-shaped: also False) |

The 19 invisible files include `src/lib/no-emojis.test.ts`,
`src/lib/use-server-exports.test.ts`,
`src/lib/module-graph/runtime-import-graph.test.ts`,
`src/app/actions/action-guard-coverage.test.ts` and
`src/app/components/ui/modalFocus.test.ts` - some of this repo's most
load-bearing structural guards - **and both files the scope built its two
empirical proofs on.**

Section 1 does disclose the undercount and names
`referencesUngradedFlag` as an example, and routes the refinement to Wave 1. What
it does not do is (i) quantify it, (ii) notice that `canvas-client-boundary.test.ts`
is invisible too, or (iii) notice that Wave 3's FROZEN allowlist is seeded from
the unrefined proxy and is explicitly scheduled not to wait for Wave 1. The
consequence is exact: after Wave 2b fixes `grade-result-doors.wiring.test.ts`,
the ratchet cannot credit the fix, because the file was never in the allowlist;
and a newly added boolean-shaped undefended presence check passes the ratchet
silently, forever.

R7 does not cover this. R7 is behaviour-blindness (a helper that runs but is
wrong). This is SHAPE-blindness - an assertion the census cannot see at all.

**Disposition:** fixable in the one revision. Either sequence Wave 3 strictly
after Wave 1's refined classification, or state the ratchet's population as
`.toContain`/`.toMatch`-shaped only and add the boolean-returning shape to the
census before freezing.

---

### B5 - the absence direction is classified against the scope's own adopted rule, has no requirement and no wave

**Class: A FINDING CLASSIFIED AGAINST THE ARTIFACT'S OWN ADOPTED RULE, with no
receiver. NEW.** (Linked to B1(a) - fixing B1(a) is a precondition for fixing
this - but the corrective rule differs: this needs a ruling on the rule, not the
re-carrying of a table row. The orchestrator arbitrates if it disagrees.)

Section 2 re-adopts: "absence assertions may need it removed". The L9 backlog row
states the reason: "a commented-out forbidden call is still a signal worth
failing on".

Section 3b then calls Fixture A - the `//`-commented forbidden import producing
zero violations - "correctly", and Fixture B - the same import in a `/* */`
block comment producing one violation - "the mirror-image defect ... it FALSELY
FIRES on the former". Under the rule Section 2 just re-adopted, that is exactly
inverted: Fixture B conforms to the rule and Fixture A is the rule's violation.

Two things follow, and neither is in the artifact:

- **`canvas-client-boundary.test.ts` is a Wave 2a candidate** under the adopted
  rule (its `^import` anchor is a de facto line-comment strip), yet
  `docs/l9-scope.md:415-418` cites it as the reason Wave 2a's list is empty.
- **No wave fixes what Section 3b calls a defect.** Wave 2a removes stripping
  (wrong direction), Wave 2b adds it to presence assertions. Fixing Fixture B
  requires comment-AWARE matching on an absence guard - the option prior Section
  3 demanded a decision on and B1(a) shows was dropped. R2 measures only whether
  the pattern currently occurs, not who fixes it. So half the row's own subject
  ships with zero requirements.

**Disposition:** owner decision on the rule (stated at the end), then
transcription. The classification inside Section 3b is fixable in the revision
either way.

---

## MAJORS

### M1 - R2's owner is fabricated; per `iteration-caps.md:167` that makes it a deletion

`docs/l9-scope.md:454` gives R2's owner as "The fix wave's first step (A42's own
STEP field already claims this sweep as its job)".

Measured (`row.py A42 98` against the header row at `docs/BACKLOG.md:77`): the
schema is `area | id | state | title | owns | verify | blocked_by | instrument |
from | note | question`. **There is no STEP column.** A42's `owns`, `verify` and
`blocked_by` are all `-`, which the backlog's own header (`docs/BACKLOG.md:18`)
defines as "Nobody works it until someone gives it both".

A42's `note` does contain inline `STEP:` prose, and it claims a different sweep
over a different population: a `/*`-outside-comment sweep across the 85-file
`stripComments` dependent set. `src/lib/canvas-client-boundary.test.ts` is not in
that population - `grep -c stripComments src/lib/canvas-client-boundary.test.ts`
returns 0, and `census.py` confirms it is absent from the 87-file
`[\s\S]*?\*\/` set.

The prior pass wrote this correctly: "this is a NARROWER INSTANCE of A42's own
STEP field". This revision dropped "narrower instance of" and now asserts A42
already owns it. It does not. R2 therefore has no real owner.

**Disposition:** fixable in the one revision - restore the prior wording, or name
a real receiver.

### M2 - "A42 already has its own filed scope" is false, contradicts Section 4, and is one of the two stated grounds of the standing ruling

`docs/l9-scope.md:508`: "A42 already has its own filed scope, its own STEP field,
and its own owner path". `docs/l9-scope.md:308` in the same document: A42 "is
still `unscoped` today".

Measured: `ls docs/ | grep -i "a42"` returns nothing (only `l9-scope.md` matched
the combined pattern). A42's `state` is `unscoped`. No filed scope exists.

**This is flagged against the ruling, not to reopen the fork.** The ruling
handed to this check is "keep them separate, since A42 has its own filed scope
and owner path". The first ground is false and the second is false as stated
(`owns` is `-`). The ruling's CONCLUSION survives on the ground the brief also
gives - "L9's other waves do not need it" - which my measurements support: Waves
1 and 3 touch no stripping regex, and B3's Wave 2b candidate scans `.ts`/`.tsx`
for an identifier and a word, never an `accept=` attribute. Recommend the ruling
be restated on that ground alone, and `docs/l9-scope.md:508` corrected, so a
later session does not inherit "A42 is scoped" as a fact.

### M3 - R5's instrument targets a generated file and cannot be executed

`docs/l9-scope.md:457` assigns R5 to "Whichever agent next edits
`docs/BACKLOG.md`" with the instrument "The two rows themselves, cross-linked
explicitly" in "`docs/BACKLOG.md`'s L9 and A42 rows".

`docs/BACKLOG.md:3-6` states it is GENERATED from `docs/backlog.yml`, must not be
hand-edited, and that `npm run backlog:check-generated` "fails the moment it
drifts from a fresh render (Ruling BA-6)". That script exists at
`package.json:13`. The prior R5 named `docs/backlog.yml` correctly, twice.

As written, R5's instrument is a forbidden action that fails a gate.

**Disposition:** fixable in the one revision - retarget to `docs/backlog.yml`.

### M4 - the sabotage canary, the artifact's own load-bearing instrument, is the weakest requirement in the document

Asked as the brief asks: which single clause is most likely to be implemented
exactly as written and still produce a bad result? This one.

`docs/l9-scope.md:380-388` specifies: "comment out ... the capability the
assertion guards, run the REAL test, and confirm it goes RED; then restore the
capability and confirm GREEN again."

Four gaps, each of which lets an implementer substitute a description of a
sabotage for its red output:

1. **No command is named.** Raw `vitest run a b` silently drops unmatched paths
   and exits 0; the wrapper is `npm run test:paths -- <path>`. Section 11 uses
   the wrapper correctly for its own gate, so the omission here is
   inconsistent within the document, not a house convention.
2. **No discriminating count.** The cited precedent (`6125260`, per the L9 row)
   required "exactly one failure - the target assertion". Section 6 requires only
   "goes RED". A test file that goes red for an unrelated reason satisfies it.
3. **The red output is not required to land anywhere.** No artifact, no paste,
   no recorded exit code. Compare `iteration-caps.md:169`: "Disposal is recorded
   with evidence, not asserted."
4. **"revert and re-apply" drops the restore discipline of its own precedent.**
   The L9 row records `6125260` restoring "from a cp backup each time rather
   than any repo-wide git operation", because `git checkout --` on an
   uncommitted file reverts to the index and destroys the chunk's work.

A fifth, structural: Section 6 mandates sabotaging the REAL tree inside the
wave's own commit. `docs/DEV_LOOP.md`'s standing rules list "no two agents may
sabotage-verify on the tree at once" as a shared resource invisible in any file
list. R6 covers a sibling's assumptions breaking; nothing covers sabotage
exclusivity. Wave 4's targets (`steps.grading-draft-flow.ts`,
`useRepoGradesGradingActions.ts`) are exactly the kind of file a sibling holds.

**Disposition:** fixable in the one revision.

### M5 - Proof 1 does not isolate its mechanism, and the stronger proof was one command away; R4 defers work a requirement should do

Proof 1 reproduces: `proof1.ts`, extracting `referencesUngradedFlag` verbatim
from `:78-80`, confirms the guard line
`    if (cell.status !== "ungraded") return;` occurs exactly once, that the
original returns `true`, and that Variant B (guard replaced with a comment
containing the word) still returns `true`. Independently confirmed:
`grep -n -i "ungraded" src/app/components/repo-grades/useRepoGradesGradingActions.ts`
returns `:260` (comment), `:263` (code), `:338` (comment), exactly as claimed,
and `:554`/`:674` both call `postCanvasGradesAction(`.

But Variant B injects a NEW comment containing the word into a file that already
has two, so it cannot distinguish "my injected comment satisfied the predicate"
from "the pre-existing comments did". Variant C (word fully scrubbed) is a
control for "the function is not always true", not for Variant B.

The variant that isolates it - and that the scope did not run - is deletion with
no replacement. Measured (`proof1.ts`, Variant D: the guard line deleted
outright, `:260` and `:338` untouched):

```
variantD deleted the guard (length shrank):                         true
variantD still a caller of postCanvasGradesAction(:                 true
variantD referencesUngradedFlag (blind WITHOUT any commenting-out):  true
variantD stripped referencesUngradedFlag (what a fix would see):     false
```

So the test is comment-satisfied for this file TODAY with no commenting-out at
all - a stronger statement than the artifact makes - and stripping is
demonstrably the discriminating fix, which is the evidence Wave 2b actually
needs and the artifact does not have.

R4 ("Section 3 sampled exactly 2 of 208") defers this, but for the ONE test the
scope already chose the sweep is a single command over its own caller set, and I
ran it in B3. A residual must not carry work a requirement can discharge inside
the scope.

**Disposition:** fixable in the one revision - fold the Variant D result and
B3's caller table in, and narrow R4 to the files outside this test.

---

## MINORS

- **m1. Census drift, not error.** Re-measured now:
  `grep -rl readFileSync --include=*.test.ts src | wc -l` = **209**,
  `grep -rl stripComments --include=*.test.ts src | wc -l` = **71**,
  `find src -name "*.structure.test.ts" | wc -l` = **22**,
  `find src -name "*.wiring.test.ts" | wc -l` = **79**. The first ran at 208
  earlier in this same session and at 209 twice afterwards, with sibling commits
  landing in between; `diffA.py` shows grep and an independent Python walk agree
  exactly at 209, so this is tree drift and not a two-instrument disagreement.
  The scope's 208 was almost certainly right when taken. Recorded because Wave 1's
  write set is stated as "the 208-file population" and that number moves under it.
- **m2. The two-population table does not reproduce.** From the scope's own stated
  recipe over my 112-file gap (`census.py`): presence-shaped files **82** (scope:
  81), absence-shaped **69** (68), both **63** (62), presence occurrences **842**
  (839), absence occurrences **359** (353). Direction: mine higher throughout.
  The conclusion the table supports - that it is a floor and a proxy - is
  unaffected; the numbers are not reproducible from the named command.
- **m3. R3's explanation does not survive re-measurement.**
  `src/lib/decks/deck-source.test.ts:116` is
  `.replace(/\/\*[\s\S]*?\*\//g, "")`, so the file unambiguously contains the
  literal and is correctly outside the gap under either subtraction order
  (`census.py`: in A = True, in B = False, in the literal set = True, in the gap
  = False). Whatever the 111-vs-114 disagreement is, it is not this file.
  (Note: my own `grep -c` for that literal on that file returned 0 from a
  mis-escaped pattern before the Python search found it - the same instrument
  failure the artifact reports, reproduced on a third tool.)
- **m4. Section 11's reason is false, though its conclusion is right.** Both
  declared gates scan `docs/`: `src/lib/no-emojis.test.ts:237,254` walks
  `["src", "docs"]` with `.md` in `SCAN_EXTENSIONS`, and
  `src/source-bytes.structure.test.ts:48,50` walks `process.cwd()` with `.md` in
  `TEXT_EXTENSIONS`. So "this pass touches no file either gate scans" is wrong.
  I re-ran the gate: `npm run test:paths -- src/lib/no-emojis.test.ts
  src/source-bytes.structure.test.ts` exits 0, `Tests 21 passed (21)`,
  `COVERED ... no-emojis ... passed=18`, `COVERED ... source-bytes ... passed=3` -
  identical to the artifact's claim. The file is byte-clean (no NUL, no BOM; its
  only non-ASCII character is U+2192, which both gates allow). Right conclusion,
  wrong reason, in the section whose job is proving the gates were honoured.
- **m5. Citation off by two.** `findClientUnsafeBarrelImports` spans
  `src/lib/canvas-client-boundary.test.ts:132-181`; cited as `:132-179`.

---

## Confirmed sound - not re-litigated

One line each, deliberately not padded.

- **Proof 2 reproduces exactly.** `mk_proof2.py` sliced
  `src/lib/canvas-client-boundary.test.ts:71-181` verbatim (asserting on
  `UNSAFE_BARRELS`, the function name and the `^import` anchor before writing),
  ran under `node --experimental-strip-types`, exit 0: Fixture A (`//`) = `[]`,
  Fixture B (`/* */`) = one violation, Fixture C (live) = one violation. My two
  added controls: a nonexistent barrel, live = `[]`; a block comment not at line
  start = `[]`. Line numbers differ from the artifact's only because our
  fixture preambles differ. The mechanism claim is correct; only its
  CLASSIFICATION is wrong (B5).
- **The A42 regex-literal census reproduces exactly**: 87 files in all of
  `src/`, 86 `*.test.ts`, 107 total occurrences, and the same **5** `[^]*?`
  sibling files by name (`census.py`, literal built with `chr(92)`, canary 0).
- **Both documented instrument failures propagated correctly.** The corrected
  87/107 are the figures I reproduce independently, and Proof 2 - the artifact
  it says a heredoc corrupted - runs clean. No stale pre-correction number
  survives downstream.
- **All four test-run citations reproduce**: `npm run test:paths --
  src/lib/grade/grade-result-doors.wiring.test.ts
  src/lib/canvas-client-boundary.test.ts` exits 0 with `Tests 22 passed (22)`,
  `COVERED ... grade-result-doors ... passed=7`, `COVERED ...
  canvas-client-boundary ... passed=15`.
- **Every gate and instrument in the artifact uses `npm run test:paths --`.** No
  raw multi-path `vitest`/`npm test` appears anywhere. The one gap is that
  Section 6's canary names no command at all (M4.1).
- **The reuse survey is accurate.** `grep -rn 'from "./modalAdoptionScan"'
  src/app/components/ui` returns exactly the 2 files claimed
  (`modalAdoption.wiring.test.ts`, `modalAdoptionWiring.attributes.test.ts`),
  and `GradingRecordingPanel.wiring.test.ts:38` carries the house-rule quote
  verbatim.
- **No test asserts an exact count of `*.structure.test.ts` files**
  (`wave2a.py`, over the 46 test files mentioning the suffix), so Wave 3's new
  file trips no counter. `src/file-size-ceiling.structure.test.ts` exists, so the
  ratchet precedent is real.
- **Section 9's refusal to claim leverage is correct** under `docs/DEV_LOOP.md`,
  which scopes the claim to a capability a user reaches.
- **The A42 dependency is stated correctly under the standing ruling.** Wave 2b
  is gated file-by-file rather than wholesale; Waves 1, 2a and 3 are ungated; the
  named Wave 2b candidate is correctly assessed as MIME-wildcard-free.

---

## The feature-already-exists case, argued at its strongest

The strongest version: 97 of 209 `readFileSync` test files already strip
comments by one of three idioms (`wave2a_refine.py`), the one armed instance the
prior pass could prove was fixed at `6125260`, and the artifact's own absence
proof is dormant - so L9 could be read as a class already 46% covered with no
live instance left, and closed.

That case fails on one measurement. `src/lib/workflows/registry/steps.grading-draft-flow.ts`
satisfies `grade-result-doors.wiring.test.ts` through three comment lines and
nothing else (`which_lines.ts`), which is a live, currently-armed instance of the
exact defect, in a test that ships green today. The row is real and should stay
open.

---

## The silent-green failure this could ship as

Named specifically, as the brief requires. Waves 1-4 land. Lint passes, `tsc`
passes, `next build` passes, every `*.structure.test.ts` and `*.wiring.test.ts`
passes, and the sabotage canary reports red-then-green. And:

1. Wave 3's allowlist never contained `grade-result-doors.wiring.test.ts` (B4),
   so Wave 2b's fix is uncredited, and the next boolean-shaped undefended
   presence check added anywhere in `src/` passes the ratchet silently.
2. Wave 2b's commit turns `grade-result-doors.wiring.test.ts` red on
   `steps.grading-draft-flow.ts` (B3). The cheapest green is to widen the
   predicate back out or add the word to a comment in that file - restoring the
   defect inside the commit that claims to fix it. Nothing in the plan forbids
   that, and Wave 4's canary would still go red-then-green, because it sabotages
   a DIFFERENT file.
3. Wave 2a ships empty (B2), so 95 measured absence assertions over stripped
   text are untouched and the row is reported closed on half its subject.

Every gate here is green at every step. vitest is node-env and renders no
component, so nothing outside these instruments is watching.

---

## What is dispatchable as it stands

- **Wave 1 (triage), yes** - with B1(c)'s three-part write set restored, B4's
  shape-blind classes added to the census before anything is frozen, and B2's
  fourth bucket for stripper canaries.
- **Section 5's remedy comparison and recommendation, yes.** The three shapes are
  costed honestly and Shape (3)'s false-positive mode is stated rather than
  hidden.
- **Section 9, yes**, unchanged.
- **Wave 2a, NO** - unsized and unfenced (B2), and its emptiness rests on a
  classification that inverts the adopted rule (B5).
- **Wave 2b, NO** - write set incomplete and the standalone claim false (B3).
- **Wave 3, NO** - freezing a ratchet over a blind population (B4). Wave 3 is
  the part that must not be dispatched while Wave 1 can proceed, since freezing
  the allowlist is the irreversible step.
- **Wave 4, NO** - instrument under-specified (M4).

---

## Stopping point

**RULINGS and DESIGN.** Measurement is finished: the census, both populations,
the Wave 2a floor and ceiling, the Wave 2b caller set and the ratchet's blind
spot are all measured in this document with their commands. What remains is one
ruling the loop cannot take from the code, and a revision that applies it.

---

## The question for the owner, shaped so every answer ends the activity

This is the decision the PRIOR L9 pass demanded and this revision dropped without
recording it (B1(a)). It is not a fork between plans; it is a single rule the
whole absence half of L9 hangs on, and no further round can settle it from the
tree.

**For a source-scanning assertion that something is ABSENT - a forbidden import,
a forbidden call, a deleted helper - does a COMMENTED-OUT occurrence count as a
violation?**

The backlog row's stated rule says yes ("a commented-out forbidden call is still
a signal worth failing on"). The tree disagrees with itself: 95 such assertions
across 30 files run on comment-STRIPPED text today, and
`canvas-client-boundary.test.ts`'s own author wrote a third behaviour - ignore
`//`, fire on `/* */`.

- **Answer A - a commented occurrence IS a violation** (the row's rule stands).
  Then: Wave 2a's population is the 95 measured assertions, with a named
  exclusion for the 21 stripper canaries; `canvas-client-boundary.test.ts`'s
  block-comment firing is CORRECT and Section 3b's "falsely fires" is withdrawn;
  the `//`-ignoring anchor becomes a Wave 2a item. No fifth wave.
- **Answer B - a commented occurrence is NOT a violation** (only live code
  counts). Then: Wave 2a closes empty and is deleted from the plan;
  `canvas-client-boundary.test.ts`'s block-comment firing IS the defect and gets
  its own wave with comment-aware matching; and the L9 row's stated triage rule
  is amended in `docs/backlog.yml`.
- **Answer C - it depends on the construct, so an absence assertion must be
  comment-AWARE rather than strip-or-not.** Then: Wave 2a becomes "make the 95
  comment-aware, one decision per assertion", which is the largest wave and the
  only one that also covers Section 3b's finding, and Wave 1's triage gains a
  per-assertion column for it.

Whichever answer arrives, the revision is transcription: it sizes Wave 2a, fixes
Section 3b's classification, and settles whether a fifth wave exists. Nothing
else in the artifact is reopened by it, and B2 through B5 plus all five majors
are fixable in the same single revision regardless of which answer comes back.

---

## `git status --short` at the end of this pass

Immediately before writing this file:

```
 M docs/backlog.yml
 M docs/css-orphans.md
```

Immediately after writing it, and after re-running the two structural gates
(`npm run test:paths -- src/lib/no-emojis.test.ts
src/source-bytes.structure.test.ts`, exit code 0, `Tests 21 passed (21)`, read
from the command and not through a pipe - both gates DO scan `docs/`, so this
file is inside their population):

```
 M docs/css-orphans.md
 M src/app/components/walkthrough-announcement/walkthrough-announcement.structure.test.ts
?? docs/l9-check.md
?? src/app/components/walkthrough-announcement/walkthrough-announcement-timing.structure.test.ts
```

`docs/l9-check.md` is MINE and is the only file this pass wrote. Everything else
in both listings is sibling-owned and was not touched by this pass:
`docs/css-orphans.md`, `docs/backlog.yml` (since committed by its owner; it was
explicitly outside my write set and was read only via the generated
`docs/BACKLOG.md`), and the two
`src/app/components/walkthrough-announcement/*` paths, which appeared during
this pass. The tree changed materially
during this pass (session start showed nineteen modified paths under
`src/lib/grade*`, `src/app/actions/grading*`, `src/lib/embedded-grader/*` and
`src/app/components/walkthrough-announcement/*`; those siblings have since
committed, and a `src/app/components/snapshot-grading/*` sibling appeared and
committed mid-pass). No `git stash`, no `git add -A`, no `git checkout --` was
run at any point.
