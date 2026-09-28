# R2 wave 1, cut into sub-waves (2026-09-27)

Seat: `loop-plan`. Consumer: a fresh `loop-checker`, then the wave-1 implementer
chain. This document consumes RULING 99 and `docs/r2-scope.md` section 7. It
does NOT re-open wave 1's content: the per-action process, the RULING 83
default-restrictive polarity with an explicit permissive exception list, the
executing-test idiom and the mutation-family requirement are accepted as
correct. Only the cut is authored here.

Every quantity below names the command that produced it. Every command's exit
code was read from the command itself, never through a pipe. Every absence claim
carries a canary exercising the same pattern AND the same filter. No production
or test file was mutated; the only write is this file.

---

## 0. Three inherited numbers are wrong, and the corrections are small but real

RULING 99 told me not to inherit its five cohort-file counts. Re-deriving all of
them turned up three further corrections, all in the same direction and all from
the same cause - `a77f447` (R4's landed wave) shipped after `docs/r2-scope.md`
was written and took one call site off the alias.

| Claim | Source | Measured here | Command |
|---|---|---|---|
| 410 call sites still on the alias | RULING 99 | **410** total / **407** production | `grep -rnE "await requireOwner\(\)" src/ \| wc -l` -> 410; `... \| grep -v "\.test\." \| wc -l` -> 407 |
| Group A = 255 call sites | `r2-scope.md` s3 | **254** | `grep -c "await requireOwner()" <the 41 Group-A files> \| awk -F: '{s+=$2} END {print s}'` -> 254 |
| `github.ts` carries 27 | `r2-scope.md` s3 | **26** | `grep -c "await requireOwner()" src/app/actions/github.ts` -> 26 |
| 41 files / 255 calls, total 408 | `r2-scope.md` s3 | 41 files / **254** calls, total **407** | as above |

Corroboration rather than coincidence: `a77f447`'s own commit body says "ONE
guard changed on that file, the other **26** sites left to R2", and
`git show a77f447 -- src/app/actions/github.ts` shows `ingestRepoAction`'s
`await requireOwner()` becoming `await requireAppOwner()`. So 255 -> 254 and
27 -> 26 are the same single site. The partition still reconciles exactly:

```
Group A 254  (my command above)
Group B  62  (grep -c "await requireOwner()" <the 9 Group-B files> | awk ... -> 62)
Group C  91  (407 - 254 - 62)
            ---
            407  = the census, measured
```

**Also corrected, and it matters for my ranking basis.** `r2-scope.md` section 3
says of its nine barrel-only files: "Every one of these imports something from
`src/app/actions.ts`". That is false at the direct-import level:

```
for f in automation-runs command-interface course-calendar course-hub-core \
         course-intel course-project institutions messaging-outlook syllabus-upload; do
  grep -cE 'from "(@/app/actions|\.\./actions|\./actions)"' "src/app/actions/$f.ts"; done
-> 0 for all nine
CANARY (must hit, same pattern, same filter, whole tree):
grep -rlE 'from "(@/app/actions|\.\./actions|\./actions)"' src/ | wc -l  -> 262
```

The canary fires on 262 files, so the instrument works and the zeroes are real.
The scope's *conclusion* (they reach GitHub only through the barrel) may still
hold transitively - I did not re-run the closure and I am not claiming it is
wrong. What is wrong is its stated mechanism, so **"barrel-only" is not usable as
a measured discriminator** and I do not use it. My ranking below rests only on
edges I measured myself.

---

## 1. The per-file measurement, all 41 Group-A files

Command, run once over the file list in one process:

```
grep -c "await requireOwner()" $(cat groupA.txt | tr '\n' ' ')      # exit 0
```

Canary pair on the same pattern and the same filter:
`grep -cE 'from "(@/lib/github|\./github|\.\./github)(\.repos)?";' src/lib/grade/repo-content.ts`
-> 1, exit 0 (must hit); the same pattern with `@/lib/zzgithub` -> 0, exit **1**
(must miss). Exit codes read from the command.

Line counts are given by BOTH mandated instruments. They agreed on every file
measured (`wc -l` and `@(Get-Content <file>).Count`), which is a fact about
these files, not a general licence to use one.

| # | File | alias calls | `export async function` | prod lines (`wc -l` / PS) | direct PAT edge | rank |
|---|---|---|---|---|---|---|
| 1 | `src/app/actions/github-repos.ts` | 37 | 37 | 881 / 881 | yes | 1 |
| 2 | `src/app/actions/github.ts` | 26 | 28 | 880 / 880 | yes | 1 |
| 3 | `src/app/actions/grading.ts` | 20 | 19 | 941 / 941 | no | 2a |
| 4 | `src/app/actions/canvas-inbox.ts` | 19 | 19 | 908 / 908 | no | 2a |
| 5 | `src/app/actions/course-hub-core.ts` | 17 | 17 | 288 | no | 2b |
| 6 | `src/app/actions/syllabus-templates.ts` | 15 | 15 | 459 | no | 2b |
| 7 | `src/app/actions/canvas-modules.ts` | 10 | 10 | 267 | no | 2a |
| 8 | `src/app/actions/course-hub-integrations.ts` | 10 | 10 | 271 | no | 2a |
| 9 | `src/app/actions/llm-tools.ts` | 8 | 8 | 602 | no | 2a |
| 10 | `src/app/actions/messaging.ts` | 8 | 7 | 522 | no | 2a |
| 11 | `src/app/actions/automation-runs.ts` | 7 | 7 | 338 | no | 2b |
| 12 | `src/app/actions/course-intel.ts` | 7 | 7 | 190 | no | 2b |
| 13 | `src/app/actions/messaging-outlook.ts` | 7 | 6 | 263 | no | 2b |
| 14 | `src/app/actions/accommodations.ts` | 6 | 6 | 152 | no | 2a |
| 15 | `src/app/actions/grading-inbox.ts` | 6 | 6 | 172 | no | 2a |
| 16 | `src/app/actions/github-content.ts` | 5 | 5 | 474 | yes | 1 |
| 17 | `src/app/actions/live-class.ts` | 4 | 4 | 700 | yes | 1 |
| 18 | `src/app/actions/lms-syllabus-buttons.ts` | 4 | 4 | 648 | no | 2a |
| 19 | `src/app/actions/course-calendar.ts` | 3 | 3 | 511 | no | 2b |
| 20 | `src/app/actions/github-student-repos.ts` | 3 | 3 | 251 | yes | 1 |
| 21 | `src/app/actions/lms-generation.ts` | 3 | 3 | 865 | no | 2b |
| 22 | `src/app/actions/visualizer.ts` | 3 | 3 | 322 | yes | 1 |
| 23 | `src/app/actions/command-interface.ts` | 2 | 2 | 565 | no | 2a |
| 24 | `src/app/actions/current-events-assignments.ts` | 2 | 2 | 205 | no | 2b |
| 25 | `src/app/actions/lms-generation-refine.ts` | 2 | 2 | 540 | no | 2b |
| 26 | `src/app/actions/repo-grades.ts` | 2 | 2 | 79 | yes | 1 |
| 27 | `src/app/actions/syllabus-upload.ts` | 2 | 2 | 246 | no | 2b |
| 28 | `src/app/actions/visualizer-selection.ts` | 2 | 2 | 396 | no | 2b |
| 29 | `src/app/actions/weekly-announcement-drafting.ts` | 2 | 2 | 341 | no | 2a |
| 30 | `src/app/actions/carry-module-pattern.ts` | 1 | 2 | 686 | no | 2b |
| 31 | `src/app/actions/castletop.ts` | 1 | 1 | 105 | no | 2a |
| 32 | `src/app/actions/course-project.ts` | 1 | 2 | 206 | no | 2b |
| 33 | `src/app/actions/institutions.ts` | 1 | 1 | 42 | no | 2b |
| 34 | `src/app/actions/selection-chat-context.ts` | 1 | 1 | 221 | no | 2b |
| 35 | `src/app/actions/submission-repo.ts` | 1 | 1 | 119 | yes | 1 |
| 36 | `src/app/actions/visualizer-coverage.ts` | 1 | 1 | 239 | yes | 1 |
| 37 | `src/app/api/automations/run-now/route.ts` | 1 | 2 | 195 | no | 2b |
| 38 | `src/app/api/lms-export/selection/route.ts` | 1 | 1 | 550 | no | 2a |
| 39 | `src/app/api/lms-generation/deck-from-capture/route.ts` | 1 | 1 | 157 | no | 2b |
| 40 | `src/app/api/lms-generation/deck/route.ts` | 1 | 1 | 194 | no | 2b |
| 41 | `src/app/api/visualizer/create/route.ts` | 1 | 1 | 213 | no | 2b |

Sum of column 3: **254**, by the `awk` reduction above.

**One guard per action, measured, not assumed.** Column 4 is
`grep -c "^export async function" <file>`. It equals column 3 on 34 of the 41
files; where it is higher the extra exports carry no guard (`github.ts` 28 vs 26,
`carry-module-pattern.ts` 2 vs 1, `course-project.ts` 2 vs 1,
`run-now/route.ts` 2 vs 1), and where it is lower the file has a guard inside a
non-top-level export (`grading.ts` 19 vs 20, `messaging.ts` 7 vs 8,
`messaging-outlook.ts` 6 vs 7). **Consequence I price on: the bookkeeping unit is
the ACTION, and there are 254 of them modulo those seven files, whose
implementer must count by reading rather than by this column.**

---

## 2. The exposure ranking, and the basis for it

RULING 84 says containment is a candidate set, never a classification, and only a
verified call path makes a site owner-only. So this section produces an
ORDERING, not a disposition. Nothing below classifies a single site.

### Rank 1 - a direct import edge to the PAT-spending module (9 files, 82 sites)

```
grep -cE 'from "(@/lib/github|\./github|\.\./github)(\.repos)?";' <each of the 41>
```

Nine files return non-zero: `github-repos.ts`(37), `github.ts`(26),
`github-content.ts`(5), `live-class.ts`(4), `github-student-repos.ts`(3),
`visualizer.ts`(3), `repo-grades.ts`(2), `submission-repo.ts`(1),
`visualizer-coverage.ts`(1). Sum **82**.

**This independently reproduces `r2-scope.md`'s own original narrow filter (9
files / 83 calls) from a different command, and the 83-to-82 delta is exactly
`a77f447`'s one conversion.** Two derivations landing on the same nine files is
the strongest ranking evidence available here.

**Refined within Rank 1 by a per-action body read, which is the measurement that
drives the whole cut.** For each Rank-1 file I collected the identifiers imported
from the PAT module (handling the multi-line `import {\n...\n} from
"@/lib/github";` form - my first attempt handled only the single-line form and
returned 0 names for `github-repos.ts` and `github-student-repos.ts`; the canary
caught it, the zero was my instrument, not the tree), sliced the file at each
`export async function`, and counted the guarded bodies that call one of those
names:

```
node <scratchpad>/patprobe2.mjs      # exit 0; reads only, mutates nothing
CANARY A (must be non-zero): PAT names imported by github-repos.ts -> 40
CANARY B (must be zero, same instrument): PAT names imported by src/lib/access.ts -> 0
```

| Rank-1 file | guarded actions | calling a PAT name in their own body | share |
|---|---|---|---|
| `github-repos.ts` | 37 | 37 | 100% |
| `github.ts` | 26 | 24 | 92% |
| `github-content.ts` | 5 | 5 | 100% |
| `github-student-repos.ts` | 3 | 3 | 100% |
| `submission-repo.ts` | 1 | 1 | 100% |
| `visualizer-coverage.ts` | 1 | 1 | 100% |
| `visualizer.ts` | 3 | 2 | 67% |
| `repo-grades.ts` | 2 | 1 | 50% |
| `live-class.ts` | 4 | 1 | 25% |
| **total** | **82** | **75** | **91%** |

The guarded actions that do NOT call a PAT name, named so the implementer starts
from a list rather than a search: `listGithubModelsAction`, `copilotChatAction`
(`github.ts`); `extractDeckConceptsAction` (`visualizer.ts`);
`listCourseAssignmentsAction` (`repo-grades.ts`); `transcribeLiveAudioAction`,
`answerLiveQuestionAction`, `buildLiveSessionContextAction` (`live-class.ts`).

The guarded-action total of 82 equals the Rank-1 alias-call total of 82 from a
completely different slicing, which is the cross-check that the body slicing is
sound.

**What this measurement is and is not.** It is one grep short of R2-r1's
requirement: it proves the action's own body names a function the PAT module
exports, which is a direct, function-level reference, not a module-load artifact.
It does NOT prove that function spends the token on every path, and it does not
discharge the per-action review. It is a PRIOR, and it is the strongest one
available without opening 254 bodies.

### Rank 2a - a direct edge to a `@/lib/grade*` or `@/lib/canvas*` module, or to a Rank-1 sibling action module (13 files, 97 sites)

```
grep -cE 'from "@/lib/(grade|canvas)' <each>
grep -oE 'from "\./(github|github-repos|github-content|github-student-repos|live-class|repo-grades|submission-repo|visualizer|visualizer-coverage|canvas-inbox|grading|course-hub-core|syllabus-templates)"' <each>
CANARY (must hit): castletop.ts -> from "./canvas-inbox"   (exit 0)
CANARY (must miss, same shape): ./zz-nope in castletop.ts  -> 0, exit 1
```

`grading.ts`(20, 7 edges), `canvas-inbox.ts`(19, 2), `canvas-modules.ts`(10, 2),
`course-hub-integrations.ts`(10, 2), `llm-tools.ts`(8, 1), `messaging.ts`(8, 1),
`accommodations.ts`(6, 1), `grading-inbox.ts`(6, 2),
`lms-syllabus-buttons.ts`(4, 1 + `./course-hub-core`, `./syllabus-templates`),
`command-interface.ts`(2, 5), `weekly-announcement-drafting.ts`(2, 1),
`castletop.ts`(1, `./canvas-inbox`), `api/lms-export/selection/route.ts`(1, 2).
Sum **97**.

`grading.ts` is first inside Rank 2a and not by edge count alone: it is the one
file in the whole cohort with a traced, function-level path already on record
(`r2-scope.md` section 3: `grading.ts:599` `gradeOneSubmissionAction` ->
`canvasWorkToEntry` -> `extraction.ts:202`/`:210` -> `fetchGradableRepoContent`).

### Rank 2b - neither (19 files, 75 sites)

The remainder. 82 + 97 + 75 = 254 and 9 + 13 + 19 = 41; both reconcile.

**Measured, and it is why Rank 2 is one block rather than a gradient:** no
Group-A file outside the nine has a direct edge at depth 1 OR depth 2. The 18
`src/lib` modules with a direct PAT edge are
`grep -rlE 'from "(@/lib/github|\./github|\.\./github)(\.repos)?";' src/lib --include=*.ts | grep -v "\.test\."`
(18 files; canary: `grade/repo-content.ts` present, exit 0; `lib/access.ts`
absent, exit 1). Only three Group-A files import one of those 18 directly -
`github-repos.ts`, `github.ts`, `repo-grades.ts` - and all three are already
Rank 1. **So every one of the 32 non-Rank-1 files reaches the PAT at depth 3 or
deeper**, and R4's own measurement is the right prior for that shape: 1 real
exposure in 10 candidate sites, measured on `deck-source.ts` (1 of 2) and
`walkthrough-announcement.ts` (0 of 8).

### The ratio I plan against, stated as two numbers rather than one

- Rank 1: **91% restrictive** (measured above, 75 of 82).
- Rank 2: **10% restrictive** (R4's measured ratio on the same shape).

RULING 99 warned against a flat multiplier. A flat multiplier here would have
been wrong by a factor of nine in the head of the cohort.

---

## 3. Pricing basis: every unit derived from `a77f447`, and one rule that changes the total

`git show --numstat a77f447`:

```
73  31  src/app/actions/action-guard-coverage.test.ts
92   0  src/app/actions/deck-source.test.ts      (new file)
10   4  src/app/actions/deck-source.ts
86   0  src/app/actions/github.test.ts           (new file)
10   2  src/app/actions/github.ts
```

271 added + 37 deleted = **308 changed lines**, which is the figure R4's own
commit body reports, so the instrument agrees with the precedent's own account.

### The units

| Unit | Measured value | How it was measured |
|---|---|---|
| Guard identifier swap | **2** changed lines (1 add, 1 delete) | `github.ts` hunk: `-await requireOwner();` / `+await requireAppOwner();` |
| Import line edit, per file | **2** changed lines | `github.ts:12` and `deck-source.ts`, one add + one delete each |
| `GITHUB_NOT_OWNER_ONLY` entry | **2** lines per entry | the landed block is `action-guard-coverage.test.ts:828-847` = 20 lines for 9 entries plus 2 delimiters -> 18 / 9 = exactly 2 |
| `OWNER_ONLY` entry for a restrictive site | **0** | the polarity is inverted: `requireAppOwner()` is the cohort DEFAULT, so a restrictive site needs no list entry. R4 added none. |
| New executing guard test file, fixed cost | **80** lines | `github.test.ts` is 86 lines (`wc -l`), of which the single `it` block is ~6: 16-line header, 12 lines of `vi.mock`, 30 lines of `fakeAppUserRow`/`makeFakeAuthClient`, 11-line `beforeEach` |
| Per-case cost, table-driven | **~2.5** lines | one `[name, () => action(args)]` row plus amortised `it.each` harness |
| Per-case cost, one `it` block each | **~7** lines | R4's own single case is 6 lines plus a blank |

### RULE: no production comment is added at any call site

R4 wrote an 8-line and a 6-line justifying comment above its two swaps. **This
plan forbids that**, and the rule pays for itself three times over, each time
against a measured hazard:

1. **Line shift.** `grep -arnE "github\.ts:[0-9]+" docs/ --include=*.md` finds
   **17 citations across 10 documents** pinned to `src/app/actions/github.ts`
   line numbers (`:126`, `:171`, `:184`, `:193`, `:208`, `:258`, `:555`, `:574-596`,
   `:580`, `:597`, `:602`, `:603`, `:609`, `:661`, `:753`, `:839`, in
   `a12-a13-scope.md`, `a31-scope.md`, `a37-scope.md`, `a37-scope-2.md`,
   `a39-census.md`, `a43-scope.md`, `BACKLOG.md`,
   `github-grading-folder-and-assignment-acceptance-criteria.md`,
   `grading-results-file-viewer-acceptance-criteria.md`,
   `no-submission-and-requirement-checking-acceptance-criteria.md`,
   `org-student-repo-provisioning-acceptance-criteria.md`). Inserting 24 comment
   blocks through that file shifts every one of them. A 1-for-1 identifier
   replacement shifts nothing. **This rule reduces the whole cohort's line-shift
   obligation to zero in `src/`** (section 8).
2. **The 1000-line ceiling on the production files.** Four cohort files are
   within 120 lines of the wall - `grading.ts` 941, `canvas-inbox.ts` 908,
   `github-repos.ts` 881, `github.ts` 880 (`wc -l` and `@(Get-Content).Count`
   agree on all four). `github-repos.ts` with 37 R4-style comments would be
   881 + 37x7 = **1140**, a hard breach of
   `src/file-size-ceiling.structure.test.ts` (`LIMIT = 1000` at `:41`, `lineCount > limit`
   at `:138`, and there is no `ALLOWED_OVERAGE` entry for any of the four -
   `grep -nE '^  "src/' src/file-size-ceiling.structure.test.ts` lists exactly
   four ratchet entries, none of them a cohort production file). With this rule
   all four production files end at their current count.
3. **R4's own hazard 1, verbatim from `a77f447`'s body: "THE TEXT SCANNER ATE ITS
   OWN COMMENT."** `collectActionExports()` slices an action's whole source
   including comments, so a comment naming the call the site USED to make leaves
   the action reading as if it still makes it. No production comment, no hazard.

Where does the justification live instead? For a permissive site, in its
`GITHUB_NOT_OWNER_ONLY` reason string, which the instrument already requires to
exceed 10 characters (`action-guard-coverage.test.ts:888`). For a restrictive
site, in the header of its executing test file, which is not scanned by
`collectActionExports()`.

### The formula

> predicted changed lines = 2N + 2F + 2*Perm + 80g + 2.5*Own

where N = sites, F = production files, Perm/Own = permissive/restrictive sites,
g = new executing test files created. **Target is <= 240, not <= 300**: the model
has exactly one calibration point, and that point under-predicted itself by 18%
(308 realised against a 260 stated threshold). A 240 target absorbs a 25% model
error and still clears RULING 99's cap.

**The 80-line fixed cost per new test file dominates every small file** and is
therefore the one lever worth naming: a single SHARED guard test file across the
small Rank-1 modules would pay 80 once instead of eight times, saving about
**640 lines** and collapsing Rank 1 from six sub-waves to about four. I plan on
per-file test files, because that is the landed idiom (`a77f447` created two) and
because one file importing nine `"use server"` action modules loads nine sets of
module-level side effects, so one module's mock needs can red every case. **The
choice is the test seat's, not mine** - section 10 records it as a decision with
its measured saving.

**31 of the 41 files cannot host the executing test in their existing sibling.**
Measured per file with
`grep -q 'vi.mock("@/lib/supabase/auth"' "${f%.ts}.test.ts"`: 31 siblings module-mock
the auth factory, which replaces the guard with a stub so it never runs - the
exact failure R4's commit body says a check caught in an earlier draft. Those
sub-waves create a new `<name>.guard.test.ts`. `github.ts` is the one file whose
sibling already uses the executing idiom (`github.test.ts`, 86 lines, mocks
`@/lib/supabase/server` not the guard), so its cases cost ~15 fixed instead of 80.

---

## 4. The sub-wave table

17 sub-waves. RULING 99 said "roughly 2-4 files each, each at or under ~300
changed lines". **Where the two constraints disagree, the line cap governs and I
say so per row.** Two departures, both forced by measurement:

- **SW1/SW2 split ONE file across two sub-waves.** `github-repos.ts` alone
  prices at 2x37 + 2 + 80 + 37x2.5 = **248.5**, over the 240 target, and the
  file cannot be made smaller. Cutting below the file, by call site, is the only
  cut available. This is legal under RULING 96's shape - the sub-waves cannot run
  concurrently anyway (section 5) - and it is independently gateable, because the
  instrument's check at `:892` is per action and a partially converted file has
  no cross-site invariant.
- **SW16/SW17 exceed 4 files** (6 and 8). They price at 148.5 and 128.5. At
  Rank-2b's measured 10% restrictive ratio the file-count guide is not the
  binding constraint there and enforcing it would buy three extra sub-waves of
  pure overhead.

Column "gateable" answers `seats.md`'s caller rule: does the sub-wave contain
the caller of everything it exports? **Every sub-wave exports nothing.** A guard
identifier swap adds no export, and a new `*.guard.test.ts` is a test file with
no consumers. So the caller rule is satisfied vacuously in all 17, and the
type-only-module exception is not needed anywhere.

| SW | Files (sites) | R / P expected | predicted lines | writes coverage test? | gateable |
|---|---|---|---|---|---|
| 1 | `github-repos.ts` sites 1-19 (19) | 19 / 0 | 167.5 | no | yes |
| 2 | `github-repos.ts` sites 20-37 (18), `submission-repo.ts` (1) | 19 / 0 | 167.5 | no | yes |
| 3 | `github.ts` (26) | 24 / 2 | 133 | yes (+4) | yes |
| 4 | `github-content.ts` (5), `visualizer-coverage.ts` (1) | 6 / 0 | 191 | no | yes |
| 5 | `github-student-repos.ts` (3), `visualizer.ts` (3) | 5 / 1 | 190.5 | yes (+2) | yes |
| 6 | `live-class.ts` (4), `repo-grades.ts` (2) | 2 / 4 | 189 | yes (+8) | yes |
| 7 | `grading.ts` (20) | ~2 / ~18 | 163 | yes (+36) | yes |
| 8 | `canvas-inbox.ts` (19) | ~2 / ~17 | 159 | yes (+34) | yes |
| 9 | `course-hub-integrations.ts` (10), `canvas-modules.ts` (10) | ~2 / ~18 | 165 | yes (+36) | yes |
| 10 | `llm-tools.ts` (8), `messaging.ts` (8), `accommodations.ts` (6) | ~2 / ~20 | 175 | yes (+40) | yes |
| 11 | `grading-inbox.ts` (6), `lms-syllabus-buttons.ts` (4), `command-interface.ts` (2) | ~1 / ~11 | 134.5 | yes (+22) | yes |
| 12 | `weekly-announcement-drafting.ts` (2), `castletop.ts` (1), `api/lms-export/selection/route.ts` (1) | ~0 / ~4 | 22 | yes (+8) | yes |
| 13 | `course-hub-core.ts` (17) | ~2 / ~15 | 151 | yes (+30) | yes |
| 14 | `syllabus-templates.ts` (15) | ~1 / ~14 | 142.5 | yes (+28) | yes |
| 15 | `automation-runs.ts` (7), `course-intel.ts` (7), `messaging-outlook.ts` (7) | ~2 / ~19 | 171 | yes (+38) | yes |
| 16 | `course-calendar.ts` (3), `lms-generation.ts` (3), `lms-generation-refine.ts` (2), `current-events-assignments.ts` (2), `syllabus-upload.ts` (2), `visualizer-selection.ts` (2) | ~1 / ~13 | 148.5 | yes (+26) | yes |
| 17 | `carry-module-pattern.ts` (1), `course-project.ts` (1), `institutions.ts` (1), `selection-chat-context.ts` (1), `api/automations/run-now/route.ts` (1), `api/lms-generation/deck-from-capture/route.ts` (1), `api/lms-generation/deck/route.ts` (1), `api/visualizer/create/route.ts` (1) | ~1 / ~7 | 128.5 | yes (+14) | yes |

Sites: 82 (SW1-6) + 97 (SW7-12) + 75 (SW13-17) = **254**. Files: 9 + 13 + 19 = **41**.
Predicted total across all 17: **~2,600 changed lines**, which at the model's own
demonstrated 18-25% error is 2,100-3,300 - consistent with RULING 99's
"several-thousand-line range" and the reason wave 1 was never one wave.

### Ordering, and what makes each step necessary rather than convenient

**SW1-SW6 before SW7-SW17, on exposure.** The nine Rank-1 files hold 91% of the
cohort's measured direct PAT references and contain the only file in the repo
where a real exposure was ever confirmed (`github.ts`, `a77f447`). If the queue
is interrupted at any point, the sites most likely to be live exposures are
already closed.

**SW1 before SW2** - SW1 creates `github-repos.guard.test.ts` and its harness;
SW2 adds rows to it. Directional, so sequencing is required, not chosen.

**SW7 before SW8-SW12** - `grading.ts` is the only Rank-2 file with a traced
call path on record.

**SW3 anywhere in SW1-SW6** - `github.ts` is the one file whose executing-test
host already exists, so it has no producer/consumer relation to any sibling.
**SW4, SW5 and SW6 are mutually independent**: disjoint production files,
disjoint new test files, and no fact any of them establishes is designed against
by another. Same for SW13 through SW17. They are nonetheless marked MUST NOT RUN
CONCURRENTLY for the single reason in section 5, and if that reason is ever
removed they become genuinely parallelisable and idle sequencing would cost the
queue.

---

## 5. Disjointness, both senses, computed

### Same-path

Every sub-wave from SW3 on writes `src/app/actions/action-guard-coverage.test.ts`
to add `GITHUB_NOT_OWNER_ONLY` entries. Printed, not implied:

```
$ printf '%s\n' src/app/actions/action-guard-coverage.test.ts \
                src/app/actions/action-guard-coverage.test.ts \
  | sort | uniq -d
src/app/actions/action-guard-coverage.test.ts
```

```
$ printf '%s\n' src/app/actions/github-repos.ts src/app/actions/github-repos.guard.test.ts \
                src/app/actions/github-repos.ts src/app/actions/github-repos.guard.test.ts \
  | sort | uniq -d
src/app/actions/github-repos.guard.test.ts
src/app/actions/github-repos.ts
```

Two overlaps, both real:

1. `action-guard-coverage.test.ts` is shared by **15 of 17** sub-waves (all but
   SW1 and SW2, which have zero expected permissive sites and therefore need no
   entry - a property of the inverted polarity, not an accident).
2. `github-repos.ts` and `github-repos.guard.test.ts` are shared by SW1 and SW2.

**RULED SHAPE (RULING 96): the caller rule wins, disjointness is satisfied by
SEQUENCING, and all 17 sub-waves are marked MUST NOT RUN CONCURRENTLY.** No pair
of them may be dispatched in the same window, including pairs that share no path
at all, because a concurrent sibling that touches the coverage test would
silently lose entries and the loss surfaces as a green gate.

Two further shared resources no file list shows, from
`parallel-disjointness.md` section 5, restated because they bind here: `npx tsc
--noEmit` has exactly one caller and it is the wave gate; and no two sub-waves
may sabotage-verify on this tree at once. Both are automatically satisfied by the
no-concurrency marking.

### Informational

The facts each sub-wave must assume, and who establishes them:

| Fact assumed | Established by | Verdict |
|---|---|---|
| `GITHUB_FILES` already contains all 41 files | wave 0, landed | **checked safe.** `comm -23 <41 files, APP_DIR-relative, sorted> <GITHUB_FILES entries, sorted>` -> empty; the reverse `comm -13` -> `actions/deck-source.ts`, `actions/media-likeness.ts`, `actions/walkthrough-announcement.ts`, which are R4's three known additions. Both directions exercised, so the empty side is a measurement, not a silent filter. |
| `requireAppOwner()` is the cohort default; a restrictive site needs no list entry | wave 0's polarity block, landed | checked safe; `a77f447` added zero `OWNER_ONLY` entries for its restrictive swap. |
| Line 828-847 of `action-guard-coverage.test.ts` is where a permissive entry goes | wave 0, landed | **COUPLED to the pending extraction (see below).** |
| `github-repos.guard.test.ts` exists with a working harness | SW1 | directional; SW2 is sequenced after SW1 and must RE-DERIVE its budget from the file SW1 actually wrote, not from this document's estimate - if the test seat chooses one `it` per action instead of a table, SW2's predicted 167.5 is wrong by ~80. |
| `GITHUB_FILES` membership is unchanged by the swap | every sub-wave | checked safe. The live-closure test at `:925` recomputes membership on every run and asserts the delta equals `GITHUB_FILES_PENDING_ENUMERATION`. A guard identifier swap changes no import specifier except `@/lib/supabase/auth`, which is not a GitHub edge, so membership cannot move. |

**The one real informational coupling is the extraction.** Every sub-wave from
SW7 on designs against "the permissive exception list lives in
`action-guard-coverage.test.ts`". The extraction changes that fact. Under
`parallel-disjointness.md` section 3 that is the "one measures something the
other's design depends on" case, and its stated resolutions are sequence, merge,
or extract the shared contract first. **The third applies: the extraction runs
ALONE, before SW7, and hands SW7-SW17 its output as a fixed input.** Section 6 is
that request.

---

## 6. The 1000-line breach, stated precisely, as a ruling request

**Measured now:** `src/app/actions/action-guard-coverage.test.ts` is **955**
lines by both instruments (`wc -l` -> 955; `@(Get-Content
src\app\actions\action-guard-coverage.test.ts).Count` -> 955). The gate is
`src/file-size-ceiling.structure.test.ts`: `LIMIT = 1000` at `:41`, the
comparison is `lineCount > limit` at `:138`, so 1000 passes and 1001 fails, and
`grep -nE '^  "src/' src/file-size-ceiling.structure.test.ts` shows the four
`ALLOWED_OVERAGE` entries - **none of them this file**. Headroom is therefore
exactly **45 lines = 22 permissive entries at the measured 2 lines each**.

Running total, at 2 lines per permissive entry and **zero** provenance comment
lines (the reason string carries provenance; a comment budget is the thing that
would move this forecast):

| after | entries added | file lines | headroom |
|---|---|---|---|
| SW1 | 0 | 955 | 45 |
| SW2 | 0 | 955 | 45 |
| SW3 | 2 | 959 | 41 |
| SW4 | 0 | 959 | 41 |
| SW5 | 1 | 961 | 39 |
| SW6 | 4 | 969 | 31 |
| **SW7 (grading.ts, ~18 entries)** | **16th entry takes it to 1001** | **BREACH** | - |

> **RULING REQUESTED, and this is the whole of it.**
>
> **`src/app/actions/action-guard-coverage.test.ts` crosses 1000 lines inside
> SW7, at the 16th permissive entry SW7 adds, taking the file to 1001. Rank 1
> (SW1-SW6) fits with 31 lines to spare. The full Rank-2 demand is 157 permissive
> entries = 314 lines, which would carry the file to 1283, so the extraction must
> free at least 283 lines.**
>
> **The latest safe point to rule is before SW7 is dispatched. The safest is
> before SW1**, because the 31-line Rank-1 margin assumes zero comment lines
> added to that file across six sub-waves; 31 lines of unbudgeted comment across
> six sub-waves is entirely plausible, and if it happens the breach moves into
> SW5 or SW6.
>
> I am not planning the extraction, per RULING 99. What the decision needs, and
> nothing more: which lines leave the file, and whether the leaving block keeps
> the `collectActionExports()` / `githubReachingActionFiles()` helpers or imports
> them - the cohort block at `:702-955` is 254 lines and calls both, and both are
> defined above it in the same file at `:123` and `:177`.

### A second ceiling hazard, with its own owner

**`lms-generation.test.ts` and `lms-generation-refine.test.ts` are at ZERO
headroom.** `ALLOWED_OVERAGE` pins them at `maxLines: 1124` and `maxLines: 1069`
(`src/file-size-ceiling.structure.test.ts:76-83`), and their measured counts are
**exactly** 1124 and 1069 (`@(Get-Content).Count`, both agreeing with `wc -l`).
The ratchet allows shrinking and fails on any growth. Both module-mock
`@/lib/supabase/auth`, so both are in SW16's coupled-test floor.
**SW16 must not add a single line to either file**; its executing test goes in a
new `*.guard.test.ts`. This is a brief requirement, not a residual, because it is
checkable at SW16's own gate by the ceiling test.

---

## 7. Per sub-wave: what is RED before, GREEN after, and the gate

### The finding this section rests on: the landed instrument is GREEN on the unmigrated state

`BARE_REQUIRE_USER_CALL` is `/\brequireUser\s*\(/`
(`action-guard-coverage.test.ts:76`) and the cohort check at `:892` fires only
when an action's body matches it and the action is absent from
`GITHUB_NOT_OWNER_ONLY`. **`requireOwner(` does not match `requireUser(`**, so
all 254 sites are invisible to it today and the suite is green. Nothing goes red
merely because the alias is still there.

So "red before, green after" has exactly two available shapes, and every
sub-wave must record which one it observed:

- **RESTRICTIVE swap - a real behavioural red.** `requireOwner()` admits an
  active non-owner; `requireAppOwner()` refuses with `OWNER_ONLY_MESSAGE`. An
  executing test that mocks the CLIENT (`@/lib/supabase/server` plus
  `@/lib/supabase/app-users`) and calls the real guard - the landed idiom at
  `src/lib/supabase/auth.test.ts:432-444`, followed by `github.test.ts` - is RED
  against the alias and GREEN after the swap. This is the only red in the plan
  that measures a behaviour change.
- **PERMISSIVE swap - a manufactured red, and it is the only one available.**
  `requireOwner()` and `requireUser()` are behaviourally identical today
  (`auth.ts:451-453` is `return requireUser();`), so no executing test can
  discriminate them and one that tried would be green before and after. The red
  comes from the instrument: land the `requireUser()` swap WITHOUT its
  `GITHUB_NOT_OWNER_ONLY` entry, observe `:892` red naming
  `<file>:<line> <action>`, then add the entry and observe green. **A sub-wave
  that adds the entry in the same edit as the swap has proven nothing and must
  redo it.**

**A wording correction the implementer needs.** `r2-scope.md`'s R2-r1 asks for
"a per-action executing test ... for every action moved off owner-only". Under
the inverted polarity "moved off owner-only" reads as the PERMISSIVE direction,
which is exactly the direction where an executing test is a tautology. The
correct reading, and the one `a77f447` implemented, is the RESTRICTIVE direction.
I state the requirement; the instruments are the test seat's, per my brief.

**No sub-wave may leave the suite failing.** Each ends with its own `:892`
violations list empty, its executing cases green, and the ceiling test green.

### The gate, per sub-wave

Two or more paths always go through the wrapper, never a raw multi-path
`vitest`/`npm test`, because the raw form silently drops any argument it does not
match while exiting 0. The wrapper's pre-check refuses with exit 1 and runs
nothing if any argument is absent, so **no sub-wave's command names a file a
later sub-wave creates.** Verified to exist right now, exit 0 on each:
`src/lib/canvas-client-boundary.runtime-graph.test.ts` (151),
`src/file-size-ceiling.structure.test.ts` (151), `src/lib/no-emojis.test.ts`
(313), `src/source-bytes.structure.test.ts` (126),
`src/lib/supabase/auth.test.ts` (643), `src/app/actions/action-guard-coverage.test.ts`
(955), `src/app/actions/github.test.ts` (86). Canary on the same loop:
`src/app/actions/github-repos.guard.test.ts` reports MISS, which is correct - SW1
creates it, and naming it in SW1's own gate is legal only after SW1 has written
it.

**The spine, in every sub-wave without exception:**

```
npm run test:paths -- \
  src/lib/canvas-client-boundary.runtime-graph.test.ts \
  src/file-size-ceiling.structure.test.ts \
  src/lib/no-emojis.test.ts \
  src/source-bytes.structure.test.ts \
  src/lib/supabase/auth.test.ts \
  <this sub-wave's own new *.guard.test.ts, after it is written> \
  <src/app/actions/action-guard-coverage.test.ts, if this sub-wave writes it> \
  <this sub-wave's DERIVED coupled test files>
npx tsc --noEmit --incremental false          # no file arguments; exactly one caller
npm run lint
git status --short                            # against the write set, in the MAIN checkout
```

The client-boundary guard is in every one because this cohort edits imports and
the build was restored twice today after that guard broke. Pass for the wrapper
is exit 0 with a `COVERED` line for **every** argument; a single `NOT COVERED`
fails the gate. Pass for `tsc` is **no output at all** and exit 0; any output is
a failure. Pass for the build-compile check, where a sub-wave wants it, is the
`Compiled successfully` line and not the exit code.

**Lint pass condition, and it does not pin a number.** Exit 0, and **no NEW
warning naming a file in this sub-wave's write set**, measured against
`npm run lint` run immediately before the sub-wave's first edit on the same tree.
Do not pin an absolute count: `this-repo.md:26` records that one command gave 4,
7 and 8 on the same day, and a gate quoting a literal fails before any code
exists, with the likely recovery being an implementer "fixing" warnings outside
its write set.

**The derived coupled-test tail is derived at each sub-wave's start, never
inherited from this document** (R2-r9). The command, per production file:

```
grep -rl "requireOwner" src/ --include=*.test.ts | xargs grep -l "<basename>"
```

pruned by the rule `r2-scope.md` section 7 already states: **a test belongs to
this sub-wave only if it mocks `@/lib/supabase/auth` AND its module-under-test is
one of this sub-wave's own production files.** The floor is demonstrably noisy at
this scale - `r2-scope.md` records it matching `castletop.ts` against
`course-calendar.test.ts` on a bare substring - and the danger the pruning guards
against is the inverse of running an extra test: a sub-wave reaching into a
later sub-wave's auth factory because a basename matched.

An enumeration I can give as a floor, measured by
`test -f "${f%.ts}.test.ts"` per file: **10 of the 41** have no sibling test at all
(`accommodations.ts`, `canvas-inbox.ts`, `command-interface.ts`,
`course-hub-core.ts`, `course-intel.ts`, `github-content.ts`, `github-repos.ts`,
`grading-inbox.ts`, `grading.ts`, `llm-tools.ts`, `messaging-outlook.ts`,
`messaging.ts`, `repo-grades.ts`, `api/lms-export/selection/route.ts` - 14 by that
command, of which four are route files). For those the `*.guard.test.ts` the
sub-wave creates IS the sibling, and the derived tail is whatever the grep finds
elsewhere in the tree. **This is a floor and not the set**; SW7's implementer in
particular should expect `grading.ts` coupling outside `src/app/actions/`.

**One further gate step, because RULING 99 names it.** `git status --short` is
run in the MAIN checkout and compared path by path against the write set. A
stale `.claude/worktrees` copy is returned FIRST by `Glob`, so an implementer can
edit the copy, pass every gate, and change nothing real. No sub-wave may run
`git add -A`, `git stash`, or `git checkout --` on a path it did not write; every
sub-wave stages explicit paths.

---

## 8. Line-shift obligations this plan creates

**In `src/`: none, by construction.** The no-production-comment rule of section 3
makes every production edit a 1-for-1 identifier replacement plus a same-length
import line, so no line number in any of the 41 files moves and none of the 17
`github.ts` citations in 10 documents needs re-pinning. **That reduction IS the
rule's main justification, and if a later ruling reinstates production comments
the obligation comes back at 17 citations for `github.ts` alone**, plus whatever
`grep -arnE "<basename>\.ts:[0-9]+" docs/` finds for the other 40 files - which I
did not enumerate, and which becomes owed the moment the rule is relaxed.

**In `action-guard-coverage.test.ts`: one citation, owned by SW3.**
`grep -arnoE "action-guard-coverage\.test\.ts:[0-9]+(-[0-9]+)?" docs/ --include=*.md`
returns 20 distinct citations. Nineteen are at or below `:700` and are unaffected,
because every insertion this plan makes goes into the `GITHUB_NOT_OWNER_ONLY`
object at `:828-847`. **One is above it: `docs/r4-check.md:350` cites
`action-guard-coverage.test.ts:852-859`.** Delta: +4 lines after SW3 (2 entries),
cumulatively +14 after SW6 and +314 after SW17.

- **Owner: SW3's implementer** re-pins `docs/r4-check.md:350` once, to the line
  the text actually lands on after SW3's insertion. It is one citation in one
  document and it is discharged at SW3's own push.
- **Owner: each later sub-wave that writes the coverage test** re-checks that
  same citation rather than assuming SW3 fixed it forever - the delta grows with
  every sub-wave. Instrument:
  `grep -arn "action-guard-coverage.test.ts:8" docs/ --include=*.md` plus
  `sed -n '<cited line>p'` on the file, at the sub-wave's own gate.

**And if the extraction of section 6 lands, it invalidates its own citation set.**
The extraction moves the cohort block out of the file entirely, so
`docs/r4-check.md:350` and `docs/r4-scope.md:668` (`:679-700`) must be re-pinned
by whoever performs the extraction, not by SW3. That obligation belongs to the
extraction, and naming it here is the point: it is the kind of debt that is found
later rather than priced.

---

## 9. Residual register

Owner, instrument, direction of failure, step - all four, or it is a deletion and
says so.

| # | Object | Owner | Instrument | Direction of failure | Step |
|---|---|---|---|---|---|
| SW-r1 | The 91% figure is a PRIOR from a body-text scan, not a verified call path. 75 of 82 Rank-1 actions name a PAT-module function; none is a discharged RULING 84 classification. | each Rank-1 sub-wave's implementer | Open the function body; confirm the named call is on a path the action actually takes, not behind an unreachable branch | FAILS RESTRICTIVE if an action is swapped to `requireAppOwner()` on the strength of a name it never calls at runtime; FAILS PERMISSIVE if one of the 7 no-name actions reaches the PAT through a helper | Before each swap, per action, in SW1-SW6 |
| SW-r2 | The 10% Rank-2 restrictive ratio is R4's measurement on two files, transplanted onto 32 | SW7's implementer | Report SW7's OWN realised R/P split at its push, and SW8-SW17 re-price against it | FAILS as a mis-sized sub-wave: a true ratio of 40% turns SW10's 175 into ~330 and breaches the cap | SW7's push reports the realised ratio; SW8 re-prices before dispatch |
| SW-r3 | The 80-line-per-test-file cost, and whether a shared guard test file is used instead | test-notes seat | `wc -l` on the first `*.guard.test.ts` SW1 actually writes, against the 80-line prediction | FAILS by ~640 lines across Rank 1 in one direction, or by a cross-module mock collision in the other | SW1's gate; if the realised fixed cost exceeds 110, SW2/SW4/SW5/SW6 are re-grouped before dispatch |
| SW-r4 | Seven of the 41 files have a guard count that does not equal their top-level `export async function` count (`grading.ts` 20 vs 19, `messaging.ts` 8 vs 7, `messaging-outlook.ts` 7 vs 6, `github.ts` 26 vs 28, `carry-module-pattern.ts` 1 vs 2, `course-project.ts` 1 vs 2, `run-now/route.ts` 1 vs 2) | each owning sub-wave's implementer | Count guarded actions by reading, not by `grep -c "^export async function"`; cross-check against `collectActionExports()`'s own output | FAILS SILENTLY: a guard inside a non-top-level export is invisible to the instrument at `:892`, so a missed site stays on the alias with every gate green | At each sub-wave's start, for its own files |
| SW-r5 | `action-guard-coverage.test.ts` breaches 1000 inside SW7 | repo owner (the extraction is a ruling, per RULING 99) | `@(Get-Content src\app\actions\action-guard-coverage.test.ts).Count` at every sub-wave gate, against `LIMIT = 1000` | FAILS LOUD at `src/file-size-ceiling.structure.test.ts`, which is in every sub-wave's gate spine, so it cannot ship silently | Ruled before SW7; measured at every gate from SW1 |
| SW-r6 | 6 Route Handlers are invisible to `collectActionExports()` (`r2-scope.md` R2-r5); 5 of them are in this cohort - SW12's `api/lms-export/selection/route.ts` and SW17's four | SW12's implementer for the first, SW17's for the rest | None exists. `collectActionExports()` gates on `"use server"`, which a route file does not carry, so a permissive route swap gets NO `:892` red and NO entry requirement | FAILS PERMISSIVE and INVISIBLY: a route reclassified wrongly passes every gate in this plan | SW12 must either extend the collector to a second pass over `route.ts` files or add a source-text test naming the 5 paths, BEFORE swapping any route guard. If it does neither, SW12 and SW17's route sites are unverified and must be reported as such. |
| SW-r7 | No authorization DECISION is exercisable in this checkout - no `.env`, network blocked, no component rendered | repo owner | A real signed-in session; `r2-scope.md` section 6's five owner checks | FAILS IN BOTH DIRECTIONS, invisible to every gate here | Owner-verification, after each sub-wave's push |
| SW-r8 | `docs/r4-check.md:350` cites `action-guard-coverage.test.ts:852-859`, above every insertion point | SW3's implementer, then each later coverage-test writer | `grep -arn "action-guard-coverage.test.ts:8" docs/ --include=*.md` plus `sed -n '<line>p'` on the cited file | FAILS as a stale citation in a document nobody touched - the exact class this repo has nine recorded instances of | SW3's push; re-checked at each later sub-wave that writes the file |

**One candidate residual is a DELETION, and I am calling it that rather than
filing it.** "Confirm that the closure's 41-file membership is still correct
after each sub-wave" has an owner and a step but **no instrument I can honestly
name** beyond the live-closure test at `:925`, which already runs in every gate
and already fails on any membership change. A residual whose instrument is a test
that already runs is not a residual; it is the gate. Filing it would be
bookkeeping that looks like coverage.

---

## 10. What must come to you

Three items. Each is worded so that every possible answer ends this activity -
the plan then ships as it stands with the answer applied, and anything the answer
does not touch becomes a residual above rather than a new round.

**Q1 - THE EXTRACTION, and it is the only blocking one.**
`action-guard-coverage.test.ts` is at 955 of 1000 and crosses 1000 inside SW7 at
its 16th permissive entry (section 6). Rank 1 fits with 31 lines to spare;
Rank 2 needs 314. **Do you want (a) the extraction ruled and performed as its
own step before SW7, which is where the arithmetic puts the wall; (b) the
extraction ruled and performed before SW1, which costs one step now and removes a
31-line margin I cannot guarantee across six sub-waves; or (c) SW1-SW6 dispatched
now with the extraction ruled during them, accepting that the margin holds only
if no sub-wave writes a comment line into that file?** Any of the three is
buildable from this document unchanged. My recommendation is **(c)**: it starts
the highest-exposure work immediately, and the cost of being wrong is one
sub-wave going red at a gate that is in every spine, which is a loud, cheap,
recoverable failure rather than a silent one.

**Q2 - THE NO-PRODUCTION-COMMENT RULE.** I forbade production comments at call
sites, which departs from the landed precedent (`a77f447` wrote 8- and 6-line
comments above its two swaps). It buys zero line shift across `src/` (17
citations in 10 documents for `github.ts` alone), keeps four files at 941/908/881/880
off the 1000 wall, and sidesteps R4's own measured "text scanner ate its own
comment" hazard. **Do you want the rule as written, or the precedent's comments
kept?** If the comments are kept, this plan still ships, with two changes it
already prices: SW1/SW2 re-split (`github-repos.ts` goes to 1140 lines with
R4-style comments and must land in three sub-waves, not two), and the 17-citation
re-pinning obligation becomes owed with an owner named per sub-wave.

**Q3 - THE TEST-FILE SHAPE, which is the test seat's call and needs only your
routing.** The 80-line fixed cost per new `*.guard.test.ts` dominates every small
sub-wave; one shared guard test file across the small Rank-1 modules saves about
640 lines and collapses Rank 1 from six sub-waves to about four, at the risk that
one module's top-level side effects red every case in the shared file. **Do you
want this routed to the test-notes seat as an open choice, or do you want the
per-file form fixed now?** Either way this plan ships: per-file is what the table
in section 4 is priced on, and SW-r3 already carries the re-grouping trigger if
the realised fixed cost differs.

---

## 11. What I could not determine

- **I did not re-run the closure walk.** RULING 99 accepted wave 1's content;
  the 41-file membership is inherited from `r2-scope.md` section 3 and
  independently cross-checked only against the landed `GITHUB_FILES` set (44
  entries, the 41 plus R4's 3, both `comm` directions exercised). My own new
  claims - the 82-site direct-edge tier and the 91% body-reference rate - are
  measured here from scratch.
- **The scope's barrel attribution is not reproducible** at the direct-import
  level (section 0) and I did not establish what the real route is. I dropped it
  as a discriminator rather than repairing it, so the Rank-2 ordering rests on
  the grade/canvas-lib edge count and the one traced `grading.ts` path, not on
  barrel reasoning.
- **I did not open 254 function bodies.** The 91% is a name-reference count, not
  254 discharged classifications; that is SW-r1 and it is what R2-r1 costs.
- **I did not run `npm test`, `npx tsc --noEmit` or `npm run build`.** This
  document writes one file under `docs/` and mutates no production or test file;
  running `tsc` would also have violated its single-caller rule while other work
  may be in flight.
- **The 10% Rank-2 ratio rests on ten call sites in two files.** It is the only
  measurement in existence for that shape and it is SW-r2. If it is wrong upward,
  SW10 is the first sub-wave to breach.
- **No authorization decision was exercised** and no component was rendered. Every
  behavioural claim about `requireOwner`/`requireUser`/`requireAppOwner` here is
  read from source or from the landed executing tests in
  `src/lib/supabase/auth.test.ts`.
- **I did not "fix" working-tree line endings and did not measure CR counts.**
  `core.autocrlf=true` with a pure-LF index is settled, and `grep -c $'\r'` is a
  broken instrument here.

---

## 12. Tree state at hand-off

```
$ git status --short
 M docs/css-orphans.md
(exit 0)
```

`docs/css-orphans.md` was already modified when this seat started and was not
touched by any command here. `docs/backlog.yml` was not read or written. No
scratch directory exists inside the repo - `ls -d scratch scratchpad tmp .scratch`
exits **2** with no output, and the same instrument on `ls -d docs` prints `docs/`
at exit 0, so the absence is measured and not a broken command. The two probe
scripts and the file lists live in the session scratchpad outside the repo.
