# R2 scope: reclassifying the `requireOwner()` call sites (revision 2, 2026-09-27)

**THIS IS A REVISION**, not a fresh restructuring. It responds to
`docs/r2-check.md` (committed `99ac771`), the check over the restructured scope
committed at `347f535`. Per the owner's "Two rounds, then ask" rule
(`AGENTS.md`), **this is the one revision available** for this artifact; the
prior round was the restructuring itself (`347f535`) checked once
(`99ac771`, verdict NOT BUILDABLE). If this revision leaves anything
unsettled, it goes to the owner rather than a third round on this document.

Seat: `loop-seat`. Consumer: the wave-plan / implementer chain for backlog row
`R2` (`docs/BACKLOG.md`, the row beginning `| requireOwner() call-site
authorization | R2 |`). **Citation corrected (M1):** `grep -a -n "| R2 |"
docs/BACKLOG.md` -> line **136**, exit 0. The prior draft's own command,
`grep -a -n "^| R2 " docs/BACKLOG.md`, cannot match this row - the row's own
text begins `| requireOwner() call-site authorization | R2 |`, not `| R2 `, so
that anchored pattern was guaranteed to return nothing (and did: exit 1,
verified again this pass). `sed -n '136p' docs/BACKLOG.md` reproduces the row
in full; `sed -n '135p'` (the prior draft's second, uncorroborating citation)
reads the N13a grading row, a different item. Re-confirmed against
`git show 347f535:docs/BACKLOG.md`: `grep -a -n "| R2 |"` on that snapshot also
returns line 136, so the row has not moved between the prior draft's commit and
today - the citation was wrong from the start, not stale.

**Commit-drift claim corrected (M2).** `git log --oneline d0b46dd..HEAD | wc -l`
-> **73** today (measured at revision time; this number moves as sibling
sessions land work in this repo - it was 68 when the check measured it a short
time earlier, and 67 at the prior draft's own commit `347f535`). "62" was
unreachable under any measurement and is withdrawn without a substitute
headline count - counting the whole-repo commit distance is not this row's
question. The row's real question - **did any of R2's own subject files
change** - is answered by running the drift command over the complete 81-file
list, not the ~15-path, placeholder-carrying version the prior draft printed:

```
FILES=$(cat files81.txt | tr '\n' ' ')   # all 81 grep -rlE "await requireOwner\(\)" files, generated below
git log --oneline d0b46dd..HEAD -- src/lib/supabase/auth.ts \
  src/app/actions/action-guard-coverage.test.ts src/lib/github.repos.ts \
  src/lib/canvas-credentials.ts src/app/actions/cron-heartbeat.ts \
  src/app/actions/course-hub-integrations.ts $FILES
-> 2b5b4c7 feat(a39): provenance on all three producers, ...
```

One commit, re-confirmed this pass exactly as the check found it.
`git show --stat 2b5b4c7` touches `src/app/actions/grading.ts` - the file at
the center of the closure finding below. The claim "no production or test file
in R2's scope was touched" is **false** and is not restated; the corrected
claim is "one commit touched one Group-A file, and it is priced into this
revision's own re-derivation, not assumed away."

Everything below not marked otherwise was re-measured in this checkout on
2026-09-27, in this revision pass; every quantity names the command that
produced it; every citation was opened this pass, including the ones the check
found un-opened.

---

## 0. Disposition of the prior scope document (`d0b46dd` -> `347f535`), corrected

The check's B4/B5 audited this table against `git show d0b46dd:docs/r2-scope.md`
and found it FAILS BACKWARD (8 requirements with no row) and asserts KEPT
VERBATIM for three things not actually carried. Both are fixed below by
re-opening the prior document (`git show d0b46dd:docs/r2-scope.md`) directly,
not by trusting the check's paraphrase.

| # | Prior requirement / finding | Prior source | Disposition |
|---|---|---|---|
| 1 | `requireOwner()` is `return requireUser()` at `auth.ts:451-453` | prior section 1 | **KEPT**, re-opened today - unchanged |
| 2 | Total invocations 411 / 408 prod / 3 test / 81 prod files | prior section 2 | **KEPT**, re-run today (section 2 numbers unchanged) |
| 3 | All-mentions figure 530 | prior section 2 | **KEPT** |
| 4 | `requireAppOwner()`: 20 prod calls, 4 prod files (23 incl. tests) | prior section 2 | **KEPT** |
| 5 | `requireUser()`: 47 -> 53 calls, 12 -> 14 files (drift, confirmed real) | prior section 2 | **KEPT as drift**, unaffected by anything in this revision |
| 6 | Group A (GitHub-reaching) narrow filter: 9 files, 83 calls | prior section 3 | **WITHDRAWN as the membership test (Ruling 80, section 3 below).** The narrow `@/lib/github` specifier filter is REPLACED by a transitive-closure walk over the import graph. The 9 files are **kept as a verified subset** of the corrected 41-file Group A - see section 3 |
| 7 | Group B (Canvas-reaching) narrow filter: 27 files, 160 calls | prior section 3 | **WITHDRAWN as the membership test**, same reason. 18 of the 27 move into the corrected Group A (they also close over GitHub); 9 remain Canvas-only. See section 3 |
| 8 | Group C (remainder): 45 files, 165 calls | prior section 3 | **WITHDRAWN as the membership test**, same reason. Corrected Group C is 31 files / 91 calls - see section 3 |
| 9 | The two role-reading sites in `course-hub-integrations.ts` | prior section 3 | **KEPT, re-opened, reasoning unaffected** - but the FILE now sits in the corrected Group A (it closure-reaches GitHub via `canvas.ts -> canvas/listings.ts -> canvas/auto-zero.ts -> grade-zeros.ts -> grade.ts -> grade/extraction.ts -> grade/repo-content.ts -> github.ts -> github.repos.ts`), so its OTHER actions now need the Group-A per-action review this file did not need under the narrow filter |
| 10 | `resolveCanvasCredential` predicate, containment at the credential | prior section 1, 3 | **KEPT**, re-opened, unchanged |
| 11 | `githubToken()` reached from 6 call expressions in 5 files | prior section 0 | **KEPT**, re-opened at the same 6 `file:line`s |
| 12 | Instrument `action-guard-coverage.test.ts`: 647 lines, `PINNED_UNGUARDED`=28, `OWNER_ONLY`=19, `MEDIA_OWNER_ONLY_ACTIONS`=14 | prior section 4 | **KEPT**, re-measured (m4 fixed: `@(Get-Content).Count` actually run this pass, -> 647, agrees with `wc -l`) |
| 13 | 6 Route Handlers invisible to the instrument | prior section 4 | **KEPT** |
| 14 | `taskCellAttachments.wiring.test.ts:414-417` / `course-task-attachments.ts` 3 calls | prior section 2 | **KEPT** |
| 15 | `cron-heartbeat.ts:31` global-read ambiguity | prior section 3, R2-r3 | **KEPT**, re-opened; the file is in corrected Group C (1 call), unaffected by the closure |
| 16 | Test-side census: 79/85/73/13/0 | prior section 2 | **KEPT**, re-run |
| 17 | Wave-0 experiment target (`legibility-probe.ts`) | prior section 5, R2-r6 | **KEPT**, re-verified; file is in corrected Group C, unaffected |
| 18 | Wave plan (0-4) and write sets | prior section 6 | **UPDATED, substantially.** Waves 1-3's write sets are RE-DERIVED under the closure (section 7); wave 0's spec is polarity-corrected (Ruling 83); the wave-0 red-then-green requirement is **RESTORED** (row 19 below), which the checked draft (`347f535`) had dropped |
| 19 | Wave 0 "Lands red-then-green so the instrument is proven before it is trusted" | prior `:584` | **RESTORED VERBATIM (B5.1).** This is the only sentence in wave 0 that proves the new closure block can fail before it ships; it is carried into section 7 below |
| 20 | Residual register R2-r1 through R2-r10 | prior section 8 | **KEPT, RESIZED where the closure changes the object** (R2-r1's object grows from 83 to 255 call sites across 41 files; R2-r2's object shrinks from 53-of-56-sites/10-files to 13-sites/1-file - see section 10). **Instruments restored to real `file:line` reads (B5.2)**: R2-r3 -> `cron-heartbeat.ts:29-36`; R2-r4's fork is retired per Ruling/M6 below and its bookkeeping moves to a backlog row, not a residual with a "Fork 2" instrument |
| 21 | "Test-side census: ... 13 already-migrated ... all reproduced exactly" | prior section 0 | **CORRECTED (B5.3).** The prior kept two different objects apart: **12** already-migrated (a 25-line-window measure) and **13** (a whole-file measure). This document does not collapse them - both figures appear in section 2 with their own instrument, and `course-hub-integrations.test.ts` is named as the file responsible for the gap between them |
| 22 | Fork framing for `cron-heartbeat.ts` and `github-student-repos.ts` | prior R2-r3, R2-r4 | **UPDATED.** Fork 1 (`cron-heartbeat.ts`) is unchanged (section 9). Fork 2 (`github-student-repos.ts`) is **RETIRED**, per M6/the check's own replacement question - see section 9 |
| 23 | "R2 has not been scoped before" | prior section 7 | **WITHDRAWN as a sentence** - unchanged from the checked draft |
| 24 | The alias's own stale quantities withdrawn ("~496 invocations", "~105 files") | prior `:76-79` | **KEPT AS WITHDRAWN**, re-confirmed: `sed -n '288p;438p' src/lib/supabase/auth.ts` still reads "the ~496-invocation deprecated alias" and "the ~105 existing source files" in the tree - the code comment is stale, this document's own count (81 files / 408 calls) is not |
| 25 | **Standing rule: "Do not re-quote either number from that file"** | prior `:79` | **RESTORED.** Dropped from the checked draft (B4 row 1). Restated here: neither "~496" nor "~105" from `auth.ts:288,438` may be quoted as a current count anywhere downstream of this document; the current counts are 408 calls / 81 files, measured in section 2 |
| 26 | "`canvas-core.ts` and `github.repos.ts` have zero guard calls - KEPT but REFRAMED: for Canvas this is BY DESIGN (containment moved to `canvas-credentials.ts`); for GitHub it means no containment at all" | prior `:686` | **RESTORED.** Dropped from the checked draft (B4 row 2). Re-verified today: `grep -c "await requireOwner()" src/lib/canvas-core.ts src/lib/github.repos.ts` -> 0, 0 |
| 27 | "RESOLVED 3 - the split stands, chosen from the shared-secret audit - KEPT" | prior `:687`, `docs/multi-user-login-architecture.md:396-407` | **RESTORED.** Dropped from the checked draft (B4 row 3). This is the architecture decision R2 implements; not re-opened again this pass beyond confirming the citation still resolves |
| 28 | **WITHDRAWAL: "The sweep becomes a straight one-to-one mechanical rename with no per-site judgment at all"** | prior `:689`, `docs/multi-user-login-architecture.md:384-386` | **RESTORED AS A STANDING WITHDRAWAL.** Dropped from the checked draft (B4 row 4) - the single most load-bearing omission the check found. Restated in full: this withdrawal stands; `architecture.md:384-386`'s permissive-sweep authorisation does NOT apply to R2, was withdrawn against the tree by the prior scope, and the closure finding in section 3 below makes it withdrawn more emphatically, not less - a mechanical rename would now mis-sweep 41 files' worth of GitHub-reaching actions, not 9 |
| 29 | **HANDOVER: "the media-file cohort as first wave - already discharged by R3"** | prior `:690` | **RESTORED.** Dropped from the checked draft (B4 row 5). Re-confirmed today: `grep -c "await requireOwner()" src/app/actions/media*.ts` -> 0 for all four media files; `OWNER_ONLY` still carries the 14 media entries |
| 30 | **HANDOVER: "Per-user spend quotas before sign-up opens - not R2's, still owed, R2 must not be read as closing it"** | prior `:691`, `architecture.md:426-431` | **RESTORED VERBATIM.** Dropped from the checked draft (B4 row 6), the most consequential single omission: R2's Group-C rule ("shared LLM key, no owner-private identity behind it -> `requireUser()`") is precisely what makes this handover load-bearing, and this revision ships that rule with the handover now recorded. Per-user spend quotas remain a separate, unclosed obligation |
| 31 | **WITHDRAWAL: "446 invocations"** | prior `:683` | **RESTORED.** Dropped from the checked draft (B4 row 7). The backlog row (`docs/BACKLOG.md:136`) still carries 446 in its note text - that is the backlog's own stale figure, unrelated to and not corrected by this document, which restates the current count (408) rather than editing the backlog (out of this document's write set) |
| 32 | Three instrument facts: "Anything outside `src/app` - `APP_DIR` is `src/app` (`:60`)"; "Any runtime authorization behaviour - every assertion here is source text"; "Self-tests of the checker - `:499-578`" | prior section 4 | **RESTORED, with the second corrected in the SAME direction the check demands (Ruling 81/B2).** The prior said "every assertion here is source text" - true, and the checked draft (`347f535`) asserted its negation ("EXECUTING the guard-name check"). That negation is retracted, not carried forward. All three facts are restated in section 5 below with re-verified citations |

**Nothing else is silently dropped.** The 22 rows the checked draft carried are
unchanged in substance except rows 6-8 (withdrawn as membership tests, per
Ruling 80) and row 18/22 (resized/updated per the ruling set). Rows 24-32 are
restorations; none of them changes a call site's disposition on its own - they
restate standing rules and handovers the closure work below depends on.

---

## 1. The three functions, read from source (unchanged from the checked draft)

| Function | Definition | What it actually checks | What it throws |
|---|---|---|---|
| `requireUser()` | `src/lib/supabase/auth.ts:328-366` | Impersonated identity must be BOTH `status === "active"` AND `role === "owner"` (`:331`); otherwise `resolveSessionAccess()` then `canUseApp(decision)` (`:338`), AAL2 step-up (`:357`), reconciles the caller's row (`:358`) | `throwForDecision(decision)` (`:347`), or the impersonation-branch message (`:332`) |
| `requireAppOwner()` | `src/lib/supabase/auth.ts:408-434` | Same impersonation precondition (`:411`); `isOwnerDecision(decision)` (`:418`) - decision must be literally `owner`; AAL2 (`:426`) | `throwForDecision(decision)` (`:419`); an `active` non-owner gets `OWNER_ONLY_MESSAGE` |
| `requireOwner()` | `src/lib/supabase/auth.ts:451-453` | **Nothing of its own** - the body is `return requireUser();` (`:452`) | Whatever `requireUser()` throws |

`canUseApp` is `decision === "active" || decision === "owner"`
(`src/lib/access.ts:194-196`). `isOwnerDecision` is `decision === "owner"`
(`src/lib/access.ts:199-201`). The gap between the two guards is exactly the
`active` decision: an approved, non-owner account.

**What `requireAppOwner()` actually checks, established rather than inferred:**
an identity is `owner` only via `resolveAccess`, and the break-glass allowlist
path additionally requires `input.emailVerified` (`src/lib/access.ts:168-170`),
supplied as `Boolean(user?.email_confirmed_at)` (`src/lib/supabase/auth.ts:182`).
**Consequence for R2, unchanged: no call site needs its own `isOwnerEmail`
check, and none should grow one.**

**What this does NOT settle, and is answered elsewhere in this revision (M4
fix, section 6):** whether a real Supabase session can reach
`requireAppOwner()` with `email_confirmed_at` set but an `app_users` row
`suspended`. The checked draft routed this to owner-verification as
unanswerable; it is not - see section 6.

---

## 2. The call-site census (unchanged from the checked draft; re-verified)

```
grep -roE "await requireOwner\(\)" src/ | wc -l                          -> 411
grep -rnE "await requireOwner\(\)" src/ | grep -v "\.test\." | wc -l     -> 408
grep -rnE "await requireOwner\(\)" src/ | grep -c "\.test\."             ->   3
grep -rlE "await requireOwner\(\)" src/ | grep -v "\.test\." | wc -l     ->  81
grep -roE "requireOwner\(\)" src/ | wc -l                                -> 530
```

Neighbouring guards: `requireUser()` 53 calls / 14 files; `requireAppOwner()`
20 calls / 4 files (both re-run this pass, unchanged from the checked draft).

**Test-side census, with the two objects the check (B5.3) found collapsed kept
apart:**

```
grep -rl "requireOwner" src/ --include=*.test.ts | wc -l                              -> 79
grep -rl 'vi.mock("@/lib/supabase/auth"' src/ --include=*.test.ts | wc -l              -> 85
... | xargs grep -l "requireOwner" | wc -l                                             -> 73
... | xargs grep -lE "requireUser|requireAppOwner" | wc -l                             -> 13  (WHOLE-FILE measure)
```

**13** is the whole-file measure: any test file that mocks the auth factory and
mentions `requireUser` or `requireAppOwner` anywhere in the file, including a
comment. The prior document's own, narrower **12** was a 25-line-window measure
("already migrated" meaning the factory itself, not just a comment, names the
new guard). The gap between 12 and 13 is exactly one file:
`src/app/actions/course-hub-integrations.test.ts` - its factory at `:23-24`
names `requireOwner` alone (so it fails the 25-line-window test) while its only
`requireUser` mention is comment prose at `:6` (so it passes the whole-file
test). Both figures are kept, each with its own instrument; neither is quoted
as if it were the other.

---

## 3. RULING 80 applied: cohort membership by transitive closure, not by specifier string

### The rule, and why the prior filter failed

The classifying question is unchanged: **is the call-site guard the only thing
containing an owner-private resource on this path?** What changes is HOW
membership in "reaches GitHub" or "reaches Canvas" is decided. The checked
draft's filter - grep every `requireOwner()` production file for an import
specifier starting `@/lib/github` or matching `canvas` case-insensitively -
missed `src/lib/grade/repo-content.ts:19`'s RELATIVE import
(`from "../github"`), which the check (B1) traced end to end to two guarded
actions in `grading.ts` (20 guard calls, assigned to Group B by the narrow
filter) reaching the owner's PAT with no downstream containment. **Per Ruling
80, that filter is retired as the membership test.** Membership is now decided
by a transitive closure over the import graph.

### The instrument: reused, not reinvented

`src/lib/module-graph/runtime-import-graph.ts` (299 lines, `wc -l`) already
implements exactly this: `scanRuntimeEdges` parses with the real TypeScript
compiler (`ts.createSourceFile`, not a text pattern) and enumerates import
declarations, export-from (barrel) declarations, import-equals/require, and the
call forms of dynamic `import()`/`require()` - the four kinds Ruling 80 asks
for (relative specifiers, `@/` aliases, barrel re-exports, dynamic import all
fall out of this enumeration, not a separate case). `walkRuntimeGraph`
(`:217-286`) does the closure: given root files and a `forbiddenPathPrefixes`
list, it follows every edge, records a `violation` the moment it resolves into
a forbidden path, and does not walk past it. This tool exists for a different
purpose today (`docs/a23-architecture.md` - proving client-bundle code cannot
reach server-only modules) but the walk itself is exactly "can file X reach
module Y transitively," which is this row's question with a different target.
**Found by reading `src/lib/module-graph/` before writing anything, per the
ruling's own instruction; no new walker was written.**

**The script, published inline so it can be re-run without a scratchpad**
(the tool's own `WalkOptions` shape, called once per root file):

```ts
// node --experimental-strip-types <this file>
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
const REPO_ROOT = "<repo root>";
const SRC_ROOT = join(REPO_ROOT, "src");
const { walkRuntimeGraph } = await import(
  pathToFileURL(join(SRC_ROOT, "lib/module-graph/runtime-import-graph.ts")).href
);
const files81 = readFileSync("files81.txt", "utf8").split("\n").filter(Boolean);
// files81.txt: grep -rlE "await requireOwner\(\)" src/ | grep -v "\.test\." | sort
for (const relFile of files81) {
  const result = walkRuntimeGraph([join(REPO_ROOT, relFile)], {
    srcRoot: SRC_ROOT,
    forbiddenPathPrefixes: ["lib/github.repos.ts"], // or ["lib/canvas-credentials.ts"]
    browserSafeModules: [],
    forbiddenBareSpecifiers: [],
    allowedBareSpecifiers: [],
    allowedAssetExtensions: [],
    treatUseServerAsWall: false, // walking FORWARD from an action, not from a client entry point
  });
  console.log(relFile, result.violations.length > 0 ? "REACHES" : "clear");
}
```

`treatUseServerAsWall: false` is deliberate: the tool's "use server" wall exists
for the OTHER direction (stopping a client-bundle walk at the RPC boundary);
here the walk starts FROM a server action and must be allowed to follow its own
"use server" file's edges, not be walled off at the root.

### Canaries, run before trusting any absence (Ruling 80's own requirement)

Per-target canary against a file already proven to reach it:

```
target lib/github.repos.ts,     root src/lib/grade/repo-content.ts       -> 17 violations (non-zero)
target lib/canvas-credentials.ts, root src/app/actions/canvas-inbox.ts   -> 1 violation  (non-zero)
```

Both fire. The absence claims below (40 GitHub-clear files, 34 Canvas-clear
files) are measured against a filter proven capable of finding something
present, not merely run and trusted.

### GitHub closure, run over all 81 files: 41 files, 255 calls (was 9 / 83)

```
REACHES lib/github.repos.ts: 41 files (of 81)
```

`src/app/actions/accommodations.ts`(6), `automation-runs.ts`(7),
`canvas-inbox.ts`(19), `canvas-modules.ts`(10), `carry-module-pattern.ts`(1),
`castletop.ts`(1), `command-interface.ts`(2), `course-calendar.ts`(3),
`course-hub-core.ts`(17), `course-hub-integrations.ts`(10),
`course-intel.ts`(7), `course-project.ts`(1),
`current-events-assignments.ts`(2), `github-content.ts`(5),
`github-repos.ts`(37), `github-student-repos.ts`(3), `github.ts`(27),
`grading-inbox.ts`(6), `grading.ts`(20), `institutions.ts`(1),
`live-class.ts`(4), `llm-tools.ts`(8), `lms-generation-refine.ts`(2),
`lms-generation.ts`(3), `lms-syllabus-buttons.ts`(4),
`messaging-outlook.ts`(7), `messaging.ts`(8), `repo-grades.ts`(2),
`selection-chat-context.ts`(1), `submission-repo.ts`(1),
`syllabus-templates.ts`(15), `syllabus-upload.ts`(2),
`visualizer-coverage.ts`(1), `visualizer-selection.ts`(2), `visualizer.ts`(3),
`weekly-announcement-drafting.ts`(2), and the 5 Route Handlers
`api/automations/run-now/route.ts`(1), `api/lms-export/selection/route.ts`(1),
`api/lms-generation/deck-from-capture/route.ts`(1),
`api/lms-generation/deck/route.ts`(1), `api/visualizer/create/route.ts`(1).
Sum: `grep -c "await requireOwner()" <the 41 files> | awk -F: '{s+=$2} END {print s}'`
-> **255**.

The original 9 (`github-repos.ts`, `github.ts`, `github-content.ts`,
`live-class.ts`, `github-student-repos.ts`, `visualizer.ts`, `repo-grades.ts`,
`submission-repo.ts`, `visualizer-coverage.ts`) are a **verified subset** of
these 41 - the closure did not lose anything the narrow filter found, only add
to it.

**Confirmed by direct call-level trace, not closure alone (re-verifying the
check's B1, not just trusting its citation):** `grading.ts:599`
`gradeOneSubmissionAction` calls `requireOwner()` at `:607`, then
`canvasWorkToEntry(work)` at `:621`, which reaches `extraction.ts:202`
(`if (looksLikeGithubUrl(work.submissionUrl))`) and `:210`
(`await fetchGradableRepoContent(work.submissionUrl)`) - a real, function-level
call chain, opened directly this pass, not merely a closure hit.

### Attributing the fan-out: how much is a barrel artifact, and how much is direct

Re-running the walk with `src/app/actions.ts` ALSO forbidden (so the walk stops
at the barrel instead of following it) separates the 32 net-new files into two
groups:

- **9 files reach GitHub ONLY through the barrel**: `automation-runs.ts`,
  `command-interface.ts`, `course-calendar.ts`, `course-hub-core.ts`,
  `course-intel.ts`, `course-project.ts`, `institutions.ts`,
  `messaging-outlook.ts`, `syllabus-upload.ts`. Every one of these imports
  something from `src/app/actions.ts` (a 77-line barrel, `wc -l`, doing
  `export * from "./actions/<name>"` for ~40 action files including
  `accommodations.ts`) for an UNRELATED reason - traced concretely for one:
  `castletop.ts` (see below) is a false positive of a different, non-barrel
  kind, but the barrel-only 9 are real in the sense that JS module evaluation
  is eager (importing ANY binding from a barrel loads the barrel's ENTIRE
  static import graph), yet none of it proves these 9 files' OWN exported
  actions call anything GitHub-reaching.
- **23 files reach GitHub via a route that does NOT pass through the barrel**:
  the remaining net-new files, plus the 9 original ones. Several of these are
  real and substantive on inspection, not barrel artifacts - e.g.
  `castletop.ts` directly imports `listAssignmentBriefsByUrlAction` from
  `./canvas-inbox` (`castletop.ts:9`, a genuine sibling-action import), and
  `canvas-inbox.ts` itself closure-reaches GitHub via
  `canvas.ts -> canvas/listings.ts -> canvas/auto-zero.ts -> grade-zeros.ts ->
  grade.ts -> grade/extraction.ts -> grade/repo-content.ts -> github.ts ->
  github.repos.ts` (the automatic-zero-grading pipeline reads a submission's
  linked GitHub repo). Whether `castletop.ts`'s own action actually calls
  anything in that chain (as opposed to merely loading a module that also
  contains it) is exactly the per-action question below, not settled by this
  closure alone.

**The honest limit, stated plainly rather than smoothed over: this is a
FILE-level (module-load) closure, not a call graph.** The tool proves "this
file's module graph contains code that spends the credential if evaluated." It
does NOT prove "this file's own exported action calls that code" - that
requires reading the function body, which is exactly residual R2-r1 below,
now resized to the corrected cohort. This is not a shortcut being taken here;
it is what the only closure tool in this repo can prove, and the gap is filled
by the SAME per-action review the checked draft already required for the
original 9 files - just for 41, not 9.

### The cost of NOT softening this, named (Ruling 80's own requirement)

If every `requireOwner()` call in all 41 closure-reaching files were
mechanically swept to `requireAppOwner()` - the literal, un-per-action reading
of "the file reaches GitHub, therefore owner-only" - the cost is real and is
named here rather than hidden: it would lock every approved, non-owner account
out of **course calendar management, course hub core CRUD, course-intel Q&A,
institutions management, regular (non-Outlook) and Outlook messaging, LMS deck
generation and its two API routes, syllabus upload and templates, live-class
features, the visualizer and its API route, weekly announcement drafting,
grading-inbox, and the command interface** - most of the app's day-to-day
surface, for a capability (spending the owner's GitHub PAT) that only a small
minority of actions in each of those files actually touch. **This revision
does not do that.** It also does not widen the rule silently to avoid that
cost. It keeps the ALREADY-EXISTING design the checked draft had for the
original 9 files - "Group A is `requireAppOwner()`, PER ACTION, inside a
closure block that starts empty and is populated by opening each function
body" - and applies it, unchanged in kind, to the corrected 41-file cohort.
Sizing that: R2-r1's object grows from 83 call sites in 9 files to **255 call
sites in 41 files** (section 10). That is the number this revision reports
rather than softens.

### Canvas closure, run over all 81 files: 47 files, and its security meaning

`REACHES lib/canvas-credentials.ts: 47 files (of 81)` (canary: `canvas-inbox.ts`
-> 1 violation, non-zero). Unlike GitHub, Canvas has a downstream containment
that does not depend on which guard sits above it: `resolveCanvasCredential`
(`src/lib/canvas-credentials.ts:189-228`) checks the CALLING identity's own
stored row first (`:192-195`) and only reaches the owner's env pair under
`identity.role === "owner"` (`:220`). **So the Canvas closure growing from 27
to 47 files does not, by itself, force any reclassification** - the
containment argument holds regardless of which files reach the module, because
it is enforced AT the credential, not at the guard. What it DOES require: the
"does any site read `.role` off the guard result to bypass that containment"
audit (section 2's `.role` count, m2) must cover the full 47, not the narrow
27. Re-run: `grep -rn "\.role" <the 47 files, non-test>` still returns exactly
the same 2 hits (`course-hub-integrations.ts:170`,`:214`) found against the
narrower 27 - the closure adds files, not new `.role` sites.

### The corrected, disjoint partition (priority: GitHub first, then Canvas-only, then remainder)

| Group | Rule | Files | Calls | Command |
|---|---|---|---|---|
| A | Closure-reaches `lib/github.repos.ts` -> per-action review, default `requireAppOwner()` (Ruling 83) | **41** | **255** | walk above, forbidden = `lib/github.repos.ts` |
| B | Closure-reaches `lib/canvas-credentials.ts` and NOT in A -> `requireUser()`, containment at the credential | **9** | **62** | Canvas walk, minus A |
| C | Neither closure -> `requireUser()`, per-user-scoped or shared-key reasoning unchanged | **31** | **91** | `81 - |A| - |B|`, verified by direct listing |

Arithmetic check: 41+9+31 = 81 files; 255+62+91 = 408 calls. Both totals match
section 2's census exactly - the corrected partition is exhaustive and
disjoint, not merely additive.

**Group B (9 files, unchanged Canvas-only reasoning):** `canvas-accessibility.ts`(14),
`canvas-cartridge.ts`(1), `canvas-discussions.ts`(1), `canvas-files-bulk.ts`(34),
`canvas-migrations.ts`(3), `module-template.ts`(1), `rubric-bulk.ts`(3),
`scheduled-releases.ts`(4), `api/accessibility/route.ts`(1). These are exactly
the 9 of the checked draft's original 27 that do NOT also reach GitHub - the
other 18 (including `canvas-inbox.ts` and `grading.ts`, the two largest) moved
into Group A.

**Group C (31 files, unchanged remainder reasoning), listed since the checked
draft only gave this group by arithmetic:** `announcement-image.ts`(1),
`artifact-templates.ts`(4), `case-study-plan.ts`(1),
`case-study-research.ts`(1), `chat-style.ts`(1),
`course-planning-grounding.ts`(1), `course-planning-lecture.ts`(2),
`course-planning.ts`(2), `course-task-attachments.ts`(3), `course-tasks.ts`(6),
`cron-heartbeat.ts`(1), `current-events.ts`(1), `discussion-replies.ts`(3),
`grading-submission-extract.ts`(1), `grading-submission-grade.ts`(1),
`institution-page-attachments.ts`(4), `knowledge-base.ts`(7),
`knowledge-overview.ts`(5), `learning-resource-links.ts`(1),
`lecture-plans.ts`(2), `legibility-probe.ts`(1), `materials-extract.ts`(1),
`message-replies.ts`(2), `messaging-scheduling.ts`(4),
`module-content-extract.ts`(1), `research.ts`(17), `syllabus-adapt.ts`(4),
`task-institution-instructions.ts`(3), `textbook-research.ts`(2),
`visualization-concepts-generator.ts`(1), `workflow-support.ts`(7).

### What is genuinely mechanical, restated for the corrected partition

Once a FILE's group is decided (A/B/C above), the guard identifier for an
action NOT flagged by per-action review is mechanical, except the 2 sites that
read `.role` (unchanged, both in Group A now). **The non-mechanical part grew
with the closure**: 255 Group-A call sites (was 83) need per-action review
before any of them may land on `requireUser()`, because Group A is exactly
where the check found the live exposure and where "mechanical" would recreate
it at 3x the scale.

---

## 4. What the call sites actually protect, by corrected surface

| Surface | Group A (GitHub, 41 files / 255 calls) | Group B (Canvas-only, 9 / 62) | Group C (remainder, 31 / 91) |
|---|---|---|---|
| Server actions | An unauthorised `active` account whose action reaches the GitHub-spending chain can create/delete repos, read/write repo content, manage collaborators, read PR/commit data - against the OWNER's PAT, with no downstream containment. **Which specific actions in the 32 net-new files actually reach it is undecided - that is the per-action review, not this table** | Contained at `resolveCanvasCredential` regardless of guard choice; worst case is the caller's own `CANVAS_CREDENTIAL_REQUIRED_MESSAGE` | Reaches only rows scoped to the caller's own `user_id`, their own Microsoft/Google credential, or a shared LLM key with no owner-private identity behind it |
| Route Handlers (5 of the 6, all in Group A under the closure; the 6th, `lms-export/selection`, is Group A too - see below) | Same as above; invisible to `action-guard-coverage.test.ts` today (R2-r5) | - | `src/app/api/accessibility/route.ts` is Group B |
| Workflow / unattended steps | See section 6's corrected M5 finding - `runAsOwner` does NOT satisfy both guards for a non-owner impersonated identity, contrary to the checked draft | same | same |

**Correction to the checked draft's Route Handler row:** the checked draft
placed `src/app/api/lms-export/selection/route.ts` in "Group B by import, not
A." Under the closure it is Group A (listed in section 3's 41-file table) -
its own import chain reaches `lms-syllabus-buttons.ts`, which reaches the
GitHub-spending chain through the barrel. All 6 Route Handlers remain invisible
to `action-guard-coverage.test.ts` (R2-r5, unchanged); 5 are Group A and 1
(`accessibility`) is Group B.

**The sentence that matters, restated at the corrected scale:** today, any
approved `active`, non-owner account that reaches an action in one of the 41
Group-A files whose body happens to call into the GitHub-spending chain can act
on the owner's GitHub PAT, because `requireOwner()` admits them and nothing
downstream re-checks identity. Confirmed directly for `grading.ts` (section 3);
undetermined for the other 40 files' 235 remaining call sites, and that
determination is this row's real cost.

---

## 5. RULING 81 applied: the instrument is source-text, restated honestly

**Correction, restoring the prior scope's own accurate sentence and retracting
the checked draft's negation of it (B2):** the mechanism that flags a
misclassification today is `checkOwnerOnlyEntry`
(`src/app/actions/action-guard-coverage.test.ts:388-416`) testing
`REQUIRE_APP_OWNER_CALL.test(action.body)` (`:400`),
`BARE_REQUIRE_OWNER_CALL.test(action.body)` (`:403`), and
`BARE_REQUIRE_USER_CALL.test(action.body)` (`:409`), where those constants are
`/\brequireAppOwner\s*\(/`, `/\brequireOwner\s*\(/`, `/\brequireUser\s*\(/`
(`:69-71`) matched against `action.body`, a text slice produced by
`collectActionExports` (`:118-145`). **This is a regex over source text.
Nothing is executed. No guard runs. No Supabase fake is involved.** The checked
draft's "EXECUTING the guard-name check against a body, not a grep for an
identifier" is retracted; it was a verb dressing up a grep. **A source-text
check may remain as a cheap coverage net, but it is labelled coverage here and
is not credited as the thing that catches a misclassification.**

**The repo's real executing idiom, opened this pass (the checked draft cited
this file as an instrument and never opened it):**
`src/lib/supabase/auth.test.ts` mocks the Supabase client and calls the real
guards. `it("throws for an active instructor - active is not enough to be an
owner")` at `:432` asserts
`await expect(requireAppOwner()).rejects.toThrow("limited to the workspace
owner")` at `:444`; `it("authorizes an active owner-role account")` at `:483`
asserts `result.role` equals `"owner"` (`:489-491`). **This is the model for
the executing instrument R2's per-action work actually needs**: a per-action
test that imports the specific Group-A export, mocks `@/lib/supabase/auth`
with `auth.test.ts`'s client-fake pattern configured as an `active` non-owner,
and asserts the action REJECTS - not a source-text regex on the guard name.
This does not replace `checkOwnerOnlyEntry` (still useful as a fast, coarse
coverage net over the whole file) but it is the thing that would actually have
caught a correctly-named guard attached to the wrong resource, which
`checkOwnerOnlyEntry` cannot see by construction.

### RULING 83 applied: the wave-0 block's polarity, fixed

**The checked draft's weakest requirement (m3), confirmed and fixed.** Section
5 item 3 / section 6 row 3, as drafted, specified a Group-A closure block
modelled LINE-FOR-LINE on the media block (`:637-645`), whose loop
AFFIRMATIVELY REQUIRES every action in the named file set NOT on the
owner-only list to call `requireUser(` directly. Applied to Group A, that
default is backwards: the media block defaults to permissive because
permissive is safe for media (a shared, non-owner-private resource); Group A's
resource (the GitHub PAT) is exactly the one place permissive is the harm.
Implemented as specified, wave 0 would land an instrument that PINS the
exposure green and wave 1 would have to fight its own tripwire to close it.

**Fix: the Group-A block is the CONVERSE of the media block.** Default posture
per action in a Group-A file is `requireAppOwner()` (restrictive); an action
may use `requireUser()` only if it appears in an explicit
`GITHUB_NOT_OWNER_ONLY` list, each entry carrying a one-line stated reason (the
mirror image of `MEDIA_OWNER_ONLY_ACTIONS`, which lists the RESTRICTIVE
exceptions inside an otherwise-permissive group). The loop's assertion
direction inverts to match: FAIL if an action in a Group-A file calls
`requireUser(` directly and is NOT in `GITHUB_NOT_OWNER_ONLY`. One line for why
the inverse was wrong, so nobody re-derives it: **the media block's default
protects a shared resource by staying permissive unless told otherwise; the
GitHub block must protect a single-owner secret by staying restrictive unless
told otherwise - copying the shape without inverting the default silently
authorises the exact sweep this row exists to prevent.**

### The three instrument facts, restored (B4 row 32) and re-verified

- **Anything outside `src/app`.** `APP_DIR` is `src/app`
  (`action-guard-coverage.test.ts:60`, re-opened). The instrument cannot see
  `src/lib/**` at all.
- **Any runtime authorization behaviour.** Every assertion in
  `action-guard-coverage.test.ts` is source text (restated above, corrected).
- **Self-tests of the checker**, `:499-578` - proves `checkOwnerOnlyEntry` fails
  for a missing name, a bare `requireUser`, and the `requireOwner` alias, and
  passes for `requireAppOwner`. Re-opened this pass: present at `:499`, `:513`,
  `:537`, `:560`.

### Exactly which lines move, and when

1. `PINNED_UNGUARDED` does not move for a reclassification (`GUARD_CALL`
   matches all three names).
2. `OWNER_ONLY` gains one entry per Group-A action found (by per-action review)
   to reach the GitHub-spending chain.
3. A GITHUB closure block is added, **polarity-inverted from the media block**
   per the fix above - `GITHUB_FILES` (41 entries, not 9),
   `GITHUB_NOT_OWNER_ONLY` (populated by per-action review, starts non-empty
   only for actions PROVEN safe, not empty-by-default), a length pin.
4. `MEDIA_OWNER_ONLY_ACTIONS.length` (`:599`) and the media closure do not
   move - re-confirmed, 0 guard calls in all four media files.

---

## 6. How a wrong answer would be caught, corrected for M4 and M5

`docs/loop/this-repo.md`: no component renders under vitest, network blocked
(measured claim: `ls .env* 2>&1` returns no matches this pass too). **So no
authorization DECISION can be exercised end to end in this checkout** - this
limit is real and unchanged.

### M4 fix: the break-glass-vs-suspended question IS answered here, by an executing test

The checked draft escalated "whether a real Supabase session can reach
`requireAppOwner()` with `email_confirmed_at` set but an `app_users` row
`suspended`" as unverifiable without a live session. It is not.
`src/lib/supabase/auth.test.ts:494`,
`it("authorizes the OWNER_EMAILS break-glass path even with a stale suspended
row")`, calls `requireAppOwner()` at `:503` and asserts `result.role` is
`"owner"`; the paired negative,
`it("BUG 1 FIX: does NOT authorize the OWNER_EMAILS break-glass path for an
unverified email, even with a stale suspended row")`, is at `:508`. **The
answer is yes, by design** - `src/lib/access.ts:118-127`'s own comment states
the intent is not to lock the owner out of their own instance by a stale row -
and it is measured here, today, by an executing test that needs no `.env`. The
checked draft cited `auth.test.ts` as an instrument for exactly this question
and never opened it; this revision opens it and retires the escalation.

### M5 fix: `runAsOwner` impersonation does NOT satisfy both guards for a non-owner identity

The checked draft's section 4/6: "`runAsOwner` impersonation satisfies both
`requireUser` and `requireAppOwner`" and "unattended runs still work
(`runAsOwner` satisfies both guards)." **This is contradicted by an executing
test and by the preamble of the module the containment argument rests on.**
`src/lib/supabase/owner-context.ts:189`:
`const role: AppUserRole = decision === "owner" ? "owner" : (profile?.role ??
"instructor")` - `resolveImpersonationIdentity` returns `role: "instructor"`
for an `active` non-owner, not `"owner"`. `src/lib/supabase/auth.test.ts:406`,
`it("BUG 2 CANARY: a non-owner identity in the impersonation store is refused
by requireUser() too - ... reaches every requireOwner() call site, since
requireOwner() delegates to requireUser()")`, asserts
`await expect(runAsOwner(identity, () => requireUser())).rejects.toThrow("Not
authorized")` for exactly that identity shape. `src/lib/supabase/effective-
identity.ts:55-62`'s own preamble states the consequence in prose: a member's
unattended run gets impersonated with `role !== "owner"`, and the moment its
call tree reaches a `requireUser()`/`requireOwner()` site, "that call throws."

**The conclusion survives, the premise does not.** Both guards apply the SAME
impersonation precondition (`status === "active" && role === "owner"`), so
reclassifying a call site between them does not change whether an unattended
member run is admitted - it was already refused, and stays refused, either
way. The corrected sentence for the owner-verification list (item 5 below) is:
"unattended runs by a MEMBER-scheduled workflow are refused outright by both
guards (unaffected by reclassification); unattended runs by an OWNER-scheduled
workflow are admitted by both guards (also unaffected)." The checked draft's
"satisfies both guards" language is retracted because it reads as "a member's
run gets through," which `auth.test.ts:406` proves false. **Cost of the
original wording**: a verifier who tests only the owner-scheduled case would
see a pass and never observe the member-scheduled case, which was never broken
in the first place under this correction - so the practical risk here is a
verifier being MISLED about what they need to check, not a live gap.

### What CAN be asserted here, by instrument (corrected)

| Claim | Instrument | Direction of failure |
|---|---|---|
| A Group-A action's body calls `requireAppOwner(` and neither other name | `checkOwnerOnlyEntry`, driven from the polarity-corrected `GITHUB_NOT_OWNER_ONLY` exception list | Fails if a non-excepted action uses the alias or a bare `requireUser` (Ruling 83's fixed direction) |
| A Group-A action's body genuinely calls into the GitHub-spending chain | **No instrument exists yet** - this is the executing per-action test modelled on `auth.test.ts` (section 5), to be written per action during the per-action review | Fails if the action rejects an `active` non-owner but the reviewer never checked whether it should |
| `requireUser` admits `active`, `requireAppOwner` refuses it | `auth.test.ts` (existing, executing) | Fails on the thrown message |
| `course-task-attachments.ts` guards every export | `taskCellAttachments.wiring.test.ts:414-417` | Fails on the count |

### What must be OWNER-VERIFIED in a real session (corrected item 5)

1. Member cannot reach a GitHub action that per-action review confirms as
   owner-only (expect `OWNER_ONLY_MESSAGE`).
2. Owner is not locked out of anything.
3. Member still reaches their OWN Canvas; failure is
   `CANVAS_CREDENTIAL_REQUIRED_MESSAGE`, never the owner's data.
4. The two role-reading sites (now inside Group A's file, unaffected in
   reasoning) still branch correctly for member vs owner.
5. **Corrected**: an owner-scheduled unattended run is admitted by both guards
   (unaffected by reclassification); a member-scheduled unattended run is
   refused by both guards outright, before reaching any Group-A action
   (unaffected by reclassification, and NOT the same claim as "satisfies both
   guards").

None of these five is exercisable by an agent in this checkout (residual
R2-r7, unchanged).

---

## 7. Wave plan, re-derived under the corrected partition

**File-set disjointness holds across the three production waves** (partition
the 81 files, section 3). They are NOT concurrency-safe with each other - wave
1 and wave 3 both touch `action-guard-coverage.test.ts`. Run in sequence.

### Wave 0 - the instrument, before any production file moves

Write set: `src/app/actions/action-guard-coverage.test.ts`

Does: add the polarity-corrected Group-A closure block (section 5) -
`GITHUB_FILES` (41 entries), `GITHUB_NOT_OWNER_ONLY` (starts empty; every
Group-A action defaults to owner-only until per-action review proves
otherwise), a length pin on the exception list, not on the owner-only set.
Runs the loud-vs-silent `vi.mock` experiment (R2-r6) on `legibility-probe.ts` /
`.test.ts`, restoring from a `cp` backup, never `git checkout --`.
**Lands red-then-green so the instrument is proven before it is trusted**
(RESTORED, B5.1 - this sentence is the only thing that proves the block can
fail before wave 1 relies on it).

Gate: `npm run test:paths -- src/app/actions/action-guard-coverage.test.ts src/lib/supabase/auth.test.ts`

### Wave 1 - Group A, GitHub: 41 production files, 255 calls

Write set (production): the 41 files listed in section 3.

Write set (coupled tests) - **stated as a FLOOR, not a trusted final list**, per
`traps-spec.md`'s own rule that an enumeration is a floor, never the set, and
per R2-r9 (unchanged residual: substring/basename matching over-includes).
`grep -rl "requireOwner" src/ --include=*.test.ts | xargs grep -l <basename>`
was re-run this pass for all 41 files; the union is large (60+ distinct test
files) and demonstrably noisy at this scale - e.g. it matches
`castletop.ts` against `course-calendar.test.ts` and `syllabus-
upload.preserves-columns.test.ts` on a bare substring hit, which is not
evidence those tests mock anything `castletop.ts`-related. **The rule to prune
this floor down to the true write set (restated from M3, now sized to 41
files instead of 2): a test belongs to wave 1's write set only if it mocks
`@/lib/supabase/auth` AND its module-under-test is one of the 41 Group-A
production files.** Running extra, wrongly-included tests costs nothing (they
already pass and stay passing); the danger this rule guards against is the
inverse - a wave 1 edit reaching into a Group-2/3 file's auth factory because a
basename happened to match. Two files the checked draft's M3 flagged as
misassigned (`visualizer-selection.test.ts`, `src/app/api/visualizer/create/
route.test.ts`) are now CORRECTLY in wave 1's cohort, because their own
production files (`visualizer-selection.ts`, `.../visualizer/create/route.ts`)
are themselves in the corrected Group A - M3's underlying finding is
subsumed by Ruling 80, not separately fixed.

Gate: `npm run test:paths -- <the pruned per-file list, one argument each>`,
then `npx tsc --noEmit --incremental false` (no file arguments), `npm run
lint`, then `grep -rn "requireOwner" src/ --include=*.test.ts` over the whole
tree to confirm every surviving hit belongs to a file this wave did not touch,
then `git status --short` against the write set above.

### Wave 2 - Group B, Canvas-only: 9 production files, 62 calls

Write set (production): `canvas-accessibility.ts`, `canvas-cartridge.ts`,
`canvas-discussions.ts`, `canvas-files-bulk.ts`, `canvas-migrations.ts`,
`module-template.ts`, `rubric-bulk.ts`, `scheduled-releases.ts`,
`api/accessibility/route.ts` (section 3). Coupled tests derived per file at
wave start by the same command, pruned by the same M3/R2-r9 rule
(module-under-test must be one of these 9). Much smaller than wave 1's floor,
so hand-pruning is tractable at this wave's own start rather than in this
document.

### Wave 3 - Group C, remainder: 31 production files, 91 calls

Write set: the 31 files listed in section 3, explicit (the checked draft left
this group to arithmetic; this revision lists it in full so wave 3's
implementer does not have to re-derive the set from a subtraction). Two
additions a directory-scoped list would miss, unchanged from the checked
draft: `taskCellAttachments.wiring.test.ts` (asserts the literal guard name)
and `action-guard-coverage.test.ts` (only if `cron-heartbeat.ts` lands
owner-only per Fork 1).

`cron-heartbeat.ts` is EXCLUDED from this wave until Fork 1 (section 9) is
answered. Leaving it on the alias is the reversible, status-quo choice.

### Wave 4 - delete the alias

Unchanged: reachable only when `grep -rnE "await requireOwner\(\)" src/ | wc
-l` returns 0. Write set: `src/lib/supabase/auth.ts` (delete `:436-453`) plus
any test still naming it.

---

## 8. Leverage

Unchanged from the checked draft, and the check confirmed this section is
correct: per `docs/loop/leverage.md`, a security-authorization chore's honest
leverage answer is **none directly** - reclassifying call sites removes
unauthorized access to capabilities that already exist; it adds none. Not
manufacturing a claim for this row.

---

## 9. Forks - Fork 1 unchanged, Fork 2 RETIRED per M6

**Fork 1 - `cron-heartbeat.ts:31`, unchanged (the check found this one
terminating as written, "one line, no change needed").** Produces
`requireUser()` or `requireAppOwner()`; recommendation `requireAppOwner()`
(deployment state, not course data; REL1 says no members today, so the
restrictive direction costs nothing and is reversible). Either answer ships in
wave 3 (or excludes it, per section 7) with no further round.

**Fork 2 - RETIRED.** The checked draft's Fork 2 (`github-student-repos.ts`)
was found NOT terminating (M6): its `requireUser()` branch silently overrode
the rule's only security derivation for a Group-A file with no exposure
statement, and it contradicted its own neighbouring residual about when the
default ships. The check replaced it with a question that IS terminating (see
below) and instructed this revision not to re-pose it. **Disposition applied
here**: `github-student-repos.ts` ships **owner-only either way** - it is one
of the original 9 files (now inside the corrected 41), and its 3 calls are
already counted in Group A's 255. The remaining bookkeeping - whether to
revisit it when multi-instructor access is built - is **not carried as a
residual in this document** (the check's own ruling: "a backlog row, not a
residual," since a residual register in this document has already been found
to silently drop entries twice - B4, B5). It is recorded here as an obligation
this document HANDS OVER to the orchestrator's own disposal step: **add a
backlog row** ("revisit `github-student-repos.ts`'s guard when multi-instructor
access is built; today it is owner-only with no cost, since REL1 has no
members") at the push that closes this row, naming this document as the
source. This document's own write set is `docs/r2-scope.md` only, so it cannot
add that row itself.

Both forks ride alongside the wave plan (section 7) rather than gating it.

---

## 10. Residual register, resized under the closure

| # | Residual | Owner | Instrument | Object / direction of failure | Step |
|---|---|---|---|---|---|
| R2-r1 | Per-action classification inside the 41 Group-A files is not done - files are classified, actions are not. **RESIZED from 83 sites/9 files to 255 sites/41 files (Ruling 80).** | wave-1 implementer | The polarity-corrected `GITHUB_FILES`/`GITHUB_NOT_OWNER_ONLY` closure block (section 5/7), PLUS a per-action executing test modelled on `auth.test.ts:432-444` (section 5) for every action moved off owner-only | Each `export async function` in the 41 files. FAILS PERMISSIVE if an action reaching the GitHub-spending chain keeps `requireUser()`; FAILS RESTRICTIVE if a non-token action is left on `requireAppOwner()` with no `GITHUB_NOT_OWNER_ONLY` entry and reason | Wave 0 adds the block with the exception list empty; wave 1 populates the exception list per action, each entry requiring an opened function body plus (where feasible) the executing test |
| R2-r2 | **RESIZED, shrunk (Ruling 80 side effect).** Of the checked draft's "56 sites in 10 files," 8 of the 10 files (`canvas-inbox.ts`, `grading.ts`, `course-hub-integrations.ts`, `live-class.ts`, `lms-syllabus-buttons.ts`, `messaging.ts`, `accommodations.ts`, `lms-export/selection/route.ts`) are now inside Group A and covered by R2-r1's stronger per-action process. Only `research.ts` (13 of its 17 `requireOwner()` sites, per the checked draft's own sampling) remains a genuine Group-C discarded-result/service-role read | wave-3 implementer | Read `research.ts`'s 13 listed lines (not yet re-enumerated by `file:line` in either document - carried forward as a gap, not invented here) | The 13 sites in `research.ts`. FAILS if a site reaches data not scoped by the caller's identity and lands on `requireUser()` | Before wave 3 writes `research.ts`, read the 13 lines and record the scoping key for each |
| R2-r3 | `cron-heartbeat.ts:31` ambiguity | repo owner | `src/app/actions/cron-heartbeat.ts:29-36`, read (RESTORED real instrument, B5.2 - not "Fork 1, section 9" as a citation, though the fork is where the owner answers) | Whether cron health is owner-private; fails quietly either way | Owner answers Fork 1; wave 3 excludes the file until then |
| R2-r4 | **RETIRED as a residual (M6/section 9).** `github-student-repos.ts` ships owner-only either way; the multi-instructor revisit is a BACKLOG ROW, not a residual - see section 9 | orchestrator (adds the row at disposal) | n/a - not an instrument-bearing residual by design | n/a | Backlog row added at the push that closes R2, naming this document |
| R2-r5 | 6 Route Handlers carry 1 `await requireOwner()` each, invisible to every instrument here. **5 of the 6 are now Group A** (section 4 correction) | wave-1 (for the 5 Group-A routes) / wave-2 implementer (for `accessibility`) | None exists yet | The 6 route files; reclassify wrongly and every gate stays green | Extend `collectActionExports` to a second pass over `route.ts` without the `"use server"` gate, or add a dedicated source-text test naming the 6 paths - decide in wave 0, build before wave 1 (moved up from "before wave 2," since 5 of the 6 are now wave 1's problem) |
| R2-r6 | "A `vi.mock` factory missing an export fails loudly" is a reading claim, not yet measured | wave-0 implementer | The `legibility-probe.ts` one-file experiment (Group C, unaffected by the closure) | vitest's behaviour on a mocked module missing a named export; fails expensively if silent | Run before wave 1 writes anything; restore via `cp` backup |
| R2-r7 | Nothing in this repo can exercise an authorization DECISION | repo owner | A real signed-in session; the 5 corrected checks in section 6 | The member/owner boundary at runtime; fails in both directions, invisible to any gate here | Run the 5 checks after each wave's push |
| R2-r8 | The alias survives until wave 4; a new call site can be added with every gate green until then | wave-4 implementer | `grep -rnE "await requireOwner\(\)" src/ \| wc -l` -> must be 0 | The alias export `auth.ts:451-453` | Delete the export in wave 4 |
| R2-r9 | Wave test-file lists must be re-derived per file, not trusted from any prior document - **now load-bearing at 41-file scale (section 7), where basename substring matching visibly over-includes** | each wave's implementer | `grep -rl ... \| xargs grep -l <basename>` per production file, PRUNED by "module-under-test must be in this wave's file set" | Each wave's test-file list; fails if a test is left behind or a wrong test is edited | Re-derive and prune at the start of each wave; gate on a whole-tree `grep -rn "requireOwner" src/ --include=*.test.ts` after |
| R2-r10 | Any scratchpad classification script must canary its own count against a plain shell command before being trusted | each wave's implementer | A non-empty-list assertion cross-checked against `grep -rl` | Any re-run of a cohort script; fails silently and permissively | Check the script's printed total against the plain shell command before trusting a re-run |

**Corollary applied (`iteration-caps.md`): a requirement whose enforcer is an
already-landed test cannot be "relocated" to an artifact that does not exist
yet.** R2-r1's per-action executing test (modelled on `auth.test.ts`) does not
exist yet for any of the 255 sites; it stays a stated requirement of wave 1,
not a completed relocation.

---

## 11. What I could not determine (unchanged in kind, resized in one place)

- **No authorization decision was exercised.** No `.env`
  (`ls .env* 2>&1` returns nothing this pass), so `resolveAccess` never ran
  against a real row. Every claim in section 1 is read from source.
- **No component rendered.** Whether a member sees a disabled control or an
  error toast on a denied Group-A action is not knowable here.
- **I did not run `npm test`, `npx tsc --noEmit`, or `npm run build`.** This is
  a scoping artifact that writes one file under `docs/`; the closure script was
  run standalone with `node --experimental-strip-types` against the real
  module-graph module, not through the app's own build.
- **I did not classify the 255 GitHub-closure call sites individually**
  (R2-r1, resized), **did not read `research.ts`'s 13 remaining sites**
  (R2-r2, resized), and **did not run the `vi.mock` missing-export
  experiment** (R2-r6, unchanged). Each is a residual with an owner and a step.
- **I did not verify, by opening every one of the 41 files' function bodies,
  which specific actions call into the GitHub-spending chain versus merely
  loading a module that also contains it.** This is the file-vs-call-graph
  limit stated in section 3, and it is the largest single unresolved item this
  revision produces - it is what R2-r1 now costs.
- **The Supabase RLS posture behind `createServiceClient()` is out of scope and
  unverified.** Unchanged.
- **Whether any commit since `d0b46dd` changed anything outside the specific
  files checked** beyond what the corrected drift command (section 0 preamble)
  covers. The corrected command now covers all 81 subject files plus the six
  named non-action files, and found exactly one touching commit (`2b5b4c7`,
  priced into this revision's own re-derivation via `grading.ts`).

---

## 12. Gates run for this artifact

```
wc -l docs/r2-scope.md                                                -> see report (run after write)
@(Get-Content docs\r2-scope.md).Count                                  -> see report (PowerShell instrument, per m4)
LC_ALL=C grep -c '[^ -~\t]' docs/r2-scope.md                            -> see report (pure-ASCII check)
npm run test:paths -- src/lib/no-emojis.test.ts src/source-bytes.structure.test.ts
git status --short
```

Results are recorded in this seat's handback report, because a file cannot
honestly state its own final line count or its own gate output.

**Method notes.** The closure script in section 3 was run with
`node --experimental-strip-types` against the REAL
`src/lib/module-graph/runtime-import-graph.ts` (imported via a `file://` URL,
not copied or transcribed) from a scratchpad driver script; no production or
test file was mutated by this revision or by the closure measurement. All
`grep`/`wc` exit codes were read directly from the command, never through a
pipe that could mask them. `npm run test:paths --` is named for the one
multi-file check in section 7/0; no raw multi-path `vitest` command appears
anywhere in this document.
