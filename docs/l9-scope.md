# L9 scope - source-scanning tests satisfied by commented-out code

Seat: loop-seat (scoping pass). This is a fresh scope, not a revision - no
`docs/l9-scope.md` existed before this file (`ls docs/l9-scope.md` returned
"No such file or directory" before this pass wrote it), so the "disposition
table for a restructured prior version" requirement does not apply here.
There is no prior L9 scope to map requirements from.

Inputs read in full before any measurement below: the L9 row of
`docs/backlog.yml` (`grep -n "id: 'L9'" -A 40 docs/backlog.yml`, lines
220-233), the A42 row of the same file (`grep -n "id: 'A42'" -A 40
docs/backlog.yml`, lines 626-639), `AGENTS.md`, `docs/DEV_LOOP.md`, and
`docs/loop/this-repo.md`. Tree: `main`, working tree has unrelated in-flight
changes under `src/app/components/snapshot-grading/` from other concurrent
agents (`git status --short` at the end of this document); none of those
files were edited by this pass.

Write set of this pass: exactly this one file. No other file was touched.

---

## 0. Read this first - the relationship to A42, stated before the census

The row text directs this explicitly and the finding changes how any fix
wave must be sequenced, so it goes first rather than at the end.

**L9 and A42 are ADJACENT fixes on two different axes of the same
mechanism, and they are in a real ORDERING TENSION for one half of L9's
remedy space.**

- L9 is about POLICY: which source-scanning tests invoke comment-stripping
  at all, and in which direction (presence assertions need it added;
  absence assertions may need it removed; assertions ABOUT comments
  themselves need neither). L9's own note in `docs/backlog.yml` states this
  triage rule explicitly and says it must be authored before any file is
  touched.
- A42 is about MECHANISM: whether the comment-stripping regex that a
  presence-assertion fix would ADD is itself correct. A42 measured that the
  most common shared regex, `/\/\*[\s\S]*?\*\//g` (and a same-bug variant
  using `[^]*?` in place of `[\s\S]*?`), treats a literal `/*` inside a
  MIME-wildcard `accept="image/*"`-style attribute as a block-comment open
  and deletes real source up to the next unrelated `*/`.

**The tension:** if an L9 fix wave closes a presence-assertion gap by
copying the existing `stripComments` idiom into a previously-undefended
file (the obvious, cheapest fix), and that file happens to scan a directory
containing a MIME-wildcard `accept=` attribute, the new call site inherits
A42's live defect on day one - L9's own remedy would WIDEN A42's blast
radius from the measured 85 files (`docs/backlog.yml`, A42 row) toward the
full source-scanning population this document measures below (205 files by
one count). This is exactly the mechanism A42's own row already anticipates
in its STEP field ("the next chunk that touches
`src/app/components/ui/modalAdoptionScan.ts` or adds a new
`*.structure.test.ts` / `*.wiring.test.ts` using this idiom, whichever
comes first, so the trap does not silently spread") - L9 is precisely that
next chunk for its presence-assertion half.

**What is NOT in tension:** L9's other remedy direction - removing
comment-stripping from absence-assertion tests that currently strip when
they should not - does not add any new call to `stripComments` and cannot
inherit A42's bug by construction. That half of L9 has no dependency on
A42 and can proceed on its own schedule.

**Consequence for scoping, stated once so the wave plan below does not
repeat it:** any L9 wave that ADDS a new comment-stripping call site is
blocked on A42 having either fixed the shared regex or produced a
documented, oracle-backed decision that the copied idiom is safe for the
specific files that wave touches. Any L9 wave that REMOVES a call site is
not blocked on A42 at all.

---

## 1. The census

Three populations, each measured twice today (git-bash `grep`/`find` and
PowerShell `Get-ChildItem`/`Select-String`) because `docs/loop/this-repo.md`
records the two shells disagreeing by up to 138 lines on other measurements
in this repo. On these three counts the two shells agreed exactly.

| Quantity | Command | git-bash result | PowerShell result |
|---|---|---|---|
| readFileSync in `*.test.ts` | `grep -rl readFileSync --include=*.test.ts src \| wc -l` | 205 | 205 |
| `stripComments` (the word, anywhere) in `*.test.ts` | `grep -rl stripComments --include=*.test.ts src \| wc -l` | 70 | 70 |
| `*.structure.test.ts` files | `find src -name "*.structure.test.ts" \| wc -l` | 22 | 22 |
| `*.wiring.test.ts` files | `find src -name "*.wiring.test.ts" \| wc -l` | 77 | 77 |

PowerShell forms used: `Get-ChildItem -Path src -Recurse -Include *.test.ts
| Select-String -Pattern readFileSync -List` (and the same with `-Pattern
stripComments`), `Get-ChildItem -Path src -Recurse -Include
*.structure.test.ts`, `Get-ChildItem -Path src -Recurse -Include
*.wiring.test.ts`.

**Reconciling against the numbers the two rows were filed with.**

- L9 was filed 2026-09-22 with 203 / 69 (readFileSync / stripComments).
  Today's 205 / 70 is a drift of +2 / +1 in one day, consistent with
  concurrent feature work rather than a measurement error. L9's own
  instrument note already flagged that the PowerShell form had not been
  re-run against the 2026-09-15 176/57 baseline; it now has been, today,
  and matches the grep form exactly at 205/70.
- L9's note also records three DIFFERENT counts for `*.structure.test.ts`
  in circulation - 5 (the row's own original filing), 22 (L9's
  2026-09-22 re-measurement), and 12 vs 17 (two different sections of
  `docs/loop/this-repo.md`) - and says "none of the three is right today,
  re-measure rather than quoting any of them." Today's measurement is 22,
  matching L9's 2026-09-22 figure exactly. Neither `this-repo.md` number is
  current.
- A42 measured (via the Grep tool, restricted to `*.test.ts`) 84 files
  containing the literal substring `[\s\S]*?\*\/` (the shared middle-and-close
  of the vulnerable regex), 101 occurrences, plus one non-test file
  (`src/app/components/ui/modalAdoptionScan.ts:146`, `export function
  stripComments`). Re-measured today with `grep -rlF '[\s\S]*?\*\/' src
  --include=*.test.ts | wc -l`: **84 files**, exact match. All-of-`src`
  form (`grep -rlF '[\s\S]*?\*\/' src | wc -l`): **85 files**, exact match.
  Occurrence count today (`grep -roF '[\s\S]*?\*\/' src | wc -l`): **105**,
  up from A42's 102 same-day-measured-earlier total - a small drift
  consistent with the same concurrent work noted above, not a
  contradiction.
- **An instrument defect I made and caught before using the number:** my
  first attempt at this same search used the pattern `[\s\S]*\*/` (missing
  the non-greedy `?` and the second backslash before the closing slash) and
  returned 0 files - a false "clean" result, the exact failure mode this
  row is about, caught here on my own instrument rather than a test's. The
  canary that caught it: I ran the SAME wrong pattern against
  `stripCommentsZZCANARYZZNONEXISTENT` (a string that cannot exist) and
  also got 0/"No files found" - an absence result that looked identical to
  my real search's result, which is precisely why a canary must prove the
  tool fires on a KNOWN-PRESENT string, not just fail to fire on a
  known-absent one. I confirmed the corrected pattern against
  `src/app/actions/carry-module-pattern.test.ts:639` (`return
  text.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/.*$/gm, "");`) before
  trusting the 84/85 counts above.

**A second, larger reconciliation: L9's own instrument undercounts the
"defended" population by at least 22 files, using a name other than
`stripComments`.**

L9's gap arithmetic is 205 - 70 = 135 "no comment defence." I intersected
the 85-file A42 regex-literal list against the 70-file `stripComments`-word
list (`comm -23`/`comm -13` on the two sorted file lists) and found:

- **22 files** contain the exact vulnerable regex literal
  (`[\s\S]*?\*\/`) but do NOT contain the word `stripComments` anywhere -
  they strip comments inline, under a different local name, before an
  assertion. All 22 also use `readFileSync` (confirmed with `grep -c
  readFileSync` on each, 2 to 10 occurrences per file), so all 22 are
  counted inside L9's 135-file gap even though they already strip comments.
  Spot-checked three with `grep -nF '[\s\S]*?\*\/'`:
  `src/app/actions/githubRepoGrading.wiring.test.ts:34` (`.replace(/\/\*[\s\S]*?\*\//g,
  "")`, chained without a named helper), `src/lib/accommodations.test.ts:162`
  (`const withoutComments = source.replace(/\/\*[\s\S]*?\*\//g,
  "").replace(/\/\/.*$/gm, "");`), `src/app/focusRing.wiring.test.ts:76`
  (`return text.replace(/\/\*[\s\S]*?\*\//g, "");`, inside a function named
  something other than `stripComments`). Full 22-file list:
  `src/app/actions/githubRepoGrading.wiring.test.ts`,
  `src/app/actions/syllabusUploadTransport.wiring.test.ts`,
  `src/app/components/GithubGradingPanel.wiring.test.ts`,
  `src/app/components/content-tab/modules/ModulesHeaderBar.wiring.test.ts`,
  `src/app/components/content-tab/modules/useBulkBarGroups.test.ts`,
  `src/app/components/courses/page-module-css-classes.test.ts`,
  `src/app/components/courses/page-module-css-orphan-classes.test.ts`,
  `src/app/components/grading-results/gradingResultsHelpersWiring.test.ts`,
  `src/app/components/grading-results/gradingResultsPostOutcome.test.ts`,
  `src/app/components/recording/discussionReplyResources.wiring.test.ts`,
  `src/app/components/recording/resourceQuery.wiring.test.ts`,
  `src/app/components/recording/useReplyResources.test.ts`,
  `src/app/components/repo-grades/repoGradesCodeExecution.wiring.test.ts`,
  `src/app/components/repo-grades/repoGradesRubricPicker.wiring.test.ts`,
  `src/app/components/repo-grades/repoGradesSliceA.guards.test.ts`,
  `src/app/components/tabs/topLevelTabs.wiring.test.ts`,
  `src/app/components/tasks/taskCellAttachments.wiring.test.ts`,
  `src/app/components/tasks/taskNoteIndicator.wiring.test.ts`,
  `src/app/focusRing.wiring.test.ts`, `src/lib/accommodations.test.ts`,
  `src/lib/announcement-exemplars.test.ts`,
  `src/lib/grade/grouping-zip-parents.wiring.test.ts`.
- **8 files** contain the word `stripComments` but NOT the exact regex
  literal. Read all 8: 2 are the import-only files A42 already names
  (`src/app/components/ui/modalAdoption.wiring.test.ts`,
  `src/app/components/ui/modalAdoptionWiring.attributes.test.ts` - both
  import `stripComments` from `modalAdoptionScan.ts` rather than defining
  it, confirmed at
  `src/app/components/ui/modalAdoptionWiring.attributes.test.ts:20`). The
  other 6 define a LOCAL `stripComments` using a genuinely different
  mechanism: `src/app/components/canvas-tab/announcements-panel.wiring.test.ts:26-28`
  uses `[^]*?` instead of `[\s\S]*?` (functionally the same block-comment
  match, same MIME-wildcard exposure, just not byte-identical to A42's
  cited literal - a THIRD variant of the same bug, not caught by A42's own
  search string);
  `src/app/components/grading-results/ungradedDisclosure.test.ts:480-484`
  and `src/app/components/grading-results/ungradedRowLabel.test.ts:101-106`
  (the latter's own comment at `:100` says "Duplicated from
  ungradedDisclosure.test.ts") strip only `//` line comments and never
  touch `/* */` block comments at all, so they are immune to A42's specific
  bug by construction (a different, narrower defense, not a bug);
  `src/lib/prompt-announcement-types.test.ts:13-14` uses the SAME `[^]*?`
  variant as `announcements-panel.wiring.test.ts` above
  (`const noBlockComments = source.replace(/\/\*[^]*?\*\//g, "");`) - a
  fourth file with the same not-byte-identical-to-A42's-literal variant of
  the bug, not a plain copy of the exact regex as an earlier draft of this
  document incorrectly stated before this text was checked against the
  file directly; `src/supabase-migrations.structure.test.ts:66-69`
  uses a hand-rolled character-by-character parser
  (`stripCommentsAndDollarQuotes`), immune to the regex bug entirely by
  construction; `src/tools/backlog/backlog-file.structure.test.ts:63` does
  not strip anything - the word "stripComments" there is a COMMENT
  referencing this exact A42 backlog entry by name
  (`// 55 -> 56: A42 filed 2026-09-23, the stripComments source-text-instrument`),
  which is a false positive for any word-based census: it is a file ABOUT
  the defect, not a file WITH the defect. This file is outside my write set
  (`src/tools/backlog/*`) and was only read, not edited.

**Adjusted gap.** Subtracting the 22 known-alternate-name files from L9's
raw 135-file gap gives **113 files** that use `readFileSync` in a
`*.test.ts` file and show no evidence, under either name I searched for, of
stripping comments before at least some assertion. This is a FLOOR on the
defended population and therefore a CEILING on the true gap, not a final
number: my adjustment covers exactly the two search terms above (the word
`stripComments` and one regex literal plus its `[^]*?` sibling found by
hand); a third idiom I have not searched for (a different regex spelling,
or a non-regex tokenizer like `supabase-migrations.structure.test.ts`'s,
under a third name) would hide inside the 113 and go uncounted here. That
further check is Residual R3 below, not resolved by this pass.

---

## 2. Which direction each undefended test fails in - two concrete, verified citations

The row is careful to separate these and so is this document.

### 2a. Presence assertion, no comment defense - a live example, not a hypothetical

`src/app/components/snapshot-grading/snapshot-grading.structure.test.ts:243`
reads `src/app/components/ui/ModalShell.tsx` with
`fs.readFileSync(modalShellPath, "utf-8")` into `modalShellSource`, with no
call to `stripComments` anywhere on that variable. The assertion at
`src/app/components/snapshot-grading/snapshot-grading.structure.test.ts:245-246`
is `expect(modalShellSource).toContain('aria-modal="true"');` - a pure
presence check on raw source.

`src/app/components/ui/ModalShell.tsx` contains the exact string
`aria-modal="true"` TWICE today: once live, in the actual JSX prop at
`ModalShell.tsx:94`, and once inside a plain-text doc comment at
`ModalShell.tsx:16` (`// role="dialog", aria-modal="true" and the
accessible name all move onto`). I verified with a small Python script
(`check_modalshell.py` in this session's scratchpad) that reads the real
file, counts occurrences (2, matching `grep -n aria-modal
src/app/components/ui/ModalShell.tsx`), then deletes line 94 outright and
re-checks: the string is still present, because line 16's comment supplies
it. So this assertion's current PASS is not, and never was, proof that the
live `aria-modal="true"` prop exists - the doc comment alone is sufficient
to satisfy it, TODAY, with no hypothetical edit to the test needed. This is
armed in a stronger sense than "would fail to catch a future regression":
the exact text that would let the capability disappear silently is already
sitting in the file, coincidentally placed there by someone documenting the
very fact the test means to guard.

### 2b. Absence assertion, no comment defense - a proven mechanism defect, not yet triggered by any file in the tree

`src/lib/canvas-client-boundary.test.ts` scans real "use client" files
(`fs.readFileSync` at `:293` and `:314`, `isUseClientModuleText` at
`:303`-adjacent) with `findClientUnsafeBarrelImports`
(`src/lib/canvas-client-boundary.test.ts:132-179`), which is an ABSENCE
guard: it asserts a file contains none of two forbidden barrel imports
(`UNSAFE_BARRELS` at `:70`). It does not call `stripComments` anywhere -
this is deliberate per its own header comment
(`src/lib/canvas-client-boundary.test.ts:139-143`), which explains that the
`^import` line-start anchor (`m` flag) is there specifically so "an
unrelated `import` keyword mentioned inside a comment or a doc string is
never matched."

That anchor genuinely defeats a `//`-commented-out forbidden import: I
extracted the exact regex construction from
`src/lib/canvas-client-boundary.test.ts:151-152` into a standalone Node
script (`check_boundary_guard.js` in this session's scratchpad) and ran it
against a fixture with `// import { COURSE_COPY_TYPES } from
"@/lib/canvas-modules";` on its own line - zero violations reported,
correctly. The SAME script, given the identical import wrapped in a
`/* ... */` block comment on its own line instead, reports one violation
(`{"line":3,"specifier":"@/lib/canvas-modules","binding":"COURSE_COPY_TYPES"}`),
because the `^import` anchor matches at the start of that line regardless
of the enclosing block comment - the regex has no concept of `/* */`
nesting. This is the mirror-image defect the row asks about: an absence
guard that fires on inert, commented-out text, i.e. "fires on nothing." I
searched for a real trigger (`grep -rn "^import.*@/lib/canvas" src
--include=*.tsx --include=*.ts | grep -v "\.test\."`, 175 real, live,
uncommented matches, none inside a block comment by inspection of the
matched lines) and did not find one - this is a proven mechanism defect,
confirmed by replaying the guard's own code, that is NOT currently
producing a wrong verdict because no file in the tree today happens to
contain a block-commented import of these two barrels.

### 2c. Answering "is anything currently defeated" plainly

**No test in this repo is currently producing a wrong pass/fail verdict
because of this defect, as far as this pass's sampling reached.** Both
citations above are traps, not sprung traps, in A42's own vocabulary - but
they differ in how close to sprung they are, and conflating them would
misstate the finding:

- 2a (ModalShell) is armed with the exact defeating text ALREADY PRESENT in
  the scanned file. No one needs to add anything for the assertion to stop
  proving what it claims to prove; the only thing standing between today
  and a silent regression is that the live prop at `ModalShell.tsx:94`
  has not yet been deleted or renamed by an unrelated change.
- 2b (canvas-client-boundary) is armed only in the sense that the
  regex is provably capable of the false-positive; no file in the tree
  today contains the triggering pattern, so it is a dormant mechanism
  defect, one step further from live than 2a.

This sampling covered 2 of the roughly 113-205 candidate files (see
Residual R4); it is evidence that the defect class is real and diverse (one
instance nearly live, one instance a proven-but-untriggered mechanism), not
a claim that these are the only two, or the worst two, in the repository.

---

## 3. The remedy space, not chosen here

L9's own note already states the triage rule to author before any file is
touched: an assertion that something IS PRESENT must strip comments
(commented-out code must not satisfy it); an assertion that something is
ABSENT must NOT strip comments (a commented-out forbidden call is still
worth failing on, per that note's own reasoning); an assertion ABOUT a
comment's own content is a third category, left alone. Section 2b above
complicates that middle rule slightly: the canvas-client-boundary guard's
own author already independently arrived at a NARROWER third option for
absence guards - do not strip comments, but anchor the pattern to
column-zero of a real line - which defeats `//` but not `/* */`. Whoever
authors the triage rule owes a decision on whether absence guards need
comment-AWARE matching (distinguish "this text is inside some comment,
strip it out or flag it separately") rather than the binary "strip or
do not strip" the row currently frames.

This pass does not choose among remedies. It records the constraint A42
already established and repeats it because it binds any L9 remedy that
adds a stripping call: at least 64 files (A42's count; not re-measured
here since it does not use `readFileSync`, `stripComments`, or the regex
literal as its search key and is out of this pass's measured scope) define
their OWN independent copy of the vulnerable regex rather than sharing one
implementation, so ANY change to how stripping works needs a FROZEN ORACLE
- the stripping function's output on a representative set of real files,
captured before and diffed deliberately against after - to prove a fix
changes only the false corruption and not any stripping decision the
existing dependents currently rely on. This is the same rule
`docs/DEV_LOOP.md` states generally (a refactor that silently changes
output is the classic defect) applied to this exact mechanism.

---

## 4. Wave plan

L9 remains `unscoped` after this document in the sense that no triage
decision has been made file-by-file; what follows is a plan for the waves
that would carry out such a triage and its fixes, with file lists limited
to what this pass actually measured. Waves 2a/2b's exact file lists are
NOT yet known - naming them without doing the triage would be exactly the
"assumed from a doc, not measured from the tree" error `docs/DEV_LOOP.md`
and `AGENTS.md` both warn against, so they are left for wave 1 to produce.

**Wave 1 - triage (a seat, e.g. `loop-test-author`; produces a
classification table, no production or test code changes).**

- Write set: a new scratchpad or docs artifact (not this file, not
  `docs/backlog.yml`), classifying each of:
  - the 113 files in the adjusted gap (Section 1) that show no evidence of
    comment-stripping under either name searched here,
  - the 22 files found here that strip under an unnamed/inline mechanism
    (to confirm they are correctly classified as already-defended, not to
    re-fix them),
  - the 8 files that contain the word `stripComments` without the exact
    regex literal (to confirm the 2 line-comment-only files and the 1
    hand-rolled parser are correctly left alone, and that the 2 import-only
    files correctly inherit whatever `modalAdoptionScan.ts` ends up doing).
  into presence / absence / comment-content buckets, per assertion, not
  per file (a single file can hold assertions in more than one bucket, as
  `snapshot-grading.structure.test.ts` already does today - compare its
  defended `:419-420` addEventListener check against its undefended
  `:245-246` ModalShell check, both in the same file).
- Depends on: nothing code-side. Can start immediately and independently
  of A42.

**Wave 2a - remove wrongful stripping from absence assertions (an
implementer wave; NOT blocked on A42).**

- File list: produced by wave 1. None named here, because none were found
  by this pass's narrower sampling (Section 2 sampled one absence-style
  test, `canvas-client-boundary.test.ts`, and found it already does not
  strip comments - so it is not itself a wave-2a candidate).
- Depends on: wave 1's classification only.

**Wave 2b - add stripping to presence assertions currently unguarded (an
implementer wave; BLOCKED on A42, per Section 0).**

- One file is already confirmed as a candidate by this pass:
  `src/app/components/snapshot-grading/snapshot-grading.structure.test.ts`
  (the `:245-246` ModalShell `aria-modal="true"` check specifically; the
  rest of that file already mixes defended and undefended assertions and
  needs its own per-assertion pass, not a blanket file-level fix).
  The remainder of the file list comes from wave 1.
- Depends on: wave 1's classification, AND on A42 having landed a
  corrected stripping mechanism (or an explicit, oracle-backed ruling that
  the existing regex is safe for the specific files this wave touches -
  i.e., none of them ever scans a MIME-wildcard `accept=` attribute).
  Do not start this wave by copying the current `stripComments` regex
  verbatim into new files; that is the exact spread A42's own STEP field
  warns about.

**Wave 3 - sabotage proof (an implementer or test-author wave; follows
2a/2b).**

- For every assertion wave 2b newly defends, add a canary proving the
  assertion actually fails when the target line is commented out - the
  same shape `snapshot-grading.structure.test.ts:416-421` already uses for
  the original N14 wave-1 fix (its own comment at `:416-418` documents
  exactly this proof requirement). Without this wave, a "fixed" assertion
  is only asserted to be fixed, not measured to be.
- Depends on: 2a/2b's actual diffs.

---

## 5. Residual register

| # | What is not proven now | Owner | Instrument | Object / direction of failure | Step that measures it |
|---|---|---|---|---|---|
| R1 | Full per-assertion triage (presence / absence / comment-content) of the ~113-205 candidate files - this pass sampled 2 files, not all of them | `loop-test-author` (per L9's own note naming the triage-rule author) | A script reading each `*.test.ts` file matching `readFileSync`, pairing each `expect(...).toContain/toMatch` and its `.not.` counterpart with whether a `stripComments`-shaped call precedes it in the same block | The 113-205 candidate files; direction of failure: a file misclassified as absence when it is presence (or vice versa) ships wave 2 with the wrong fix, either leaving a real gap open or weakening a legitimate absence guard | Wave 1 of the plan above |
| R2 | Whether any file in the tree today contains a `/* */`-block-commented import of `@/lib/canvas` or `@/lib/canvas-modules` that would trip `canvas-client-boundary.test.ts`'s false-positive (Section 2b) - checked only by inspecting the 175 live, uncommented matches, not by a full block-comment-aware sweep | The fix wave's first step (this is a narrower instance of A42's own STEP field, which already claims a full `/*`-outside-comment sweep as its first job) | A Node script replaying `findClientUnsafeBarrelImports` verbatim (as `check_boundary_guard.js` did here) over every file `isUseClientModuleText` selects, flagging any match whose line falls inside a `/* */` span | `src/lib/canvas-client-boundary.test.ts`'s scanned file set; direction of failure: a false CI failure (the guard fires on genuinely inert code) the first time such a file is added, before this sweep runs | Before or alongside any L9 wave touching this file, or A42's own first-step sweep if it lands first |
| R3 | The 113-file adjusted gap (Section 1) is a floor only against the two idioms searched here (the word `stripComments`, and the `[\s\S]*?\*\/` / `[^]*?\*\/` regex family); a third stripping idiom under a third name (e.g. a hand-rolled parser like `supabase-migrations.structure.test.ts:66-69`'s, appearing in a file that also lacks the word `stripComments`) would hide inside the 113 uncounted | `loop-test-author`'s wave 1 (can be merged with R1's script) | Extend R1's script to flag any function whose body contains a `.replace(` call removing `/\*` or `//` sequences by ANY name, not just `stripComments` or the one regex literal | The 113-file set; direction of failure: overstates the true gap (wastes wave-2b effort "fixing" an already-safe file) or, if the third idiom is itself unsafe and undetected, understates the true risk | Wave 1, same pass as R1 |
| R4 | Whether other files besides `ModalShell.tsx`/`snapshot-grading.structure.test.ts:245-246` already have the SAME "defeating text already present in the same file" property (Section 2a) was checked for exactly one file, not swept repo-wide | `loop-test-author`'s wave 1 | For each presence-only assertion (from R1's classification), extract its search string and grep that same source file's COMMENT regions (stripComments applied to only the non-code span, i.e. the inverse of the usual operation) for the identical string, the way `check_modalshell.py` did here | The presence-assertion subset of the 113-205 files; direction of failure: a live-armed instance identical in kind to the original N14 wave-1 canary ships unnoticed for another cycle | Wave 1's per-file audit, or a repo-wide automation of `check_modalshell.py`'s technique |
| R5 | The ordering tension recorded in Section 0 (L9 waves that add stripping must not inherit A42's regex) is stated only in this document; `docs/backlog.yml`'s A42 and L9 rows do not cross-reference each other | Whichever agent next edits `docs/backlog.yml` (explicitly not this pass - `docs/backlog.yml` is outside this pass's write set) | The two rows themselves, cross-linked with a "see also" note in each | `docs/backlog.yml` L9 and A42 rows; direction of failure: a future session scopes or fixes A42 in isolation, and a concurrent or later L9 wave working from a stale copy of this scope document still copies the pre-fix regex into new files because the authoritative backlog rows were never linked | The next backlog reconciliation or push that touches either row |
| R6 | Whether any wave 2a/2b edit would break an assumption a DIFFERENT in-flight agent's branch currently relies on cannot be checked in this environment - no live multi-branch CI view exists here | The repo owner / orchestrator at push time | `docs/DEV_LOOP.md`'s own "Regression, batched per group" step | Any actual code wave that lands from this plan; direction of failure: a wave passes every local gate (tsc, lint, the two named test files, build's compile line) but breaks a sibling in-flight branch's shared-file assumption | The regression pass at whichever wave's push lands first |

---

## 6. Final gate check for this pass

This pass wrote documentation only; the two tests named below are the
structural gates the task instructions require to be run and reported
regardless. Run via the wrapper (`npm run test:paths --`), never a raw
multi-path `vitest run`, per `docs/loop/this-repo.md` section 1.

Command: `npm run test:paths -- src/lib/no-emojis.test.ts
src/source-bytes.structure.test.ts`

Exit code and output captured to
`C:\Users\alexa\AppData\Local\Temp\claude\C--Users-alexa-OneDrive-Documents-Projects-teaching-assistant\e8e96e62-aa3d-4508-b28a-354d4d297572\scratchpad\l9-gate-output.txt`,
read back below rather than trusted from the shell's own inline exit
reporting.

ASCII check for this file itself: `tr -d -c '\000' <
docs/l9-scope.md | wc -c` must print 0 (no NUL bytes), and a full
non-ASCII byte scan was run with a separate Python script before this
section was finalized. Both are reported in the same output capture.

`git status --short` at the end of this pass is included in the same
capture to prove the write set was exactly this one file.
