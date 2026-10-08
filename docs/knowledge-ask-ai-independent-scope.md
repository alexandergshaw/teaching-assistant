# KNOWLEDGE-ASK-AI-INDEPENDENT - scope / recon (architecture)

Owner, 2026-10-06, two intertwined asks:

1. "the ask ai on knowledge pages should provide links back out to the cited
   pages" - clicking a citation navigates to that page.
2. "the ask ai section should be independent of pages. it should stay up
   regardless of what page or institution is up" - the Ask AI must NOT reset
   when the user switches page or institution; it stays present and keeps its
   state.

**ROUND-2 REVISION (owner decided both forks 2026-10-06).** This is transcription
of an accepted decision, not a new argument round. The owner's two rulings
COLLAPSE the round-1 scope: the global-search machinery, the cross-institution
citation navigation, and the history-migration are all DROPPED. See the
disposition table (section 8) for exactly what was kept, dropped, and why.

The two decisions:

- **MOUNT = WITHIN the Knowledge tab** (not app-wide / cross-top-level-tab). The
  Ask AI stays up as the user switches pages and institutions INSIDE the
  Knowledge tab; it need not survive leaving the Knowledge tab.
- **SEARCH = "whichever institution I'm currently on."** NOT global, NOT a sticky
  scope. The Ask AI always searches the WHOLE CURRENT (active) institution:
  `scopePageId = null` always (independent of which PAGE is selected),
  `institution = active`. On an institution switch it re-targets the new
  institution.

Scope/recon ONLY - no code. A fresh `loop-checker` reads this before any build.
Every citation was opened. Every quantity names its command. Section 9 states
what I could not determine.

This is FEATURE work (ask 2 adds a persistent, page-independent assistant). The
leverage claim is the Acceptance-criteria seat's, not this pass's. Honest
leverage-question answer for the AC seat to own: the plausible EARNED class is
CORPUS - the DB-persisted Q&A history (`src/lib/knowledge-overview.ts`
`listScopeQuestions`/`appendScopeQuestion`), now read back continuously as a
page-independent assistant rather than a per-page panel. The claim text, its one
removal test and its disposal are the AC seat's + owner's; flagged only so it is
not silently dropped.

---

## 0. Measured sizes (both mandated instruments)

PowerShell `@(Get-Content <f>).Count` and Bash `wc -l < <f>`, run 2026-10-06 in
this checkout; they agree on every file:

| File | lines (both instruments) |
|---|---|
| `src/app/components/KnowledgeTab.tsx` | 966 |
| `src/app/components/knowledge/KnowledgeOverviewPanel.tsx` | 384 |
| `src/app/components/knowledge/useKnowledgeOverview.ts` | 434 |
| `src/app/components/knowledge/knowledge-overview-storage.ts` | 330 |
| `src/app/components/knowledge/KnowledgeOverviewHistory.tsx` | 201 |

Ceiling is 1000 repo-wide (`src/file-size-ceiling.structure.test.ts`,
`LIMIT = 1000` at `:41`, `grep -n "LIMIT = 1000"`). No knowledge file is in
`ALLOWED_OVERAGE` (`grep -an "knowledge\|KnowledgeTab\|KnowledgeOverview"
src/file-size-ceiling.structure.test.ts` returns nothing). `KnowledgeTab.tsx` at
966 (34 under the ceiling) is the binding constraint - **re-measure at build
time** and keep its edit small (section 7.3).

---

## 1. Current-state trace (opened, with file:line)

### 1.1 Why the Ask AI resets on nav today

Ask AI is one half of `KnowledgeOverviewPanel.tsx` (the other half is the AI
summary). All its state/persistence/server calls live in `useKnowledgeOverview.ts`,
keyed on `scopeKey = scopeStorageKey(institution, scopePageId)`
(`useKnowledgeOverview.ts:146`):

- `useKnowledgeOverview.ts:210-221` - a render-time reset block clears `summary`,
  `questions`, `loading`, `citationsUnavailableFor`, `hardCappedPages`,
  `skippedAttachments`, `autoRefreshedFor` whenever `scopeKey` changes. Because
  `scopeKey` includes `scopePageId`, **selecting a different page resets the Q&A
  history and last answer** (`questions`, and `lastAnswer = questions[0]` at
  `:360`).
- `useKnowledgeOverview.ts:223-244` - the DB load effect refetches
  `summary` + `questions` on every `[institution, scopePageId, scopeKey]` change.
- `useKnowledgeOverview.ts:152-191` + `knowledge-overview-storage.ts:45-109` - the
  draft/open/history-open are persisted under three per-scope-MAP keys
  (`ta-kb-overview-open`, `ta-kb-overview-history-open`, `ta-kb-overview-question`),
  so even the draft is per-scope today and switches with the nav.

Mounted TWICE, both conditionally, in `KnowledgeTab.tsx`:

- `:812-820` - `scopePageId={null}` (whole institution), sibling above the empty
  box, ONLY when `!selectedPage` and `loadState === "idle" && bodiesReady &&
  !isEditing && pages && pages.length > 0`.
- `:888-896` - `scopePageId={scopeHasDescendants(pages, selectedPage.id) ?
  selectedPage.id : null}`, under the selected page, ONLY when `selectedPage` and
  the same `loadState`/`bodiesReady` guard holds.

So selecting a page flips which mount renders and with what `scopePageId` ->
different `scopeKey` -> teardown + reset. **This is the reset ask (2) fixes.**

### 1.2 The institution-root scope ALREADY does what the owner wants

The `:812-820` mount is ALREADY `scopePageId={null}` and ALREADY searches the
whole active institution: `resolveQuestionScopeContext(..., scopePageId=null, ...)`
(`knowledge-overview.ts:257-264`) -> `fetchOrderedScopePages` ->
`collectScopePages(pages, null)` = the whole institution flattened
(`knowledge-overview-scope.ts:139-157`). Its citations (`resolvePageMarkers` over
`context.includedPages`, `knowledge-overview.ts:295`) are therefore ALWAYS
current-institution pages. **The decided design is: make this institution-root
Ask AI the ONLY Ask AI, mounted once, page-independent.** No new server path,
no action-signature change - the existing actions already accept
`scopePageId = null`.

### 1.3 Citations today already link within the institution

`KnowledgeOverviewPanel.tsx:207-242`: each `lastAnswer.citation` renders as a
clickable `Button` calling `onSelectPage(citation.id)` when
`citationPageExists(citation.id, pages)` (`:210`), else a `"{title} (deleted)"`
span (`:220-224`). `citationPageExists` (`knowledge-overview-storage.ts:232-234`)
= `pages.some(p => p.id === id)`, and `pages` is the FULL active-institution list.
`onSelectPage` is wired to `openSearchHit` (`KnowledgeTab.tsx:818, 894`) =
`selectPage(id)` + `expandAncestorsOf(id)` (`:324-327`), which selects the page
even if it sits inside a collapsed branch (it expands ancestors) - confirmed
`selectPage` (`:316-322`) -> `applySelection(id)`, valid for any id in `pages`.

**Confirmed against the tree: with `scopePageId = null` the existing
`onSelectPage(citation.id)` ALREADY links every cited page (ask 1), including a
page not currently rendered.** Ask (1) needs NO new navigation code under this
design - only that the single Ask AI is scoped to the whole institution (which
it is) and keeps using `onSelectPage = openSearchHit`.

### 1.4 The M1 regression (round-1) DOES NOT ARISE here - confirmed

Round-1 flagged M1: once Ask AI is nav-independent, a citation could point at a
page in ANOTHER institution absent from `pages`, breaking `citationPageExists`.
Under the owner's SEARCH decision the answer + history are PER-INSTITUTION and
reload on institution change (section 2.2), so `lastAnswer` always belongs to the
current institution and every citation is a current-institution page present in
`pages`. **M1 cannot occur** - there is never a cross-institution citation to
resolve. (A page deleted WITHIN the current institution after the answer still
renders the existing "(deleted)" span - `:220-224` - unchanged.)

### 1.5 Nav lifecycle on institution switch (load-bearing for draft persistence)

`useKbPageTree.ts:103-107`: on `active !== prevActive` it sets
`setBodiesReady(false)` and `setLoadState(active ? "loading" : "idle")`; then
`:141` back to `"idle"` after summaries and `:156`/`:210` `setBodiesReady(true)`
after bodies. **Page selection changes NEITHER `loadState` NOR `bodiesReady` NOR
`active`** - only `selectedId`. Consequence for the single mount (section 2.1):

- On a PAGE switch: `loadState`/`bodiesReady`/`active` are unchanged, so a mount
  placed OUTSIDE the two selection branches does not unmount -> no reset. (This
  is the core of ask 2.)
- On an INSTITUTION switch: `loadState` briefly returns to `"loading"`, so a
  mount gated on it will unmount+remount. That is CONSISTENT with the owner's
  decision (answer/history reload per institution), PROVIDED the draft is
  persisted in a nav-independent localStorage key so it survives the remount
  (section 2.3, AC-A4).

### 1.6 How nav is driven (why no cross-institution nav prop is needed now)

`handleKbActiveChange(code)` (`useAppNavigation.ts:551-554`) switches institution
and clears the page. The round-1 design added a new `onRequestInstitution` prop +
a one-shot slot for cross-institution citation jumps. **DROPPED** - under the
decided design citations never leave the current institution, so the existing
`onSelectPage`/`openSearchHit` is the whole navigate path. `page.tsx` and
`useAppNavigation.ts` are NOT touched by this feature.

---

## 2. The revised design (one wave, client-only)

### 2.1 Layer A - the single persistent mount (STRUCTURE)

- Extract the Ask AI + its history into a new standalone component
  `src/app/components/knowledge/KnowledgeAskAiPanel.tsx`, mounted ONCE in
  `KnowledgeTab.tsx` at a FIXED location OUTSIDE both the `!selectedPage`
  (`:805-828`) and `selectedPage` (`:829-959`) branches - candidate anchor:
  under the institution picker / `actionError` block (`:598-609`), above
  `styles.kbLayout` (`:611`). It renders regardless of page selection and is
  always scoped to the whole current institution (`scopePageId = null`,
  `institution = active`).
- **Mount gate:** `loadState === "idle" && pages && pages.length > 0`
  (institution has pages and the tree has settled). Do NOT gate the Ask AI mount
  on `scopePageId`/`selectedPage`. Whether to additionally keep it visible during
  the brief background-bodies window (dropping `bodiesReady` from the gate, Ask
  button disabled via `hasContent` as today) is a minor Wave-3 UX call (R3); the
  ARCHITECTURAL requirement is: one mount, outside both selection branches, so a
  PAGE switch never unmounts it.
- The AI SUMMARY STAYS in `KnowledgeOverviewPanel.tsx` at its two existing
  conditional mounts (`:812-820`, `:888-896`), still keyed on `scopeKey` - it is
  genuinely about a scope; the owner said "the ask ai section".
  `KnowledgeOverviewPanel.tsx` LOSES its Ask AI JSX (`:145-254`) and its
  `KnowledgeOverviewHistory` child (`:365-377`), which move to the new panel.
  `KnowledgeOverviewHistory.tsx` moves with the Ask AI (history is Ask AI's).

### 2.2 State keying = INSTITUTION ONLY (answer + history)

- Split the hook: `useKnowledgeOverview.ts` keeps the summary half
  (load/generate/staleness/auto-refresh, still keyed on `scopeKey`); the ask +
  history half moves to a new `src/app/components/knowledge/useKnowledgeAskAi.ts`.
- `useKnowledgeAskAi` is keyed on `institution` ONLY, never `scopePageId`/`scopeKey`:
  - Its reset block (today `useKnowledgeOverview.ts:210-221`) fires on
    `institution` change, NOT page change. It resets the answer/history state
    (`questions`, `citationsUnavailableFor`, `hardCappedPages`, `skippedAttachments`).
  - Its DB load effect calls `getKnowledgeOverviewAction(institution, null)` keyed
    on `[institution]`, so it reloads the per-institution root-scope history when
    the institution changes and NOT when the page changes.
  - `ask()` calls `askKnowledgeOverviewAction(institution, null, question,
    provider)`; `clearAll()` calls `clearKnowledgeOverviewQaAction(institution,
    null)`. Both pass `scopePageId = null` literally. `deleteQuestion` is unchanged.
  - **No action signature change** - the existing actions already accept a null
    scope (they are the institution-root path today).

### 2.3 The composer draft is NAV-INDEPENDENT (survives both page AND institution switch)

- The draft (`question`) persists across a PAGE switch (no remount, institution
  unchanged) AND across an INSTITUTION switch (which may remount per section 1.5).
  To survive the remount it must be a SINGLE nav-independent localStorage value
  (no scope/institution argument), NOT the per-scope map used today.
- New storage helpers (single-value `ta-` read/serialize, pure + localStorage
  wrappers) in a new `src/app/components/knowledge/knowledge-askai-storage.ts`
  (keeps `knowledge-overview-storage.ts` - which the summary half still uses -
  untouched in substance; new key `ta-kb-askai-question`, plus
  `ta-kb-askai-open` / `ta-kb-askai-history-open` single values for the toggles).
  The old `ta-kb-overview-*` per-scope keys STAY for the summary panel.
- Rationale stated so it is not read as redundancy: the draft is deliberately
  NOT keyed on institution (owner: "the composer DRAFT persists across an
  institution switch"), while the answer/history ARE keyed on institution (owner:
  "the ANSWER + Q&A HISTORY are PER-INSTITUTION and reload"). Two different
  persistence shapes, by design.

### 2.4 Shared-request state (L3)

`hardCappedPages`/`skippedAttachments` (today `useKnowledgeOverview.ts:204-205`,
`:267-268`, `:348-349`) describe the most recent generate/ask request, not a
persisted row; they move into `useKnowledgeAskAi` and reset on institution change
(alongside the answer/history). `citationsUnavailableFor`
(`useKnowledgeOverview.ts:200`, compared by `lastAnswer.id`) moves with the ask
half unchanged.

---

## 3. What this does NOT need (explicit, so a checker does not look for it)

- No cross-institution page fetch, no `listAllUserPages`. (Round-1 F1=a, dropped.)
- No global-sentinel history identity, no migration, no history-orphan handling.
  (Round-1 M3, dropped.)
- No `AnswerCitation.institution` field, no `MarkedPage.institution`,
  no `resolvePageMarkers` change. Citations stay `{id, title}`.
- No cross-institution navigate handler, no `onRequestInstitution` nav prop, no
  `knowledge-navigate.ts` one-shot slot, no `page.tsx`/`useAppNavigation.ts`
  edits. (Round-1 Layer C, dropped - `onSelectPage` already links within the
  institution, section 1.3.)
- No server-side change at all. The feature is CLIENT-ONLY.

---

## 4. Acceptance criteria (each: an instrument, or an owner residual)

No UI renders under vitest (`this-repo.md` section 6); felt persistence and the
rendered citation link are owner/browser walks. Machine pins are
source-text / structure / pure.

- **AC-A1 - Ask AI state is NOT keyed on the page.** Object: `useKnowledgeAskAi.ts`.
  Instrument: a `*.wiring.test.ts` asserting the hook's source references neither
  `scopePageId` nor `scopeKey`/`scopeStorageKey` nor `scopeHasDescendants` in any
  reset, dep, or persistence path, AND that its action calls pass a literal `null`
  scope (`getKnowledgeOverviewAction(institution, null`, `askKnowledgeOverviewAction(institution, null`,
  `clearKnowledgeOverviewQaAction(institution, null`). Direction: RED if page
  selection enters the key or a scope id other than `null` reaches the actions.
- **AC-A2 - the Ask AI panel is mounted exactly once, outside both selection
  branches.** Object: `KnowledgeTab.tsx`. Instrument: wiring test that
  `KnowledgeAskAiPanel` is referenced exactly once, and that reference is NOT
  inside the `!selectedPage` or `selectedPage` conditional (slice between
  `kbLayout` start and the two detail-pane branches). Direction: RED if it
  appears zero/multiple times or inside a selection branch (which would
  reintroduce the per-page reset).
- **AC-A3 - the AI summary stays per-scope, unchanged.** Object:
  `KnowledgeOverviewPanel.tsx` + its two mounts. Instrument: the existing summary
  tests stay green; wiring assertion that the two `KnowledgeOverviewPanel` mounts
  still pass `scopePageId` (null / subtree) as today. Direction: RED if the
  summary loses per-scope keying.
- **AC-A4 - the composer draft persists nav-independently.** Object: the draft
  storage helper in `knowledge-askai-storage.ts`. Instrument: pure test that the
  read/serialize functions take NO scope/institution argument and round-trip a
  single stored string (write draft, read it back under a DIFFERENT institution
  key context -> same value). Direction: RED if the draft is keyed by scope or
  institution (which would drop it on an institution switch's remount).
- **AC-A5 - answer/history reload per institution.** Object: `useKnowledgeAskAi.ts`.
  Instrument: wiring assertion that the history load effect's dependency set and
  the reset block are keyed on `institution` (and that institution change clears
  the answer/history state). Direction: RED if the reset/load is keyed on page or
  not on institution (answer/history would then not reflect the current institution).
- **AC-1 - citations link to the cited page (ask 1).** Object: the citation
  chips in `KnowledgeAskAiPanel.tsx`. Instrument: wiring assertion that each
  citation renders a control calling `onSelectPage(citation.id)` guarded by
  `citationPageExists(citation.id, pages)` (the moved-but-unchanged behaviour),
  with `pages` = the full active-institution list and `onSelectPage = openSearchHit`.
  Direction: RED if the citation stops calling `onSelectPage`, or resolves against
  a scope-limited list instead of the full institution `pages`. The RENDERED
  landing (select + expand ancestors) is R2 (owner walk) - the wiring pin proves
  the CALL exists, not the paint.

---

## 5. Wave plan (ONE wave; no F1 fork - it is decided)

Client-only, independently gateable and pushable. Includes the file that CALLS
each new export (no dead code).

**Wave 1 - page-independent, institution-scoped Ask AI.** Write set:

- `src/app/components/knowledge/KnowledgeAskAiPanel.tsx` - NEW: the standalone Ask
  AI section (Ask box + status/answer region + citations + history), moved out of
  `KnowledgeOverviewPanel.tsx`, always `scopePageId = null`.
- `src/app/components/knowledge/useKnowledgeAskAi.ts` - NEW: ask/history/draft
  state keyed on `institution` only; draft/toggles nav-independent.
- `src/app/components/knowledge/knowledge-askai-storage.ts` - NEW: single-value
  `ta-` read/serialize helpers (pure + localStorage wrappers) + AC-A4's pins.
- `src/app/components/knowledge/KnowledgeOverviewPanel.tsx` - EDIT: remove Ask AI
  JSX + history child; summary only.
- `src/app/components/knowledge/useKnowledgeOverview.ts` - EDIT: remove ask/history
  half; summary only (shrinks from 434).
- `src/app/components/knowledge/KnowledgeOverviewHistory.tsx` - EDIT/MOVE: now the
  Ask AI panel's child.
- `src/app/components/KnowledgeTab.tsx` - EDIT: mount `KnowledgeAskAiPanel` ONCE
  outside both selection branches; the two `KnowledgeOverviewPanel` mounts stay
  (summary only). KEEP THIS EDIT SMALL (section 7.3).
- NEW tests: `knowledge-askai-storage.test.ts` (AC-A4 pure), plus
  `useKnowledgeAskAi.wiring.test.ts` (AC-A1, A5) and/or a `KnowledgeTab.wiring.test.ts`
  (AC-A2) and the citation pin (AC-1). Keep the summary tests
  (`knowledge-overview*.test.ts`) GREEN; edit only if a pinned string actually
  moved.

**Gates (run from PowerShell, repo root; the pre-push gate runs NO vitest, so
these MUST run in the wave gate):**

1. `npx tsc --noEmit` - no output, exit 0 (ONE caller only; races on
   `tsconfig.tsbuildinfo` - never two agents at once, `this-repo.md` section 2).
2. `npm run lint` - exit 0, no NEW warning in files this wave writes (compare to
   the same command before the change; do NOT pin an absolute count). Note the
   React-Compiler `preserve-manual-memoization` risk when hooks are removed from a
   component (`this-repo.md` section 1) - `useKnowledgeOverview.ts` loses half its
   hooks; budget for a lint surprise on an untouched callback and apply the same
   pass-the-ref workaround if it fires.
3. `npm run test:paths <p1> <p2> ...` - ONE PATH PER ARGUMENT, every argument
   `COVERED`. Never a raw multi-path `vitest`/`npm test` (silently drops unmatched
   paths - `this-repo.md`, "Running a named set of test files"; MEMORY
   test-paths-wrapper). Paths: the new askai storage/wiring tests PLUS the edited
   `knowledge-overview*.test.ts` that read the touched source as text (section 6).
4. `npx vitest run src/file-size-ceiling.structure.test.ts` - UNCONDITIONAL,
   EVERY wave (walks all of `src/`; catches `KnowledgeTab.tsx` and every new file
   vs the 1000 ceiling). Single path, so `npx vitest run` is fine.
5. **CONDITIONAL strip-comments canary:** IF any new/edited `*.test.ts`
   introduces a comment-stripping helper, it MUST be named `withoutLineComments`
   AND the gate MUST add `src/tools/strip-comments-agreement.structure.test.ts`
   (via `test:paths`). That structure test enumerates every `*.test.ts`
   mentioning the strip-helper literal and reddens repo-wide until each is
   classified (it already lists
   `src/app/components/knowledge/knowledgeBulkBar.wiring.test.ts` -
   `grep -an "knowledge" src/tools/strip-comments-agreement.structure.test.ts`).
   RECOMMENDED: do not add a strip helper - match raw source like
   `useKbPageTree.wiring.test.ts` does.

**Tree gate (not vitest):** `git status --short` must show ONLY the wave's write
set - no `.claude/worktrees` copy edited instead of the real tree (`this-repo.md`
section 7; `Glob` returns the worktree copy first).

---

## 6. owns-set, disjointness, shared-file serialization

### 6.1 Derivation command + output (run 2026-10-06 in this checkout)

Files that read the edited source AS TEXT (the wiring/structure risk):

```
grep -arln "KnowledgeOverviewPanel\|useKnowledgeOverview\|knowledge-overview-storage\|KnowledgeOverviewHistory\|KnowledgeAskAi" src --include=*.test.ts
  -> src/app/components/knowledge/knowledge-overview-storage.test.ts
  -> src/lib/knowledge-overview-prompt.test.ts
  -> src/lib/knowledge-overview-scope.test.ts
  -> src/lib/knowledge-overview-stale.test.ts
  -> src/lib/knowledge-overview.test.ts

grep -an "knowledge\|KnowledgeTab\|KnowledgeOverview\|KnowledgeAskAi" src/file-size-ceiling.structure.test.ts
  -> (no output - nothing pinned)
```

The `src/lib/knowledge-overview*.test.ts` readers test the server/lib/stale/scope
layers, which this CLIENT-ONLY wave does not change; they must stay GREEN (run
them if the edit touches any string they pin, else confirm unaffected). Only
`knowledge-overview-storage.test.ts` is in the component directory and is the one
most likely to need extension (its sibling `knowledge-askai-storage.test.ts` is
new). The relevant repo-wide canaries are `file-size-ceiling.structure.test.ts`
(always) and CONDITIONALLY `strip-comments-agreement.structure.test.ts`.

### 6.2 The owns-set

`KnowledgeAskAiPanel.tsx` (new), `useKnowledgeAskAi.ts` (new),
`knowledge-askai-storage.ts` (new) + `knowledge-askai-storage.test.ts` (new),
`KnowledgeOverviewPanel.tsx`, `useKnowledgeOverview.ts`,
`KnowledgeOverviewHistory.tsx`, `KnowledgeTab.tsx`, the new wiring test(s); plus
`file-size-ceiling.structure.test.ts` (canary, always) and conditionally
`strip-comments-agreement.structure.test.ts`.

### 6.3 SHARED-FILE serialization (REQUIRED flag)

`KnowledgeTab.tsx` is edited by this item AND by the actionable
**KNOWLEDGE-MUTATION-LAG** (`docs/BACKLOG.md:174`, whose own note says: "Shares
useKbPageTree/useKbTreeActions/KnowledgeTab with KNOWLEDGE-ASK-AI-INDEPENDENT -
serialize builds on those files"). They are NOT disjoint by exact path and MUST
NOT run concurrently (`parallel-disjointness.md`; MEMORY wave-gate /
no-git-stash). KNOWLEDGE-CREATE-LAG already SHIPPED (`94f6d56d`, KnowledgeTab 966,
now in verification) so it no longer competes for the file; MUTATION-LAG is the
live collision. KnowledgeTab is 966, 34 under the ceiling. This wave's
KnowledgeTab delta is: one new mount (~8-12 JSX lines) MINUS the two existing
panel mounts shrinking to summary-only (the Ask-AI-specific props they passed are
unchanged, so near net-zero there) - net likely a small INCREASE. **Re-measure
`@(Get-Content).Count` on `KnowledgeTab.tsx` before and after; if it would cross
~1000, the Ask AI mount is a single self-contained `<KnowledgeAskAiPanel .../>`
element whose logic lives in its own module, so there is nothing to extract -
confirm the delta is small rather than planning an extraction.** Serialize with
MUTATION-LAG: whichever lands first, the other re-measures and rebases its
KnowledgeTab edit.

No other open row lists these specific Ask-AI files; CHATBOT-MODAL-VISUAL
(`docs/BACKLOG.md:230`) is the app-wide FAB chat window, explicitly DISJOINT from
this knowledge-tab panel. Confirm at build with a fresh `git status --short`.

---

## 7. Residuals (owner, instrument, step - filed in `docs/BACKLOG.md` at the push, or it does not exist)

- **R1 - felt page/institution independence (owner walk).** Owner: repo owner.
  Instrument: in the Knowledge tab, ask a question, then switch PAGES and confirm
  the Ask AI stays present with its draft + last answer + history intact; then
  switch INSTITUTIONS and confirm the panel stays, the DRAFT persists, and the
  ANSWER/HISTORY reload to the new institution's. Step: owner walk after the push.
  Rationale: nothing renders here, so the ACs pin the keying (mechanism), not the
  felt result.
- **R2 - rendered citation link lands + expands (owner/browser walk).** Owner:
  repo owner. Instrument: click a citation whose page sits inside a collapsed
  branch; confirm it selects the page and expands its ancestors. Step: owner walk.
  AC-1 proves the `onSelectPage` CALL, not the paint.
- **R3 - Ask AI visibility during the background-bodies window (minor UX).**
  Owner: repo owner / Wave-3 UX. Instrument: on an institution switch, observe
  whether the Ask AI should remain visible (Ask disabled) during the brief
  summaries-first window or re-appear once bodies land. Step: reported in verify;
  the mount gate (section 2.1) is the knob. Not core to ask (2) (which is about
  PAGE/INSTITUTION resets, not the sub-second load window).
- **R4 - live LLM answer/citation results (owner-only).** Owner: repo owner.
  Instrument: a real model call against real data in Vercel. Step: production
  walk. Unverifiable here - no `.env`, no API key, no live DB, network blocked
  under vitest (`this-repo.md` section 6).

---

## 8. Disposition table: round-1 scope -> round-2 (this) scope

Re-derived after all renumbering. Round-1 requirement ids are from the prior
version of this file (git history); this round's ids are sections/ACs above.

| Round-1 item | Disposition | Where it lands now / why dropped |
|---|---|---|
| Layer A - standalone persistent Ask AI mount | KEPT | Section 2.1 / AC-A2 (now explicitly "outside both selection branches", one mount) |
| Layer A - hook split (summary vs ask) | KEPT | Section 2.2 (`useKnowledgeAskAi`) / AC-A1 |
| State decoupled from `scopeKey` | KEPT, NARROWED | Section 2.2: keyed on `institution` ONLY (round-1 left the key open pending F1); draft nav-independent (AC-A4) |
| AI summary stays per-scope | KEPT | Section 2.1 / AC-A3 |
| L3 shared-request state (hardCapped/skipped) | KEPT | Section 2.4 |
| F1 fork (global vs sticky vs current) | WITHDRAWN - owner decided | "whole current institution, re-scope on institution switch"; the fork no longer exists (section 1.2). Enforcer it protected: none (it was a question, not a guard) |
| Layer B - global `listAllUserPages` + global history identity + sentinel (R6) | WITHDRAWN | Dropped by SEARCH decision; no cross-institution fetch, no migration. No enforcer protected |
| Layer C - `AnswerCitation.institution` / `MarkedPage.institution` / `resolvePageMarkers` change | WITHDRAWN | Citations stay `{id,title}`; never cross-institution (section 1.4). No enforcer protected |
| Layer C - cross-institution navigate handler + `onRequestInstitution` prop + `knowledge-navigate.ts` slot + `page.tsx`/`useAppNavigation.ts` edits | WITHDRAWN | `onSelectPage` already links within the institution (section 1.3); no cross-institution hop exists. No enforcer protected |
| M1 (stale cross-institution citation) rebuild of `citationPageExists` | WITHDRAWN - cannot arise | Section 1.4: answer/history per-institution means every citation is current-institution. No enforcer protected |
| Ask-1 citation linking | KEPT, SIMPLIFIED | Section 1.3 / AC-1: existing `onSelectPage` + whole-institution `pages`, no new code |
| Ceiling / KnowledgeTab serialization note | KEPT, UPDATED | Section 6.3: CREATE-LAG shipped; now serialize with KNOWLEDGE-MUTATION-LAG |
| Two-wave plan (W1 structure, W2 global) | REPLACED | One wave (section 5); W2 no longer exists |

No kept requirement lost an instrument in the move; every withdrawn item was a
design branch or a question, none an already-landed guard (so nothing in the
suite was de-enforced - the per-scope `ta-kb-overview-*` keys and the existing
summary tests remain, now owned by the summary half).

---

## 9. What I could not determine

- **Felt behaviour of any of it.** No component renders under vitest, no `.env`,
  no live DB, network blocked (`this-repo.md` section 6). "Stays up / keeps state
  / links to the page / answers for the current institution" is proven by the
  keying/wiring pins (mechanism) + owner walks R1/R2/R4 (effect), never a running
  UI here.
- **Exact `KnowledgeTab.tsx` line delta** once MUTATION-LAG lands. Section 6.3
  requires re-measuring `@(Get-Content).Count` at build; I could not pin the
  final count because the mount's exact JSX length is the implementer's and
  MUTATION-LAG's KnowledgeTab edit has not landed.
- **Whether the Ask AI should stay visually present during the sub-second
  background-bodies window on an institution switch** (R3). The owner's decision
  settles the RESET behaviour (page-independent, per-institution answer/history);
  it does not speak to the transient load-window appearance, which is a Wave-3 UX
  call, not an architecture one.
</content>
