# KNOWLEDGE-MUTATION-LAG - scope / recon

Follow-up to KNOWLEDGE-CREATE-LAG (shipped `94f6d56d`, scope
`docs/knowledge-create-lag-scope.md`). Backlog row `KNOWLEDGE-MUTATION-LAG`
(`docs/BACKLOG.md:174`), status `actionable`. Create no longer full-refetches;
rename / reorder / reparent / delete still call `refresh()` - the full
`listInstitutionPagesAction` reload of every page WITH bodies - and lag the same
way create did. This scope applies the create-lag optimistic-local-update model
to those four mutators.

This is a performance bug fix. There is no leverage claim: it adds no new
user-reachable capability, it makes four existing ones faster. Fired trigger for
the AC leverage claim = "bug fix / perf, no new mechanism" (`seats.md`,
Acceptance criteria: "On a bug fix ... there is no claim to make; record that as
the fired trigger"). Same disposition the create-lag scope recorded.

Every citation below was opened in this checkout on 2026-10-06. Every quantity
names the command that produced it. "What I cannot determine" is section 10.

---

## 1. Sizes (both mandated instruments; they agree)

Commands: `@(Get-Content <f>).Count` (PowerShell) and `wc -l < <f>` (Bash tool),
both run 2026-10-06 in this checkout.

| File | `@(Get-Content).Count` | `wc -l` |
|---|---|---|
| `src/app/components/knowledge/useKbPageTree.ts` | 299 | 299 |
| `src/app/components/knowledge/useKbTreeActions.ts` | 253 | 253 |
| `src/app/components/knowledge/knowledge-helpers.ts` | 823 | 823 |
| `src/app/components/KnowledgeTab.tsx` | 966 | 966 |
| `src/app/components/knowledge/useKbPageTree.wiring.test.ts` | 57 | 57 |
| `src/app/components/knowledge/useKbTreeActions.wiring.test.ts` | 46 | 46 |
| `src/app/components/knowledge/knowledge-helpers.test.ts` | 785 | 785 |

All under the 1000-line ceiling (`src/file-size-ceiling.structure.test.ts`,
`LIMIT = 1000` at `:41`, `grep -n "LIMIT = 1000"`). `KnowledgeTab.tsx` at 966 is
the closest; this scope adds ~2-4 lines to it (section 7), landing ~968-970,
still under 1000. No knowledge file is in `ALLOWED_OVERAGE`
(`grep -an "knowledge" src/file-size-ceiling.structure.test.ts` returns nothing),
so none is pinned.

NOTE: `useKbTreeActions.ts` measures **253**, not the "~251" the task brief
estimated - create-lag added two lines (`insertCreatedPage` in the args
interface + its destructure). Re-measured, not recalled.

---

## 2. Per-mutator trace (confirmed against the current tree)

All line numbers are the CURRENT `useKbTreeActions.ts` (253 lines), re-measured
after create-lag shifted the file. The brief's estimates (rename ~:148-158,
reorder ~:196-208, reparent ~:214-226, delete ~:162-178) were pre-measurement
and are each a few lines low; the authoritative numbers follow.

### 2.1 `commitRename` - `useKbTreeActions.ts:146-161`

```
const result = await updateInstitutionPageAction(id, { title }); // :154 - sends {title}
...
if ("error" in result) { setActionError(result.error); return; } // :156-159
await refresh();                                                  // :160 <- the lag
```

- Sends a PARTIAL update `{ title }`.
- `updateInstitutionPageAction(id, {title})` returns `{ page: InstitutionPage }`
  (`src/app/actions/knowledge-base.ts:123-139`, `:135 return { page }`), where
  `page` is `updateInstitutionPage(...)`'s `.select().single()` row mapped
  through `mapInstitutionPage` (`src/lib/knowledge-base.ts:676-685`) - the FULL
  authoritative row including an unchanged body.
- Selection: `refresh()` with NO argument keeps `selectedId`
  (`useKbPageTree.ts:213`, `desired = selectId !== undefined ? selectId :
  selectedId`). Rename keeps the renamed page selected.
- Edit-session UX: `commitRename` is the inline TREE rename (title-only), not
  the body edit session. `renamingId` is already cleared at `:151`
  (`setRenamingId(null)`) BEFORE the await. The body edit session is untouched.

### 2.2 `reorder` - `useKbTreeActions.ts:192-211`

```
const [a, b] = pair;                                                      // :197 (computeReorder)
const resA = await moveInstitutionPageAction(a.id, { position: a.position }); // :198 - sends {position}
if ("error" in resA) { ...; return; }                                     // :199-203 (no refresh)
const resB = await moveInstitutionPageAction(b.id, { position: b.position }); // :204 - sends {position}
if ("error" in resB) { ...; return; }                                     // :206-209 (no refresh)
await refresh();                                                          // :210 <- the lag
```

- TWO calls, each sends a PARTIAL `{ position }` and returns `{ page }`
  (`knowledge-base.ts:151-167`, `:163 return { page }`).
- `computeReorder` (`knowledge-helpers.ts`, tested at
  `knowledge-helpers.test.ts:121-161`) returns the two explicit swapped
  positions. `moveInstitutionPage` writes ONLY the given row's position -
  `if (target.position !== undefined) updateRow.position = target.position`
  (`src/lib/knowledge-base.ts:726`) - it does NOT renormalize or shift any other
  sibling's position. So the two returned rows carry the complete post-swap
  state; no other row changes.
- Selection: `refresh()` keeps `selectedId`. The moved page stays selected.
- Partial failure (resA ok, resB fails) today leaves the server half-swapped and
  does NOT refresh (`:206-209` returns before `:210`), so the client shows the
  pre-swap list until the next mutation. Pre-existing; preserved (section 5.4).

### 2.3 `reparent` - `useKbTreeActions.ts:213-229`

```
const result = await moveInstitutionPageAction(selectedId, { parentId }); // :216 - sends {parentId}
if ("error" in result) { ...; return; }                                   // :218-221
if (parentId) { ... setExpanded(next); writeExpandedIds(active, next); }  // :222-227 - expand new parent
await refresh();                                                          // :228 <- the lag
```

- Sends a PARTIAL `{ parentId }` and returns `{ page }`. `moveInstitutionPage`
  writes `parent_id` and bumps `updated_at`; it writes `position` only if a
  position was passed (`:726`) - reparent passes none, so the row keeps its
  existing `position` value. The returned `result.page` carries the real
  post-move `parentId` and `position`, i.e. exactly what a refetch of that row
  would yield.
- Expansion: the new parent is expanded at `:222-227`, in the success branch,
  BEFORE the refresh - this block is UNCHANGED by this scope.
- Selection: `refresh()` keeps `selectedId`. The reparented page stays selected.

### 2.4 `confirmDeleteRequest` - `useKbTreeActions.ts:167-181`

```
const result = await deleteInstitutionPageAction(id);  // :172
if ("error" in result) { ...; return; }                // :174-177
setIsEditing(false);                                   // :178
setEditSnapshot(null);                                 // :179
await refresh(null);                                   // :180 <- the lag; selection -> null
```

- `deleteInstitutionPageAction(id)` returns `{ ok: true; storageCleanupError? }`
  with **NO page** (`knowledge-base.ts:181-196`, `:192`). The server CASCADES:
  `deleteInstitutionPageAndAttachments` removes the page AND its whole subtree
  (the `parent_id -> on delete cascade` migration, `:169-179` docstring; the
  cascade is also documented at `src/lib/knowledge-base.ts:740-751`).
- Selection: `refresh(null)` sets selection to null UNCONDITIONALLY
  (`useKbPageTree.ts:213-214`, `desired = null` -> `applySelection(null)`),
  whether or not the deleted page or a descendant was the selected one. So the
  post-delete selection is always null - there is no per-page branching to
  reproduce.
- Edit-session: `setIsEditing(false)` / `setEditSnapshot(null)` at `:178-179`
  close any open body edit session before the refresh.

---

## 3. The target mechanism to remove

`refresh` (`useKbPageTree.ts:200-217`) calls `listInstitutionPagesAction(active)`
(`:203`), which does `select("*")` on `institution_pages` - the FULL body of
EVERY page in the institution (same over-fetch the create-lag scope diagnosed,
`docs/knowledge-create-lag-scope.md` section 1.2; bodies are unbounded because
page bodies can embed attachment text). Every one of the four mutators above
awaits this full-body read after sending a change that touched one or two rows.
The fix is the create-lag model: update the local `pages` list in place from the
authoritative data each action already returns, gated on `bodiesReady` with a
`refresh()` fallback during the background-bodies window.

---

## 4. The optimistic design, per mutator

The seams live in `useKbPageTree.ts` (NOT in `useKbTreeActions.ts`), exactly as
`insertCreatedPage` does, because the hook owns `pages`, `bodiesReady`,
`refreshedRef` and `applySelection`; the caller must not have to know the
body-window state. This mirrors the shipped `insertCreatedPage`
(`useKbPageTree.ts:227-238`).

### 4.1 One seam for rename / reorder / reparent: `applyLocalPageUpdate`

All three of these mutators share one shape: replace one or two authoritative
rows by id, selection UNCHANGED, fallback `refresh()`. So ONE seam serves all
three. Add to `UseKbPageTreeReturn` (`useKbPageTree.ts:48-73`) and the returned
object (`:282-298`):

```
applyLocalPageUpdate: (updated: InstitutionPage[]) => Promise<void>;
```

Behaviour pinned here (final wording is the implementer's):

```
const applyLocalPageUpdate = useCallback(async (updated: InstitutionPage[]) => {
  if (!active) return;
  if (!bodiesReady) {
    // Background-bodies window: a full read repairs the body-less placeholders
    // AND reflects the just-committed change. Pre-optimisation behaviour,
    // preserved - see 5.3. refresh() with no arg keeps the current selection,
    // which is exactly what all three callers did before.
    await refresh();
    return;
  }
  refreshedRef.current = true;                      // mirror refresh()/insertCreatedPage guard (5.2)
  setPages((prev) => (prev ? replacePages(prev, updated) : prev)); // pure replace-by-id (4.4)
}, [active, bodiesReady, refresh]);
```

- **No `applySelection` call.** Selection is NOT involved for these three
  (section 2) - the selected page survives every one of them, so
  `refresh()`'s own `applySelection(pickValidPageId(selectedId, validIds))`
  (`:214`) resolves to the UNCHANGED `selectedId`. Omitting the call is
  observably equivalent: `applySelection(selectedId)` when `selectedId` is
  unchanged only rewrites the same localStorage value, re-sets
  `lastAppliedRequestRef.current` to the value it already holds, and re-reports
  the same id to `page.tsx` - all idempotent. Omitting it also leaves
  `lastAppliedRequestRef.current` unchanged, so when the reconciliation effect
  (`:254-262`) re-runs on the `pages` change it early-returns at `:256`
  (`requestedPageId === lastAppliedRequestRef.current`) and never calls
  `closeEditSession()`. This satisfies the constraint "reuse `applySelection`
  where selection IS involved" - here it is not. (A checker should probe this;
  the equivalence is the load-bearing claim.)
- **No `setBodiesReady` / `setLoadState`.** See section 5.1 (the frozen-count
  invariant). In the optimistic branch both are already at their target values,
  exactly as in `insertCreatedPage`.

Caller edits in `useKbTreeActions.ts`:

- `commitRename` `:160`: `await refresh();` -> `await applyLocalPageUpdate([result.page]);`
- `reorder` `:210`: `await refresh();` -> `await applyLocalPageUpdate([resA.page, resB.page]);`
- `reparent` `:228`: `await refresh();` -> `await applyLocalPageUpdate([result.page]);`
  (the `:222-227` expand block stays, unchanged, before the call)
- Accept `applyLocalPageUpdate` in `UseKbTreeActionsArgs` (`:23-46`) and
  destructure it (`:68-83`), exactly as `insertCreatedPage` is today.

### 4.2 Delete - the fork (section 6 recommends keep-on-refresh)

Delete is designed BOTH ways so whichever the owner picks ships without another
round. See section 6 for the fork and the recommendation.

**Option KEEP (recommended): leave `confirmDeleteRequest` on `refresh(null)`
unchanged.** No seam, no helper, no caller edit for delete. `refresh` stays a
prop of `useKbTreeActions` and is still referenced by delete, so it is not an
unused prop.

**Option CONVERT: add a second seam `removeLocalPageSubtree`** to
`useKbPageTree.ts`:

```
removeLocalPageSubtree: (rootId: string) => Promise<void>;
```

```
const removeLocalPageSubtree = useCallback(async (rootId: string) => {
  if (!active) return;
  if (!bodiesReady) {
    await refresh(null);               // window case: full read + selection -> null, as today
    return;
  }
  refreshedRef.current = true;
  setPages((prev) => (prev ? removePageSubtree(prev, rootId) : prev)); // pure (4.4)
  applySelection(null);                // selection IS involved (delete -> null) -> reuse applySelection
}, [active, bodiesReady, refresh, applySelection]);
```

Caller edit (`confirmDeleteRequest` `:180`): keep `setIsEditing(false)` /
`setEditSnapshot(null)` at `:178-179`; replace `await refresh(null)` with
`await removeLocalPageSubtree(id)`. The seam owns the `pages` removal and the
`applySelection(null)`.

### 4.3 Why `applySelection` for delete but not for the other three

Delete changes the selection (to null, section 2.4), so per the constraint it
reuses `applySelection(null)` - which sets `lastAppliedRequestRef.current = null`
and reports null up, so the reconciliation effect early-returns on the echoed
`requestedPageId === null` rather than re-resolving a stale selection against the
shrunken list. This is exactly what `refresh(null)` does today (`:214`,
`applySelection(pickValidPageId(null, ...))` = `applySelection(null)`).

### 4.4 The pure reducers to pin (machine-checkable; see AC3)

Both are added to `knowledge-helpers.ts` and unit-tested in
`knowledge-helpers.test.ts` (both already import the knowledge helpers and build
fixtures with the local `page()` factory, `:34-47`):

- **`replacePages(pages: InstitutionPage[], updated: InstitutionPage[]):
  InstitutionPage[]`** - returns a NEW array where each page whose id appears in
  `updated` is replaced by the `updated` entry, order preserved, every other
  page kept as-is, an `updated` entry whose id is absent ignored (defensive),
  and the input array never mutated. Serves rename (`[result.page]`), reorder
  (`[resA.page, resB.page]`), reparent (`[result.page]`). The tree re-sort on
  render is `buildPageTree`'s job (`src/lib/knowledge-base.ts:207-229`, siblings
  sorted by `position` then `title` at `:218-219`), so array order does not
  affect render order - a reorder's swapped positions and a reparent's changed
  `parentId`+`position` both land correctly because the REPLACED row IS the
  authoritative server row.

- **`removePageSubtree(pages: InstitutionPage[], rootId: string):
  InstitutionPage[]`** (CONVERT option only) - returns a NEW array with `rootId`
  and every transitive descendant (by `parentId`) removed, input never mutated,
  `rootId` absent -> a shallow copy unchanged. This reproduces the DB's
  `parent_id` cascade exactly, because both walk the same `parentId` chain. The
  descendant walk is the same shape as `computeBulkDeleteTargets`'
  `hasSelectedAncestor` (`knowledge-helpers.ts:651-672`) and
  `countDescendants` (`:41-53`); it is NEW because neither existing helper
  returns "the flat list minus a subtree".

---

## 5. Correctness basis and the create-lag constraints

### 5.1 Frozen `setBodiesReady(true)` count = EXACTLY 2 (hard invariant)

`useKbPageTree.wiring.test.ts:29-32` asserts
`source.match(/setBodiesReady\(true\)/g)?.length === 2` over the whole file,
pinned to the invariant "flips only from a full read". The two occurrences today
are the bodies-landed branch (`useKbPageTree.ts:156`) and `refresh` (`:210`).
`insertCreatedPage` adds none (`useKbPageTree.wiring.test.ts:54`,
`not.toContain("setBodiesReady")`). **The new seams MUST NOT call
`setBodiesReady(true)` or `setLoadState` in any branch.** Adding a third reddens
`:31` AND disarms the invariant. This is the single blocker the create-lag check
raised (`docs/BACKLOG.md:173` "the optimistic branch must not add a 3rd
setBodiesReady(true)/setLoadState"); it binds here identically. AC6 enforces it.

### 5.2 The clobber guard (`refreshedRef.current = true`)

Each optimistic branch sets `refreshedRef.current = true`, mirroring
`refresh` (`:208`) and `insertCreatedPage` (`:233`). In the common case
(`bodiesReady === true`) both initial fetches have already resolved, so nothing
is in flight; the write is defensive and closes the narrow race where the load
effect (`:122-165`) re-runs after the mutation - `:128` would reset the guard
and re-issue both reads, but a post-mutation re-read reflects the committed
change anyway, so it cannot resurrect a renamed/moved/deleted row's stale state.
AC5 enforces it.

### 5.3 The `!bodiesReady` fallback (the background-bodies window)

When `bodiesReady === false`, the list still holds body-less placeholders
(`pagesFromSummaries`, `knowledge-helpers.ts`; `body: ""`) and the background
full-body read is in flight. An optimistic in-place edit in that window faces the
same unwinnable choice the create-lag scope documented (set `refreshedRef` and
the placeholders never get bodies; or don't and the late `setPages(result.pages)`
at `:155` replaces the list with a pre-mutation fetch): both are wrong. The
fallback dodges both by doing the full read, which reflects the committed change
AND repairs the placeholders - identical to today. This window is short (only
between first summaries paint and bodies landing on a cold tab) and is the one
case that still pays the full read; it is NOT a regression (it equals today).
AC4 enforces the fallback's presence. R2 owns the felt cost.

### 5.4 Equivalence as the correctness basis

The safety of every optimistic branch rests on ONE claim: it produces a `pages`
list observably identical to what today's `refresh()` would produce, because
each action returns the authoritative server row(s):

- rename/reorder/reparent: the local list after `replacePages` = the prior list
  with the changed row(s) swapped for the exact rows the server returned. Because
  `bodiesReady` is true in this branch, every OTHER page's body is already
  present and unchanged, so the whole list equals a full refetch. `tree`,
  `selectedPage`, `breadcrumb` and the reconciliation effect all read `pages`, so
  they see identical input.
- delete (CONVERT): `removePageSubtree` removes exactly the rows the DB cascade
  removes (same `parentId` walk); selection -> null matches `refresh(null)`.
- Partial-failure paths (reorder resB error) are UNCHANGED - they already return
  before `refresh()` today, so the client is equally stale in both designs. Not
  introduced here; recorded as R3.

---

## 6. The fork: convert-delete-too vs keep-delete-on-refresh

**RECOMMENDATION: convert rename / reorder / reparent to optimistic; KEEP delete
on `refresh(null)`.**

Feasibility (the create-lag recon's read, re-confirmed here):

| Mutator | returns | local update | feasibility |
|---|---|---|---|
| rename | `{page}` (full row) | replace 1 by id | HIGH |
| reorder | two `{page}` | replace 2 by id | MEDIUM (two-write swap; `moveInstitutionPage` writes only the given rows, 2.2) |
| reparent | `{page}` | replace 1 by id | MEDIUM (one parentId write; expand block unchanged) |
| delete | `{ok:true}`, NO page | remove subtree | LOW/RISKY (reconstruct the server cascade locally) |

Why keep delete on refresh:

1. **Delete is the only mutator whose action returns no authoritative row.**
   rename/reorder/reparent each hand back `result.page` - the mapped DB row - so
   their local update is a pure REPLACE of an authoritative value and the local
   list becomes identical to the server by construction. Delete alone requires
   RECONSTRUCTING the cascade locally (the new `removePageSubtree` helper), a
   larger and different correctness surface than a replace.
2. **Delete is the rarest of the four** (a page is renamed/moved far more often
   than deleted), so it has the worst benefit/cost: smallest latency win, largest
   new-code surface.
3. **A full refetch after delete is self-reconciling** - it reflects exactly what
   the cascade did (now, and after any future migration that changes the
   cascade). An optimistic subtree-removal that ever diverges would show a stale
   tree until the next mutation.
4. **It keeps this chunk to one seam + one pure helper** (`applyLocalPageUpdate`
   + `replacePages`), matching the create-lag chunk's one-concern discipline.

Both options are fully designed in section 4, so if the owner prefers full
consistency (convert delete too), the build proceeds on the CONVERT option
without a new round: add `removeLocalPageSubtree` + `removePageSubtree` + their
tests, and the delete caller edit. If KEEP is chosen, the delete lag becomes R4
(a named, bounded follow-up), NOT a silent deletion.

This is a product/scope fork, not a correctness fork - delete is correct either
way. Per AGENTS.md's displacement rule (SHAPE 5), it is stated with a
recommendation and both readings built; the orchestrator files/decides, the
agent does not default it.

---

## 7. `KnowledgeTab.tsx` wiring (keep tiny)

`useKbTreeActions` receives its callbacks from `KnowledgeTab.tsx`
(`:251-267`). `applyLocalPageUpdate` (and `removeLocalPageSubtree` under CONVERT)
must be destructured from `pageTree` (`:165-181`) and passed into the
`useKbTreeActions({...})` args object, exactly as `insertCreatedPage` is today
(`:178`, `:260`). `refresh` STAYS in both places (saveEdit at `:857` and
`bulkDelete` at `:217` still use it; delete uses it under KEEP).

- KEEP option: +1 line in the destructure, +1 in the args object = ~2 lines.
  966 -> ~968.
- CONVERT option: +2 and +2 = ~4 lines. 966 -> ~970.

Both under 1000.

---

## 8. Acceptance criteria

No leverage claim (perf bug fix; trigger recorded above). Nothing renders under
vitest (`this-repo.md` section 6), so these are source-text / pure-logic
instruments; felt speed is an owner walk (section 9). Each pass condition names
the object under comparison, the instrument, and the direction of failure.

- **AC1 - rename/reorder/reparent no longer trigger the full-body refetch.**
  Object: the `commitRename`, `reorder`, `reparent` function bodies in
  `useKbTreeActions.ts`. Instrument: `useKbTreeActions.wiring.test.ts` slices
  each function's source (raw `indexOf`/`slice`, like the existing file) and
  asserts each references `applyLocalPageUpdate(` and does NOT reference
  `refresh(` or `listInstitutionPagesAction`. Direction: RED if any of the three
  still calls `refresh` or omits `applyLocalPageUpdate`.

- **AC2 - the existing "leaves rename and delete on refresh" assertion is
  updated, not left stale.** Object: `useKbTreeActions.wiring.test.ts:42-45`.
  Today it asserts `source.toContain("await refresh();")` and
  `toContain("await refresh(null)")`. After this change NO `await refresh();`
  remains in `useKbTreeActions.ts` (create already moved off it; rename/reorder/
  reparent now move off it). Instrument: the test must be rewritten so (KEEP)
  it asserts delete still uses `await refresh(null)` AND that `await refresh();`
  is ABSENT, or (CONVERT) that neither refresh form remains. Direction: RED if
  the test still asserts the deleted `await refresh();` string (it would fail on
  a correct implementation - the "a test greps a string it does not own" hazard,
  here on a string we DO own and must retire). This is a write-set obligation,
  section 11.

- **AC3 - the local reducers are pure and correct (the behaviour).**
  Object: `replacePages` (and `removePageSubtree` under CONVERT). Instrument:
  `knowledge-helpers.test.ts` unit tests. For `replacePages`: result replaces
  every id present in `updated`, preserves order, keeps every other page,
  ignores an `updated` id absent from the list, and does not mutate the input
  (assert the input array is `.toEqual` its pre-call copy). For
  `removePageSubtree`: removes root + every transitive descendant, keeps
  unrelated pages and a sibling subtree, root-absent returns an unchanged copy,
  input not mutated. Direction: RED if a page is dropped/kept wrongly, order
  changes, or the input is mutated.

- **AC4 - each optimistic seam keeps the `bodiesReady` fallback to `refresh`.**
  Object: `applyLocalPageUpdate` (and `removeLocalPageSubtree` under CONVERT).
  Instrument: `useKbPageTree.wiring.test.ts` slices the seam body and asserts a
  `if (!bodiesReady)` branch whose body calls `refresh(` (`refresh()` for
  `applyLocalPageUpdate`, `refresh(null)` for `removeLocalPageSubtree`).
  Direction: RED if the fallback branch is removed (which would strand
  placeholders or miss the change during the cold-load window).

- **AC5 - the optimistic branch sets the clobber guard and does not re-read the
  list.** Object: each seam's optimistic (post-`bodiesReady`) branch.
  Instrument: wiring assertion that the slice AFTER `refreshedRef.current = true`
  contains `setPages(` and does NOT contain `refresh(`, and that the whole seam
  body does NOT contain `listInstitutionPagesAction`. Direction: RED if the
  guard write is absent, or a direct `listInstitutionPagesAction(`/`refresh(`
  appears in the optimistic branch. (Mirrors `insertCreatedPage`'s shipped test,
  `useKbPageTree.wiring.test.ts:36-56`.)

- **AC6 - the frozen `setBodiesReady(true)` count stays EXACTLY 2 and the seams
  add no `setBodiesReady`/`setLoadState`.** Object: `useKbPageTree.ts` whole
  source + each new seam body. Instrument: the existing
  `useKbPageTree.wiring.test.ts:31` count assertion (unchanged, must still pass)
  PLUS a per-seam `body).not.toContain("setBodiesReady")` and
  `not.toContain("setLoadState")`. Direction: RED if the count becomes 3 or a
  seam contains either setter (disarms the "flips only from a full read"
  invariant - section 5.1).

- **AC7 - post-mutation UX preserved.** Object: the caller bodies. Instrument:
  wiring assertions that `reparent` still runs its expand block
  (`writeExpandedIds(active, next)`) BEFORE the seam call; and (CONVERT only)
  that `confirmDeleteRequest` still calls `setIsEditing(false)` and
  `setEditSnapshot(null)` before `removeLocalPageSubtree`. Direction: RED if the
  expand block is dropped from reparent, or the edit-session close is dropped
  from delete.

AC1/AC2/AC7(caller) are `useKbTreeActions.wiring.test.ts`. AC4/AC5/AC6/AC7(delete
close) are `useKbPageTree.wiring.test.ts`. AC3 is `knowledge-helpers.test.ts`.
No NEW test file is created - three existing ones are extended, all three already
match raw source with `indexOf`/`match`/`slice` (no comment-strip helper), so the
strip-comments canary (section 9, gate step 5) is NOT triggered.

---

## 9. Wave plan

One wave. Independently gateable and independently pushable, SUBJECT TO the
serialization flag in section 10 (these files are shared with
KNOWLEDGE-ASK-AI-INDEPENDENT - one writer at a time).

**Wave 1 - optimistic rename/reorder/reparent (+ delete under CONVERT).**

Write set (KEEP option):
- `src/app/components/knowledge/useKbPageTree.ts` - add `applyLocalPageUpdate`
  (optimistic branch + `!bodiesReady` fallback), export it. (CONVERT: also add
  `removeLocalPageSubtree`.)
- `src/app/components/knowledge/useKbTreeActions.ts` - accept
  `applyLocalPageUpdate`; `commitRename`/`reorder`/`reparent` call it instead of
  `refresh`; keep reparent's expand block. (CONVERT: also accept
  `removeLocalPageSubtree`; `confirmDeleteRequest` calls it instead of
  `refresh(null)`, keeping the edit-session close.)
- `src/app/components/knowledge/knowledge-helpers.ts` - add `replacePages`
  (CONVERT: also `removePageSubtree`).
- `src/app/components/KnowledgeTab.tsx` - destructure and pass the new seam(s)
  (~2-4 lines, section 7).
- `src/app/components/knowledge/useKbPageTree.wiring.test.ts` - extend (AC4, AC5,
  AC6, AC7-delete-close).
- `src/app/components/knowledge/useKbTreeActions.wiring.test.ts` - extend AND fix
  the now-false `:42-45` assertion (AC1, AC2, AC7-caller).
- `src/app/components/knowledge/knowledge-helpers.test.ts` - extend (AC3).

This wave includes the file that CALLS each new export:
`useKbTreeActions.ts` calls `applyLocalPageUpdate`/`removeLocalPageSubtree`, and
`KnowledgeTab.tsx` wires them. `replacePages`/`removePageSubtree` are called from
the seams in `useKbPageTree.ts`. No dead export.

**Gate (run from PowerShell, repo root):**

1. `npx tsc --noEmit` - no output, exit 0. (ONE caller only - it races on
   `tsconfig.tsbuildinfo`, `this-repo.md` section 2.)
2. `npm run lint` - exit 0, no NEW warning in the files this wave writes
   (compare against the same command before the change; do NOT pin an absolute
   count - `this-repo.md` section 1).
3. `npm run test:paths src/app/components/knowledge/useKbPageTree.wiring.test.ts src/app/components/knowledge/useKbTreeActions.wiring.test.ts src/app/components/knowledge/knowledge-helpers.test.ts`
   - one path per argument, every argument `COVERED`. Use `test:paths`, NEVER a
   raw multi-path `vitest`/`npm test`, which silently drops unmatched paths
   (`this-repo.md`, "Running a named set of test files").
4. `npx vitest run src/file-size-ceiling.structure.test.ts` - UNCONDITIONAL,
   every wave (`this-repo.md` section 1). Catches `KnowledgeTab.tsx`
   (966 -> ~968-970) and the hooks/helpers staying under 1000. Single path, so
   `npx vitest run` is fine here.
5. **CONDITIONAL (expected NOT to fire):** IF any edited test introduces a
   comment-stripping helper, it MUST be named `withoutLineComments` AND the gate
   MUST add `src/tools/strip-comments-agreement.structure.test.ts` (via
   `test:paths`), which enumerates every `*.test.ts` mentioning the strip-helper
   literal and reddens repo-wide until each is classified
   (`grep -an "knowledge" src/tools/strip-comments-agreement.structure.test.ts`
   -> only `knowledgeBulkBar.wiring.test.ts:374`). RECOMMENDED: do NOT add a
   strip helper - match raw source like the three existing tests already do
   (`indexOf`/`match`/`slice`). The seam and caller bodies contain no comment
   mentioning `refresh(`/`applyLocalPageUpdate(`/`listInstitutionPagesAction`, so
   a raw slice is unambiguous and this gate stays untriggered.

**Tree gate (not a vitest gate):** `git status --short` must show ONLY the write
set above - no `.claude/worktrees` copy edited instead of the real tree
(`this-repo.md` section 7; `Glob` returns the worktree copy FIRST).

The pre-push gate (lint + tsc + build compile-line) runs NO vitest
(`this-repo.md`, "The pre-push gate runs NO vitest"), so steps 3-4 MUST run in
the wave gate explicitly.

---

## 10. owns-set, disjointness, and serialization

### 10.1 Derivation command and output (run 2026-10-06 in this checkout)

Files that read the edited files AS SOURCE TEXT (the wiring/structure risk):

```
grep -rln "useKbPageTree\|useKbTreeActions" src --include=*.test.ts
  -> src/app/components/knowledge/useKbPageTree.wiring.test.ts
  -> src/app/components/knowledge/useKbTreeActions.wiring.test.ts

grep -rln "components/knowledge\|knowledge/useKb\|KnowledgeTab" src --include=*.structure.test.ts
  -> src/tools/strip-comments-agreement.structure.test.ts

grep -an "knowledge" src/tools/strip-comments-agreement.structure.test.ts
  -> 374:  "src/app/components/knowledge/knowledgeBulkBar.wiring.test.ts",

grep -an "useKbPageTree\|useKbTreeActions\|KnowledgeTab\|knowledge-helpers" src/file-size-ceiling.structure.test.ts
  -> (no output)
```

The strip-comments canary lists only `knowledgeBulkBar.wiring.test.ts`, which
this scope does NOT touch; it stays green as long as no new strip helper is added
(gate step 5). The file-size canary pins no knowledge file (walks all of `src/`
dynamically).

### 10.2 The owns-set

- `src/app/components/knowledge/useKbPageTree.ts` - edited + its
  `useKbPageTree.wiring.test.ts` (reads it as source).
- `src/app/components/knowledge/useKbTreeActions.ts` - edited + its
  `useKbTreeActions.wiring.test.ts` (reads it as source - and carries the
  `:42-45` assertion this change must update, AC2).
- `src/app/components/knowledge/knowledge-helpers.ts` - edited (new pure
  reducers) + its `knowledge-helpers.test.ts`.
- `src/app/components/KnowledgeTab.tsx` - edited (~2-4-line wiring).
- Source-text canary that can go red from these edits:
  `src/file-size-ceiling.structure.test.ts` (always, gate step 4).

**Delta from the backlog row's `owns`.** Row `KNOWLEDGE-MUTATION-LAG`
(`docs/BACKLOG.md:174`) lists `-` for `owns` (unfilled). This scope sets it to
the set above. The orchestrator should write this `owns` set onto the row before
the build wave, so the wave gate's `git status --short` has the right
assignment. Note it ADDS `knowledge-helpers.ts` + `knowledge-helpers.test.ts`
(the pure reducers) and `KnowledgeTab.tsx` (unavoidable wiring) beyond the two
hooks the follow-up note named.

### 10.3 Disjointness and serialization (one writer at a time)

`KNOWLEDGE-ASK-AI-INDEPENDENT` (`docs/BACKLOG.md:174` note, and
`docs/knowledge-ask-ai-independent-scope.md`) shares
`useKbPageTree.ts` / `useKbTreeActions.ts` / `KnowledgeTab.tsx` with this item.
These two items are NOT disjoint by exact path - they intersect on three files -
so they MUST NOT run concurrently (`parallel-disjointness.md`: file sets must not
intersect). SERIALIZE: one of the two builds on these files at a time; the second
re-briefs from the tree after the first lands. `CHATBOT-MODAL-VISUAL`
(`docs/BACKLOG.md:230`) is explicitly DISJOINT from this item (it is the app-wide
FAB `AiChatWindow`, not the knowledge tab) and may run in parallel.

KNOWLEDGE-CREATE-LAG (`docs/BACKLOG.md:173`, status `verification`) is landed
(`94f6d56d`) and this scope briefs from its as-built result (the shipped
`insertCreatedPage`), not from its plan.

---

## 11. Residuals

Each names an owner, an instrument, and the step that measures it. Any residual
not filed in `docs/BACKLOG.md` at the push does not exist (`DEV_LOOP.md`).

- **R1 - felt mutation speed (owner walk).** Owner: repo owner. Instrument: with
  bodies already loaded, the owner renames a page, reorders two siblings, and
  reparents a page in the Knowledge tab and confirms each completes immediately
  (no full-list wait). Step: owner walk after the push. Rationale: nothing
  profiles here and no component renders (`this-repo.md` section 6); the
  machine-checkable ACs prove the full-refetch CALL is gone (the mechanism), not
  the wall-clock gain.

- **R2 - cold-load-window mutations still pay the full read.** Owner: repo owner
  (decides whether it matters). Instrument: owner mutates immediately on a
  freshly-switched institution before bodies land. Step: reported in the verify.
  NOT a regression (equals today's behaviour); a known, accepted limit of the
  `bodiesReady` gate, identical to the create-lag R2.

- **R3 - reorder partial-failure staleness (pre-existing).** Owner: repo owner.
  Instrument: if the second of reorder's two move calls fails, the client list
  stays pre-swap until the next mutation/reload. Step: none in this chunk - this
  is today's behaviour (`useKbTreeActions.ts:206-209` returns before refresh),
  preserved unchanged, flagged so it is not attributed to this change.

- **R4 - delete still full-refetches (ONLY if the KEEP fork is chosen).** Owner:
  orchestrator to file as a backlog row if KEEP ships; agent-buildable.
  Instrument: the CONVERT design in section 4.2 (`removeLocalPageSubtree` +
  `removePageSubtree` + tests). Step: a future chunk. If the CONVERT fork is
  chosen instead, R4 does not exist. File at this chunk's push per the fork
  outcome.

---

## 12. What I cannot determine

- **Real wall-clock latency, before or after.** No live database, no `.env`, the
  network is blocked under vitest, and no component renders (`this-repo.md`
  section 6). The diagnosis is code-level (the full-body `select("*")` refetch in
  `refresh`) and the fix is proven by the call site being gone, not by a measured
  millisecond delta. R1/R2 own the felt speed as owner walks.

- **Whether the "no direct `listInstitutionPagesAction` in the optimistic
  branch" claim can be proven more strongly than by source text.** The hook
  cannot be invoked without a renderer (it uses `useState`/`useEffect`/`useRef`)
  and vitest here is node-env with no jsdom/testing-library, so there is no way
  to drive the seams and count real calls. The wiring assertion proves the call
  SITE is absent from the optimistic branch; it cannot prove runtime call counts.
  Stated as the honest ceiling, not worked around - the same limit the shipped
  create-lag tests carry.

- **The exact stability of `setActionError`** (the load effect's dep at `:165`).
  If it is not a stable reference the load effect can re-run for the same
  `active`, resetting `refreshedRef` at `:128`. Pre-existing (today's `refresh`
  is equally exposed), not introduced by this change, out of scope; flagged so
  the implementer does not attribute it to the new code.
