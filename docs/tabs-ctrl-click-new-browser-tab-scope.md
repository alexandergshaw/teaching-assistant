# Scope + architecture: ctrl/cmd/middle-click a tab to open its view in a new browser tab

Owner request, verbatim: "for any tabs that are clickable, i need the ability to
click them with ctrl and the mouse and have a separate web browser tab open with
the tab view."

Intent (from the dispatch): every clickable in-app tab supports
ctrl+click / cmd+click / middle-click / shift+click to open that tab's view in a
NEW browser tab (native browser behaviour); a plain left-click keeps the current
fast in-app client-state switch with no full navigation; the new browser tab,
cold-loaded at that URL, renders that exact tab/view.

This is the `loop-architect` artifact. A fresh `loop-checker` reads it before any
consumer. Written to be checked.

---

## 0. The keystone finding, and what it changes

**The owner's stated premise - "tabs are currently client-state toggles that have
no URL and cannot be opened in a new browser tab" - is only PARTLY true, and the
true part is the smaller part.**

The app's whole navigation state is ALREADY two-way bound to the URL query string
and ALREADY cold-loads from it:

- `src/app/url-state.ts:518` `buildUrlSearch(state: UrlNavState)` emits the
  canonical query string (`?tab=manual&manualView=grading&gradingView=repos`...),
  and `:434` `parseUrlState(search)` reads it back.
- `src/app/components/home/useAppNavigation.ts:758-812` is a sync effect that calls
  `window.history.pushState`/`replaceState(target)` on every nav-state change, so
  the address bar already tracks the active tab, section, view and inner view.
- Cold-load hydration already exists and already prefers the URL over
  localStorage: `readNavSource()` (`useAppNavigation.ts:108-115`) reads
  `window.location.search` and, when a `tab` param is present
  (`urlTab !== null`), the URL wins over `localStorage` - every sub-view
  initializer re-checks `urlHasTab` before trusting a stored value
  (`:219-588`). The nav-hook docstring calls this "the URL two-way bind and
  Back/Forward restore" (`page.tsx:75-77`), and url-state.ts's header
  (`:1-33`) states full tab->section->view->inner-view coverage is the
  intended, owner-confirmed design.

So for the primary navigation, a cold-load of `/?tab=manual&manualView=grading&gradingView=repos`
ALREADY renders Tools > Grading > Repo Grades. **What is missing is not a URL
scheme and not a cold-load hydrator - both exist and are tested. What is missing
is that the clickable tabs are rendered as `<button>` elements with no `href`, so
the browser has nothing to open on a ctrl/cmd/middle-click.**

This reframes the work. The core change is: render each tab trigger as a real
`<a href={deep-link}>` whose `href` is produced by the EXISTING `buildUrlSearch`,
with an `onClick` that intercepts only an unmodified primary click (preventDefault
+ the existing setState) and lets the browser handle every modified/middle click
natively. The deep-link target is a URL the existing machinery already knows how
to cold-load.

**The consequence the orchestrator must act on:** the navigation layers split into
three tiers with very different cost, and the owner's "any tabs that are clickable"
spans all three. Tier 1 is the cheap, high-value core; Tier 3 is where a URL
scheme genuinely has to be EXTENDED before an anchor can work at all. Shipping an
anchor on a Tier-3 tab WITHOUT first extending the URL scheme produces a link that
opens a new browser tab showing the WRONG sub-view - the exact "the surface is a
layer" trap this seat is warned about. See section 2 and the forks (section 9).

---

## 1. Facts and quantities (each with its command)

All line counts via the mandated `@(Get-Content <f>).Count` (PowerShell), which
`this-repo.md` section 3 fixes as the instrument; `Measure-Object -Line` is
forbidden here.

| File | Lines | Command |
|---|---|---|
| `src/app/page.tsx` | 880 | `@(Get-Content src/app/page.tsx).Count` |
| `src/app/components/home/useAppNavigation.ts` | 938 | same shape |
| `src/app/url-state.ts` | 572 | same |
| `src/app/components/tabs/TabRail.tsx` | 94 | same |
| `src/app/components/tabs/tab-rails.ts` | 163 | same |
| `src/app/components/tabs/tab-sections.ts` | 208 | same |
| `src/app/components/manual/ManualRail.tsx` | 90 | same |
| `src/app/components/manual/manual-rail.ts` | 492 | same |
| `src/app/components/RecordingTab.tsx` | 918 | same |
| `src/app/components/VersionControlTab.tsx` | 188 | same |
| `src/app/components/grading-chat/GradingChatPanel.tsx` | 798 | same |
| `src/app/components/presentations/pipeline/PipelineStepper.tsx` | 71 | same |
| `src/app/components/tabs/topLevelTabs.wiring.test.ts` | 807 | same |
| `src/app/components/recording/recording-split.structure.test.ts` | 631 | same |

Platform facts measured this session:
- Next.js version: **16.2.6** (`node -e "require('./node_modules/next/package.json').version"`),
  App Router. The ONLY tabbed route is `src/app/page.tsx` (a `"use client"`
  page); the other `page.tsx` files are separate routes
  (`find src/app -name page.tsx`): `account/*`, `knowledge`, `login/*`.
- MUI version: **9.0.1**
  (`node -e "require('./node_modules/@mui/material/package.json').version"`).
  `Tab` is an `ExtendButtonBase` with `component?: React.ElementType`
  (`node_modules/@mui/material/Tab/Tab.d.ts:73`), so
  `<Tab component="a" href=... onClick=...>` renders a real anchor and forwards
  `href` through ButtonBase. CONFIRMED from typings, not recalled.
- `useSearchParams` (Next doc
  `node_modules/next/dist/docs/01-app/03-api-reference/04-functions/use-search-params.md:179`):
  a static page calling it from a Client Component "must be wrapped in a `Suspense`
  boundary, otherwise the build fails". **The app does NOT use `useSearchParams`** -
  it reads `window.location.search` directly and listens to `popstate`
  (`useAppNavigation.ts:109,816`). This design must NOT introduce
  `useSearchParams`, or it adds a Suspense/prerender build requirement that does
  not exist today (`grep -rn "useSearchParams" src/` returns nothing - run it).

---

## 2. Complete tab inventory (the owner said "any tabs that are clickable")

Every `role="tab"`/`role="tablist"` surface in `src/app/**/*.tsx`
(`grep -rln 'role="tab"\|role="tablist"' src/app --include=*.tsx`), PLUS the
top-level MUI `<Tabs>` (which carries no literal `role="tab"` string - MUI injects
the role), PLUS the `<Link>`-based top-bar navigation. Classified into three tiers
by what each would take to satisfy the request.

### Tier 1 - already URL-backed; needs ONLY anchor rendering (the core of the request)

| # | Layer | Component | `file:line` | Stored today | URL param it already drives | Clicked today |
|---|---|---|---|---|---|---|
| 1 | Top-level strip (Courses / Tools / Library / Course Intel / Success Tracking) | MUI `<Tabs>`/`<Tab>` | `page.tsx:463-518` | `useState` activeTab + `ta-active-tab` | `tab` | `<Tabs onChange>` -> `setActiveTab` |
| 2 | Courses rail (Courses / Term Setup / Daily-Weekly / One-Off) | `TabRail` | `page.tsx:525-530`; render `TabRail.tsx:64-93` | `useState` coursesSection/tasksView + `ta-courses-section`/`ta-tasks-view` | `coursesSection`, `tasksView` | `<button onClick>` -> `handleCoursesRailChange` |
| 3 | Tools rail (the 8 Manual views) | `TabRail` | `page.tsx:573-578` | `useState` manualView + `ta-manual-view` | `manualView` | `<button onClick>` -> `handleToolsRailChange` |
| 4 | Library rail (Files / Knowledge / Drafts) | `TabRail` | `page.tsx:801-806` | `useState` librarySection + `ta-library-section` | `librarySection` | `<button onClick>` -> `setLibrarySection` |
| 5 | ManualRail inner destinations (Build modes; LMS 6 views; Grading Repo/Drafted/Chat; Presentations 3; Announcements 3; Automate 3) | `ManualRail` | `page.tsx:587-614`; render `ManualRail.tsx:72-89` | `useState` per field + `ta-*-view` keys | `buildView`, `contentView`, `gradingView`, `presentationsView`, `announcementsView`, `automateView` | `<button onClick>` -> `onDestinationClick` -> `resolveStateFromDestinationId` |

Tier 1 covers the entire primary navigation tree: tab -> section -> view -> inner
view. Every one of these already round-trips through `buildUrlSearch`/`parseUrlState`
and cold-loads correctly today; the only defect is that they are `<button>`s.

Note the grading-chat panel and repo-grades grid were named in the dispatch as
candidate "sub-tab" layers - they are NOT. `GradingChatPanel.tsx` is a single
surface with no `role="tab"` (`grep -n 'role="tab"' GradingChatPanel.tsx` is
empty); `repo-grades/index.tsx` likewise. Both are reached as `gradingView`
inner-rail items (row 5), which ARE URL-backed. (Brief from the tree, not the
dispatch.)

### Tier 2 - already real routes, already rendered as `<Link href>`; ctrl+click ALREADY works

| # | Layer | `file:line` | Note |
|---|---|---|---|
| 6 | Top-bar links: Knowledge review (`/knowledge`), Integrations, Security, Voice style, Diagnostics, Accounts/People (`/account/*`) | `TopBar.tsx:426-474` (uses `next/link`) | These are genuine Next routes with their own `page.tsx`. `next/link` renders an `<a href>`, so ctrl/cmd/middle-click already opens them in a new browser tab. NO WORK NEEDED. Listed for completeness so the verifier does not count them as a gap. |

### Tier 3 - NOT URL-backed; an anchor alone is INSUFFICIENT - the URL scheme must be EXTENDED first

| # | Layer | Component | `file:line` | Stored today | Structural gate at risk |
|---|---|---|---|---|---|
| 7 | Recording tools strip (Record / Discussion replies / Message replies / Module walkthrough deck / Change speed / Caption a video / Narrate a deck / Avatar) | `RecordingTab` | strip `RecordingTab.tsx:610-633`; state `:68-91`; persist `:85` | `recView` + `ta-rec-view` | `recording-split.structure.test.ts` (hardcoded `role="tab"`/`role="tabpanel"` counts) |
| 8 | Version Control sections (Orgs / Repos / Bulk) | `VersionControlTab` | `VersionControlTab.tsx:34,121+` | `subTab` + `ta-vc-subtab` | none named |
| 9 | Org management view (Students / Management) | `OrgManagementPanel` | `OrgManagementPanel.tsx:74-81` | `orgView` + `ta-vc-org-view` | none named; nested under row 8 |
| 10 | Files view toggle (Library / Submissions) | `FilesTab` | `FilesTab.tsx:717-732` | `filesView` (persist key to confirm) | none named |
| 11 | Presentations pipeline stage stepper | `PipelineStepper` | `PipelineStepper.tsx:59` | pipeline stage state | a wizard/stepper, not navigation (see fork C) |

For Tier 3 there is NO `buildUrlSearch` param and NO initializer, so a new browser
tab opened at the current URL has nothing to tell it which sub-view to show - it
falls back to the localStorage value, i.e. the LAST-USED sub-tab, not the clicked
one. Giving these anchors without first adding their param to `UrlNavState` /
`buildUrlSearch` / `parseUrlState` / an initializer ships a link that opens the
wrong view. This is the layer-is-a-surface trap; it is why Tier 3 is later waves,
each extending the scheme for its own param.

---

## 3. Current URL / deep-link state (the routing, cited)

- Single tabbed route: `src/app/page.tsx` (`"use client"`). All in-app tab state
  lives in `useAppNavigation.ts` and is encoded in the query string, not the path.
- The scheme is entirely query-param based. Param names (`url-state.ts:286-320`):
  `tab`, `coursesSection`, `toolsSection` (never emitted - only `"manual"` is
  live), `librarySection`, `manualView`, `automateView`, `buildView`,
  `contentView`, `gradingView`, `presentationsView`, `announcementsView`,
  `tasksView`, `kbInstitution`, `kbPage`. Retired params (`workflowsView`,
  `draftsView`) are read for migration, never emitted.
- `buildUrlSearch` OMITS any param equal to its field default and omits params that
  do not belong to the active branch (`url-state.ts:518-572`), and `parseUrlState`
  reconstructs the same default when a param is absent - so defaults round-trip.
  Worked example: the Build Courses chip's canonical URL is `/?tab=manual`
  (manualView default `"course-planning"` is omitted), and a cold load of
  `?tab=manual` restores manualView to `"course-planning"`
  (`useAppNavigation.ts:333` via `normalizeManualView(null)`). Verified by reading
  both functions.
- The scheme already retires legacy values on first sync (an alias is a redirect:
  `url-state.ts:514-517`), and `parseUrlState` resolves pointer migrations
  (`:452-497`). None of this is disturbed by adding anchors.

Conclusion: **the URL scheme is an EXTENSION of an existing, owner-confirmed
query-param scheme, never a new one, and never a path-based one.**

---

## 4. URL scheme design

### 4a. Tier 1 - no scheme change at all

The deep-link for any Tier-1 tab is `buildUrlSearch({ ...currentNavState, <field>: <targetValue> })`.
The `href` is `"/" + buildUrlSearch(next)` (an absolute-path URL, e.g.
`/?tab=courses`), so a new browser tab resolves it against the site root
regardless of the current path. `buildUrlSearch` already guarantees the result
carries `tab=` and every non-default param on the branch, which is exactly the
condition the cold-load hydrator needs to prefer the URL over localStorage
(section 5). No param is added, renamed, or removed.

### 4b. Tier 3 - one new param per sub-tab, mirroring `gradingView`

Each Tier-3 sub-tab becomes a first-class `UrlNavState` field following the
`gradingView` precedent exactly (the cheapest, lowest-novelty shape in this repo):

1. Declare the ordered member list + `isX`/presence guard in the OWNING LEAF module
   (not in `url-state.ts` - that would be the constants-module cycle
   `tab-sections.ts:13-20` warns about). For recording: the member list already
   lives implicitly in `RecordingTab.tsx:610`'s literal; lift it to a leaf
   (e.g. `recording/rec-views.ts`) so `url-state.ts` can import it.
2. Add `normalizeRecView` + `DEFAULT_REC_VIEW` to `url-state.ts`, add the field to
   `UrlNavState`, emit it in `buildUrlSearch` gated on `manualView === "recording"`
   (mirroring `gradingView` gated on `manualView === "grading"`,
   `url-state.ts:541-543`), and parse it in `parseUrlState` (`:493`).
3. Add the initializer branch in `useAppNavigation.ts` (gated on
   `urlHasTab && destination.tab === "manual" && toolsSection === "manual" && manualView === "recording"`,
   mirroring `gradingView`'s `:485-501`), its localStorage-persist effect, and its
   `popstate` restore branch (mirroring `:872`).

The proposed param name for row 7 is `recView` (value set = the 8 strip keys).
Rows 8-10 (`vcSubTab`, `vcOrgView`, `filesView`) follow the same recipe but are NOT
gated on `manualView` the same way - they belong to different tabs/sections, so
each gates on its own parent chain. Each is its own wave; the exact param names are
the architect's to finalise per-wave against the then-current tree.

**Constraint carried from the owner (do not re-decide):** url-state.ts's header
(`:5-13`) records the owner's explicit ruling that EVERY tab-like view gets a
history entry - "Full coverage is the intended design; do not narrow this scope
again without asking." So adding Tier-3 params is consistent with standing
direction, not a new granularity decision.

---

## 5. How URL and localStorage interact (the owner's precedence worry, already solved)

The owner asked that the URL WIN over localStorage on a cold deep-link load, or the
new browser tab shows the last-used tab instead of the clicked one. **This is
already the implemented and tested behaviour (AC3), for Tier 1.**

- `readNavSource()` (`useAppNavigation.ts:113`): `const source = urlTab !== null ? urlTab : localStorage.getItem("ta-active-tab")`
  - the URL wins whenever a `tab` param is present.
- Every sub-view initializer gates its URL read on `urlHasTab` and only consults the
  persisted `ta-*` key when the URL did NOT name a tab (e.g. manualView
  `:308-350`, gradingView `:485-520`).
- Because `buildUrlSearch` always sets `tab=`, every href this design produces
  carries a `tab` param, so every cold deep-link takes the URL-wins branch. The
  clicked view renders; the stored one does not.

**The precise pass condition (object / instrument / direction):** for each Tier-1
layer, open a cold URL produced by `buildUrlSearch({...default, <field>:<nonDefault>})`
with a CONFLICTING value in the matching `ta-*` localStorage key; the object under
comparison is the resolved initial state returned by the nav hook's initializers;
the instrument is the existing `useAppNavigation` initializer logic exercised
through `parseUrlState`/`readNavSource` (unit-level, no render); failure is the
initializer returning the localStorage value instead of the URL value. This is
already covered by the AC3 suite - the test seat confirms the coverage extends to
every Tier-1 field, and files a residual for any field it does not.

For Tier 3, this guarantee does NOT hold until section 4b's param is added - that
is the whole reason Tier 3 is gated behind the scheme extension.

localStorage persistence itself is unchanged: the `ta-*`-key persist effects
(`useAppNavigation.ts:668-706`) still run on every state change, so a plain
left-click (which still calls the setters) still updates localStorage as today.
The URL simply takes precedence at COLD LOAD, which it already does.

---

## 6. The TabLink click-handler contract

### 6a. The shared guard (one pure leaf, testable without a render)

New leaf module `src/app/components/tabs/tab-link.ts` (pure TS, no JSX), two
exports:

```
// True only for an unmodified primary click that should become an in-app switch.
// Every other case (ctrl/cmd/shift/alt, non-primary button, already-prevented)
// falls through so the browser opens the href natively in a new tab/window.
export function isPlainLeftClick(e: {
  button: number; metaKey: boolean; ctrlKey: boolean;
  shiftKey: boolean; altKey: boolean; defaultPrevented: boolean;
}): boolean {
  return !e.defaultPrevented && e.button === 0
    && !e.metaKey && !e.ctrlKey && !e.shiftKey && !e.altKey;
}

// The href for a tab: an absolute-path deep link the cold-load hydrator restores.
export function buildTabHref(navState: UrlNavState, patch: Partial<UrlNavState>): string {
  return "/" + buildUrlSearch({ ...navState, ...patch });
}
```

Why a leaf and not the nav hook: `useAppNavigation.ts` is 938 lines (measured),
62 from the 1000 ceiling; adding the href machinery there risks it. The guard and
href builder have no React dependency and belong in a unit-testable leaf.

`shift+click` note: the dispatch lists shift+click among the "open in new tab"
modifiers. In Chromium shift+click on an anchor opens a new WINDOW (not a tab), in
Firefox a new window too - this is native browser behaviour, not something the app
chooses. Treating shift as "let the browser handle it" (which `isPlainLeftClick`
does, since `shiftKey` is excluded) delivers the native behaviour the owner asked
for; the app does not and should not force "tab vs window".

### 6b. The custom rails (`TabRail`, `ManualRail`, and Tier-3 strips)

Each currently renders `<button role="tab" onClick={() => onChange(id)}>`. The
change, per rail:

- Add an optional `href?: string` per option (the parent computes it with
  `buildTabHref`, because only the parent knows the id->nav-state-patch mapping -
  e.g. `toolsStateFromRailItem`, `resolveStateFromDestinationId`).
- When `href` is present, render `<a role="tab" href={href} tabIndex=... onClick={onClick}>`
  instead of `<button>`; keep every existing class, `aria-selected`, roving
  `tabIndex`, and the Left/Right/Home/End handler unchanged.
- `onClick`: `if (isPlainLeftClick(e.nativeEvent ?? e)) { e.preventDefault(); onChange(id); }`
  else return (browser handles it). (React's synthetic event carries
  `button`/`metaKey`/etc.; pass the fields the guard needs.)

**Pass condition (object / instrument / direction):** the object is the rail's
rendered element for a given option; the instrument is a source-text assertion
(`*.wiring.test.ts` reading the component with `readFileSync` - the only mechanism
available, since no component renders here) that when `href` is supplied the
element is an `<a>` carrying that `href` AND an onClick that references
`isPlainLeftClick`/`preventDefault`; failure is the element remaining a `<button>`
or the onClick calling `onChange` unconditionally (which would switch the tab on a
ctrl+click too). The verifier additionally OWNER-WALKS the actual new-tab behaviour
(no test renders it - section 11).

### 6c. The MUI top strip (`page.tsx:463-518`) - the seam subtlety, pinned

MUI `<Tabs onChange={(_, v) => setActiveTab(v)}>` wires selection through the
Tab's click internally, SEPARATELY from any `onClick` we add to `<Tab>`. So a
modified click would fire BOTH our `onClick` AND MUI's `onChange` -> switching the
current tab while ALSO opening a new browser tab. The contract must guard the MUI
`onChange` itself, not only the Tab onClick:

- Render each `<Tab component="a" href={buildTabHref(navState, { tab })} onClick={onTabAnchorClick}>`.
- Change `<Tabs onChange={(e, v) => { if (isPlainLeftClick(e)) setActiveTab(v); }}>`
  so a modified click's `onChange` is a no-op (the event carries the modifiers).
- `onTabAnchorClick`: `if (isPlainLeftClick(e)) e.preventDefault();` else return.
  (The indicator follows `value={activeTab}` state, so no separate indicator
  wiring is needed.)

**Pass condition:** object = behaviour of `<Tabs>` onChange + Tab onClick under a
modified vs unmodified click; instrument = source-text assertion that `onChange`
is guarded by `isPlainLeftClick` and each `<Tab>` is `component="a"` with an
`href`, PLUS owner-walk; direction of failure = a ctrl/cmd/middle click that both
opens a new browser tab AND changes the current tab, or a plain click that triggers
a full-document navigation instead of the in-app switch.

### 6d. SSR / hydration

`page.tsx` and the nav hook already produce DIFFERENT values on the server
(initializers return `"manual"`/defaults when `typeof window === "undefined"`,
`useAppNavigation.ts:199`) versus the client (real values once `window` exists).
The app already tolerates this first-render divergence; adding `href` attributes
that differ the same way is the SAME existing pattern, not a new hazard class - BUT
it is a reading claim (no test renders the component) and the verifier owner-walks
that a fresh cold load shows no broken hrefs and no hydration error in the console.
Do NOT switch to `useSearchParams` to "fix" SSR - that introduces the Suspense
build requirement section 1 documents. Keep reading `window.location.search`.

### 6e. Accessibility delta (reading claim - no component renders here)

Converting `<button role="tab">` to `<a role="tab" href>` changes one keyboard
semantic: a `<button>` activates on both Enter and Space; an `<a>` activates on
Enter only (Space scrolls). The roving-tabindex arrow-key handler is unchanged and
still moves+activates. The Enter path still fires `onClick` -> `isPlainLeftClick`
true -> in-app switch. This is a WAI-ARIA tablist nuance to hand to the Wave-3
accessibility seat; it cannot be verified here (no render) and is a residual, not a
blocker. The visual language is preserved (same `styles.lessonInnerTab*` classes),
satisfying the house-UI standard.

---

## 7. Write set, waves, acceptance criteria, ceilings, gates

### Wave 1 - shared primitive + Tier-1 adoption (satisfies the request's core)

Delivers: ctrl/cmd/middle/shift-click opens a new browser tab for the top-level
strip, all three rails, and every ManualRail inner destination. No URL scheme
change, no structural-gate count change, no localStorage change.

Write set (the caller of each new export is included, per the repo's
non-negotiable):
- `src/app/components/tabs/tab-link.ts` - NEW leaf: `isPlainLeftClick`,
  `buildTabHref`. (Type-only import of `UrlNavState` from `url-state.ts`.)
- `src/app/components/tabs/TabRail.tsx` - add optional `href`; render `<a>` when
  present; guard onClick. (CALLER: `page.tsx`, below.)
- `src/app/components/manual/ManualRail.tsx` - same anchor change; the parent
  passes a per-destination `href`. (CALLER: `page.tsx`.)
- `src/app/page.tsx` - assemble a `navState: UrlNavState` (useMemo over the fields
  it already destructures from `nav`, ~16 lines - keep it HERE, not in the
  938-line nav hook); compute each rail option's / destination's / top Tab's
  `href` via `buildTabHref`; convert the `<Tabs>`/`<Tab>` block to anchors and
  guard the `onChange` (section 6c). This file is the CALLER of `tab-link.ts`,
  `TabRail`'s new `href`, and `ManualRail`'s new `href`.
- Tests (NEW, written from the test seat's notes): a `*.wiring.test.ts` that
  source-text-asserts the anchor+guard contract on each Tier-1 layer, and a unit
  test for `tab-link.ts` (`isPlainLeftClick` truth table across the 2^4 modifier
  combos + button!=0 + defaultPrevented; `buildTabHref` round-trips through
  `parseUrlState` for a sample of patches). The `isPlainLeftClick` truth table is
  the removal-test candidate: it goes RED if the guard is weakened to switch on a
  modified click.

Ceiling check (measure with `@(Get-Content).Count` at wave gate, not from here):
`page.tsx` 880 + the Tabs-anchor conversion and navState memo; watch it does not
cross 1000. `TabRail` 94, `ManualRail` 90 - ample headroom. `useAppNavigation.ts`
is NOT edited in Wave 1 (deliberate, to keep it off the 938->1000 line).

Acceptance criteria (Wave 1):
- AC1: For each Tier-1 layer, a plain left-click performs the in-app client-state
  switch with NO full-document navigation (unchanged behaviour). Instrument:
  source-text (onClick calls `preventDefault`+ the existing setter under
  `isPlainLeftClick`) + owner-walk (no reload flash).
- AC2: For each Tier-1 layer, a ctrl/cmd/middle-click opens a NEW browser tab at
  that view's deep link, and the current tab does NOT change. Instrument:
  source-text (the element is an `<a href>`; the guard excludes modified/non-primary
  clicks; the MUI onChange is guarded) + owner-walk (OWNER-ONLY: a real browser).
- AC3: The new browser tab, cold-loaded at that href, renders exactly that
  tab/section/view/inner-view - even when the matching `ta-*` localStorage key
  holds a different value. Instrument: the existing AC3 URL-wins initializer suite,
  extended to every Tier-1 field by the test seat; direction of failure = the
  initializer returning the stored value.
- AC4 (href correctness): `buildTabHref(navState, patch)` round-trips -
  `parseUrlState(buildUrlSearch({...navState,...patch}))` yields a state whose
  patched field equals the patch. Instrument: unit test. Direction: any patched
  field not surviving the round trip.

### Waves 2+ - Tier-3 layers, ONE per wave, each extending the scheme

Each wave adds one sub-tab's param per section 4b, then anchors that strip. One
per wave because each touches a different owning component and (for recording) a
structural gate:

- Wave 2: Recording strip (`recView`). Write set: new leaf `recording/rec-views.ts`
  (member list + guard); `url-state.ts` (`normalizeRecView`, `UrlNavState` field,
  build+parse); `useAppNavigation.ts` (initializer + persist effect + popstate
  branch); `RecordingTab.tsx` (anchors on the strip; caller of the href builder).
  GATE: `recording-split.structure.test.ts` (and the recording-reading tests in
  the owns list) MUST run in the wave gate via
  `npm run test:paths <...>` - the strip's `role="tab"`/`role="tabpanel"` counts
  are hardcoded there, and the pre-push gate runs NO vitest (`this-repo.md`
  section 1), so a count drift reaches main uncaught otherwise. CEILINGS:
  `RecordingTab.tsx` is 918 and `useAppNavigation.ts` is 938 - both close; measure
  at the gate and extract if either crosses 1000.
- Wave 3: Version Control sub-tabs (`vcSubTab`) + Org view (`vcOrgView`). Same
  recipe; no named structural gate; smaller files (188).
- Wave 4: Files view toggle (`filesView`). Confirm its persist key first (the
  persisted key was not fully read this pass - the implementer verifies before
  adding the param, so the URL param and the `ta-*` key stay in sync, per the
  `roster-text-vs-studentRepos` lesson about two unsynced stores).

Tier 3 waves carry the same AC1-AC4 shape as Wave 1, plus: AC-T "the cold-load of
the new param renders the named sub-view and wins over its `ta-*` key"
(instrument: the new initializer branch's unit test; direction: stored value
winning).

### Gates every wave runs (from `this-repo.md`)

- `npx tsc --noEmit` (exit 0, no output); `npm run lint` (exit 0, no NEW warning in
  files the wave writes - never pin the absolute count); `npm run build` (grep for
  `Compiled successfully`, NOT exit 0); `src/file-size-ceiling.structure.test.ts`
  UNCONDITIONALLY; and for two-or-more test paths `npm run test:paths <p1> <p2> ...`
  (never a raw multi-path `vitest`, which silently drops unmatched args).
- `git status --short` against the wave's file list, and a check that no
  `.claude/worktrees` copy was edited (Glob returns the worktree copy first).

---

## 8. The `owns` file list (command + pasted output)

Files the change edits, PLUS every test that reads an edited file AS SOURCE TEXT
(a grep a string it does not own goes red on a correct change). Command and output:

```
$ grep -rln 'page.tsx' src --include=*.test.ts | sort        # tests reading page.tsx
src/app/actions/action-guard-coverage.test.ts
src/app/components/home/useAppNavigation.test.ts
src/app/components/live-messaging/SuccessTracking.wiring.test.ts
src/app/components/manual/manual-rail.test.ts
src/app/components/repo-grades/repoGradesSliceA.guards.test.ts
src/app/components/snapshot-grading/snapshot-grading.structure.test.ts
src/app/components/tabs/topLevelTabs.wiring.test.ts
src/app/components/walkthrough-announcement/walkthrough-announcement.structure.test.ts
src/lib/canvas-credentials.exports.test.ts
src/lib/drafts-nav.test.ts
src/lib/knowledge-return.test.ts
src/lib/module-graph/runtime-import-graph.test.ts
src/lib/recording-launch.test.ts
src/lib/visualizer.test.ts
src/tools/strip-comments-agreement.structure.test.ts
```

```
$ grep -rln 'page\.tsx\|url-state\|useAppNavigation\|tab-rails\|TabRail\|ManualRail\|RecordingTab' \
    src --include=*.structure.test.ts --include=*.wiring.test.ts | sort
src/app/components/canvas-tab/announcements-panel.wiring.test.ts
src/app/components/contentTab.wiring.test.ts
src/app/components/live-messaging/SuccessTracking.wiring.test.ts
src/app/components/message-replies/message-replies.structure.test.ts
src/app/components/module-deck-capture/ModuleDeckCapturePanel.wiring.test.ts
src/app/components/module-deck-capture/module-deck-capture.structure.test.ts
src/app/components/recording/recording-split.structure.test.ts
src/app/components/recording/recording-tab-header.structure.test.ts
src/app/components/snapshot-grading/snapshot-grading.structure.test.ts
src/app/components/tabs/topLevelTabs.wiring.test.ts
src/app/components/walkthrough-announcement/walkthrough-announcement.structure.test.ts
src/app/components/wb-remembered-fab-launch.wiring.test.ts
src/file-size-ceiling.structure.test.ts
src/tools/strip-comments-agreement.structure.test.ts
```

Owns, by wave:

- Wave 1 edits: `src/app/components/tabs/tab-link.ts` (new),
  `src/app/components/tabs/TabRail.tsx`, `src/app/components/manual/ManualRail.tsx`,
  `src/app/page.tsx`, plus new Wave-1 test files.
  Wave 1 MUST-RUN tests (read the edited files as source text, from the output
  above): `topLevelTabs.wiring.test.ts`, `snapshot-grading.structure.test.ts`,
  `walkthrough-announcement.structure.test.ts`, `recording-launch.test.ts`,
  `drafts-nav.test.ts`, `knowledge-return.test.ts`,
  `SuccessTracking.wiring.test.ts`, `manual-rail.test.ts`,
  `action-guard-coverage.test.ts`, `strip-comments-agreement.structure.test.ts`,
  `file-size-ceiling.structure.test.ts`, and `useAppNavigation.test.ts` (reads the
  hook; Wave 1 does not edit the hook, but run it to prove that). The verifier
  confirms this list against a re-run of the two greps on the then-current tree -
  the set drifts as tests are added.
- Wave 2 edits add: `src/app/components/recording/rec-views.ts` (new),
  `src/app/url-state.ts`, `src/app/components/home/useAppNavigation.ts`,
  `src/app/components/RecordingTab.tsx`. MUST-RUN additionally:
  `recording-split.structure.test.ts`, `recording-tab-header.structure.test.ts`,
  `module-deck-capture.*`, `message-replies.structure.test.ts`,
  `contentTab.wiring.test.ts`, `announcements-panel.wiring.test.ts`,
  `wb-remembered-fab-launch.wiring.test.ts` (all read RecordingTab/url-state).

---

## 9. Forks, each with a recommended reading (owner redirects if wrong)

### Fork A - query-param vs path-based URL scheme

**Recommendation: EXTEND the existing query-param scheme. Do not introduce
path-based routes.** The app already has a complete, tested, owner-confirmed
query-param scheme (`url-state.ts`) with legacy-alias migration and full
Back/Forward restore. A path scheme (`/tools/grading/repos`) would require
restructuring the single `app/page.tsx` into a Next route tree, re-implementing
cold-load for every segment, discarding `buildUrlSearch`/`parseUrlState`, and
breaking every existing `?tab=` bookmark and shared link. Cost of being wrong:
low - a path scheme can be layered on later, but there is no benefit here and the
cost is a full rewrite of working, covered code. Strong recommendation.

### Fork B - all layers at once vs Tier-1 first, then iterate

**Recommendation: ship Tier 1 (Wave 1) first and alone as the deliverable that
satisfies the request's core; do Tier-3 layers as subsequent one-per-wave
iterations.** Tier 1 covers the entire primary navigation (top strip + 3 rails +
every ManualRail inner destination), needs no URL scheme change, no structural-gate
change, no localStorage change, and no edit to the 938-line nav hook - it is the
high-value, low-risk majority of "any clickable tab." Tier 3 is riskier per layer
(new params, structural gates, files near the 1000-line ceiling) and lower-traffic.
Cost of being wrong: bounded - if the owner wants a specific Tier-3 strip sooner
(most likely Recording, row 7), that single wave reorders to the front; it is a
one-message redirect, not a redesign. Recommended because it ships the owner's
primary ask fastest while keeping the risky layers isolated.

### Fork C - how deep to encode, and whether the pipeline stepper is in scope

**Recommendation: encode to full depth for genuine navigation tabs (Tiers 1 and
3), consistent with the owner's standing "full coverage" ruling
(`url-state.ts:5-13`); EXCLUDE the Presentations pipeline stage stepper
(`PipelineStepper.tsx`, row 11).** The pipeline stepper is a linear wizard - its
"tabs" are stages gated on completion, not independently navigable views, so a
deep link to an arbitrary stage is not a meaningful "open this view" target and may
not even be reachable cold. Cost of being wrong: low - if the owner does want
pipeline stages deep-linkable, it is an additive later wave. Recommended exclusion
because treating a gated wizard step as a free-navigation tab would ship links that
dead-end.

None of these forks blocks Wave 1: Wave 1 is startable immediately under
recommendation A (extend the scheme) and recommendation B (Tier 1 first). Per the
never-stall rule, these are recommendations to ACT on, with the question riding
alongside - not gates.

---

## 10. Residual register (each: owner / instrument / step)

Every entry must be filed in `docs/BACKLOG.md` by the orchestrator or it does not
exist.

- R1 - **Accessibility: button->anchor changes Space-activation.** Owner: Wave-3
  accessibility seat. Instrument: reading claim over the diff (no component renders
  here); owner-walk for Space/Enter on each converted tab. Step: the accessibility
  seat rules on the converted anchors against the as-built diff and records whether
  Space-activation loss is acceptable or needs an `onKeyDown` shim.
- R2 - **ctrl/middle/shift-click actual new-tab behaviour is owner-walk only.**
  Owner: repo owner (needs a real browser; `this-repo.md` section 6 - no component
  renders, and "I ran the app" is not a supported claim here). Instrument: manual
  browser walk of each Tier-1 layer. Step: owner verifies a new browser tab opens
  and cold-loads the clicked view; recorded in `docs/REGRESSION.md`.
- R3 - **Tier-3 waves 2-4 are deferred work.** Owner: orchestrator (queue them).
  Instrument: this doc's section 4b/7 per-wave recipe. Step: each files as its own
  backlog row with its param name and the structural gate it must run.
- R4 - **Leverage claim is the AC seat's to author, not this seat's.** Owner:
  `loop-ac`. Instrument: `docs/loop/leverage.md` classes. Step: see section 11 -
  the AC seat decides the honest class and whether a removal test is buildable
  here (it likely is NOT, since the advantage is browser-tab behaviour nothing in
  this suite can observe - record that as a residual per the Test-seat rule).
- R5 - **`FilesTab` persist key not fully confirmed this pass.** Owner: Wave-4
  implementer. Instrument: read `FilesTab.tsx` for the `filesView` persist key.
  Step: confirm the `ta-*` key before adding the `filesView` URL param so the two
  stores stay in sync.

---

## 11. What cannot be verified here; leverage + diagnostics notes for the AC seat

Cannot be verified in this environment (`this-repo.md` section 6; state, do not
work around):
- **No component is rendered by any test.** Every claim in sections 6b-6e about
  what element renders, how a click behaves, focus/keyboard, and hydration is a
  READING claim verified by source-text assertions, never by a render. The actual
  ctrl/middle/shift-click-opens-a-new-tab behaviour is OWNER-WALK only (R2).
- Do NOT propose any acceptance criterion whose only enforcer would be a render.
  The buildable instruments here are: source-text `*.wiring.test.ts` on the
  anchor+guard contract, and unit tests on `tab-link.ts` and the
  `buildUrlSearch`/`parseUrlState`/initializer round-trip.

Leverage note for the AC seat (this seat does not author the claim): the honest
mechanism is that a view acquires a shareable, bookmarkable, cold-loadable URL,
enabling the user to open MULTIPLE views at once in separate browser tabs - a thing
a single-page client-state app, and a chat, cannot do. This is closest to a
click-cost / parallel-work affordance; it is NOT one of the six taxonomy classes
cleanly. Per `leverage.md`, name it as click-cost / shareability explicitly rather
than dressing it as persistence it does not add. A removal test is likely NOT
buildable here (the advantage is browser-tab behaviour); record that as a residual
with the owner-walk step, per the Test-seat rule.

Diagnostics-representation note (AC seat owns this too): this is overwhelmingly a
presentational/navigation change with no new data path and no new failure mode -
which `DEV_LOOP.md` allows to carry NO diagnostic rep, PROVIDED the AC document
STATES that absence and justifies it. The one arguable new failure mode is a
malformed/stale deep link; it is already handled by the existing
`normalizeX`/`resolveTabDestination` fallbacks (a bad value lands on the default,
not an error), so no new diagnostic is needed - but the AC seat states that
explicitly rather than assuming it.

---

## 12. Disposition table

Not applicable: this is a new scope with no prior version to restructure. No
requirement was carried over, handed off, or withdrawn.
