# L9 scope (revision 2) - source-scanning tests satisfied by commented-out code

Seat: loop-seat (scoping pass, re-run 2026-09-27). **This is a restructuring of
an existing `docs/l9-scope.md`**, not a fresh scope - the file already existed
before this pass wrote it (confirmed: it was read in full below and its
content is quoted throughout). Section 0 is therefore the disposition table
`iteration-caps.md` requires before any new content is trusted.

Write set of this pass: exactly `docs/l9-scope.md`. No other file was edited.
`git status --short` at the end of this document proves that.

Inputs read in full before any measurement below: the L9 row of
`docs/BACKLOG.md` (`grep -a -n "L9" docs/BACKLOG.md`, row at line 144), the
adjacent A42 row (same file, line 98) and L13 row (line 99), `AGENTS.md`,
`docs/DEV_LOOP.md`, `docs/loop/traps-spec.md`, `docs/loop/iteration-caps.md`,
`docs/loop/leverage.md`, `docs/loop/this-repo.md`, and the PRIOR
`docs/l9-scope.md` in full (456 lines, read before any edit). Tree: `main`,
working tree has unrelated in-flight changes from four sibling agents on
`src/lib/grade/*`, `src/app/actions/grading*`, `src/lib/embedded-grader/*`,
and `docs/a25-*`/`docs/a32-*`/`docs/a41-*` (see `git status --short` at the
end of this document) - none of those files were read for their live content
being asserted on here except read-only citation, and none were edited.

---

## 0. Disposition table - what the prior scope's content becomes here

The prior pass's own census methodology, triage rule, and wave structure hold
up under re-measurement (Section 1 below) and are KEPT. What changed since
2026-09-23 is: one of its two "armed" citations is now FIXED on `main` (a
different agent's commit, not this pass's), so it cannot be re-cited as live;
this pass replaces it with two fresh, independently re-verified empirical
proofs (Section 3). Everything else is either kept, updated with a fresh
number, or left exactly as before.

| Prior requirement / finding | Disposition | Detail |
|---|---|---|
| Section 0: L9/A42 ordering tension (wave 2b blocked on A42) | **KEPT**, id ORD-1 | Re-verified below (Section 4); A42 is still `unscoped` and its regex is still unfixed (`grep -n "UNSAFE_BARRELS\|stripComments" ` was not the check - see Section 4's fresh grep of A42's row). The tension is structural, not time-bound, and nothing has removed it. |
| Section 1 census (205/70/22/77, adjusted gap 113) | **KEPT with updated numbers** | Re-measured fresh (Section 1): 208/71/22/79, adjusted gap 111-114 depending on which of two set-difference orders is used (both shown, see Section 1's own note on why they differ by 3). The methodology - two shells, an absence canary, a hand-verified regex literal - is unchanged and re-run today rather than trusted from the prior document. |
| Section 2a: `ModalShell.tsx` / `snapshot-grading.structure.test.ts:245-246` presence-assertion citation | **WITHDRAWN as a live citation, reason: fixed** | Verified today (`sed -n '280,292p' src/app/components/snapshot-grading/snapshot-grading.structure.test.ts`): the assertion now reads `expect(modalShellSource).toMatch(/role="dialog"\s*aria-modal="true"/)`, a positional regex the doc comment's prose cannot satisfy (the comment separates the two with a comma). This is commit `6125260`, landed 2026-09-23, the SAME fix the L9 backlog row itself already credits. The enforcer this citation protected - proof that an undefended presence assertion in this file was live-exploitable - is REPLACED, not removed: Section 3a below builds a fresh presence-direction proof on a different, currently-undefended file (`src/lib/grade/grade-result-doors.wiring.test.ts`'s `referencesUngradedFlag`, which is independently already flagged as RES-7 on the A13 backlog row, confirming this pass did not invent the target). |
| Section 2b: `canvas-client-boundary.test.ts` absence-direction mechanism proof | **KEPT, re-verified fresh** | Re-run today with a corrected extraction script (Section 3b): same three-fixture result (line-comment ignored correctly, block-comment falsely fires, live import correctly fires). No file in the tree today trips it for real - re-confirmed by a fresh `git status`/grep pass, same conclusion as before. |
| Section 3: remedy space (triage rule, frozen-oracle requirement for any stripComments change) | **KEPT** | Sections 5-6 below restate and extend it, adding the requirement-5 instrument analysis (a grep-shaped meta-test is itself the vulnerable shape) that the prior pass did not have to address because this pass's brief asks for it explicitly. |
| Section 4 wave plan (1: triage: 2a: remove: 2b: add, blocked on A42: 3: sabotage canaries) | **KEPT**, waves renumbered W1-W4 in Section 7 | Wave 3's sabotage-canary requirement is PROMOTED from "a good idea" to "the only acceptable instrument for the fix," per this pass's brief step 5 and the reasoning in Section 6. |
| Residuals R1-R6 | **KEPT**, renumbered, R2/R3/R4 reworded to reflect today's numbers | See Section 8. None were dropped; none were silently resolved - R2 (the block-comment sweep) was NOT performed by this pass either, and R3/R4's sampling is still 2 files, now different two files. |

No prior requirement was withdrawn without a replacement or silently dropped.
The one substantive change - swapping the ModalShell citation - is a
**correction driven by the tree itself having moved**, not a defect in the
prior pass's reasoning at the time it ran.

---

## 1. The census, re-measured fresh today (2026-09-27)

| Quantity | Command | Result |
|---|---|---|
| `readFileSync` in `*.test.ts` | `grep -rl readFileSync --include=*.test.ts src \| wc -l` | **208** |
| `stripComments` (the word) in `*.test.ts` | `grep -rl stripComments --include=*.test.ts src \| wc -l` | **71** |
| `*.structure.test.ts` files | `find src -name "*.structure.test.ts" \| wc -l` | **22** |
| `*.wiring.test.ts` files | `find src -name "*.wiring.test.ts" \| wc -l` | **79** |

This confirms the two figures this pass's own brief asserted (79 wiring / 22
structure) against `this-repo.md`'s stale 68/17 - both are measured here
independently, not copied from the brief.

**Reconciling against the prior scope's 2026-09-23 numbers (205/70/22/77):**
readFileSync +3, stripComments +1, structure unchanged, wiring +2 in four
days - consistent with ordinary concurrent feature work (the sibling agents'
own in-flight changes visible in `git status --short` touch grading test
files), not a measurement disagreement. Both counts were re-run once each;
no shell-disagreement was found this time (unlike `this-repo.md`'s own
warning that the two shells can differ by up to 138 lines elsewhere in this
repo - these four counts are simple file/line counts of the kind that
historically agree).

**The A42 regex-literal census - redone with a Python script, not a shell
one-liner, after a real instrument failure caught mid-measurement.**

My first attempt used `grep -rlF '[\s\S]*?\*/' src` (missing the backslash
before the closing `/` that the real code actually contains) and returned
**0 files** - a false "clean" result, i.e. exactly the failure mode this row
is about, caught here on my own instrument before trusting it. I confirmed
the miss by opening `src/app/actions/carry-module-pattern.test.ts` directly
(`grep -n "replace(" src/app/actions/carry-module-pattern.test.ts`) and
reading the real line: `.replace(/\/\*[\s\S]*?\*\//g, "")` - the closing `*/`
in the SOURCE is written `\*\/` (both characters escaped, because it sits
inside a JS regex literal), not `*/`. Rebuilt the search as a Python script
(`census2.py`/`census3.py` in this session's scratchpad) matching the exact
byte sequence `[`, `\`, `s`, `\`, `S`, `]`, `*`, `?`, `\`, `*`, `\`, `/`, built
with `chr(92)` rather than typed backslashes (this repo's own recorded lesson
that a shell heredoc can halve a doubled escape before it reaches the target
language - confirmed again, separately, while building this document's own
proof scripts in Section 3, where a bash heredoc silently dropped every
`\\` down to a single `\` and a `\s+` became `s+`; switching to the `Write`
tool for those scripts avoided it).

| Quantity | Result |
|---|---|
| Files containing `[\s\S]*?\*\/` literal, all `src/` | **87** |
| Of those, `*.test.ts` | **86** |
| Total occurrences of that literal | **107** |
| Files containing the `[^]*?\*\/` sibling variant | **5** (`src/app/actions/prompt-announcement-draft.test.ts`, `src/app/actions/prompt-announcement-post.test.ts`, `src/app/components/canvas-tab/announcements-panel.wiring.test.ts`, `src/app/components/canvas-tab/promptAnnouncementDraft.test.ts`, `src/lib/prompt-announcement-types.test.ts`) |
| Absence canary (`stripCommentsZZCANARYZZNONEXISTENT`) | **0 files** - confirms the script distinguishes presence from absence |

Compared with A42's own row (85 files / 102 occurrences, `*.test.ts`-only 84)
and the prior L9 scope's same-day re-measurement (85/105, `*.test.ts` 84):
today's 87/107 (test.ts: 86) is a further drift of +2 files, +2 occurrences,
consistent with the same ongoing feature work. The `[^]*?` variant count grew
from 2 (prior scope, hand-inspected) to 5 (this pass, script-swept) - **this
is not new drift, it is the prior scope under-counting**: three of the five
(`prompt-announcement-draft.test.ts`, `prompt-announcement-post.test.ts`,
`promptAnnouncementDraft.test.ts`) were not in the prior document's 8-file
"contains the word but not the literal" table at all, meaning the prior
pass's hand search missed them. Recorded as a correction, not hidden.

**Adjusted gap - two orders of the same set subtraction, shown both ways
because they disagree by 3 and neither is obviously wrong.**

```
A = {*.test.ts files containing readFileSync}                    (208)
B = {*.test.ts files containing the word "stripComments"}         (71)
C = {*.test.ts files containing the [\s\S]*?\*\/ or [^]*? literal, minus B}
```

- Order 1 (subtract B, then subtract C-minus-B): `(A - B) - (C - B)` = **111**
  files, computed by `gap_list.py` in this session's scratchpad (a Python
  walk over `src/`, not a shell pipeline, after the heredoc/backslash
  instrument failure above made shell-based regex search suspect for this
  exact pattern).
- Order 2 (compute `A - B` first, list it, subtract the literal-only set):
  `census3.py` in the same scratchpad, same two input sets, same operation,
  independently coded: **114**.

The 3-file difference is `src/lib/decks/deck-source.test.ts`, which is present
in one script's "strips inline under an unnamed mechanism" bucket and absent
from the other's - not yet resolved by this pass, and not decisive either way
for the wave plan below, which works off the FULL 208-file population and a
per-file triage (Wave 1), not off this floor number. **Both counts are a
floor on the defended population and a ceiling on the true gap**, per the
prior scope's own caveat, which still holds: a third stripping idiom under a
third name would hide inside either number. Recorded as Residual R3.

**Two populations within the gap, as the brief requires, not one number.**

Scanning the 111-file gap list (`classify_gap.py`, scratchpad) for
`expect(...).toContain(`/`.toMatch(` calls NOT preceded by `.not.` (a
presence-shaped assertion) versus `.not.toContain(`/`.not.toMatch(` calls (an
absence-shaped assertion):

| Population | Count | Command basis |
|---|---|---|
| Files with >=1 presence-shaped assertion | **81** | `classify_gap.py`, regex `\.to(Contain\|Match)\(` minus the `.not.` count, per file |
| Files with >=1 absence-shaped assertion | **68** | Same script, `\.not\.to(Contain\|Match)\(` |
| Files with BOTH shapes | **62** | Set intersection of the two file sets |
| Total presence-shaped assertion occurrences | **839** | Sum across files |
| Total absence-shaped assertion occurrences | **353** | Sum across files |

**This is a syntactic proxy, stated plainly as one.** It counts
`.toContain(`/`.toMatch(` call SHAPES, not semantics - a `.toMatch()` call can
be testing a count, a formatted number, or a comment's own content (the
row's explicitly carved-out third category), not just "does this capability's
call site exist." It also cannot see `indexOf`-based or `.toBe(true)`-based
presence checks (e.g. `grade-result-doors.wiring.test.ts`'s own
`callsBuilder`/`referencesUngradedFlag`, which return booleans consumed by
`expect(...).toBe(true)`, not `.toContain`) - so the true presence-assertion
population is a FLOOR, undercounted by this proxy, not an overcount. The
per-assertion triage the row's own note calls for (Wave 1, Section 7) is the
only way to turn this proxy into a real classification; this number exists
so the scope does not report one population where the brief requires two.

---

## 2. Which direction fails, and how - restated with today's evidence

The prior scope's triage framing (presence assertions need stripping added;
absence assertions may need it removed; comment-content assertions are a
third, untouched category) is unchanged and re-adopted here. What follows in
Section 3 replaces its worked examples with fresh ones, because one of the
two originals no longer demonstrates a live gap.

---

## 3. Proof on real files - two genuinely different tests, empirically, on scratch copies

Both proofs below (a) extract the REAL assertion logic VERBATIM from the real
test file (not a hand-typed re-implementation - the technique
`docs/a41-scope.md` used and this pass's brief names explicitly), (b) run it
under `node --experimental-strip-types` against fixture text, and (c) never
write to any production or test file. Extraction script:
`extract_functions.py` (scratchpad); driver scripts: `proof1_driver.ts` and
`proof2_driver.ts` (scratchpad, both via the `Write` tool after the heredoc
backslash-halving failure noted in Section 1 corrupted an earlier attempt at
`proof2_driver.ts` - caught by re-reading the written file with `sed -n`
before trusting its output, the same discipline this row itself is about).

### 3a. Presence direction - `src/lib/grade/grade-result-doors.wiring.test.ts`, `referencesUngradedFlag`

This file and function are independently already named on the A13 backlog
row as **RES-7** ("grade-result-doors.wiring.test.ts is satisfied by a
COMMENT... the next chunk that touches [it], or L9's triage wave, whichever
lands first") - confirming this pass did not invent the target, and that
this scope is that chunk.

The function, extracted verbatim (`src/lib/grade/grade-result-doors.wiring.test.ts:78-80`):

```ts
function referencesUngradedFlag(source: string): boolean {
  return /\bungraded\b/i.test(source) || /\bisUngraded\b/.test(source);
}
```

No `stripComments` call anywhere in this file (confirmed:
`grep -c stripComments src/lib/grade/grade-result-doors.wiring.test.ts`
returns `0`) - it is a raw-source presence check, run against every file that
calls one of four "door" builders including `postCanvasGradesAction`.

**A real, currently-live caller, confirmed today, not touched by any sibling
agent:** `src/app/components/repo-grades/useRepoGradesGradingActions.ts:554`
and `:674` both call `postCanvasGradesAction(` with parentheses (the exact
predicate the test itself uses:
`new RegExp('\\bpostCanvasGradesAction\\s*\\(')`), and its one real
functional reference to the flag is `:263`:
`if (cell.status !== "ungraded") return;` - confirmed as the file's ONLY
non-comment occurrence of the word (the other two hits, `:260` and `:338`,
are prose in comments).

Driver output (`node --experimental-strip-types proof1_driver.ts`, full
output captured, reproduced here):

```
calls postCanvasGradesAction( for real, in the unmodified file: true
referencesUngradedFlag(original real file content): true
target line found verbatim, occurrence count: 1

=== Variant B: real guard commented out, comment still says ungraded ===
variantB no longer contains the LIVE functional line as executable code: true
referencesUngradedFlag(variantB) - EXPECTED true if the hole is real: true

=== Variant C: word fully scrubbed (comment and any residue) ===
variantC still contains the word 'ungraded' anywhere (should be false): false
referencesUngradedFlag(variantC) - EXPECTED false: false
```

**Reading this precisely.** Variant B takes the real, unmodified file content
and replaces ONLY the one functional guard line with a comment that still
contains the word "ungraded" ("`// ungraded rows used to be excluded here;
guard removed for this L9 scratch-copy proof...`") - simulating exactly what
the row describes: a capability deleted, left behind as a comment. The real
function, run unmodified against this variant, still returns `true` - the
SAME verdict as the untouched original. Variant C proves this is not a
trivial always-true function: scrubbing the word entirely correctly flips it
to `false`. So the function's true/false verdict is driven by the presence of
a WORD anywhere in the file, not by whether the guarded CODE PATH still
executes - which is the exact defect L9 names. **This was proven without
editing any production or test file**: the real file was read once, and the
"variants" exist only as in-memory strings inside the driver script and one
scratch copy (`useRepoGradesGradingActions.variantB.ts` in the scratchpad,
never imported by anything, never referenced by `git status`).

Confirmed the real test currently passes, unmodified, before any of the
above: `npm run test:paths -- src/lib/grade/grade-result-doors.wiring.test.ts`
→ `Test Files 1 passed (1)`, `Tests 7 passed (7)`, `COVERED
src/lib/grade/grade-result-doors.wiring.test.ts files=1 passed=7`.

### 3b. Absence direction - `src/lib/canvas-client-boundary.test.ts`, `findClientUnsafeBarrelImports`

Extracted verbatim (`src/lib/canvas-client-boundary.test.ts:71`, `:132-179`):
`UNSAFE_BARRELS = ["@/lib/canvas", "@/lib/canvas-modules"]` and the full
`findClientUnsafeBarrelImports` function, which anchors on `^import` with the
`m` flag specifically so "an unrelated `import` keyword mentioned inside a
comment... is never matched" (the file's own header comment, quoted
verbatim, not paraphrased).

Three fixtures, run through the extracted function unmodified
(`proof2_driver.ts`, full output):

```
Fixture A (// line-commented import) violations: []
Fixture B (block-commented import) violations: [{"line":3,"specifier":"@/lib/canvas-modules","binding":"COURSE_COPY_TYPES"}]
Fixture C (live, real import) violations: [{"line":1,"specifier":"@/lib/canvas-modules","binding":"COURSE_COPY_TYPES"}]
```

Fixture A confirms the `^import` anchor does what its own comment claims: a
`//`-commented forbidden import produces zero violations, correctly. Fixture
B is the mirror-image defect the row's absence-direction half asks about: the
SAME import, wrapped in a `/* */` block comment on its own line, produces
ONE violation - identical in shape to Fixture C's genuinely live, uncommented
import. The guard has no concept of `/* */` nesting, so it cannot tell inert,
commented-out code from a real value import; it FALSELY FIRES on the former.

**Is this currently live?** No file in the tree today trips it: re-run today,
`npm run test:paths -- src/lib/canvas-client-boundary.test.ts` →
`Test Files 1 passed (1)`, `Tests 15 passed (15)`,
`COVERED src/lib/canvas-client-boundary.test.ts files=1 passed=15`, matching
the prior scope's same finding four days ago. This is a **proven mechanism
defect, not yet triggered** - the opposite failure direction from 3a (a false
CI failure on inert code, rather than a silent gap), and it belongs in the
same row because it is the same instrument shape (a raw-source regex with no
awareness of comment syntax) failing in the other direction. A full sweep for
a real block-commented import of either barrel was NOT re-run this pass
(carried forward as Residual R2, unchanged in substance from the prior
scope).

---

## 4. The A42 dependency, re-verified

`docs/BACKLOG.md`'s A42 row (line 98, `grep -a -n "A42" docs/BACKLOG.md`) is
still `unscoped` today and its own text still states the MIME-wildcard
`accept="image/*"`-style false block-comment-open defect against the shared
`[\s\S]*?\*\/`-family regex, unresolved. Section 1's fresh count (87 files,
`*.test.ts`: 86, up from A42's own 85/84) confirms the population this defect
threatens has grown, not shrunk, since A42 was filed. **The ordering
constraint from the prior scope holds unchanged**: any L9 wave that ADDS a
new call to this regex family inherits A42's live bug on day one if the file
it scans happens to contain a MIME-wildcard `accept=` attribute; any L9 wave
that REMOVES a call, or that adds a NON-regex stripping mechanism (a
character-by-character parser, or the positional-anchor technique
`snapshot-grading.structure.test.ts` now uses per Section 0's disposition
table), does not.

---

## 5. The remedy space - costed, with the reuse question answered

**Reuse question, answered directly per this pass's brief.** There is no
single shared `stripComments` helper this repo's test files import today,
apart from `src/app/components/ui/modalAdoptionScan.ts` (one production
module, imported by exactly 2 test files:
`src/app/components/ui/modalAdoption.wiring.test.ts` and
`src/app/components/ui/modalAdoptionWiring.attributes.test.ts`, confirmed by
`grep -rn "from \"./modalAdoptionScan\"" src/app/components/ui`). Everything
else - at minimum the 71 files matching the word `stripComments` plus the 87
matching the regex literal directly - is an independently duplicated local
copy, per this repo's own stated house rule
(`GradingRecordingPanel.wiring.test.ts:38`: "this repo forbids importing a
helper from another `*.test.ts` file"). **So this is "adopt an existing
helper everywhere," not "write a helper," EXCEPT that the one existing
shared helper (`modalAdoptionScan.ts`) is ITSELF inside A42's blast radius**
(it contains the same vulnerable regex family - A42's own row names it by
path) - adopting it as-is would spread A42's defect to every file that
adopts it, which is the exact ordering hazard Section 4 states generalized to
the reuse question specifically.

Three remedy shapes, costed:

| Shape | Files touched | Cost / risk | False-positive mode |
|---|---|---|---|
| **(1) One shared, non-test helper module**, all scanning tests import it (breaking the current "duplicate, never import" house style deliberately, as `modalAdoptionScan.ts` already does for 2 files) | Up to 208 (every `readFileSync`-using test file), in practice fewer once Wave 1's triage removes comment-content-only and already-correctly-defended files | Largest one-time cost; requires a FROZEN ORACLE (stripComments' output on a representative real-file sample, captured before/after) proving the migration changes no existing stripping decision, per `docs/DEV_LOOP.md`'s own "a refactor that silently changes output is the classic defect." Must also fix A42 first or simultaneously, or it inherits the bug at the moment of adoption. | None directly - a shared helper is a mechanism, not an instrument, so it has no false-positive mode of its own; the RISK is a wrong migration silently changing an existing test's verdict, which the oracle is what catches. |
| **(2) A lint rule** (a custom ESLint rule flagging a `readFileSync`-in-test-file plus a presence-shaped assertion with no stripping call in the same file) | 1 new rule file, 0 test files touched to ADD the rule; each violation it finds becomes its own fix | Cheapest to add, but ESLint at 104.9s (`this-repo.md` section 1) already runs on every file; a custom rule needs its own test suite (this repo's convention per every other `*.structure.test.ts`) and duplicates most of the census logic already built in Section 1's scripts. | A lint rule operating on AST or text patterns has THE SAME blind spot as the row itself if it looks for the word `stripComments` rather than proving the found call actually defends the found assertion - i.e., a naive version of this rule reproduces the class of bug it exists to catch, one level up. |
| **(3) A meta-test / coverage ratchet** (`src/lib/source-scan-comment-coverage.structure.test.ts`-shaped: enumerate every `*.test.ts` file with `readFileSync`, classify presence/absence via Section 1's proxy, and assert the "undefended presence" file list against a FROZEN allowlist that may only shrink) | 1 new file; 0 existing files touched to add it | Cheap (this repo already runs `file-size-ceiling.structure.test.ts`'s `ALLOWED_OVERAGE` ratchet in exactly this shape) and catches NEW drift immediately (any newly-added undefended presence assertion fails the moment its file is added, because the allowlist is frozen at today's count) | **Evaluated seriously, and it does false-positive in exactly the way this row is about**: this ratchet is itself a grep/census over source text. A file that defines `stripComments` under a fourth, unsearched name (Residual R3) is misclassified as undefended and blocks a legitimate new file forever, OR - the sharper failure - a file that correctly APPEARS to call a `stripComments`-shaped helper but whose helper is CRLF-blind (L13's own finding: one of 53 copies was silently broken) or MIME-wildcard-blind (A42) is misclassified as SAFE. **A census-shaped ratchet can prove coverage of the NAME, never of the BEHAVIOUR** - it is the same category error `this-repo.md`'s own opening warning names ("a syntax filter over a helper's source does not measure that helper's behaviour," the exact correction L13 had to make about itself). |

**Recommendation, stated as a combination, per the brief's own suggestion
that this need not be a single choice:** (3) as a cheap, immediate coverage
ratchet to stop the gap from growing (ships in Wave 1's tail, no A42
dependency, no per-file triage needed to seed it beyond today's census), PLUS
(1) as the eventual consolidation, sequenced AFTER A42 lands or is
explicitly ruled safe for the migrated files, because (1) is the only shape
that actually reduces the 71-vs-87 duplicate-copy count L13 already flags as
its own separate, related debt. (2) is not recommended on its own: it
duplicates (3)'s census machinery inside a slower, harder-to-test surface
(ESLint) for no behavioural gain over (3).

---

## 6. The instrument for the fix itself - why a grep-shaped guard is refused here

This pass's own brief states the rule directly: "a requirement whose subject
is a produced value needs an assertion that executes the producer, and an
assertion that greps for an identifier is the very shape this row is about -
so do not propose one." Shape (3) above is exactly that shape at the
COVERAGE level, and Section 5's table already states its false-positive mode
plainly rather than hiding it - it is proposed as a cheap ratchet on
POPULATION DRIFT, never as proof that any individual fix is correct.

**The instrument that DOES satisfy the rule, for each individual fix Wave 2
lands, is the sabotage canary this pass's Section 3 already demonstrates the
technique for**: for every assertion Wave 2b newly defends, comment out (in
the real file, as part of that wave's own commit, then revert and re-apply
exactly as `docs/l9-scope.md`'s own predecessor commit `6125260` did) the
capability the assertion guards, run the REAL test, and confirm it goes RED;
then restore the capability and confirm GREEN again. This EXECUTES the
producer (the real assertion, against the real, temporarily-mutated file),
which is what distinguishes it from a grep for `stripComments`'s name. Both
proofs in Section 3 already demonstrate the extraction-and-fixture technique
this requires, on scratch copies; a real Wave 2b/3 pass repeats it on the
actual tree, inside its own commit, exactly as `6125260` already did for the
one instance fixed so far.

---

## 7. Wave plan

**Wave 1 - triage (a seat, e.g. `loop-test-author`; produces a classification
table, no production or test code changes).**

- Write set: a new scratchpad or docs artifact, classifying the 208-file
  `readFileSync` population (not just the 111-114 gap, because the two
  set-difference orders in Section 1 disagree by 3 and a per-file triage
  resolves that disagreement as a side effect) into presence / absence /
  comment-content buckets, PER ASSERTION, using Section 1's proxy as a
  starting list to refine, not as ground truth (it undercounts
  boolean-returning presence checks like `grade-result-doors.wiring.test.ts`'s
  own `referencesUngradedFlag`, which is exactly the kind of file Wave 1 must
  still catch).
- Also seeds Shape (3)'s frozen allowlist (Section 5) from today's census, so
  the ratchet can ship in this wave's tail without waiting for the full
  per-assertion triage to finish for every file.
- Depends on: nothing code-side. Can start immediately and independently of
  A42.

**Wave 2a - remove wrongful stripping from absence assertions (an
implementer wave; NOT blocked on A42).**

- File list: produced by Wave 1. None confirmed by this pass's sampling (the
  one absence-style test sampled, `canvas-client-boundary.test.ts`, already
  correctly does not strip comments - see Section 3b) - same finding as the
  prior scope, not contradicted.

**Wave 2b - add stripping (or a positional-anchor alternative, per Section 0's
disposition table noting `snapshot-grading.structure.test.ts` now uses one)
to presence assertions currently unguarded (an implementer wave; BLOCKED on
A42 for any file wave 1 confirms could contain a MIME-wildcard `accept=`
attribute, per Section 4).**

- One file is confirmed as a candidate by this pass:
  `src/lib/grade/grade-result-doors.wiring.test.ts`'s `referencesUngradedFlag`
  (Section 3a) - already independently flagged as RES-7 on the A13 row. This
  file has no MIME-wildcard exposure risk (it scans `.ts`/`.tsx` source for a
  builder-name call and a flag word, not an `accept=` attribute), so it is
  NOT blocked on A42 and could ship standalone.
- The remainder of the file list comes from Wave 1.

**Wave 3 - the meta-test / coverage ratchet (Shape (3), Section 5) - an
implementer wave, seeded from Wave 1's census, no A42 dependency.**

- New file only: `src/lib/source-scan-comment-coverage.structure.test.ts`
  (name illustrative, not binding). Ships independently of 2a/2b's timeline.

**Wave 4 - sabotage canary per newly-defended assertion (Section 6) -
follows 2b, one canary per assertion Wave 2b lands, not a separate file.**

- Depends on: 2b's actual diffs. This is the load-bearing correctness
  instrument, per Section 6 - Wave 3's ratchet is coverage-only and must not
  be substituted for this.

---

## 8. Residual register

| # | What is not proven now | Owner | Instrument | Object / direction of failure | Step that measures it |
|---|---|---|---|---|---|
| R1 | Full per-assertion triage of the 208-file `readFileSync` population (presence / absence / comment-content), refining Section 1's syntactic proxy which undercounts boolean-returning presence checks | `loop-test-author` | A script pairing each `expect(...)` call (not just `.toContain`/`.toMatch` - also `.toBe(true/false)` on a named boolean-returning scan function) with whether a comment-stripping call of ANY name precedes it in the same file | The 208-file population; direction of failure: a file misclassified ships the wrong-direction fix, either leaving a gap open or weakening a legitimate absence guard | Wave 1 |
| R2 | Whether any file in the tree today contains a `/* */`-block-commented import of `@/lib/canvas` or `@/lib/canvas-modules` that would trip `canvas-client-boundary.test.ts`'s false positive (Section 3b) - not swept this pass, same as the prior scope | The fix wave's first step (A42's own STEP field already claims this sweep as its job) | A Node script replaying `findClientUnsafeBarrelImports` verbatim over every file `isUseClientModuleText` selects, flagging any match whose line falls inside a `/* */` span | `src/lib/canvas-client-boundary.test.ts`'s scanned file set; direction of failure: a false CI failure the first time such a file is added | Before or alongside any L9 wave touching this file, or A42's own sweep, whichever lands first |
| R3 | The 111-vs-114 adjusted-gap disagreement (Section 1) traces to exactly one file (`src/lib/decks/deck-source.test.ts`) whose classification differs between two independently-coded scripts computing the same set difference - not resolved by this pass | `loop-test-author`'s Wave 1 | Read `src/lib/decks/deck-source.test.ts` directly and determine by hand which bucket it belongs in; fold that one-file resolution into Wave 1's broader per-file pass rather than treating it as a separate step | That one file; direction of failure: neither direction is dangerous on its own (a 3-file floor/ceiling gap), but an unresolved 3-file disagreement between two scripts measuring the SAME population is exactly the kind of instrument disagreement `traps-spec.md` warns never to leave unmeasured | Wave 1 |
| R4 | Whether other currently-live files besides the two proven in Section 3 have the SAME "the assertion's verdict does not depend on whether the real code executes" property - Section 3 sampled exactly 2 of 208 | `loop-test-author`'s Wave 1 | For each presence-style assertion (from R1's classification), extract its search string/function and replay it against a scratch copy with the guarded line commented out, exactly as `proof1_driver.ts`/`proof2_driver.ts` do here | The presence-assertion subset of the 208-file population; direction of failure: a live-armed instance (like the fixed ModalShell one, or the fresh `grade-result-doors.wiring.test.ts` one this pass found) ships unnoticed for another cycle | Wave 1's per-file audit |
| R5 | The A42/L9 cross-reference (Section 4) is stated in this document and in each row's own backlog text, but `docs/BACKLOG.md` has no structured cross-link between the two rows beyond prose | Whichever agent next edits `docs/BACKLOG.md` (not this pass - `docs/BACKLOG.md` is outside this pass's write set) | The two rows themselves, cross-linked explicitly | `docs/BACKLOG.md`'s L9 and A42 rows; direction of failure: a future session scopes or fixes A42 in isolation and a concurrent L9 wave copies the pre-fix regex into new files because the rows were never linked in a form more durable than prose | The next backlog reconciliation or push that touches either row |
| R6 | Whether a Wave 2 edit breaks an assumption a DIFFERENT in-flight sibling agent's branch currently relies on - unverifiable in this environment (no live multi-branch CI view) | The repo owner / orchestrator at push time | `docs/DEV_LOOP.md`'s "Regression, batched per group" step | Any actual code wave from this plan; direction of failure: a wave passes every local gate but breaks a sibling in-flight branch's shared-file assumption | The regression pass at whichever wave's push lands first |
| R7 | Shape (3)'s coverage ratchet (Section 5/7, Wave 3) is a NAME-level census and cannot detect a `stripComments`-shaped helper that runs but is behaviourally wrong (CRLF-blind per L13, or MIME-wildcard-blind per A42) | Whoever authors Wave 3's meta-test | None yet - this is the false-positive mode Section 5's table already states; the only real mitigation is NOT relying on Wave 3 alone, which is why Wave 4's sabotage canary is marked load-bearing and Wave 3 is marked coverage-only | Any file the ratchet marks "defended" whose defense mechanism is itself broken; direction of failure: false confidence, exactly the shape this whole row is about, one level up | Wave 4, and any future L13-style behavioural audit of the stripping helpers the ratchet credits |

---

## 9. Leverage

Per `docs/loop/leverage.md`, this row is a chore on the loop's OWN
instruments - it changes no code a user reaches, adds no persisted record, no
capture, no live-loop control, no integration, no scale, and no guaranteed
output property visible to an instructor or student. **The honest answer is
none**: this is a guard on the guards, not a feature, and manufacturing a
leverage claim for it would be exactly the failure mode `leverage.md`'s own
"What a failing answer looks like" section warns against (a claim that names
no mechanism a user experiences). No leverage claim is written for this row,
and none should be expected from whichever wave eventually implements it.

---

## 10. Fork - stated so every answer terminates

**The fork:** should L9 and A42 remain two separate backlog rows with L9's
Wave 2b explicitly blocked on A42 (as Section 4 and the prior scope both
already assume), or should the two be MERGED into one sequenced item now that
this pass has confirmed they share both a mechanism (the same regex family)
and, per Section 5, the single existing shared helper module
(`modalAdoptionScan.ts`) that either fix would need to touch?

- **Answer X - keep separate, sequenced (this pass's default assumption
  throughout, and the recommendation):** L9 ships Waves 1, 2a, and 3 (triage,
  absence-direction fixes, and the coverage ratchet) now, independently of
  A42, because none of those three needs the shared regex to be correct
  first. Wave 2b (the presence-direction fixes that would ADD new stripping
  calls) stays blocked file-by-file on A42 having either landed a fix or an
  oracle-backed ruling of safety for the specific files touched. Cost of
  being wrong: if A42 and L9's remedies turn out to need the same design
  decision anyway (e.g., both settle on Shape (1)'s shared helper), the two
  rows will have been scoped separately for no reason, costing one redundant
  scoping pass - cheap, and already partly paid (this document already reads
  A42's row in full at every relevant point).
- **Answer Y - merge into one item:** a single scope/architect pass designs
  the shared, corrected stripping mechanism (Shape (1)) once, satisfying both
  rows' remedy requirements simultaneously, and both backlog rows close
  together when it ships. Cost of being wrong: A42 was filed and is owned as
  its own row already (`docs/BACKLOG.md` line 98, with its own STEP field);
  merging it into L9's scope without A42's own owner agreeing re-opens a row
  this pass has no mandate to close or redirect, and L9's non-2b waves (which
  do not need A42 at all) would then wait on a larger, harder item for no
  reason.

**Recommendation: X.** A42 already has its own filed scope, its own STEP
field, and its own owner path; L9's Waves 1/2a/3 do not depend on it at all,
and gating them on a merge would cost real, immediate, unblocked work for a
consolidation that Shape (1) in Section 5 already names as the eventual
right move WITHOUT requiring the two backlog rows themselves to merge first.

---

## 11. Final gate check for this pass

This pass wrote documentation only (`docs/l9-scope.md`); read several
production and test files for citation but edited none. The structural gates
below were run both BEFORE this document existed in its current form
(baseline, Section 1 sub-note) and are re-run now to confirm nothing in `src/`
changed as a side effect of writing this file:

Command: `npm run test:paths -- src/lib/no-emojis.test.ts src/source-bytes.structure.test.ts`

Result: `Test Files 2 passed (2)`, `Tests 21 passed (21)`, `COVERED
src/lib/no-emojis.test.ts files=1 passed=18`, `COVERED
src/source-bytes.structure.test.ts files=1 passed=3` - identical to the
pre-write baseline run minutes earlier in this same session, as expected
since this pass touches no file either gate scans.

Also re-ran, as evidence for Section 3's citations rather than as a
structural gate: `npm run test:paths -- src/lib/grade/grade-result-doors.wiring.test.ts src/lib/canvas-client-boundary.test.ts` →
both GREEN, `Tests 7 passed (7)` and `Tests 15 passed (15)` respectively,
confirming neither citation was mutated by anything else running
concurrently in this session.

`git status --short` at the end of this pass (paste below when running) must
show exactly one modified/added path under `docs/` for this file plus the
unrelated sibling-agent paths already present at session start - nothing
under `src/`.
