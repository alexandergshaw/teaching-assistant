# Same-stem collision amnesty - architecture scope (owner bug, 2026-10-12)

Owner-reported BUG in the gradebook-safety-critical collision guard. This is the
A41/A44/A45 collision area: a WRONG loosening re-opens the silent cross-student
blend, so the design is conservative and every soundness claim is pinned to the
frozen A44/A45 generator.

This pass is READ-ONLY. Write set: `docs/same-stem-collision-amnesty-scope.md`
only. No `src/` or test file was edited. Every `src/` citation below was opened
and read in this pass; every quantity names the command that produced it. A
fresh `loop-checker` gates this scope before any build wave consumes it.

This item is DISJOINT from the grading-chat UI builds in flight (the opening
git status shows `src/app/components/grading-chat/*` modified). This scope's
write set is `src/lib/grade/` only (section 9), so it can build without
serializing behind them.

---

## 0. The headline finding: the brief's proposed fix is UNSOUND; this scope overrides it with measurement

The brief proposed a "same-stem amnesty": do not refuse a colliding group when
every file shares the same full base stem (name minus last extension,
case-insensitive/trimmed). The brief's load-bearing premise was: "Two DIFFERENT
students cannot have byte-identical names-except-extension."

**That premise is FALSE, and the frozen A44 generator disproves it.** I must
refuse a ruling I can disprove (architecture-seat non-negotiable), so this scope
does NOT adopt the name-only amnesty. It adopts a REFINED amnesty gated on the
shared stem being a Canvas per-student identity string, which is sound against
the same frozen oracle. Section 3 is the measured disproof; section 4 is the
sound design; section 7 is the fork put to the owner.

The owner's reported case is still fixed - it is fixed MORE narrowly and
soundly than the brief asked. The generic case the brief's premise would also
have "fixed" is exactly the silent-blend class A44/A45 exist to refuse.

---

## 1. Measurement discipline and instruments

- Line counts are `@(Get-Content <file>).Count` (PowerShell), the mandated gate
  instrument; `Measure-Object -Line` disagrees by 15-138 lines in this repo and
  is never used (`docs/loop/this-repo.md` section 3).
- Multi-file test runs are `npm run test:paths <p1> <p2> ...`, never a raw
  multi-path `vitest run`, which silently drops unmatched paths and exits 0
  (`docs/loop/this-repo.md` section 1).
- No component is rendered by any test in this repo; there is no live model, no
  `.env`, no network under vitest (`docs/loop/this-repo.md` section 6). The
  frozen-generator oracle is PURE FIXTURES and is the load-bearing evidence; it
  needs none of those.
- The generator measurements in sections 3-4 were run READ-ONLY with
  `node --experimental-strip-types` against the committed generator
  (`src/lib/grade/submissionShapeGenerator.ts`, which imports nothing) and a
  VERBATIM transcription of `parseSubmissionFileName` and its helpers from
  `src/lib/grade/utils.ts:34-387` (utils.ts has an extensionless `./constants`
  import that node's ESM resolver cannot load, so the pure parse functions were
  copied, not imported; they use no `constants` symbol at runtime). The scripts
  live in the session scratchpad, edited no tracked file, and are reproduced in
  section 3.4 so the test author can re-run them.

Measured file sizes (`foreach ($f in @(...)) { "{0}`t{1}" -f @(Get-Content $f).Count, $f }`, 2026-10-12):

```
173  src/lib/grade/collisionRefusal.ts
355  src/lib/grade/collisionRefusal.test.ts
586  src/lib/grade/utils.ts
124  src/lib/grade/collisionRefusal.wiring.test.ts
966  src/lib/grade/extraction.ts
990  src/app/actions/grading.ts
```

This scope edits only `collisionRefusal.ts` (173) and adds one new test file, so
the 1000-line ceiling hazard that bound A45 on `extraction.ts`/`grading.ts` does
NOT bind here - those two files are untouched (section 5.1).

---

## 2. The tree as it is now (A45 has shipped) - brief from the tree, not the doc

`decideCollisionRefusal` (`src/lib/grade/collisionRefusal.ts:40-104`, read in
full) already carries A45's folder-corroboration amnesty: it takes a third
optional `knownStudents?: readonly string[]` (`:43`), adds the
`"uncorroborated-shared-folder"` decision variant (`:30`), and matches a
colliding group's FOLDER against the roster at `:85`. Both live call sites
already thread the roster (so this scope changes NEITHER call site):

```
grep -rn "decideCollisionRefusal" src/lib/grade/extraction.ts src/app/actions/grading.ts src/lib/grade/engine.ts
src/lib/grade/extraction.ts:336:  ...decideCollisionRefusal(submissions, zipParents, options?.knownStudents)...
src/app/actions/grading.ts:945:   ...decideCollisionRefusal(submissions, zipParents, knownStudents.knownStudents)...
engine.ts: (no call - engine routes through extraction.ts's ingestZipEntries)
```

The current decision flow (`collisionRefusal.ts:45-104`), per colliding group
(`group.paths.length >= 2`, walked in sorted identity-KEY order):

1. `decoded = a44DecodeKey(key)`; `hasFolder = decoded.length === 2`.
2. A45 amnesty: if `hasFolder && distinctFolders.size >= 2`, corroborate the
   group's folder `decoded[0]` against `knownStudents`; `"matched"`/`"no-roster"`
   -> `continue` (amnesty); otherwise mark `uncorroborated`.
3. `uncorroborated` -> return `"uncorroborated-shared-folder"`.
4. else `distinctFolders.size >= 2` -> return `"flat-collision-in-foldered-run"`.
5. else -> return `"no-folder-signal"`.

Only groups whose members reached STEM FALLBACK are considered - the loop skips
any file with `!parsed.reachedStemFallback` (`:51`). Convention matches and
model inferences (`parseSubmissionFileName` steps 1-3, `utils.ts:309-350`) never
enter the refusal at all.

The refusal union is a `default`-less exhaustive `switch`
(`describeCollisionRefusal`, `collisionRefusal.ts:161-173`): any new `status`
member added to `CollisionRefusalDecision` without a `case` fails
`npx tsc --noEmit`. This scope adds NO new status (section 4.4), so that guard
is not exercised but is not weakened.

---

## 3. The disproof - measured against the frozen A44 generator

### 3.1 The owner's exact case is real and currently refused

`parseSubmissionFileName("949293-4404402 - Estrada-Damion-Oct 11, 2026 550 PM.cpp", undefined, [])`
and the `.docx` sibling both return (measured):

```
key = "6:949293"   display = "949293"   reachedStemFallback = true
sameKey = true   sameFullStem = true
fullStem = "949293-4404402 - estrada-damion-oct 11, 2026 550 pm"
```

Root cause confirmed exactly as the brief states: the names use spaces/hyphens
and no underscores, so `matchStudentFileConvention` (`utils.ts:87-107`, needs
`>= 4` underscore parts) returns null; `leafStemFallback` (`utils.ts:121-126`)
takes the leading alphanumeric run `^([A-Za-z0-9]+)` = "949293" for BOTH files;
both resolve to key `6:949293` via step 6 (`utils.ts:379-386`). They collide,
reach stem fallback, sit in no folder, so `distinctFolders.size = 0` and the
decision is `"no-folder-signal"` - the exact refusal the owner quoted ("no other
student folders"). The fix target is real.

### 3.2 The brief's premise is false: different students DO share full stems

Script `measure.ts` (section 3.4) ran `countUnsoundAllows`-style counting over
the committed generator at `DEFAULT_SEED=20260927`, `DEFAULT_SWEEP_N=20000`, and
flagged, per set, any fallback-reaching colliding group that is BOTH a true
blend (>= 2 distinct ground-truth owners, recovered from the content marker
`^<<M\d+-\d+>> (.+)$` exactly as `collisionRefusal.test.ts:270-271` does) AND
same-full-stem (all members share one `removeLastExtension(getBaseFileName)`
value, trimmed/lower-cased). Result (sets where a naive same-stem amnesty would
NEWLY ALLOW a real two-student blend):

```
flat                                   sets=19935  SAMESTEM_BLEND=4452   EX: midterm.txt | midterm.md
folder                                 sets=20000  SAMESTEM_BLEND=0
convention / convention-resubmit       sets=20000  SAMESTEM_BLEND=0
folder-distinct-stems                  sets=20000  SAMESTEM_BLEND=0
shared-wrapper-folder                  sets=19935  SAMESTEM_BLEND=4452   EX: Submissions/midterm.txt | Submissions/midterm.md
single-student-multi-folder-...        sets=19858  SAMESTEM_BLEND=0
nested-bulk-perstudent-folders         sets=20000  SAMESTEM_BLEND=0
mixed-perstudent-plus-shared-dropbox   sets=19936  SAMESTEM_BLEND=1045  EX: Shared/midterm.docx | Shared/midterm.md
duplicate-folder-name                  sets=19936  SAMESTEM_BLEND=1045
folder-resubmit                        sets=19972  SAMESTEM_BLEND=0
nested-perstudent-subdirs              sets=20000  SAMESTEM_BLEND=0
nested-shared-dropbox-subdirs          sets=19990  SAMESTEM_BLEND=127   EX: Submissions/Shared/frontend/essay.pdf | .../essay.txt
flat-forgery / -perpart / conv-forgery sets=20000  SAMESTEM_BLEND=0
crossstep-ambiguity                    sets=20000  SAMESTEM_BLEND=0
```

`flat` is a SOUND shape whose existing assertion is `unsoundAllows === 0`
(`collisionRefusal.test.ts:304`, run at N=5000 there; 0 at N=20000 too). A
naive same-stem amnesty makes it ALLOW ~4452 true two-student blends - e.g.
`midterm.txt` (student A) + `midterm.md` (student B), two different students who
each named a file "midterm". That is the precise silent cross-student blend
A44/A45 refuse. The naive amnesty moves `flat`'s unsound-allows from 0 to ~4452
and reddens the frozen oracle.

### 3.3 "Stem richer than the collision key" is ALSO unsound

The natural refinement - amnesty only when the full stem is strictly richer than
the leading-run key (so "midterm" = its own key is excluded) - fails too. Script
`split.ts` (section 3.4) split the same-stem blends into single-token
(stem == leading run) vs multi-token (stem richer than leading run):

```
flat                                  singleTokenBlendGroups=2316  multiTokenBlendGroups=2464
shared-wrapper-folder                 singleTokenBlendGroups=2316  multiTokenBlendGroups=2464
mixed-perstudent-plus-shared-dropbox  singleTokenBlendGroups=490   multiTokenBlendGroups=555
duplicate-folder-name                 singleTokenBlendGroups=490   multiTokenBlendGroups=555
nested-shared-dropbox-subdirs         singleTokenBlendGroups=70    multiTokenBlendGroups=57
   MULTI EX: Report Draft.md | Report Draft.pdf   [stem="report draft" lead="report"]
   MULTI EX: Paper Final.md | Paper Final.docx     [stem="paper final" lead="paper"]
```

2464 of the `flat` blends are multi-token: two different students each submitting
"Report Draft.md" / "Report Draft.pdf". Full stem identical, richer than the
leading run, still two different students. So NO name-only same-stem predicate
is sound against the frozen oracle. The soundness has to come from the stem
being a per-student IDENTITY, not from its length or token count.

### 3.4 The discriminating fact that IS sound: a Canvas identity stem

The owner's stem is a Canvas "new-style" bulk-download identity:
`<digits>-<digits> - <Name>-<date> <time>`. A generic student filename
("midterm", "Report Draft", "essay") is not. A NARROW gate on that leading
shape - stem matches `/^\d+-\d+ - /` - separates them. Script `canvas.ts`
(reproduced below) measured this gate against EVERY generated file and the
owner's case:

```
generator files total = 1350314   matchingCanvasGate = 0
OWNER stem "949293-4404402 - estrada-damion-oct 11, 2026 550 pm"  matchesGate = true
generic "Homework Final"   matchesGate = false
generic "Report Draft"     matchesGate = false
generic "midterm"          matchesGate = false
generic "essay"            matchesGate = false
generic "AlvarezMaria-work" matchesGate = false   (the folder-distinct-stems shape's hyphen)
generic "949293 something" matchesGate = false   (leading digits but no "-<digits> - ")
```

**The gate matches the owner's stem and ZERO of 1,350,314 generator files.**
That is the whole soundness proof: a same-stem amnesty gated on this pattern
NEVER FIRES on any set the A44/A45 oracle generates, so every frozen
unsound-allows count (0 on the 14 sound shapes; 2254/19936 and 287/19990 on the
two accepted-unsound shapes) is unchanged BY CONSTRUCTION - the amnesty's
change to those counts is provably 0.

The three scripts (`measure.ts`, `split.ts`, `canvas.ts`) are in the session
scratchpad; the test author re-creates them from the descriptions above (each is
~40 lines: import the committed generator, transcribe the parse helpers from
`utils.ts:34-387`, count). The Canvas gate regex, verbatim, is:

```
const CANVAS_IDENTITY_STEM = /^\d+-\d+ - /;   // applied to the trimmed full stem
```

Why this soundness holds beyond the generator (stated honestly): Canvas appends
one generated `<studentId>-<submissionId> - Name-timestamp` prefix identically to
every file of one submission, and that prefix is unique per student+submission.
Two files with a byte-identical such stem came from one Canvas submission record
-> one student. A deliberately forged pair of different students both named with
an identical `\d+-\d+ - ...` stem is possible, but that is a RENAME-forgery, the
same accepted-gap class A44 already documents (the K1 forgery fixtures, RULING
89 accepted-unsound, `collisionRefusal.test.ts:134-142`); it is no worse than
A44's existing ceiling, recorded as RES-SS-3. The gate is deliberately NARROW:
narrowing can only fail to amnesty some valid Canvas cases (a false refusal,
which is safe/conservative), never wrongly amnesty a blend.

---

## 4. The design - a Canvas-identity-gated same-stem amnesty, inside collisionRefusal.ts

### 4.1 Shape decision: it is an AMNESTY in the refusal, NOT an identity-parse change

Two placements were considered. This scope recommends placement B.

- **Placement A (identity layer, `utils.ts parseSubmissionFileName`):** add a
  Canvas convention matcher so these files resolve to a ground-truth identity at
  step 2/3 and never reach stem fallback. Nicer row label (the student name),
  and different Canvas students separate by id automatically. REJECTED as the
  recommendation: it edits the six-return-site, A44-length-prefix-encoded
  identity function that the frozen invariants `identityInvariants.test.ts`
  (R13/R14/R15) and the whole six-site encoding (`a44Encode`/`a44Wrap`/`a44Fold`,
  `utils.ts:142-239`) depend on. That is a large blast radius into A44's proven
  core for a safety-critical change - exactly where a regression would hide.

- **Placement B (amnesty in `decideCollisionRefusal`) - RECOMMENDED.** The brief
  itself points here: "groupSubmissionsByStudent already merges same-key files
  into one entry's file list; the question is only whether to REFUSE." Both the
  owner's files already share key `6:949293`, so `groupSubmissionsByStudent`
  (`utils.ts:439-543`) ALREADY merges them into ONE entry with two files
  (`mergedFileCount = 2`) and grades them together - IF the run is not refused.
  So the ENTIRE fix is: do not refuse this group. The amnesty is contained to
  `collisionRefusal.ts` plus a pure predicate, touches no identity encoding, no
  call site, and no file near the 1000-line ceiling.

### 4.2 The predicate (pure, path-only, no roster needed)

Add a pure helper (in `collisionRefusal.ts`, or exported from `utils.ts` for
direct unit testability - implementer's factoring choice; it must be reached via
`decideCollisionRefusal` in tests, driving the production path per the Test-seat
rule):

```
isSameStemCanvasGroup(paths: string[]): boolean
  = paths.length >= 2
    AND every path's fullStem (removeLastExtension(getBaseFileName(path)),
        trimmed, lower-cased) is equal to one shared value S
    AND CANVAS_IDENTITY_STEM.test(S)   // /^\d+-\d+ - /
```

`getBaseFileName` and `removeLastExtension` are already exported from
`utils.ts:34,40`. The predicate uses `group.paths` (already on `CollidingGroup`,
`collisionRefusal.ts:23`). It needs NO `knownStudents` - it is orthogonal to the
A45 roster path.

### 4.3 Where it sits in the decision flow - FIRST amnesty, before A45 and before any refusal

Inside the per-group loop (`collisionRefusal.ts:74-101`), BEFORE the A45
folder-corroboration block and before every refusal return:

```
for each colliding group G (paths.length >= 2):
    if isSameStemCanvasGroup(G.paths):   // NEW: same-stem Canvas amnesty
        continue                          // do not refuse; the merge grades as one row
    ... existing A45 folder-corroboration amnesty (unchanged) ...
    ... existing refusal returns (unchanged) ...
```

Order rationale (a shape call this seat owns):

- The same-stem Canvas amnesty is checked FIRST because it is the STRONGEST and
  most self-contained signal (the identity is IN the shared name) and needs no
  run gate and no roster. If it holds, the group is unambiguously one student's
  multi-file submission and must not refuse under ANY later branch.
- It is ORTHOGONAL to A45's folder-corroboration amnesty: A45 corroborates a
  group's FOLDER against a roster; this corroborates the group's shared STEM
  against the Canvas identity shape. Neither weakens the other - A45's branch is
  reached only when the same-stem gate did NOT fire, and the same-stem gate's
  decision does not read the roster or the folder signal. A group that is both
  (a foldered Canvas-same-stem collision) is amnestied here first; A45 would also
  have amnestied it when the folder corroborates, so there is no conflict, only a
  cheaper, roster-free path.
- It changes NO existing frozen fixture (section 6): every fixture in
  `collisionRefusal.test.ts` and every generator stem fails the Canvas gate
  (section 3.4), so each keeps its current verdict.

### 4.4 No new decision variant

The amnesty returns through the existing `{ status: "ok" }` (via `continue` to
the final `return { status: "ok" }`, `collisionRefusal.ts:103`). No new
`CollisionRefusalDecision` member, so `describeCollisionRefusal`'s exhaustive
switch is untouched and emits `null` (no refusal message) for the owner's case -
which is correct: there is nothing to tell the instructor; the files grade. The
diagnostics representation of this bug fix is therefore the ABSENCE of a refusal
where one fired before, plus the row appearing in the normal graded output;
there is no new user-facing surface and no new refusal channel (a pure-refusal
loosening with no new data path), which the AC seat records as the justified
"no new diagnostic" case (`DEV_LOOP.md`, diagnostics rule) rather than assuming
it.

### 4.5 The row's label and the merge semantics (what the user gets)

With the amnesty, `decideCollisionRefusal` returns `"ok"`, so the run is not
refused. `groupSubmissionsByStudent` then keys both files on `6:949293`, yielding
ONE entry: `student = "949293"`, `files = [the .cpp, the .docx]`,
`mergedFileCount = 2` (`utils.ts:455-468,512-543`). The row grades once over both
files. The row LABEL is the bare leading-run display "949293", not the student's
name - acceptable and unchanged from today's display logic, since fixing the
label requires parsing the Canvas name (placement A), recorded as RES-SS-2.

---

## 5. Waves

One small wave. The amnesty and its oracle are a single disjoint write set; there
is no seam to thread (no call site changes) and no user surface to add (the merge
path already exists). This is a bug fix, not a feature, so there is no leverage
claim to make - the fired trigger is "bug fix" (`seats.md`, Acceptance criteria).
The fix STRENGTHENS the existing ATTRIBUTION guarantee (`docs/loop/leverage.md`)
by removing a FALSE refusal without widening the true-blend allow set; it does
not earn a new claim.

### Wave 1 - the Canvas-gated same-stem amnesty + frozen oracle

- **Write set:** `src/lib/grade/collisionRefusal.ts` (the `CANVAS_IDENTITY_STEM`
  regex, the `isSameStemCanvasGroup` predicate, and the `continue` placed first
  in the per-group loop per section 4.3); NEW
  `src/lib/grade/collisionRefusal.sameStemAmnesty.test.ts` (the oracle, section 6).
- **New export / caller:** no new export is required (the predicate may be a
  local function; if exported from `utils.ts`, its caller `collisionRefusal.ts`
  is in the same wave). No call site changes, so no dead-code risk - the
  "wave includes the caller" rule is satisfied by the unchanged existing callers.
- **Ceiling:** `collisionRefusal.ts` 173 + ~20 -> well under 1000. New test file
  starts fresh; do NOT append to the 355-line frozen-literal
  `collisionRefusal.test.ts` (keep the new oracle its own file).
- **Why no W2/W3:** unlike A45, this fix needs no roster/course surface and no
  seam - it is sound and complete in isolation, and it is reachable the moment it
  lands because the two existing call sites already invoke
  `decideCollisionRefusal` on the manual-zip-upload path (section 2). It cannot
  ship dead.

---

## 6. The frozen before/after oracle (load-bearing evidence)

All assertions are pure functions over the committed generator and hand fixtures,
runnable under `vitest` with no network/render. The counting helper
`countUnsoundAllows` (`collisionRefusal.test.ts:250-280`) is DUPLICATED into the
new file, never imported across test files (`no-cross-test-file-imports` memory).
The test author owns generator-vs-expected-axes separation.

Each pass condition names (object under comparison | instrument | direction of
failure):

- **AC-POS (the owner's exact case; the primary removal test).** OBJECT: the
  decision for a run of exactly the owner's two filenames
  (`"949293-4404402 - Estrada-Damion-Oct 11, 2026 550 PM.cpp"` and the `.docx`
  sibling, flat, no zipChain). INSTRUMENT: `decideCollisionRefusal(submissions, zipParents)`
  (no roster) and `describeCollisionRefusal(...)`. DIRECTION: FAILS if
  `.status !== "ok"` or the message is non-null. RED on today's tree (returns
  `"no-folder-signal"`). Removal signal: delete the amnesty `continue` ->
  this flips back to `"no-folder-signal"` -> RED.

- **AC-GATE-NEGATIVE (the Canvas gate is load-bearing - proves the amnesty is
  not naive).** OBJECT: the decision for `"midterm.txt"` + `"midterm.md"` (flat,
  same full stem "midterm", generic - the measured blend shape from section 3.2)
  AND for `"Report Draft.md"` + `"Report Draft.pdf"` (multi-token generic).
  INSTRUMENT: `decideCollisionRefusal`. DIRECTION: FAILS if either is anything
  but `"no-folder-signal"` (must still REFUSE). Removal signal: delete the
  `CANVAS_IDENTITY_STEM.test(S)` clause (making the amnesty naive) -> BOTH flip
  to `"ok"` -> RED. This is the clause that disproves the brief's premise, so
  its removal must redden a named fixture.

- **AC-NO-BLEND (the critical no-regression claim; change by 0).** OBJECT: for
  each of the 14 `SOUND_SHAPES` (`collisionRefusal.test.ts:283-298`) the
  per-shape `unsoundAllows` count, and for the two accepted-unsound shapes the
  frozen literals. INSTRUMENT: `countUnsoundAllows(shape, N, seed)` re-run WITH
  the amnesty in the build. DIRECTION: FAILS if any sound shape's `unsoundAllows`
  is not exactly 0, or if `mixed-perstudent-plus-shared-dropbox` is not exactly
  2254 of 19936, or `nested-shared-dropbox-subdirs` not exactly 287 of 19990.
  These are the SAME assertions the existing `collisionRefusal.test.ts:304,336-354`
  already make - so AC-NO-BLEND is discharged by those existing tests staying
  green (they fire at N=5000 for the sweep and N=20000 for the literals). The
  new oracle re-states the two literals at `DEFAULT_SWEEP_N`/`DEFAULT_SEED` as a
  belt-and-braces pin inside the new file. Soundness proof: section 3.4 - the
  gate matches 0 of 1,350,314 generator files, so the amnesty never fires on any
  generated set and the change to every count is provably 0.

- **AC-FROZEN-FIXTURES (existing hand fixtures unchanged).** OBJECT: the decision
  for each fixture in `collisionRefusal.test.ts` R2 (F1,F4,F6,F9/G4,F5,G1/G2/G8,
  G3/K2,G5,G6,G12,K1,F7/G10). INSTRUMENT: `decideCollisionRefusal`. DIRECTION:
  FAILS if any verdict changes. Discharged by that file staying green (none of
  its stems matches the Canvas gate, section 3.4) - AC-FROZEN-FIXTURES = the
  existing `collisionRefusal.test.ts` is green post-change.

- **AC-FOLDERED-CANVAS (orthogonality to A45).** OBJECT: the decision for a
  foldered Canvas-same-stem collision -
  `"AlvarezMaria/949293-4404402 - Estrada-Damion-Oct 11, 2026 550 PM.cpp"` +
  the `.docx` sibling, in a run with a second fallback-reaching folder so A45's
  run gate `distinctFolders.size >= 2` also holds (e.g. add `"BrownTom/paper.docx"`).
  INSTRUMENT: `decideCollisionRefusal` with NO roster. DIRECTION: FAILS if not
  `"ok"`. This proves the same-stem amnesty fires FIRST and does not depend on the
  roster even where A45's branch would otherwise be consulted. (Note: the FULL
  stem here is `949293-4404402 - estrada-damion-...`, taken from the leaf via
  `getBaseFileName`, not the compound folder display - the amnesty reads the
  file's own base stem, so the folder does not break the gate.)

- **AC-TYPECHECK.** OBJECT: the repo types. INSTRUMENT: `npx tsc --noEmit`.
  DIRECTION: FAILS on any output. (No new decision variant, so this is a plain
  regression check, not an exhaustive-switch pin.)

- **AC-NO-REGRESSION (the existing suite).** OBJECT: the collision suite.
  INSTRUMENT:
  `npm run test:paths src/lib/grade/collisionRefusal.test.ts src/lib/grade/collisionRefusal.sameStemAmnesty.test.ts src/lib/grade/collisionRefusal.wiring.test.ts src/lib/grade/grouping-zip-parents.wiring.test.ts src/lib/grade/identityInvariants.test.ts src/lib/grade/utils.test.ts`.
  DIRECTION: FAILS if any path is `NOT COVERED` or any test fails. (The
  implementer re-derives the exact set with the section-9 grep; this list is a
  FLOOR.)

Optional integration pin (recommended, not required): extend
`collisionRefusal.wiring.test.ts` (which drives `extractStudentEntries` /
`gradeSubmissions` over real JSZip archives with `callLlm` mocked,
`:1-40`) with a two-file Canvas-same-stem archive and assert no collision
refusal is thrown and one row with two files is graded. Use text-extractable
extensions (e.g. `.txt`/`.md`), never `.docx` - that file's documented trap is
that `.docx` routes through a real Word parser that rejects plain-string bytes
(`collisionRefusal.wiring.test.ts:~38`). The amnesty keys on the NAME, so the
extension choice does not affect the collision or the gate.

---

## 7. The fork put to the owner (shaped to terminate; recommended reading built)

The brief asked for a name-only same-stem amnesty. Measurement (section 3)
disproves its premise. The fork is:

- **R (RECOMMENDED - built by this scope).** Canvas-identity-gated same-stem
  amnesty (`/^\d+-\d+ - /`). SOUND: the frozen oracle's unsound-allows change by
  exactly 0 (proven, section 3.4). Fixes the owner's reported case. Does NOT
  amnesty generic same-stem collisions (`essay.docx`+`essay.pdf`,
  `midterm.txt`+`midterm.md`) - those stay refused, because from the paths alone
  they genuinely could be two different students (measured: they often are).
- **N (NOT recommended).** Name-only same-stem amnesty, no Canvas gate. Also
  fixes generic same-stem collisions, but re-opens the silent cross-student
  blend for ~4452 of 19935 `flat` sets (measured) and reddens the frozen oracle.
  This is the exact failure class A41/A44/A45 exist to prevent.

This scope is built on R (go-with-recommended): the waves, the predicate and the
oracle all assume the Canvas gate. If the owner wants N anyway (accepting the
measured blend re-opening), the only change is deleting the
`CANVAS_IDENTITY_STEM.test(S)` clause - and AC-GATE-NEGATIVE and AC-NO-BLEND
would then have to be withdrawn, which is the owner knowingly lowering the
soundness bar. The terminating question is therefore: "I am shipping the
Canvas-gated amnesty (R), which fixes your `949293-...` case soundly but still
refuses generic same-name `.docx`+`.pdf` pairs; do you want that, or the
ungated version (N) that also merges generic same-name pairs at the cost of
re-opening ~4452/19935 measured cross-student blends?" Either answer ends the
activity; R ships unless the owner picks N.

---

## 8. What cannot be verified in this environment

Stated, not worked around (`docs/loop/this-repo.md` section 6): no live model
(the merged row's actual grade text is unverifiable here; the wiring test mocks
`callLlm`), no `.env`/live DB, and no component renders (the owner's instructor
flow - uploading the real zip and seeing one graded row - is an owner walk in
the real app, not a test here). None of these is a precondition of the
pure-function oracle (section 6), which is the load-bearing evidence. Whether
real Canvas "new-style" names always take the `<digits>-<digits> - ` shape
across Canvas versions is not verifiable here (no live Canvas); the gate is
derived from the one real example the owner supplied and kept deliberately
narrow (RES-SS-1).

---

## 9. The `owns` file list, derived by command

Files this row EDITS: `src/lib/grade/collisionRefusal.ts` and the new
`src/lib/grade/collisionRefusal.sameStemAmnesty.test.ts`.

Files that READ an edited file AS SOURCE TEXT (so they can go red without being
"owned"), derived by:

```
grep -rln "collisionRefusal\|leafStemFallback\|parseSubmissionFileName\|reachedStemFallback\|getBaseFileName\|removeLastExtension" src --include="*.structure.test.ts" --include="*.wiring.test.ts"
```

output (pasted verbatim, 2026-10-12):

```
src/app/actions/wholesale-auth-mock-population.structure.test.ts
src/lib/grade/collisionRefusal.wiring.test.ts
src/lib/grade/grouping-zip-parents.wiring.test.ts
src/lib/grade/rubric-stamp.wiring.test.ts
```

Plus the unconditional ceiling canary and the directory enumerations a NEW file
in `src/lib/grade/` could trip (carried from the A45 scope as a FLOOR; the
implementer re-runs
`grep -rln "lib/grade\|grade/collisionRefusal\|grade/extraction" src --include="*.structure.test.ts"`
and bumps any exact-set list + its N in the SAME commit per the
`gate-must-include-directory-canary` memory):

```
src/file-size-ceiling.structure.test.ts                                   (always; 1000-line ceiling over all of src/)
src/app/components/grading-recording/submission-kind-callsites.structure.test.ts
src/lib/grade/rubric-provenance-producers.structure.test.ts
src/tools/strip-comments-agreement.structure.test.ts
src/tools/vitest-paths/gate-commands.structure.test.ts
```

The implementer opens each `wholesale-auth-mock-population` and the enumerations
and confirms whether the NEW test file must be added to a frozen list (a
`*.test.ts` that module-mocks auth, or a `src/lib/grade` root enumeration). The
new oracle file module-mocks NOTHING and is pure, so it is unlikely to trip the
auth-mock population canary - but that is CHECKED, not assumed, in the wave gate.

### Wave gate

`git status --short` against the write set (reject any `.claude/worktrees` edit);
`npx tsc --noEmit`; and
`npm run test:paths src/lib/grade/collisionRefusal.test.ts src/lib/grade/collisionRefusal.sameStemAmnesty.test.ts src/lib/grade/collisionRefusal.wiring.test.ts src/lib/grade/grouping-zip-parents.wiring.test.ts src/lib/grade/identityInvariants.test.ts src/lib/grade/utils.test.ts src/file-size-ceiling.structure.test.ts`;
plus `npm test` (FULL sweep) before the push, since the pre-push gate runs no
vitest and the directory/exact-set canaries are only caught by running them
(`docs/loop/this-repo.md` section 1).

---

## 10. Residual register (owner, instrument, step) - to be FILED in docs/BACKLOG.md by the orchestrator

A residual not in `docs/BACKLOG.md` does not exist (this pass is read-only and
does not edit the backlog).

| id | What is not proven / not fixed here | Owner | Instrument | Step |
|---|---|---|---|---|
| RES-SS-1 | The Canvas gate `/^\d+-\d+ - /` is derived from ONE owner example; other Canvas "new-style" variants (single id group, different separators, localized date) may exist and would NOT be amnestied (a safe false-refusal). | Repo owner / a later A45-area wave | Real Canvas bulk-download samples; no live Canvas here | Broaden the gate only against real samples, with the same frozen-oracle zero-change proof; until then narrow-and-conservative. |
| RES-SS-2 | The merged row is labeled "949293" (the leading-run display), not the student's name. Fixing the label needs the placement-A Canvas identity parse. | A later A45-area wave (architect) | `groupSubmissionsByStudent` display; `identityInvariants.test.ts` must stay green | Only if the bare-id label is judged a problem; it is cosmetic, not a safety issue. |
| RES-SS-3 | A deliberately forged pair of DIFFERENT students both named with an identical `\d+-\d+ - ...` stem would be amnestied - the rename-forgery ceiling, no worse than A44's accepted gap. | Repo owner | Documented edge; the K1 forgery class (`collisionRefusal.test.ts:134-142`, RULING 89 accepted-unsound) | Accepted edge, recorded, not fixed. |
| RES-SS-4 | ONE student's DIFFERENTLY-named files (same Canvas `<id>-<id>` prefix but different submission id/time -> different full stems) still collapse to the leading-run key and, being different stems, are NOT amnestied -> still REFUSE. This is the brief's "ALSO CONSIDER" broader case. | A later A45-area wave (architect) | A richer Canvas-prefix parse at the identity layer (placement A), with its own frozen oracle | OUT of this scope by recommendation: the owner's reported case is the identical-stem one; this broader case needs the hyphen/space Canvas convention parsed into identity, a distinct, larger change. Flagged so it is not lost. |
| RES-SS-5 | The fork in section 7 (R vs N). | Repo owner | Section 3.2/3.4 measured counts | One-message owner choice riding alongside the build; R is built unless vetoed. |

---

## 11. Disposition vs the brief's proposed fix

The brief proposed: same-stem amnesty, name-only, in `collisionRefusal.ts`, with
the frozen oracle proving unsound-allows change by 0.

| Brief element | Disposition | Where |
|---|---|---|
| Amnesty lives in the collision DECISION, not the identity parse | KEPT | section 4.1 (placement B), with the reasoning the brief gave (reuse the existing merge) |
| "Do not refuse when same-stem" | REFINED | section 4.2-4.3: do not refuse when same-stem AND the shared stem is a Canvas identity (`/^\d+-\d+ - /`) |
| "Every file shares the same full base stem, case-insensitive/trimmed" | KEPT as one of two conjuncts | section 4.2 |
| Premise "two different students cannot share byte-identical names-except-extension" | DISPROVEN, not adopted | section 3.2-3.3 (measured counterexamples: `midterm.txt`/`midterm.md`, `Report Draft.md`/`Report Draft.pdf`) |
| Positive frozen fixture (owner's case -> OK) | KEPT | AC-POS (section 6) |
| No-blend regression: unsound-allows change by 0 | KEPT, now PROVABLE | AC-NO-BLEND + section 3.4 (gate matches 0 generator files) |
| Different-stem groups still refuse | KEPT | AC-GATE-NEGATIVE, AC-FROZEN-FIXTURES |
| Reuse the A44/A45 frozen generator (seed/N) | KEPT | section 6 (`DEFAULT_SEED`/`DEFAULT_SWEEP_N`) |
| Relationship to A45 (orthogonal, state order) | KEPT | section 4.3 (same-stem amnesty FIRST; neither weakens the other) |
| Broader differently-named case -> richer Canvas parse, OUT of scope | KEPT | RES-SS-4 |

No brief element is silently dropped; each is kept, refined, or disproven with
measurement above.
```
