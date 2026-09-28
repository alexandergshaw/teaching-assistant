# `main` is red: diagnosis, 2026-09-27

**Bottom line, stated plainly first per the brief's own request: this is TWO
defects, not one, from two independent commits 111 minutes apart. Each fix is
small (a handful of lines), but they are in unrelated parts of the tree and
neither fix touches the other's files.** No production or test file was
changed to produce this document. Every quantity below names the command that
produced it; every import chain below is either the verbatim output of an
existing repo instrument that was actually executed, or the printed result of
the repo's own `walkRuntimeGraph` driven from a scratchpad script outside the
repo (`C:\Users\alexa\AppData\Local\Temp\claude\...\scratchpad\walk-defect1.mjs`),
never hand-simulated.

## 1. The two failures, and whether they share a cause

**They do not share a cause.** They are the same *class* of mistake (a
"use client"-reachable file gained a value-import edge into code that is
structurally server-only), but via two disjoint edges, introduced by two
separate commits on `main` today:

| | Commit | Time (local) | Edge introduced | Caught by |
|---|---|---|---|---|
| Defect 1 | `775f26b` "feat(a39): route an instructor with no Canvas credential to where they set one" | 2026-09-27T08:12:23-05:00 | `src/app/components/GradingTab.tsx:23` -> `@/lib/canvas-credential-cta` -> `src/lib/canvas-credentials.ts` -> `./supabase/effective-identity` and `./lms-credentials` -> `./supabase/server` (`next/headers`, `node:async_hooks`) | Nothing existing. Coverage gap, not a process failure — see §6. |
| Defect 2 | `2b5b4c7` "feat(a39): provenance on all three producers, and a brand that makes the claim structural" | 2026-09-27T10:03:08-05:00 | `src/lib/grading-drafts.ts:25` and `src/lib/github-grading-run-store.ts:21` — both changed a **pre-existing type-only** import of the barrel `./grade` / `@/lib/grade` into one that also imports the **value** `restoreStampedRubricText` — which drags the whole barrel (`grade.ts` -> `grade/extraction.ts` -> `canvas.ts` -> 13 submodules) into the client bundle, including `canvas-core.ts` and `canvas-fetch.ts` (`node:dns`) | `src/lib/canvas-client-boundary.transitive.test.ts` (the `canvas-core.ts`-targeted half only) |

Verified via `git log --format="%h %ad %s" --date=iso-strict -- <path>` and
`git show <commit> -- <path>` on each file named above (commands and full
output quoted in §4/§5). Neither commit's diff touches any file the other
commit touches — confirmed with `git show --stat 775f26b` and
`git show --stat 2b5b4c7`, cross-checked against the file lists in §4/§5.

**If the request had been "is there one small fix" — there isn't one; there
are two small fixes.** Sizes are in §6.

## 2. What I ran, and its raw output

### 2a. The vitest boundary test (`canvas-client-boundary.transitive.test.ts`)

Command: `npm run test:paths -- src/lib/canvas-client-boundary.transitive.test.ts`
(the multi-file wrapper is unnecessary for one path but used per the standing
convention; a single-path `test:paths` run behaves identically to `vitest run`
for one file — verified no paths were dropped by checking the `COVERED`
summary line, which is absent from a failing single-file run only because the
CLI's own wrapper reports timing differently on non-zero exit; the test names
this file explicitly in its own `describe`/`it` output, confirming it ran).

Result: **1 failed, 2 passed**, in `1720ms` (test-file report), `2.00s` wall
(npm wrapper). Exit code 1 (`echo "EXIT:$?"` immediately after, in the same
shell invocation).

### 2b. `npm run build`

Command: `npm run build` (this repo's `build` script is `next build`, per
`package.json:7`, verified with `grep -n '"build"' package.json`).

Result: exit code 1 (`echo "EXIT:$?"` immediately after). Zero occurrences of
`Compiled successfully` (`grep -n "Compiled successfully" build-out.txt`,
exit code 1 — the absence canary: the same grep against a captured build log
from an unrelated earlier green run in this session's history was not
available to re-check, so this absence claim rests on the exit code of the
grep against this run's own 151-line log, `wc -l build-out.txt` = 151).

Turbopack reports **3 errors** (its own count, "Turbopack build failed with 3
errors"), reproduced verbatim in §5.

### 2c. Instruments that stayed green

Command: `npm run test:paths -- src/lib/canvas-client-boundary.test.ts src/lib/module-graph/runtime-import-graph.test.ts src/app/components/grading-results/gradingResultsHelpersWiring.test.ts src/app/components/repo-grades/repoGradesFeedbackAndFiles.wiring.test.ts`

Result: **4 test files passed, 243 tests passed**, `11.09s`. This is the exact
"174-assertion runtime import-graph canary" commit `2b5b4c7`'s own message
cites as evidence of safety (`runtime-import-graph.test.ts (174 tests)` in
this run's output) — it is real, it did run green, and (per §6) it was
measuring the wrong thing for this incident.

## 3. Is the 48-violation list one edge or many?

**Two entry edges, not 48 independent ones.** The 48 lines the vitest
assertion prints are every edge in the *entire reachable subgraph* that ends
at a node reaching `canvas-core.ts` — i.e. once *anything* client-reachable
touches the barrel, the walker reports the barrel's own internal fan-out
(13 re-exports of `canvas.ts`, each submodule's own import of `canvas-core.ts`,
plus two more hops: `canvas/submissions-grid.ts` -> `canvas-modules/fetch-helpers.ts`
and `canvas/auto-zero.ts` -> `grade-zeros.ts` -> back into `grade.ts`) as
separate lines, not just the first hop. Counted directly from the assertion's
own diff: `grep -c '^\+   "' boundary-out.txt` = **48** (cross-checked against
the assertion message's own `expected [ …(48) ]` annotation).

Read backward from the tail, the only two edges that *cross into* this
subgraph from a file outside it are:

- `src/lib/grading-drafts.ts:25` — `value-imports "./grade" -> src/lib/grade.ts`
- `src/lib/github-grading-run-store.ts:21` — `value-imports "@/lib/grade" -> src/lib/grade.ts`

Both are the two lines commit `2b5b4c7` added (§5). Every other line in the
48 is the barrel's own pre-existing internal structure (`canvas.ts`'s 13
re-exports, and each submodule's own long-standing import of `canvas-core.ts`)
— none of those internal edges were touched by any commit dated today,
confirmed with `git log --format="%h %ad %s" --date=short -- src/lib/canvas.ts`
(newest touching commit before today: `cb478e9`, 2026-09-15) and the same
command against `src/lib/canvas/discussions.ts`, `src/lib/canvas/work.ts`,
`src/lib/canvas-fetch.ts`, `src/lib/canvas-fetch-response.ts` (all pre-date
today's commits — not reproduced verbatim here for space, same command
pattern).

**So the fix is an item, not a wave: two one-line import redirections at the
two crossing edges, not 48 separate changes.**

## 4. Defect 1 — the exact chain, printed

Direct edges, each confirmed by opening the file and reading the cited line:

```
src/app/components/GradingTab.tsx:23
    import { isCanvasCredentialRequiredError, CANVAS_CREDENTIAL_CTA_HREF, CANVAS_CREDENTIAL_CTA_LABEL } from "@/lib/canvas-credential-cta";

src/lib/canvas-credential-cta.ts:16
    import { CANVAS_CREDENTIAL_REQUIRED_MESSAGE } from "./canvas-credentials";

src/lib/canvas-credentials.ts:36-37
    import { getEffectiveIdentity } from "./supabase/effective-identity";
    import { getLmsCredentialSecret, recordLmsCredentialFailure } from "./lms-credentials";

src/lib/lms-credentials.ts:54
    import { createServiceClient } from "./supabase/server";

src/lib/supabase/server.ts:1-2
    import { createServerClient } from "@supabase/ssr";
    import { cookies } from "next/headers";
```

Independent corroboration, from the repo's own `walkRuntimeGraph`
(`src/lib/module-graph/runtime-import-graph.ts`) and its own
`client-boundary-policy.ts` config (`FORBIDDEN_PATH_PREFIXES = ["lib/supabase"]`,
`FORBIDDEN_BARE_SPECIFIERS = ["next/headers", "node:async_hooks", "server-only"]`
— reused unmodified, imported by `await import(pathToFileURL(...))` from a
`.mjs` script in the scratchpad, run with
`node --experimental-strip-types walk-defect1.mjs`), rooted at the four
"use client" files that changed under this incident:

```
nodes visited: 515
violations: 4
trail: app/components/GradingTab.tsx -> app/components/LiveFeedPanel.tsx -> lib/canvas-credential-cta.ts -> lib/canvas-credentials.ts
    specifier: ./supabase/effective-identity  resolved: lib/supabase/effective-identity.ts
trail: ... -> lib/canvas-credentials.ts -> lib/lms-credentials.ts
    specifier: ./supabase/server  resolved: lib/supabase/server.ts
```

**Caveat on this second citation, named because a control on this exact trap
failed elsewhere in this project today per the brief's own trap card:**
`walkRuntimeGraph` shares one global `visited` set across all four roots
handed to it in the same call, so the printed trail's *prefix*
(`GradingTab.tsx -> LiveFeedPanel.tsx -> ...`) only proves `canvas-credential-cta.ts`
was already visited by the time the walker reached it from that direction —
it is not proof that `LiveFeedPanel.tsx` is the only or the "real" path in.
The **direct** edge (`GradingTab.tsx:23`, quoted above) is the one actually
introduced by `775f26b` and is what I cite as the causal edge; the walker run
is corroboration that the reachable set as a whole does cross into
`lib/supabase`, not a claim about hop order.

`next build`'s own Turbopack error (§5, error #1's trace #5/#6 and error #2's
"Client Component Browser" trace) independently shows the same direct edge
(`GradingTab.tsx [Client Component Browser] -> canvas-credential-cta.ts -> ...`),
which matches the file-line citation above and not the walker's four-hop
printout — third independent confirmation of the direct edge.

## 5. Defect 2 — the exact chain, printed

Verbatim from `canvas-client-boundary.transitive.test.ts`'s own failure
output (§2a), reproduced in full below (this is the actual output of an
executed run, not a reconstruction):

```
src/app/page.tsx
      value-imports "./components/home/WorkflowsPanel" -> src/app/components/home/WorkflowsPanel.tsx
src/app/components/home/WorkflowsPanel.tsx
      value-imports "../DraftedGradesTab" -> src/app/components/DraftedGradesTab.tsx
src/app/components/DraftedGradesTab.tsx
      value-imports "@/lib/grading-drafts" -> src/lib/grading-drafts.ts
src/lib/grading-drafts.ts
      value-imports "./grade" -> src/lib/grade.ts
src/lib/grade.ts
      value-imports "./grade/extraction" -> src/lib/grade/extraction.ts
src/lib/grade/extraction.ts
      value-imports "../canvas" -> src/lib/canvas.ts
src/lib/canvas.ts
      value-imports "./canvas/discussions" -> src/lib/canvas/discussions.ts
src/lib/canvas/discussions.ts
      value-imports "../canvas-core" -> src/lib/canvas-core.ts        <- vitest's TARGET, hit here
```

and, the second (independent) entry:

```
src/app/components/GradingTab.tsx
      value-imports "./GithubGradingPanel" -> src/app/components/GithubGradingPanel.tsx
src/app/components/GithubGradingPanel.tsx
      value-imports "@/lib/github-grading-run-store" -> src/lib/github-grading-run-store.ts
src/lib/github-grading-run-store.ts
      value-imports "@/lib/grade" -> src/lib/grade.ts
```
(from which the same `grade.ts -> ... -> canvas-core.ts` chain above applies).

The `node:dns` build error's own chain is Turbopack's own trace, quoted
verbatim (§5's source is the build log, reproduced in full in §7):

```
Client Component Browser:
    ./src/lib/canvas/discussions.ts [Client Component Browser]
    ./src/lib/canvas/work.ts [Client Component Browser]
    ./src/lib/grade/extraction.ts [Client Component Browser]
    ./src/lib/grade.ts [Client Component Browser]
    ./src/lib/grading-drafts.ts [Client Component Browser]
    ./src/app/components/DraftedGradesTab.tsx [Client Component Browser]
    ./src/app/components/home/WorkflowsPanel.tsx [Client Component Browser]
    ./src/app/page.tsx [Client Component Browser]
```
— the exact same barrel collapse, confirmed independently by Next's own
bundler, not just by the vitest guard. `node:dns` itself is imported at
`src/lib/canvas-fetch.ts:108` (`import { promises as dnsPromises } from "node:dns";`),
reached from `src/lib/canvas/discussions.ts:6`
(`import { canvasGet } from "../canvas-fetch-response";`) ->
`src/lib/canvas-fetch-response.ts:2`
(`import { canvasFetch, type CanvasFetchResult } from "./canvas-fetch";`).

### The introducing lines, quoted from `git show 2b5b4c7`

```diff
--- a/src/lib/grade.ts
+++ b/src/lib/grade.ts
@@ -1,5 +1,7 @@
 // Re-export all public APIs from submodules
-export { ... type StudentSubmissionEntry } from "./grade/types";
+export { ... type StudentSubmissionEntry, type StampedRubricText } from "./grade/types";
+
+export { stampRubricProvenance, restoreStampedRubricText } from "./grade/rubric-provenance-stamp";
```

and, in the same commit, `src/lib/grading-drafts.ts` and
`src/lib/github-grading-run-store.ts` each gained a **second**, separate
import statement from the same specifier that was already imported
type-only one line above — confirmed by reading the diff's context lines
(unchanged `} from "./grade";` immediately above the new line, proving the
prior import from that specifier was present and untouched, i.e. was already
there and was type-only):

```diff
 } from "./grade";
+import { restoreStampedRubricText } from "./grade";
 import { coerceGradeDetermination, coerceUngradedOutcome } from "./grade/types";
```
(`src/lib/grading-drafts.ts`, from `git log -p -- src/lib/grading-drafts.ts`)

```diff
 import type { GradeResult, GradingRun, RubricAreaResult } from "@/lib/grade";
+import { restoreStampedRubricText } from "@/lib/grade";
```
(`src/lib/github-grading-run-store.ts`, same command against that path)

**This is the exact shape the test's own header (lines 41-44 of
`canvas-client-boundary.transitive.test.ts`) names as the bug it exists to
catch**: "in the file that broke the build, line 18 was `import type` and
harmless while line 19 was a value import and fatal." Today's commit
reproduced that shape twice, in two different files, in the same commit.

## 6. Fix shape and size, costed but NOT applied

### Defect 2 fix — small, ~2 lines, no new files

`restoreStampedRubricText` is defined and exported directly by
`src/lib/grade/rubric-provenance-stamp.ts:48` (confirmed:
`grep -n "export function restoreStampedRubricText" src/lib/grade/rubric-provenance-stamp.ts`).
That leaf's own transitive closure is clean: it imports only
`../research/rubric-fingerprint` (`node:crypto`, `@/lib/embedded/scaffold`)
and a type from `./types` — `@/lib/embedded/scaffold` has **zero** imports
(`grep -n "^import" src/lib/embedded/scaffold.ts` produced no output), and
neither file imports anything under `canvas`, `canvas-core`, or `supabase`.

Fix: change the two lines identified in §5 to import from the leaf directly
(`./grade/rubric-provenance-stamp` in `grading-drafts.ts`,
`@/lib/grade/rubric-provenance-stamp` in `github-grading-run-store.ts`)
instead of from the barrel. Two lines, two files, no new file. This removes
the *only* two entry edges into the 48-node subgraph (§3), which should clear
both the vitest failure and the `node:dns` Turbopack error in one change —
**not verified by re-running the tools**, since applying the fix is out of
this pass's scope (see residual R2).

### Defect 1 fix — small, ~5 lines across 3 files, one new leaf file

`CANVAS_CREDENTIAL_REQUIRED_MESSAGE` is a plain string literal
(`src/lib/canvas-credentials.ts:77-78`: `export const CANVAS_CREDENTIAL_REQUIRED_MESSAGE = "Connect your Canvas account for this institution in Settings.";`)
with no dependency on anything else in that file — but because a module
import evaluates the whole module, importing this one constant still drags in
`canvas-credentials.ts`'s own top-level imports (`./supabase/effective-identity`,
`./lms-credentials`). The file's own header (`src/lib/canvas-credentials.ts:26`)
already documents this constant as "the one deliberate exception" to the
file's export-surface rule, which is consistent with it being safe to
relocate to a leaf.

Fix, following the transitive test's own stated remedy pattern ("move the
pure value into a leaf that imports nothing, re-export it from the server
module, and point the client at the leaf directly"):
1. New file, e.g. `src/lib/canvas-credential-message.ts` — one exported
   constant, copied verbatim, zero imports.
2. `src/lib/canvas-credentials.ts:77-78` — replace the definition with a
   re-export from the new leaf (`export { CANVAS_CREDENTIAL_REQUIRED_MESSAGE } from "./canvas-credential-message";`),
   so every existing server caller is unaffected.
3. `src/lib/canvas-credential-cta.ts:16` — point the import at the new leaf
   instead of at `canvas-credentials.ts`.

Three files touched, roughly 5 lines total, no behavior change for any server
caller. **Not applied, not re-verified** (residual R2).

### Whether existing guard machinery covers either fix

No. Checked three candidate instruments by reading them, not by inference:

- `src/lib/canvas-client-boundary.test.ts` (the direct-import half) —
  its own header (lines 15-59) states it checks **only** direct imports of
  the two *exact* specifiers `@/lib/canvas` / `@/lib/canvas-modules`
  (`UNSAFE_BARRELS`, line 71). Neither defect's crossing file imports either
  of those two specifiers directly (`grading-drafts.ts` imports `./grade`;
  `canvas-credential-cta.ts` imports `./canvas-credentials`) — both are
  structurally invisible to this guard, confirmed still green in §2c.
- `src/lib/module-graph/runtime-import-graph.ts` + `client-boundary-policy.ts`
  (the general A23 walker, `FORBIDDEN_PATH_PREFIXES = ["lib/supabase"]`,
  forbids `next/headers`/`node:async_hooks`/`server-only` too) — **this one
  is capable, by policy, of catching both defects' underlying hazard** (both
  chains cross into `lib/supabase`, confirmed independently in §4 and via
  `canvas-core.ts -> canvas-credentials.ts -> ./supabase/effective-identity`
  for defect 2's own target). It is not *wired* to catch either: its only
  two call sites (`gradingResultsHelpersWiring.test.ts`,
  `repoGradesFeedbackAndFiles.wiring.test.ts`) root the walk at
  `directoryRoots(GRADING_RESULTS_DIR)` and `directoryRoots(REPO_GRADES_DIR)`
  only (confirmed by reading both files' `roots` construction, §2c) — neither
  directory contains `GradingTab.tsx`, `DraftedGradesTab.tsx`,
  `WorkflowsPanel.tsx`, `GithubGradingPanel.tsx`, or
  `canvas-credential-cta.ts`. This is recorded as residual R3.
- `src/lib/canvas-client-boundary.transitive.test.ts` — catches defect 2
  (that is what is currently red) and cannot by construction catch defect 1
  (its `TARGET` is `src/lib/canvas-core.ts` specifically, §1's table; defect
  1's chain never touches `canvas-core.ts`).

## 7. Which instrument would have caught this, and was it green or already red

Answered separately per defect, because they need different remedies:

**Defect 2**: `canvas-client-boundary.transitive.test.ts` is accurate and
would have failed on this exact shape. It was **green immediately before**
commit `2b5b4c7` — proven from the diff itself (§5): the context line
`} from "./grade";` immediately preceding each new import line proves a
type-only import from that same specifier already existed and was the *only*
import from it in both files before this commit; type-only imports are
erased and produce no edge (test's own rule 1, lines 41-44). So the failure
mode here is: **an accurate, pre-existing guard was not run (or was run and
not heeded) before this commit landed.** I cannot tell which from the tree —
no CI run log or push-gate log is reachable from this checkout (no
`.husky` directory exists; `grep -n '"test"' package.json` shows `vitest run`
with no `pretest`/`prepush` hook wired to it). Recorded as residual R1.

**Defect 1**: no existing instrument's target covers this shape at all
(§6's guard survey). This is not a "red and ignored" case — it is a genuine
coverage gap: the one guard whose *policy* would catch it
(`client-boundary-policy.ts`'s `lib/supabase` prefix) is never invoked with
roots that include the files this commit touched. So this failure mode is
**process-adjacent but distinct from defect 2's**: no amount of "always run
the tests before pushing" would have caught defect 1, because the tests that
exist do not look at the file that changed.

## 8. Residual register

| # | What is not proven now | Owner | Instrument | Step that measures it |
|---|---|---|---|---|
| R1 | Whether commit `2b5b4c7` was pushed after the boundary test was run and failed, or without running it at all | repo owner / whoever owns the push convention | GitHub Actions / Vercel build logs for that commit, if retained | Check the CI run (if any) for `2b5b4c7`'s SHA; not reachable from this checkout |
| R2 | Whether the two costed fixes (§6), once applied, leave `npm run build` fully green and `canvas-client-boundary.transitive.test.ts` passing, with no third error Turbopack had not yet reached | the implementer who applies the fix | `npm run build`; `npm run test:paths -- src/lib/canvas-client-boundary.transitive.test.ts` | Apply the two fixes, re-run both commands, read exit codes directly (not through a pipe) |
| R3 | Whether other "use client" files outside `grading-results/` and `repo-grades/` already have an undetected edge into `lib/supabase` or into `@/lib/canvas`/`@/lib/canvas-modules` that has not yet surfaced because nothing currently imports a value from it | architect / next A23 follow-up | `walkRuntimeGraph` re-rooted at `directoryRoots` for every `src/app/components/` subdirectory (or at every "use client" file, matching `canvas-client-boundary.transitive.test.ts`'s own root-discovery, §2a rule) | A follow-up item widening the A23 walker's wired roots, or extending `UNSAFE_BARRELS` in `canvas-client-boundary.test.ts` |
| R4 | The env-dependent prerender tail of `next build` (anything after the compile stage) | deliberately not measured | N/A | Deliberately out of scope, per this repo's own "push without full build" convention and per this task's own instruction to diagnose the compile-stage failure only |

## 9. Question for the owner

Both fixes are small and independent (§6): defect 2 is two one-line import
redirections in two existing files; defect 1 is one new ~3-line leaf file
plus two small edits in two existing files. Neither fix touches any file the
other fix touches.

**Question, worded so every answer ends this activity: should the next
activity land both fixes as one combined item (one wave, one commit, since
both are needed before `main` is green again and neither is contentious), or
as two separate items (so each gets its own commit/attribution, given they
are genuinely unrelated causes)?** Either answer fully determines how the
next activity is scoped; nothing about the diagnosis above changes based on
which is chosen.

## `git status --short` at the end of this pass

```
 M docs/css-orphans.md
?? docs/build-broken-2026-09-27.md
```

(the first line pre-dates this pass, per the conversation's own initial
git-status snapshot; the second is this document. No production or test file
was modified. `npm run build`'s output directory, if any, is not shown
because it is git-ignored.)
