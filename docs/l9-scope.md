# L9 scope (revision 3) - source-scanning tests satisfied by commented-out code

Seat: loop-seat (revision pass, 2026-09-27). **This is the ONE revision available
against `docs/l9-check.md` (committed `8b81835`)**, itself a check of
`docs/l9-scope.md` at `4b33346`. Per `AGENTS.md` ("Two rounds, then ask") and
`docs/loop/iteration-caps.md`, anything this revision cannot settle from the
tree becomes a residual, not a third round.

Write set of this pass: exactly `docs/l9-scope.md`. `git status --short` at the
end of this document proves that.

Inputs read in full before any edit: `docs/l9-check.md` (all 665 lines, `wc -l`),
`docs/DEV_LOOP.md`, `docs/loop/traps-spec.md`, `docs/loop/iteration-caps.md`,
`docs/loop/leverage.md`, the prior `docs/l9-scope.md` (541 lines, `wc -l`, at
`4b33346`), the L9/A42/L13/A13 rows of `docs/BACKLOG.md`
(`grep -a -n "A42\|L9\|L13" docs/BACKLOG.md`, lines 98/99/145), and
`docs/BACKLOG.md:1-19` for its schema and generation rule.

**Three rulings from the orchestrator drive this revision and are applied as
transcription, not re-derived:**

- **RULING 72** - a scanning assertion is classified by its SUBJECT, not by its
  direction (presence/absence) and not by the construct it matches. Applied
  throughout Section 2 below; it replaces the binary "absence assertions may
  need stripping removed" that the prior round re-adopted and the check
  correctly found had dropped the prior pass's owed decision.
- **RULING 73** - L9 and A42 stay separate, restated on the surviving ground
  only (L9's other waves do not need A42); the false ground ("A42 already has
  its own filed scope") is struck. Applied in Section 10.
- **RULING 74** - the ratchet wave (Wave 3) is not dispatchable until Wave 1's
  classification exists, because a frozen allowlist seeded from a proxy the
  census cannot see is a ratchet that locks in the gap. Applied in Section 7,
  Wave 3's own heading.

No new question for the owner is posed by this revision. The three rulings
above settled every decision the check routed to the orchestrator; what remains
unresolved is recorded as residuals in Section 8, each with an owner, an
instrument, and a step, per `iteration-caps.md`'s anti-gaming rule that a
residual missing any of those three is a deletion.

---

## 0. Disposition table - every prior requirement, traced to a sentence, not a heading

Per `docs/loop/iteration-caps.md` entry gate 3: this maps each requirement in
the CHECKED round (`docs/l9-scope.md` at `4b33346`) to where it lands here, by
**text location**, not by section label - the check's B1 finding was exactly
that a table mapping to a surviving heading can hide an obligation the heading
no longer carries.

| # | Prior requirement (source: `4b33346`) | Disposition | Where it lands here |
|---|---|---|---|
| D1 | Section 0, L9/A42 ordering tension, id ORD-1 | KEPT | `docs/l9-scope.md:419-436` (unchanged claim), `:667-696` (Ruling 73's correction of its false second ground) |
| D2 | Section 1 census 208/71/22/79, gap 111-114 | KEPT, re-measured fresh today, single clean method replacing the two disputed orders | `docs/l9-scope.md:84-87` (210/71/23/79 today), `:122-126` (gap 113, canaried), `:141-147` (two-population table 83/70/64/842/359) |
| D3 | Section 2a presence-direction proof (`grade-result-doors.wiring.test.ts`) | KEPT, extended with the caller table and Variant D the check ran | `docs/l9-scope.md:265-372` |
| D4 | Section 2b absence-direction proof (`canvas-client-boundary.test.ts`) | KEPT, RECLASSIFIED under Ruling 72 (see B5's disposition below) | `docs/l9-scope.md:374-417` |
| D5 | Section 2's triage rule (presence must strip, absence must not, comment-content is a third bucket) | WITHDRAWN, replaced by Ruling 72's subject-based classification - the enforcer it protected (Wave 2a's sizing) is carried forward under the new rule, not deleted | `docs/l9-scope.md:164-257` |
| D6 | Section 3's owed decision on comment-aware absence matching (prior-prior pass, `docs/l9-check.md:74-88`, B1(a)) | **RESTORED as answered**: this is exactly what Ruling 72 answers. It was dropped by the round the check audited; it is not dropped here | `docs/l9-scope.md:22-33` (header note), `:175-185` (the rule itself) |
| D7 | Section 4 wave plan (1 triage / 2a remove / 2b add / 3 canaries) | KEPT, renumbered W1-W4, Wave 2a's WORK reshaped by Ruling 72 (from "remove" to "classify by subject, then fix code-behavior scanners' comment-awareness"), Wave 3 gated per Ruling 74 | `docs/l9-scope.md:520-638` |
| D8 | Residual R1 (full per-assertion triage) | KEPT, reworded for subject-based classification | `docs/l9-scope.md:643` (R1 row) |
| D9 | Residual R2 (block-comment sweep for `canvas-client-boundary.test.ts`), owner "the fix wave's first step" | **RELOCATED per B1's/M1's finding**: the owner was fabricated (A42 owns nothing - `docs/BACKLOG.md:98` has `owns`/`verify`/`blocked_by` all `-`). Under Ruling 72 this file's defect is a Wave 2a item in its own right (a code-behavior scanner needing `/* */`-awareness added to its existing `//`-awareness), so R2 is discharged into Wave 2a rather than left as a residual with an invented owner | `docs/l9-scope.md:570-575` (Wave 2a's write set); `:644` (R2 row records the relocation, not a residual) |
| D10 | Residual R3 (a third stripping idiom under a third name hiding in the uncounted gap), owner `loop-test-author`'s Wave 1, instrument "extend R1's script to flag any `.replace(` removing `/*`/`//` by ANY name" | **RESTORED** - the checked round replaced this with a different, narrower finding (the 111-vs-114 one-file disagreement) under the same label, which `docs/l9-check.md:90-98` (B1(b)) correctly identified as an object-and-instrument swap, not a rewording | `docs/l9-scope.md:645` (R3 row) |
| D11 | The 111-vs-114 adjusted-gap disagreement, attributed to `src/lib/decks/deck-source.test.ts` | **WITHDRAWN as stated - the attribution was false.** Re-verified this pass (`grep -n "replace(" src/lib/decks/deck-source.test.ts` -> `:116` is `.replace(/\/\*[\s\S]*?\*\//g, "")`): that file unambiguously contains the literal and is correctly excluded from the gap under any subtraction order. The underlying two-order disagreement itself is real (this revision replaces the two-order comparison with a single clean gap measurement, Section 1, and files the *identity* of any residual per-file disagreement as its own residual, R3b) | `docs/l9-scope.md:121-131` (withdrawal), `:646` (R3b row) |
| D12 | Residual R4 (sample beyond the 2 proven live instances), "sampled exactly 2 of 208" | KEPT, NARROWED per M5 - the two files this document already proves (Section 3a's Variant D, Section 3b's fixtures) are removed from R4's remaining population | `docs/l9-scope.md:647` (R4 row) |
| D13 | Residual R5 (A42/L9 cross-link), instrument `docs/BACKLOG.md`'s two rows | **CORRECTED per M3** - `docs/BACKLOG.md:3-6` states it is GENERATED from `docs/backlog.yml` and hand-editing it fails `npm run backlog:check-generated` (confirmed present at `package.json:13`, this pass). Retargeted to `docs/backlog.yml` | `docs/l9-scope.md:648` (R5 row) |
| D14 | Residual R6 (sibling in-flight branch risk) | KEPT unchanged | `docs/l9-scope.md:649` (R6 row) |
| D15 | Residual R7 (ratchet is name-level, not behaviour-level) | KEPT unchanged, and is now the measured reason Ruling 74 blocks Wave 3 | `docs/l9-scope.md:460` (Shape (3) row), `:605-628` (Wave 3), `:650` (R7 row) |
| D16 | Section 5 remedy space, Shape (3)'s false-positive mode stated | KEPT, Shape (3)'s population blind spot quantified (B4) and its dispatch gated (Ruling 74) | `docs/l9-scope.md:441-466` |
| D17 | Section 6, the sabotage-canary instrument for each fix | KEPT, SPECIFIED per M4 - the checked round's version named no command, no discriminating count, no recorded evidence requirement, and dropped the cp-backup restore discipline; all four fixed here, plus a concurrency clause `docs/l9-check.md:385-390` found missing | `docs/l9-scope.md:470-519`, `:629-638` (Wave 4) |
| D18 | Section 9 Leverage (no claim, this is a chore on the loop's own instruments) | KEPT unchanged - `docs/l9-check.md`'s "Confirmed sound" list marks this correct | `docs/l9-scope.md:655-665` |
| D19 | Section 10 fork (L9/A42 merge), recommendation X, ground "A42 already has its own filed scope" | **Ground struck, recommendation KEPT on the surviving ground** (Ruling 73) | `docs/l9-scope.md:667-696` |
| D20 | Section 11 final gate check, reason "this pass touches no file either gate scans" | **CORRECTED per m4** - both gates DO scan `docs/` (`src/lib/no-emojis.test.ts:237,254`; `src/source-bytes.structure.test.ts`), which is why re-running them after writing this file is meaningful evidence, not a formality | `docs/l9-scope.md:698-742` |

Six defects the check found that are pure corrections rather than restructuring
(the ModalShell/`canvas-client-boundary.test.ts` line-span citation off by two,
`m5`) are folded into the sections above rather than given their own row.

---

## 1. The census, re-measured fresh today (2026-09-27, after the check's own pass)

| Quantity | Command | Result |
|---|---|---|
| `readFileSync` in `*.test.ts` | `grep -rl readFileSync --include=*.test.ts src \| wc -l` | **210** |
| `stripComments` (the word) in `*.test.ts` | `grep -rl stripComments --include=*.test.ts src \| wc -l` | **71** |
| `*.structure.test.ts` files | `find src -name "*.structure.test.ts" \| wc -l` | **23** |
| `*.wiring.test.ts` files | `find src -name "*.wiring.test.ts" \| wc -l` | **79** |

**This drifted again since the check's own pass four hours ago** (208->209
during the check, 210 now; structure 22->23; the check's own m1 already
recorded 208->209 as tree drift from concurrent sibling work, not instrument
disagreement - `diffA.py` in the check's session showed grep and an independent
Python walk agreeing exactly). Recorded here as the same phenomenon continuing,
not a new finding, and specifically why the wave plan below (Section 7) works
off a re-run population at dispatch time, never off a number frozen today.

**The A42 regex-literal census - re-run fresh with a Python script
(`a42_census_revision.py`, this pass's scratchpad), matching the check's own
figures exactly:**

| Quantity | Result |
|---|---|
| Files containing the `[\s\S]*?\*\/` literal, all `src/` | **87** |
| Of those, `*.test.ts` | **86** |
| Total occurrences of that literal | **107** |
| Files containing the `[^]*?\*\/` sibling variant | **5** (`src/app/actions/prompt-announcement-draft.test.ts`, `src/app/actions/prompt-announcement-post.test.ts`, `src/app/components/canvas-tab/announcements-panel.wiring.test.ts`, `src/app/components/canvas-tab/promptAnnouncementDraft.test.ts`, `src/lib/prompt-announcement-types.test.ts`) |
| Absence canary (`stripCommentsZZCANARYZZNONEXISTENT`) | **0 files** |

Unlike the `readFileSync`/`stripComments` word counts above, this specific
number has now been measured identically three times today by two different
authors and three different scripts (this pass's prior round, the check's
`census.py`, and this revision's `a42_census_revision.py`) - it is stable, not
drifting, in the window this document has existed.

**Gap - re-measured with a single clean method, replacing the two disputed
subtraction orders.** The prior two rounds computed `(A - B) - (C - B)` two
independently-coded ways and got 111 and 114, without printing which files
differed. This revision instead computes the gap directly and canaries the
absence claim (`gap_revision.py`, this pass's scratchpad, a Python walk over
`src/`, not a shell pipeline):

```
A = readFileSync test files                                          210
Absence canary (nonexistent readFileSync token, must be 0)             0
Gap = A minus files containing ANY of the three stripping idioms     113
```

**113 is a floor on the defended population and a ceiling on the true gap**,
for the same reason the prior two rounds gave: a fourth naming idiom would hide
inside it. That is restored as Residual R3 (Section 8), not silently dropped -
see D10/D11 in the disposition table above. The specific one-file disagreement
the prior round attributed to `src/lib/decks/deck-source.test.ts` is WITHDRAWN
(D11): re-verified directly, that file's line 116 is
`.replace(/\/\*[\s\S]*?\*\//g, "")` - it unambiguously contains the literal and
is correctly excluded from the gap either way. Whatever file(s) actually caused
the 111-vs-114 split, this revision does not know, and says so (Residual R3b,
Section 8) rather than re-asserting a wrong one-file explanation a second time.

**Two populations within the 113-file gap, same script, canaried:**

| Population | Count | Basis |
|---|---|---|
| Gap files with >=1 presence-shaped assertion (`.toContain(`/`.toMatch(`, not `.not.`) | **83** | `gap_revision.py` |
| Gap files with >=1 absence-shaped assertion (`.not.toContain(`/`.not.toMatch(`) | **70** | Same script |
| Gap files with BOTH shapes | **64** | Set intersection |
| Total presence-shaped occurrences | **842** | Sum across files |
| Total absence-shaped occurrences | **359** | Sum across files |

Compared with the checked round's own re-measurement four hours ago (82/69/63,
same 842/359 occurrence totals): file counts differ by 1 (83 vs 82, 70 vs 69,
64 vs 63), occurrence totals are IDENTICAL across two independently-coded
scripts on two different passes. That is the expected shape for a regex-shaped
proxy scanning a tree that gained files in between (readFileSync alone went
209->210 in the same window) - not a new instrument disagreement, and not
re-litigated further here. **This remains a syntactic proxy, stated plainly as
one**: it cannot see the `.toBe(true)`-shaped presence checks
(`grade-result-doors.wiring.test.ts`'s own `referencesUngradedFlag`), so the
true presence-assertion population is a FLOOR. Turning this proxy into a real
classification, BY SUBJECT per Ruling 72 (not just by direction, which is what
the prior two rounds' triage did), is Wave 1's job (Section 7).

---

## 2. The classification rule for scanning assertions (RULING 72, applied)

The checked round re-adopted a binary the prior-prior pass had explicitly left
undecided: "presence assertions must strip comments; absence assertions may
need it removed." The check (`docs/l9-check.md` B1(a), B2, B5) found that
binary cannot be applied mechanically without either weakening a real guard or
disarming this repo's own proof that its strippers work, and routed the
decision to the orchestrator. **RULING 72 answers it, and this section
restates the rule exactly as ruled, then applies it to every worked example in
this document.**

**The rule: classify every scanning assertion by its SUBJECT, never by its
direction and never by the construct it matches.**

- **Code-behaviour scanners** - the assertion's claim is about what the
  program DOES: an import that executes and reaches the client bundle, an
  event listener that registers, a builder function that gets called, a guard
  that runs before a side effect. **These MUST strip comments in BOTH
  directions.** A commented-out guard must not satisfy a presence assertion
  (that is the L9 defect itself), and a commented-out import or call must not
  trip an absence assertion, because it does not execute and therefore cannot
  produce the behaviour the assertion is actually guarding against.
- **File-content scanners** - the assertion's claim is about what the FILE
  CONTAINS, regardless of whether it executes: no emoji anywhere including
  comments (`src/lib/no-emojis.test.ts` - confirmed this pass,
  `grep -c stripComments src/lib/no-emojis.test.ts` returns `0`, and it must
  stay that way, because this repo's own rule explicitly covers comments), no
  mojibake, no BOM, a required licence header, a pinned citation comment.
  **These MUST NOT strip, and each must say so explicitly in the file** (a
  one-line comment stating "this scanner deliberately does not strip
  comments, because X"), so the next person does not "fix" it by adding
  stripping - the exact failure this row is itself about, one level removed.
- **Stripper-mechanism meta-tests (a subtype of file-content scanner, excluded
  by RULE, not by list)** - an assertion whose subject is the stripping
  HELPER's own output on a fixture the test itself constructed (e.g.
  `src/app/components/autoGradeTransition.wiring.test.ts:32`,
  `expect(stripped).not.toContain("used to live here")` inside a describe
  block literally named `"stripComments (canary first)"` - confirmed this
  pass), rather than a scan of real production or test source. The rule that
  excludes them: **a scanning assertion, for the purposes of this
  classification, ranges only over assertions applied to text read from a
  real file (`readFileSync`) or a real module** - never over an assertion
  applied to a hand-built string literal whose entire purpose is proving the
  stripper itself works. Applying the code-behaviour/file-content split
  mechanically to these would order the removal of the only instruments in
  this repo that watch a stripper fail (the check's B2 finding, `142` such
  occurrences measured, of which `21` were this exact shape) - the rule above
  is why that never happens, without needing a maintained list of which 21.

**Consequence for the worked examples already in this document (Section 3),
worked through rather than assumed:**

- **`src/lib/grade/grade-result-doors.wiring.test.ts`'s `referencesUngradedFlag`
  (Section 3a)** is a code-behaviour scanner (its claim: does this caller file
  show awareness that a row can be ungraded, i.e. does the code path exist).
  Unaffected by Ruling 72 either way - it already needed stripping added under
  every version of the rule, old or new, and Section 3a is unchanged.
- **`src/lib/canvas-client-boundary.test.ts`'s `findClientUnsafeBarrelImports`
  (Section 3b)** is a code-behaviour scanner (its claim: does this
  `"use client"` file actually import a server-only barrel, which is only true
  if the import EXECUTES). Under Ruling 72 it must strip BOTH `//` and `/* */`
  comment forms. It currently strips neither explicitly, but its `^import`
  anchor is a de facto `//`-ignoring mechanism (an unrelated `import` token
  inside a `//` comment never starts a line with `import`), which the file's
  own header comment states is deliberate. **So Fixture A ("`//`-commented
  import produces zero violations") is CORRECT under Ruling 72, and Fixture B
  ("the same import inside a `/* */` block comment produces one violation") IS
  THE DEFECT** - it fires on inert, non-executing code, which is exactly the
  false-positive half of this row. This is the SAME classification the
  checked round's own Section 3b prose used ("Fixture A correctly", "Fixture B
  falsely fires") - what was wrong was not that prose, it was Section 2's
  re-adopted binary contradicting it (the check's B5 finding). Ruling 72
  resolves the contradiction by replacing the binary, not by re-labelling
  Section 3b. Restated in Section 3b below with this reasoning inline.
- **This reclassifies which file needs which fix.** `canvas-client-boundary.test.ts`
  is now correctly a Wave 2a candidate (comment-aware matching needs
  extending to cover `/* */`, not removing) - the check's B5 finding that the
  prior round's Wave 2a-is-empty claim rested on an inverted classification is
  now moot, because Wave 2a's population and shape both change (Section 7).

**One consequence this document records but cannot act on**: the L9 backlog
row's own note (`docs/BACKLOG.md:145`, generated from `docs/backlog.yml`)
still states the pre-ruling framing verbatim ("an assertion that something is
ABSENT must NOT strip them ... an absence guard that correctly ignores a line
comment and FALSELY FIRES on the same import inside a block comment"). Read
under Ruling 72 that second half is actually still right (a code-behaviour
absence scanner falsely firing on inert code IS the defect), but the first
half is the binary Ruling 72 just replaced, stated as a general rule rather
than scoped to file-content subjects. `docs/backlog.yml` is outside this
pass's write set. Folded into Residual R5/R8 (Section 8) for whoever next
edits that file, rather than left as a silent contradiction between this scope
and the row it scopes.

---

## 3. Proof on real files - reclassified under Ruling 72

Both proofs extract the REAL assertion logic VERBATIM from the real test file,
run it under `node --experimental-strip-types` against fixture text, and
mutate no production or test file.

### 3a. Code-behaviour, presence direction - `src/lib/grade/grade-result-doors.wiring.test.ts`, `referencesUngradedFlag`

Unchanged in substance from the prior round; independently already flagged on
the A13 backlog row as **RES-7** (confirmed this pass,
`grep -a -n "RES-7" docs/BACKLOG.md` -> `docs/BACKLOG.md:80`, the A13 row's
note: "grade-result-doors.wiring.test.ts is satisfied by a COMMENT ... STEP:
the next chunk that touches [it], or L9's triage wave, whichever lands
first").

The function, verbatim (`src/lib/grade/grade-result-doors.wiring.test.ts:78-80`):

```ts
function referencesUngradedFlag(source: string): boolean {
  return /\bungraded\b/i.test(source) || /\bisUngraded\b/.test(source);
}
```

No `stripComments` call anywhere in this file
(`grep -c stripComments src/lib/grade/grade-result-doors.wiring.test.ts` -> `0`,
confirmed this pass).

**The write-set gap the check found and this revision restores (B3).** The
prior round named exactly one caller
(`src/app/components/repo-grades/useRepoGradesGradingActions.ts`) and called
the fix "standalone." The check ran the test's OWN caller predicate
(`callsBuilder`, verbatim) over the real 1592-file non-test tree and found a
FOURTH caller this document had not named:
`src/lib/workflows/registry/steps.grading-draft-flow.ts`. Re-verified directly
this pass:

```
grep -n -i "ungraded" src/lib/workflows/registry/steps.grading-draft-flow.ts
```

```
20:import { gradedResults, ungradedResults } from "@/lib/grade/types";
297:          const notGradedCount = ungradedResults(gradeResult.run.results).length;
598:            // N13a: this gate is exactly what keeps an ungraded row (result.ungraded
600:            // union type makes userId and ungraded mutually exclusive, so an
601:            // ungraded row always fails this typeof check by construction.
```

Confirmed: this file's only LIVE (non-comment) occurrences of the word are
`:20` and `:297`, both as `ungradedResults` - which `/\bungraded\b/i` does NOT
match, because `\b` requires a word-boundary transition and `d` immediately
followed by `R` (word character to word character) is not one. Its three
comment lines (`:598,600,601`) DO match. So today, this file satisfies
`referencesUngradedFlag` through prose alone, and would fail it if
comment-stripping were added without also widening the predicate to recognise
`ungradedResults(`.

**Two consequences, both now carried into Wave 2b's brief (Section 7) rather
than left implicit:**

1. **The write set must include `steps.grading-draft-flow.ts`.** Adding
   comment-stripping to `referencesUngradedFlag` with no other change turns
   `grade-result-doors.wiring.test.ts` RED on this file, which was outside the
   prior round's write set. `docs/loop/traps-spec.md`'s own rule ("an
   assignment must include the file that CALLS the new export") applies
   directly, one layer removed - the CALLER here is the file the predicate
   scans, not a code caller of the test, but the shape is the same: a write
   set that omits the file the change breaks ships dead or ships red.
2. **A predicate decision, not just a stripping call.** `referencesUngradedFlag`
   is deliberately loose per its own doc comment ("pins the FACT of
   awareness, not a particular predicate's spelling"). Whether
   `steps.grading-draft-flow.ts`'s use of `ungradedResults(` counts as
   "awareness of the flag" for this predicate's purpose is a decision for
   whoever builds Wave 2b's fix (a test-author/implementer decision inside an
   already-scoped wave, not an owner escalation): either widen the regex to
   also match `ungradedResults\(` and `gradedResults\(`, or leave it narrow
   and treat this file's current code as NOT YET acknowledging the flag
   through this predicate's lens, in which case the wiring test going red here
   is the correct, intended signal that the file needs its own guard added.
   Both options are legitimate; Wave 2b's brief (Section 7) states the fork
   and requires whichever is picked to be justified against the two live
   comment lines it accepts or rejects.

**This is also a stronger currently-armed instance of L9 than the one the
scope's prior round could already point to** (the ModalShell citation, fixed
at `6125260`): for `steps.grading-draft-flow.ts`, `referencesUngradedFlag`'s
verdict is carried 100% by three comments today, in a wiring test that ships
green on `main` right now.

Confirmed green today, unmodified, before any of the above:
`npm run test:paths -- src/lib/grade/grade-result-doors.wiring.test.ts
src/lib/canvas-client-boundary.test.ts` (run this pass, exit code read
directly, not through a pipe) ->

```
Test Files  2 passed (2)
     Tests  22 passed (22)
COVERED src/lib/grade/grade-result-doors.wiring.test.ts files=1 passed=7
COVERED src/lib/canvas-client-boundary.test.ts files=1 passed=15
EXITCODE:0
```

The `useRepoGradesGradingActions.ts` Variant-D result the check produced
(deleting the guard line outright, no replacement, and confirming the
UNMODIFIED real predicate still returns `true` with no commenting-out at all -
a stronger statement than "commenting it out is satisfied," it is "the guard
is already gone-equivalent for this predicate today") is adopted from
`docs/l9-check.md`'s reproduction (`proof1.ts`, its M5 section) rather than
re-run in this pass: the underlying facts it depends on
(`useRepoGradesGradingActions.ts:260,263,338` and the two real
`postCanvasGradesAction(` calls) were independently re-confirmed by this pass
via `grep`, but the driver script itself was not re-executed here. Stated
plainly rather than silently inherited, per this pass's own method
requirements.

### 3b. Code-behaviour, absence direction - `src/lib/canvas-client-boundary.test.ts`, `findClientUnsafeBarrelImports`

Verbatim (`src/lib/canvas-client-boundary.test.ts:132-181` - corrected from the
prior round's `:132-179`; re-measured this pass with
`awk '/^function findClientUnsafeBarrelImports/{start=NR} start && /^}/{print NR; exit}'`,
which returns `181`): `UNSAFE_BARRELS = ["@/lib/canvas", "@/lib/canvas-modules"]`
and the full `findClientUnsafeBarrelImports` function, which anchors on
`^import` with the `m` flag specifically so "an unrelated `import` keyword
mentioned inside a comment ... is never matched" (the file's own header
comment, quoted verbatim).

Three fixtures (reproduced by the check, `proof2_driver.ts`, exit 0):

```
Fixture A (// line-commented import) violations: []
Fixture B (block-commented import) violations: [{"line":3,"specifier":"@/lib/canvas-modules","binding":"COURSE_COPY_TYPES"}]
Fixture C (live, real import) violations: [{"line":1,"specifier":"@/lib/canvas-modules","binding":"COURSE_COPY_TYPES"}]
```

**Classified under Ruling 72 (Section 2 above), not under the withdrawn
binary**: this scanner's subject is CODE-BEHAVIOUR (whether a server-only
barrel is actually imported into a client bundle). A commented-out import,
`//` or `/* */`, never executes and can never actually pull the barrel into
the bundle. So:

- **Fixture A is CORRECT** - a `//`-commented import produces zero
  violations, and it should.
- **Fixture B IS THE DEFECT** - a `/* */`-commented import produces one
  violation, identical in shape to Fixture C's genuinely live import. The
  guard has no concept of `/* */` nesting and cannot distinguish inert,
  commented-out code from a real value import.

This is a **false-positive defect** (the opposite failure direction from
Section 3a's silent gap): a real block-commented import of either barrel would
fail CI today for no reason. **Is it currently live?** No file in the tree
today trips it - re-confirmed this pass,
`npm run test:paths -- src/lib/canvas-client-boundary.test.ts` exits 0,
`Tests 15 passed (15)`. Dormant, proven mechanism, not yet triggered. A sweep
for a real live trigger was not re-run this pass; that sweep, plus the fix
itself, is now Wave 2a's write-set item under Ruling 72 (Section 7) - it is no
longer a residual with a fabricated owner (see D9 in Section 0, and R2's
disposition in Section 8).

---

## 4. The A42 dependency, re-verified

`docs/BACKLOG.md`'s A42 row (line 98, `grep -a -n "A42" docs/BACKLOG.md`) is
still `unscoped` today, with `owns`/`verify`/`blocked_by` all `-` (re-verified
this pass by reading the row directly). Its note still states the
MIME-wildcard `accept="image/*"`-style false block-comment-open defect against
the shared `[\s\S]*?\*\/`-family regex, unresolved. Section 1's fresh count
(87 files, `*.test.ts`: 86, unchanged three times running today) confirms the
population this defect threatens has not shrunk since A42 was filed (85/84).

**The ordering constraint holds unchanged**: any L9 wave that ADDS a new call
to this regex family inherits A42's live bug on day one for any file it scans
that happens to contain a MIME-wildcard `accept=` attribute; any L9 wave that
REMOVES a call, or adds a NON-regex mechanism (a positional anchor, the
technique `snapshot-grading.structure.test.ts` already uses), does not. Waves
1, 2a and 3 below touch no file matching that regex family; Wave 2b's named
candidate (`steps.grading-draft-flow.ts`, a `.ts` source file scanned for an
identifier and a word) is MIME-wildcard-attribute-free by construction (it is
not a JSX/TSX file and defines no `accept=` prop).

---

## 5. The remedy space - costed, ratchet dispatch gated by Ruling 74

**Reuse question, answered directly.** The one existing shared helper is
`src/app/components/ui/modalAdoptionScan.ts`, imported by exactly 2 test files
(`grep -rn 'from "./modalAdoptionScan"' src/app/components/ui`, confirmed this
pass: `modalAdoption.wiring.test.ts:47`,
`modalAdoptionWiring.attributes.test.ts:20`). Everything else - at minimum 71
files matching the word `stripComments` plus 87 matching the regex literal
directly - is an independently duplicated local copy, per this repo's own
house rule (`GradingRecordingPanel.wiring.test.ts:38`: "this repo forbids
importing a helper from another `*.test.ts` file"). The one existing shared
helper is itself inside A42's blast radius (same vulnerable regex family), so
adopting it as-is would spread A42's defect - the same ordering hazard as
Section 4, generalised to the reuse question.

| Shape | Files touched | Cost / risk | False-positive mode |
|---|---|---|---|
| **(1) One shared, non-test helper module**, migrate scanning tests to import it | Up to 210, in practice fewer after Wave 1's per-subject triage | Largest one-time cost; needs a FROZEN ORACLE (stripComments' output on a representative real-file sample, captured before/after) proving the migration changes no existing stripping decision. Must fix A42 first or simultaneously. | None of its own - the risk is a silent migration regression, which the oracle catches. |
| **(2) A lint rule** flagging a `readFileSync`-in-test-file plus a presence-shaped assertion with no stripping call in the same file | 1 new rule file | Cheapest to add; needs its own test suite and duplicates most of Section 1's census logic | A naive version (looking for the WORD `stripComments` rather than proving the call actually defends the assertion) reproduces the exact class of bug it exists to catch, one level up. |
| **(3) A meta-test / coverage ratchet**, seeded from today's census, allowlist may only shrink | 1 new file | Cheap, and this repo already runs exactly this shape (`file-size-ceiling.structure.test.ts`'s `ALLOWED_OVERAGE`) | **Evaluated seriously, and it false-positives in exactly the way this row is about.** Measured (B4, Section 7 below): the syntactic proxy this ratchet would freeze from cannot see boolean-returning presence/absence checks (`.toBe(true)`/`.toBe(false)`) at all - **19 gap files invisible to it, including `src/lib/no-emojis.test.ts`, `src/lib/use-server-exports.test.ts`, `src/lib/module-graph/runtime-import-graph.test.ts`, `src/app/actions/action-guard-coverage.test.ts`, `src/app/components/ui/modalFocus.test.ts`, AND BOTH files this document's own Section 3 proofs are built on** (`grade-result-doors.wiring.test.ts`, `canvas-client-boundary.test.ts`). A ratchet frozen over a population its own census cannot see locks in the gap rather than closing it - **this is why Wave 3 is gated by Ruling 74, below, not merely caveated.** |

**Recommendation, unchanged from the prior round, now gated**: (3) as a cheap
coverage ratchet once its population is measured correctly (Wave 1's job, not
before), PLUS (1) as the eventual consolidation after A42 lands. (2) is not
recommended on its own for the same reason as before - it duplicates (3)'s
census machinery on a slower, harder-to-test surface.

---

## 6. The instrument for the fix itself - the sabotage canary, specified (M4 applied)

A grep-shaped guard is refused here, unchanged: "an assertion that greps for
an identifier is the very shape this row is about." The instrument that
satisfies the rule is a sabotage canary that EXECUTES the real, temporarily
mutated file against the real test. The checked round specified this too
loosely (`docs/l9-check.md` M4: no command named, no discriminating count, no
recorded evidence, restore discipline dropped, and no concurrency clause). All
four fixed here, plus the fifth (concurrency) the check found missing.

**For every assertion Wave 2 newly defends (2a or 2b), the fix's own commit
must, in this exact order:**

1. Run `npm run test:paths -- <the real test file>` on the UNMODIFIED,
   already-fixed file and confirm GREEN (`Test Files N passed (N)`, exit code
   0, read directly from the command, never through a pipe).
2. `cp` the real file to a backup (never `git stash`, never rely on the
   index) - e.g. `cp <file> <file>.l9-sabotage-backup`.
3. Comment out, in the REAL file, exactly the capability the assertion
   guards (the guard line, the import, the call - whichever this specific
   assertion's fix newly defends).
4. Run `npm run test:paths -- <the real test file>` again and require
   **EXACTLY ONE failure - the target assertion**, matching this repo's own
   precedent at `6125260` (`docs/BACKLOG.md:145`'s note: "exactly one failure
   - the target assertion"). A file that goes red for an unrelated reason does
   NOT satisfy this step.
5. **Record the VERBATIM red output** (the failing assertion's expected vs.
   received values, and the exit code) in the wave's own commit message or an
   adjoining note - not merely "it went red," per `docs/loop/iteration-caps.md`
   entry gate 2 and `docs/l9-check.md`'s own citation of "disposal is recorded
   with evidence, not asserted."
6. **Restore from the `cp` backup** - `cp <file>.l9-sabotage-backup <file>` -
   **never `git checkout --`**, which reverts to the index and can destroy
   uncommitted work still in flight on that file from a concurrent chunk.
7. Run `npm run test:paths -- <the real test file>` a third time and confirm
   GREEN again, matching step 1's baseline exactly.
8. Delete the backup file only after step 7's green is confirmed.

**Concurrency, per `docs/DEV_LOOP.md`'s standing rule that "no two agents may
sabotage-verify on the tree at once" is a shared resource invisible in any
file list**: Wave 4 runs as its own single-agent step, never fanned out in
parallel with any other wave that also mutates and restores a file, and never
concurrently with a sibling agent whose own file list includes the target file
of a given canary. Before step 3 above, run `git status --short` and treat any
unexpected modification to the target file as a signal to STOP and re-check
rather than proceed - a kill or a stall mid-sabotage on that exact file is
recoverable only from the `cp` backup, never by assuming the tree is clean.

---

## 7. Wave plan

**Wave 1 - triage (a seat, e.g. `loop-test-author`; produces a classification,
no production or test code changes).**

- **Write set, restored to three parts** (the checked round collapsed this to
  one number, B1(c)):
  1. The 113-file gap population (Section 1), classified PER ASSERTION by
     SUBJECT under Ruling 72 (code-behaviour / file-content /
     stripper-mechanism-meta-test), refining Section 1's proxy which
     undercounts boolean-returning checks (Wave 3's B4 finding names five
     concrete examples that must be added to the census, not just the gap).
  2. **The other 97 files that already strip by some idiom** (Section 1's
     stripper population, not just the 113-file gap), to confirm they are
     correctly classified as already-defended under Ruling 72 - i.e. that
     each is genuinely a code-behaviour scanner stripping correctly, not a
     file-content scanner stripping when it should not.
  3. **`modalAdoptionScan.ts`'s two dependents** (`modalAdoption.wiring.test.ts`,
     `modalAdoptionWiring.attributes.test.ts`), to confirm they correctly
     inherit whatever A42's own fix (still `unscoped`) ends up doing to the
     shared helper - the one obligation the checked round's collapse dropped
     entirely, because it is about a fix that has not happened yet and is not
     implied by any population count.
- Also produces the frozen allowlist Shape (3) (Section 5) will need, but
  **does not freeze it** - that is Wave 3's own step, gated below.
- Depends on: nothing code-side. Can start immediately and independently of
  A42.

**Wave 2a - code-behaviour absence scanners: make comment-matching complete,
not remove it (reshaped by Ruling 72).**

Under the withdrawn binary this wave was "remove stripping from absence
assertions" and measured empty. Under Ruling 72 it is: **for every absence
assertion whose subject is code-behaviour, confirm its comment-handling covers
BOTH `//` and `/* */` forms; where it does not, fix it.**

- **Sized from B2's measurement, corroborated independently this revision**
  (`wave2a_revision2.py`, this pass's scratchpad, exact match on the two
  coarsest counts): 97 files strip comments by one of the three named idioms
  (my count: 97, identical to the check's); of those, 78 files / 446
  occurrences (upper bound) carry an absence-shaped assertion (my count: 78
  files / 446 occurrences, identical to the check's). The finer breakdown -
  which of those occurrences apply to text read from a real file versus a
  stripper's own fixture - is the check's own figure (95 occurrences / 30
  files real, 21 occurrences / 15 files stripper-canary, 17/9 unresolved),
  reproduced by this pass at a coarser grain (131 occurrences / 39 files
  "stripped-variable" heuristic, not independently re-derived at the check's
  finer canary-exclusion grain within this revision's time budget - stated
  plainly rather than silently adopted as exact).
- **Named write-set items already confirmed, not merely proposed:**
  - `src/lib/canvas-client-boundary.test.ts`'s `findClientUnsafeBarrelImports`
    (Section 3b) - extend the `//`-ignoring anchor to also ignore `/* */`
    block comments, and sweep for any currently-live block-commented
    `@/lib/canvas`/`@/lib/canvas-modules` import before or with the fix (this
    absorbs Residual R2, D9 in Section 0 - RELOCATED here rather than left as
    a residual with a fabricated owner).
  - The stripper-mechanism-meta-test exclusion (Section 2) applies to the
    canary-shaped occurrences named in B2 (e.g.
    `src/app/components/autoGradeTransition.wiring.test.ts:32`,
    `expect(stripped).not.toContain("used to live here")` inside
    `describe("stripComments (canary first)"`, confirmed this pass) - these
    are excluded BY RULE, not enumerated.
  - The remainder (the real-file occurrences B2/this revision's script found)
    is Wave 1's classification output, not sampled ad hoc here.
- File list beyond the two confirmed items above: produced by Wave 1
  (dependency, not a note).

**Wave 2b - presence direction, code-behaviour scanners currently unguarded
(BLOCKED on A42 file-by-file, per Section 4).**

- **Write set corrected per B3**: `src/lib/grade/grade-result-doors.wiring.test.ts`'s
  `referencesUngradedFlag` AND `src/lib/workflows/registry/steps.grading-draft-flow.ts`
  (the caller the prior round's write set omitted, confirmed this pass at
  Section 3a - comment-stripping the predicate with no other change turns the
  wiring test red on this second file today).
- **Predicate decision required, not just a stripping call** (Section 3a):
  either widen `referencesUngradedFlag` to recognise `ungradedResults(`/
  `gradedResults(`, or keep it narrow and accept that this file's wiring test
  goes red until the file itself gains an explicit ungraded-aware guard. State
  which, and why, against the two live comment lines (`:598,600,601`) that
  currently satisfy the predicate.
- Not blocked on A42 (Section 4: neither file is a JSX/TSX file with an
  `accept=` attribute).
- The remainder of the file list comes from Wave 1.

**Wave 3 - the meta-test / coverage ratchet (Shape (3), Section 5). NOT
DISPATCHABLE UNTIL WAVE 1'S PER-SUBJECT CLASSIFICATION EXISTS - this is a
requirement, not a note (RULING 74).**

Freezing an allowlist now would freeze it against Section 1's syntactic proxy,
which is proven blind to 19 gap files including `src/lib/no-emojis.test.ts`
and BOTH of this document's own proof files
(`grade-result-doors.wiring.test.ts`, `canvas-client-boundary.test.ts`,
Section 5's Shape (3) row). A ratchet seeded from a population its own census
cannot see is a ratchet that locks in exactly the gap this row exists to
close: after Wave 2b fixes `grade-result-doors.wiring.test.ts`, the ratchet
could not credit the fix (the file was never in the allowlist), and a newly
added boolean-shaped undefended presence check anywhere in `src/` would pass
the ratchet silently, forever.

- **Dependency, stated as a blocking requirement**: Wave 3 may not be
  dispatched until Wave 1 has produced the per-subject classification
  (Section 7, Wave 1) INCLUDING the boolean-returning shapes named in Section
  5's Shape (3) row. Seeding the allowlist from "today's census" without that
  classification, as the prior round proposed, is exactly the shape Ruling 74
  forbids.
- New file only once dispatched: `src/lib/source-scan-comment-coverage.structure.test.ts`
  (name illustrative, not binding).

**Wave 4 - sabotage canary per newly-defended assertion (Section 6). Follows
2a/2b's actual diffs.**

- Depends on: 2a's and 2b's actual diffs, run one canary per assertion either
  wave lands, per Section 6's eight-step protocol and its concurrency clause.
- This is the load-bearing correctness instrument; Wave 3's ratchet is
  coverage-only (R7, Section 8) and must not be substituted for it.

---

## 8. Residual register

| # | What is not proven now | Owner | Instrument | Object / direction of failure | Step |
|---|---|---|---|---|---|
| R1 | Full per-assertion classification of the readFileSync population BY SUBJECT (code-behaviour / file-content / stripper-mechanism-meta-test, Ruling 72), refining Section 1's proxy which undercounts boolean-returning checks | `loop-test-author` | A script pairing each `expect(...)` call (including `.toBe(true/false)` on a named boolean-returning scan function, not just `.toContain`/`.toMatch`) with its subject classification and whether comment-stripping of ANY name precedes it in the same file | The full readFileSync population; a misclassified file ships the wrong-direction fix or leaves a gap open | Wave 1 |
| R2 | RELOCATED, not a residual - see Section 7, Wave 2a and D9 in Section 0. The prior round's owner ("the fix wave's first step" / implicitly A42) was fabricated (M1): A42's `owns`/`verify`/`blocked_by` are all `-`, and `canvas-client-boundary.test.ts` is not in A42's own named population (`grep -c stripComments` returns `0`). Discharged into Wave 2a's own write set instead of left as an unowned residual. | - | - | - | - |
| R3 | RESTORED (D10): a third stripping idiom under a third name would hide inside the 113-file gap or the 97-file stripper population, uncounted by either | `loop-test-author`'s Wave 1 | Extend Wave 1's classification script to flag any function whose body contains a `.replace(` call removing `/\*...\*\/` or `//...` sequences under ANY name, not just the three named idioms | The full readFileSync population; a hidden fourth idiom is misclassified as undefended (widens the false gap) or as defended (hides a real gap) | Wave 1 |
| R3b | The 111-vs-114 adjusted-gap disagreement the prior two rounds measured but never identified the file(s) for - this revision confirmed the one file previously blamed (`src/lib/decks/deck-source.test.ts`) is NOT the cause (D11) and does not know what is | `loop-test-author`'s Wave 1 | Re-run both set-difference orders and print the SYMMETRIC DIFFERENCE of the two file lists (not just the counts), then read whichever file(s) appear and classify by hand | The gap population; a 3-file (or however many, re-measured) floor/ceiling spread is not dangerous on its own, but an unidentified instrument disagreement on the SAME population is exactly what `docs/loop/traps-spec.md` says never to leave unmeasured | Wave 1 |
| R4 | NARROWED (M5): whether files besides the two this document already proves live (Section 3a: `useRepoGradesGradingActions.ts`/`steps.grading-draft-flow.ts` via `grade-result-doors.wiring.test.ts`; Section 3b: the mechanism proof on `canvas-client-boundary.test.ts`) share the "verdict does not depend on real code executing" property | `loop-test-author`'s Wave 1 | For each REMAINING presence-style assertion from R1's classification, extract its predicate and replay it against a scratch copy with the guarded line deleted outright (the Variant-D technique, no commenting-out needed to demonstrate it) | The presence-assertion subset, minus the two files this document already covers; a live-armed instance ships unnoticed another cycle | Wave 1's per-file audit |
| R5 | RETARGETED (M3): the A42/L9 cross-reference is stated in prose in both rows' notes but `docs/BACKLOG.md` (GENERATED, per its own header, `docs/BACKLOG.md:3-6`) has no structured cross-link, and hand-editing the generated file fails `npm run backlog:check-generated` (`package.json:13`, confirmed present this pass) | Whichever agent next edits `docs/backlog.yml` (outside this pass's write set) | The two rows in `docs/backlog.yml` itself, cross-linked explicitly, then re-rendered via `npm run backlog:render` | `docs/backlog.yml`'s L9 and A42 entries; a future session scopes or fixes A42 in isolation and a concurrent L9 wave copies the pre-fix regex into new files | The next backlog reconciliation or push touching either row |
| R6 | Whether a Wave 2 edit breaks an assumption a DIFFERENT in-flight sibling agent's branch currently relies on - unverifiable in this environment (no live multi-branch CI view) | The repo owner / orchestrator at push time | `docs/DEV_LOOP.md`'s "Regression, batched per group" step | Any code wave from this plan; a wave passes every local gate but breaks a sibling branch's shared-file assumption | The regression pass at whichever wave's push lands first |
| R7 | Shape (3)'s coverage ratchet (Wave 3) is a NAME-level census and cannot detect a stripping helper that runs but is behaviourally wrong (CRLF-blind per L13, or MIME-wildcard-blind per A42) | Whoever authors Wave 3's meta-test, once Ruling 74's gate clears | None yet beyond Wave 4's sabotage canaries - the mitigation is NOT relying on Wave 3 alone, which is why it is coverage-only and Wave 4 is load-bearing | Any file the ratchet marks "defended" whose defence mechanism is itself broken; false confidence, one level up from this row's own subject | Wave 4, and any future L13-style behavioural audit |
| R8 | `docs/backlog.yml`'s L9 note states the pre-Ruling-72 binary framing ("an assertion that something is ABSENT must NOT strip") as a general rule, unscoped to file-content subjects - a future reader could inherit the withdrawn binary from the row's own prose even after this scope applies Ruling 72 | Same receiver as R5 - whichever agent next edits `docs/backlog.yml` | Update the L9 note's triage-rule sentence to state the subject-based rule (Section 2) instead of the binary, keeping the row's existing "correctly ignores / falsely fires" language, which is already consistent with Ruling 72 | `docs/backlog.yml`'s L9 entry; a later session designs Wave 2a or 2b against the row's stale prose instead of this scope | Same push as R5 |

---

## 9. Leverage

Per `docs/loop/leverage.md`, unchanged from the prior round and confirmed
correct by the check's own "Confirmed sound" list: this row is a chore on the
loop's own instruments. It changes no code a user reaches, adds no persisted
record, no capture, no live-loop control, no integration, no scale, and no
guaranteed output property visible to an instructor or student. No leverage
claim is written, and none should be expected from whichever wave eventually
implements this.

---

## 10. Fork - resolved by RULING 73, ground corrected

The prior round's Section 10 framed this as an open fork with a
recommendation. It was not open - the orchestrator had already ruled (the
check calls it "the ruling handed to this check"), and this section restates
that standing ruling with its false ground struck, per Ruling 73.

**The ruling: L9 and A42 stay separate.** The prior round gave two grounds:

1. ~~"A42 already has its own filed scope, its own STEP field, and its own
   owner path."~~ **FALSE, struck.** Re-verified this pass: `ls docs | grep -i
   a42` returns nothing (no filed A42 scope document exists), and A42's row
   (`docs/BACKLOG.md:98`) has `owns`/`verify`/`blocked_by` all `-`, `state`
   `unscoped`. This document's own Section 4 already said "unscoped" eleven
   lines from where the prior round's Section 10 said the opposite - both
   sentences existed in the same document, and the second was wrong.
2. **"L9's other waves (1, 2a, 3) do not need A42 to be correct first."**
   **This ground survives and is measured true**: Wave 1 is a classification
   pass, touching no stripping regex; Wave 2a's confirmed candidate
   (`canvas-client-boundary.test.ts`) scans for an `^import` anchor, never an
   `accept=` attribute; Wave 3, once dispatchable, is a census/ratchet over
   assertion shapes, not a new stripping call. Only Wave 2b's file-by-file
   gating (Section 4, Section 7) touches the shared regex family at all, and
   it is already gated on A42 per file, not on the row-level merge question.

**The ruling's conclusion is unchanged: keep the rows separate.** Only its
stated grounds change - one struck, one confirmed by measurement. No further
fork is open here; nothing in this section needs a decision from the owner.

---

## 11. Final gate check for this pass

This pass wrote documentation only (`docs/l9-scope.md`); read several
production and test files for citation but edited none.

**Corrected reasoning (m4): both structural gates below DO scan `docs/`** -
`src/lib/no-emojis.test.ts:237,254` walks `["src", "docs"]` with `.md` in
`SCAN_EXTENSIONS` (confirmed this pass, `sed -n '236,254p'`), and
`src/source-bytes.structure.test.ts` walks `process.cwd()` with `.md` in its
own extension set. So this file IS inside both gates' population, and
re-running them after writing it is the actual evidence that writing this
file introduced no NUL byte, no BOM, no emoji and no mojibake - not a
formality, as the prior round's stated reason implied.

Re-run this pass, exit code read directly from the command:

```
npm run test:paths -- src/lib/no-emojis.test.ts src/source-bytes.structure.test.ts
```

```
Test Files  2 passed (2)
     Tests  21 passed (21)
COVERED src/lib/no-emojis.test.ts files=1 passed=18
COVERED src/source-bytes.structure.test.ts files=1 passed=3
EXITCODE:0
```

Also re-run, as evidence for Section 3's citations rather than as a
structural gate:

```
npm run test:paths -- src/lib/grade/grade-result-doors.wiring.test.ts src/lib/canvas-client-boundary.test.ts
```

```
Test Files  2 passed (2)
     Tests  22 passed (22)
COVERED src/lib/grade/grade-result-doors.wiring.test.ts files=1 passed=7
COVERED src/lib/canvas-client-boundary.test.ts files=1 passed=15
EXITCODE:0
```

`git status --short` immediately before writing this file (this pass's session
start, after the check's own pass had already landed its file and the
sibling-owned `walkthrough-announcement` files had already been resolved by
their own agent):

```
 M docs/css-orphans.md
```

`git status --short` after writing this file and re-running both gates above
(both still exit 0, `Tests 21 passed (21)` unchanged):

```
 M docs/css-orphans.md
 M docs/l9-scope.md
```

`docs/l9-scope.md` is this pass's own entry (`M`, not `??`, because it already
existed at `4b33346`). `docs/css-orphans.md` is sibling-owned and untouched by
this pass, unchanged from the pre-write status above. No `git stash`, no
`git add -A`, and no `git checkout --` was run at any point in this pass.
