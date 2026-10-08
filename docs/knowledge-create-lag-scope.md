# KNOWLEDGE-CREATE-LAG - scope / recon

Owner, 2026-10-06: "considerable lag when creating a new knowledge page."
Backlog row `KNOWLEDGE-CREATE-LAG` (`docs/BACKLOG.md:173`), `owns` =
`src/app/components/knowledge/useKbPageTree.ts,
src/app/components/knowledge/useKbTreeActions.ts`.

This is a performance bug fix. There is no leverage claim: it adds no new
user-reachable capability, it makes an existing one faster. Fired trigger for
the AC leverage claim = "bug fix / perf, no new mechanism" (`seats.md`,
Acceptance criteria: "On a bug fix ... there is no claim to make; record that
as the fired trigger").

Every citation below was opened. Every quantity names the command that produced
it. "I cannot determine ..." sections are explicit at the end.

---

## 1. Measured diagnosis (confirmed and deepened)

### 1.1 The create path

`useKbTreeActions.ts:100-111` - `createTopLevel`:

```
const result = await createInstitutionPageAction({ institution: active, title: "Untitled page" }); // :103
...
await refresh(result.page.id); // :109
beginEdit(result.page);        // :110
```

`useKbTreeActions.ts:113-129` - `createChild` is identical except it expands the
parent first (`:123-126`: `setExpanded`, `writeExpandedIds(active, next)`) and
passes `parentId` to the create action (`:117`), then the same
`await refresh(result.page.id)` (`:127`) / `beginEdit(result.page)` (`:128`).

### 1.2 What `refresh` does, and why it is the lag

`useKbPageTree.ts:196-213` - `refresh(selectId?)`:

```
const result = await listInstitutionPagesAction(active); // :199  <-- the over-fetch
if ("error" in result) { setActionError(result.error); return; } // :200-203
refreshedRef.current = true;        // :204
setPages(result.pages);             // :205
setBodiesReady(true);               // :206
setLoadState("idle");               // :207
const validIds = new Set(result.pages.map((p) => p.id)); // :208
const desired = selectId !== undefined ? selectId : selectedId; // :209
applySelection(pickValidPageId(desired ?? null, validIds)); // :210
```

`listInstitutionPagesAction` (`src/app/actions/knowledge-base.ts:27-38`) calls
`listInstitutionPages` which does `select("*")` on `institution_pages`
(confirmed by the sibling KNOWLEDGE-SWITCH-SPEED diagnosis,
`docs/BACKLOG.md:174`: "select(\"*\") drags unbounded bodies") - i.e. the FULL
body of EVERY page in the institution. Page bodies can embed attachment text
(`describeKnowledgeContextLabel` / the attachments feature), so this payload is
unbounded. Creating ONE empty page therefore refetches every other page's full
body before the editor opens.

This is exactly the over-fetch KNOWLEDGE-SWITCH-SPEED removed from the INITIAL
load (shipped `e8c745b1`, verified `a84f26b4`; `docs/BACKLOG.md:174`) by loading
titles-only summaries first and bodies in the background. `refresh` was left
unchanged and still pays the full-body read on every mutation.

### 1.3 The create action returns a complete, genuinely-empty page (confirmed)

`createInstitutionPageAction` (`src/app/actions/knowledge-base.ts:92-114`)
returns `{ page }` where `page` is `createInstitutionPage(...)`'s return
(`:106-110`). `createInstitutionPage` (`src/lib/knowledge-base.ts:616-654`)
inserts a full row - `title: input.title ?? ""` (`:638`, here "Untitled page"),
`body: input.body ?? ""` (`:639`, here `""`), `tags: input.tags ?? []` (`:640`,
here `[]`), a server-assigned `position` via `nextPosition` (`:629`, `:362-365`
= `max(sibling positions)+1`), real `id`/`created_at`/`updated_at` (`:634`,
`:642-643`) - and returns `mapInstitutionPage(row)` (`:653`). So `result.page`
is a complete `InstitutionPage` whose empty body is REAL (a new blank page),
not a placeholder. This is the object the optimistic insert needs; no second
read is required to obtain it.

### 1.4 Sizes (both mandated instruments; they agree here)

Commands: `@(Get-Content <f>).Count` (PowerShell) and `wc -l < <f>` (Bash tool),
run 2026-10-06 in this checkout.

| File | `@(Get-Content).Count` | `wc -l` |
|---|---|---|
| `src/app/components/knowledge/useKbPageTree.ts` | 273 | 273 |
| `src/app/components/knowledge/useKbTreeActions.ts` | 251 | 251 |
| `src/app/components/knowledge/knowledge-helpers.ts` | 823 | 823 |
| `src/app/components/knowledge/useKbPageTree.wiring.test.ts` | 33 | 33 |
| `src/app/components/knowledge/useKbEditSession.ts` | 220 | 220 |
| `src/app/components/KnowledgeTab.tsx` | 964 | 964 |

All far under the 1000-line ceiling (`src/file-size-ceiling.structure.test.ts`,
`LIMIT = 1000` at `:41`). `KnowledgeTab.tsx` at 964 is the closest; the wiring
change to it must stay to ~2 lines (see 3.4). No knowledge file is in
`ALLOWED_OVERAGE` (`grep -an "knowledge" src/file-size-ceiling.structure.test.ts`
returns nothing), so none is pinned.

---

## 2. The fix: optimistic insert, `bodiesReady`-gated, with a full-read fallback

### 2.1 New seam: `insertCreatedPage` on `useKbPageTree`

Add one method to `useKbPageTree`, exported in `UseKbPageTreeReturn`
(`useKbPageTree.ts:48-69`):

```
insertCreatedPage: (page: InstitutionPage) => Promise<void>;
```

The decision between optimistic-insert and full-refetch lives INSIDE this hook,
because the hook owns `pages`, `bodiesReady`, `refreshedRef` and `applySelection`
- the caller (`useKbTreeActions`) must not have to know the body-window state.
Shape (final wording is the implementer's; the behaviour is pinned here):

```
const insertCreatedPage = useCallback(async (page: InstitutionPage) => {
  if (!active) return;
  if (!bodiesReady) {
    // Initial background-bodies window: a full read both includes the new
    // page AND repairs the body-less placeholders still on screen. This is
    // the pre-optimisation behaviour, preserved. See 2.4.
    await refresh(page.id);
    return;
  }
  refreshedRef.current = true;                       // mirror refresh(): guard (2.3a)
  setPages((prev) => (prev ? [...prev, page] : [page])); // append (2.2)
  setBodiesReady(true);                              // already true; mirrors refresh()
  setLoadState("idle");                              // already idle; mirrors refresh()
  const validIds = new Set([...(pages ?? []).map((p) => p.id), page.id]);
  applySelection(pickValidPageId(page.id, validIds)); // select (2.2)
}, [active, bodiesReady, pages, refresh, applySelection]);
```

`pickValidPageId` (`knowledge-helpers.ts:249-251`) returns `page.id` because
`page.id` is in `validIds` by construction; it is used to mirror `refresh`'s
exact shape (`:210`), not because the id could be invalid.

### 2.2 Selection + expansion reproduced (traced against today)

- **Selection.** `refresh(selectId)` resolves selection by calling
  `applySelection(pickValidPageId(desired, validIds))` (`:210`). `applySelection`
  (`:179-187`) does four things: `setSelectedIdState(id)` (`:181`),
  `writeSelectedPageId(active, id)` (`:182`), `lastAppliedRequestRef.current = id`
  (`:183`), `onSelectedPageIdChange(id)` (`:184`). The optimistic path calls the
  SAME `applySelection(page.id)`, so all four happen identically. Setting
  `lastAppliedRequestRef.current = page.id` is load-bearing: the reconciliation
  effect (`:229-237`) early-returns when
  `requestedPageId === lastAppliedRequestRef.current` (`:231`); reusing
  `applySelection` keeps that invariant, so the effect does not re-resolve the
  selection or call `closeEditSession()` (`:235`) against the fresh selection.
  Bypassing `applySelection` (e.g. a raw `setSelectedIdState`) would break this
  and wipe the edit session beginEdit is about to open.

- **Expansion.** Expansion is NOT part of `refresh`; `createChild` does it
  itself at `:123-126` before calling refresh. That block is UNCHANGED - only
  the `refresh(result.page.id)` call at `:127` becomes
  `insertCreatedPage(result.page)`. `createTopLevel` expands nothing today and
  continues to expand nothing. So expansion behaviour is identical.

- **Sibling order.** The new page is appended to the END of the `pages` array,
  but `buildPageTree` (`src/lib/knowledge-base.ts:207-229`) sorts every sibling
  list by `position` then `title` (`:218-219`), so array order does not affect
  render order. The new page's `position` is the server's `nextPosition`
  (`max+1`), placing it LAST among its siblings - exactly where today's
  full-refetch would also place it. `pageBreadcrumb` (`:343-359`) is a `byId`
  map walk, also order-independent. Equivalence holds.

### 2.3 The concurrency / placeholder guards (the decisive part)

`useKbPageTree` holds `pages` as one list that during the initial load window
contains body-less PLACEHOLDERS from summaries (`pagesFromSummaries`,
`knowledge-helpers.ts:783-795`, `body: ""`). The load effect (`:118-161`) runs
two fetches and is guarded by `refreshedRef`:

- `:124` `refreshedRef.current = false` at effect start;
- `:129` summaries result is dropped if `bodiesLanded || refreshedRef.current`;
- `:150` bodies result is dropped if `refreshedRef.current`;
- `:151` otherwise `setPages(result.pages)` REPLACES the whole list with the
  server's body list.

The insert must survive this. The design handles each interleaving:

**(a) No clobber by a late fetch - set `refreshedRef` in the optimistic branch.**
In the common case (`bodiesReady === true`) both fetches have already resolved
(bodiesReady only flips at `:152`/`:206` after a body read completes), so there
is nothing in flight; setting `refreshedRef.current = true` is defensive and
matches `refresh`'s own contract (`:204`). It also closes the narrow race where
the load effect re-runs after the insert: `:124` would reset the guard and
re-issue both reads, but the post-create body read now includes the new page,
so a re-fetch cannot drop it.

**(b) The new empty body is GENUINELY empty, never "pending".**
`isBodyPending` (`knowledge-helpers.ts:821-823`) = `hasSelectedPage &&
!bodiesReady`. In the optimistic branch `bodiesReady` is already `true`, so the
new page's selected state yields `isBodyPending === false`: the editor opens
(the "Edit" button's `disabled={bodyPending}` at `KnowledgeTab.tsx:863` stays
enabled), and nothing renders the empty body as "contents loading". The new
page is treated as a real blank page, which it is.

**(c) A create DURING the background-bodies window still holds - via the
fallback, NOT an optimistic append.** When `bodiesReady === false`, an
optimistic append would face an unwinnable choice: set `refreshedRef` and the
existing placeholders never get their bodies (the `:150` guard blocks the
background read forever, stranding every other page body-less for the session);
or do not set it and the background read's `setPages(result.pages)` at `:151`
replaces the list with a server fetch that was issued at mount BEFORE the page
existed, dropping the new page. The fallback dodges both: it calls `refresh(id)`,
which does a fresh full read that (i) includes the just-created page and (ii)
repairs the placeholders with real bodies, exactly as today. This window is
short (only between first summaries paint and bodies landing on a cold tab) and
is the one case that still pays the full read - an accepted, non-regressing cost
(it equals today's behaviour), covered by the owner speed-walk residual.

### 2.4 Why gate on `bodiesReady` rather than always-merge

An always-optimistic variant would need a background-merge that preserves
locally-inserted ids against the `:151` replacement (track inserted ids, merge
rather than replace). That is strictly more code in the most delicate part of
the hook, for a win only in the brief cold-load window. The `bodiesReady` gate
reuses the EXISTING `refresh` as the window-case answer and keeps the new code
to a pure append + the existing `applySelection`. Recommended. If a later owner
walk shows the window case itself feels slow, the background-merge variant is
the documented follow-up - but the owner's reported pain is steady-state create
(bodies already loaded), which the gated design removes entirely.

---

## 3. Post-create UX preservation

### 3.1 What the user gets today

After create, `beginEdit(result.page)` (`useKbTreeActions.ts:110`/`:128`) runs.
`beginEdit` (`useKbEditSession.ts:136-143`) seeds the draft from the page
(`setDraftTitle(page.title)` "Untitled page", `setDraftBody(page.body)` "",
`setDraftTags(...)` "") and sets `isEditing = true`. So the user lands with the
new page SELECTED and the editor OPEN on it, ready to rename and fill. This is
the whole point of creating a page.

### 3.2 Preserved exactly

`beginEdit(result.page)` is called with the SAME argument (`result.page`, the
full page straight from the create action - NOT a value re-read from the list)
and in the SAME position (after the selection/insert). The optimistic path does
not touch `beginEdit`, `useKbEditSession`, or the ordering. Because the
optimistic path reaches the identical post-call state - `selectedId = page.id`,
`lastAppliedRequestRef = page.id`, `pages` containing the page, `bodiesReady`
true, `isEditing` true - the reconciliation effect (`:229-237`) behaves the same
as it does after today's `refresh(id)` (it early-returns on the matching
`lastAppliedRequestRef`, or re-resolves to the same id), so it cannot close the
just-opened edit session. The post-create rename/fill UX is unchanged.

### 3.3 Equivalence as the correctness basis

The design's safety rests on one claim: the optimistic branch produces a state
transition observably identical to today's `refresh(result.page.id)` EXCEPT for
the data SOURCE of `pages` (local append vs server refetch) and the fact that
`bodiesReady`/`loadState` are already at their target values. The id-set fed to
`validIds` is the same in both (server list after create = prior pages + new
page = the appended list), so every `pages`-derived consumer
(`tree`, `selectedPage`, `breadcrumb`, the reconciliation effect) sees the same
input. The only state that differs is the BODIES of the OTHER pages - and the
optimistic branch only runs when those bodies are already present
(`bodiesReady`), so they are identical too.

### 3.4 `KnowledgeTab.tsx` wiring (keep tiny)

`useKbTreeActions` receives its callbacks from `KnowledgeTab.tsx`. It must now
also receive `insertCreatedPage`. Required edits:

- `useKbPageTree.ts`: add `insertCreatedPage` to `UseKbPageTreeReturn`
  (`:48-69`) and the returned object (`:257-272`).
- `useKbTreeActions.ts`: add `insertCreatedPage` to `UseKbTreeActionsArgs`
  (`:23-45`), destructure it (`:67-82`), and in `createTopLevel`/`createChild`
  replace `await refresh(result.page.id)` with
  `await insertCreatedPage(result.page)` (`:109`, `:127`). `refresh` stays a
  prop - rename/delete/reorder/reparent still use it.
- `KnowledgeTab.tsx`: destructure `insertCreatedPage` from `useKbPageTree`'s
  return and pass it into the `useKbTreeActions({...})` args object (~2 lines;
  964 -> ~966, still under 1000).

---

## 4. rename / reorder / reparent / delete - DEFER (recommended)

All four other mutators in `useKbTreeActions.ts` also call `refresh()` with the
same full-body refetch, so they are laggy in the same way:

| Mutator | line | action return | optimistic feasibility |
|---|---|---|---|
| `commitRename` | `:144-159` -> `refresh()` `:158` | `updateInstitutionPageAction` returns `{page}` (full updated page) | HIGH - replace that one page in `pages`; selection unchanged |
| `reorder` | `:190-209` -> `refresh()` `:208` | TWO `moveInstitutionPageAction` calls, each returns `{page}` | MEDIUM - two position writes to mirror locally |
| `reparent` | `:211-227` -> `refresh()` `:226` | one `moveInstitutionPageAction` `{page}` | MEDIUM - one parentId write; already expands new parent |
| `confirmDeleteRequest` | `:165-179` -> `refresh(null)` `:178` | `{ok:true}` (NO page); server CASCADES to the whole subtree | LOW/RISKY - local removal must replicate the DB cascade (page + all descendants) exactly, or the tree lies |

**Recommendation: scope CREATE now; file rename/reorder/reparent/delete as a
separate follow-up row.** Reasons:

1. The owner named CREATE specifically, and create is the most frequent and most
   jarring case (click New, then wait for every body before you can type).
2. Each other mutator carries its own correctness nuance - reorder's two-write
   swap, delete's server-side cascade - that deserves its own design and its own
   red-then-green guard rather than being under-checked inside this chunk.
3. CREATE alone keeps this chunk's write set to two hooks + one wiring line in
   `KnowledgeTab.tsx` + one test, independently pushable.
4. They are genuinely feasible (each non-delete action already returns the full
   affected page; delete needs a cascade-mirroring helper), so the follow-up is
   real work, not a dead end.

Follow-up row to file: `KNOWLEDGE-MUTATION-LAG` - optimistic rename/reorder/
reparent/delete over the same `refresh` full-refetch, owner, instruments = the
same wiring-test shape per mutator + the pure cascade-removal helper for delete,
measured by a red-then-green source-text guard per mutator and an owner speed
walk. (Listed in Residuals, section 7.)

---

## 5. Acceptance criteria

No leverage claim (perf bug fix; trigger recorded above). Every pass condition
names the object, the instrument, and the direction of failure. Nothing renders
under vitest (`this-repo.md` section 6), so these are source-text / pure-logic
instruments; felt speed is an owner walk (section 7).

- **AC1 - create no longer triggers the full-body refetch (the fix).**
  Object: the `createTopLevel` and `createChild` function bodies in
  `useKbTreeActions.ts`. Instrument: a `*.wiring.test.ts` that slices each
  function's source and asserts it references `insertCreatedPage(` and does NOT
  reference `refresh(`. Fails (RED) if either create handler calls `refresh`
  (the old full-refetch entry point) or omits `insertCreatedPage`.

- **AC2 - the optimistic branch does not re-read the page list.**
  Object: `insertCreatedPage`'s optimistic (post-`bodiesReady`) branch.
  Instrument: wiring assertion that `insertCreatedPage` reaches
  `listInstitutionPagesAction` ONLY through the `!bodiesReady` fallback's
  `refresh` call, not directly. Direction: RED if a direct
  `listInstitutionPagesAction(` appears in `insertCreatedPage` outside the
  fallback. (See section 8.3 for the honest limit of what source text can
  prove here.)

- **AC3 - the insert adds the page to the list (pure).**
  Object: the append transition. Instrument: a pure helper
  (`appendCreatedPage(pages, page)` extracted into `knowledge-helpers.ts`, OR
  an inline `[...prev, page]` asserted via a small pure test if the implementer
  keeps it inline) unit-tested: result length = input+1, result contains
  `page`, every prior page preserved, input array not mutated. Direction: RED if
  the page is missing, an existing page is dropped, or the input is mutated.

- **AC4 - selection + edit session reproduced.**
  Object: the create path. Instrument: wiring assertion that the create handlers
  still call `beginEdit(result.page)` after the insert, and that
  `insertCreatedPage` resolves selection through `applySelection` (not a raw
  `setSelectedIdState`). Direction: RED if `beginEdit` is dropped from a create
  handler, or if `insertCreatedPage` sets the selected id without
  `applySelection` (which would let the reconciliation effect wipe the session).

- **AC5 - window-case fallback preserved.**
  Object: `insertCreatedPage`. Instrument: wiring assertion that it contains a
  `!bodiesReady` (or `bodiesReady`) branch whose body calls `refresh(`.
  Direction: RED if the fallback branch is removed (which would strand
  placeholders or drop the new page during the cold-load window).

- **AC6 - the clobber guard is set on the optimistic branch.**
  Object: `insertCreatedPage`'s optimistic branch. Instrument: wiring assertion
  that it sets `refreshedRef.current = true`. Direction: RED if the guard write
  is absent (mirrors `refresh`'s `:204`).

AC1/AC2/AC4/AC5/AC6 are one `useKbTreeActions.wiring.test.ts` plus additions to
`useKbPageTree.wiring.test.ts`. AC3 is a `knowledge-helpers.test.ts` addition (or
a tiny pure test) if a helper is extracted.

---

## 6. Wave plan

One wave. It is independently gateable and independently pushable (no other
backlog item is mid-flight on these files; see owns-set in section 8).

**Wave 1 - optimistic create insert.**

Write set:
- `src/app/components/knowledge/useKbPageTree.ts` - add `insertCreatedPage`
  (optimistic branch + `!bodiesReady` fallback), export it.
- `src/app/components/knowledge/useKbTreeActions.ts` - accept
  `insertCreatedPage`; `createTopLevel`/`createChild` call it instead of
  `refresh`; keep `beginEdit(result.page)` and `createChild`'s expand block.
- `src/app/components/KnowledgeTab.tsx` - destructure and pass
  `insertCreatedPage` (~2 lines).
- `src/app/components/knowledge/useKbPageTree.wiring.test.ts` - extend for AC2,
  AC5, AC6.
- `src/app/components/knowledge/useKbTreeActions.wiring.test.ts` - NEW, for AC1,
  AC4.
- `src/app/components/knowledge/knowledge-helpers.ts` + `knowledge-helpers.test.ts`
  - ONLY if AC3's append is extracted as a pure helper; omit both if the
  implementer keeps the append inline and tests it another way.

This wave includes the file that CALLS the new export: `useKbTreeActions.ts`
(and `KnowledgeTab.tsx`, which wires it). No dead export.

**Gate (run from PowerShell, repo root):**

1. `npx tsc --noEmit` - no output, exit 0.
2. `npm run lint` - exit 0, no NEW warning in the files this wave writes
   (compare against the same command before the change; do not pin an absolute
   count - `this-repo.md` section 1).
3. `npm run test:paths src/app/components/knowledge/useKbPageTree.wiring.test.ts src/app/components/knowledge/useKbTreeActions.wiring.test.ts src/app/components/knowledge/knowledge-helpers.test.ts` - one path per argument, every argument `COVERED`. (Drop the `knowledge-helpers.test.ts` argument if AC3 is not a helper test. Use `test:paths`, never a raw multi-path `vitest`, which silently drops unmatched paths - `this-repo.md`, "Running a named set of test files".)
4. `npx vitest run src/file-size-ceiling.structure.test.ts` - UNCONDITIONAL, every wave. Catches `KnowledgeTab.tsx` (964 -> ~966) and the two hooks staying under 1000.
5. **CONDITIONAL:** IF the new `useKbTreeActions.wiring.test.ts` (or any edited
   test) introduces a comment-stripping helper, it MUST be named
   `withoutLineComments` AND the gate MUST add
   `src/tools/strip-comments-agreement.structure.test.ts` (via `test:paths`).
   That structure test enumerates every `*.test.ts` mentioning the strip helper
   literal and reddens repo-wide until each is classified (it already lists
   `src/app/components/knowledge/knowledgeBulkBar.wiring.test.ts`:
   `grep -an "knowledge" src/tools/strip-comments-agreement.structure.test.ts`).
   RECOMMENDED: do NOT add a strip helper - match raw source like the existing
   `useKbPageTree.wiring.test.ts` does (it uses plain `indexOf`/`match`). The
   create functions (`useKbTreeActions.ts:100-129`) contain no comment
   mentioning `refresh(` or `insertCreatedPage(`, so a raw-source slice is
   unambiguous and the conditional gate is not triggered.

**Tree gate (not a vitest gate):** `git status --short` must show ONLY the write
set above - no `.claude/worktrees` copy edited instead of the real tree
(`this-repo.md` section 7; `Glob` returns the worktree copy first).

Pre-push gate (lint + tsc + build compile-line) runs NO vitest, so steps 3-5
must run in the wave gate explicitly (`this-repo.md`, "The pre-push gate runs NO
vitest").

---

## 7. Residuals

Each names an owner, an instrument, and the step that measures it. Any residual
not filed in `docs/BACKLOG.md` at the push does not exist (`DEV_LOOP.md`).

- **R1 - felt create speed (owner walk).** Owner: repo owner. Instrument: the
  owner creates a top-level and a child page in the Knowledge tab with bodies
  already loaded and confirms the editor opens immediately (no full-list wait).
  Step: owner walk after the push. Rationale: nothing profiles here and no
  component renders (`this-repo.md` section 6), so the machine-checkable ACs
  prove the full-refetch CALL is gone (the mechanism), not the wall-clock gain.

- **R2 - cold-load-window create still pays the full read.** Owner: repo owner
  (decides whether it matters). Instrument: owner walk - create a page
  immediately on a freshly-switched institution before bodies land. Step:
  reported in the verify; if it feels slow, the always-optimistic
  background-merge variant (section 2.4) is the fix. This is NOT a regression
  (it equals today's behaviour); it is a known, accepted limit of the gated
  design.

- **R3 - KNOWLEDGE-MUTATION-LAG follow-up (rename/reorder/reparent/delete).**
  Owner: orchestrator to file as a backlog row; agent-buildable. Instrument:
  per-mutator red-then-green source-text guard (create's own wiring shape,
  repeated) + a pure cascade-removal helper for delete + an owner speed walk.
  Step: a future chunk; feasibility per section 4's table. File at this chunk's
  push.

---

## 8. owns-set and disjointness

### 8.1 Derivation command and output

Files that read the edited files AS SOURCE TEXT (the wiring/structure risk):

```
grep -arln "useKbPageTree\|useKbTreeActions" src --include=*.test.ts
  -> src/app/components/knowledge/useKbPageTree.wiring.test.ts

grep -arln "components/knowledge\|knowledge/useKb" src --include=*.structure.test.ts
  -> src/tools/strip-comments-agreement.structure.test.ts

grep -an "knowledge" src/tools/strip-comments-agreement.structure.test.ts
  -> 374:  "src/app/components/knowledge/knowledgeBulkBar.wiring.test.ts",

grep -an "useKbPageTree\|useKbTreeActions\|KnowledgeTab" src/file-size-ceiling.structure.test.ts
  -> (no output)
```

(All run 2026-10-06 in this checkout.)

### 8.2 The owns-set

- `src/app/components/knowledge/useKbPageTree.ts` - edited + its
  `useKbPageTree.wiring.test.ts` (reads it as source).
- `src/app/components/knowledge/useKbTreeActions.ts` - edited + a NEW
  `useKbTreeActions.wiring.test.ts` (reads it as source; no existing test reads
  it - the grep above found none).
- `src/app/components/KnowledgeTab.tsx` - edited (~2-line wiring).
- `src/app/components/knowledge/knowledge-helpers.ts` + its
  `knowledge-helpers.test.ts` - edited ONLY if AC3 extracts a pure append
  helper.
- Source-text canary that can go red from these edits:
  `src/file-size-ceiling.structure.test.ts` (always), and
  `src/tools/strip-comments-agreement.structure.test.ts` ONLY if a strip helper
  is added (section 6, step 5).

**Delta from the backlog row's `owns`.** The row (`docs/BACKLOG.md:173`) lists
only `useKbPageTree.ts` and `useKbTreeActions.ts`. This scope ADDS
`KnowledgeTab.tsx` (unavoidable: it constructs both hooks and must thread the
new callback between them), the two wiring tests, and conditionally
`knowledge-helpers.ts`. The orchestrator should update the row's `owns` to this
set before the build wave, so the wave gate's `git status --short` check has the
correct assignment.

### 8.3 Disjointness note

KNOWLEDGE-SWITCH-SPEED (`docs/BACKLOG.md:174`) is in VERIFICATION and shares
these exact hooks; it must be fully landed (it is: W1 `af0a78a8` + W2 `e8c745b1`)
before this builds - do NOT run them concurrently, they intersect by exact path.
No other open row lists these knowledge files. `KnowledgeTab.tsx` is also touched
by nothing else open (confirm at build time with a fresh
`git status --short`).

---

## 9. What I could not determine

- **Real wall-clock latency, before or after.** No live database, no `.env`, the
  network is blocked under vitest, and no component renders
  (`this-repo.md` section 6). The diagnosis is code-level (the full-body
  `select("*")` refetch) and the fix is proven by the call site being gone, not
  by a measured millisecond delta. R1/R2 own the felt speed as owner walks.

- **Whether AC2's "no direct `listInstitutionPagesAction` in the optimistic
  branch" can be proven more strongly than by source text.** The hook cannot be
  invoked without a renderer (it uses `useState`/`useEffect`/`useRef`), and
  vitest here is node-env with no jsdom/testing-library, so there is no way to
  drive `insertCreatedPage` and count real calls. The wiring assertion proves
  the call SITE is absent from the optimistic branch; it cannot prove runtime
  call counts. Stated as the honest ceiling, not worked around.

- **The exact stability of `setActionError`** (the load effect's dep at `:161`).
  If it is not a stable reference the load effect can re-run for the same
  `active`, resetting `refreshedRef` at `:124`. This is pre-existing behaviour
  (today's `refresh` is equally exposed) and not introduced by this change, so it
  is out of scope; flagged so the implementer does not attribute it to the new
  code.
