# ANNOUNCEMENTS-TAB A-W1 (sub-tab registry) - test notes

Author: `loop-test-author` (Opus), 2026-10-04. Consumer: `loop-implementer` (builds
the tests + code from this), gated first by a fresh `loop-checker`. This file is the
artifact; a handback is not openable (`seats.md` Test seat).

A-W1 is REGISTRY + INNER-NAV SCAFFOLDING + EMPTY SHELL. It adds the `announcements`
Manual sub-tab, its two inner-nav chips (`post`, `walkthrough`), the empty
`AnnouncementsSubTab` shell page.tsx mounts, and all canary bumps. It MOVES NO TOOL -
the Recording and LMS announcement surfaces are untouched (that is A-W2). Rulings
applied, not reopened: T1=(b), T2=move, T3=two inner chips (`post`=Post-an-announcement,
`walkthrough`=From-a-walkthrough), T4=dedicated `AnnouncementsSubTab.tsx` for non-capture
tools + the walkthrough capture panel stays an always-mounted top-level sibling (A-W2).

Evidence tags: `[READ file:line]` opened at that line; `[MEASURED <cmd>]` run here;
`[ARGUED]` reasoned from READ facts, runtime not observed (nothing renders under vitest -
`DEV_LOOP.md`, memory `headless count canary`). Every count names its source.

---

## 0. Satisfiability proof (Test-seat practice 1)

A self-contained reference implementation of the registry construction (the frozen
ordered lists, `ANNOUNCEMENTS_VIEWS` derived guard, `getActiveDestinationId` /
`resolveStateFromDestinationId` announcements branch, and the INNER_NAV/destinations
parity) was built and run in an isolated scratch tree:
`...\scratchpad\ref-impl.mjs` -> **PASS: 9 reference assertions green. Red tests are
satisfiable.** The proposed red tests are satisfiable by a real construction; this is
not an impossible or self-contradictory spec.

**A rebuilt instrument, reported (practice 2).** The first reference run went RED on
`parity broke for presentations` - NOT a real defect, but an incompleteness in my own
scratch fixture (I had abbreviated the `Presentations` destinations group out while
leaving `presentations` in INNER_NAV). The real `manual-rail.ts` HAS that group, so the
real parity holds; I fixed the fixture to match reality and it went green. The incident
is itself the proof that the I1 parity test (R5-c below) discriminates a half-registered
inner nav - exactly the failure mode it must catch for `announcements`.

**Sabotage discrimination proof** (`...\scratchpad\sab.mjs`):
- append `announcements` at END vs the frozen index-2 ordered list -> **RED** (discriminates ordinal).
- `getActiveDestinationId` hardcodes `announcements-post`, ignoring `announcementsView` -> **RED** on `walkthrough` (derived guard discriminates).
- `resolveStateFromDestinationId` omits the `announcements-` branch -> **RED** (discriminates).
- length-only check (`toHaveLength(12)`) with `announcements` at the WRONG ordinal -> **UNEXPECTED-GREEN**. This is the load-bearing negative result; see section 8.

---

## 1. Measured facts at HEAD (every quantity names its source)

| Fact | Value | Source |
|---|---|---|
| `MANUAL_VIEW_ORDER` | 8 entries: course-planning, content, version-control, recording, ppt-design, artifact-design, presentations, grading | `[READ manual-rail.ts:185-194]` |
| `MANUAL_VIEW_LABELS` | 8 keys, same set | `[READ manual-rail.ts:196-205]` |
| `isManualViewType` | derived from `MANUAL_VIEW_ORDER` (a `Set`), NOT a restated list | `[READ manual-rail.ts:213-217]` |
| `INNER_NAV` | 4 inner-nav views: course-planning, content, grading, presentations | `[READ manual-rail.ts:227-232]` |
| `getActiveDestinationId` sig | `(manualView, buildView, contentView, gradingView, presentationsView="slide-deck")` | `[READ manual-rail.ts:261-266]` |
| `resolveStateFromDestinationId` sig | 6 params, last `currentPresentationsView="slide-deck"`; returns `{manualView,buildView,contentView,gradingView,presentationsView}` | `[READ manual-rail.ts:322-335]` |
| `TOOLS_RAIL_ITEMS` | derived: `MANUAL_VIEW_ORDER.map(...)` ++ `WORKFLOWS_VIEW_ORDER.map(...)` -> 8+3 = 11 | `[READ tab-rails.ts:132-149]` |
| `WORKFLOWS_VIEW_ORDER` | `["workflows","automations","drafts"]` (3) | `[READ tab-sections.ts:109]` |
| Count canary A | `expect(TOOLS_RAIL_ITEMS).toHaveLength(11)` | `[READ tab-rails.test.ts:67]` |
| Count canary B | `expect(TOOLS_RAIL_ITEMS).toHaveLength(11)` | `[READ topLevelTabs.wiring.test.ts:376]` |
| Ordered id-list oracle | frozen `.toEqual([...11 ids...])` | `[READ tab-rails.test.ts:54-66]` |
| `MANUAL_VIEW_ORDER` frozen oracle | frozen `.toEqual([...8 views...])` | `[READ manual-rail.test.ts:199-208]` |
| Render-branch canary | loops `MANUAL_VIEW_ORDER`, asserts page.tsx manual slice contains `manualView === "<view>"` | `[READ topLevelTabs.wiring.test.ts:338-344]` |
| I1 parity | loops `MANUAL_VIEW_ORDER`: `getInnerDestinations(v)!==null` iff `getInnerNavAriaLabel(v)!==null` | `[READ manual-rail.test.ts:268-277]` |
| I5 popstate branch-existence (derived) | loops `MANUAL_VIEW_ORDER`: every view with `getInnerDestinations(v)!==null` must have a `parsed.manualView === "<v>"` popstate branch (AUTO-FIRES for `announcements`) | `[READ useAppNavigation.test.ts:203-215]` |
| I5 popstate-read + dep-array precedent | popstate slice contains `parsed.presentationsView` (`:741`); URL-sync dep array contains `presentationsView` - the shape pins (ii)/(iii) mirror | `[READ useAppNavigation.test.ts:234-249]`, `[READ useAppNavigation.ts:625-626,680,737,741]` |
| LMS/GRADING derived guards | loop `LMS_VIEWS`/`GRADING_VIEWS` through resolve+getActive (coverage by construction) | `[READ manual-rail.test.ts:310-343]` |
| gradingView persistence | `GRADING_VIEW_KEY = "ta-grading-view"` + initializer + write effect | `[READ useAppNavigation.ts:55,373-413,556]` |
| storage-key canary | `KEYS` list of `{constant,value}`; asserts each is declared + written | `[READ useAppNavigation.test.ts:151-172]` |
| `presentationsView` IS a URL param | `PRESENTATIONS_VIEW_PARAM="presentationsView"`, emitted :466-468, parsed :417 | `[READ url-state.ts:298,417,466]` |
| frozen URL param oracle | `EXPECTED_PARAM_NAMES` (12 names) + `emittedParamNames()` states list | `[READ tab-rails.test.ts:296-345]` |

**Two latent facts that shape the design:**

1. **The storage-key canary `KEYS` list is POSITIVE-ONLY and already incomplete.** It
   lists `MANUAL_VIEW_KEY, WORKFLOWS_VIEW_KEY, TASKS_VIEW_KEY, GRADING_VIEW_KEY` but
   NOT `PRESENTATIONS_VIEW_KEY` - yet the suite is green `[READ useAppNavigation.test.ts:151-156]`.
   So an unlisted `ta-` key does NOT redden this canary; adding `ta-announcements-view`
   is therefore an enforcement CHOICE, not an automatic break. We make the choice (R5-f):
   add it, so the key's declare+write is guarded. The `PRESENTATIONS_VIEW_KEY` omission
   is a pre-existing gap recorded as residual RR-3, not fixed here.

2. **The frozen URL param oracle does NOT exercise `presentationsView`.** `presentationsView`
   is a real URL param yet is absent from `EXPECTED_PARAM_NAMES`, and the oracle stays
   green because `emittedParamNames()`'s states list drives no `manualView:"presentations"`
   state `[READ tab-rails.test.ts:314-335]`. Consequence: adding `announcementsView` as a
   URL param will NOT redden that oracle either - which is a BLIND SPOT, not a free pass.
   Under the URL-param fork (F1-URL) the oracle MUST be extended to cover `announcementsView`
   (R5-url), or the new param ships unguarded against a future rename. The pre-existing
   `presentationsView` gap is residual RR-4.

---

## 2. FORK F1 - the one fork that decides the write set (flag per seat brief)

**Is `announcementsView` a full URL param (deep-linkable, Back/Forward, in
`buildUrlSearch`/`parseUrlState`/`UrlNavState` + popstate ladder) OR a localStorage-only
inner selection (persists across reload under `ta-announcements-view`, but not in the
URL)?**

- **F1-URL (RECOMMENDED).** Mirror `gradingView`/`presentationsView` EXACTLY. `url-state.ts`'s
  own header is an explicit owner ruling: "Every tab-like view in page.tsx gets a history
  entry, including the second-level controls nested INSIDE a tab's sub-view ... Full
  coverage is the intended design; do not narrow this scope again without asking"
  `[READ url-state.ts:5-13]`. Every existing inner view (buildView, contentView,
  gradingView, presentationsView) is a URL param. A localStorage-only inner nav would be
  the ONLY one that is not deep-linkable - a narrowing the owner already forbade.
  Blast radius: `url-state.ts` (+`ANNOUNCEMENTS_VIEW_PARAM`, `UrlNavState` field,
  parse/build branches, `isAnnouncementsView`/`normalizeAnnouncementsView`),
  `useAppNavigation.ts` (state + initializer + write effect + `buildUrlSearch` args + dep
  array + popstate ladder branch), `manual-rail.ts`, `page.tsx`, `ManualRail.tsx`, plus the
  two `DEFAULT_STATE` UrlNavState test literals (tsc-forced). Bounded and mechanical -
  `presentationsView` (PRES-2 S6.7) is the exact two-child precedent that shipped green
  through these same files.
- **F1-LOCAL.** `ta-announcements-view` only (initializer + write effect in
  `useAppNavigation.ts`), no `url-state.ts` edits. Smaller, but violates the full-coverage
  ruling above.

**RULED 2026-10-04 (orchestrator): F1-URL.** The fork is decided - `announcementsView` is a
full URL param. The reasoning above is retained as the record of why; the terminating question
below is ANSWERED and does NOT reopen. Requirements R5-url and the URL-param rows in sections
4/6/7 are LIVE, not contingent.

**Recommended reading (as ruled): F1-URL.** This note's requirement R5-url and the URL-param
rows in sections 4-7 assume F1-URL.

**F1-LOCAL contingency - SUPERSEDED by the ruling, corrected for the record (MINOR 2).** Had
F1-LOCAL been chosen, deletion would NOT have been wholesale. Under F1-LOCAL `announcements`
STILL has an inner nav, so the derived I5 popstate branch-existence guard
(`useAppNavigation.test.ts:203-215`) STILL requires a `parsed.manualView === "announcements"`
popstate branch to EXIST (it loops `MANUAL_VIEW_ORDER` for any view with inner destinations).
That branch lives in the popstate ladder R5-url adds, so the previous "DELETE R5-url, everything
else stands unchanged" wording would have left I5 RED. The correct F1-LOCAL delta would have
dropped only the `url-state.ts`/`url-state.test.ts` param plumbing and the emitted-names/round-trip
pins, while KEEPING a popstate branch that reads the localStorage-seeded value (not a URL param)
so I5 stays green - and pin (ii) below would then assert the branch reads that seeded value
rather than `parsed.announcementsView`. Moot under the ruling; recorded so the error is not
inherited by any later re-reading.

**Terminating question that was put to the owner (answered F1-URL; retained for the record):**
"The new Announcements inner nav produces EITHER a deep-linkable URL param (`announcementsView`,
consistent with every other inner view and with url-state.ts's 'full coverage' ruling) OR a
localStorage-only selection (smaller change, but the only inner nav not in the URL). Which?"

---

## 3. FORK F2 / the pin most likely to be built loose - the ORDINAL

See section 8 in full. In brief: the position of `announcements` in `MANUAL_VIEW_ORDER` is
an OWNER-intent decision that NO machine test can validate for correctness - the frozen
ordered-list tests only check that the test LITERAL agrees with the built ARRAY, so a
self-consistent WRONG position passes. **Recommended ordinal: index 2, immediately after
`content` (LMS)** - the grouped tools (Canvas composer, walkthrough) originate adjacent to
LMS, so the chip sits near its old home. This is OWNER-confirmable (residual RR-1); the
machine pins below enforce only that production and the two test literals agree on whatever
ordinal is chosen.

---

## 4. What A-W1 produces (write set, under F1-URL)

| Path | Change | Lines at HEAD |
|---|---|---|
| `src/app/components/manual/manual-rail.ts` | R1 union, R2 order, R3 label, R5 inner-nav (type, guard, INNER_NAV, destinations group, getActive/resolveState branches) | 415 `[MEASURED]` |
| `src/app/components/manual/manual-rail.test.ts` | frozen-order bump, announcements describe block, derived guard over `ANNOUNCEMENTS_VIEWS`, stale "eight"->"nine" title | 629 |
| `src/app/components/tabs/tab-rails.test.ts` | ordered id-list + length 11->12; stale descriptions :53,:105; `DEFAULT_STATE` += `announcementsView` (F1-URL, tsc-forced) | 381 |
| `src/app/components/tabs/tab-rails.ts` | stale comment :8-9,:37 ("ten"/"seven") | 193 |
| `src/app/components/tabs/topLevelTabs.wiring.test.ts` | length 11->12 (:376); stale comment :374-375 | ~650 |
| `src/app/components/home/useAppNavigation.ts` | `ANNOUNCEMENTS_VIEW_KEY`, state+initializer+write effect, buildUrlSearch args+dep, popstate branch (F1-URL) | 798 |
| `src/app/components/home/useAppNavigation.test.ts` | add `{constant:"ANNOUNCEMENTS_VIEW_KEY", value:"ta-announcements-view"}` to `KEYS`; (F1-URL, BLOCKER) add the (ii) popstate-read + (iii) dep-array source-text pins to the I5 describe block (mirror :234-249) | - |
| `src/app/url-state.ts` (F1-URL only) | `ANNOUNCEMENTS_VIEW_PARAM`, `UrlNavState.announcementsView`, parse/build/normalize | 492 |
| `src/app/url-state.test.ts` (F1-URL only) | `DEFAULT_STATE` += field; announcementsView round-trip block (mirror :978-990) | - |
| `src/app/page.tsx` | R4 `manualView==="announcements"` render branch mounting `<AnnouncementsSubTab>`; pass `announcementsView` to `ManualRail` + `resolveStateFromDestinationId`; stale comment :519-523 | 832 `[MEASURED]` |
| `src/app/components/manual/ManualRail.tsx` | thread `announcementsView` into `getActiveDestinationId` | 80 |
| NEW `src/app/components/announcements/AnnouncementsSubTab.tsx` | empty/placeholder shell (no tools) | new, small |

No file approaches the 1000-line ceiling (`page.tsx` 832 -> ~850). `manual-rail.ts` 415 ->
~445. `[MEASURED @(Get-Content).Count]` for page.tsx/manual-rail.ts.

---

## 5. Requirements (object | instrument | DIRECTION) + sabotage per requirement

Each sabotage: the named mutation, RED expected, GREEN after restore, and whether it
DISCRIMINATES. A sabotage red-both-ways or green-both-ways discriminates NOTHING; where
one cannot, it is said.

### R1 - `ManualViewType` union gains `"announcements"`
- Object: `manual-rail.ts` `ManualViewType`. Instrument: tsc (TS2322 across call sites) +
  `isManualViewType("announcements")` assertion (new, in the announcements describe block).
  Direction: RED if absent (tsc fails once R2/R4 reference it; assertion fails).
- Sabotage: remove `"announcements"` from the union -> tsc RED repo-wide. GREEN restored.
  DISCRIMINATES (tsc is the instrument; a pure-union change with no value is caught by its
  consumers, not by a value test alone - which is why R2/R4 below are the real guards).

### R2 - `MANUAL_VIEW_ORDER` gains `"announcements"` at the chosen ordinal; `MANUAL_VIEW_LABELS` gains a non-empty label
- Object: the two arrays/records in `manual-rail.ts`.
- Instrument: `manual-rail.test.ts:199-208` FROZEN ORDERED `.toEqual([...9...])` (bump 8->9,
  insert at ordinal) + the existing `label for every entry` loop (:211-215) + a new
  `MANUAL_VIEW_LABELS["announcements"]` non-empty assertion.
- Direction: RED if `announcements` absent, at a different ordinal than the test literal,
  or label empty/missing.
- Sabotage A (ordinal): move `announcements` to the end of `MANUAL_VIEW_ORDER` only ->
  frozen `.toEqual` RED. GREEN restored. **Proven RED in `sab.mjs`.** DISCRIMINATES ordinal
  vs the frozen literal - but see section 8: it does NOT discriminate owner-intended
  correctness, only test-literal/array agreement.
- Sabotage B (label): set `MANUAL_VIEW_LABELS["announcements"] = ""` -> non-empty assertion
  RED. GREEN restored. DISCRIMINATES.

### R3 - the chip joins the Tools rail and the two count + ordered-list canaries agree
- Object: derived `TOOLS_RAIL_ITEMS` (auto-joins via `tab-rails.ts:133`).
- Instrument: `tab-rails.test.ts:54-67` FROZEN ORDERED id-list (insert `"manual:announcements"`
  at the ordinal) + `toHaveLength(11)`->`12`; `topLevelTabs.wiring.test.ts:376`
  `toHaveLength(11)`->`12`; the derived `toHaveLength(MANUAL_VIEW_ORDER.length + WORKFLOWS_VIEW_ORDER.length)`
  (tab-rails.test.ts:92) and the uniqueness asserts (:93,:109) need NO edit (derived).
- Direction: RED if either length stays 11 (chip added, canary not bumped), if a length is
  bumped to 12 with no chip (bump without member), or if the ordered list omits/misplaces
  `manual:announcements`.
- Sabotage A: add the chip (via R2) but leave `toHaveLength(11)` in BOTH canaries -> both RED.
  GREEN restored. DISCRIMINATES the member-without-bump direction.
- Sabotage B: bump both lengths to 12 but revert R2 (no `announcements` in order) -> length
  RED (rail is 11) AND ordered-list RED. GREEN restored. DISCRIMINATES the bump-without-member
  direction. (Both directions covered => the count canary is not red-both-ways-useless.)

### R4 - page.tsx mounts `<AnnouncementsSubTab>` under a `manualView === "announcements"` branch (THE SURFACE IS A LAYER)
- Object: `page.tsx` manual-branch source + the mount.
- Instrument: the EXISTING render-branch canary `topLevelTabs.wiring.test.ts:338-344` loops
  `MANUAL_VIEW_ORDER` and asserts the page.tsx manual slice contains `manualView === "<view>"`.
  Adding `announcements` to the order (R2) makes this canary REQUIRE the branch - no new
  assertion needed; the existing instrument auto-gates R4.
- Direction: RED if `announcements` is in `MANUAL_VIEW_ORDER` but page.tsx has no
  `manualView === "announcements"` branch (the "ships a dead chip" failure this project has
  paid for repeatedly).
- Sabotage: delete the `manualView === "announcements"` branch from page.tsx (leaving R2) ->
  canary RED. GREEN restored. DISCRIMINATES. This is the empty-shell-first guarantee: the
  canary passes as soon as the EMPTY shell is mounted under the guard; it does not require
  any tool to be present.

### R5 - the inner nav (`post`, `walkthrough`)
Sub-parts; all in `manual-rail.ts` unless noted.

- **R5-a `AnnouncementsView` + `ANNOUNCEMENTS_VIEWS` + `isAnnouncementsView`, BY CONSTRUCTION.**
  Object: a `Record<AnnouncementsView, true>` -> `Object.keys` array -> `Set` guard, mirroring
  `GRADING_VIEW_PRESENCE`/`GRADING_VIEWS`/`isGradingView` `[READ manual-rail.ts:69-82]`. NOT a
  hand-written literal list (coverage-by-construction, `traps-tests.md`). Instrument: a new
  derived-guard describe block (see R5-d). Direction: RED if a member is missing from either.
- **R5-b destinations group `"Announcements"` with `announcements-post` and `announcements-walkthrough`,
  each with a non-empty `label` and `description`.** Instrument: existing
  `manual-rail.test.ts:178-185` (every destination has truthy label+description) covers it
  automatically + a new frozen `getInnerDestinations("announcements")` id+label list.
  Direction: RED if a description is empty or an id/label is wrong.
- **R5-c INNER_NAV gains `announcements` with `groupName:"Announcements"` and a DISTINCT `ariaLabel`.**
  Instrument: existing I1 parity `manual-rail.test.ts:268-277` (inner destinations iff aria
  label) + distinct-names `:279-284`. Because `getInnerDestinations` resolves the group by
  `groupName` `[READ manual-rail.ts:247-249]`, a mismatch between INNER_NAV's `groupName` and
  the destinations group name makes `getInnerDestinations` return null while the aria label is
  non-null -> parity RED. Direction: RED if INNER_NAV entry added without a matching
  destinations group (or vice versa), or if `ariaLabel` collides with an existing one.
  - Sabotage: add INNER_NAV `announcements` but name its `groupName` `"Announcement"` (typo,
    no matching group) -> I1 parity RED. GREEN restored. **Proven analogously in section 0**
    (the presentations-group omission reddened parity). DISCRIMINATES a half-registered inner nav.
  - Sabotage: set `ariaLabel` to `"LMS views"` (collision) -> distinct-names RED. DISCRIMINATES.
- **R5-d `getActiveDestinationId` + `resolveStateFromDestinationId` announcements branch, DERIVED GUARD.**
  Object: both functions. `getActiveDestinationId` gains trailing `announcementsView: AnnouncementsView = "post"`
  (mirrors `presentationsView`'s trailing default, `[READ manual-rail.ts:266]`) and returns
  `announcements-${announcementsView}` for `manualView==="announcements"`.
  `resolveStateFromDestinationId` gains trailing `currentAnnouncementsView = "post"`, an
  `id.startsWith("announcements-")` manualView branch, an `announcementsView` resolution
  branch, and `announcementsView` in BOTH the alias-return object (:337-344) and the main
  return (:392) - the alias object omitting it is a tsc error (good interlock).
  Instrument: a NEW describe block mirroring the GRADING_VIEWS derived guard
  (`manual-rail.test.ts:329-343`): loop `ANNOUNCEMENTS_VIEWS` through
  `resolveStateFromDestinationId("announcements-<v>", ...)` asserting `manualView==="announcements"`
  and `announcementsView===v`, AND round-trip `getActiveDestinationId("announcements",...,v)` back
  to `announcements-<v>`. DERIVED over the member set, NOT two hand-written cases (the Finding-4
  lesson, `manual-rail.test.ts:294-305`).
  - Sabotage: make `getActiveDestinationId` return the literal `"announcements-post"` for the
    announcements branch (ignore the param) -> derived guard RED on `walkthrough`. GREEN
    restored. **Proven RED in `sab.mjs`.** DISCRIMINATES.
  - Sabotage: delete the `id.startsWith("announcements-")` branch in `resolveStateFromDestinationId`
    -> `manualView` falls back to current, guard RED. GREEN restored. **Proven RED in `sab.mjs`.** DISCRIMINATES.
- **R5-e page.tsx + ManualRail.tsx thread `announcementsView`.** page.tsx passes `announcementsView`
  to `<ManualRail>` and to `resolveStateFromDestinationId`, and sets it from `resolved.announcementsView`;
  `ManualRail.tsx` passes `announcementsView` into `getActiveDestinationId`. Instrument: SOURCE-TEXT
  only (nothing renders). Pin the FACT, not the spelling: a source assertion that page.tsx's manual
  slice references `announcementsView` and that `ManualRail` receives it. Direction: RED if the inner
  chip highlight cannot track the selection. **This is ARGUED for runtime correctness** (no render
  here) - recorded as residual RR-2 (owner click-through). Do NOT over-specify the JSX spelling
  (`source-text-tests-overspecify`): assert the identifier appears in the slice, not an exact prop
  string.
- **R5-f persistence: `ANNOUNCEMENTS_VIEW_KEY = "ta-announcements-view"` + initializer + write effect**
  in `useAppNavigation.ts`, mirroring `GRADING_VIEW_KEY` `[READ useAppNavigation.ts:55,373-413,556]`.
  Instrument: add `{constant:"ANNOUNCEMENTS_VIEW_KEY", value:"ta-announcements-view"}` to the `KEYS`
  list in `useAppNavigation.test.ts:151-156`; the existing loops then assert the constant is declared
  (:160) AND written via `localStorage.setItem(ANNOUNCEMENTS_VIEW_KEY,` (:170). Direction: RED if the
  key is declared but never written (picking the chip is forgotten on reload) or vice versa.
  - Sabotage: declare `ANNOUNCEMENTS_VIEW_KEY` but delete its `localStorage.setItem` effect -> the
    `writes each key back` assertion RED. GREEN restored. DISCRIMINATES the persist-ui-control-state
    failure directly.
- **R5-url (F1-URL - RULED live): `announcementsView` is a URL param.** `url-state.ts` gains
  `ANNOUNCEMENTS_VIEW_PARAM="announcementsView"`, `UrlNavState.announcementsView`,
  `normalizeAnnouncementsView` (reuse `isAnnouncementsView`), parse (:398-421 area) and build
  (gated `state.manualView==="announcements" && !== default`, mirror :466-468). `useAppNavigation.ts`
  threads it through `buildUrlSearch` args + dep array + the popstate ladder
  (`if (parsed.manualView==="announcements") setAnnouncementsView(parsed.announcementsView)`,
  mirror :741). Both `DEFAULT_STATE` UrlNavState literals (`url-state.test.ts` and
  `tab-rails.test.ts:271-285`) gain `announcementsView:"post"` - tsc-forced.
  Instrument: a NEW round-trip block in `url-state.test.ts` mirroring the presentationsView block
  (:978-990): a non-default `announcementsView` survives through Announcements and is dropped
  elsewhere. AND extend `emittedParamNames()`'s states list (tab-rails.test.ts:314-335) with a
  `{...DEFAULT_STATE, tab:"manual", manualView:"announcements", announcementsView:"walkthrough"}`
  state AND add `"announcementsView"` to `EXPECTED_PARAM_NAMES` (:296-309) - WITHOUT this the new
  param is uncovered by the frozen oracle (the exact blind spot presentationsView already sits in).

  **MANDATORY source-text pins in `useAppNavigation.ts` (BLOCKER fix - the popstate handler body
  and the URL-sync dep array are production writes R5-url adds with NO other instrument; nothing
  renders under vitest, so these source-text pins are the ONLY possible guards). These are A-W1
  BUILD STEPS, not residuals: deep-link + Back/Forward restoration is the entire reason F1-URL
  beats F1-LOCAL, so it must be INSTRUMENTED, not merely recorded.** The round-trip + emitted-names
  oracle above test the pure url-state round-trip only; they say NOTHING about the popstate handler
  body or the hook's dep array. The presentationsView precedent has THREE source-text guards; (i)
  below is its branch-existence analogue (which this note already relies on), (ii) and (iii) are the
  two that were missing. All three are modelled EXACTLY on the presentationsView analogues
  (`useAppNavigation.ts:625-626,680,737,741`; `useAppNavigation.test.ts:203-215,234-249`), confirmed
  resolvable at HEAD `[MEASURED Grep]`.
  - **(i) branch EXISTS - already covered, now CREDITED (MINOR 1).** The derived I5 guard
    `useAppNavigation.test.ts:203-215` loops `MANUAL_VIEW_ORDER` and, for every view with
    `getInnerDestinations(view)!==null`, requires the popstate slice to contain
    `parsed.manualView === "<view>"`. Once `announcements` is in the order (R2) with a destinations
    group (R5-b), this AUTO-FIRES and forces the `parsed.manualView === "announcements"` popstate
    branch to exist. No new assertion. But it proves only that the branch EXISTS, not that it reads
    the URL - which is exactly why (ii) is needed.
  - **(ii) the popstate branch READS the value.** Add an `it(...)` INSIDE the existing I5 describe
    block, REUSING its `popStateSlice` (whose both-end anchor-resolves is the block's existing
    "finds the popstate handler" test at `:198-201` - `popStateStart > -1` and `popStateEnd >
    popStateStart`), mirroring `:234-236` verbatim:
    `expect(popStateSlice).toContain("parsed.announcementsView")`.
    - Sabotage (named): implement the branch as `setAnnouncementsView("post")` - hardcode, ignore
      the URL -> popstate slice lacks `parsed.announcementsView` -> (ii) RED. Restore to
      `setAnnouncementsView(parsed.announcementsView)` -> GREEN. DISCRIMINATES. Without (ii), I5
      stays GREEN on the hardcode (the branch still exists) and Back/Forward silently fails to
      restore the inner view - the precise silent-green this BLOCKER closes.
  - **(iii) the inner view is in the URL-sync effect DEP ARRAY.** Add an `it(...)` mirroring
    `:238-249` verbatim: `syncEffectStart = source.indexOf("useEffect(() => {\n    const target = buildUrlSearch({")`,
    `depsStart = source.indexOf("}, [", syncEffectStart)`, `depsEnd = source.indexOf("]);", depsStart)`,
    `deps = source.slice(depsStart, depsEnd)`, then `expect(deps).toContain("announcementsView")`.
    SLICE-ANCHOR REQUIREMENT (test seat brief: every slice is anchor-resolved at BOTH ends, else
    `slice(depsStart, -1)` on an unresolved `depsEnd` silently widens to the whole file tail and the
    drop-sabotage below could match `announcementsView` elsewhere and stay GREEN): the precedent
    asserts only `syncEffectStart > -1`, so ADD `expect(depsStart).toBeGreaterThan(-1)` and
    `expect(depsEnd).toBeGreaterThan(depsStart)`. This is the one deliberate strengthening over the
    verbatim precedent; it changes no fact, only closes the silent-widen hole.
    - Sabotage (named): drop `announcementsView` from the URL-sync effect's dep array -> (iii) RED.
      Restore -> GREEN. DISCRIMINATES. Without (iii), picking the inner chip never pushes a history
      entry, so Back/Forward has nothing to restore even with (ii) correct.
  - **Discrimination basis (honest label):** (ii) and (iii) are ARGUED by mirroring the SHIPPED,
    currently-green presentationsView precedent (`:234-249`), which reds under the exact analogous
    mutation - they are NOT re-proven in `sab.mjs` (section 0's scratch ref-impl covered the registry
    construction, not this hook's source text). The anchor strings were MEASURED resolvable at HEAD;
    the sabotage behaviour is argued from the precedent's identical shape, not independently executed
    here.
  Direction: RED if a non-default value leaks onto a non-announcements branch, is not read back, the
  emitted-names oracle disagrees, the popstate branch does not read `parsed.announcementsView` (ii),
  or `announcementsView` is absent from the URL-sync dep array (iii).
  - Sabotage: in `buildUrlSearch`, drop the `state.manualView==="announcements"` guard so the param
    emits on every manual branch -> the "dropped elsewhere" round-trip assertion RED AND the
    emitted-names oracle RED. GREEN restored. DISCRIMINATES.

### R-shell - `AnnouncementsSubTab.tsx` is an EMPTY shell, mounted + reachable, and NO tool has moved
- Object: the new shell + the untouched Recording/LMS surfaces.
- Instrument (empty shell reachable): R4's render-branch canary (above) - green once the empty
  shell is mounted under the announcements guard.
- Instrument (no tool moved - NEGATIVE guard): the EXISTING recording-split canaries must stay
  GREEN UNCHANGED - strip count stays 10, tabpanels 9, `walkannounce` still in the strip
  `[READ recording-split.structure.test.ts:141-147,206-208,238]`; `LMS_VIEWS` still contains
  `announcements` and `validateLmsViewsCompleteness()` still returns `[]`
  `[READ manual-rail.ts:85-93,395-415; manual-rail.test.ts:140-147]`; `CanvasTab`/`page.tsx:590`
  prop unchanged.
- Direction: RED if A-W1 prematurely removes `walkannounce` from the recording strip (recording-split
  RED - strip expects 10) or removes `announcements` from LMS (LMS validator RED).
- Sabotage (out-of-scope move detector): in A-W1, remove `walkannounce` from the recording strip ->
  `recording-split.structure.test.ts` strip-count RED (expects 10, got 9). GREEN restored.
  DISCRIMINATES a tool moved in A-W1 (which belongs to A-W2). This is why `recording-split.structure.test.ts`
  is in the A-W1 gate even though A-W1 does not edit it: it is the fence around "registry only".

---

## 6. The canary-bump list (all in the A-W1 commit)

1. **Count canary A** `tab-rails.test.ts:67` `toHaveLength(11)` -> `12`.
2. **Count canary B** `topLevelTabs.wiring.test.ts:376` `toHaveLength(11)` -> `12`.
3. **Ordered id-list oracle** `tab-rails.test.ts:54-66`: insert `"manual:announcements"` at the
   chosen ordinal (NOT only the length - the architect's flagged advisory).
4. **`MANUAL_VIEW_ORDER` frozen oracle** `manual-rail.test.ts:199-208`: insert `"announcements"` at
   the SAME ordinal; retitle "eight subtabs" -> "nine" (:189) and refresh the ":193" comment.
5. **Storage-key canary** `useAppNavigation.test.ts:151-156`: add
   `{constant:"ANNOUNCEMENTS_VIEW_KEY", value:"ta-announcements-view"}` to `KEYS`.
6. **Stale descriptions (mandated by the task):**
   - `tab-rails.test.ts:53` "the eight Manual views then the three Workflows views" -> nine.
   - `tab-rails.test.ts:105` "so ten items in one row stay distinguishable" -> twelve (ALREADY
     stale at 11; this change makes the fix unavoidable).
   - `tab-rails.ts:37` source comment "Ten chips is a lot" -> twelve.
7. **Stale descriptions (advisory - same drift, flag so the implementer fixes them in the same
   commit rather than leaving an instrument describing a screen that does not exist):**
   `tab-rails.ts:8-9` "Tools is ten items (seven Manual views ...)"; `manual-rail.ts:171` "The seven
   Manual views"; `topLevelTabs.wiring.test.ts:374-375` "Eleven chips ... Eight Manual + three
   Workflows (was ten...)"; `page.tsx:519-523` "the seven Manual views and the three Workflows views
   in a single rail of ten". None is a test assertion; all are stale NOW (the rail is 11, several say
   7/10) and become more stale. Pin the FACT (count), never force the prose.

---

## 7. Executable HERE vs ARGUED (labelled; argued != verified)

**Executable (MACHINE, go red on the sabotage):** R1 (tsc), R2 (frozen order + label), R3 (both
counts + ordered list), R4 (render-branch canary), R5-a/b/c/d (frozen lists, I1 parity, derived
guard), R5-f (storage-key canary), R5-url round-trip + emitted-names oracle + the I5 branch-existence
guard (auto-fires) + the (ii) popstate-read and (iii) dep-array source-text pins (F1-URL), R-shell
negative guard (recording-split + LMS validator). Satisfiability and the REGISTRY sabotages are PROVEN
in section 0; the (ii)/(iii) source-text sabotages are ARGUED from the shipped presentationsView
precedent (`:234-249`), labelled as such in R5-url, not executed in `sab.mjs`.

**ARGUED ONLY (no render under vitest - say so, never assert as verified):**
- R5-e runtime inner-chip highlight tracking the selection (source-text pins the FACT the identifier
  is threaded; it does NOT prove the chip renders or highlights) -> RR-2.
- The ordinal is CORRECT per owner intent (machine pins only prove internal agreement) -> RR-1.
- The empty shell renders a visible container the owner can reach -> RR-2 (R4 proves only that the
  branch exists in source).

Gate (never a raw multi-path vitest - `test-paths` memory, `traps-tests.md`):

```
npm run test:paths -- \
  src/app/components/manual/manual-rail.test.ts \
  src/app/components/tabs/tab-rails.test.ts \
  src/app/components/tabs/topLevelTabs.wiring.test.ts \
  src/app/components/home/useAppNavigation.test.ts \
  src/app/components/recording/recording-split.structure.test.ts \
  src/app/url-state.test.ts
```

(Drop `src/app/url-state.test.ts` only under F1-LOCAL.) Plus `npx tsc --noEmit` (one caller at a time)
- it is the instrument for R1 and the alias-return-object interlock in R5-d. No emojis, LF only, no
`/s` regex flag (`regex-s-flag-fails-tsc`); any comment-strip helper uses a non-enumerated name such
as `withoutLineComments` with the CRLF-safe unanchored `/\/\/.*$/` form (NOT `stripComments`, NOT the
anchored form) - though A-W1's tests need no comment stripping. Do NOT import a helper from another
`*.test.ts` (`no-cross-test-file-imports`); duplicate `DEFAULT_STATE` as the existing files already do.

---

## 8. THE PIN MOST LIKELY TO BE BUILT LOOSE - the ordinal, and why no test can close it

The frozen ordered lists (R2 `manual-rail.test.ts:199-208`, R3 `tab-rails.test.ts:54-66`) are the
primary pins, and they discriminate a WRONG-vs-FROZEN ordinal (proven RED in `sab.mjs`). But they
compare the TEST LITERAL to the BUILT ARRAY. If an implementer appends `announcements` to the END of
`MANUAL_VIEW_ORDER` AND writes the same end position into both test literals, every assertion is GREEN
and the chip is in the wrong place. **Proven: the length-only check went UNEXPECTED-GREEN on exactly
this mutation** (`sab.mjs`), and the ordered-list check is only one notch better - it catches a literal
that DISAGREES with the array, never an array (and matching literal) that disagrees with OWNER INTENT.

Mitigations, in order:
1. The recommended ordinal is stated as a CONSTRUCTION (section 3: index 2, after `content`), so the
   implementer has an unambiguous target rather than a free choice.
2. The machine pins enforce production/literal AGREEMENT - they stop a drift between the two lists.
3. The CORRECTNESS of the ordinal is OWNER-verification residual RR-1 - the owner confirms the chip
   sits where intended on a real click-through. This is named here, not hidden, because treating a
   consistency check as a correctness check is precisely the "instrument that does not measure what it
   claims" failure this seat exists to prevent.

Do NOT "strengthen" this by adding more string assertions about position - a second literal is a second
place to be wrong consistently. The honest instrument is the frozen ORDERED list plus an owner check,
and that is what is specified.

---

## 9. Residual register (owner, instrument, step - missing any one is a deletion)

| ID | Not proven here | Owner | Instrument | Step |
|---|---|---|---|---|
| RR-1 | The ordinal is CORRECT per owner intent (machine pins prove only literal/array agreement) | repo owner | owner click-through on a returning profile | A-W3 owner nav check |
| RR-2 | The empty shell + inner chips RENDER and the inner-chip highlight tracks the selection | repo owner | owner click-through (no component renders under vitest) | A-W3 owner nav check |
| RR-3 | `PRESENTATIONS_VIEW_KEY`'s declare+write is UNGUARDED (omitted from `useAppNavigation.test.ts` `KEYS`) - a pre-existing gap, NOT introduced by A-W1 | loop-implementer / data seat | add `{constant:"PRESENTATIONS_VIEW_KEY", value:"ta-presentations-view"}` to `KEYS` (one line) | optional in A-W1; else a follow-up row |
| RR-4 | The frozen URL param oracle does NOT exercise `presentationsView` (pre-existing blind spot) - A-W1 closes it for `announcementsView` (R5-url) but not for `presentationsView` | loop-implementer / test seat | add a `manualView:"presentations"` state to `emittedParamNames()` + `presentationsView` to `EXPECTED_PARAM_NAMES` | follow-up row (out of A-W1 scope) |
| RR-5 | F1 (URL-param vs localStorage-only) - RULED 2026-10-04: F1-URL (closed; no longer blocking) | repo owner / orchestrator | terminating question in section 2 (answered) | DONE - R5-url is live | 

RR-3 and RR-4 are flagged, not fixed, to keep A-W1 scoped to the announcements registry; each is a
one-to-two-line change the implementer MAY fold in, but neither is required for A-W1 to be correct.

---

## 10. What I opened (so the checker can re-walk)

`docs/DEV_LOOP.md`, `docs/loop/seats.md`, `docs/loop/traps-tests.md`,
`docs/announcements-tab-and-walkthrough-scope.md`;
`src/app/components/manual/manual-rail.ts` (whole), `manual-rail.test.ts` (whole),
`src/app/components/tabs/tab-rails.ts` (whole), `tab-rails.test.ts` (whole),
`src/app/components/tabs/tab-sections.ts` (whole),
`src/app/components/home/useAppNavigation.ts` (whole; round-2 re-measure of the popstate/URL-sync
anchors `:625-626,680,737,741` via `[MEASURED Grep]`), `useAppNavigation.test.ts:130-259` (incl. the
I5 popstate describe block `:193-250` mirrored by pins (ii)/(iii)),
`src/app/page.tsx:510-669`, `src/app/url-state.ts` (whole), `url-state.test.ts` (grep: param/round-trip),
`src/app/components/tabs/topLevelTabs.wiring.test.ts:338-409`.
Not opened (so not claimed): `ManualRail.tsx` body (only its documented role + size 80),
`recording-split.structure.test.ts` beyond the strip/tabpanel count lines cited, `AnnouncementsSubTab.tsx`
(does not exist yet), any rendered pixel or browser behaviour.
