# R4 scope check, round 1 of at most two (2026-09-27)

Subject: `docs/r4-scope.md` (508 lines by `wc -l docs/r4-scope.md`, and 508 by
`@(Get-Content docs\r4-scope.md).Count` - the two instruments agree), committed
at `7b7872e` (`git log --oneline -- docs/r4-scope.md` -> exactly one commit, so
there is indeed no prior R4 scope and no disposition table is owed).

Checker: fresh, did not author the scope or the R4 row. Inherited rulings read
from `docs/r2-scope.md` and `docs/r2-check.md`. Every quantity below names the
command that produced it. Every `file:line` was opened. All closure runs reused
the REAL `src/lib/module-graph/runtime-import-graph.ts` via a `file://` import
from scratchpad drivers OUTSIDE the repo
(`.../scratchpad/walk.ts`, `walk2.ts`, `walk3.ts`, `walk4.ts`); no walker was
written. **No production or test file was mutated.** No `git stash`, no
`git add -A`, no `git checkout --`. `docs/r4-check.md` is the only path this
check wrote.

---

## VERDICT: BUILDABLE IN PART

3 blockers, 6 majors, 5 minors.

**None of the nine exonerations is unsafe.** I state that first because it is
the finding with real consequences. All nine are safe, and I verified it with a
measurement the scope did not run (per-import isolation, section A below), plus
a second owner-private resource the scope never walked at all (Canvas
credentials, B1). The scope's CONCLUSION about the nine survives intact. Two of
its three routes to that conclusion do not.

The one confirmation is also correct - `extractDeckSourceRepoAction` genuinely
reaches the PAT - but **the wave as specified closes none of the exposure it
describes** (B2), and **the wave as specified cannot go green** (B3).

---

## A. The nine exonerations, traced forward one at a time

The scope's own evidence for eight of the nine is a FILE-rooted walk plus a
statement that all 17 printed trails start with the same barrel edge. That
argument is under-evidenced for a reason the scope never names:
`walkRuntimeGraph` shares one `visited` set across the whole walk and returns
early on a revisit (`runtime-import-graph.ts:227-228`), and it records a
violation's `trail` as whichever path reached the importing file FIRST. So "all
17 trails begin via `lib/canvas.ts`" is consistent with a SECOND import of the
same file also reaching `lib/github.repos.ts` through a module the canvas walk
had already marked visited. Trail attribution under a shared `visited` set is
not an absence proof.

The measurement that IS an absence proof is a separate walk per direct import.
I ran it (`walk2.ts`, which parses each file's edges with the repo's own
`scanRuntimeEdges` and walks each resolved specifier as its own root):

`src/app/actions/walkthrough-announcement.ts` - 18 runtime edges, one root per
edge, forbidden `lib/github.repos.ts`:

| Import specifier | violations |
|---|---|
| `@/lib/supabase/server` | 0 |
| `@/lib/supabase/auth` | 0 |
| `@/lib/llm` | 0 |
| `@/lib/gemini` | 0 |
| `@/lib/json-slice` | 0 |
| `./writing-style-block` | 0 |
| `@/lib/lms-generation/generation-diag` | 0 |
| `@/lib/announcement-outline` | 0 |
| `@/lib/announcement-outline-types` | 0 |
| `@/lib/walkthrough-announcement-prompt` | 0 |
| `@/lib/walkthrough-announcement-bounds` | 0 |
| `@/lib/walkthrough-script-prompt` | 0 |
| `@/lib/walkthrough-announcement-link-guard` | 0 |
| `@/lib/resource-search-outcome` | 0 |
| `./learning-resources-generator` | 0 (72 nodes) |
| `./learning-resource-links` | 0 (20 nodes) |
| `@/lib/announcement-exemplars` | 0 |
| `@/lib/canvas` | **17** (82 nodes) |

`src/app/actions/deck-source.ts` - 5 edges:

| Import specifier | violations |
|---|---|
| `@/lib/supabase/auth` | 0 |
| `@/lib/office-extract` | 0 |
| `@/lib/upload-budget` | 0 |
| `./github` | **17** (91 nodes) |
| `@/lib/decks/deck-source` | 0 |

That closes the dedup hole: each file has exactly ONE import that reaches the
PAT-spending module, and in each case exactly one exported action calls into
that import (`grep -n "createAnnouncementFromMarkdown" src/app/actions/walkthrough-announcement.ts`
-> `:56` import, `:590` comment, `:604` the single call, inside
`postWalkthroughAnnouncementAction`; `grep -rn "ingestRepoAction" src` -> the
only call inside `deck-source.ts` is `:63`, inside
`extractDeckSourceRepoAction`).

Per-action disposition, each traced forward myself:

1. `extractDeckSourceFileAction` (`deck-source.ts:28-54`, guard `:32`) - SAFE.
   Calls `extractTextFromBuffer` (`src/lib/office-extract.ts`, whose only
   imports are `jszip` and `officeparser` - `grep -n "^import"` -> 2 lines) and
   `checkWireBudget` (`src/lib/upload-budget.ts`, `grep -c "^import"` -> 0,
   exit 1). Both walk to 0 violations. Never touches `./github`.
2. `getMostRecentAnnouncementExemplarAction` (`:117`, guard `:121`) - SAFE.
   `createServiceClient` + `getMostRecentAnnouncementExemplar(supabase, user.id,
   courseId)` at `:124` - scoped on the guard result's own `user.id`.
3. `listAnnouncementExemplarsAction` (`:136`, guard `:140`) - SAFE, same shape,
   `user.id` at `:143`.
4. `saveAnnouncementExemplarAction` (`:158`, guard `:164`) - SAFE, `user.id` at
   `:172`.
5. `deleteAnnouncementExemplarAction` (`:187`, guard `:189`) - SAFE, `user.id`
   at `:194`; the row's own doc comment states the filter is server-derived and
   the code matches it.
6. `gatherWalkthroughResourcesAction` (`:280`, guard `:286`) - SAFE against the
   PAT. Both of its resource imports walk to 0 (see table; note the scope named
   only one of the two - major M2).
7. `draftWalkthroughAnnouncementAction` (`:385`, guard `:394`) - SAFE. Does not
   call `createAnnouncementFromMarkdown` (only `:604` does).
8. `draftWalkthroughVideoScriptAction` (`:537`, guard `:542`) - SAFE, same.
9. `postWalkthroughAnnouncementAction` (`:595-609`, guard `:603`, call `:604`) -
   SAFE against the PAT: `lib/canvas/announcements.ts` rooted alone, forbidding
   `lib/github.repos.ts` -> **0 violations, 23 nodes**. It DOES reach a second
   owner-private resource the scope never walked - see B1, where I measure the
   containment that makes it safe anyway.

Counts confirmed independently of the scope:
`grep -n "await requireUser()" src/app/actions/walkthrough-announcement.ts` ->
`:121,:140,:164,:189,:286,:394,:542,:603` (8 lines, exit 0);
`grep -c "^export async function" src/app/actions/walkthrough-announcement.ts`
-> 8. `grep -n "await requireUser()" src/app/actions/deck-source.ts` -> `:32`,
`:58`. So 8 exports / 8 guards / no unguarded export hiding in the file.

---

## B. The barrel proof, reproduced

All three demonstrations reproduce EXACTLY, including the incidental numbers.

1. File-rooted, forbidding `lib/github.repos.ts`: **17 violations, 144 nodes**,
   and every printed trail begins
   `app/actions/walkthrough-announcement.ts -> lib/canvas.ts ->
   lib/canvas/listings.ts -> lib/canvas/auto-zero.ts -> lib/grade-zeros.ts ->
   lib/grade.ts -> lib/grade/extraction.ts -> lib/grade/repo-content.ts ->
   lib/github.ts -> ...`. Reproduced.
2. Barrel also forbidden: **17 -> 1**, and the 1 is
   `app/actions/walkthrough-announcement.ts => lib/canvas.ts`, the boundary hit
   at the direct import edge, not a route through it. Reproduced.
3. Rooted at `lib/canvas/announcements.ts`: **0 violations, 23 nodes**. Rooted
   at the sibling `lib/canvas/listings.ts`: **17 violations**, same trail.
   Reproduced.
4. Canary before any absence claim: `lib/grade/repo-content.ts` forbidding
   `lib/github.repos.ts` -> **17 violations, 14 nodes**. Non-zero; the filter
   can find something present. Reproduced.
5. The deck-source figures reproduce too: 17 with GitHub forbidden, all via
   `app/actions/github.ts`; **19** with `lib/canvas.ts` also forbidden, and the
   2 extra hits are exactly the canvas-boundary edges from
   `lib/grade/extraction.ts` and `lib/grade/engine.ts` (`walk4.ts` prints both
   trails). The scope named those two files correctly.

**The barrel is a pure re-export module, confirmed by statement parsing.**
`scanRuntimeEdges` over `src/lib/canvas.ts` returns
`{"export-from":14}` - fourteen export-from edges and **no `import`
declarations of any kind**. Corroborated by statement shape:
`grep -c '^export {' src/lib/canvas.ts` -> 14, `grep -c '^import '` -> 0,
`grep -c '^export type'` -> 0, and no top-level statement that is not one of
those 14 blocks. `wc -l src/lib/canvas.ts` -> 124.
**The refutation-looking instrument reproduces as well:** a single-line
`/^export .*\bfrom\b/` count over the same file returns **4**, because 10 of
the 14 blocks are multi-line. The scope's characterisation of its own earlier
error is accurate.
`createAnnouncementFromMarkdown` is re-exported at `canvas.ts:76` and defined at
`src/lib/canvas/announcements.ts:420` (`grep -rn "export async function
createAnnouncementFromMarkdown" src/lib/canvas/`). Both citations correct.

**One framing objection (minor m4):** the scope calls these "three independent
checks, all agreeing." Check 2 is not independent evidence of the barrel-artifact
claim. `@/lib/canvas` is the file's ONLY canvas import, so forbidding
`lib/canvas.ts` necessarily removes every canvas-derived hit whether the route
ends in `announcements.ts` or in `listings.ts`. Check 2 establishes that the
route passes through the barrel; only check 3 distinguishes "through it to an
unrelated submodule" from "into the submodule the action calls." The conclusion
is right; one of the three legs carries no weight, and calling it independent
inflates the evidence.

---

## C. The one confirmation, hop by hop

Every hop opened. All five citations correct:

| Hop | Cited | Verified |
|---|---|---|
| 1 | `deck-source.ts:58` `await requireUser()` | yes |
| 2 | `deck-source.ts:63` `await ingestRepoAction(trimmed)` | yes, a real call |
| 3 | `github.ts:258-267`, `requireOwner()` at `:260`, `ingestRepo(...)` at `:263` | yes, all three |
| 4 | `github.digest.ts:262-276`, `getRepo` at `:274` | yes |
| 5 | `github.repos.ts` `ghFetch` sets `Authorization: Bearer ${githubToken()}` at `:32`; `githubToken()` reads `process.env.GITHUB_TOKEN` with no identity check | yes; the function spans `:8-12`, not `:8-11` (minor m5) |

`src/lib/supabase/auth.ts:451-453` is verbatim `export async function
requireOwner(): Promise<AuthorizedUser> { return requireUser(); }`. Confirmed.

The header comment is confirmed false as charged: `deck-source.ts:16-20` says
"These actions are correctly user-scoped ... with no owner-only resource" -
plural, covering both exports, and false for the repo one. The scope's specified
replacement text is true of the code in both halves.

**And then the question the scope does not ask.** See B2.

---

## BLOCKERS

### B1 - the classifier was silently narrowed to ONE owner-private resource, and the resource `postWalkthroughAnnouncementAction` actually touches was never walked

**Class: NARROW-FILTER COHORT. REPEAT-OF the class `docs/r2-check.md` B1
established.** Same corrective rule - derive membership against every form the
rule ranges over, and canary the widened derivation - so this is a repeat, not
a new class, even though the narrowness is in the TARGET SET rather than in the
specifier form.

The scope quotes R2's classifying question as given: "is the call-site guard the
only thing containing an **owner-private resource** on this path?" (`r2-scope.md`
section 3, restated at `r4-scope.md:55-61` as RULING 84). R2 itself runs that
question against TWO targets: `lib/github.repos.ts` and
`lib/canvas-credentials.ts` (`r2-scope.md:225`, `:246-247`, `:359-374`). **Every
walk in `docs/r4-scope.md` forbids only `lib/github.repos.ts`.** The word
"Canvas" appears in the document only as the name of the barrel artifact and in
one unmeasured sentence.

That matters because the exonerated action reaches the other target directly:

```
lib/canvas/announcements.ts | canvas-credentials :: violations=1 nodes=12
    TRAIL lib/canvas/announcements.ts -> lib/canvas-core.ts => lib/canvas-credentials.ts
```

Two hops, no barrel. `app/actions/walkthrough-announcement.ts` rooted at the
file: 1 violation, same trail through `lib/canvas.ts -> lib/canvas/discussions.ts
-> lib/canvas-core.ts`. R2's own canary for this target reproduces
(`app/actions/canvas-inbox.ts` -> 1 violation), so the filter is proven capable
of firing. So `postWalkthroughAnnouncementAction`, on `requireUser()`, is one
call away from a module whose job is resolving a Canvas credential - and the
scope's only statement about it is section 4's unmeasured assertion that the
caller "already had [the ability] via `createAnnouncementFromMarkdown`'s own,
separate Canvas credential path (unaffected by this row)". No walk, no citation,
no containment argument.

**I measured the containment, and it holds, so the exoneration survives:**
`src/lib/canvas-credentials.ts:189` `resolveCanvasCredential` reads the CALLING
identity's own stored row first (`:193-196`) and reaches
`resolveOwnerEnvCredential` only inside `if (identity.role === "owner")`
(`:220-225`), otherwise throwing `CANVAS_CREDENTIAL_REQUIRED_MESSAGE`. And
`src/lib/canvas-core.ts` has no direct Canvas `process.env` read - its only
`process.env` occurrences are in its own header comment (`:13`, `:14`, `:21`)
explaining why; all three credential fetches go through
`resolveCanvasCredential` (`:135`, `:155`, `:189`). This is exactly R2's Group-B
containment argument, which R2 states explicitly and R4 does not state at all.

**Why it is still a blocker rather than a minor.** The scope reduces a
ten-site exposure claim to one on the strength of absence claims, and eight of
those absence claims are measured against a filter that does not cover the
resource the exonerated code reaches. A reader auditing the nine cannot tell
from this document that a second owner-private resource was ever considered, and
the one sentence that gestures at it is the kind of asserted-containment claim
`r2-check.md` M5 already flagged as "a reading claim credited as a behavioural
fact". If `resolveCanvasCredential` had NOT been contained, this document would
have exonerated live exposure and said nothing was measured wrong.

**Fix in the one revision:** re-run every walk in section 2 with
`forbiddenPathPrefixes: ["lib/github.repos.ts", "lib/canvas-credentials.ts"]`
(or as a second pass), publish both columns, cite R2's own canary, and state the
Canvas containment with `canvas-credentials.ts:220` and `canvas-core.ts:135/155/189`
the way R2 section 3 does. The nine stay exonerated; the derivation stops being
one-eyed. **Disposition: fixable in the one revision.**

### B2 - the wave hardens the outer wrapper and leaves a client-reachable sibling on the same chain wide open, so it closes none of the exposure section 4 describes

**Class: OUTER GUARD HARDENED, EQUIVALENT ENTRY POINT LEFT OPEN. NEW.** No
class in R2's round shares its corrective rule (which is: classify every
EXPORTED entry point on a credential-spending chain, not just the one the row
found first, and say what the wave does not close).

The scope knows `ingestRepoAction`'s own guard is permissive; section 5 says so
and files it as residual R4-r1. What it never says is the consequence.

`ingestRepoAction` is itself an exported async function in a `"use server"`
module (`src/app/actions/github.ts:258`), i.e. its own RPC endpoint, guarded
only by `requireOwner()` at `:260` - which is literally `return requireUser()`.
It is not merely a second hop behind the action R4 hardens; it is independently
invocable, and it is client-reachable today:

```
grep -rn "ingestRepoAction" src --include=*.ts --include=*.tsx | grep -v "\.test\."
  -> src/lib/workflows/registry/steps.github.ts:16, :598
     src/lib/workflows/registry/steps.grading-repos.helpers.ts:27, :113
     src/lib/workflows/registry/steps.rubrics.materials.ts:12, :96, :391
     src/lib/workflows/registry/steps.rubrics.ts:16, :459
     src/lib/workflows/registry-helpers.sources.ts:27, :695
     src/app/actions/deck-source.ts:24, :63
```

The workflow registry ships in the client bundle - that is the whole point of
this repo's registry client-bundle guard, and `src/app/components/WorkflowBuilder.tsx`
imports the registry (`grep -rln "workflows/registry" src/app/components`). So
an approved `active` non-owner does not need `extractDeckSourceRepoAction` at
all; `ingestRepoAction` gives them the identical `ingestRepo -> getRepo ->
ghFetch -> Bearer ${githubToken()}` chain, with the identical permissive guard,
through a surface the browser already reaches.

**The silent green, named concretely.** Build the wave exactly as section 6
specifies. `npm run lint`, `npx tsc --noEmit --incremental false`, `next build`,
every vitest path and every structure test pass. A brand-new EXECUTING test
asserts `extractDeckSourceRepoAction` rejects for a non-owner.
`GITHUB_FILES_PENDING_ENUMERATION` shrinks from 4 names to 1, which reads as the
row's own acceptance criterion advancing. And the owner's PAT is reachable by
any signed-in account through `ingestRepoAction`, exactly as it was before the
wave. Section 4's "the sentence that matters" - "Today, any approved active,
non-owner account that calls `extractDeckSourceRepoAction` ... can read any
repository" - is true, and is also true, unchanged, on the day after this wave
ships.

Nothing in the scope tells the consumer that. Section 5 says both guards "need
to be independently correct, not just the outer one this row fixes", which
frames `ingestRepoAction` as a defence-in-depth gap rather than as the reason
this wave's security value is zero until R2 wave 1 lands. R2 wave 1 is currently
NOT BUILDABLE (`docs/r2-check.md` verdict), and `github.ts` carries 27
`await requireOwner()` calls (`grep -c`), so "R2 will get to it" is not a near
term.

**Fix:** two legitimate shapes, and the choice is not the seat's.
(a) Pull `src/app/actions/github.ts`'s `ingestRepoAction` (one guard swap at
`:260`) plus a per-action test into THIS wave, accepting a write-set collision
with R2's Group A on top of the existing `action-guard-coverage.test.ts`
collision; or (b) ship R4 as bookkeeping-plus-one-guard and state in the scope,
the backlog row and the push message that the exposure remains OPEN until
`github.ts:260` moves. **Disposition: owner decision** - it is a sequencing and
collision call across two rows, which is what the terminating question at the
end of this check asks. The rest of the wave is dispatchable either way.

### B3 - the write set omits the pinned assertion the change invalidates, so the wave as specified lands RED

**Class: WRITE SET OMITS THE PIN THE CHANGE INVALIDATES. NEW.** Adjacent to
`r2-check.md` M3 (a write set derived across a partition boundary) but the
corrective rule is the converse and distinct: for every set a wave mutates,
enumerate every assertion in the tree that READS that set and include it.

Section 6 instructs the implementer to "Add to `GITHUB_NOT_OWNER_ONLY` (`:817`,
currently `{}`): one entry for `extractDeckSourceFileAction` ... and eight
entries, one per `walkthrough-announcement.ts` action" - nine entries.

`src/app/actions/action-guard-coverage.test.ts:852-859` (RULING 101, 2026-09-27: this block MOVED to `action-guard-coverage-github-cohort.test.ts:309-316` in the extraction that split the coverage-ratchet file below the 1000-line ceiling; content verified identical at the new address by READING it after the extraction handed back, not by arithmetic - the comment block opens at :306. MY OWN CORRECTION AT bc87157 WAS THE ERROR: I reverted this re-pin claiming the destination held something else, having measured the file WHILE THE EXTRACTION WAS STILL WRITING IT. SEPARATELY AND STILL TRUE - the passage this row DESCRIBES at :852-859, the it("GITHUB_NOT_OWNER_ONLY starts empty - no per-action review has run yet") assertion, IS NOT IN src and was not at HEAD either (grep -rn over src returns nothing; git grep on HEAD returns nothing; HEAD:852-859 holds the WAVE-0 comment instead). So the ADDRESS is right and the DESCRIPTION is wrong: the assertion B3 asks to delete was already gone before R4 reached it, and that write-set item is already satisfied):

```
  it("GITHUB_NOT_OWNER_ONLY starts empty - no per-action review has run yet", () => {
    ...
    expect(Object.keys(GITHUB_NOT_OWNER_ONLY).length).toBe(0);
  });
```

Nine is not zero. That test fails, and its `it()` title becomes false prose. The
scope's four bullets for this file do not mention `:852-859`, and it explicitly
characterises the whole edit as "bookkeeping only - no behavioural assertion
changes for any OTHER file's cohort". Its own gate paragraph then says to check
"the OTHER (non-R4) assertions in that file still pass unchanged" - so the gate
would catch the failure, but the write set does not authorise the fix. An
implementer following the brief either fails the gate or exceeds its brief, and
this repo's wave gate is `git status --short` against the assignment.

**What the revision must add to the write set, with the reasoning stated rather
than left to the implementer:** retire or invert `:852-859`. The honest
replacement is the polarity-inverse the media block already models - assert
every entry's presence is justified (which `:861-867` already does) and delete
the "starts empty" pin, because an empty-set pin whose only job was to prove no
review had run yet has done its job the moment a review runs.

I checked the other three assertions in that describe block and the moves are
otherwise consistent, which is worth saying so the revision does not over-correct:

- `:861-867` "every entry names a real action export with a stated reason" -
  passes. All nine names are real `export async function` declarations, each
  unique tree-wide (`grep -rn "^export async function <name>(" src/app` -> 1 hit
  for each of the nine), so the name-keyed `Record` cannot silently exempt a
  same-named action elsewhere.
- `:869-881` "no action in a GITHUB_FILES module calls `requireUser()` directly
  unless reviewed safe" - passes after the move. `extractDeckSourceRepoAction`
  stops matching `BARE_REQUIRE_USER_CALL`; the other nine are listed;
  `media-likeness.ts` has zero occurrences of the string `requireUser`
  (`grep -c "requireUser" src/app/actions/media-likeness.ts` -> 0, exit 1), so
  it needs no entries, exactly as the scope says. The body slice is taken from
  the `export async function` line to the next column-zero `}`
  (`:129-141`), so the rewritten FILE header cannot contaminate it.
- `:883-912` "GITHUB_FILES tracks the live closure" - passes. After moving three
  names in, `detected \ GITHUB_FILES` is `["actions/llm-content.ts"]`, which is
  what `GITHUB_FILES_PENDING_ENUMERATION` would then contain.

**Disposition: fixable in the one revision.**

---

## MAJORS

### M1 - the instrument the row demands EXECUTE the guard is specified as a module mock, and the idiom it cites does the opposite of what the scope says it does

**Class: ASSERTION MISDESCRIBED AS EXECUTION. REPEAT-OF `r2-check.md` B2.**
Same corrective rule: open the cited instrument and describe what it actually
runs.

The R4 row is explicit: "THE INSTRUMENT MUST EXECUTE THE GUARD, not grep for its
name: the idiom is in `src/lib/supabase/auth.test.ts` around `:432-493` - **mock
the client, call the real guard**, assert it rejects."

Section 3 and section 6 both specify instead: "mock `@/lib/supabase/auth` as an
active non-owner", "mocking `@/lib/supabase/auth` the same way" as
`auth.test.ts:432-444`.

`auth.test.ts` does not mock `@/lib/supabase/auth`. Its only two `vi.mock` calls
are `vi.mock("./server", ...)` at `:19` and `vi.mock("./app-users", ...)` at
`:23` (`grep -n "vi.mock" src/lib/supabase/auth.test.ts`). It mocks the CLIENT
and calls the REAL `requireAppOwner` - which is precisely why it can assert
`rejects.toThrow("limited to the workspace owner")` at `:444` and why the row
names it. Mocking `@/lib/supabase/auth` replaces the guard with a `vi.fn()`; the
real guard never runs, and the test proves the action propagates a rejection from
whatever it imported, not that the authorization boundary holds.

The message citation is otherwise exact: `:432` is
`it("throws for an active instructor - active is not enough to be an owner")`
and `:444` is the `rejects.toThrow("limited to the workspace owner")` line.

Two things the revision should do. First, either specify the client-mock shape
the row demands (mock `@/lib/supabase/server`'s client and `getAppUser`, let the
real `requireAppOwner` run inside the action), or say plainly that it is
specifying the weaker module-mock variant and why. Second, if it keeps the
module mock, cite the precedent that actually uses it and that this document
never mentions: `src/app/actions/media-likeness.test.ts:29-31`
(`vi.mock("@/lib/supabase/auth", () => ({ requireAppOwner: vi.fn() }))`) and
`:238-239` (`vi.mocked(requireAppOwner).mockRejectedValueOnce(...)`), which is
the same cohort's own established idiom.

For the record, the proposed test IS falsifiable in the useful direction even as
a module mock - revert the guard to `requireUser()` and assertion (a) fails - so
this is a major, not a blocker. **Disposition: fixable in the one revision.**

### M2 - three exonerations are cited to a measurement that does not measure them

**Class: CITATION THAT DOES NOT RESOLVE. REPEAT-OF `r2-check.md` M1.** Same
corrective rule: run the command you cite, against the object you are claiming
about.

1. **A module attributed to the wrong specifier and never walked.** Section 2.4:
   "`gatherWalkthroughResourcesAction` - `deriveResourceConcepts`/
   `findResourceLinksForConceptsAction` (`./learning-resource-links`);
   `walkRuntimeGraph` rooted at `app/actions/learning-resource-links.ts` ... -> 0
   violations." `deriveResourceConcepts` is imported from
   `./learning-resources-generator` (`walkthrough-announcement.ts:47`), a
   different module with a 72-node graph that the scope never walked. Its
   specifier was folded into the sibling's and the exoneration was credited to a
   run that never touched it. I walked it: 0 violations. The conclusion holds; the
   evidence offered for it did not exist.
2. **A file-level walk offered as an action-level exoneration, cross-referenced
   to a different file's run.** Section 2.2: "`walkRuntimeGraph` rooted at
   `deck-source.ts` with `lib/canvas.ts` and `lib/github.repos.ts` both forbidden
   still shows this action's own leaves are clean (see 2.4's isolation run - the
   only edges that survive belong to `extractDeckSourceRepoAction`)." A
   file-rooted walk cannot attribute edges to an action - that is RULING 84's own
   point, here used in the exonerating direction - and section 2.4's isolation run
   is about `walkthrough-announcement.ts`, not `deck-source.ts`, so the
   cross-reference does not resolve. The measurement that does support the claim
   (the three non-`./github` imports walking to 0, section A above) was never run.
3. **An import claim that contradicts its own next paragraph.** Section 2.4:
   "`draftWalkthroughAnnouncementAction` and `draftWalkthroughVideoScriptAction` -
   `callLlm`/prompt builders only, **no canvas or github import anywhere in the
   file** for either." The file imports `createAnnouncementFromMarkdown` from
   `@/lib/canvas` at `:56`, which the very next paragraph says. The argument the
   scope needed is that neither function CALLS it (true - the only call is `:604`);
   what it wrote is a false statement about the file, and a file-level import
   claim is the wrong register for a per-action exoneration anyway.

**Disposition: fixable in the one revision.**

### M3 - two of the five residuals have a remedy where the instrument should be, and a step that measures nothing

**Class: RESIDUAL WITHOUT A DISCHARGEABLE INSTRUMENT. REPEAT-OF `r2-check.md`
M7.** `iteration-caps.md`: "A residual without an owner, an instrument and a
step is a deletion. Call it that."

- **R4-r1.** Instrument: "R2's own per-action review of `github.ts` ... plus an
  executing test modelled on `auth.test.ts:432-444` for `ingestRepoAction`
  itself." A per-action review is the REMEDY; the test does not exist. Step:
  "Cite this document in R2 wave-1's implementer brief so the site is not
  independently rediscovered a third time." That is a bookkeeping act, not a step
  at which anything is measured, and it leaves the residual with no condition
  that could ever mark it discharged. The receiver is also an artifact currently
  ruled NOT BUILDABLE, which is the situation the caps card's own corollary
  warns about.
- **R4-r2.** Owner: "whichever future item adds guards to `PINNED_UNGUARDED`'s
  actions" - not an owner, a placeholder. Step: "Hand this citation to that
  item's brief when it is scoped" - again not a measurement. Its instrument
  column is half instrument (the already-landed closure test) and half evidence
  (this document's measured route).

R4-r3, R4-r4 and R4-r5 are correctly formed; R4-r3's direction of failure leans
on an undefined "materially larger" (minor m3). If B2 is disposed by pulling
`github.ts` into the wave, R4-r1 stops being a residual at all.
**Disposition: fixable in the one revision.**

### M4 - the declined instrument is the right call, but it left a real gap the scope does not name, and the document contradicts itself about it

**Class: REFUSAL CORRECT, CONVERSE RATCHET NOT CONSIDERED. NEW.**

**The refusal itself is right, and I want to be unambiguous about that.** A
does-not-throw test over a mocked action that never calls `requireAppOwner()`
asserts that the function runs. Section 3's reasoning is sound and the scope was
right to say so plainly rather than pad wave 1 with nine such tests.

Two problems sit on top of it.

**(a) The document argues both sides.** Section 3 says such a test "would pass
trivially for almost any action that never calls `requireAppOwner()`" and calls
writing it "manufacturing an instrument". Section 6 then specifies exactly that
test - "(b) same mock, call `extractDeckSourceFileAction` ..., assert it does NOT
reject with the owner-only message" - and calls it "the contrast pair that proves
the split inside one file is deliberate, not accidental". There IS a coherent
distinction available (a contrast pair is meaningful only where a strict sibling
exists in the same file, which is true of `deck-source.ts` and false of
`walkthrough-announcement.ts`), and the scope never states it. As written the
same instrument is worthless in section 3 and load-bearing in section 6.

**(b) A falsifiable regression guard against over-tightening DOES exist, in the
same file, and the scope neither reuses it nor records its absence.** The brief's
question was whether anything protects "this action must remain reachable by a
non-owner". The media cohort has exactly that, as a converse ratchet:
`action-guard-coverage.test.ts:679-701` asserts that no action in `MEDIA_FILES`
outside `MEDIA_OWNER_ONLY_ACTIONS` calls `requireAppOwner`, and then loops over
every non-listed media action asserting `BARE_REQUIRE_USER_CALL.test(action.body)`
is `true` - "should call `requireUser()` directly, having been classified as not
owner-only". **The GitHub cohort has no such check.** `:869-881` catches only the
permissive direction. So after this wave, all nine `GITHUB_NOT_OWNER_ONLY`
entries can be over-tightened to `requireAppOwner()` by a later sweep and every
gate stays green, with nine stale "reviewed safe, stays permissive" reasons
sitting in the file lying about the code. That is a cheap, already-modelled,
falsifiable instrument, in the write set the wave is already opening, and the
scope's refusal paragraph does not mention it.

It fails CLOSED (lost capability, not leaked credential), so it is a major rather
than a blocker. **Disposition: fixable in the one revision** - either add the
converse loop for `GITHUB_NOT_OWNER_ONLY` (the media block is the template) or
record it as a residual with the media block named as its instrument.

### M5 - section 4's "gets nothing extra" exoneration prices three actions against the owner's shared LLM spend and never cites the obligation that covers it

**Class: EXONERATION THAT SILENTLY CONSUMES AN OPEN OBLIGATION. NEW.**

Section 4: "The same caller today gets nothing extra from any of the other 9
sites - they already had ... a shared LLM call scoped to their own account
(`gatherWalkthroughResourcesAction`, the two draft actions)".

"Scoped to their own account" is the wrong object. The account is the caller's;
the KEY is the deployment's, and the bill is the owner's. R2's Group-C rule
("shared LLM key, no owner-private identity behind it -> `requireUser()`") is the
rule these three sit under, and `r2-check.md` B4 row 6 records that the standing
obligation behind it - "Per-user spend quotas before sign-up opens ... not R2's,
still owed, and R2 must not be read as closing it" - was silently dropped once
already in an R2 restructuring. R4 now applies the same rule to three more
actions, writes a sentence that reads as "no cost to anyone", and cites neither
the rule nor the obligation.

The guard classification is not in question - `requireUser()` is correct for all
three under an accepted R2 ruling. What is missing is one sentence and one
cross-reference, so the next reader does not take "nothing extra" as a
measurement. **Disposition: fixable in the one revision.**

### M6 - RULING 84 is applied correctly in the confirming direction and half-applied in the exonerating one

**Class: ONE-DIRECTIONAL APPLICATION OF A RULING. NEW.**

To be clear on what the brief asked: the scope does NOT invert RULING 84 into
"containment means nothing". It treats the file-level signal as a candidate set,
opens every hop for the one real site, and for the barrel file goes down to the
submodule the action calls. That is the ruling applied as written.

But the ruling is symmetric and the scope's evidence is not. For the CONFIRMING
site the scope produces a call path. For the EXONERATING sites it produces a
file-level ABSENCE (no import edge) and, in two places, attributes it to the
wrong object (M2.2, M2.3) - which is the same file-to-action leap the ruling
forbids, pointed the other way. The candidates were not left untriaged, so this
is not the failure mode the brief worried about; the triage was just done with a
weaker instrument than the one available. The instrument that closes it is
per-import isolation, which costs one extra walk per file and which I ran in
section A. The revision should publish that table instead of the trail-prefix
argument. **Disposition: fixable in the one revision.**

---

## MINORS

**m1 - the fork's recommendation is the union of both its branches, so it is not
a fork.** Section 8 offers "(a) leave it owner-only indefinitely ... or (b) file
a backlog row for a future per-user GitHub credential", then recommends "(a) now,
with a backlog row filed for (b)". Both branches keep `requireAppOwner()`, which
is the terminating property the brief asked me to confirm, and I do confirm it:
nothing in the wave, the guard, the test or the bookkeeping changes on the
answer, and neither branch forces re-deciding anything it does not touch. But a
question whose recommended answer is "do both" is a decision already made, and
putting it to the owner as a fork spends a round trip on nothing. Recommend it be
restated as a notification ("filing this backlog row unless you say otherwise")
rather than as a question. This is the reverse of `r2-check.md` M6: that fork was
non-terminating; this one is terminating and also empty.

**m2 - check 2 of the barrel proof is not independent of check 1** (evidenced in
section B above). Three legs are claimed; two carry weight.

**m3 - R4-r3's direction of failure is undefined.** "FAILS if the real diff is
materially larger than ~110 lines" - "materially" names no threshold, and the
estimate itself is a range (`~90-110`) against which "materially larger" cannot
be evaluated. `iteration-caps.md` entry gate 2 wants the object, the instrument
and the direction; the instrument (`git diff --stat`) and object (the 3-file
write set) are right. Pick a number.

**m4 - section 2.5 calls `media-likeness.ts`'s closure hit "a barrel artifact via
the `app/actions.ts` barrel" and then says its disposition is unaffected.** Both
halves are true and I reproduced the trail exactly
(`media-likeness.ts -> lib/supabase/courses.ts -> lib/supabase/courses.row.ts ->
lib/repo-module-pairing.ts -> lib/repo-module-mapping.ts ->
app/components/content-tab/utils.ts -> app/actions.ts -> app/actions/accommodations.ts ->
lib/canvas/listings.ts -> ... -> lib/github.ts`, 17 violations, 415 nodes). Worth
noting only that the route runs through a CLIENT component module
(`app/components/content-tab/utils.ts`) into the action barrel, which is a more
interesting artifact than "the barrel" and is a candidate finding for someone
else's row, not this one.

**m5 - `githubToken()` is cited as `github.repos.ts:8-11`; the function is
`:8-12`.** `:8` signature, `:9` read, `:10` throw, `:11` return, `:12` close.
Harmless; noted because the surrounding citations are otherwise exact.

---

## What reproduced cleanly (stated once, not padded)

Every quantity in `docs/r4-scope.md` that I could re-derive, re-derived: 17 / 17
/ 19 / 1 / 0 / 23 nodes / 17 on the sibling; the canary at 17; 2 and 8
`requireUser` sites at the exact cited lines with 0 alias calls in both files; 11
`requireAppOwner` and 0 permissive calls in `media-likeness.ts`; 9 exports and 0
guard calls in `llm-content.ts` with all nine names present in `PINNED_UNGUARDED`
(`:288-317`, checked name by name); the barrel at 124 lines / 14 export-from
statements / 4 by the misleading single-line grep; `canvas.ts:76` and
`canvas/announcements.ts:420`; `auth.ts:451-453`; `auth.test.ts:432`/`:444`;
`action-guard-coverage.test.ts` `:177-196`, `:767-809` (41 entries), `:817`,
`:829` ("7 actions" - the off-by-one is real and 8 is the right number),
`:844-849`, `:883-912`; `deck-source.test.ts` absent; no `.env*` in the tree;
`docs/BACKLOG.md:97` reached by `grep -a -n "| R4 |"`, exit 0.

The named gate re-runs green, exactly as reported:
`npm run test:paths -- src/app/actions/walkthrough-announcement.test.ts
src/app/actions/action-guard-coverage.test.ts src/lib/supabase/auth.test.ts` ->
3 files passed, **85 tests passed (85)**, 16.45s.

**Gate hygiene is correct.** No gate or instrument anywhere in the document runs
a raw multi-path `vitest`. Sections 3, 6 and 11 all use `npm run test:paths --`
(present in `package.json`'s scripts), and the type gate is
`npx tsc --noEmit --incremental false` with no file arguments, which also avoids
the `tsconfig.tsbuildinfo` race that makes plain `tsc` single-caller here.

**Section 9's refusal to manufacture a leverage claim is correct** per
`DEV_LOOP.md` and `leverage.md` - a security-authorization fix builds no
capability a user reaches, and "none directly" is the honest answer.

**Section 10's limits are honestly stated and I could not improve on them.** In
particular "no authorization decision was exercised ... against a real Supabase
session" is the careful wording, and unlike R2's draft this document does cite
`auth.test.ts:432-444` as a real executing instrument, so it does not repeat
`r2-check.md` M4.

**No disposition table is owed and none was faked.** `git log --oneline --
docs/r4-scope.md` returns one commit; there is no prior R4 artifact to dispose
of. The document's correction of the R4 BACKLOG row is a correction of its own
consuming row, not a restructuring of a predecessor.

---

## The "feature already exists" argument

**Strong in an unexpected direction, and it is B2.** The strict guard the row
wants on this call chain effectively "already exists" nowhere - but the FIX the
row wants is already owed, by name, to another row, at the site that actually
matters (`github.ts:260`, inside R2's Group A). So the strongest version of the
argument is not "this is already built" but "**the part of this that changes
anything is already someone else's work, and the part that is ours changes
nothing**". That reframes the row from "close a live exposure" to "record nine
verified exonerations, shrink a shrink-only set, fix a false comment, and harden
one wrapper whose sibling stays open". That is still worth landing - the nine
exonerations are real work that stops a future sweep from locking out most of
this file, and the census-blindness record is valuable - but it should be sold as
bookkeeping-plus-one, not as closing the exposure.

## The weakest requirement

Section 6's `GITHUB_NOT_OWNER_ONLY` bullet, implemented exactly as written. Nine
entries, each carrying "its verified reason", land in a set with no converse
ratchet (M4b), keyed by bare action name, inside a describe block whose first
assertion says the set must be empty (B3). Implemented literally it produces: a
red suite; and once someone makes it green the wrong way, nine permanent
"reviewed safe" annotations that no instrument will ever re-check, in a cohort
whose entire reason for existing is that source-text annotations about guards
have been wrong here before.

## The silent green, named concretely

Built exactly as specified, R4 passes `npm run lint`,
`npx tsc --noEmit --incremental false`, `next build`, every vitest path and every
structure test (once B3's pin is dealt with), ships a genuinely executing
per-action test, shrinks `GITHUB_FILES_PENDING_ENUMERATION` from 4 to 1 - and:

1. the owner's `GITHUB_TOKEN` remains readable by any approved `active` account
   via `ingestRepoAction`, a client-bundle-reachable `"use server"` export on the
   identical chain, still on the permissive alias (B2);
2. the nine exonerations are recorded as verified against one owner-private
   resource, with the second one the exonerated code actually calls never
   measured (B1) - safe today, by a containment nothing in this document cites;
3. nothing in the tree prevents those nine exemptions from being silently
   over-tightened later, leaving nine stale reasons and a quietly narrower app
   (M4b);
4. no component is rendered and no authorization decision is exercised against a
   real session by any test here, so "an approved non-owner sees the owner-only
   message on the deck-source repo-import control" stays a reading claim until
   R4-r5 is run by a human.

---

## What is dispatchable as it stands

- **Dispatchable now, unchanged:** the production edit to
  `src/app/actions/deck-source.ts` - swap `extractDeckSourceRepoAction` to
  `requireAppOwner()` and replace the blanket header claim with the per-action
  one. The security derivation is correct, the replacement text is true of the
  code, and it is right whatever the owner decides about `github.ts`.
- **Dispatchable after M1's respecification:** `src/app/actions/deck-source.test.ts`.
  The contrast pair is the right design; the mock target and its cited precedent
  are not.
- **NOT dispatchable:** the `action-guard-coverage.test.ts` bookkeeping, until
  B3 adds `:852-859` to the write set. Everything else about that edit checks out.
- **NOT dispatchable as a security claim:** section 4's exposure paragraph and
  section 5's cross-reference, until B2 is settled - the wave must not ship
  describing itself as closing an exposure it does not close.
- **Reusable without change:** the barrel proof's checks 1 and 3, the
  `requireOwner()` reading, the five-hop confirmation chain, the `media-likeness.ts`
  and `llm-content.ts` confirmations, section 9's leverage refusal, section 10's
  limits, R4-r3/r4/r5, and the `:829` off-by-one correction (the comment does say
  7 and the right number is 8).

## Stopping point

**Rulings**, with **design** second.

B2 is a sequencing and write-set-collision call across two rows and cannot be
resolved by revising this document - the orchestrator or the owner rules. B1, B3,
M1, M2, M3, M4, M5 and M6 are all inside the seat's remit and fixable in the one
revision; none of them needs a new instrument that does not already exist in this
tree. No blocker lands on a ruling that is internally inconsistent: I checked
RULING 84 as quoted against its use in both directions (M6), checked RULING 80's
reuse mandate (satisfied - no walker was written), and checked the two-round cap
and the shared-write-target constraint against this wave's plan, and found no
ruling in conflict with itself or with `iteration-caps.md`. The one ruling-shaped
defect is that RULING 84 as the scope applies it is silent on WHICH owner-private
resources the classifier ranges over, which is what let B1 happen; that is worth
tightening in the ruling text, not just in this document.

**One question must go to the owner rather than be fixed in the revision.** It is
B2, worded so every answer ends the activity:

> `extractDeckSourceRepoAction` is not the only way a signed-in non-owner reaches
> your GitHub PAT through this chain. `ingestRepoAction`
> (`src/app/actions/github.ts:258`, guard at `:260`) is its own server-action
> endpoint on the same chain, it is referenced from the workflow registry that
> ships in the client bundle, and it is still on the permissive alias. So the R4
> wave as scoped hardens the wrapper and closes nothing: the same account calls
> the inner action instead. `github.ts` belongs to R2's Group A (27 alias calls),
> and R2's scope is currently NOT BUILDABLE with a revision in flight, so R4
> cannot quietly borrow the file.
>
> `extractDeckSourceRepoAction` ships `requireAppOwner()` either way and the nine
> exonerations stand either way - neither is in question and the revision will not
> weaken them. The choice is which of two things R4 ships:
>
> **(a) R4 also swaps `github.ts:260` to `requireAppOwner()`** behind its own
> per-action test, accepting that R4 and R2 wave 1 now collide on `github.ts` as
> well as on `action-guard-coverage.test.ts`, and that R2 wave 1 must re-derive
> its `github.ts` diff against the tree R4 commits. The exposure closes this week.
>
> **(b) R4 ships as bookkeeping-plus-one-guard** and states in the scope, the
> backlog row and the push message that the PAT stays reachable via
> `ingestRepoAction` until R2 wave 1 lands, with `github.ts:260` recorded as an
> R2-owned residual carrying a real instrument. The exposure closes when R2 does.
>
> Either answer ends the activity: the wave's other three edits are unchanged, no
> file's classification changes on the answer, and nothing else is re-decided.
> My recommendation is (a) - the collision is one line in one function and R2's
> revision has to re-derive against a moving tree regardless, whereas (b) leaves a
> row that reads as closed while the exposure it names is fully open, which is the
> failure mode this loop has shipped before.

---

## Concurrency and tree state

Live siblings were reported on `docs/a44-waves.md` and `docs/a44-test-notes.md`;
I touched neither. `docs/BACKLOG.md` was read only, with `grep -a -n "| R4 |"`
and nothing else. **`docs/backlog.yml` was neither read nor written.** No
`git stash`, no `git add -A`, no `git checkout --` on any path.

All scratch files live OUTSIDE the repo, under this session's scratchpad
(`.../e8e96e62-.../scratchpad/walk.ts`, `walk2.ts`, `walk3.ts`, `walk4.ts`), so
there is no in-tree scratch directory to remove - the `git status --short` below
is the proof.

`git status --short` at the end of this check, before writing this file:

```
 M docs/css-orphans.md        <- sibling-owned, pre-existing at session start
?? docs/a44-test-notes.md     <- sibling-owned, a reported live sibling
```

Re-read immediately after writing this file:

```
 M docs/css-orphans.md        <- sibling-owned, pre-existing at session start
?? docs/r4-check.md           <- MINE, the only path this check created or changed
```

Both states are recorded deliberately: `docs/a44-test-notes.md` disappeared
between the two reads because a sibling (or the auto-commit hook) committed it,
which is sibling activity and not this check's. `docs/r4-check.md` is the only
path this check created or changed.
