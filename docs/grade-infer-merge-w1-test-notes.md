# GRADE-INFER-MERGE W1 test notes: delete the byBase rung so an un-named file never inherits a different submitter's name

Test-notes seat (`loop-test-author`). Consumer: the checker, then the implementer.
Built from the SHIP-checked scope `docs/grade-infer-merge-scope.md` (read in full).
This is a bug fix, not a capability a user reaches: NO LEVERAGE CLAIM, no removal
test. Trigger recorded per `seats.md:70-75` (bug fix).

**Measured HEAD: `5bb3efd4`** (`git rev-parse --short HEAD`, 2026-10-04). The scope
was written at `f9bb2271`; the sibling waves have since landed, so the tree is a few
commits ahead but every `src/lib/grade/` line this wave touches is unchanged from the
scope's measurement (re-opened and re-cited below). **Stay strictly in
`src/lib/grade/`.** No recording, repo-grades, walkthrough-announcement or `src/tools`
file is in this write set.

**Nothing here renders a component.** vitest is node-env and collects only
`src/**/*.test.ts`; every instrument below drives node-level functions
(`parseSubmissionFileName`, `groupSubmissionsByStudent`) or the production ingestion
chain (`gradeSubmissions`, `extractStudentEntries`) directly. There is no markup,
focus or keyboard claim in this wave.

---

## 0. The fix (scope-approved, do NOT redesign)

DELETE the step-4 `byBase` rung of `parseSubmissionFileName` so an un-named file no
longer inherits a DIFFERENT file's model-inferred name. This fixes F15 (two distinct
submitters merging; one graded under the other's name). Grounded at HEAD `5bb3efd4`:

| Edit | file:line (re-opened at HEAD) | Change |
|---|---|---|
| step-4 block | `utils.ts:354-366` (comment `:354-356`, `const baseInferred = inferredLookup?.byBase.get(baseName);` `:357`, `if (baseInferred)` `:358`, return `:359-365`, closing `}` `:366`) | DELETE the whole block; leave a short removal comment stating the rung was cross-path extrapolation (scope 3.1) |
| header algorithm list | `utils.ts:279-280` (`4. inferredLookup.byBase - a base-name guess, / consulted only once ...`) | remove the step-4 list item; do NOT renumber 5/6 (scope 3.2) |
| `reachedStemFallback` doc | `utils.ts:300` (`ground-truth model inference (1, 4) or a convention match (2, 3). A`) | change `(1, 4)` to `(1)`. NOTE: scope said `:301`; re-measured, the token is on `:300`. Immaterial to any oracle (it is a comment), but anchor correctly |
| lookup builder | `rubric.ts:160` (`byBaseCandidates`), `:182-186` (base-name candidate push), `:188-195` (unique-base `byBase` build), `:197` (`return { byRaw, byBase }` -> `return { byRaw }`) | drop `byBaseCandidates` and the `byBase` map |
| empty fallbacks | `rubric.ts:135-138` and `:213-216` (both literals carry `byBase: new Map...`) | drop the `byBase` key from BOTH |
| now-unused helper | `rubric.ts:203-207` (`getBaseFileName`) | DELETE: after dropping `byBaseCandidates` its only reader (`rubric.ts:182`) is gone; eslint flags it (AC-5). This is the rubric.ts-LOCAL copy only. The `utils.ts:34` export of the same name STAYS (used at `utils.ts:206,309,343,376`) |
| lookup type | `types.ts:454-457` (`InferredFileNameLookup { byRaw; byBase }`) | becomes `{ byRaw }`. Required, not optional: `utils.test.ts:149-152` builds a typed literal with `byBase`, which fails `tsc` as an excess property once the field is gone, forcing the AC-6 retarget |

F10 is NOT deterministically fixable (it is byRaw-identical to the legitimate
single-student F2; the model gave two distinct submitters the same name and the code
has no signal to tell them from one student). F10's oracle literals STAY FROZEN; only
its label/comment change from KNOWN-DEFECT to accepted model-trust boundary (section 5,
AC-4; scope section 6).

**Why deletion is the real fix, not narrowing (scope 3.1, re-derived):** every firing
of step 4 attributes a file `f` whose own exact path has no byRaw entry to the verdict
the model gave a DIFFERENT path with the same leaf name. Tightening the uniqueness test
to count over all requested files makes `byBase` empty for every `f` (f's own base is no
longer unique), i.e. dead code. So the honest construction is deletion, which makes the
bad state unrepresentable.

---

## 1. Write set and canary (6 files)

| File | Change | Lines at HEAD (`@(Get-Content).Count` / `wc -l`) |
|---|---|---|
| `src/lib/grade/utils.ts` | delete step-4 block + two comment edits | 594 |
| `src/lib/grade/rubric.ts` | drop byBase map, empty-fallback keys, unused helper | 443 |
| `src/lib/grade/types.ts` | `InferredFileNameLookup` -> `{ byRaw }` | 463 |
| `src/lib/grade/utils.test.ts` | retarget `:142-161` (AC-6); drop the byBase literal | 393 |
| `src/lib/grade/ingestion-attribution.oracle.test.ts` | F15 literals + F10/F15 labels & comments ONLY (section 5) | 584 |
| `src/lib/grade/inference-no-extrapolation.test.ts` | NEW invariant test (section 6, AC-3) | 0 |

The new test is a leaf: it adds no export. State in-file the legal "no caller" exception
so the wave gate does not read it as an escape (`DEV_LOOP.md` Build; `seats.md:164`).

**byBase readers before the change (measured):**
`grep -rn "byBase" src --include=*.ts --include=*.tsx -l` returns exactly the 6 names
above minus the new test, plus `src/tools/backlog/backlog-file.structure.test.ts:87`.
That last is a prose COMMENT (`// (byBase merges two distinct submitters), higher-...`),
constructs no lookup, and NEEDS NO CHANGE. After the fix the only surviving `byBase`
mentions are that comment and any removal comments you leave (AC-5).

**No import-edge change:** the fix removes a function and a type field; it adds no import
to any file. `runtime-import-graph.test.ts` (measured 177 passed at baseline) is expected
green - MEASURE it at the gate, do not assume.

**R-6 (directory canary, UNVERIFIED by this seat - implementer must measure):** adding a
NEW file in `src/lib/grade/` can trip a frozen-roots / basename canary (memory:
gate-must-include-directory-canary). The new file is a `.test.ts`, which the
file-size/basename canaries generally exempt, but you MUST discover any canary that
counts files in `src/lib/grade/` before relying on this - e.g.
`grep -rn "lib/grade" src/*.structure.test.ts src/**/*.structure.test.ts` and
`grep -rln "frozen" src` - and if one exists, bump its frozen list + its N in the SAME
commit (memory rule). Do NOT ship on the assumption that `.test.ts` is always exempt.

---

## 2. Satisfiability PROVED (obligation 1), by scratchpad probe, tree untouched

A set of red tests is not a spec until something passes it. I drove the REAL
`groupSubmissionsByStudent`, `parseSubmissionFileName`, `a44ContainerRelativeDir` and
`getBaseFileName` from `src/lib/grade/utils.ts` out of a scratchpad script (NOT in the
repo tree; `git status --short src` empty before and after), building the lookup exactly
as `rubric.ts:131-197` builds it, once with `byBase` populated (HEAD) and once with
`byBase` empty (deleting step 4 is observationally identical to an empty `byBase`). Ran
via the repo's own TS resolve hook:
`node --experimental-strip-types --experimental-loader ./src/tools/backlog/resolve-ts-hook.ts <scratchpad>/probe.ts`.

Measured output (verbatim, trimmed):

```
=== F15 folder shape ===
HEAD (byBase ON):  [{"student":"Maria Alvarez","files":["essay.txt","essay.txt"]}]
FIX  (byBase OFF): [{"student":"BrownTom/essay","files":["essay.txt"]},{"student":"Maria Alvarez","files":["essay.txt"]}]

=== invariant (a) parse-level, BrownTom/essay.txt (no byRaw hit) ===
HEAD lookup: Maria Alvarez | undefined: BrownTom/essay | EQUAL: false
FIX  lookup: BrownTom/essay | undefined: BrownTom/essay | EQUAL: true

=== invariant (b) container-relative dirs of merged row (HEAD) ===
AlvarezMaria/essay.txt -> relDir: "AlvarezMaria" byRawHit: true
BrownTom/essay.txt    -> relDir: "BrownTom"     byRawHit: false

=== nested-zip variant ===
HEAD (byBase ON):  [{"student":"Ada Lovelace","files":["main.py","main.py"]}]
FIX  (byBase OFF): [{"student":"Ada Lovelace","files":["main.py"]},{"student":"bulk2","files":["main.py"]}]
nested (a) HEAD equal-to-undef: false ( Ada Lovelace vs bulk2 )
nested (a) FIX  equal-to-undef: true ( bulk2 vs bulk2 )
nested relDirs: "" ""

=== F6 three folders, reply null ===  FIX: AlvarezMaria/essay, BrownTom/essay, ChenLi/essay  (3 rows)
=== F2 all-byRaw ===                  HEAD == FIX  (Ada Lovelace[code1,essay1], Grace Hopper[code2,essay2])
=== convention-across-two-folders === FIX rows: [{"student":"janedoe","files":["a.txt","b.txt"]}]  relDirs: "wrap1","wrap2"
```

This proves, concretely and simultaneously, that the fix turns all three red-on-HEAD
instruments green: the oracle F15 new literal, invariant (a), and invariant (b) over the
restricted corpus of section 6. The implementer's first IN-REPO run is still the
confirmation; a disagreement means STOP and report, NEVER edit a literal to fit
(`oracle:11-13`).

---

## 3. The oracle edit: exactly which literals change, which stay frozen

File: `src/lib/grade/ingestion-attribution.oracle.test.ts` (584 lines at HEAD). This is
the guard-before-migration INVERSION: the oracle froze the before-state (RES-FILL-3 W1)
and F15 is the sanctioned deliberate change. The F15 edit MUST land in the SAME COMMIT
as the production fix, or the oracle is red between commits (AC-2).

### 3.1 F15 block (`oracle:446-461`): literals EDITED

| Field | Frozen at HEAD (line) | New literal (probe-confirmed) |
|---|---|---|
| `L` | `[{ student: "Maria Alvarez", files: ["essay.txt", "essay.txt"] }]` (`:458`) | `[{ student: "BrownTom/essay", files: ["essay.txt"] }, { student: "Maria Alvarez", files: ["essay.txt"] }]` |
| `sentinels` | `{ "Maria Alvarez": ["S_ALV", "S_BRO"] }` (`:459`) | `{ "BrownTom/essay": ["S_BRO"], "Maria Alvarez": ["S_ALV"] }` |
| `N` | `["AlvarezMaria/essay", "BrownTom/essay"]` (`:460`) | UNCHANGED byte-for-byte (the no-option P4 path never infers; byBase is never built there) |
| `files` | `:453-456` (AlvarezMaria/essay.txt S_ALV, BrownTom/essay.txt S_BRO) | UNCHANGED |
| `reply` | `[["AlvarezMaria/essay.txt", "Maria Alvarez", "essay.txt"]]` (`:457`) | UNCHANGED |
| `label` | `"KNOWN-DEFECT (R-4) byBase inheritance merges two submitters"` (`:452`) | a NON-defect label, e.g. `"folder-distinct submitter the model did not name stays its own row (R-4 closed)"` |
| comment | `:447-450` (line `:446` is the opening `{`; NOTE 2 anchor) | rewrite: no longer a defect; name GRADE-INFER-MERGE and the removed step-4 byBase rung |

Row-order of the new `L` is `BrownTom/essay` BEFORE `Maria Alvarez`: both `P1`
(`gradeSubmissions`) and `P3` (`extractStudentEntries`) order rows by
`entries.sort((a,b) => a.student.localeCompare(b.student))` (`utils.ts:520`), and
`"BrownTom/essay".localeCompare("Maria Alvarez") < 0`. Probe-confirmed.
(BrownTom/essay.txt falls to step 6 and folds its folder -> `"BrownTom/essay"`.)

### 3.2 F10 block (`oracle:363-382`): LABEL + COMMENT ONLY, literals FROZEN

`files` (`:371-374`), `reply` (`:375-378`), `L` (`:379`), `sentinels` (`:380`) and `N`
(`:381`) stay BYTE-IDENTICAL. Only the `label` string (`:370`) and the comment
(`:364-368`) change, from `KNOWN-DEFECT (R-4)` to a statement that this is the accepted
model-trust boundary (scope section 6), cross-referenced to residual R-1. Leaving the
old label would assert a defect this fix does not and cannot close. Probe-confirmed F10
is unchanged by the fix: both files are step-1 byRaw hits (the model named both
"Ada Lovelace"), so step 4 is never reached - deletion cannot touch it.

### 3.3 Everything else BYTE-IDENTICAL

F1-F9, F11-F14 and Z1-Z3 do not move. **F12 (`:404-415`, tagged intended) must not
move** (byRaw-only, never reaches step 4). Pass condition for AC-2:
`git diff -U0 src/lib/grade/ingestion-attribution.oracle.test.ts` shows hunks ONLY
inside the F10 block (`363-370`) and the F15 block (`446-461`) - keyed on the BLOCK IDS
F10 and F15, not raw line numbers, since earlier edits may shift later lines. Any hunk
elsewhere, any change to F10's `L`/`sentinels`/`N`, or any change to F12, is a defect.

---

## 4. The new test `inference-no-extrapolation.test.ts` (AC-3): two invariants over a CONSTRUCTED corpus

Two invariants, each over a corpus whose by-raw subsets are drawn from the POWERSET of a
small set of named files, so "named some, omitted others" is a construction, not a
hand-picked list. Both MUST be shown RED on HEAD before the fix (the implementer SHOWS
the red, does not assert it) and GREEN after.

### 4.1 Corpus construction (axes from a different source than the oracle)

Build the lookup with the SAME shape `rubric.ts` emits
(`{ byRaw: Map<string, {studentDisplay, citationFileName}> }` after the fix; on HEAD it
also carries `byBase`, which the test must NOT construct by hand - build only `byRaw`
and let the production builder or an inline replica derive byBase, OR construct the
lookup via the real `rubric.ts` path; see 4.4). Do NOT import a helper from the oracle
or from `utils.test.ts` - that re-runs their describe blocks (`traps-tests.md`; memory:
no-cross-test-file-imports). Duplicate any helper you need.

Base corpus (file path, zipChain):

| shape | files (path -> zipChain) | why it is here |
|---|---|---|
| F15 folder | `AlvarezMaria/essay.txt` -> `[]`, `BrownTom/essay.txt` -> `[]` | the folder-distinct same-leaf merge; the headline bug |
| nested zip | `bulk.zip/main.py` -> `["bulk.zip"]`, `bulk2.zip/main.py` -> `["bulk2.zip"]` | same class across zip containers; relDirs are BOTH `""` (4.3) |
| F6 three folders | `AlvarezMaria/essay.txt`, `BrownTom/essay.txt`, `ChenLi/essay.txt` -> `[]` | three-way same-leaf |
| flat convention | `Ada Lovelace_2024-01-01_120000_essay.txt` -> `[]` | a step-2 leaf-convention hit, relDir `""` |
| flat stem | `essay.txt` -> `[]` | a step-6 stem fallback, relDir `""` |

For each shape, enumerate the powerset of "which files the model names" (byRaw subset).
Every subset yields a `byRaw` map; the un-named files are the ones invariant (a) ranges
over. 2^n subsets per shape; n is small (<=3) so this is cheap and total.

### 4.2 Invariant (a) - the general, always-valid kill

**Object:** the identity of any file the model did NOT name.
**Instrument:** for every file `f` across the corpus and every byRaw subset in which `f`
is un-named, assert
`parseSubmissionFileName(f, lookup, chain)` deep-equals
`parseSubmissionFileName(f, undefined, chain)`.
**Direction of failure (RED):** any un-named file whose parsed identity (studentKey,
studentDisplay, citation, extension, reachedStemFallback) CHANGES when the lookup is
present.

- RED on HEAD: F15's `BrownTom/essay.txt` parses to `Maria Alvarez` with the lookup and
  `BrownTom/essay` without (probe: `EQUAL: false`); the nested `bulk2.zip/main.py` parses
  to `Ada Lovelace` with the lookup and `bulk2` without (probe: `false`). Step 4 is the
  only lookup-sensitive step a non-byRaw file can reach.
- GREEN after the fix: with byBase gone, the ONLY lookup-sensitive step is step-1 byRaw,
  which by hypothesis misses for `f`, so the two parses are identical (probe: `true`
  both cases).

Invariant (a) catches BOTH the folder case AND the nested-zip case. It is the primary
bug-kill of this wave.

### 4.3 Invariant (b) - a structural check, valid ONLY over the restricted corpus

**Object:** every returned row of `groupSubmissionsByStudent` that spans 2+ distinct
container-relative directories.
**Instrument:** compute each file's directory with the EXPORTED
`a44ContainerRelativeDir(filePath, chain)` (`utils.ts:202`). For every returned row whose
member files resolve to 2+ DISTINCT such directories, assert EVERY member file has a
byRaw hit.
**Direction of failure (RED):** a multi-directory row containing a file with no byRaw
hit (i.e. a cross-folder merge the model did not author file-by-file).

- RED on HEAD: the merged `Maria Alvarez` row holds `AlvarezMaria/essay.txt` (relDir
  `"AlvarezMaria"`, byRaw hit) and `BrownTom/essay.txt` (relDir `"BrownTom"`, NO byRaw
  hit) - 2 distinct dirs, one without a byRaw hit (probe).
- GREEN after the fix: that row splits into two single-directory rows.

**TWO LANDMINES - stated so the implementer does not silently defeat (b):**

1. **(b) does NOT catch the nested-zip case, and must not be claimed to.**
   `a44ContainerRelativeDir` strips the innermost zip container, so `bulk.zip/main.py`
   and `bulk2.zip/main.py` BOTH resolve to relDir `""` (probe: `nested relDirs: "" ""`).
   The nested merge is therefore a single-"directory" row and (b) is vacuous for it. The
   nested case is caught by invariant (a) ONLY. Do not "fix" this by swapping in a full
   dirname - see landmine 2.

2. **(b) is UNSATISFIABLE if a legitimate cross-folder single-student shape enters its
   corpus.** A single student with convention- or crossing-named files in two folders
   forms ONE legitimate row spanning 2 distinct relDirs with NO byRaw hits. Probe:
   `wrap1/janedoe_..._a.txt` + `wrap2/janedoe_..._b.txt` -> one `janedoe` row, relDirs
   `"wrap1"`,`"wrap2"`, neither byRaw. That row violates (b) AFTER the fix too, so adding
   this shape to (b)'s corpus makes the test impossible to pass. (b) is valid ONLY over
   the same-leaf-foldered / flat corpus of 4.1, where the sole way a multi-dir row forms
   is the defective byBase extrapolation. KEEP convention/crossing cross-folder shapes
   OUT of (b)'s corpus (they belong to (a), which handles them correctly). If a checker
   or a later hand asks to "generalise" (b), the answer is no: (b) is a corpus-restricted
   structural companion, not a universal invariant. Invariant (a) is the universal one.

### 4.4 A compile/wiring note for the implementer

On HEAD the type still requires `byBase`, so a test that constructs only `{ byRaw }`
will not compile against HEAD code+types. Two honest options, pick one and state it:
(i) build the lookup through the real `rubric.ts` builder (drive the production path, per
the elevated-seat practice 3), so the test is type-correct on both sides and the red/green
is demonstrated by swapping production code, not the test; or (ii) on HEAD, add
`byBase: new Map()` to make the HEAD run compile, show the red, then remove it in the same
commit as the type change. Prefer (i) where feasible. Either way, the RED-before is shown
by running against HEAD production code, not asserted.

---

## 5. Acceptance criteria - object / instrument / direction, each with a named sabotage

### AC-1 (F15 flips)
- **Object:** the oracle F15 outputs P1 (`gradeSubmissions`), P2 (prompt sentinels),
  P3 (`extractStudentEntries`). **Instrument:** the real ingestion chain driven by the
  oracle harness, compared to the section-3.1 new literals. **Direction (RED):** any run
  that puts `S_ALV` and `S_BRO` under one student, or where row count / order / file
  sets differ from the literal. P4 (`N`) stays green on the UNCHANGED `N`.
- **Sabotage (= MB, section 7): revert the fix (restore byBase + step 4).** F15 collapses
  to one `Maria Alvarez` row -> P1/P3 RED. Discriminates. GREEN after restore.

### AC-2 (only the sanctioned literals moved)
- **Object:** the diff of the oracle file. **Instrument:**
  `git diff -U0 src/lib/grade/ingestion-attribution.oracle.test.ts`. **Direction (RED):**
  any hunk outside the F10 and F15 blocks, any change to F10's `L`/`sentinels`/`N`, any
  change to F12. Same-commit requirement: the F15 literal edit lands with the production
  fix.
- **Sabotage:** move an F12 line (e.g. retitle `Someone Else`). The diff shows a hunk
  outside F10/F15 -> AC-2 RED. Discriminates. (This AC is a human/diff check, not a
  vitest assertion - stated as such; see section 8 "executable vs argued".)

### AC-3 (the invariant, new test) - section 4
- **Object/instrument/direction:** 4.2 (invariant a) and 4.3 (invariant b).
- **Both RED on HEAD** (probe-confirmed); SHOW the red before the fix.
- **Sabotage (= MA, section 7):** after the fix, re-add a base-name scan over `byRaw`
  keys inside step 4 of `parseSubmissionFileName`. Invariant (a) RED (un-named file's
  identity changes again) and oracle F15 RED. Discriminates. GREEN after restore.

### AC-4 (intended behaviours untouched)
- **Object:** oracle F1-F9, F11-F14, Z1-Z3, and F10's literal. **Instrument:** oracle
  P1-P4 unmodified; probe-confirmed F2 (all-byRaw) and F6 (three folders) identical ON
  vs OFF, and F3's fallback files never reach step 4. **Direction (RED):** any difference
  in any non-F15 fixture's output.
- **Sabotage:** the MA/MB mutants above ALSO prove F10/F2/F13 stay green (they are
  byRaw-step-1 and never reach the mutated step 4) - run them and confirm only F15 and the
  new test move, nothing else. If any non-F15 fixture reddens under the fix itself (not
  under a mutant), STOP: the deletion reached further than step 4.

### AC-5 (removed rung has no remaining reader)
- **Object:** the tree after the change. **Instrument:**
  `grep -rn "byBase" src --include=*.ts --include=*.tsx` returns only the backlog-test
  comment (`backlog-file.structure.test.ts:87`) and any removal comments; `npx tsc
  --noEmit` empty; `npm run lint` exit 0 with no NEW warning vs the same command before.
  **Direction (RED):** a reader remains - tsc excess-property (e.g. `utils.test.ts`'s old
  literal) or eslint unused-variable (the now-dead `rubric.ts` `getBaseFileName`).
- **Sabotage:** leave `rubric.ts:203-207` `getBaseFileName` in place -> eslint
  `no-unused-vars` RED. Leave the `byBase` field on `types.ts` -> `utils.test.ts`'s old
  literal still compiles and the dead type field survives grep. Both discriminate.

### AC-6 (the retired M2 test is handed over, not deleted) - CHARACTERIZATION, not a kill
- **Object:** `utils.test.ts:142-161` (the "ground truth outranks a byBase guess" M2
  test). Its claim no longer has a guess to outrank. Retarget to: "a file with a
  crossing-chain identity keeps it even when the lookup holds a DIFFERENT path with the
  same leaf name" - i.e. `byRaw = { "someother/main.py": WrongGuess }`, parse
  `"janedoe_..._project.zip/main.py"` with its chain, assert `studentDisplay === "janedoe"`
  and `!== "WrongGuess"`.
- **NOTE 1 (folded from the check), stated plainly:** this retargeted test is GREEN on
  HEAD and after the fix - `byRaw` is keyed on the EXACT full path and never cross-leaks
  by leaf, and byBase is gone. It is a CHARACTERIZATION test, NOT a bug-kill. Do NOT
  contort it into a false kill. The real bug-kill is AC-3 (invariant a) + the oracle F15
  flip. (Compile coupling: the old literal carried `byBase`, so the retarget must use the
  new `{ byRaw }` type and lands in the same commit as the type change; see 4.4.)
- **Direction/sabotage:** because it is a characterization test, its value is that it
  stays green and documents the no-leaf-leak property. If you find it RED on HEAD, say so
  and investigate - do not force it. The discriminating instruments for the bug are
  AC-1/AC-3.

---

## 6. Sabotage matrix (discrimination verdicts - the load-bearing part)

Each mutant mutates PRODUCTION code (`parseSubmissionFileName` / `rubric.ts`), never a
test. "Discriminates" = RED under the mutant, GREEN after restore.

| Mutant | What it does | oracle F15 | new (a) | new (b) | Verdict |
|---|---|---|---|---|---|
| **MA** | after the fix, re-add a base-name scan over `byRaw` keys inside step 4 of `parseSubmissionFileName` (re-creates extrapolation WITHOUT the byBase field) | RED | RED (folder + nested) | RED (folder) | **Discriminates.** Targeted: mutates only `utils.ts`. Preferred primary kill for the new test |
| **MB** | revert the whole fix (restore `rubric.ts` byBase map + `utils.ts` step 4 + `types.ts` field) | RED | RED | RED | **Discriminates.** Heavy (3 files), but it is exactly the regression the wave prevents |
| **MC (chain>0 interpretation)** | reintroduce the base-name inheritance but GATE it on `zipChain.length > 0` (fires only for nested files, not folders) | GREEN (F15 is zero-chain, stays split) | **RED via the nested shape ONLY** | GREEN (nested relDirs are `""`) | **Discriminates ONLY BECAUSE the nested-zip shape is in (a)'s corpus.** This is why the nested shape is a REQUIRED corpus member (4.1), not optional |
| **MC' (zero-chain interpretation)** | gate the inheritance on `zipChain.length === 0` (fires for folders, not nested) | RED (F15) | RED via folder shape | RED (folder) | Discriminates via the folder shapes |

**Rebuilt/qualified mutant, reported explicitly (obligation 2):** the scope floated MC
as "if it survives, report whether it is a bad mutant (the corpus lacks a chained
shape)." I did not bank it as a free kill. Its discrimination is CONDITIONAL on the
corpus: MC (chain>0) is caught ONLY if the nested-zip shape is present in invariant (a)'s
powerset corpus. I have therefore promoted the nested-zip shape from "extra" to a
REQUIRED corpus member (4.1), which converts MC's survival risk into a construction
guarantee. Without that shape, MC survives and the kill count would be inflated by a
mutant the suite cannot see. State this in the implementer's sabotage run.

**A sabotage warning specific to this oracle (memory: sabotage-restore-needs-a-copy, and
the W-level "mutation destroyed the anchor" failure):** MA/MB must restore from a cp
backup, NOT `git checkout --` (these files have uncommitted wave work). And MB's type
restore must be complete (byBase back on `types.ts`) or the mutant will not compile and
will read as a false kill. Verify each mutant goes RED for the RIGHT reason (a merged
row / a changed identity), not because of a compile error.

---

## 7. Gate (one path per argument; `npm run test:paths`, never raw multi-path vitest)

Baseline at HEAD (scope section 10, 18 files / 522 tests). Post-change gate = that list
PLUS the new test and `rubric.test.ts` (rubric.ts is edited; not previously baselined):

```
npm run test:paths \
  src/lib/grade/ingestion-attribution.oracle.test.ts \
  src/lib/grade/inference-no-extrapolation.test.ts \
  src/lib/grade/utils.test.ts \
  src/lib/grade/rubric.test.ts \
  src/lib/grade/identityInvariants.test.ts \
  src/lib/grade/collisionRefusal.test.ts \
  src/lib/grade/collisionRefusal.wiring.test.ts \
  src/lib/grade/extraction.inference.test.ts \
  src/lib/grade/extraction.test.ts \
  src/lib/grade/single-file-entry.test.ts \
  src/lib/grade/grouping-zip-parents.wiring.test.ts \
  src/lib/grade/rubric-stamp.wiring.test.ts \
  src/lib/grade/engine.test.ts \
  src/lib/grade/rubric-provenance-producers.structure.test.ts \
  src/lib/module-graph/runtime-import-graph.test.ts \
  src/app/actions/grading-incremental.test.ts \
  src/app/actions/grading.collisionRefusal.test.ts \
  src/file-size-ceiling.structure.test.ts \
  src/source-bytes.structure.test.ts \
  src/lib/no-emojis.test.ts
```

(One path per argument. A raw `vitest run a b ...` or `npm test -- a b` silently drops
any argument it does not match; `npm run test:paths` fails unless every argument is
credited an executed, passing file - memory: test-paths-wrapper.)

**Order of operations the implementer must follow:**
1. On HEAD, SHOW the new test RED (both invariants) - run `inference-no-extrapolation.
   test.ts` alone. (Handle the type coupling per 4.4.)
2. Edit the oracle F15 literal ALONE and SHOW the oracle RED (proves the literal change
   detects behaviour) - do NOT commit this state.
3. Apply the production fix (all 6 files) in ONE commit. Re-run the full gate: oracle
   back to GREEN, new test GREEN, every other file unchanged.
4. `npx tsc --noEmit` (ONE caller, no concurrent sabotage-verify on the tree - memory)
   and `npm run lint` exit 0.
5. Sabotage pass: MA and MB each RED then restore GREEN (section 6), restoring from cp
   backups.

Expected count movement: oracle stays at its F15 P1-P4 count (same number of `it`s - the
block structure is unchanged, only literals/labels); `utils.test.ts` stays 28 only if the
AC-6 retarget keeps one `it` (otherwise STATE the new count, do not hide it); every other
file unchanged; the new file adds its own count. MEASURE and report, do not assume.

---

## 8. Executable here vs argued; residuals

**Executable under vitest/tsc/eslint in this environment:** AC-1 (oracle F15), AC-3 (new
test), AC-4 (oracle non-F15 rows), AC-5 (tsc + eslint + grep), AC-6 (the characterization
test runs). The satisfiability of all red tests is PROVED by the section-2 probe.

**Argued, not executed by a test (labelled so, never asserted as verified):**
- AC-2 is a DIFF check (`git diff -U0` + human/CI read of the hunk set), not a vitest
  assertion. It is the gate on "only F10+F15 moved."
- The end-to-end F15 rows through `gradeSubmissions`/`extractStudentEntries` are driven by
  the oracle, but the PREDICTED equality to the new literal rests on the grouping probe
  plus the `localeCompare` sort; the implementer's in-repo oracle run is the confirmation
  (AC-1). A disagreement = STOP, not edit-to-fit.
- Downstream reach of a mis-attributed row (CSV, Canvas posting) is the backlog row's
  claim, NOT traced here (scope section 7). Not in this wave's write set.
- No component renders: any UI difference between a split and a merged row label is a
  reading claim, not tested.

**Residual register (owner / instrument / step):**

| id | Residual | Owner | Instrument | Step |
|---|---|---|---|---|
| R-1 | F10-class: model names two token/folder-distinct submitters the same name; no ground-truth signal separates them. F10 frozen as the accepted model-trust boundary | Repo owner (product): accept, or fund R-2 | oracle F10 P1-P4 stay green with the relabelled row | owner answer to the fork question below |
| R-2 | No visible marker that a row's multi-file grouping rests only on the model's say-so | Repo owner to commission; UX seat to design | a result-type field + a rendered marker (verifiable only by reading; no component renders) | a new backlog row if the owner funds it |
| R-4 (scope) | Class (iii): a model-chosen name colliding with an un-named file's fallback stem (scope 3.3) | the chunk next owning `utils.ts` | an (a)-style generated corpus with a model name equal to another file's stem | next change to `groupSubmissionsByStudent` |
| R-6 | Directory/frozen-roots canary for a NEW file in `src/lib/grade/` (section 1) | THIS wave's implementer | discover any canary counting files in `src/lib/grade/`; bump its frozen list + N in the same commit if present | this wave's gate (BEFORE push) |

**F10 fork (scope section 6.3), acted-on reading flagged, not re-decided here:** this wave
takes the RELABEL-ONLY reading for F10 (freeze its literals, relabel to the accepted
model-trust boundary). The owner-confirmable alternative is to ALSO file a provenance
marker (R-2). Per the two-rounds rule this does not gate the wave: ship relabel-only; if
the owner wants (2), file R-2 as a new row. Neither answer reopens this wave.

---

## 9. Hand-off confirmation

- Notes written to `C:\Users\alexa\OneDrive\Documents\Projects\teaching-assistant\docs\grade-infer-merge-w1-test-notes.md` (this file, openable by the checker and implementer).
- Only the F10 and F15 oracle blocks change; F12 and every other row stay byte-identical
  (probe-confirmed the fix touches ONLY F15 across the whole fixture set).
- Satisfiability proved by scratchpad probe against real production functions; tree
  untouched (`git status --short src` empty).
