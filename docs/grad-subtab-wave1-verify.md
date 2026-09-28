# GRAD-SUBTAB wave 1 - as-built verify pass

Fresh adversarial verify of the uncommitted wave-1 diff (13 files under `src/app/`,
7 production + 6 test). I did not author it. Read-and-reason pass; the only file I
wrote is this one. No `src/` file was opened for writing, nothing staged, committed
or pushed.

Method note: claims tagged [MEASURED] name the command that produced them. Claims
tagged [READING] are traced from source and cannot be executed here because no
component is rendered by any test in this checkout.

Diff captured with `git --no-pager diff -- src/app/` (1517 lines) [MEASURED].

---

## The three silent-green failures the design exists to prevent

### 1a. Inner-nav accessible name - PREVENTED, confirmed in code

`manual-rail.ts:172` [MEASURED, `grep -n "Grading tools" manual-rail.ts`]:
`grading: { groupName: "Grading", ariaLabel: "Grading tools" }`. `getInnerNavAriaLabel`
returns `entry.ariaLabel`, so it yields the literal `"Grading tools"` for the grading
view (not the old hardcoded `"LMS views"`). `ManualRail.tsx:56` feeds the tablist
`aria-label={getInnerNavAriaLabel(manualView) ?? undefined}` [MEASURED, grep].
I2 (`topLevelTabs.wiring.test.ts`) asserts the source contains
`aria-label={getInnerNavAriaLabel(` and NOT `"LMS views"`; I1 (`manual-rail.test.ts`)
pins `getInnerNavAriaLabel("grading") === "Grading tools"` and label distinctness.
The literal is correct. EMPTY - no defect. (The visible/announced half remains OW-A1,
owner-only, as designed.)

### 1b. `gradingView` URL param round trip - PREVENTED, confirmed both directions

- `UrlNavState.gradingView` exists and is REQUIRED (`url-state.ts:309` in-file; diff).
- `parseUrlState` READS it: `url-state.ts:364`
  `gradingView: gradingPointer ? gradingPointer.gradingView : normalizeGradingView(params.get(GRADING_VIEW_PARAM))`.
- `buildUrlSearch` WRITES it: `url-state.ts:414-416` [MEASURED, `sed -n '400,425p'`],
  gated `state.manualView === "grading" && state.gradingView !== DEFAULT_GRADING_VIEW`,
  nested inside `if (state.toolsSection === "manual")` inside `if (state.tab === "manual")`.
  Non-default only, correct branch. Round-trip and negative-leak covered by I3/I4.
EMPTY - no defect.

### 1c. Back/Forward - PREVENTED, confirmed, and the disclosed vacuous pass is closed

- popstate ladder: `useAppNavigation.ts:638`
  `if (parsed.manualView === "grading") setGradingView(parsed.gradingView);` [MEASURED, read].
- URL-sync effect dependency array: `gradingView` present at `useAppNavigation.ts:573`,
  inside the actual `}, [ ... ]);` deps of the effect that begins at `:526`
  (`const target = buildUrlSearch({...})`) [MEASURED, read full file].
- The disclosed vacuous-pass risk is closed: the I5 dep-array test slices from the
  first `}, [` AFTER the effect start to the next `]);`, and that slice
  (`useAppNavigation.ts:564-578`) contains NO comment carrying the literal
  `gradingView` - only the bare identifier at `:573`. Removing that identifier makes
  the slice not contain `gradingView`, so the guard is non-vacuous. The `gradingView`
  inside the `buildUrlSearch({...})` object (`:536`) sits BEFORE `depsStart`, so it
  cannot make the deps slice pass spuriously.
EMPTY - no defect.

---

## BLOCKER 1 - retired-pointer redirect is missing on the initial-load URL path

CLASS: migration alias applied in one reader but not the parallel reader (the
initial-load initializer). NEW (first appearance in this verify pass; mechanism
echoes MEMORY "verify reachability, not just correctness" and "two unsynced
readers", but no prior finding here shares its corrective rule).
BLOCKER. Label: reasoning-from-reading, on top of two [MEASURED] facts.

`file:line`: `src/app/components/home/useAppNavigation.ts:184-187` (the manualView
initializer's URL branch) and `:326-341` (the gradingView initializer).

Two [MEASURED] facts:
- `parseUrlState` - the ONLY reader that applies `RETIRED_GRADING_POINTERS` - has
  exactly one non-test caller: `useAppNavigation.ts:582`, inside `onPopState`
  [MEASURED, `grep -rn parseUrlState src --include=*.ts --include=*.tsx | grep -v test`].
  It is never called at mount. Initial state comes only from the per-field `useState`
  lazy initializers, which read raw params through `normalizeManualView` /
  `normalizeContentView` (`useAppNavigation.ts:186`, `:245`) - none of which consult
  the alias table.
- `normalizeManualView("repo-grades") === "course-planning"` [MEASURED,
  `url-state.ts:186-188`: `isManualViewType(value) ? value : "course-planning"`, and
  `isManualViewType("repo-grades") === false` after the union swap].

Consequence [READING]:
- Fresh open (no localStorage) of `?tab=manual&manualView=content&contentView=grading`
  (the old LMS Grading bookmark): the URL branch at `:185` fires
  (`urlHasTab && destination.tab === "manual" && toolsSection === "manual"`) and
  returns `normalizeManualView("content") === "content"`; the contentView initializer
  at `:245` returns `normalizeContentView("grading") === "modules"` ("grading" left
  `ContentView`). Net surface: **LMS > Modules, not Grading.**
- Fresh open of `?tab=manual&manualView=repo-grades` (the old Repo Grades bookmark):
  the URL branch returns `normalizeManualView("repo-grades") === "course-planning"`.
  Net surface: **Build Courses, not Grading.**

Both are regressions from pre-change behavior (each URL previously rendered its
grading surface, since `grading` was a `ContentView` and `repo-grades` a
`ManualViewType`). They break the stated requirement that "every existing bookmark
/ shared link ... lands on the [right place]" (architecture 5.5, hop 11, OW-A3).

Why green hides it: `url-state.test.ts` exercises `parseUrlState` directly (the M10
cases pass), but `parseUrlState` is not on the initial-load path; no test renders or
drives the `useAppNavigation` initializers. This is the exact silent-green shape.

Scope of what IS covered (so the fix stays minimal):
- localStorage forms ARE handled in the initializer: `ta-content-view === "grading"`
  at `:174`, `ta-manual-view === "repo-grades"` at `:195`, `ta-active-tab === "grading"`
  at `:213`. So a returning user who has localStorage lands correctly.
- popstate (Back/Forward) IS handled via `parseUrlState`.
- Only initial-load-FROM-URL (a fresh/incognito browser opening an old link) is missed.

Contrast with the model the architecture cites: `RETIRED_TAB_DESTINATIONS` is applied
on initial load through `resolveTabDestination` inside `readNavSource`
(`useAppNavigation.ts:90`), so tab-level legacy links redirect on first load.
`RETIRED_GRADING_POINTERS` has no equivalent hook in the initializer's URL branch.

Shortest fix: in the manualView initializer, before the `:186` return, look up the
raw `manualView`/`contentView` params against `RETIRED_GRADING_POINTERS` exactly as
`parseUrlState:355-362` does, and return `"grading"` on a hit; have the gradingView
initializer read the same pointer's `gradingView`. (Root may be an architecture gap -
E6(v) as written only names the localStorage aliases and assumed `parseUrlState`
covers the URL - so the corrective decision may belong with the architect/owner; the
as-built behavior is nonetheless wrong for the URL case.)

---

## Attacks that returned EMPTY

- **Mount relocation (attack 3).** [MEASURED] The old `ContentTab grading` prop and
  the `manualView === "repo-grades"` branch are gone; `page.tsx:568-585` renders
  `manualView === "grading"` with `gradingView === "repos" ? <RepoGradesTab/> :
  <GradingTab .../>`. The 8 `GradingTab` props (formAction, pending, state, testState,
  copiedKey, onCopy, onOpenPreview, resultsSectionFallbackRef) are byte-identical to
  the removed block (diff, prop-by-prop). `GradingTab.tsx` is NOT in `git status --short`
  (13 files, GradingTab absent) [MEASURED]. Default surface is Submissions
  (`DEFAULT_GRADING_VIEW === "run"`), consistent. EMPTY.
- **Retired-pointer aliases in `parseUrlState` and destination-id resolution
  (attack 2, the non-initializer half).** `RETIRED_GRADING_POINTERS` has 4 entries
  (`manual-rail.ts`); `parseUrlState:355-364` intercepts both URL forms
  (`content-view:grading`, `repo-grades`) before the normalize fallback, with
  `contentView` still resolving to `"modules"` and the canonical value written back by
  `buildUrlSearch`; `resolveStateFromDestinationId` aliases `lms-grading`/`repo-grades`
  destination ids to `grading` at its top (diff). These are correct. The ONLY gap is
  the initial-load initializer (BLOCKER 1).
- **Canary/guard line (attack 4).** Spot-checked GUARDS byte-unchanged in the diff:
  `topLevelTabs.wiring.test.ts` T20/T21/T22/T23 (its only hunk is the added I2 test;
  the `MANUAL_VIEW_ORDER` loop and positional slices are untouched), and
  `useAppNavigation.test.ts` T24/T25 (`:38-62` region not in the diff), and the six
  read-only guards T31-T34/T35 (not in the diff at all) - 9 guards confirmed untouched.
  Positional guards: T23 reads `useAppNavigation.ts`, where the new `gradingView` state
  block was placed after `tasksView` (`:326`), outside the 600-char first-sync window;
  T24 uses `indexOf` anchors over an unchanged region - both anchoring intact.
  Spot-checked CANARIES reflecting the new reality (not deletions): T1/T5/T6/T8
  (manual-rail), T9/T10/T11 (contentTab.wiring, incl. the silent T11 named in a
  comment), T12/T17/T18/T19 (tab-rails), T27/T28/T29/T30 (url-state, T29 substitutes
  the `"grading"` vehicle for `"assignments"` without deleting cases). EMPTY.
- **Implementer's own additions (attack 5).** The url-state alias round-trip tests and
  the I3 negative-leak assertion are correct. `normalizeManualView` does NOT alias
  `repo-grades` to `grading` (it returns `course-planning`); the `repo-grades -> grading`
  redirect lives only in `RETIRED_GRADING_POINTERS`/`parseUrlState`. `repo-grades` is
  fully retired from `ManualViewType`, so there is no live `repo-grades` state for the
  alias to collide with - no silent swallow. EMPTY.

---

## Residuals (non-blocking)

- RES-V1 (cosmetic): `ManualRail.tsx:50` computes `const ariaLabel = getInnerNavAriaLabel(manualView)`
  (used in the `:52` null-guard) but `:56` re-calls `getInnerNavAriaLabel(manualView)`
  in the JSX instead of reusing `ariaLabel`. Harmless duplicate call.
- RES-V2 (pre-existing shape): the `ta-content-view === "grading"` migration at
  `useAppNavigation.ts:174` runs before the URL branch, so for a user whose localStorage
  `ta-content-view` is `"grading"` it overrides the URL. Mirrors the version-control
  migration precedent at `:164`; not made worse by this wave.

---

## Verdict

WAVE 1 DOES NOT LAND AS-IS. One blocker.

Shortest fix list:
1. Apply `RETIRED_GRADING_POINTERS` on the initial-load URL path (the `useAppNavigation`
   manualView + gradingView initializers), so `?...manualView=content&contentView=grading`
   and `?...manualView=repo-grades` opened fresh land on the Grading sub-tab, matching
   `parseUrlState` and the OW-A3 promise. (BLOCKER 1.)

The three silent-green failures 1a/1b/1c are genuinely prevented in code, not merely
asserted. Attacks 3, 4, 5 and the non-initializer half of attack 2 returned empty.

## Stopping point

Remaining unresolved surface is DESIGN/MEASUREMENT: BLOCKER 1 is a
reasoning-from-reading claim about the initial-load URL path, unobservable in this
node-env checkout (no component rendered, no jsdom navigation) and therefore not
provable by any gate here - it is settled only by the fix plus OW-A3 in a real
browser. Whether the correct owner of the fix is the implementer (missed the URL half
of E6(v)) or the architect (E6(v) assumed `parseUrlState` runs at mount) is a
rulings/design question I did not resolve. Everything else (rulings on canary/guard
assignment, the mount relocation, param round trip) verified clean.
