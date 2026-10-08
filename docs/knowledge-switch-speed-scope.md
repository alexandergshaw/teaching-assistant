# KNOWLEDGE-SWITCH-SPEED - scope / recon (architecture seat)

Performance fix. Owner report (2026-10-06): "when i initially load into the
knowledge tab, it takes a while for the pages to load in ... it's whenever i
switch the institution on the knowledge tab." Switching the selected
institution on the Knowledge tab is slow to show the sidebar page tree.

This is scope only - diagnosis, acceptance criteria, architecture, wave plan,
forks, residuals. No production code. A fresh `loop-checker` reads this before
any build. Every quantity below names the command that produced it. Nothing
runs or profiles in this environment (node-env, no live DB, no `.env`, no
rendered component), so the diagnosis is CODE-LEVEL: the load path is traced
from source and the block identified structurally, not timed.

**Leverage claim: none owed.** This is a bug/performance fix, not a feature a
user reaches for the first time, so per `docs/loop/leverage.md` and the AC seat
brief there is no leverage claim (fired trigger: "bug fix / perf fix"). It does
not create a new capability; it removes a dependency that makes an existing one
slow.

**Prior-version disposition table: N/A.** This artifact has no prior version;
it does not restructure an earlier scope. `docs/BACKLOG.md` carries no existing
KNOWLEDGE-SWITCH-SPEED row at authoring time.

---

## 1. The measured diagnosis - the block, cited

### 1.1 The switch path, end to end

Trigger -> reload -> render, each step opened and cited:

1. **Trigger.** The institution pills call `switchInstitution(code)`
   (`src/app/components/KnowledgeTab.tsx:572`, handler at `:226-230`), which,
   after the unsaved-edits guard, calls `onActiveChange(code)` (`:229`).
   `page.tsx` updates the `active` prop passed back into `KnowledgeTab`
   (`:90`, `:157`).
2. **Reset (render-time).** `useKbPageTree` detects `active !== prevActive`
   and, DURING RENDER, sets `pages = null` and `loadState = "loading"`
   (`src/app/components/knowledge/useKbPageTree.ts:86-93`). So the tree data is
   cleared immediately on switch.
3. **Reload (full bodies).** The load effect, keyed on `[active]`, calls
   `listInstitutionPagesAction(active)`
   (`useKbPageTree.ts:102-120`, the call at `:106`; `refresh` at `:158` uses
   the same action). That action
   (`src/app/actions/knowledge-base.ts:27-38`) calls `listInstitutionPages`
   (`src/lib/knowledge-base.ts:459-473`), whose query is
   `select("*")` (`:466`) - **every column, including `body`**
   (`body text not null default ''`,
   `supabase/migrations/20260910000000_create_institution_pages.sql:27`).
4. **Render gate.** The tree data is `tree = pages ? buildPageTree(pages) : []`
   (`useKbPageTree.ts:122`). The sidebar renders only when
   `loadState === "idle"` (`KnowledgeTab.tsx:815-830`), which is set only after
   the full-body payload returns (`useKbPageTree.ts:113-114`). Until then the
   pane shows `Loading {active} pages...` (`KnowledgeTab.tsx:812`).

**The block, stated precisely:** the sidebar page tree cannot render until the
FULL-BODY payload of every page in the switched-to institution arrives, even
though the tree only needs titles. The tree-building function proves the
over-fetch: `buildPageTree` is generic over `TreeSource`
(`knowledge-base.ts:207`) and reads only `id`, `parentId`, `title`, `position`
to nest and to sort siblings (`:211-229`, sort at `:218-219`). `body`, `tags`,
`createdAt`, `updatedAt` are fetched and transferred for the tree's benefit and
never read by it.

### 1.2 The faster reads already exist (confirmed, not assumed)

- `listInstitutionPageSummariesAction`
  (`src/app/actions/knowledge-base.ts:49-60`) -> `listInstitutionPageSummaries`
  (`knowledge-base.ts:511-526`): `select("id, parent_id, title, position")`
  (`:519`) - titles, no body. Returns `InstitutionPageSummary[]`
  (`knowledge-base.ts:47-52`), and that type satisfies `TreeSource`
  (`:63-68`) without widening, so `buildPageTree` already accepts it - the
  recording-side picker `AddKnowledgePages.tsx` is a live second caller of the
  same builder over summaries (`knowledge-base.ts:184-193`). Same
  `.order("position", { ascending: true })` as the full read (`:522` vs `:469`),
  so the nested tree is structurally identical to today's.
- `getInstitutionPagesByIdsAction`
  (`src/app/actions/knowledge-base.ts:70-81`) -> `getInstitutionPagesByIds`
  (`knowledge-base.ts:590-605`): `select("*").in("id", ids)` (`:597-601`) -
  on-demand bodies for a set of ids, empty-input guarded (`:595`), missing/
  foreign id silently absent (`:604`).

### 1.3 No existing caching

`grep -rln "react-query\|@tanstack\|useSWR\|swr" src/app/components/knowledge/
src/app/components/KnowledgeTab.tsx src/lib/knowledge-base.ts
src/app/actions/knowledge-base.ts` returns nothing. The render-time reset
(`useKbPageTree.ts:86-93`) clears `pages` to `null` on every switch and the
effect refetches from scratch (`:102-120`). So there is no memoization across
institutions: switching away and back re-pays the full read. This is why Option
3 (cache per institution, section 5) cannot by itself fix the owner's
complaint, which is the FIRST switch into an institution.

### 1.4 What cannot be determined in this environment

- **Real payload sizes / timings.** No live DB and no `.env`
  (`docs/loop/this-repo.md` section 6), so the actual byte size of a full-body
  payload versus a summaries payload, and the wall-clock saving, cannot be
  measured here. What IS certain from the code is the STRUCTURAL dependency: the
  tree render awaits the full read. The fix removes that dependency and is
  correct regardless of payload magnitude; the magnitude only decides how large
  the felt improvement is. A realistic figure is an owner/browser measurement
  (residual R6).
- **Felt speed.** No component is rendered by any test here
  (`docs/loop/this-repo.md` section 2), so "the tree appears instantly on
  switch" is not machine-verifiable. It is an owner browser walk (R6). What is
  machine-verifiable is the structural claim: the tree builds from a body-less
  source and does not await bodies (section 6, AC-1/AC-2).

### 1.5 Bodies are text, not inlined blobs

Attachments embed into a body as Markdown REFERENCES (`label` + `attachmentId`),
not base64 bytes (`src/app/components/knowledge/attachment-embed.ts:30,86`;
`body` is a `text` column, migration `:27`). So a page body is prose text - it
can be long for a detailed policy page, but it does not carry attachment binary.
The per-row size difference between the summary read and the full read is
therefore the body prose plus `tags`/timestamps, unbounded per page.

---

## 2. The body-dependent consumers (each confirmed against the tree)

A summaries-only tree would starve these four. Each must keep working:

| Consumer | Site | What it needs | Scope of bodies |
|---|---|---|---|
| Client search | `searchPages(pages, search)` `KnowledgeTab.tsx:487`; reads `page.body` at `knowledge-base.ts:325,330-331` | ALL bodies (substring over title+body+tags) | whole institution |
| Overview `hasContent` + summary/ask context | `useKnowledgeOverview.ts:149` (`scopePages.some(p => p.body.trim())`); panel gated `pages && pages.length > 0` `KnowledgeTab.tsx:842,918` | in-scope bodies | page + descendants, or whole institution |
| `PageBody` render | `KnowledgeTab.tsx:980-981` (`selectedPage.body`) | SELECTED page's body | one page |
| Start recording / Start grading with selection | `KnowledgeTab.tsx:395-436` and `:451-484` (`selectedPages.map(p => ({title, body}))` at `:399,455`) | CHECKED pages' bodies | the bulk selection |

**Not body-dependent (important):** "Ask AI about selection"
(`askAiAboutSelection`, `KnowledgeTab.tsx:370-377`) sends page IDS only
(`knowledgePageIds`, `:371`); the server resolves bodies. It needs no client
bodies, so it keeps working the instant the tree (ids) exists. The structure
consumers - `PageTreeView`, breadcrumb, selection checkboxes, select-all,
`describeSelectedPages`, `ParentPicker` (uses only `invalidParentIds` + id/title
map, `ParentPicker.tsx:25-26`), reorder/reparent/delete-count in
`useKbTreeActions` - read only `id/parentId/title/position`, so all satisfy
`TreeSource` and work off summaries.

Because search, overview, and multi-select recording each need MANY bodies (not
just the selected one), a "fetch only the opened page's body" design does not
feed them - it would also force search server-side and a checked-bodies fetch at
recording time. That is the argument for fetching the full body set eagerly in
the background (section 5, fork A) rather than purely on demand (fork B).

---

## 3. The hard constraint that shapes the whole plan: the 1000-line ceiling

`@(Get-Content src/app/components/KnowledgeTab.tsx).Count` = **992**, and
`wc -l < src/app/components/KnowledgeTab.tsx` = **992** (both instruments agree
here). The repo-wide ceiling is `LIMIT = 1000`
(`src/file-size-ceiling.structure.test.ts:41`), walked over all of `src/`
(`listSourceFiles`, `:101-111`), and `KnowledgeTab.tsx` is NOT in that test's
`ALLOWED_OVERAGE` ratchet (`grep -ni "KnowledgeTab" src/file-size-ceiling.
structure.test.ts` returns nothing). So KnowledgeTab.tsx has **8 lines of
headroom**. The graceful-degradation wiring this fix adds to KnowledgeTab.tsx
(search degradation + a body-pending branch + one bulk-bar prop) will exceed 8
net lines, so the fix cannot land in KnowledgeTab.tsx as-is without breaching a
frozen gate. Section 7 resolves this with a headroom extraction; it is an
engineering prerequisite forced by the gate, not a product choice.

Measure again after every wave with
`@(Get-Content src/app/components/KnowledgeTab.tsx).Count`; a wave that leaves
it `> 1000` reddens the ceiling and must not push.

---

## 4. Recommended shape

**Option 1 - SUMMARIES-FIRST tree + BACKGROUND full bodies.** Recommended.

On an institution switch:
1. Fetch summaries (`listInstitutionPageSummariesAction`), build the tree from
   them, and flip to the rendered state immediately. The sidebar appears as soon
   as the small titles-only payload returns - the owner's stated pain.
2. In the background (same mount/switch effect), fetch the full bodies
   (`listInstitutionPagesAction`, the existing read) and merge them into the
   body-carrying `pages` state. Search, overview, PageBody, and recording/
   grading light up as soon as bodies arrive, a moment after the tree.
3. During the brief body-loading window, degrade gracefully (section 4.1) rather
   than showing misleading empty/absent states.

Why Option 1 over the alternatives:
- **Over Option 2 (on-demand bodies only):** three of the four body consumers
  (search, overview, multi-select recording) need the whole body set, not just
  the opened page's. Option 2 therefore requires moving search server-side,
  changing its semantics (server substring vs the current client title+body+tag
  match in `searchPages`), and fetching checked bodies at recording-click time -
  a materially larger surface across more files, for a payload whose size is
  unmeasured here. It is the right move only if the background body transfer
  itself proves too heavy, which cannot be established in this environment.
- **Over Option 3 (cache per institution):** section 1.3 - the first switch into
  an institution has nothing cached, and that is exactly the owner's complaint.
  Caching only helps the repeat switch. It is a complement, filed as a residual
  (R5), never the fix.

### 4.1 How each body-dependent feature keeps working

Design, per consumer, for the window where the tree (summaries) exists but
`pages` (bodies) is still null:

- **Client search.** Title-only during the window: a pure
  `titleOnlySearch(summaries, query)` helper filters titles, and the search
  panel shows a hint ("Page contents still loading - searching titles only").
  The instant `pages` arrives, searching switches to the existing
  `searchPages(pages, ...)` (title + body + tags) with no hint. The existing
  `searchPages` and its tests (`knowledge-base.test.ts:155-193`) are unchanged.
  Recommended over disabling the box (lower surprise, box stays usable); the
  disable-with-hint alternative is a cheaper fallback and a minor sub-decision,
  not an owner escalation.
- **Overview `hasContent` + summary/ask.** The `KnowledgeOverviewPanel` is
  already gated `pages && pages.length > 0` (`KnowledgeTab.tsx:842,918`) and its
  auto-refresh already waits on its own load settling
  (`useKnowledgeOverview.ts:312-328`). So during the window the panel simply
  stays hidden (pending) and appears when bodies land - no new misleading state,
  `hasContent` is computed only once bodies exist. No change required beyond
  keeping the `pages`-gating.
- **`PageBody`.** Title, breadcrumb, meta and tags are shown from the selected
  summary/page as available; the body area shows a brief "Loading page
  content..." state when a page is selected but its body is not yet present,
  instead of today's "Select a page from the tree to view it." misread. Replaces
  the existing body ternary's implicit assumption that `selectedPage` (hence its
  body) is always present once selected.
- **Start recording / Start grading with selection.** These need checked
  bodies, so they are disabled during the window with a hint ("Available once
  page contents finish loading"), via a `bodiesReady` prop threaded to
  `KnowledgeBulkBar`. "Ask AI about selection" stays enabled throughout (ids
  only). Alternative (fork B territory): fetch the checked pages' bodies on
  demand at click time via `getInstitutionPagesByIdsAction`.

### 4.2 Optional enhancement (not in the core waves)

To make opening a page instant even before the background batch returns, fetch
the selected page's body on demand (single-id `getInstitutionPagesByIdsAction`)
and merge it ahead of the batch. Deferred as residual R4: it adds a second
body-fetch/merge path, and the owner's complaint is the TREE, not the body pane.

---

## 5. Owner fork (rides; recommend + proceed)

**FORK KSS-F1 - how aggressively to fetch bodies.**

- **(A) Eager background full-body batch (RECOMMENDED).** After the summaries
  tree renders, fetch all bodies with one `listInstitutionPagesAction` and merge.
  Smallest change; every body consumer keeps today's behavior and semantics,
  lit a moment later. Still transfers the full body payload - but off the render
  path, so the tree is instant regardless. Fixes the owner's stated complaint.
- **(B) On-demand bodies only.** Never fetch the whole body set; selected body on
  open, checked bodies at recording click, and MOVE SEARCH SERVER-SIDE (changing
  its semantics). Larger surface, more files, changed search behavior; justified
  only if the background body transfer is itself too heavy - unmeasurable here.

**Recommendation: A, and proceed on A** (the waves in section 7 build A). Cost of
being wrong: if the corpus is genuinely enormous, A still downloads bodies in the
background (bandwidth), but the TREE is instant under A either way, so the owner's
pain is resolved by A regardless; B remains available later as a pure
optimization of background transfer. Choosing B first bets a much larger change
on an unmeasured payload. Per the SHAPE-5 discipline in `AGENTS.md`, the
orchestrator files this as a fork row with A's waves as its `owns` and starts A;
B is the owner's alternative if a later measurement (R6) shows background
transfer hurts.

A second, smaller sub-decision (search during the window: title-only-with-hint vs
disabled-with-hint) is folded into the design (4.1, recommend title-only) and is
NOT escalated.

---

## 6. Acceptance criteria

Each names the object under comparison, the instrument producing each quantity,
and the direction of failure. No render exists here, so AC-1..AC-4 are reading/
structure/pure claims and say so; AC-5 is the owner browser walk.

- **AC-1 (tree no longer depends on bodies).** Object: the tree-building call in
  `useKbPageTree.ts`. Instrument: a source-text wiring assertion
  (`readFileSync` over `useKbPageTree.ts`, comment-stripped) that `buildPageTree`
  is applied to the summaries state and that the render-ready/`idle` state is
  reached from the summaries fetch, NOT gated on the full-body fetch resolving.
  Pin the fact and ordering, not the spelling (MEMORY: source-text tests
  over-specify). FAILS if the tree/idle state is derived from the full-body
  `pages` state, or the summaries action is not the first fetch on switch.
- **AC-2 (tree builds from a body-less source).** Object: the pure tree source.
  Instrument: a pure unit test that `buildPageTree` over an
  `InstitutionPageSummary[]` yields the same nested id/parent/position structure
  as over the equivalent `InstitutionPage[]` (fixtures sharing id/parentId/
  title/position). Already supported: `buildPageTree` is generic over
  `TreeSource` (`knowledge-base.ts:207`). FAILS if the two structures differ, or
  if any tree-render path requires a field absent from `InstitutionPageSummary`.
- **AC-3 (search degrades, not lies).** Object: the search result selector.
  Instrument: a pure unit test of `titleOnlySearch(summaries, query)` - returns
  title matches when bodies are absent, returns `[]` for blank/no-match
  (mirroring `searchPages`' empty-string/`[]` contract,
  `knowledge-base.test.ts:184,188`), and a wiring assertion that the search
  path uses `titleOnlySearch` when bodies are pending and `searchPages` when
  present. FAILS if, during the window, search silently returns `[]` over a
  populated institution (today's misleading state), or if `searchPages` tests
  change behavior.
- **AC-4 (body-dependent controls gate, not misfire).** Object: the
  recording/grading bulk controls and the detail body region. Instrument:
  source-text wiring that `KnowledgeBulkBar` receives a `bodiesReady`-style prop
  AND still receives `selectedCount={kbSelection.selected.size}` with no
  reintroduced `selected.size > 0 &&` gate or `kbOverlayAnchor` wrapper within
  the 400 chars before the tag (the exact assertions in
  `knowledgeBulkBar.wiring.test.ts:37-62`); plus a reading claim that the detail
  body shows a loading state (not the "Select a page" empty copy) when a page is
  selected and its body is absent. FAILS if the bulk-bar wiring test reddens, or
  if recording/grading run on an empty body set during the window.
- **AC-5 (felt speed - owner walk).** Object: the Knowledge tab on a real switch.
  Instrument: owner browser walk (R6) - switch institutions and confirm the
  sidebar tree appears before bodies finish loading. NOT machine-verifiable here
  (no render, no live DB). Direction of failure: the tree still waits on the
  full read.
- **AC-6 (no regression in the ceiling or the source-text gates).** Object: the
  edited files. Instrument: `file-size-ceiling.structure.test.ts` (unconditional)
  plus the two source-text readers in the owns-set. FAILS if KnowledgeTab.tsx
  (or any touched file) exceeds 1000 lines, or either wiring scan reddens.

---

## 7. Architecture

### 7.1 The seam

One state holder today - `pages: InstitutionPage[] | null` in `useKbPageTree` -
feeds BOTH the tree and every body consumer. The fix splits the SOURCE of the
tree from the SOURCE of bodies while keeping the hook's public return shape as
close to today as possible so `KnowledgeTab.tsx` churn stays small (the ceiling).

Inside `useKbPageTree` (`useKbPageTree.ts`, 228 lines, ample headroom):
- Add a body-less state driving the tree: `summaries: InstitutionPageSummary[] |
  null`, loaded first via `listInstitutionPageSummariesAction`.
- Change `tree` to build from `summaries` (`buildPageTree(summaries ?? [])`,
  replacing `:122`'s `pages`-based build).
- Flip `loadState` to `idle` when `summaries` are present (not when `pages` are),
  so the tree render gate (`KnowledgeTab.tsx:815`) fires on summaries.
- Keep `pages: InstitutionPage[] | null` as today's body carrier, now populated
  by a BACKGROUND `listInstitutionPagesAction` after summaries. Expose a
  `bodiesReady` boolean (`pages !== null`) for consumers that must gate.
- `refresh` (after mutations, `:155-169`) continues to use the full read so
  post-mutation state is correct; it may additionally refresh summaries. Mutation
  paths are not latency-critical and keep today's semantics.
- Selection/expansion/reconciliation logic (`:129-211`) is unchanged - it keys on
  ids, which summaries carry. `selectedPage` resolves body from `pages` when
  present; title/breadcrumb resolve from summaries so the detail header is
  instant.

New PURE helpers (home: `src/app/components/knowledge/knowledge-helpers.ts`,
which already hosts `visiblePageIds`, `describeSelectedPages`, etc.), so the new
behavior is unit-testable WITHOUT a render (the no-render ceiling):
- `titleOnlySearch(summaries, query): {id,title}[]` - mirrors `searchPages`'
  blank/no-match contract.
- a body-pending predicate for the detail pane (selected id present, its body
  absent).

No new server action and no data-layer change: both reads
(`listInstitutionPageSummariesAction`, `listInstitutionPagesAction`) already
exist and are owner-scoped (`requireOwner`, `knowledge-base.ts` actions
`:31,:53`). Attended UI reaches the DB only through these server actions - the
contract is preserved.

### 7.2 Type signatures at the seam

- `listInstitutionPageSummariesAction(institution: string): Promise<{ pages:
  InstitutionPageSummary[] } | { error: string }>` (exists, actions `:49`).
- `buildPageTree<T extends TreeSource>(pages: T[]): TreeNode<T>[]` (exists,
  `knowledge-base.ts:207`); `InstitutionPageSummary` satisfies `TreeSource`
  (`:47-68`).
- `titleOnlySearch(summaries: InstitutionPageSummary[], query: string):
  InstitutionPageSummary[]` (new, pure).
- `useKbPageTree` return: unchanged members plus `bodiesReady: boolean` and the
  summaries-derived `tree`. `pages` stays `InstitutionPage[] | null`.

### 7.3 The headroom extraction (forced by section 3)

To keep `KnowledgeTab.tsx` under 1000 after adding the degradation wiring,
extract the LEFT-pane search panel (`KnowledgeTab.tsx:620-654`, ~34 lines
including comments) into `src/app/components/knowledge/KnowledgeSearchPanel.tsx`.
This (a) frees enough headroom and (b) is the natural home for the title-only
degradation and its hint. Measured effect: 992 - ~34 (removed) + ~8 (call site)
= ~966, then + ~3 (body-pending branch, bulk prop) = ~969, comfortably under
1000 (`@(Get-Content).Count` after the wave is the gate, not this estimate).

Extraction safety against the source-text gates:
- `knowledgeBulkBar.wiring.test.ts:37-62` asserts `<KnowledgeBulkBar` is not
  preceded within 400 chars by `selected.size > 0 &&` or `kbOverlayAnchor`, and
  is passed a literal `selectedCount={kbSelection.selected.size}`. The current
  gap from the last `kbOverlayAnchor` (the delete banner, `:720`) to
  `<KnowledgeBulkBar` (`:800`) is 740 chars (`python` measurement, section 9).
  The search panel sits ABOVE all of this, so extracting it does not shorten
  that gap. The implementer must NOT remove the select-all block (`:753-786`)
  that provides the separation, and must keep the `selectedCount` prop literal.
- `modalAdoption.wiring.test.ts` / `modalAdoptionScan.ts:236-247` carry a
  PATH-based `PERMANENT_EXCLUSIONS` entry for the `.kbWarnBanner`
  `role="alertdialog"` delete banner, which is in the LEFT pane and stays in
  `KnowledgeTab.tsx`. Extracting the search panel does not touch it. Do not move
  the delete banner, and do not introduce a new `role="alertdialog"` or
  ModalShell import in the new file.

### 7.4 What is not trivially revertible

Nothing persisted changes: no migration, no `ta-` key shape change, no server
action signature change. The riskiest items are the hook's load-ordering change
and the extraction - both revertible by reverting the touched files. No shared
helper outside the knowledge cluster is modified (`searchPages`, the actions, the
data layer are untouched).

---

## 8. Wave plan

All waves sequential (each edits `KnowledgeTab.tsx`, so no two are disjoint - they
cannot run concurrently). Each is independently gateable and pushable. Every wave
gate runs `file-size-ceiling.structure.test.ts` UNCONDITIONALLY, and uses
`npm run test:paths <p1> <p2> ...` (one path per arg) for 2+ paths, plus
`npx tsc --noEmit` and `npm run lint` (pass = exit 0, no NEW warning in the
wave's files). The caller of every new export ships in the same wave (no dead
code).

**Wave 1 - headroom extraction (pure refactor, behavior-identical).**
Files: `src/app/components/knowledge/KnowledgeSearchPanel.tsx` (new),
`src/app/components/KnowledgeTab.tsx` (renders `<KnowledgeSearchPanel .../>` -
the caller, same wave). No behavior change; the search panel renders exactly as
today.
Gate: `@(Get-Content src/app/components/KnowledgeTab.tsx).Count` must be `< 1000`
(and lower than 992); then
`npm run test:paths src/app/components/knowledge/knowledgeBulkBar.wiring.test.ts
src/app/components/ui/modalAdoption.wiring.test.ts
src/file-size-ceiling.structure.test.ts`; then `npx tsc --noEmit`;
`npm run lint`. Independently pushable.

**Wave 2 - summaries-first tree + background bodies + degradation (the fix).**
Files: `src/app/components/knowledge/useKbPageTree.ts` (core: summaries state,
tree from summaries, idle on summaries, background full-body fetch, `bodiesReady`),
`src/app/components/knowledge/knowledge-helpers.ts` (`titleOnlySearch` + body-
pending predicate, pure), `src/app/components/knowledge/KnowledgeSearchPanel.tsx`
(title-only search + hint during window), `src/app/components/knowledge/
KnowledgeBulkBar.tsx` (`bodiesReady` prop disabling recording/grading),
`src/app/components/KnowledgeTab.tsx` (wiring: pass `bodiesReady`, body-pending
detail branch; tree/search already routed through the hook + helper).
Gate: `@(Get-Content src/app/components/KnowledgeTab.tsx).Count < 1000`; then
`npm run test:paths src/app/components/knowledge/knowledge-helpers.test.ts
src/lib/knowledge-base.test.ts
src/app/components/knowledge/knowledgeBulkBar.wiring.test.ts
src/app/components/ui/modalAdoption.wiring.test.ts
src/file-size-ceiling.structure.test.ts`
(plus the new `useKbPageTree`/`titleOnlySearch` test files the test-author adds,
appended one-path-per-arg); then `npx tsc --noEmit`; `npm run lint`.
Independently pushable.

The build gate (`npm run build`) is the repo's "(check-mark) Compiled
successfully" grep, not an exit 0 (`docs/loop/this-repo.md` section 1). Run it if
either wave changes a `"use server"` export shape - neither is expected to.

---

## 9. Owns list (command + pasted output)

Files this change edits: `useKbPageTree.ts`, `KnowledgeTab.tsx`,
`knowledge-helpers.ts`, `KnowledgeBulkBar.tsx`, and the new `KnowledgeSearchPanel
.tsx` (plus test files the test-author adds).

Tests/scans that read those files AS SOURCE TEXT (will run red if a moved/renamed
string breaks them) - `grep -rln "readFileSync" src/ | xargs grep -ln
"KnowledgeTab.tsx\|KnowledgeBulkBar\|useKbPageTree\|KnowledgeSearchPanel\|
KnowledgePageDetail"`:

```
src/app/components/knowledge/knowledgeBulkBar.wiring.test.ts
src/app/components/ui/modalAdoption.wiring.test.ts
src/app/components/ui/modalAdoptionScan.ts
src/app/components/ui/modalAdoptionSourceScan.ts
```

Runtime importers - `grep` per module:
```
useKbPageTree  importer: src/app/components/KnowledgeTab.tsx   (sole importer)
KnowledgeBulkBar importer: src/app/components/KnowledgeTab.tsx
                           (+ knowledgeBulkBar.wiring.test.ts, source-text)
searchPages (runtime, non-test): src/app/components/KnowledgeTab.tsx,
  src/lib/knowledge-base.ts, src/lib/knowledge-overview-prompt.ts,
  src/lib/knowledge-scope-context.ts   (searchPages itself is NOT modified)
```

Bulk-bar gap fragility (must not be shortened by an extraction) -
`python` over `KnowledgeTab.tsx`:
```
kbOverlayAnchor within 400 chars before <KnowledgeBulkBar: False
chars from last kbOverlayAnchor to <KnowledgeBulkBar: 740
```

Unconditional, every wave: `src/file-size-ceiling.structure.test.ts` (walks all
`src/`). Repo-wide suite `npm test` runs in the per-group regression pass.

Note: `searchPages` and the `knowledge-base.ts`/actions data layer are read by
this plan but NOT edited, so they are not in the write set; their tests
(`knowledge-base.test.ts`, `knowledge-base.test.ts` for actions) are run in Wave
2's gate as adopted checks because `knowledge-helpers`/the hook sit adjacent, not
because their behavior changes.

---

## 10. Residual register

Each names an owner, an instrument, and the step that measures it. A residual
not in `docs/BACKLOG.md` does not exist - the orchestrator files these at
disposal.

- **R1 - fork KSS-F1 (A vs B).** Owner: repo owner (product/measurement).
  Instrument: the background-transfer cost, measurable only with live data
  (R6). Step: proceed on A (section 5); revisit B only if R6 shows background
  body transfer is itself a problem. Filed by the orchestrator as a fork row
  with Wave 1/2 as its `owns`.
- **R2 - search-during-window sub-decision (title-only vs disabled).** Owner:
  loop (design). Instrument: AC-3 unit + wiring. Step: build title-only (4.1);
  no escalation. Recorded so a checker sees the choice was made, not defaulted.
- **R3 - ceiling contingency.** Owner: implementer. Instrument:
  `@(Get-Content src/app/components/KnowledgeTab.tsx).Count` after each wave.
  Step: if Wave 1's extraction does not yield enough headroom, or Wave 2 would
  breach 1000, extract the right/detail pane (`KnowledgeTab.tsx:834-988`) into
  `KnowledgePageDetail.tsx` before Wave 2's wiring. Measured before push.
- **R4 - on-demand selected-page body (instant open).** Owner: loop (follow-up).
  Instrument: a pure merge test + owner walk. Step: optional wave fetching the
  selected body via `getInstitutionPagesByIdsAction` ahead of the batch (4.2).
  Not in the core waves.
- **R5 - per-institution body cache (Option 3 complement).** Owner: loop
  (follow-up). Instrument: a pure cache-hit test + owner walk. Step: cache
  `pages` by institution so a repeat switch skips the background read. Does not
  help the first switch (section 1.3); file only as a follow-up.
- **R6 - felt-speed browser walk.** Owner: repo owner. Instrument: the Browser
  pane against a deployed, env-backed build (this environment cannot - no
  `.env`, no live DB, no render; `docs/loop/this-repo.md` section 6). Step:
  switch institutions on the Knowledge tab and confirm the sidebar tree appears
  before bodies finish loading, and capture a rough payload/timing figure to
  settle fork KSS-F1.

---

## 11. For the checker

Attack hardest: (1) AC-1/AC-3 are source-text/wiring claims - confirm they pin a
FACT and ordering, not a spelling that forces a contorted implementation
(MEMORY: source-text tests over-specify). (2) The owns-set claim that extracting
the search panel cannot redden `knowledgeBulkBar.wiring.test.ts` - re-measure the
740-char gap and the 400-char window yourself. (3) The claim that no body
consumer is starved - verify "Ask AI about selection" really sends ids only
(`KnowledgeTab.tsx:371`) and that search/overview/recording each need bodies as
tabled in section 2 by opening each cite. (4) The ceiling arithmetic in section
7.3 is an ESTIMATE; the gate is `@(Get-Content).Count` after the wave, not the
estimate - confirm the plan says so.
