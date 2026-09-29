# N13b Wave 1 - test notes and frozen oracle (security name-filter)

Area: grading-run-survival-and-disclosure. Seat: `loop-test-author`. This is the
TEST NOTES round for N13b WAVE 1 ONLY - the pre-existing student-name leak into
the class-addressed draft. Round 1; a fresh `loop-checker` reads this before any
implementer writes test code. I authored these notes; I do not check them.

Scope is EXACTLY the name-filter, per the orchestrator ruling recorded in
`docs/n13b-security.md` R5 (2026-09-29) and the write set fixed in
`docs/n13b-waves.md` section 2 "Wave 1". It is independent of AC-1/AC-2/AC-6/
AC-9 and the identity seam (later waves). No oracle here is for the subset
count, the instructor list, or the repo identity channel. AC-8 is the criterion
this wave delivers, restricted to the FREE-TEXT leak (L5/L6/L7/L8).

Every file:line cited below was opened this pass. Every quantity names the
command that produced it. Nothing is recalled.

---

## 0. The seam this oracle drives (fixed by the wave plan, not by me)

`docs/n13b-waves.md:138-153` (the wave plan's MECHANISM RULING) fixes the
identifier-set seam, and my oracle must drive that seam rather than invent one:

- `composeClassTrendsDraft(report, observations, assignmentName)` keeps its
  THREE-parameter signature UNCHANGED (`class-trends-draft.ts:118-122`). No new
  parameter. Consequence: the existing arity regression test
  (`class-trends-draft.test.ts:77-79`, `expect(composeClassTrendsDraft.length).toBe(3)`)
  stays green for free - it is a preserved invariant of this wave, not a new
  requirement, and the implementer must NOT change the signature.
- A new scan-only field `ClassTrendsReport.knownIdentifiers: readonly string[]`
  carries the run's own identifier strings. It is populated by
  `computeClassTrends` (`class-trends.ts:347-354`, the ONE non-test constructor
  of the full report shape) from `result.student` on every graded result, plus
  the owner/label segment of `gradedRepo`/`gradedRef` where present.
- `composeClassTrendsDraft` SCANS the whole assembled Markdown against
  `report.knownIdentifiers`. `knownIdentifiers` is scanned against, NEVER
  interpolated into the Markdown, so it does not itself become a leak channel.

Blast radius of the new field, measured
(`grep -l "ungraded:\s*\{\s*notAttempted" src`, then reading each): exactly TWO
runtime/test constructions of the full `ClassTrendsReport` literal shape exist -
`computeClassTrends` (`class-trends.ts:347`) and the `makeReport` helper in
`class-trends-draft.test.ts:30-42`. (`docs/a25-scope.md` also matched, but it is
documentation, not code.) Both are inside Wave 1's write set, so adding a
REQUIRED field is satisfiable without touching any file outside the wave. The
implementer must set `knownIdentifiers` in BOTH, and the composer should read
`report.knownIdentifiers ?? []` so a persisted/older report missing the field at
runtime fails safe (scans against an empty set) rather than throwing.

---

## 1. The three free-text leak inputs (derived, not recalled)

Per the section-3 CORRECTIVE RULE in `docs/n13b-security.md:193-201`, the leak
set is DERIVED from the three inputs `composeClassTrendsDraft` interpolates into
its returned Markdown, read directly from the code this pass:

- **(a) `assignmentName` (L8)** - interpolated into the UNCONDITIONAL opening
  line at `class-trends-draft.ts:136`
  (`A note on ${assignmentName || "this assignment"}, based on the ${report.totalResults} submissions graded so far:`).
  Present whenever status is "ok". Its only current filter is
  `containsForbiddenCompletenessPhrase(assignmentName)` (`:127`) - a
  completeness-phrase check, NEVER a name check.
- **(b) `displayArea` (L7)** - interpolated by `renderCountedClause`
  (`:80-89`, at `:83`/`:85`) for a fully-covered high/low area. Only filter is
  `containsForbiddenCompletenessPhrase` on the assembled clause (`:146`).
- **(c) `observation.concept` / `observation.reading` (L5/L6)** - interpolated
  by `renderInferredClause` (`:104-116`, at `:115`). Only filter is
  `isLikelySingularSubmissionClaim` (`:99-102`) - a singular-phrase check,
  NEVER a name check.

The filter must scan the WHOLE returned Markdown (or, equivalently, all three
inputs). A filter scoped to one clause renderer leaves the other inputs open -
that is exactly how L8 (the opening line) was almost missed, per the security
pass.

---

## 2. PROVEN RED against the current tree (measured this pass)

Command (temporary test importing the REAL `composeClassTrendsDraft`, deleted
after measuring):

```
npx vitest run src/lib/grade/__scratch_wave1_red.test.ts
```

Result: `Test Files 1 failed (1)`, `Tests 3 failed (3)`. Each of the three
seeded inputs leaks a distinctive marker (`Zbrinqua Qwelford`) into the returned
`status: "ok"` Markdown, verbatim:

- (a) `assignmentName = "Makeup exam - Zbrinqua Qwelford"` ->
  `AssertionError: expected 'A note on Makeup exam - Zbrinqua Qwel...' not to contain 'Zbrinqua Qwelford'`.
  The name reaches the OPENING LINE.
- (b) `displayArea = "Peer review of Zbrinqua Qwelford"`, area low+fully-covered
  -> the name reaches a COUNTED CLAUSE.
- (c) `observation.reading = "echoing Zbrinqua Qwelford verbatim"` -> the name
  reaches an INFERRED CLAUSE.

This is a LIVE, pre-existing leak: today NONE of the three inputs is
name-filtered. Any wave-1 test that seeds a name and asserts its absence MUST be
red on the current tree before the fix lands. A test green on today's code is
not measuring the fix - it is the silent-green failure this seat exists to
prevent. The three expected failures above are the acceptance condition for
"the oracle is armed."

---

## 3. PROVEN SATISFIABLE - reference implementation, green in isolation

Command (throwaway reference reimplementing the composer's exact interpolation
lines plus the filter; deleted after measuring):

```
npx vitest run src/lib/grade/__scratch_wave1_green.test.ts
```

Result: `Test Files 1 passed (1)`, `Tests 8 passed (8)` - the three
seeded-absence cases, three clean-pass controls, the arity check, and the
blank-identifier guard all pass.

The reference filter (pure, no model call, satisfies AC-10) is a case-insensitive
substring scan over the assembled Markdown against the identifier set:

```
function carriesIdentifier(text, identifiers) {
  const lower = text.toLowerCase();
  return identifiers.some((id) => {
    const t = id.trim().toLowerCase();
    return t.length > 0 && lower.includes(t);
  });
}
```

applied as a final gate after the existing composed-Markdown completeness net
(`class-trends-draft.ts:170`): if `carriesIdentifier(markdown, report.knownIdentifiers ?? [])`,
the draft is rejected (or the offending clause is dropped - see below). The
reference proved satisfiability by supplying the identifier set as an argument;
under the wave-plan seam the SAME array arrives as `report.knownIdentifiers`.
The filter body is identical; only the array's SOURCE differs, so the
satisfiability proof holds unchanged. The collector side (`computeClassTrends`
mapping `gradedResults(entry.run.results)` to `.student` plus the `gradedRepo`
segment) is a trivial pure map, constructible with no new import.

**Drop-vs-reject is NOT pinned by this oracle.** Both are safe: for `displayArea`
and `concept`/`reading`, dropping the offending clause and rendering the rest
"ok" keeps the name off the class text; for `assignmentName` (opening line is
unconditional) the composer must reject or substitute the fallback, since the
clause cannot be dropped. The oracle pins the FACT (no seeded identifier in the
class-addressed text) and the clean-pass controls (a clean draft still renders),
not the branch. `docs/n13b-waves.md:134-136` leaves the branch to this seat and
the implementer; I leave it open deliberately.

---

## 4. ATTACK ON MY OWN GUARD - the degenerate that the seeded assertions miss

Measured this pass: I mutated `carriesIdentifier` to `... || true` (reject
everything) and re-ran the green suite:

```
npx vitest run src/lib/grade/__scratch_wave1_green.test.ts
-> Tests 4 failed | 4 passed (8)
```

The FOUR failures were all clean-pass controls and the blank-identifier guard.
The THREE seeded-absence assertions (W1-1/2/3) PASSED VACUOUSLY - a composer
that rejects every draft produces no "ok" Markdown, so "if status ok, assert
absence" is satisfied by having no "ok" result at all.

This is the whole reason the clean-pass controls (W1-4) are load-bearing and not
decoration. A wave-1 oracle that ships only the three seeded-absence assertions
would go GREEN on a filter that suppresses the entire feature - the "criterion
satisfied one step short" / "reject-everything passes the leak test" class. The
clean-pass controls are the instrument that discriminates a working filter from
a mute one, and they must ship in the same file.

---

## 5. Requirements

Each names its OBJECT, INSTRUMENT, and DIRECTION of failure, and its SABOTAGE.
The distinctive marker `SEED = "Zbrinqua Qwelford"` (two capitalised words, no
completeness phrase, cannot occur incidentally, long enough that it cannot
over-match - see the R-OVERMATCH residual) is used throughout. Instruments are
node-env vitest unit tests over pure functions - NO component renders here, so
no requirement's only enforcer is a render.

### Group A - the filter, driven through `composeClassTrendsDraft` with `report.knownIdentifiers` pre-seeded (file: `class-trends-draft.test.ts`)

**W1-1 - a name in `assignmentName` does not reach the class text (L8).**
- Object: the returned `status: "ok"` Markdown, versus `SEED`.
- Instrument: `composeClassTrendsDraft(report, [], "Makeup exam - " + SEED)` with
  `report.knownIdentifiers = [SEED]` and one fully-covered high area so a body
  clause exists. Substring search for `SEED` in `result.markdown`.
- Direction: RED if `result.status === "ok"` and `result.markdown` contains
  `SEED`. (A `rejected`/`empty` result also passes - the name never reaches the
  class text either way.)

**W1-2 - a name embedded in `displayArea` does not reach the class text (L7).**
- Object: the returned "ok" Markdown, versus `SEED`.
- Instrument: one low+fully-covered area with `displayArea = "Peer review of " + SEED`,
  `report.knownIdentifiers = [SEED]`. Substring search in `result.markdown`.
- Direction: RED if status "ok" and Markdown contains `SEED`.

**W1-3 - a name in a hand-built observation's `concept`/`reading` does not reach
the class text (L5/L6).**
- Object: the returned "ok" Markdown, versus `SEED`.
- Instrument: `composeClassTrendsDraft(report, [obs({ reading: "echoing " + SEED + " verbatim" })], "Essay 1")`,
  `report.knownIdentifiers = [SEED]`. The observation must NOT trip
  `isLikelySingularSubmissionClaim` (avoid "one/a/this submission" phrasing).
  Substring search in `result.markdown`. Also run a variant seeding `concept`,
  not `reading`, since `renderInferredClause` reads both (`:112`).
- Direction: RED if status "ok" and Markdown contains `SEED`.

**W1-4 - clean-pass controls (the anti-degenerate; load-bearing per section 4).**
Three cases, each supplying the SAME `knownIdentifiers = [SEED]` but with NO
occurrence of `SEED` in any free-text input:
- (i) a clean high area `displayArea = "Thesis Statement"` -> status "ok" AND
  `markdown` contains `"Thesis Statement"`.
- (ii) a clean observation (`concept: "correlation vs causation"`,
  `reading: "several conflated the ideas"`) -> status "ok" AND `markdown`
  contains the fixed marker `"my own reading, not a count"`.
- (iii) `assignmentName = "Essay 1"` -> status "ok" AND `markdown` contains
  `"A note on Essay 1"`.
- Object: the returned status and body, versus "renders normally when no
  identifier is present".
- Direction: RED if any clean case is suppressed (status not "ok", or the
  expected content absent). This is the ONLY instrument that discriminates the
  reject-everything mutant (SAB-4).

**W1-5 - the scan is a SUBSTRING match, not field equality (anti near-miss).**
- Object: the returned "ok" Markdown, versus `SEED`, when `SEED` occurs as a
  SUBSTRING inside a longer free-text value (never as the whole field).
- Instrument: W1-1/W1-2/W1-3 already embed `SEED` inside surrounding text
  ("Makeup exam - ...", "Peer review of ...", "echoing ... verbatim"), so they
  double as this requirement. State it explicitly so a checker sees the intent:
  a filter that only matched when a field EQUALS an identifier (the
  `.student`-field near-miss transposed to this filter) would let all three
  through.
- Direction: RED if an embedded-substring occurrence of `SEED` survives.

**W1-6 - a blank/empty identifier never suppresses a clean draft
(anti match-everything).**
- Object: the returned status, versus "a clean draft still renders when the
  identifier set contains an empty or whitespace-only string".
- Instrument: a clean high area, `report.knownIdentifiers = ["", "   "]`.
- Direction: RED if the draft is suppressed (status not "ok"). Guards the
  `text.includes("")` trap, where an empty identifier matches every string and
  silently rejects every draft. A blank `.student` is reachable in practice
  (the repo surface sets `.student = label?.trim() || digest.fullName`,
  `github-repos.ts:619`, and both can be empty), so this is a real state, not a
  hypothetical.

### Group B - the collector, driven through `computeClassTrends` (file: `class-trends.test.ts`)

**W1-7 - `computeClassTrends` populates `knownIdentifiers` from the run.**
- Object: `report.knownIdentifiers`, versus the set of identifier strings the
  run carries (`gradedResults(entry.run.results).map(r => r.student)`, plus the
  owner/label segment of any `gradedRepo`).
- Instrument: build a `GradingRunEntry` with a graded result whose
  `student = SEED`, and (a second fixture) a result carrying a `gradedRepo` like
  `"octo-student/hw1"`. Assert `report.knownIdentifiers` includes `SEED`, and
  includes the repo-owner segment `"octo-student"`.
- Direction: RED if a run student identifier (or the `gradedRepo` owner segment)
  is absent from `knownIdentifiers`. This is the FIRST `.student` read in
  `class-trends.ts` (`grep -n "\.student\b" src/lib/grade/class-trends.ts` ->
  empty today, confirmed in `n13b-waves.md:66-69`); it is not banned by any
  source-text test.

### Group C - end-to-end reachability (file: `class-trends-draft.test.ts`, importing both production functions)

**W1-8 - a seeded name flows through the REAL path and does not survive.**
- Object: the class-addressed Markdown produced by the production sequence
  `computeClassTrends(entry) -> composeClassTrendsDraft(report, observations, entry.assignmentName)`,
  versus `SEED`. This is exactly the sequence the panel runs
  (`ClassTrendsPanel.tsx:91` computes the report; `ClassTrendsDraftPanel.tsx:46`
  composes) - the production path, not a hand-built report.
- Instrument: a `GradingRunEntry` with a graded result whose `student = SEED`,
  whose rubric area is scored high/low and fully covered, AND whose area name
  (`displayArea` source) contains `SEED` (the L7 "rubric named after a student
  in the class" threat). Run the real two-function sequence; substring-search
  for `SEED`. A companion sub-case puts `SEED` in `entry.assignmentName` (L8),
  the student being in the run. Import `computeClassTrends` and
  `composeClassTrendsDraft` from their production modules - NOT from any
  `*.test.ts` (no cross-test-file import; duplicate any helper needed).
- Direction: RED if `SEED` appears in the composed class text. This is the ONLY
  instrument (with W1-7) that catches a filter that reads `report.knownIdentifiers`
  correctly but whose collector never fills it - the "ships dead with an empty
  denylist" mutant (SAB-5). Group A alone hand-builds `knownIdentifiers` and so
  is BLIND to a dead collector.

---

## 6. Sabotage register (named mutation, RED/GREEN, discrimination stated)

Each sabotage is applied, the suite runs RED, the mutation is restored, the
suite runs GREEN. State for each which requirement kills it, and - where a
requirement is BLIND to it - say so, because a sabotage caught by nothing is
worse than none.

- **SAB-1 - delete the whole-Markdown identifier scan block in
  `composeClassTrendsDraft`.** This IS the current-tree state (proven RED,
  section 2). RED: W1-1, W1-2, W1-3, W1-8. GREEN after restore. Clean controls
  (W1-4) green both ways. DISCRIMINATES (the primary kill).

- **SAB-2 - scope the scan to `renderInferredClause` only, leaving the opening
  line and counted clauses unscanned** (the "L8 almost missed" mutant). RED:
  W1-1 (assignmentName) and W1-2 (displayArea). GREEN: W1-3. GREEN after
  restore. DISCRIMINATES - proves the scan covers all three inputs, not just the
  model clause. (A variant scoping to the body clauses but not the opening line
  is caught by W1-1 specifically - the reason W1-1 is separated from W1-2/3.)

- **SAB-3 - change `includes` to `===` (field equality instead of substring
  scan).** RED: W1-1, W1-2, W1-3 (all embed `SEED` in surrounding text, so
  equality fails to match). GREEN after restore. Clean controls green.
  DISCRIMINATES - this is the near-miss guard (W1-5): a name is free text inside
  a larger string, not a whole field.

- **SAB-4 - make `carriesIdentifier` always return `true` (reject every
  draft).** RED: W1-4 (all three clean-pass controls) and W1-6. GREEN after
  restore. BLIND: W1-1, W1-2, W1-3, W1-8 all PASS VACUOUSLY (measured, section
  4) - a rejected draft has no "ok" Markdown to search. DISCRIMINATES ONLY via
  the clean-pass controls. STATED LOUDLY: the seeded-absence assertions do not
  catch this mutant; if the clean-pass controls are ever dropped, this mutant
  ships green and the feature is mute.

- **SAB-5 - in `computeClassTrends`, set `knownIdentifiers = []` (collector
  reads nothing).** RED: W1-7 (collector) and W1-8 (end-to-end - the field is
  empty so the filter catches nothing on the real path). GREEN after restore.
  BLIND: W1-1, W1-2, W1-3, W1-4, W1-5, W1-6 all pass - Group A hand-builds
  `knownIdentifiers` and never exercises the collector. DISCRIMINATES ONLY via
  W1-7 + W1-8. STATED LOUDLY: the composer-only oracle is blind to a dead
  collector; without the end-to-end and collector requirements the filter can
  ship correct-but-dead (empty denylist), every Group-A gate green. This is the
  "verify reachability, not just correctness" / "wiring file in the set" class.

- **SAB-6 - drop the `t.length > 0` blank guard in `carriesIdentifier`.** RED:
  W1-6 (a `""` identifier makes `includes("")` true and rejects a clean draft).
  GREEN after restore. Other requirements green (their identifier sets carry no
  blank). DISCRIMINATES via W1-6.

Every sabotage above is RED in one direction and GREEN in the other for at least
one named requirement; none is red-both-ways or green-both-ways. The two subtle
ones (SAB-4, SAB-5) are the reason W1-4 and W1-7/W1-8 exist and must not be
dropped as "redundant" - they are the sole discriminators for their mutants.

---

## 7. Executable here vs argued

**Executable (node-env vitest, pure functions, commands given):**
- The current-tree leak, all three inputs (section 2, measured RED, 3/3 failed).
- The reference filter's satisfiability and clean-pass discrimination (section
  3, measured GREEN 8/8; section 4, measured 4 failed under the reject-everything
  mutant).
- Every W1-* requirement above - all are pure-function assertions over
  `composeClassTrendsDraft` and `computeClassTrends`.
- The blast-radius count of `ClassTrendsReport` literals (2, section 0, grep +
  read).

**Argued, NOT executed here (labelled as argued, never asserted verified):**
- Whether a REAL deployed model actually echoes a student name into
  `concept`/`reading` in practice, and how often (L5/L6 real-world frequency).
  No `.env`/live key in this environment; every model path is mocked
  (`docs/n13b-security.md:505-516`). This wave proves the CODE now has a
  structural guard; it cannot measure model behaviour. That is precisely why the
  fix is a code-level filter, not "trust the prompt".
- What an instructor SEES on screen after the fix (the rejected/dropped draft
  reads sensibly). No component renders under vitest. Owner-verification, not
  machine-checkable - covered by OV-1 in `docs/n13b-acceptance-criteria.md:348`.

---

## 8. Residual register (owner + instrument + step)

- **R-OVERMATCH (availability, NOT security; owner: architect + owner) - a
  substring scan over raw `.student` values over-matches on SHORT identifiers.**
  A student named "Al", "Ed", or "Bo" would make the filter reject any clean
  draft containing "also", "edit", "both", etc. - suppressing a legitimate class
  announcement. This fails SAFE (suppresses, never leaks), so it is an
  availability/UX defect, not a leak, and it is out of the security core - but it
  is real and the wave-plan seam (denylist of raw `.student` strings) is exposed
  to it. Instrument: a unit test seeding a graded result with `student = "Al"`
  and a clean draft whose body contains the word "also", asserting the draft
  still renders "ok"; this is RED under a naive substring filter. Step: the
  architect/implementer decides a mitigation (skip identifier tokens below a
  length threshold; or token/word-boundary aware matching, weighed against the
  `\b`-evasion class this repo has shipped before) OR the owner accepts
  occasional over-suppression. I do NOT bake a min-length into a hard
  requirement, because "how aggressively to suppress" is a product tension of the
  same shape as R6's small-class floor - stated, not decided. My core
  requirements use a long two-word `SEED`, so they are unaffected either way.

- **R-CASEFOLD (hardening; owner: implementer) - case-folded matching.** A model
  echoing "sarah chen" for a `.student` of "Sarah Chen" evades a case-SENSITIVE
  filter. The reference filter lowercases both sides and my requirements seed the
  same casing on both, so they pass under either choice; a dedicated case-mismatch
  case would force the stronger (case-insensitive) filter. Instrument: a variant
  of W1-3 seeding `reading` with `SEED.toLowerCase()` while
  `knownIdentifiers = [SEED]`, asserting absence. Step: the implementer chooses
  case-insensitive matching (constructible, already in the reference) and adds
  this case; if they choose case-sensitive, this residual must be argued to the
  owner as an accepted gap.

- **R-GRADEDREPO-SEGMENT (definition; owner: architect) - what exactly the
  `gradedRepo`/`gradedRef` "owner/label segment" is.** W1-7 asserts the owner
  segment (`"octo-student"` from `"octo-student/hw1"`) is collected, per
  `docs/n13b-security.md:127` (L3). The precise parse (owner only, full
  `owner/repo`, or the ref too) is the collector's detail; if the architect
  scopes L3 out of Wave 1 (e.g. defers repo-surface identifiers to Wave 3's
  option-Y channel), W1-7's `gradedRepo` sub-case moves with it and the Canvas
  `.student` sub-case stays. Instrument: `github-repos.ts:618-619`. Step: the
  implementer confirms which segment the collector emits and the W1-7 fixture
  matches it; silence is not acceptable - the fixture pins whatever is chosen.

Each residual has owner, instrument, and the step that measures it; none is a
silent deletion.

---

## 9. Idiom notes for the implementer (not requirements)

- Reuse the `makeArea`/`makeReport`/`makeObservation` helpers already in
  `class-trends-draft.test.ts:13-50`; extend `makeReport` to set
  `knownIdentifiers` (default `[]`) so it matches the new required field.
- Do NOT import any helper from another `*.test.ts` - duplicate it
  (`no-cross-test-file-imports`). W1-8 imports `computeClassTrends` and
  `composeClassTrendsDraft` from their PRODUCTION modules, which is fine.
- Multi-file test runs use `npm run test:paths -- <p1> <p2>` (both
  `class-trends-draft.test.ts` and `class-trends.test.ts` are touched), never a
  raw multi-path `vitest`/`npm test` command, which drops unmatched paths and
  exits 0.
- The composer's filter needs NO new import (`containsForbiddenCompletenessPhrase`
  is already imported; the scan is inline string work), so
  `classTrendsDraft.not-postable.test.ts` canary-3 stays green - AC-10 holds.
- No `/s` dotAll regex (fails tsc, TS1501). The reference uses none.
