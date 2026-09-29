# A8 remainder - wave plan (round 1)

Plan only. No production code, no test code, no `src` edit was made to produce
this document; it is docs-only. Consumer: the `loop-implementer` who builds
Wave 1 then Wave 2. A fresh `loop-checker` gates this plan before any
implementer is dispatched.

This plan CONSUMES and does not re-derive: `docs/a8-architecture.md` (the
settled, checked architecture - G1 choke-point fix in `canvasWorkToEntry`, the
front-loaded manifest as the only model-facing recognition carrier,
truncation-survival, the optional shape-only `initialPostCount`/`replyCount`,
two sequenced waves), `docs/a8-test-notes.md` (the settled, checked oracles
REQ-1..REQ-8 and finding F-1), `docs/a8-scope.md` (AC-1..AC-8 and residuals),
and the A8 row `docs/backlog.yml:307-318`. Every quantity below names the command
that produced it; every `file:line` was opened this session.

Scope of this round, carried unchanged from the architecture section 0:
RECOGNITION on Route A only. Replies reach the model labelled as replies,
distinct from the initial post, so a reply can never be presented as an initial
post. Exclusion, reply scoring, and the reply-section rubric are DESIGNED in the
architecture (its section 9) but NOT built this round. Routes C and D stay
owner-only residuals (section 6 below); they are in NO wave.

## 0. Orchestrator rulings this plan applies (not re-opened)

- D-1 APPLY. Force a dot-free `submittedFiles.name` for reply contributions
  inside `src/lib/grade/extraction.ts` (Wave 2), so a dotted `parentName` such
  as "Dr. Smith" cannot leak into the model file-list block through
  `buildSubmittedFileNamesBlock`. The `content` sections keep the full
  `parentName` (periods are harmless there). No `src/lib/grade/prompts.ts` edit.
  This is verified, not asserted: `buildSubmittedFileNamesBlock`
  (`prompts.ts:270-283`) drops a name only when
  `getBaseFileName(file.name).includes(".")` is FALSE (`prompts.ts:271-274`),
  and `getBaseFileName` (`utils.ts:34-38`) splits only on "/", so a name such as
  "Reply to Dr. Alan Turing" contains a "." and WOULD leak without the dot-free
  step. The fix lands entirely in Wave 2's write set. Its gate is REQ-7 fixture
  (b) (`docs/a8-test-notes.md` REQ-7, FIX-G).
- D-2 RESIDUAL. The reply-vs-reply key-uniqueness oracle (a student with two
  replies to the same classmate) stays a RECOMMENDED residual (RT-6 below), not
  built this round. AC-5 as written requires only distinguishing initial from
  reply, not reply from reply.

## 1. Measured sizes (both mandated instruments, 2026-09-29)

`@(Get-Content <path>).Count` in PowerShell and `wc -l` in Git Bash. They AGREE
on every file below (this repo has files where they disagree by up to 138, so
both were run):

| File | `@(Get-Content).Count` | `wc -l` | This round | Projected | Ceiling |
|---|---|---|---|---|---|
| `src/lib/canvas/discussions.ts` | 158 | 158 | Wave 1, +~15 | ~173 | 1000 |
| `src/lib/canvas.test.ts` | 56 | 56 | Wave 1, test additions | grows, far below | 1000 |
| `src/lib/grade/extraction.ts` | 372 | 372 | Wave 2, +~55 | ~427 | 1000 |
| `src/lib/grade/extraction.test.ts` | 330 | 330 | Wave 2, test additions | grows, far below | 1000 |
| `src/app/actions/grading.ts` | 977 | 977 | 0 (see section 5) | 977 | 1000 |
| `src/lib/canvas/submissions.ts` | 194 | 194 | 0 | 194 | 1000 |
| `src/lib/grade/rubric.ts` | 443 | 443 | 0 (design-only) | 443 | 1000 |
| `src/lib/grade/engine.ts` | 487 | 487 | 0 (live caller, not edited) | 487 | 1000 |

`LIMIT = 1000` at `src/file-size-ceiling.structure.test.ts:41`. No
`ALLOWED_OVERAGE` entry exists for any file above
(`grep -n "extraction.ts\|discussions.ts\|grading.ts" src/file-size-ceiling.structure.test.ts`
returns nothing). No file this round approaches the ceiling.
`grading.ts` at 977 is UNTOUCHED (section 5), which is what keeps its
23-line headroom intact and defers R6.

## 2. The two waves

### WAVE 1 - discussion source data (`src/lib/canvas/discussions.ts`)

WRITE SET (derived, section 3): `src/lib/canvas/discussions.ts` (production) and
`src/lib/canvas.test.ts` (its owned test).

WHAT WAVE 1 CHANGES:
- Add optional `parentName?: string` to `DiscussionPost`
  (`discussions.ts:9-17`), resolved from the existing `names` map inside
  `extractDiscussionActivity` when a reply is pushed (`discussions.ts:62-71`):
  `parentName: parentUserId !== null ? names.get(parentUserId) : undefined`.
  The `names` map already exists (`discussions.ts:48-53`); no new import, no
  signature change.
- Add optional `initialPostCount?: number` and `replyCount?: number` to
  `CanvasStudentWork` (`discussions.ts:106-120`), set ONLY in `fetchDiscussion`
  (`discussions.ts:147-154`) from `activity.initialPosts.length` and
  `activity.replies.length`. Keep `contributionCount` as-is.

WHAT WAVE 1 EXPORTS AND WHERE IT IS CALLED:
- `DiscussionPost.parentName` - a real cross-wave export. Its RUNTIME reader is
  `canvasWorkToEntry` in WAVE 2 (`extraction.ts`), which reads `reply.parentName`
  to build the reply label. Its IN-WAVE consumer is `src/lib/canvas.test.ts`
  REQ-8, which asserts `byUser.get(2).replies[0].parentName === "Alice Adams"`.
  So `parentName` is not shipped dead: Wave 1's own gate asserts it is populated
  correctly, and its runtime caller lands in Wave 2, the immediately following
  wave of the same serial A8 activity. See section 4 for the caller-rule ruling.
- `CanvasStudentWork.initialPostCount` / `replyCount` - SHAPE-ONLY, DECLARED.
  They have NO runtime reader anywhere: the manifest in Wave 2 reads
  `work.discussion.initialPosts.length` / `.replies.length` DIRECTLY, not these
  fields (`docs/a8-architecture.md` section 5 / INFO-1; `docs/a8-test-notes.md`
  REQ-4 SHAPE-ONLY note; the fields are redundant with those `.length` values).
  Their ONLY consumer is the AC-3 oracle `src/lib/canvas.test.ts` REQ-4, which
  is in Wave 1's write set. This mirrors `contributionCount`'s already-accepted
  zero-runtime-reader state (`docs/a8-scope.md` 1.3: 9 grep hits, 0 readers).
  This is stated explicitly, not left for the checker to discover: two fields
  ship with a TEST consumer and no RUNTIME reader, on purpose, because AC-3 is a
  SHAPE requirement, not a behaviour change. RT-5 tracks the day a runtime
  reader might appear. Do NOT claim `canvasWorkToEntry` reads them.

INDEPENDENTLY GATEABLE: YES. `src/lib/canvas.test.ts` asserts every new field
(REQ-4 counts, REQ-8 `parentName`), and `extractDiscussionActivity` is a pure
function driven directly. `fetchDiscussion` is the only writer of the counts,
so REQ-4 drives `fetchDiscussion` through a `canvasGet` mock (section 6a of the
test notes). NOTE the pairing caveat under section 4: a green Wave 1 gate does
NOT mean the user-visible recognition ships - that only lands with Wave 2.

DELIVERS: AC-3 (count split, REQ-4) and R7/`parentName` (REQ-8).

### WAVE 2 - entry construction (`src/lib/grade/extraction.ts`)

WRITE SET (derived, section 3): `src/lib/grade/extraction.ts` (production) and
`src/lib/grade/extraction.test.ts` (its owned test).

WHAT WAVE 2 CHANGES: the G1 choke-point fix. Add a discussion branch at the TOP
of `canvasWorkToEntry` (`extraction.ts:238`): if `work.discussion` is set, build
`content` and `submittedFiles` from `work.discussion` and EARLY-RETURN, so the
existing `if (work.text)` block at `extraction.ts:245-255` does NOT also run for
a discussion. (A discussion `work` sets `work.text`, so without the early return
today's code pushes a `"Discussion post"` pseudo-file - REQ-1 assertion 4 and
its self-attack exist precisely to catch a double-emit that keeps both branches.)
The branch builds, in order: a front-loaded MANIFEST line composed from the
integer counts `I = discussion.initialPosts.length` and
`R = discussion.replies.length`; an `=== INITIAL POST ===` section (or the code
line "[This student did not write an initial post.]" when `I` is 0); and, when
`R >= 1`, an `=== REPLIES TO CLASSMATES ===` section with one
`--- Reply to <parentName> ---` block per reply (or `--- Reply ---` when
`parentName` is unresolved), sections joined by "\n\n". It pushes one
`SubmittedFileInfo` per contribution, each `extension: "(none)"`, initial-post
names dot-free by construction and reply names made dot-free (D-1) and unique.
A private helper (for example `buildDiscussionEntry`) MAY be added inside
`extraction.ts` for testability; it exports nothing across a module boundary, so
no barrel change. `canvasWorkToEntry`'s signature and return type are UNCHANGED.

WHAT WAVE 2 EXPORTS AND WHERE IT IS CALLED:
- The new discussion BEHAVIOUR of `canvasWorkToEntry` (signature unchanged). Its
  live production RUNTIME caller is `gradeCanvasUrl` at `engine.ts:471-472`
  (already in the tree; NOT edited this round). Its in-wave test consumer is
  `src/lib/grade/extraction.test.ts`, which drives the exported
  `canvasWorkToEntry` directly (REQ-1/2/3/5/7), the same function
  `gradeCanvasUrl` loops over. So the new behaviour has a live caller and is not
  dead code.

INDEPENDENTLY GATEABLE: only ON A TREE THAT ALREADY HAS WAVE 1. Wave 2 reads
`reply.parentName`, which does not exist on `DiscussionPost` until Wave 1 adds
it, so `npx tsc --noEmit` fails on Wave 2 alone (see section 4 for why this is a
real tsc dependency, not a preference). Given Wave 1 landed, Wave 2's own tests
drive `canvasWorkToEntry` and `truncateSubmission` directly and gate cleanly.

DELIVERS: AC-1 (REQ-1), AC-2 unmerged and truncation-survival (REQ-2, REQ-3),
AC-4 (REQ-5), AC-5 source-checkable half (REQ-6), and the F-1/D-1 model-leak
guard (REQ-7). AC-6 is a scope-boundary statement (no test). AC-7 and AC-8 are
BLOCKED and out of this round.

## 3. Write-set derivation (stated command, pasted output)

Commands run 2026-09-29 from the repo root:

```
grep -rln "canvasWorkToEntry" src
grep -rln "extractDiscussionActivity\|fetchDiscussion" src
grep -rln "readFileSync" src | xargs grep -l "canvas/discussions\|grade/extraction"
grep -rln "CanvasStudentWork\|SubmittedFileInfo" src --include=*.structure.test.ts
```

Callers/references of `canvasWorkToEntry` (Wave 2 symbol):
```
src/app/actions/action-guard-coverage-github-cohort.test.ts
src/app/actions/grading.guard.test.ts
src/app/actions/grading.ts
src/app/components/grading-results/gradingResultsHelpersEditState.test.ts
src/lib/grade/engine.ts
src/lib/grade/extraction.test.ts
src/lib/grade/extraction.ts
src/lib/grade/repo-content.ts
src/lib/grade/rubric-stamp.wiring.test.ts
src/lib/grade/single-file-entry.ts
src/lib/grade/types.ts
src/lib/grade.ts
```

References of the Wave 1 symbols `extractDiscussionActivity` / `fetchDiscussion`:
```
src/lib/canvas/discussions.ts
src/lib/canvas/work.ts
src/lib/canvas.test.ts
src/lib/canvas.ts
src/lib/course-intel/canvas-readers.ts
src/lib/course-intel/cross-course.test.ts
src/lib/course-intel/fetch.test.ts
src/lib/course-intel/fetch.ts
src/lib/course-intel/join.ts
```

Source-text tests that `readFileSync` and mention my two files:
```
src/app/actions/action-guard-coverage-github-cohort.test.ts
src/app/actions/grading.guard.test.ts
src/lib/grade/grouping-zip-parents.wiring.test.ts
src/lib/module-graph/runtime-import-graph.test.ts
src/lib/module-graph/runtime-import-graph.ts
```

Structure tests enumerating `CanvasStudentWork` / `SubmittedFileInfo` keys:
```
(empty - no field-count canary trips on the optional-field additions)
```

Classification of every hit (EDITED / CHECKED-SAFE), each opened:

EDITED (production):
- `src/lib/canvas/discussions.ts` - Wave 1.
- `src/lib/grade/extraction.ts` - Wave 2.

EDITED (tests, owned):
- `src/lib/canvas.test.ts` - Wave 1. Extends the `extractDiscussionActivity`
  describe block at `:27-56` (REQ-8) and adds a `fetchDiscussion` count case with
  a `canvasGet` mock (REQ-4).
- `src/lib/grade/extraction.test.ts` - Wave 2. Adds discussion fixtures for
  REQ-1/2/3/5/7. Today's `canvasWorkToEntry` fixtures set `work.text`/files but
  no `discussion`, so they take the unchanged path and stay green.

CHECKED-SAFE, reads my edited file AS SOURCE TEXT - must be RE-RUN to prove it
stays green, and it is in the Wave 2 gate (section 6):
- `src/lib/grade/grouping-zip-parents.wiring.test.ts` - `readFileSync`s
  `src/lib/grade/extraction.ts` (`:39`) and asserts its source matches
  `groupSubmissionsByStudent(` and `isWiredToRealZipParents(...)` (`:140-141`).
  My Wave 2 change is a branch at the TOP of `canvasWorkToEntry`; it touches
  neither `extractStudentEntries`, `extractSubmissions`, nor
  `groupSubmissionsByStudent`, so both asserted strings remain present. It stays
  green, but because it greps a string in a file I edit, it is gated explicitly
  (the "a test that greps a string it does not own goes red on a correct change"
  class). Verdict: stays green; gate it to prove it.

CHECKED-SAFE, references the symbol only (signature and return shape unchanged,
so they compile and behave unchanged; caught by the full `npm test` regression):
- `src/lib/grade/engine.ts` - live caller of `canvasWorkToEntry` at `:471-472`.
- `src/lib/grade.ts`, `src/lib/grade/types.ts`, `src/lib/grade/single-file-entry.ts`,
  `src/lib/grade/repo-content.ts`, `src/app/actions/grading.ts` - reference or
  re-export `canvasWorkToEntry`; none is affected by an internal branch.
- `src/lib/grade/rubric-stamp.wiring.test.ts` (`vi.mock`s `canvasWorkToEntry` at
  `:55`), `src/app/actions/grading.guard.test.ts`,
  `src/app/actions/action-guard-coverage-github-cohort.test.ts`,
  `src/app/components/grading-results/gradingResultsHelpersEditState.test.ts` -
  none asserts on the discussion branch.
- `src/lib/module-graph/runtime-import-graph.test.ts` / `.ts` - a synthetic
  import-edge fixture cross-product (duplicated regex, inline sources at
  `:100-262`); it does not read my files' real content for a frozen assertion,
  and my waves ADD NO import statement, so no import edge changes. Safe.
- `src/lib/canvas.ts` (barrel), `src/lib/canvas/work.ts` (calls
  `fetchDiscussion`), `src/lib/course-intel/*` (call `extractDiscussionActivity`)
  - the count/`parentName` additions are OPTIONAL, so every existing
  `CanvasStudentWork` / `DiscussionPost` literal and reader compiles unchanged.
- `src/lib/canvas/submissions.ts:158` and `src/app/actions/grading.ts:620` - the
  other two `CanvasStudentWork` literals; OPTIONAL fields keep them compiling with
  no edit. This is what keeps `grading.ts` (977) and `submissions.ts` out of both
  write sets (section 5).
- `src/lib/grade/prompts.ts` (`buildSubmittedFileNamesBlock`) - relied on to DROP
  the dot-free contribution labels (`:271-274`); NOT edited (D-1).

No `*.structure.test.ts` enumerates `CanvasStudentWork` or `SubmittedFileInfo`
keys, so the optional-field additions trip no field-count canary. No new CSS
class is added, so `page-module-css-orphan-classes.test.ts` (which writes
`docs/css-orphans.md` each run) shows no new path at either wave gate.

## 4. Disjointness, both senses

### 4a. Same-path disjointness (computed, pasted)

Command: `cat <wave1 paths> <wave2 paths> | sort | uniq -d`. Empty output is the
only pass.

```
--- Wave 1 write set ---
src/lib/canvas/discussions.ts
src/lib/canvas.test.ts
--- Wave 2 write set ---
src/lib/grade/extraction.ts
src/lib/grade/extraction.test.ts
--- intersection (sort | uniq -d) ---
(empty)
--- self-intersect canary (Wave 1 against itself; MUST print both) ---
src/lib/canvas.test.ts
src/lib/canvas/discussions.ts
```

The canary printing both paths proves `uniq -d` is working here (not a silently
empty result), so the empty intersection is a real pass. The two waves are
PATH-DISJOINT: Wave 1 is `canvas/*`, Wave 2 is `grade/*`. A wave gate that shows
any stray path (a `grade/*` file touched during Wave 1, or vice versa) is RED.

### 4b. Informational independence, and why the waves still may NOT run concurrently

Path-disjoint is NOT sufficient. Compute from each side's STATED write set:

- Wave 2's `canvasWorkToEntry` reads `reply.parentName`. `reply` is typed
  `DiscussionPost`. `parentName` is a field WAVE 1 adds to `DiscussionPost`.
  Therefore Wave 2 designs against a fact Wave 1 establishes: this is a
  directional informational coupling, Wave 1 to Wave 2.
- It is a REAL `tsc` dependency, not a preference. On a tree with Wave 2 but not
  Wave 1, `reply.parentName` is `TS2339: Property 'parentName' does not exist on
  type 'DiscussionPost'`, so `npx tsc --noEmit` fails. Confirmed by reading the
  current `DiscussionPost` (`discussions.ts:9-17`), which has no `parentName`.
- The count fields do NOT create a coupling: Wave 2 reads
  `work.discussion.initialPosts.length` / `.replies.length` directly, never
  `initialPostCount` / `replyCount` (section 2, Wave 1). So the ONLY Wave 2-to-Wave 1
  tsc dependency is `parentName`.

RULING (matches `docs/loop/parallel-disjointness.md` RULING 96 and the A8 row's
own A8-R / A8-P precedent, `docs/backlog.yml:317`, "sequence rather than merge"):
the caller/correctness dependency wins over concurrency.

- WAVES MUST NOT RUN CONCURRENTLY. Dispatch WAVE 1, let it land, then WAVE 2.
- The overlap is printed (4a: empty for paths; the coupling is the `parentName`
  tsc dependency named above), and the pair is marked sequenced so the reader
  does not mistake path-disjointness for "safe to fan out".
- The caller rule is satisfied ACROSS the sequenced pair: `parentName` is
  produced in Wave 1 (and gated there by REQ-8) and its runtime reader lands in
  Wave 2 immediately after. Wave 1's green gate is NOT the feature shipping;
  user-visible recognition exists only once Wave 2 lands. Do not close A8 on
  Wave 1 alone.

Merging the two into one wave was rejected for the same reason RULING 96 rejects
it: it would put the `discussions.ts` source-data change and the `extraction.ts`
entry-construction change in one diff spanning two modules, and it removes the
clean per-module gate; sequencing two path-disjoint waves is strictly cheaper to
verify.

## 5. `grading.ts` and `submissions.ts` stay out of both write sets

`grading.ts` is 977/1000 (section 1) and holds one of the three
`CanvasStudentWork` literals (`grading.ts:620`); `submissions.ts:158` holds
another. Because `initialPostCount` / `replyCount` / `parentName` are all
OPTIONAL, those literals compile UNCHANGED, so neither file is edited. This is
what keeps `grading.ts` off the ceiling this round and defers R6 (its line-budget
re-measure) to a future wave that actually edits it. Confirmed: neither path is
in either write set in section 4a.

## 6. Gates

Run all gates from PowerShell (Bash is not on PATH from PowerShell here).
`npx tsc --noEmit` has exactly ONE caller (it races on
`tsconfig.tsbuildinfo`), so the wave gate owns tsc and no sibling may
sabotage-verify on the tree in the same window. Stage explicit paths only: no
`git add -A`, no `git stash` (either would sweep or revert a sibling's work).

### WAVE 1 gate

1. Typecheck: `npx tsc --noEmit`. PASS = no output at all, exit 0.
2. Lint: `npm run lint`. PASS = exit 0, and NO NEW warning in
   `src/lib/canvas/discussions.ts` or `src/lib/canvas.test.ts` measured against
   the same command run before the change. Do NOT pin the warning count (this
   repo's baseline drifts 4 to 8).
3. Wave tests (single owned file, so a bare `vitest run` cannot silently drop an
   argument): `npx vitest run src/lib/canvas.test.ts`. PASS = all pass,
   including REQ-4 (`initialPostCount === 1`, `replyCount === 2`) and REQ-8
   (`parentName === "Alice Adams"`).
4. Full regression: `npm test`. PASS = whole suite green (catches every
   CHECKED-SAFE `extractDiscussionActivity` / `fetchDiscussion` reference in
   `course-intel/*` and `canvas/work.ts`).
5. Tree gate: `git status --short` shows ONLY
   `M src/lib/canvas/discussions.ts` and `M src/lib/canvas.test.ts` - no other
   path, and no `.claude/worktrees/...` path (Glob returns the worktree copy
   first; require the main-checkout status as proof). Stage exactly:
   `git add src/lib/canvas/discussions.ts src/lib/canvas.test.ts`.

### WAVE 2 gate (run only on a tree that already has Wave 1)

1. Typecheck: `npx tsc --noEmit`. PASS = no output, exit 0. This also proves the
   `reply.parentName` dependency on Wave 1 is satisfied.
2. Lint: `npm run lint`. PASS = exit 0, no NEW warning in
   `src/lib/grade/extraction.ts` or `src/lib/grade/extraction.test.ts` vs
   baseline. Do NOT pin the count.
3. Wave tests (TWO files - the owned test plus the source-text reader - so the
   multi-path wrapper is mandatory; a raw `vitest run a b` drops an unmatched
   path and exits 0):
   `npm run test:paths -- src/lib/grade/extraction.test.ts src/lib/grade/grouping-zip-parents.wiring.test.ts`.
   PASS = both print `COVERED`, all pass, including REQ-1 (distinct
   `"Initial post"` vs reply names and NO `"Discussion post"`), REQ-2 (manifest
   counts, both count-shape fixtures), REQ-3 (truncation survival at the
   realistic and small caps), REQ-5 (two distinct empty states), REQ-7 (no
   contribution label in the model file-list block, including FIX-G's
   "Dr. Alan Turing"), AND `grouping-zip-parents.wiring.test.ts` still green.
   `package.json:21` provides `test:paths`.
4. Full regression: `npm test`. PASS = whole suite green (catches the
   CHECKED-SAFE `canvasWorkToEntry` references: `rubric-stamp.wiring.test.ts`,
   `grading.guard.test.ts`, `action-guard-coverage-github-cohort.test.ts`,
   `gradingResultsHelpersEditState.test.ts`, and the live caller `engine.ts`).
5. Build (the one gate that catches a `"use server"` non-async export and certain
   module-boundary errors): `npm run build`; grep for
   `Compiled successfully`; do NOT `&&` on it (it exits 1 in the env-dependent
   prerender tail, which is expected here - no `.env`). Neither edited file is a
   `"use server"` file and no module boundary is crossed, so this is expected to
   pass; it is run as the standard gate, not because a defect is anticipated.
6. Tree gate: `git status --short` shows ONLY
   `M src/lib/grade/extraction.ts` and `M src/lib/grade/extraction.test.ts` - no
   other path, no worktree copy. Stage exactly:
   `git add src/lib/grade/extraction.ts src/lib/grade/extraction.test.ts`.

## 7. Dispatch-ordering constraint the ORCHESTRATOR manages (A42 in flight)

A8 and the concurrent A42 wave are PATH-DISJOINT. Verified 2026-09-29:
```
cat <A8 four files> <A42 src paths from docs/a42-scope.md + docs/a42-test-notes.md> | sort | uniq -d
-> (empty)
```
A42's row `owns` is `[]` (`docs/backlog.yml:715-720`) and its scope/test-notes
docs reference none of A8's four files. But A42 edits `src` TEST files - among
them `src/app/actions/action-guard-coverage-github-cohort.test.ts` and
`src/app/components/grading-results/gradingResultsHelpersWiring.test.ts`, both of
which reference `canvasWorkToEntry` (checked-safe for A8, section 3). While those
files are mid-flight, A8's WHOLE-TREE `npx tsc --noEmit` and `npm test` gates
could false-RED on A42's uncommitted edits.

CORRECTION (round-1 check INFO-1): the two files named just above are
MISATTRIBUTED - A42's actual committed write set (28fcc63f) is 6 scanner test
files + the L13 probe + docs/css-orphans.md, and neither named file references
canvasWorkToEntry outside a comment. The constraint is nonetheless SATISFIED:
A42 is already committed (28fcc63f) and the tree is clean, so A8's whole-tree
gates run against a post-A42 tree and the false-RED hazard cannot occur.

CONSTRAINT: dispatch A8's implementer so that BOTH of A8's whole-tree gates
(steps 1 and 4 of each wave) run against a tree where A42 has ALREADY committed.
Concretely: A8 Wave 1 starts after A42's commit lands. This is a dispatch-ordering
decision the orchestrator owns (both are in flight); it is NOT a code dependency
between A8 and A42 (their write sets are disjoint), only a gate-cleanliness
ordering so a sibling's in-flight edit cannot manufacture a false red.

## 8. Line-shift obligation this plan creates

My edits ADD lines to two files, shifting line numbers that other documents pin.
No test reads a doc line-pin, so this is a documentation-accuracy debt, NOT a
gate hazard; it is priced here so no citation is silently manufactured stale.

- `src/lib/canvas/discussions.ts` (Wave 1, +~15): a `parentName?` field near
  `:16`, count fields near `:119-120`, `parentName` resolution near `:66`, count
  sets near `:152`. Every pin below the first insertion shifts down
  progressively. Pinned by:
  - `docs/backlog.yml:315` (A8 row instrument, `canvas/discussions.ts:106-152`).
    RE-PINNER: the orchestrator, when reconciling/closing the A8 row at the A8
    push.
  - `docs/REGRESSION.md:45761-45784` (the A8 baseline, entry 443, commit
    `50e13625`): `discussions.ts:44-82`, `:106-120`, `:144-146`, `:152`, `:153`,
    `:112`. RE-PINNER: the A8 regression pass appends a NEW entry for the
    post-recognition behaviour; the baseline entry is historical and is not
    re-pinned (it records behaviour before A8).
  - `docs/a46-canvas-collision-scope.md:161,359` (`discussions.ts:141-157`,
    `:51`). RE-PINNER: whoever next works A46 re-measures; A8 does NOT edit A46's
    doc. Only pins below my lowest discussions.ts insertion move.
- `src/lib/grade/extraction.ts` (Wave 2, +~55, all AT OR BELOW line 238 - the
  branch is inserted at the top of `canvasWorkToEntry` at `:238`, plus a private
  helper). Pins at lines <= 238 are UNAFFECTED; pins > 238 shift by the delta:
  - UNAFFECTED (all <= 238): `docs/a39-census.md:386` (`:67-69`),
    `docs/a41-scope.md:163,244,250,266,681` (`:95`, `:138`, `:83`),
    `docs/a41-check.md:299` (`:83-85`), `docs/a44-architecture.md:276` (`:118`),
    `docs/a44-waves.md:574,578` (`:33`, `:11`), `docs/a46-*` (`:157-169`, `:166`),
    `docs/a46-scope.md:251` (`:134-149`), `docs/backlog.yml:1013` and
    `docs/BACKLOG.md:131` (`:130-141`), `docs/backlog-unscoped-triage.md:45`
    (`:130-166`).
  - SHIFTS (> 238): `docs/a41-check.md:97` (`extraction.ts:290`),
    `docs/a41-scope.md:326` (`:166-300`, the 300 end),
    `docs/REGRESSION.md:45779` (`grade/extraction.ts:238-370`, the A8 baseline
    range). RE-PINNER for the a41 pins: whoever next works A41; A8 edits no A41
    doc, so the obligation is only to flag (done here) that those two pins read a
    few lines low after A8 lands. RE-PINNER for the REGRESSION baseline: the A8
    regression pass, as above.

A8 edits NO other item's doc, so no document "nobody had touched" is silently
rewritten; the shifts above are the inherent cost of adding lines and are named
with their re-pinner so a future reader re-measures rather than trusting a stale
pin.

## 9. Residual register (owner, instrument, step)

Carried from `docs/a8-architecture.md` section 16 and `docs/a8-test-notes.md`
section 7, with the dispositions this plan does not change. A residual missing an
owner, an instrument or a step is a deletion; none below is. The A8 push must
reconcile these into the A8 row (`docs/backlog.yml:307-318`) / `docs/BACKLOG.md`.

- R1 - Route C (`gradeOneSubmissionAction`) discussion recognition. Unverifiable
  without a live Canvas `/view` call this route does not make
  (`docs/a8-scope.md` 1.2, AC-8). OWNER: repo owner. INSTRUMENT: one live
  single-submission grade through `gradeOneSubmissionAction` against a real
  graded discussion. STEP: after a future wave gives that route a `/view` call.
  In NO wave this round.
- R2 - Route D (`_post.txt` / external Deterministic Grading API). Unverifiable
  without a live external call; `grep -rn "_post" src` (excluding tests) finds no
  in-repo reader. OWNER: repo owner. INSTRUMENT: one run against the live external
  service. STEP: before any change to what `canvasWorkToZipBase64`
  (`submissions.ts:166-188`) writes. In NO wave this round.
- R3 - the reply-section rubric authoring surface, parsing convention, and grader
  application. DESIGNED (`docs/a8-architecture.md` section 9) but NOT built.
  OWNER: the next A8 activity. INSTRUMENT: the parsing convention plus the
  non-regression bar `rubric.ts:33-35,78-88` already states, and an authoring-UI
  surface. STEP: before any wave edits `rubric.ts` for this feature. `rubric.ts`
  is in NO wave this round (measured 443/1000, section 1).
- R4 - whether a model-supplied total that ignores a future reply component
  should be overridden by `deriveTotalScore`'s sum (`parsing.ts:175-203`). MOOT
  until R3 ships. OWNER: whoever scopes R3. INSTRUMENT: re-examine
  `parsing.ts:175-203` and `grades.ts:128-143` once a reply criterion can exist.
  STEP: that future scope.
- R5 - AC-5's rendered UI (rows, focus, keyboard). NO component renders under
  vitest, so this is an OV/reading claim in-suite; the pixel confirmation is
  owner/UX. OWNER: the verify/UX pass at implementation time. INSTRUMENT: a manual
  check or screenshot in the running app. STEP: after Wave 2, before it ships.
- D-2 / RT-6 - the reply-vs-reply key-uniqueness oracle (two replies to the same
  classmate; a duplicate `"Reply to X"` name collides `FilesCell`'s React key at
  `FilesCell.tsx:41`). RECOMMENDED, not mandated this round (AC-5 needs only
  initial-vs-reply). OWNER: the Wave 2 implementer IF the checker mandates it;
  otherwise a KNOWN GAP, not a deletion. INSTRUMENT: the supplementary oracle in
  `docs/a8-test-notes.md` REQ-6 (a fixture with two identical `parentName`
  replies; assert the two `submittedFiles` names are not equal). STEP: Wave 2.
  The architecture already specifies the disambiguation (`"Reply to X (2)"`,
  `docs/a8-architecture.md:206`), so building the oracle is low cost if mandated.

Also carried (live obligations from the consumed docs, not changed here):

- RT-5 - `initialPostCount` / `replyCount` are shape-only with no runtime reader
  (section 2, Wave 1). OWNER: whoever builds the reply-section rubric (R3/R4),
  when a reader might appear. INSTRUMENT: `grep -rn "initialPostCount\|replyCount" src`
  at that time. STEP: the future scope. Recorded so the fields are not mistaken
  for wired.
- R6 - `grading.ts` line budget (977/1000, no `ALLOWED_OVERAGE`,
  `file-size-ceiling.structure.test.ts:41`). UNCHANGED this round (section 5).
  OWNER: the wave-plan seat of any future wave that edits `grading.ts`.
  INSTRUMENT: `@(Get-Content src/app/actions/grading.ts).Count` vs `LIMIT`. STEP:
  before that wave starts.
- R8 - `contributionCount`'s zero-reader state re-confirm. OWNER: Wave 1
  implementer. INSTRUMENT: `grep -rn "contributionCount" src` immediately before
  the change, plus `tsc` after. STEP: Wave 1. (This round ADDS fields rather than
  removing `contributionCount`, so the risk is smaller than the scope assumed,
  but the re-confirm stands.)

Owner-only / behavioural residuals that no wave can discharge in this checkout
(no live Canvas, no live Gemini, no rendered component): the model's behavioural
effect (that it actually stops presenting a reply as an initial post) is ARGUED,
not measured - the oracles verify the model RECEIVES the distinction front-loaded
and truncation-proof, which is the recognition/behaviour boundary the
architecture draws. OWNER: repo owner. INSTRUMENT: one live `gradeCanvasUrl`
grade of a real graded discussion. STEP: after Wave 2 lands, owner-run.

## 10. What could not be determined here

- No live Canvas call: every claim about the `/view` response shape rests on
  reading `extractDiscussionActivity` / `fetchDiscussion` and their types.
- No component renders under vitest: AC-5's rendered rows are OV (R5); there is
  no render oracle in either wave.
- No live Gemini: the model's actual behaviour is argued (section 9), not
  measured.
