# R4 scope: the two live-exposure files R2's own census could not see

Seat: `loop-seat` (bug scope, security). Consumer: the wave-plan/implementer
chain for backlog row `R4`. Citation: `grep -a -n "| R4 |" docs/BACKLOG.md`
-> line **97**, exit 0; `sed -n '97p' docs/BACKLOG.md` reproduces the row.

**No prior scope exists.** `ls docs/r4-*.md` -> no match ("No such file or
directory"); `git log --oneline -3 -- docs/r4-scope.md` -> empty. This is a
fresh document, not a restructuring, so no disposition table is owed.

Everything below was measured in this checkout on 2026-09-27. Every quantity
names the command that produced it. Every `file:line` was opened directly.

---

## 0. The correction this document makes to the row I filed an hour ago

The R4 row (`docs/BACKLOG.md:97`) states: "Two of them are live exposure:
`src/app/actions/deck-source.ts` (2 sites) and
`src/app/actions/walkthrough-announcement.ts` (8 sites) call the PERMISSIVE
guard `requireUser()` TODAY and closure-reach the owner personal access
token."

**The call-count half is right; the "both are live exposure" half is not.**
Having now traced each of the 10 call sites individually (per RULING 84,
below), only **1 of the 10** - `extractDeckSourceRepoAction`
(`deck-source.ts:57-71`) - has a real, function-level call path to
`githubToken()`. The other 9 - `extractDeckSourceFileAction`
(`deck-source.ts:28-54`) and all 8 of `walkthrough-announcement.ts`'s actions
- do not. `walkthrough-announcement.ts`'s file-level "REACHES" signal is a
**barrel artifact** of `src/lib/canvas.ts` (a pure re-export module), the
exact defect class `docs/r2-scope.md` section 3 already named for 9 of its
own 41 files ("reach GitHub ONLY through the barrel"). Section 2 below is the
measurement; I am not treating my own hour-old wording as established fact,
per this row's own instruction.

---

## 1. `requireOwner()`, read from source (unchanged from R2)

`src/lib/supabase/auth.ts:451-453`:

```
export async function requireOwner(): Promise<AuthorizedUser> {
  return requireUser();
}
```

Literally `return requireUser()` - any active account passes. Re-opened this
pass, unchanged from R2's own section 1.

---

## 2. The ten call sites, traced individually (RULING 84 applied)

**RULING 84, applied as given, not re-argued:** a file-level module closure is
a candidate set, never a classification. ES modules evaluate eagerly, so a
file's import graph *containing* code that spends the GitHub PAT never proves
that file's own exported action *calls* that code. Only a verified call path
makes a site owner-only.

### 2.1 The instrument reused (Ruling 80): `walkRuntimeGraph`, not a new walker

`src/lib/module-graph/runtime-import-graph.ts` (299 lines, `wc -l`) is reused
exactly as R2 wave 0 (`b25ed71`) reused it - no walker was written for this
document. Script run with `node --experimental-strip-types` against the REAL
module (imported via a `file://` URL, not transcribed), from a scratchpad
driver (`.../scratchpad/r4trace.ts`, `.../r4trace2.ts`, `.../r4trace3.ts`; no
production or test file was mutated; the scratchpad directory is outside the
repo and needs no cleanup in-tree - confirmed by `git status --short` below).

**Canary, run before trusting any absence** (per R2's own "canary before
absence" rule): `walkRuntimeGraph` rooted at `src/lib/grade/repo-content.ts`
(a file R2 already proved reaches the token), forbidding `lib/github.repos.ts`
-> **17 violations**. Non-zero; the filter can find something present.

### 2.2 `src/app/actions/deck-source.ts` - 2 sites, 1 real, 1 clean

```
grep -n "await requireUser()" src/app/actions/deck-source.ts   -> :32, :58  (2 lines, exit 0)
grep -n "await requireOwner()" src/app/actions/deck-source.ts  -> exit 1 (no match)
```

Matches the backlog row's own count exactly (2 requireUser, 0 alias).

**`extractDeckSourceFileAction` (`:28-54`, guard at `:32`) - stays
`requireUser()`, genuinely safe.** Its only calls are `extractTextFromBuffer`
(`src/lib/office-extract.ts`, imports only `jszip`/`officeparser`;
`grep -n "^import" src/lib/office-extract.ts` -> those two lines only) and
`checkWireBudget` (`src/lib/upload-budget.ts`, no imports at all - a pure
function, opened directly). `walkRuntimeGraph` rooted at `deck-source.ts`
with `lib/canvas.ts` and `lib/github.repos.ts` both forbidden still shows this
action's own leaves are clean (see 2.4's isolation run - the only edges that
survive belong to `extractDeckSourceRepoAction`). **No owner-only resource on
this path.**

**`extractDeckSourceRepoAction` (`:57-71`, guard at `:58`) - REAL exposure,
must move to `requireAppOwner()`.** The call chain, each hop opened directly:

| Hop | Site | What it does |
|---|---|---|
| 1 | `deck-source.ts:58` | `await requireUser()` - the caller's own guard, permissive |
| 2 | `deck-source.ts:63` | `await ingestRepoAction(trimmed)` - a real function call, not a barrel re-export |
| 3 | `src/app/actions/github.ts:258-267` | `ingestRepoAction` itself calls `await requireOwner()` at `:260` (a SEPARATE, also-permissive guard - see the cross-reference in section 5), then `await ingestRepo(parsed.owner, parsed.repo, {}, branch)` at `:263` |
| 4 | `src/lib/github.digest.ts:262-276` | `ingestRepo` calls `await getRepo(owner, repo)` at `:274` |
| 5 | `src/lib/github.repos.ts` | `getRepo` calls `ghFetch`, which sets `Authorization: Bearer ${githubToken()}` at `:32`; `githubToken()` (`:8-11`) reads `process.env.GITHUB_TOKEN` unconditionally - no identity check of any kind |

This is a genuine, function-level call chain (every hop's source was opened,
not inferred from the closure tool), matching the class R2's own B1 finding
established for `grading.ts`. `walkRuntimeGraph` rooted at `deck-source.ts`,
forbidding `lib/github.repos.ts`, confirms 17 violations, ALL via
`app/actions/github.ts` (not through `lib/canvas.ts` at all) - re-run with
`lib/canvas.ts` also forbidden: violations rise to 19 (the 17 plus 2 new hits
that are the walk hitting the now-forbidden canvas boundary itself, from
`grade/extraction.ts` and `grade/engine.ts` - unrelated to this action), so
the GitHub route is independent of the canvas barrel; it is real.

### 2.3 The header comment is false for one of the file's two actions

`deck-source.ts:16-20`:

> "requireUser, not the deprecated requireOwner alias... These actions are
> correctly user-scoped: a deck is built from material the caller supplies,
> per-user, with no owner-only resource."

**This is a blanket, per-file claim asserted without checking token
reachability, and it is false for `extractDeckSourceRepoAction`.** That
action does not operate solely on caller-supplied material - it spends the
deployment's single GitHub PAT via the chain in 2.2. It is true for
`extractDeckSourceFileAction` alone. **Requirement for whichever wave touches
this file:** replace the blanket claim with a per-action one - state that
`extractDeckSourceFileAction` reads only the caller's own uploaded bytes (no
owner-only resource) and that `extractDeckSourceRepoAction` reaches the
GitHub PAT via `ingestRepoAction` (cite `github.ts:258`,
`github.digest.ts:262`, `github.repos.ts:32`) and is therefore
`requireAppOwner()` below, retracting the "no owner-only resource" claim as it
applied to that action.

### 2.4 `src/app/actions/walkthrough-announcement.ts` - 8 sites, 0 real, all clean

```
grep -n "await requireUser()" src/app/actions/walkthrough-announcement.ts   -> :121,:140,:164,:189,:286,:394,:542,:603 (8 lines, exit 0)
grep -c "await requireOwner()" src/app/actions/walkthrough-announcement.ts  -> 0 (exit 1)
```

8 requireUser / 0 alias - matches the backlog row's count. Its own header
(`:19-23`, "AUTH: every action below calls `requireUser()` explicitly, never
`requireOwner()`... naming the real guard here keeps this file honest about
what it actually checks") makes no claim about resource-scoping, only about
which guard function runs - **that claim is true and needs no correction.**

**All 8 exported actions read directly**: `getMostRecentAnnouncementExemplarAction`,
`listAnnouncementExemplarsAction`, `saveAnnouncementExemplarAction`,
`deleteAnnouncementExemplarAction` - Supabase only (`createServiceClient`/the
four `announcement-exemplars.ts` functions), no GitHub or Canvas import.
`gatherWalkthroughResourcesAction` - `deriveResourceConcepts`/
`findResourceLinksForConceptsAction` (`./learning-resource-links`);
`walkRuntimeGraph` rooted at `app/actions/learning-resource-links.ts`,
forbidding `lib/github.repos.ts` -> **0 violations**.
`draftWalkthroughAnnouncementAction` and `draftWalkthroughVideoScriptAction` -
`callLlm`/prompt builders only, no canvas or github import anywhere in the
file for either. **The one exception, traced to ground:**

**`postWalkthroughAnnouncementAction` (`:595-609`, guard at `:603`)** is the
ONLY action in this file that imports from Canvas: `createAnnouncementFromMarkdown`
from `@/lib/canvas` (`:56`), called at `:604`. `src/lib/canvas.ts` is a **pure
re-export barrel** (every line is `export {...} from "./canvas/..."`,
confirmed by reading all 124 lines - no `import` statement of its own).
`createAnnouncementFromMarkdown` is defined in `./canvas/announcements`
(`canvas.ts:76`, function body at `src/lib/canvas/announcements.ts:420`).

Three independent checks, all agreeing:

1. **File-level, with only `lib/github.repos.ts` forbidden:** 17 violations,
   and reading every one of the 17 printed trails, ALL begin
   `walkthrough-announcement.ts -> lib/canvas.ts -> lib/canvas/listings.ts ->
   lib/canvas/auto-zero.ts -> lib/grade-zeros.ts -> lib/grade.ts -> ...` - the
   automatic-zero-grading pipeline, an entirely different submodule than
   `announcements.ts`.
2. **Barrel isolation - also forbid `lib/canvas.ts` itself:** violations drop
   from **17 to 1**, and the 1 remaining trail is just
   `walkthrough-announcement.ts -> lib/canvas.ts` (the walk hitting the
   now-forbidden boundary at the direct import edge), not a route *through*
   it. Removing the barrel from the graph removes every GitHub hit - the
   route does not survive without it.
3. **Root at the specific submodule the action actually calls,**
   `lib/canvas/announcements.ts`, forbidding `lib/github.repos.ts` -> **0
   violations** (23 nodes visited). Root at the SIBLING submodule that is
   causing the file-level hit, `lib/canvas/listings.ts` -> **17 violations**,
   same trail as (1) (`-> auto-zero.ts -> grade-zeros.ts -> grade.ts -> ...`).

`createAnnouncementFromMarkdown`'s own module does not reach the token; the
reach the wave-0 test detects is entirely attributable to a sibling,
unrelated submodule that the SAME barrel re-exports. **This is a barrel
artifact, not exposure** - exactly R2's own section 3 defect class ("9 files
reach GitHub ONLY through the barrel... none of it proves these files' OWN
exported actions call anything GitHub-reaching"), here through `lib/canvas.ts`
instead of `src/app/actions.ts`. **All 8 actions stay on `requireUser()`,
correctly - none of R2's "no second containment for GitHub" concern applies,
because none of them reach GitHub at all.**

### 2.5 The other two pending files, confirmed rather than assumed

Per the row's own instruction ("confirm all four yourself"):

- **`src/app/actions/media-likeness.ts`**: `grep -c "await requireAppOwner()"`
  -> **11**; `grep -c "await requireUser()\|await requireOwner()"` -> **0**.
  Already owner-only on every export. `walkRuntimeGraph` confirms it DOES
  genuinely closure-reach `lib/github.repos.ts` (17 violations, trail through
  `lib/supabase/courses.ts -> ... -> app/actions.ts -> ... ->
  lib/canvas/auto-zero.ts -> ... -> lib/github.ts`) - a barrel artifact via
  the `app/actions.ts` barrel, the same class R2 already named - but its
  disposition is unaffected either way: it is already `requireAppOwner()`
  throughout, so it needs no reclassification, only bookkeeping (move it into
  `GITHUB_FILES`, no `GITHUB_NOT_OWNER_ONLY` entries needed since it has zero
  `requireUser()` calls to except).
- **`src/app/actions/llm-content.ts`**: `grep -c "^export async function"` ->
  **9**; `grep -c "await requireAppOwner()\|await requireUser()\|await requireOwner()"`
  -> **0** - no guard call of any kind on any export. All 9 exported action
  names (`generateModuleIntroAction`, `generateLessonPlanAction`,
  `generateAssignmentAction`, `generateAssignmentRubricAction`,
  `generateTestQuestionsAction`, `generateExamplesAction`, `testGeminiAction`,
  `reviseDocumentAction`, `askAboutCourseAction`) are confirmed present in
  `PINNED_UNGUARDED` (`action-guard-coverage.test.ts:288-317`) by a set
  comparison (`comm -23` between the two sorted name lists -> empty output).
  **This is genuinely a different defect class - no guard at all, not a
  wrong guard - already tracked by that pre-existing, separate ratchet.** It
  also DOES genuinely closure-reach GitHub (`walkRuntimeGraph` -> 17
  violations, trail `llm-content.ts -> lib/grade.ts -> lib/grade/extraction.ts
  -> lib/grade/repo-content.ts -> lib/github.ts`, NOT a barrel artifact - a
  direct, non-barrel edge), which matters only for whoever eventually adds a
  guard to it (residual R4-r2, section 7).

---

## 3. The instrument, and the one that does not work

**Wave 0 (`b25ed71`) already landed the EXECUTING instrument this row
needed, before this document existed** - I did not have to design one.
Re-run this pass:

```
npm run test:paths -- src/app/actions/walkthrough-announcement.test.ts src/app/actions/action-guard-coverage.test.ts src/lib/supabase/auth.test.ts

PASS src/app/actions/walkthrough-announcement.test.ts (28 tests) 23ms
PASS src/lib/supabase/auth.test.ts (38 tests) 29ms
PASS src/app/actions/action-guard-coverage.test.ts (19 tests) 15929ms
  PASS GITHUB_FILES tracks the live import-graph closure - a floor, not a trusted final list (RULING 80/84) 14415ms
Test Files  3 passed (3)
     Tests  85 passed (85)
COVERED src/app/actions/walkthrough-announcement.test.ts files=1 passed=28
COVERED src/app/actions/action-guard-coverage.test.ts files=1 passed=19
COVERED src/lib/supabase/auth.test.ts files=1 passed=38
```

`githubReachingActionFiles()` (`action-guard-coverage.test.ts:177-196`) walks
EVERY `"use server"` action file under `src/app` (not just R2's 81-file
census), reusing `walkRuntimeGraph` with `forbiddenPathPrefixes:
["lib/github.repos.ts"]`. Its own test (`:883-912`) asserts the detected,
not-yet-enumerated set equals `GITHUB_FILES_PENDING_ENUMERATION` **exactly**
- this is genuinely executing, real closure computation, not a source-text
regex; it is the SAME instrument class R2's own section 5 named as the thing
`checkOwnerOnlyEntry` (a regex over `action.body`) cannot be.

**What it can prove and what it cannot, stated exactly as R2 states it for
its own instrument:** the closure test proves a FILE's import graph contains
code that spends the token - it does not, and cannot, prove a specific
ACTION's body calls that code. That is exactly Ruling 84's gap, and section 2
above is what closes it for these four files: by opening every hop, not by
trusting the closure.

**The idiom for the one test this row's fix actually needs** -
`extractDeckSourceRepoAction` moving to `requireAppOwner()` - is
`src/lib/supabase/auth.test.ts:432-444`, opened directly:
`it("throws for an active instructor - active is not enough to be an owner")`,
asserting `await expect(requireAppOwner()).rejects.toThrow("limited to the
workspace owner")`. Wave 1 (section 6) writes a per-action version of this,
mocking `@/lib/supabase/auth` the same way, for `extractDeckSourceRepoAction`
specifically.

**Why the other 9 sites do NOT get a matching executing test.** R2-r1's own
wording ("a per-action executing test... for every action moved off
owner-only") is aimed at actions being newly EXEMPTED from an
otherwise-owner-only default inside a file that genuinely reaches the token
somewhere. For `extractDeckSourceFileAction` and the 8
`walkthrough-announcement.ts` actions, there is no code path to observe
executing - the safety argument rests on the ABSENCE of an import edge
(section 2.2/2.4), which the ALREADY-LANDED, continuously re-run closure test
(`:883-912`) re-verifies on every run at the file level. A new test asserting
"this mocked action does not throw for a non-owner" would pass trivially for
almost any action that never calls `requireAppOwner()` - it tests that the
action runs, not that a security boundary holds. Writing it anyway would be
manufacturing an instrument to look diligent rather than because it protects
anything; I am saying this plainly rather than padding wave 1 with 9 tests
that assert nothing falsifiable.

---

## 4. What an unauthorised caller could actually do - the sentence that matters

**Today**, any approved `active`, non-owner account that calls
`extractDeckSourceRepoAction` (the "import materials from a GitHub repo"
control on the deck-source panel) can read any repository the deployment's
single `GITHUB_TOKEN` can read - the same class of exposure R2 exists to
close, on a site R2's own census could not see. `githubToken()`
(`github.repos.ts:8-11`) has no identity check of any kind; the PAT is a
single, deployment-wide secret, not a per-user credential.

**The same caller today gets nothing extra from any of the other 9 sites** -
they already had a per-user Supabase row's own data (the 4 exemplar actions),
a shared LLM call scoped to their own account (`gatherWalkthroughResourcesAction`,
the two draft actions), or the ability to post a Canvas announcement they
already had via `createAnnouncementFromMarkdown`'s own, separate Canvas
credential path (unaffected by this row).

---

## 5. Cross-reference: this fix does not discharge R2's own obligation

`ingestRepoAction`'s OWN guard (`github.ts:260`, `await requireOwner()`) is a
SEPARATE call site from `extractDeckSourceRepoAction`'s (`deck-source.ts:58`).
It is one of R2's own 41 Group-A / 255-call cohort (`github.ts` is in
`docs/r2-scope.md` section 3's file list) and is **not fixed by this
document**. Per R2's own established finding ("for GitHub it means no
containment at all" - no second containment exists at the resource, only at
whichever guard sits in the call chain), BOTH guards along this path need to
be independently correct, not just the outer one this row fixes. This is
named as residual R4-r1 (section 7), not silently assumed discharged by R2's
still-pending wave 1.

---

## 6. Wave plan - one wave

**File-set collision, named up front:** this wave and R2's own wave 1 both
write `src/app/actions/action-guard-coverage.test.ts`. They are NOT
concurrency-safe with each other (`parallel-disjointness.md`'s file-set test
fails). Recommendation: land this wave FIRST - it is a 9-entry addition to
`GITHUB_NOT_OWNER_ONLY` plus a 3-entry move between two sets, small and
self-contained; R2's own wave 1 is still blocked on its two-round cap
(`docs/r2-check.md` verdict NOT BUILDABLE, revision in progress) and is far
larger (255 call sites). Whichever lands second must re-derive its diff
against the tree the first one committed, not a stale read.

### Wave 1 - the only wave

**Write set:**

- `src/app/actions/deck-source.ts` (production) - swap
  `extractDeckSourceRepoAction`'s guard from `requireUser()` to
  `requireAppOwner()` (import `requireAppOwner` alongside `requireUser`,
  which `extractDeckSourceFileAction` still needs); correct the header
  comment per section 2.3.
- `src/app/actions/deck-source.test.ts` (**new** - no test file exists for
  this production module today; confirmed by
  `ls src/app/actions/deck-source.test.ts` -> "No such file or directory").
  Two executing tests, modelled on `auth.test.ts:432-444`: (a) mock
  `@/lib/supabase/auth` as an active non-owner, call
  `extractDeckSourceRepoAction`, assert it rejects with the owner-only
  message; (b) same mock, call `extractDeckSourceFileAction` with a small
  valid payload, assert it does NOT reject with the owner-only message - the
  contrast pair that proves the split inside one file is deliberate, not
  accidental.
- `src/app/actions/action-guard-coverage.test.ts` (bookkeeping only - no
  behavioural assertion changes for any OTHER file's cohort):
  - Move `"actions/deck-source.ts"`, `"actions/walkthrough-announcement.ts"`,
    `"actions/media-likeness.ts"` out of `GITHUB_FILES_PENDING_ENUMERATION`
    (`:844-849`) and into `GITHUB_FILES` (`:767-809`).
  - Add to `GITHUB_NOT_OWNER_ONLY` (`:817`, currently `{}`): one entry for
    `extractDeckSourceFileAction` (reason: reads only the caller's own
    uploaded bytes, no GitHub/Canvas import - section 2.2) and eight
    entries, one per `walkthrough-announcement.ts` action (reason:
    file-level closure is a `lib/canvas.ts` barrel artifact via the
    unrelated `canvas/listings.ts -> canvas/auto-zero.ts` route; the
    action's own call, `createAnnouncementFromMarkdown` from
    `canvas/announcements.ts`, has 0 violations when walked directly -
    section 2.4). No entries needed for `media-likeness.ts` (0
    `requireUser()` calls to except).
  - Update `GITHUB_FILES_PENDING_ENUMERATION` to contain only
    `"actions/llm-content.ts"`.
  - Correct the wave-0 comment's own off-by-one at `:829` ("7 actions") to
    "8 actions" - measured this pass as 8 (`grep -n` above); I did not
    determine why wave 0's comment said 7, and flag rather than silently fix
    without explanation, since it is a small, in-write-set correction to a
    file already being touched, not a new residual.
- No change to `src/app/actions/walkthrough-announcement.ts`,
  `src/app/actions/media-likeness.ts`, or `src/app/actions/llm-content.ts`.

**Gate:**

```
npm run test:paths -- src/app/actions/deck-source.test.ts src/app/actions/walkthrough-announcement.test.ts src/app/actions/action-guard-coverage.test.ts src/lib/supabase/auth.test.ts
npx tsc --noEmit --incremental false
npm run lint
git status --short   (against exactly: deck-source.ts, deck-source.test.ts [new], action-guard-coverage.test.ts)
```

Then a whole-tree confirmation that no other file's `GUARD_CALL`/closure
result moved: `npm run test:paths -- src/app/actions/action-guard-coverage.test.ts`
alone, checking the OTHER (non-R4) assertions in that file still pass
unchanged.

**Diff-size estimate (not yet built - residual R4-r3):** production guard
swap + header rewrite (~15 lines), one new test file (~40-60 lines for two
tests), bookkeeping edit to `action-guard-coverage.test.ts` (~20-25 lines for
9 entries + 2 set moves + 1 comment fix). Estimated **~90-110 lines across 3
files** - small enough for one reviewer's single pass; no wave here
approaches the 60+-file scale R2 itself flagged as a real concern.

---

## 7. Residuals

| # | Residual | Owner | Instrument | Object / direction of failure | Step |
|---|---|---|---|---|---|
| R4-r1 | `ingestRepoAction` (`github.ts:258-267`)'s OWN guard (`:260`, still the permissive alias) is a separate call site inside R2's own 41-file/255-call Group-A cohort, not fixed by this row | R2 wave-1 implementer | R2's own per-action review of `github.ts` (`docs/r2-scope.md` section 7) plus an executing test modelled on `auth.test.ts:432-444` for `ingestRepoAction` itself | `github.ts:260`. FAILS PERMISSIVE if R2 wave 1 ships `github.ts` without independently reclassifying this site - leaving a second, still-permissive path to the same PAT, reachable by ANY caller of `ingestRepoAction`, not just `deck-source.ts` | Cite this document in R2 wave-1's implementer brief so the site is not independently rediscovered a third time |
| R4-r2 | `llm-content.ts` stays in `GITHUB_FILES_PENDING_ENUMERATION`; its 9 unguarded actions belong to the pre-existing `PINNED_UNGUARDED` ratchet, a larger, separate backlog item this row does not scope | whichever future item adds guards to `PINNED_UNGUARDED`'s actions | `action-guard-coverage.test.ts`'s already-landed closure test, plus this document's measured, non-barrel closure route (`llm-content.ts -> lib/grade.ts -> lib/grade/extraction.ts -> lib/grade/repo-content.ts -> lib/github.ts`) | Any `llm-content.ts` action getting a bare `requireUser()` instead of `requireAppOwner()` when it is finally guarded. FAILS PERMISSIVE if that future item does not apply RULING 83's GitHub-cohort default | Hand this citation to that item's brief when it is scoped |
| R4-r3 | The wave-1 diff-size estimate (section 6) is pre-build, not measured against real code | wave-1 implementer | `git diff --stat` against the write set, at the wave gate | The 3-file write set. FAILS if the real diff is materially larger than ~110 lines, which would call the "one reviewer, one pass" claim into question | Wave-1 gate |
| R4-r4 | `action-guard-coverage.test.ts` is a shared write target with R2's own wave 1 (section 6) | orchestrator, at dispatch | `git status --short` immediately before either wave starts | Concurrent (non-sequenced) dispatch of both waves. FAILS if one wave's `GITHUB_NOT_OWNER_ONLY`/`GITHUB_FILES` additions are overwritten by the other landing on a stale tree | Sequence the two waves; recommend R4 first (small) before R2 wave 1 (large, still blocked on its own two-round cap) |
| R4-r5 | No live signed-in session exists in this checkout (`ls .env* 2>&1` -> nothing; `docs/loop/this-repo.md`) | repo owner | A real session: an approved non-owner calls "import from repo" on the deck-source panel (expect the owner-only message); the owner calls the same control (expect success); either account still uses the file-upload path (expect success) | The member/owner boundary at runtime for this specific control; invisible to any gate in this checkout, in both directions | Run after wave 1 pushes |

---

## 8. Fork - bookkeeping only, not the security classification

`extractDeckSourceRepoAction` reaches the deployment's single GitHub PAT with
no second containment, like the rest of R2's Group A. **This ships
owner-only either way** - the security derivation in section 2.2 is
unambiguous (no stated-safe reason exists for this action, unlike the 9
exempted sites in section 2.4/2.5), so this is not put to the owner as a
security question.

The only open question is a product one, matching the shape of R2's own
retired Fork 2 (`github-student-repos.ts`): once this ships, only the
deployment owner can import deck source material directly from a GitHub
repo - any other approved account keeps the file-upload path but loses the
repo-reference path. (a) leave it owner-only indefinitely (repo-import is
inherently privileged because it spends the shared deployment credential),
or (b) file a backlog row for a future per-user GitHub credential so any
approved account could use their OWN token for this specific path. **Every
answer keeps `requireAppOwner()` on `extractDeckSourceRepoAction`** - nothing
about the guard changes based on the answer, so this rides alongside wave 1
rather than gating it. Recommendation: (a) now, with a backlog row filed for
(b) if the owner wants the capability restored for non-owner accounts later.

---

## 9. Leverage

Per `docs/loop/leverage.md`: this is a security bug fix, not a capability a
user reaches - the honest leverage answer is **none directly**. It removes
unauthorized access to a capability that already exists (importing a repo
as deck material); it adds none. Not manufacturing a claim for this row,
matching R2's own section 8 disposition for the same reason.

---

## 10. What I could not determine

- **No authorization decision was exercised.** No `.env`
  (`ls .env* 2>&1` returns nothing this pass), so `requireAppOwner()` never
  ran against a real Supabase session in this checkout. Section 2's
  classification is read from source and confirmed by the closure tool; it
  is not a runtime observation.
- **No component was rendered.** Whether an approved non-owner sees a
  disabled control or an error toast on the deck-source panel's "import from
  repo" path is not knowable here - this is a reading claim about source,
  not a UI observation.
- **I did not run `npm run build` or `next build`.** This document writes
  one file under `docs/`; the closure scripts ran standalone via `node
  --experimental-strip-types` against the real module-graph module, not
  through the app's own build. The two executing test files were run via
  `npm run test:paths --` (section 3), not through a full build.
- **I did not review `github.ts`'s other 26 `requireOwner()` call sites**
  beyond the one (`:260`) this row's own chain passes through - that is
  R2's own per-action review, not duplicated here (R4-r1).
- **I did not verify whether any OTHER file beyond these four exists with
  the same shape of blindness.** The already-landed `githubReachingActionFiles()`
  test (wave 0) is itself the instrument that would catch a fifth such file
  - re-run this pass and green (section 3), so I am trusting an EXECUTING
  instrument's own current result, not asserting I re-derived the
  whole-tree set by hand a second time.

---

## 11. Gates run for this artifact

```
wc -l docs/r4-scope.md                                        -> see report (run after write)
@(Get-Content docs\r4-scope.md).Count                          -> see report (PowerShell instrument, per traps-spec.md)
LC_ALL=C grep -c '[^ -~\t]' docs/r4-scope.md                    -> see report (pure-ASCII / no-emoji check)
npm run test:paths -- src/app/actions/deck-source.test.ts src/app/actions/walkthrough-announcement.test.ts src/app/actions/action-guard-coverage.test.ts src/lib/supabase/auth.test.ts
  -> deck-source.test.ts does not exist yet (wave 1 creates it); the other
     three, run together this pass without it, all green (section 3)
git status --short
```

Results recorded in this seat's handback report, because a file cannot
honestly state its own final line count or its own gate output.

**Method notes.** All closure runs used `node --experimental-strip-types`
against the REAL `src/lib/module-graph/runtime-import-graph.ts`, imported
via a `file://` URL from a scratchpad driver script - never transcribed. No
production or test file was mutated by this document or by its
measurements. All `grep`/`wc` exit codes were read directly from the
command, never through a pipe. `npm run test:paths --` is named for every
multi-file check above; no raw multi-path `vitest` command appears anywhere
in this document.
