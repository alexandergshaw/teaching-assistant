# R4 scope: the one live-exposure site, corrected under RULING 90 and closed under RULING 91 (revision 1, 2026-09-27)

**THIS IS A REVISION**, not a fresh document. It responds to `docs/r4-check.md`
(committed `5dde07b`), the check over the prior draft committed at `7b7872e`.
Per the owner's "Two rounds, then ask" rule (`AGENTS.md`), **this is the one
revision available** for this artifact. If anything below is still unsettled
after this pass, it goes to the owner rather than a third round on this
document.

Seat: `loop-seat` (bug scope, security). Consumer: the wave-plan/implementer
chain for backlog row `R4`. Citation, re-confirmed this pass: `grep -a -n "|
R4 |" docs/BACKLOG.md` -> line **97**, exit 0.

**Both open questions from the prior round are RULINGS, applied here as given,
not re-argued** (RULING 90 tightens RULING 84's own silence on which
owner-private resources the classifier ranges over; RULING 91 answers B2 as
"(a)"). Everything else the check found is fixed in place below.

**No disposition table against a predecessor document is owed, and none is
faked here either** - `git log --oneline -- docs/r4-scope.md` still shows
exactly the one commit (`7b7872e`) before this revision, so there is no PRIOR
R4 artifact whose requirements this document could have silently dropped; the
check confirmed this explicitly ("No disposition table is owed and none was
faked... The document's correction of the R4 BACKLOG row is a correction of
its own consuming row, not a restructuring of a predecessor"). What IS owed,
and is given immediately below instead, is a disposition of the CHECK's own
findings - the audit `iteration-caps.md`'s checker output contract expects
before a second round is trusted.

---

## Disposition of `docs/r4-check.md`'s findings, this revision

| Finding | Class | Disposition | Where |
|---|---|---|---|
| B1 / RULING 90 | NARROW-FILTER COHORT (repeat) | **FIXED.** Every walk in section 2 now runs against BOTH owner-private targets, published as one table per file; trail-prefix reasoning deleted | Section 2.0, 2.2, 2.4 |
| B2 / RULING 91 | OUTER GUARD HARDENED, SIBLING LEFT OPEN | **FIXED per the ruling's answer (a).** Wave 1 also swaps `github.ts:260`; cost stated plainly, boundary of what is and is not touched stated plainly | Section 5, 6 |
| B3 | WRITE SET OMITS THE PIN THE CHANGE INVALIDATES | **FIXED.** Write set now retires `action-guard-coverage.test.ts:852-859` | Section 6 |
| M1 | ASSERTION MISDESCRIBED AS EXECUTION | **FIXED.** Section 3/6 now specify the client-mock idiom verbatim from `auth.test.ts`, matching what the backlog row itself demanded, not the module-mock variant | Section 3, 6 |
| M2.1 | CITATION THAT DOES NOT RESOLVE | **FIXED.** `gatherWalkthroughResourcesAction` is now walked and cited under `./learning-resources-generator`, the module `deriveResourceConcepts` is actually imported from | Section 2.4 |
| M2.2 | CITATION THAT DOES NOT RESOLVE | **FIXED.** `extractDeckSourceFileAction`'s exoneration now cites its OWN two edges' isolation runs, not a cross-reference to the other file | Section 2.2 |
| M2.3 | CITATION THAT DOES NOT RESOLVE | **FIXED.** The false "no canvas or github import anywhere in the file" sentence is replaced with the correct per-action claim: the file imports it, neither draft action calls it | Section 2.4 |
| M3 (R4-r1) | RESIDUAL WITHOUT A DISCHARGEABLE INSTRUMENT | **RETIRED as a residual.** RULING 91 pulls `github.ts:260` into this wave, so the thing R4-r1 was tracking is now built here, not deferred | Section 5, 7 |
| M3 (R4-r2) | RESIDUAL WITHOUT A DISCHARGEABLE INSTRUMENT | **FIXED.** Re-typed as a HANDOVER (real receiver: the orchestrator, at disposal; real obligation: file a backlog row), matching R2's own retired-Fork-2 pattern rather than naming a placeholder owner | Section 7 |
| M4(a) | REFUSAL CORRECT, DOCUMENT ARGUES BOTH SIDES | **FIXED.** The contrast-pair distinction (meaningful only where a strict sibling exists in the same file) is now stated, so section 3's refusal and section 6's contrast test no longer contradict | Section 3 |
| M4(b) | CONVERSE RATCHET NOT CONSIDERED | **FIXED.** A converse-ratchet loop for `GITHUB_NOT_OWNER_ONLY`, modelled on the media block's `:679-700`, is added to the write set | Section 6 |
| M5 | EXONERATION SILENTLY CONSUMES AN OPEN OBLIGATION | **FIXED.** Section 4 now cites `docs/r2-scope.md:97` (the Group-C rule) and `docs/multi-user-login-architecture.md:426-431` (the per-user-spend-quota obligation) by name | Section 4 |
| M6 | ONE-DIRECTIONAL APPLICATION OF A RULING | **FIXED.** Same fix as B1/RULING 90 - the per-edge table replaces the asymmetric file-level absence claim | Section 2 |
| m1 | FORK WHOSE RECOMMENDATION IS BOTH BRANCHES | **FIXED.** Restated as a notification, not a question | Section 8 |
| m2 | "THREE INDEPENDENT CHECKS" OVERSTATES ONE LEG | **FIXED.** Restated as two independent checks plus one that establishes route-through-barrel only | Section 2.4 |
| m3 | UNDEFINED "MATERIALLY LARGER" | **FIXED.** A numeric threshold is stated against the re-estimated (larger) diff | Section 6, 7 (R4-r3) |
| m4 | CLIENT-COMPONENT ROUTE IS A MORE INTERESTING FINDING | **KEPT, unchanged** - still flagged as a candidate for someone else's row, not this one | Section 2.5 |
| m5 | `githubToken()` CITED AS `:8-11`, IS `:8-12` | **FIXED** | Section 4 |

---

## 0. The correction this document makes to the row I filed an hour before the prior draft

Unchanged from the prior draft; re-opened and re-confirmed this pass, not
restated as settled fact:

The R4 row (`docs/BACKLOG.md:97`) states: "Two of them are live exposure:
`src/app/actions/deck-source.ts` (2 sites) and
`src/app/actions/walkthrough-announcement.ts` (8 sites) call the PERMISSIVE
guard `requireUser()` TODAY and closure-reach the owner personal access
token."

**The call-count half is right; the "both are live exposure" half is not.**
Of the 10 call sites, only **1** - `extractDeckSourceRepoAction`
(`deck-source.ts:57-71`) - has a real, function-level call path to
`githubToken()`. The other 9 do not. Section 2 is the measurement.

---

## 1. `requireOwner()`, read from source (unchanged from R2)

`src/lib/supabase/auth.ts:451-453`:

```
export async function requireOwner(): Promise<AuthorizedUser> {
  return requireUser();
}
```

Literally `return requireUser()` - any active account passes. Re-opened this
pass.

---

## 2. The ten call sites, traced individually against BOTH owner-private resources (RULING 84 and RULING 90 applied)

**RULING 84, applied as given:** a file-level module closure is a candidate
set, never a classification. ES modules evaluate eagerly, so a file's import
graph *containing* code that spends a credential never proves that file's own
exported action *calls* that code. Only a verified call path makes a site
owner-only.

**RULING 90, applied as given:** the classifier must range over EVERY
owner-private resource in this tree, enumerated explicitly, and each walk must
state which targets it forbade. **The owner-private resource universe this
document ranges over is exactly two**, matching R2's own established census
(`docs/r2-scope.md` section 3, the two `forbiddenPathPrefixes` walks run at
`:225`, `:246-247`, `:359-374`):

1. `lib/github.repos.ts` - the deployment's single `GITHUB_TOKEN` PAT.
2. `lib/canvas-credentials.ts` - the resolver behind the owner's Canvas
   `<CODE>_CANVAS_API_TOKEN` environment pair.

**No third owner-private singleton exists in this tree.** The other
per-service credential modules are per-user, not owner-private, confirmed by
opening both: `src/lib/microsoft-credentials.ts:31` and
`src/lib/google-credentials.ts:29` both key their table read on
`.eq("user_id", userId)` - a caller's own row, never a deployment-wide secret.
Every walk below states which of the two targets it ran against; none of them
is a partial result left unlabelled.

### 2.0 The instrument reused (Ruling 80): `walkRuntimeGraph`/`scanRuntimeEdges`, not a new walker

`src/lib/module-graph/runtime-import-graph.ts` (299 lines, `wc -l`), reused
exactly as R2 wave 0 (`b25ed71`) reused it - no walker was written for this
revision either. All runs below used `node --experimental-strip-types`
against the REAL module, imported via a `file://` URL from scratchpad driver
scripts OUTSIDE the repo
(`.../scratchpad/r4rev_edges.ts`, `r4rev_trail.ts`, `r4rev_25.ts`; no
production or test file was mutated - `git status --short` at the end of this
document is the proof).

**Canaries, run before trusting any absence, against BOTH targets** (the rule
R2's own section 3 states and this revision now actually follows for both):

```
target lib/github.repos.ts,       root src/lib/grade/repo-content.ts     -> 17 violations (non-zero)
target lib/canvas-credentials.ts, root src/app/actions/canvas-inbox.ts  -> 1 violation  (non-zero)
```

Both fire (reproducing `docs/r2-scope.md:246-247` exactly). The absence claims
below are measured against filters proven capable of finding something
present, for both targets, not one.

### THE VALID PROOF: one walk per direct edge, both targets, published as a table

Per `docs/loop/traps-spec.md`'s own rule (added the same day this check
found the defect): **an absence claim may not rest on where a graph walk's
trail begins**, because `walkRuntimeGraph` shares one `visited` set across
the whole walk (`runtime-import-graph.ts:221-230`) and a violation's `trail`
records whichever path reached the importing file FIRST. "All 17 trails begin
via the barrel" is compatible with a second import of the same file reaching
a forbidden resource through a module the walk had already visited. **The
valid proof is one walk per direct edge**, rooted at each import in turn. The
prior draft's trail-prefix argument (its old section 2.4, checks 1-2) is
deleted below, not patched.

**`app/actions/walkthrough-announcement.ts` - 18 direct edges, per-edge
violation count against both targets** (`scanRuntimeEdges` parses the file's
own import statements; each resolved specifier is walked as its own root):

| Import specifier | `github.repos.ts` | `canvas-credentials.ts` |
|---|---|---|
| `@/lib/supabase/server` | 0 | 0 |
| `@/lib/supabase/auth` | 0 | 0 |
| `@/lib/llm` | 0 | 0 |
| `@/lib/gemini` | 0 | 0 |
| `@/lib/json-slice` | 0 | 0 |
| `./writing-style-block` | 0 | 0 |
| `@/lib/lms-generation/generation-diag` | 0 | 0 |
| `@/lib/announcement-outline` | 0 | 0 |
| `@/lib/announcement-outline-types` | 0 | 0 |
| `@/lib/walkthrough-announcement-prompt` | 0 | 0 |
| `@/lib/walkthrough-announcement-bounds` | 0 | 0 |
| `@/lib/walkthrough-script-prompt` | 0 | 0 |
| `@/lib/walkthrough-announcement-link-guard` | 0 | 0 |
| `@/lib/resource-search-outcome` | 0 | 0 |
| `./learning-resources-generator` | 0 | 0 |
| `./learning-resource-links` | 0 | 0 |
| `@/lib/announcement-exemplars` | 0 | 0 |
| `@/lib/canvas` | **17** | **1** |

17 of 18 edges are clean against BOTH targets; exactly one - `@/lib/canvas` -
carries every hit for both. That is the boundary this file's own barrel
import sits at, not a route through it (see 2.4 for which submodule actually
carries each hit).

**`app/actions/deck-source.ts` - 5 direct edges, both targets:**

| Import specifier | `github.repos.ts` | `canvas-credentials.ts` |
|---|---|---|
| `@/lib/supabase/auth` | 0 | 0 |
| `@/lib/office-extract` | 0 | 0 |
| `@/lib/upload-budget` | 0 | 0 |
| `./github` | **17** | **1** |
| `@/lib/decks/deck-source` | 0 | 0 |

4 of 5 edges are clean against both targets. `./github` (resolving to
`src/app/actions/github.ts`) carries every hit for both - see 2.2 for the
GitHub-PAT chain (already traced hop by hop) and the newly-measured
Canvas-credential reach (moot for this action's disposition, stated for
completeness under RULING 90):

```
TRAIL app/actions/github.ts -> lib/grade.ts -> lib/grade/extraction.ts -> lib/canvas.ts
   -> lib/canvas/discussions.ts -> lib/canvas-core.ts => lib/canvas-credentials.ts
```

This is a SECOND barrel artifact (`lib/canvas.ts` again), reached from inside
`ingestRepo`'s own module graph, not from `deck-source.ts`'s own code. It does
not change `extractDeckSourceRepoAction`'s disposition - that action is moving
to `requireAppOwner()` regardless (section 2.2), and `requireAppOwner()`
already permits the owner branch that alone reaches
`resolveOwnerEnvCredential` (below) - but RULING 90 requires it to be stated
rather than left unmeasured just because it does not change the answer.

### 2.2 `src/app/actions/deck-source.ts` - 2 sites, 1 real, 1 clean

```
grep -n "await requireUser()" src/app/actions/deck-source.ts   -> :32, :58  (2 lines, exit 0)
grep -n "await requireOwner()" src/app/actions/deck-source.ts  -> exit 1 (no match)
```

Matches the backlog row's own count exactly (2 requireUser, 0 alias).

**`extractDeckSourceFileAction` (`:28-54`, guard at `:32`) - stays
`requireUser()`, genuinely safe.** This is a per-action claim resting on this
action's OWN two edges' isolation runs (the table above), not a
cross-reference to a different file's run (the prior draft's M2.2 defect):
its only calls are `extractTextFromBuffer` (via the `@/lib/office-extract`
edge - 0 violations against BOTH targets) and `checkWireBudget` (via the
`@/lib/upload-budget` edge - 0 violations against BOTH targets, and the
module has no imports of its own at all - `grep -c "^import"
src/lib/upload-budget.ts` -> 0, exit 1). This action never touches the
`./github` edge that carries every hit in the table above - that edge belongs
only to the sibling action, traced next. **No owner-only resource on this
path, against either target.**

**`extractDeckSourceRepoAction` (`:57-71`, guard at `:58`) - REAL exposure,
must move to `requireAppOwner()`.** The call chain, each hop opened directly:

| Hop | Site | What it does |
|---|---|---|
| 1 | `deck-source.ts:58` | `await requireUser()` - the caller's own guard, permissive |
| 2 | `deck-source.ts:63` | `await ingestRepoAction(trimmed)` - a real function call, not a barrel re-export |
| 3 | `src/app/actions/github.ts:258-267` | `ingestRepoAction` itself calls `await requireOwner()` at `:260` (a SEPARATE, also-permissive guard - see section 5, now closed by RULING 91), then `await ingestRepo(parsed.owner, parsed.repo, {}, branch)` at `:263` |
| 4 | `src/lib/github.digest.ts:262-276` | `ingestRepo` calls `await getRepo(owner, repo)` at `:274` |
| 5 | `src/lib/github.repos.ts` | `getRepo` calls `ghFetch`, which sets `Authorization: Bearer ${githubToken()}` at `:32`; `githubToken()` (`:8-12`, re-opened, corrected from the prior draft's `:8-11`) reads `process.env.GITHUB_TOKEN` unconditionally at `:9`, throws at `:10` if unset, returns at `:11`, closes at `:12` - no identity check of any kind |

This is a genuine, function-level call chain (every hop's source opened, not
inferred from the closure tool), matching the class R2's own B1 finding
established for `grading.ts`. The `./github` edge's per-edge walk (2.0's
table) confirms 17 violations against `github.repos.ts`, all via
`app/actions/github.ts`; the file-rooted whole-file walk with `lib/canvas.ts`
also forbidden rises from 17 to 19 (the 2 extra are the walk hitting the
now-forbidden canvas boundary itself, from `grade/extraction.ts` and
`grade/engine.ts` - unrelated to this action's own chain), confirming the
GitHub route is independent of the canvas barrel and is real.

### 2.3 The header comment is false for one of the file's two actions

`deck-source.ts:16-20`:

> "requireUser, not the deprecated requireOwner alias... These actions are
> correctly user-scoped: a deck is built from material the caller supplies,
> per-user, with no owner-only resource."

**This is a blanket, per-file claim asserted without checking token
reachability, and it is false for `extractDeckSourceRepoAction`.** It is true
for `extractDeckSourceFileAction` alone. **Requirement for wave 1:** replace
the blanket claim with a per-action one - state that
`extractDeckSourceFileAction` reads only the caller's own uploaded bytes (no
owner-only resource on either target) and that `extractDeckSourceRepoAction`
reaches the GitHub PAT via `ingestRepoAction` (cite `github.ts:258`,
`github.digest.ts:262`, `github.repos.ts:32`) and is therefore
`requireAppOwner()` below, retracting the "no owner-only resource" claim as it
applied to that action.

### 2.4 `src/app/actions/walkthrough-announcement.ts` - 8 sites, 0 real, all clean against both targets

```
grep -n "await requireUser()" src/app/actions/walkthrough-announcement.ts   -> :121,:140,:164,:189,:286,:394,:542,:603 (8 lines, exit 0)
grep -c "await requireOwner()" src/app/actions/walkthrough-announcement.ts  -> 0 (exit 1)
```

8 requireUser / 0 alias - matches the backlog row's own count. Its own header
(`:19-23`) makes no claim about resource-scoping, only about which guard
function runs - that claim is true and needs no correction.

**All 8 exported actions, read per-action against the per-edge table above:**
`getMostRecentAnnouncementExemplarAction`, `listAnnouncementExemplarsAction`,
`saveAnnouncementExemplarAction`, `deleteAnnouncementExemplarAction` -
Supabase only (`createServiceClient`/the four `announcement-exemplars.ts`
functions, reached via the `@/lib/announcement-exemplars` edge - 0/0 against
both targets), no GitHub or Canvas import.

`gatherWalkthroughResourcesAction` calls `deriveResourceConcepts` and
`findResourceLinksForConceptsAction`. **Corrected citation (M2.1):**
`deriveResourceConcepts` is imported from `./learning-resources-generator`
(`walkthrough-announcement.ts:47`), NOT from `./learning-resource-links` as
the prior draft folded it into - the two are different edges in the table
above, and both were actually walked this pass: `./learning-resources-generator`
-> 0/0 (the module `deriveResourceConcepts` genuinely lives in);
`./learning-resource-links` -> 0/0 (where `findResourceLinksForConceptsAction`
lives). Both of `gatherWalkthroughResourcesAction`'s own calls are now
correctly attributed to a real, walked edge, against both targets.

`draftWalkthroughAnnouncementAction` (`:385`, guard `:394`) and
`draftWalkthroughVideoScriptAction` (`:537`, guard `:542`) - **corrected
citation (M2.3):** the prior draft said "no canvas or github import anywhere
in the file for either," which is false and contradicted by the very next
paragraph - the file DOES import `createAnnouncementFromMarkdown` from
`@/lib/canvas` at `:56`. The correct, per-action claim is narrower and true:
neither of these two functions CALLS it. `grep -n
"createAnnouncementFromMarkdown" src/app/actions/walkthrough-announcement.ts`
-> `:56` (the import), `:590` (a comment), `:604` (the one call site) - three
lines, none inside either draft function's own body (`:385-536` and
`:537-594` respectively). Their own calls are `callLlm`/prompt builders only,
reached via edges already at 0/0 against both targets in the table above.

**The one exception, traced to ground: `postWalkthroughAnnouncementAction`
(`:595-609`, guard at `:603`)** is the ONLY action in this file that calls
`createAnnouncementFromMarkdown` (the single call at `:604`), imported from
`@/lib/canvas` (`:56`). `src/lib/canvas.ts` is a pure re-export barrel (every
line is `export {...} from "./canvas/..."`, confirmed by reading all 124
lines - no `import` statement of its own; `scanRuntimeEdges` over the file
returns `{"export-from":14}` and no `import` edges).
`createAnnouncementFromMarkdown` is defined in `./canvas/announcements`
(`canvas.ts:76`, body at `src/lib/canvas/announcements.ts:420`).

**Two independent checks (corrected from the prior draft's "three" - m2), plus
the per-edge table above, which is now the actual proof:**

1. **Root at the specific submodule the action actually calls,**
   `lib/canvas/announcements.ts`, against BOTH targets:
   - `lib/github.repos.ts` -> **0 violations** (23 nodes).
   - `lib/canvas-credentials.ts` -> **1 violation** (12 nodes):
     `TRAIL lib/canvas/announcements.ts -> lib/canvas-core.ts => lib/canvas-credentials.ts`.
   Root at the SIBLING submodule causing the file-level GitHub hit,
   `lib/canvas/listings.ts` -> **17 violations** against `github.repos.ts`,
   same trail the per-edge table's `@/lib/canvas` row carries.
2. **Barrel isolation - also forbid `lib/canvas.ts` itself, against
   `github.repos.ts`:** violations drop from 17 to 1, and the 1 remaining is
   just `walkthrough-announcement.ts -> lib/canvas.ts` (the walk hitting the
   now-forbidden boundary at the direct import edge), not a route *through*
   it.

The prior draft counted a third, "file-level, only `github.repos.ts`
forbidden -> 17 violations, all trails begin via the barrel" as independent
evidence. **It is not (m2, corrected):** `@/lib/canvas` is this file's ONLY
canvas import, so forbidding `lib/canvas.ts` at check 2 necessarily removes
every canvas-derived hit regardless of which submodule the route actually
ends in - check 2 establishes only that the route passes through the barrel,
not which submodule beyond it the action calls. Check 1 (rooting at the
specific submodule) is what does that work. The conclusion is unchanged; the
count of independent legs is two, not three.

**Containment for the one real reach, stated with citations (closing B1 for
this action, which the prior draft left as one unmeasured sentence):**
`postWalkthroughAnnouncementAction`'s one violation against
`canvas-credentials.ts` is real - `lib/canvas/announcements.ts` genuinely
imports `lib/canvas-core.ts`, which imports `lib/canvas-credentials.ts`
(`canvas-core.ts:30`) and calls `resolveCanvasCredential` at three sites
(`:135`, `:155`, `:189`, all opened directly). `canvas-core.ts` has no direct
Canvas `process.env` read of its own - its only three `process.env`
occurrences are in its own header comment (`:13`, `:14`, `:21`) explaining
why not. `resolveCanvasCredential`
(`src/lib/canvas-credentials.ts:189-228`) reads the CALLING identity's own
stored row first (`:193-196`) and reaches `resolveOwnerEnvCredential` - the
function that actually touches the owner's env pair - only inside `if
(identity.role === "owner")` (`:220-225`); any other caller gets
`CANVAS_CREDENTIAL_REQUIRED_MESSAGE` (`:227`) instead. So this action's second
reach is contained AT THE CREDENTIAL, exactly R2's own Group-B containment
argument (`docs/r2-scope.md:363-366`), reproduced here rather than merely
cited: an approved non-owner who somehow drove this code path would get their
own missing-credential error, never the owner's Canvas token. `All 8 actions
stay on `requireUser()`, correctly - against `github.repos.ts` because none
of them reach it at all, and against `canvas-credentials.ts` because the one
that does reach it (this action) is contained at the resolver regardless of
which of the two guards sits above it.

### 2.5 The other two pending files, confirmed rather than assumed, against both targets

- **`src/app/actions/media-likeness.ts`**: `grep -c "await requireAppOwner()"`
  -> **11**; `grep -c "await requireUser()\|await requireOwner()"` -> **0**.
  Already owner-only on every export. Closure against both targets, this
  pass: `github.repos.ts` -> 17 violations (415 nodes), trail through
  `lib/supabase/courses.ts -> ... -> app/components/content-tab/utils.ts ->
  app/actions.ts -> app/actions/accommodations.ts -> lib/canvas/listings.ts ->
  ... -> lib/github.ts` - a barrel artifact via the `app/actions.ts` barrel,
  routed through a CLIENT-COMPONENT module (`content-tab/utils.ts`), which is
  a more interesting artifact than "the barrel" and is a candidate finding
  for someone else's row, not this one (m4, unchanged). `canvas-credentials.ts`
  -> **1 violation** (415 nodes), trail
  `... -> app/actions/accommodations.ts -> lib/canvas/listings.ts ->
  lib/canvas-core.ts => lib/canvas-credentials.ts`. Neither changes this
  file's disposition: it is already `requireAppOwner()` throughout, so both
  reaches are moot - it needs only bookkeeping (move into `GITHUB_FILES`, no
  `GITHUB_NOT_OWNER_ONLY` entries since it has zero `requireUser()` calls to
  except).
- **`src/app/actions/llm-content.ts`**: `grep -c "^export async function"` ->
  **9**; `grep -c "await requireAppOwner()\|await requireUser()\|await requireOwner()"`
  -> **0** - no guard call of any kind on any export. All 9 exported action
  names are confirmed present in `PINNED_UNGUARDED`
  (`action-guard-coverage.test.ts:288-317`) by a set comparison (`comm -23`
  between the two sorted name lists -> empty output). **This is a different
  defect class - no guard at all, not a wrong guard - already tracked by that
  pre-existing, separate ratchet.** Closure against both targets: `github.repos.ts`
  -> 17 violations (133 nodes), trail `llm-content.ts -> lib/grade.ts ->
  lib/grade/extraction.ts -> lib/grade/repo-content.ts -> lib/github.ts`, a
  direct, non-barrel edge; `canvas-credentials.ts` -> **1 violation** (132
  nodes), trail `llm-content.ts -> lib/grade.ts -> lib/grade/extraction.ts ->
  lib/canvas.ts -> lib/canvas/discussions.ts -> lib/canvas-core.ts =>
  lib/canvas-credentials.ts`. Both reaches matter only for whoever eventually
  adds a guard to this file (section 7, handover).

---

## 3. The instrument, and the fix to the one that does not execute what it claims

**Wave 0 (`b25ed71`) already landed the source-text closure instrument this
row needed for FILE-level detection** - re-run this pass:

```
npm run test:paths -- src/app/actions/walkthrough-announcement.test.ts src/app/actions/action-guard-coverage.test.ts src/lib/supabase/auth.test.ts

PASS src/app/actions/walkthrough-announcement.test.ts (28 tests) 23ms
PASS src/lib/supabase/auth.test.ts (38 tests) 29ms
PASS src/app/actions/action-guard-coverage.test.ts (19 tests) 15929ms
  PASS GITHUB_FILES tracks the live import-graph closure - a floor, not a trusted final list (RULING 80/84) 14415ms
Test Files  3 passed (3)
     Tests  85 passed (85)
```

`githubReachingActionFiles()` (`action-guard-coverage.test.ts:177-196`) walks
EVERY `"use server"` action file under `src/app`, reusing `walkRuntimeGraph`
with `forbiddenPathPrefixes: ["lib/github.repos.ts"]` - **only one of
RULING 90's two targets**, which is correct for THIS instrument's own job
(the GitHub-cohort ratchet), not a gap this document needs to widen; RULING
90 binds the CLASSIFICATION walks in section 2 above, not this pre-existing,
separately-scoped ratchet.

**What it can prove and what it cannot:** the closure test proves a FILE's
import graph contains code that spends the token - it does not, and cannot,
prove a specific ACTION's body calls that code. Section 2 is what closes that
gap for these files, by opening every hop and walking every direct edge, not
by trusting the closure.

### M1, fixed: the instrument for the fix's OWN test, respecified to actually execute the guard

The R4 backlog row is explicit: "THE INSTRUMENT MUST EXECUTE THE GUARD, not
grep for its name: the idiom is in `src/lib/supabase/auth.test.ts` around
`:432-493` - **mock the client, call the real guard**, assert it rejects."
The prior draft specified instead "mock `@/lib/supabase/auth`... the same
way" as `auth.test.ts:432-444` - but `auth.test.ts` does NOT mock
`@/lib/supabase/auth`; it mocks `"./server"` (`:19-21`) and `"./app-users"`
(`:23-26`) and calls the REAL `requireAppOwner`/`requireUser`. Mocking
`@/lib/supabase/auth` directly replaces the guard with a stub; the real guard
never runs.

**Fixed: wave 1's new tests use the SAME client-mock shape as
`auth.test.ts`, verbatim, not a module mock of the guard.** For
`src/app/actions/deck-source.test.ts` and the new `src/app/actions/github.test.ts`
(section 6):

```
vi.mock("@/lib/supabase/server", () => ({ createClient: vi.fn() }));
vi.mock("@/lib/supabase/app-users", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/supabase/app-users")>();
  return { ...actual, getAppUser: vi.fn(), ensureAppUser: vi.fn(), ensureAppUserRowExists: vi.fn() };
});
```

configured exactly as `auth.test.ts:432-436` configures an "active
instructor" (`status: "active", role: "instructor"`), then calling the REAL,
un-mocked `extractDeckSourceRepoAction` / `ingestRepoAction` and asserting the
rejection. Per this repo's rule against cross-test-file imports
(`auth.test.ts:13-16`'s own stated reason - importing a helper from another
`*.test.ts` re-runs its describe blocks), the small `fakeAppUserRow`/
`makeFakeAuthClient`-shaped helpers (`auth.test.ts:33`, `:67`) are duplicated
locally in each new test file, not imported.

**The coherent distinction the contrast pair needs, stated (M4a):** a
does-not-throw test over a mocked action that never calls `requireAppOwner()`
proves only that the action runs - manufacturing nine of them for
`walkthrough-announcement.ts`'s clean actions would prove nothing falsifiable,
and section 3's refusal to do that is correct and unchanged. The contrast
pair in `deck-source.test.ts` is different in kind: it is meaningful only
because `deck-source.ts` has a STRICT SIBLING in the same file whose split is
exactly the fact under test - `extractDeckSourceFileAction` (stays
`requireUser()`) sitting beside `extractDeckSourceRepoAction` (moves to
`requireAppOwner()`), using the identical mocked "active non-owner" identity
for both calls. `walkthrough-announcement.ts` has no such sibling split (all
8 stay on `requireUser()`), which is why it gets none. The prior draft never
stated this distinction, which is what made section 3's refusal and section
6's own contrast test read as contradicting each other.

**Why the other 9 sites still get no matching executing test**, unchanged
from the prior draft's reasoning: the safety argument for them rests on the
ABSENCE of an import edge (section 2), which the already-landed,
continuously re-run closure test re-verifies at the file level on every run,
and a does-not-throw test over a mocked action that never calls the guard
would prove nothing falsifiable (M4a above).

---

## 4. What an unauthorised caller could actually do - the sentence that matters

**Today**, any approved `active`, non-owner account that calls
`extractDeckSourceRepoAction` (the "import materials from a GitHub repo"
control on the deck-source panel) OR `ingestRepoAction` directly (five
workflow-registry call sites, section 5) can read any repository the
deployment's single `GITHUB_TOKEN` can read - the same class of exposure R2
exists to close, on sites R2's own census could not see. `githubToken()`
(`github.repos.ts:8-12`, corrected citation - m5) has no identity check of
any kind; the PAT is a single, deployment-wide secret, not a per-user
credential. **Per `docs/r2-scope.md:97` (row 30 of that document's own
disposition table) and `docs/multi-user-login-architecture.md:426-431`**: the
Group-C rule this row's other 9 sites correctly sit under ("shared LLM key,
no owner-private identity behind it -> `requireUser()`") does not close the
separate, standing obligation for per-user spend quotas on that same shared
key before sign-up opens - that obligation is not R2's, not R4's, still owed,
and neither row closes it (M5, fixed: the prior draft's "gets nothing extra"
sentence cited neither the rule nor the obligation it silently rests on).

**The same caller today gets nothing extra from any of the other 9 sites** -
they already had a per-user Supabase row's own data (the 4 exemplar actions),
a shared LLM call scoped to their own account under the Group-C rule just
cited (`gatherWalkthroughResourcesAction`, the two draft actions), or the
ability to post a Canvas announcement they already had via
`createAnnouncementFromMarkdown`'s own, separate Canvas credential path -
contained at `resolveCanvasCredential`, per section 2.4's measured
containment, not an unmeasured assertion as the prior draft left it.

**Context, not a weakening of the fix's mandate:** `docs/r2-scope.md:727`
records "REL1 says no members today" - i.e. this deployment currently has no
approved, non-owner account at all, so the caller population able to exploit
either exposure is empty in production right now. Nothing in this checkout
re-verifies that count (no `.env`, no live session), so this is cited as
R2's own stated fact, not re-derived here. It does not change what the guard
must be; it changes only how urgent the closure is against a live population,
which this document does not need to price.

---

## 5. RULING 91 applied: this fix also closes `ingestRepoAction`'s own guard, and states the cost

**RULING 91's answer is (a): R4 also swaps `github.ts:260`.** The prior
draft's section 5 named `ingestRepoAction`'s own guard as a separate,
still-permissive call site and filed it as residual R4-r1, handed to R2 wave
1. The check found the consequence the prior draft never drew: `ingestRepoAction`
is itself an exported async function in a `"use server"` module
(`src/app/actions/github.ts:258`), i.e. its own RPC endpoint, independently
invocable and client-reachable TODAY through the workflow registry that ships
in the client bundle:

```
grep -rn "ingestRepoAction" src --include=*.ts --include=*.tsx | grep -v "\.test\."
  -> src/lib/workflows/registry/steps.github.ts:16, :598
     src/lib/workflows/registry/steps.grading-repos.helpers.ts:27, :113
     src/lib/workflows/registry/steps.rubrics.materials.ts:12, :96, :391
     src/lib/workflows/registry/steps.rubrics.ts:16, :459
     src/lib/workflows/registry-helpers.sources.ts:27, :695
     src/app/actions/deck-source.ts:24, :63
```

Re-confirmed this pass. `src/app/components/WorkflowBuilder.tsx` imports the
registry (`grep -rln "workflows/registry" src/app/components` -> 24 files,
re-confirmed), which is the whole point of this repo's registry
client-bundle guard - so an approved `active` non-owner does not need
`extractDeckSourceRepoAction` at all; `ingestRepoAction` gives the identical
`ingestRepo -> getRepo -> ghFetch -> Bearer ${githubToken()}` chain through a
surface the browser already reaches. **Shipping section 2's fix alone would
have hardened the wrapper and closed nothing** - the same account calls the
inner action instead, and every gate stays green.

**What this wave now does, and what it deliberately still does not do.**
`src/app/actions/github.ts` carries 27 `await requireOwner()` calls
(`grep -c` above, unchanged) and is one of R2's own 41-file/255-call Group-A
cohort (`docs/r2-scope.md` section 3's file list). **This wave swaps exactly
ONE of those 27 - `ingestRepoAction`'s own guard at `:260` - behind its own
per-action executing test (section 6). It does not adopt the file.** The
other 26 `await requireOwner()` sites in `github.ts` are untouched by this
wave and remain R2's own per-action review obligation in full; nothing in
this document should be read as R2 wave 1 having anything less to do on this
file than it did before.

**The cost, stated plainly rather than left implicit:** this wave's write set
now collides with R2's own wave 1 on TWO files, not one -
`src/app/actions/action-guard-coverage.test.ts` (already named in the prior
draft) and now also `src/app/actions/github.ts` itself. Whichever wave lands
second must re-derive its diff against the tree the first one committed, not
a stale read; if R4 lands first (recommended, section 6), R2 wave 1's own
per-action review of `github.ts` inherits a file where line `:260` has
already moved and must skip it rather than re-decide it. **The alternative -
shipping this wave as a wrapper-only fix and leaving `ingestRepoAction` open
- was rejected by the ruling because it would ship a row that reads as
closed while the exposure it names is fully open**, which is the exact
failure shape this loop has caught before; the cost of the collision is real
and is accepted in exchange for actually closing the exposure this week
instead of when R2 wave 1's own two-round cap settles.

**R4-r1 (the prior draft's residual for this exact gap) is retired, not
carried forward** - the thing it was tracking is now built here (section 6),
not deferred to a receiver whose own artifact is currently NOT BUILDABLE.

---

## 6. Wave plan - one wave, now touching two files R2 also owns

**File-set collisions, named up front, both now:** this wave writes
`src/app/actions/action-guard-coverage.test.ts` AND `src/app/actions/github.ts`,
both also inside R2's own wave 1 write set. Neither wave is concurrency-safe
with the other (`parallel-disjointness.md`'s file-set test fails on both).
**Recommendation, unchanged and now more load-bearing: land this wave FIRST.**
It is small and self-contained (one guard swap on top of the prior draft's
bookkeeping); R2's own wave 1 is still blocked on its own two-round cap
(`docs/r2-check.md` verdict NOT BUILDABLE, revision in progress) and is far
larger (255 call sites across 41 files). Whichever lands second re-derives
its diff against the tree the first one committed.

### Wave 1 - the only wave

**Write set:**

- `src/app/actions/deck-source.ts` (production) - swap
  `extractDeckSourceRepoAction`'s guard from `requireUser()` to
  `requireAppOwner()` (import `requireAppOwner` alongside `requireUser`,
  which `extractDeckSourceFileAction` still needs); correct the header
  comment per section 2.3.
- `src/app/actions/github.ts` (production, RULING 91) - swap
  `ingestRepoAction`'s guard from `requireOwner()` to `requireAppOwner()` at
  `:260` (import `requireAppOwner` alongside `requireOwner`, which the other
  26 call sites in this file still need, untouched). No other line in this
  file changes.
- `src/app/actions/deck-source.test.ts` (**new** - confirmed no such file
  exists). Two executing tests, mocking `@/lib/supabase/server` and
  `@/lib/supabase/app-users` exactly as `auth.test.ts:19-30` does (section 3's
  M1 fix, NOT a module mock of `@/lib/supabase/auth`): (a) configured as an
  active non-owner, call `extractDeckSourceRepoAction`, assert it rejects
  with the owner-only message; (b) same mock, call
  `extractDeckSourceFileAction` with `base64: ""`, assert it resolves to
  `{error: "Choose a source file."}` and does NOT reject with the owner-only
  message - the contrast pair, meaningful because this file has a real
  strict sibling split (section 3's M4a fix states why).
- `src/app/actions/github.test.ts` (**new** - confirmed no such file exists;
  the only existing test that imports this production module,
  `src/app/actions/github.grading.test.ts`, module-mocks
  `@/lib/supabase/auth` wholesale for a DIFFERENT action, `gradeReposAction`,
  and never exercises `ingestRepoAction` - re-confirmed by grep, so it is a
  GATE re-run, not a write-set member; listed below). One executing test,
  same client-mock idiom, active non-owner: call `ingestRepoAction`, assert
  it rejects with the owner-only message.
- `src/app/actions/action-guard-coverage.test.ts`:
  - Move `"actions/deck-source.ts"`, `"actions/walkthrough-announcement.ts"`,
    `"actions/media-likeness.ts"` out of `GITHUB_FILES_PENDING_ENUMERATION`
    (`:844-849`) and into `GITHUB_FILES` (`:767-809`); update
    `GITHUB_FILES_PENDING_ENUMERATION` to contain only
    `"actions/llm-content.ts"`.
  - Add to `GITHUB_NOT_OWNER_ONLY` (`:817`, currently `{}`): one entry for
    `extractDeckSourceFileAction` and eight entries, one per
    `walkthrough-announcement.ts` action - unchanged from the prior draft,
    nine entries, each with its verified reason from section 2.
  - **B3, fixed: delete `:852-859`'s `it("GITHUB_NOT_OWNER_ONLY starts empty
    - no per-action review has run yet", ...)` entirely.** Nine entries is
    not zero, so this assertion goes red the moment the review above lands;
    its job (proving no review had run yet) is done the moment a review
    runs. `:861-867`'s "every entry names a real action export with a stated
    reason" already asserts the thing that actually matters once the list is
    non-empty, and needs no change.
  - **M4b, fixed: add a converse-ratchet loop for `GITHUB_NOT_OWNER_ONLY`**,
    modelled on the media block's own converse check
    (`action-guard-coverage.test.ts:679-700`, which loops over every
    non-owner-only media action asserting it still calls `requireUser(`
    directly, guarding against silent over-tightening). The GitHub-cohort
    mirror: for every name in `GITHUB_NOT_OWNER_ONLY`, assert
    `BARE_REQUIRE_USER_CALL.test(action.body)` is `true` - "should still call
    requireUser() directly, having been reviewed as safe to stay permissive."
    Without this, a later sweep could silently flip any of the nine to
    `requireAppOwner()` while their stale "reviewed safe, stays permissive"
    reasons keep reading as current, with every existing gate green.
  - Correct the wave-0 comment's own off-by-one at `:829` ("7 actions") to
    "8 actions" - measured this pass as 8.
- No change to `src/app/actions/walkthrough-announcement.ts`,
  `src/app/actions/media-likeness.ts`, or `src/app/actions/llm-content.ts`.

**Gate:**

```
npm run test:paths -- src/app/actions/deck-source.test.ts src/app/actions/github.test.ts src/app/actions/github.grading.test.ts src/app/actions/walkthrough-announcement.test.ts src/app/actions/action-guard-coverage.test.ts src/lib/supabase/auth.test.ts
npx tsc --noEmit --incremental false
npm run lint
git status --short   (against exactly: deck-source.ts, deck-source.test.ts [new], github.ts, github.test.ts [new], action-guard-coverage.test.ts)
```

`src/app/actions/github.grading.test.ts` is added to the gate (not the write
set) because it is the one existing test whose module-under-test is
`github.ts` (confirmed by `grep -rl "requireOwner\|requireAppOwner"
src --include=*.test.ts | xargs grep -l 'actions/github"\|"\./github"'` ->
exactly this one file, this pass); it module-mocks `@/lib/supabase/auth` with
only `{ requireOwner: vi.fn(...) }` (`:50`), so after this wave's import
change `github.ts` also destructures `requireAppOwner` from that same mocked
module. `requireAppOwner` never being called anywhere in this test file's own
`gradeReposAction` code path means this should stay green, but it was NEVER
RUN against this exact change before, so it is named explicitly as a gate
item rather than assumed safe.

Then a whole-tree confirmation that no OTHER file's `GUARD_CALL`/closure
result moved: `npm run test:paths -- src/app/actions/action-guard-coverage.test.ts`
alone, checking the other (non-R4) assertions in that file still pass
unchanged.

**Diff-size estimate (not yet built - R4-r3), re-derived for the wider write
set RULING 91 adds:** production guard swaps + header rewrite in
`deck-source.ts` (~15 lines) + one-line guard swap plus import edit in
`github.ts` (~3 lines); `deck-source.test.ts` (new, ~70-90 lines: client-mock
setup duplicated per section 3, two tests); `github.test.ts` (new, ~50-70
lines: same client-mock setup duplicated, one test); bookkeeping edit to
`action-guard-coverage.test.ts` (~35-45 lines: 9 `GITHUB_NOT_OWNER_ONLY`
entries + 2 set moves + 1 comment fix + deleting the `:852-859` block +
adding the converse-ratchet loop). **Estimated ~175-215 lines across 5
files** - roughly double the prior draft's 3-file, ~90-110-line estimate,
because RULING 91 adds a second production file and a second new test file.
Still small enough for one reviewer's single pass; no wave here approaches
the 60+-file scale R2 itself flagged as a real concern. The concrete
threshold this estimate is checked against is in R4-r3 (section 7): FAILS if
`git diff --stat`'s combined insertion+deletion count across these 5 files
exceeds **260** (roughly 20% over the high end of this estimate).

---

## 7. Residuals

| # | Residual | Owner | Instrument | Object / direction of failure | Step |
|---|---|---|---|---|---|
| R4-r2 | `llm-content.ts` stays in `GITHUB_FILES_PENDING_ENUMERATION`; its 9 unguarded actions belong to the pre-existing `PINNED_UNGUARDED` ratchet, and it ALSO closure-reaches `lib/canvas-credentials.ts` once (section 2.5) - a larger, separate backlog item this row does not scope | **the orchestrator, at this row's disposal** (corrected from the prior draft's "whichever future item" - not an owner) | `action-guard-coverage.test.ts`'s already-landed closure test, plus this document's measured, non-barrel closure routes for both targets (section 2.5) | Any `llm-content.ts` action getting a guard for the first time without applying RULING 83's GitHub-cohort default and RULING 90's two-target range | **File a backlog row** ("give `llm-content.ts`'s 9 unguarded actions a real guard, per-action-reviewed against BOTH owner-private targets, not just GitHub") at the push that closes R4, naming this document as the source - matching R2's own retired-Fork-2 handover pattern (`docs/r2-scope.md` section 9), not a residual with an invented owner |
| R4-r3 | The wave-1 diff-size estimate (section 6) is pre-build, not measured against real code, and is now larger than the prior draft's estimate (5 files, not 3) | wave-1 implementer | `git diff --stat` against the write set, at the wave gate | The 5-file write set (`deck-source.ts`, `deck-source.test.ts`, `github.ts`, `github.test.ts`, `action-guard-coverage.test.ts`). **FAILS if the combined insertion+deletion count exceeds 260 lines** (~20% over the ~215-line high end of the section-6 estimate), which would call the "one reviewer, one pass" characterization into question | Wave-1 gate |
| R4-r4 | `action-guard-coverage.test.ts` AND `src/app/actions/github.ts` are BOTH shared write targets with R2's own wave 1 (section 5, widened by RULING 91 from one file to two) | orchestrator, at dispatch | `git status --short` immediately before either wave starts, on BOTH files | Concurrent (non-sequenced) dispatch of both waves on either file. FAILS if one wave's edits are overwritten by the other landing on a stale tree | Sequence the two waves; land R4 first (small, and RULING 91 was decided for this row, not for R2's); R2 wave 1's own per-action review of `github.ts` must skip line `:260` once R4 lands, not re-decide it |
| R4-r5 | No live signed-in session exists in this checkout (`ls .env* 2>&1` -> nothing; `docs/loop/this-repo.md`) | repo owner | A real session: an approved non-owner calls "import from repo" on the deck-source panel (expect the owner-only message); the SAME account triggers a workflow step that calls `ingestRepoAction` directly (e.g. `steps.github.ts:598`) and gets the same message, not just the deck-source wrapper; the owner does both and succeeds; either account still uses the deck-source file-upload path and succeeds | The member/owner boundary at runtime for BOTH entry points into `ingestRepoAction` (widened by RULING 91 - the prior draft's version checked only the deck-source panel), invisible to any gate in this checkout, in both directions | Run after wave 1 pushes |

**R4-r1 is retired, not carried forward** (section 5): RULING 91 pulls
`github.ts:260` into this wave itself, so the residual's own object no longer
exists as a deferred item.

---

## 8. Notification, not a fork - bookkeeping only, not the security classification

`extractDeckSourceRepoAction` and `ingestRepoAction` both reach the
deployment's single GitHub PAT with no second containment, like the rest of
R2's Group A. **This ships owner-only either way** - the security derivation
in section 2.2 and section 5 is unambiguous (no stated-safe reason exists for
either site), so this is not put to the owner as a security question.

**Corrected from the prior draft (m1): this is a notification, not a fork.**
The prior draft offered "(a) leave it owner-only indefinitely... or (b) file
a backlog row for a future per-user GitHub credential" and then recommended
"(a) now, with a backlog row filed for (b)" - both branches keep
`requireAppOwner()` on both sites, which is the terminating property this
section exists to confirm, and neither branch re-opens anything the other
touches. A question whose recommended answer is "do both" is a decision
already made; putting it to the owner as a fork spends a round trip on
nothing. **Restated as a notification:** once this wave ships, only the
deployment owner can (1) import deck source material directly from a GitHub
repo, and (2), widened by RULING 91, drive any of the five workflow-registry
steps that call `ingestRepoAction` directly (`steps.github.ts`,
`steps.grading-repos.helpers.ts`, `steps.rubrics.materials.ts` (twice),
`steps.rubrics.ts`, `registry-helpers.sources.ts`) - any other approved
account keeps the deck-source file-upload path but loses both of these.
**This is filed as a backlog row for a future per-user GitHub credential
unless the owner says otherwise**, matching R2's own retired-Fork-2 pattern
of a backlog row rather than a residual with no real owner. Per section 4,
`docs/r2-scope.md:727` records that this deployment has no approved
non-owner accounts today (REL1), so the notification's practical cost is
currently zero, not merely low.

---

## 9. Leverage

Per `docs/loop/leverage.md`: this is a security bug fix, not a capability a
user reaches - the honest leverage answer is **none directly**. It removes
unauthorized access to a capability that already exists (importing a repo
as deck material, or as workflow-step input); it adds none. Not manufacturing
a claim for this row, matching R2's own section 8 disposition for the same
reason.

---

## 10. What I could not determine

- **No authorization decision was exercised.** No `.env`
  (`ls .env* 2>&1` returns nothing this pass), so `requireAppOwner()` never
  ran against a real Supabase session in this checkout. Section 2's
  classification is read from source and confirmed by the closure tool
  against both owner-private targets; it is not a runtime observation.
- **No component was rendered.** Whether an approved non-owner sees a
  disabled control or an error toast on either the deck-source panel or a
  workflow-builder step that calls `ingestRepoAction` is not knowable here -
  this is a reading claim about source, not a UI observation.
- **I did not run `npm run build` or `next build`.** This document writes one
  file under `docs/`; the closure scripts ran standalone via `node
  --experimental-strip-types` against the real module-graph module, not
  through the app's own build. The executing test files this wave specifies
  were not run by this document either - they do not exist yet (wave 1
  writes them); the EXISTING three test files re-run in section 3 were run
  via `npm run test:paths --`.
- **I did not review `github.ts`'s other 26 `requireOwner()` call sites**
  beyond the one (`:260`) this row's own chain passes through - that remains
  R2's own per-action review in full, unchanged by RULING 91 (section 5).
- **I did not verify whether any OTHER file beyond these four exists with the
  same shape of blindness.** The already-landed `githubReachingActionFiles()`
  test (wave 0) is itself the instrument that would catch a fifth such file
  - re-run this pass and green (section 3) - so I am trusting an EXECUTING
  instrument's own current result, not asserting I re-derived the whole-tree
  set by hand a second time.
- **I did not determine which of the five `ingestRepoAction` call sites in
  the workflow registry run attended (in a real browser session) versus
  unattended (impersonated).** R2's own M5 finding (an unattended,
  member-scheduled run is refused by BOTH `requireUser()` and
  `requireAppOwner()` outright, before reaching either guard) means this
  wave's guard swap changes nothing for the unattended case; what it changes
  is the ATTENDED case, and this document does not classify which of the
  five sites are ever driven attended by a non-owner. Folded into R4-r5
  rather than a separate residual, since R2-r7's own standing finding
  ("nothing in this repo can exercise an authorization decision") already
  covers why this cannot be settled here.

---

## 11. Gates run for this artifact

```
wc -l docs/r4-scope.md                                        -> see report (run after write)
@(Get-Content docs\r4-scope.md).Count                          -> see report (PowerShell instrument, per traps-spec.md)
LC_ALL=C grep -c '[^ -~\t]' docs/r4-scope.md                    -> see report (pure-ASCII / no-emoji check)
npm run test:paths -- src/app/actions/walkthrough-announcement.test.ts src/app/actions/action-guard-coverage.test.ts src/lib/supabase/auth.test.ts
  -> deck-source.test.ts and github.test.ts do not exist yet (wave 1 creates
     them); the other three, run together this pass, all green (section 3)
git status --short
```

Results recorded in this seat's handback report, because a file cannot
honestly state its own final line count or its own gate output.

**Method notes.** All closure runs used `node --experimental-strip-types`
against the REAL `src/lib/module-graph/runtime-import-graph.ts`, imported via
a `file://` URL from scratchpad driver scripts (`r4rev_edges.ts`,
`r4rev_trail.ts`, `r4rev_25.ts`) OUTSIDE the repo - never transcribed, never a
new walker. No production or test file was mutated by this document or by
its measurements. All `grep`/`wc` exit codes were read directly from the
command, never through a pipe. `npm run test:paths --` is named for every
multi-file check above; no raw multi-path `vitest` command appears anywhere
in this document. Every walk in section 2 states which of RULING 90's two
targets it ran against; none is a partial result left unlabelled.
