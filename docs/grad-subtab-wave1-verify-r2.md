# GRAD-SUBTAB wave 1 - ROUND-2 verify of the blocker fix

Fresh adversarial check of the round-2 revision (the fix for round-1 BLOCKER 1:
the retired-pointer alias not applied on the initial-load-from-URL path). I did
not author the fix. Read-and-reason pass; the only file I wrote is this one. No
`src/` file was left mutated (one sabotage mutation applied and restored by md5,
below).

Method: claims tagged [MEASURED] name the command. Claims tagged
[READING] are traced from source and cannot execute here (node-env vitest, no
component rendered, no jsdom navigation).

Gate results, all this checkout:
- `npx tsc --noEmit --incremental false` -> exit 0 [MEASURED].
- `npm run test:paths -- src/app/components/home/useAppNavigation.test.ts src/app/url-state.test.ts`
  -> 2 files, 103 tests passed; both paths reported COVERED [MEASURED].
- `npm run docs:gate` -> 3 files, 49 tests passed, exit 0 [MEASURED].
- Sizes agree across tools: `wc -l` and `@(Get-Content).Count` both give
  url-state.ts 462, useAppNavigation.ts 717, useAppNavigation.test.ts 324,
  manual-rail.ts 330 [MEASURED]. All under the 1000 ceiling.

The fix touches exactly three files, all in the 13-path wave-1 write set:
`src/app/url-state.ts`, `src/app/components/home/useAppNavigation.ts`,
`src/app/components/home/useAppNavigation.test.ts`.

---

## 1. The factoring did not change parseUrlState - CONFIRMED

`resolveGradingPointer` (`url-state.ts:349-359`) checks the same two keys in the
same precedence the inline lookup did:
- first: `RETIRED_GRADING_POINTERS[`content-view:${rawContentView}`]` guarded by
  `rawManualView === "content" && rawContentView !== null`;
- then via `??`: `RETIRED_GRADING_POINTERS[rawManualView]` guarded by
  `rawManualView !== null`.

The two null guards are behaviorally inert versus the described inline form
[READING]:
- `rawManualView === "content"` with `rawContentView === null`: guarded branch
  yields undefined; an unguarded `content-view:${null}` lookup would key
  `"content-view:null"`, also undefined. Same.
- `rawManualView === null`: second branch yields undefined; an unguarded
  `POINTERS[null]` keys `"null"`, also undefined. Same. (The guards exist for
  tsc, since the raw params are `string | null`.)
- The `??` fall-through when `rawManualView === "content"` and the first lookup
  misses reaches `POINTERS["content"]`, and `"content"` is not a key in the
  table (`manual-rail.ts:238-249`), so it is undefined - identical to an inline
  ternary that returned only the first branch. Same.

`parseUrlState` (`url-state.ts:361-393`) computes `gradingPointer` once from the
raw params and its output expressions are unchanged from the round-1-verified
form: `manualView: gradingPointer ? gradingPointer.manualView :
normalizeManualView(rawManualView)` (`:383`) and `gradingView: gradingPointer ?
gradingPointer.gradingView : normalizeGradingView(params.get(GRADING_VIEW_PARAM))`
(`:387`). Traced for the four required URLs [READING]:
- `?manualView=repo-grades` -> pointer `{grading, repos}` -> manualView
  "grading", gradingView "repos".
- `?manualView=content&contentView=grading` -> pointer `{grading, run}` ->
  manualView "grading", gradingView "run".
- `?manualView=grading&gradingView=repos` -> no pointer (`"grading"` is not a
  table key) -> manualView `normalizeManualView("grading")` = "grading",
  gradingView `normalizeGradingView("repos")` = "repos".
- no-pointer URL (`...contentView=modules`) -> no pointer -> normalizers apply
  as before.

The 84 url-state.test.ts cases pass [MEASURED], corroborating. No behavior
change. EMPTY - no defect.

## 2. The blocker is fixed at the initial-load path - CONFIRMED

Both initializers now consult the alias before the plain normalizer [READING]:
- manualView initializer URL branch (`useAppNavigation.ts:186-198`): inside
  `if (urlHasTab && destination.tab === "manual" && toolsSection === "manual")`,
  it calls `resolveGradingPointer(urlParams.get("manualView"),
  urlParams.get("contentView"))` and `if (gradingPointer) return
  gradingPointer.manualView;` before the `normalizeManualView` fallback.
- gradingView initializer URL branch (`useAppNavigation.ts:344-354`): same call,
  `if (gradingPointer) return gradingPointer.gradingView;` before
  `normalizeGradingView(urlParams.get("gradingView"))`.

Trace for a fresh browser (no localStorage) [READING]:
- `?tab=manual&manualView=repo-grades`: toolsSection resolves to "manual"
  (default), destination.tab "manual", urlHasTab true -> manualView branch
  fires, pointer `{grading, repos}` -> manualView "grading". gradingView
  initializer then sees `manualView === "grading"` true (lazy initializers run
  in declaration order, manualView at `:160` before gradingView at `:338`),
  same pointer -> gradingView "repos". Lands Grading > Repo Grades. Correct.
- `?tab=manual&manualView=content&contentView=grading`: pointer `{grading, run}`
  -> manualView "grading"; gradingView branch -> "run". Lands Grading >
  Submissions. Correct.

The `gradingView` half is genuinely independent: `normalizeGradingView(null)`
alone would yield "run" for the repo-grades bookmark, but the branch prefers the
pointer's `gradingView` ("repos") first (`:352-353`). Confirmed. Also confirmed
no leak: with manualView redirected to "grading", the contentView initializer's
`manualView === "content"` branch (`:256`) does not fire, and buildUrlSearch's
first sync canonicalizes the address bar to `?tab=manual&manualView=grading`
(+`&gradingView=repos` when non-default), the intended redirect. EMPTY.

## 3. Precedence (localStorage grading migration before URL branch) - RESIDUAL, SOUND

The `VIEW_KEY === "grading"` migration (`useAppNavigation.ts:175-178`) runs
before the URL branch, exactly mirroring the `version-control` migration above
it (`:165-168`). A user with stale `ta-content-view="grading"` who opens a URL
naming a different LMS view is sent to Grading rather than the URL's target
[READING]. This is:
- identical in shape to the already-shipped version-control precedent;
- a one-time event (the block rewrites VIEW_KEY to "modules" on fire);
- NOT worsened by the round-2 fix: the new alias code lives inside the URL
  branch, which runs strictly after this migration, so it cannot change the
  precedence. The migration block itself was added in the wave-1 build, and was
  already recorded as RES-V2 in round 1.

Nothing lands "somewhere neither source intended": the destination is what
localStorage intended (Grading). This is RES-V2, unchanged. Precedence is sound
as designed. RESIDUAL (owner: product; instrument: real-browser AC3 check;
step: OW-A3 owner verification). Not a blocker.

## 4. The new test can fail and tests the right seam - CONFIRMED

The describe block (`useAppNavigation.test.ts:261-324`) has both halves:
- Behavioral (`:262-271`): `resolveGradingPointer("content","grading")` ->
  `{grading, run}`; `resolveGradingPointer("repo-grades", null)` ->
  `{grading, repos}`; two negatives return undefined. Targets match the pointer
  table. Correct.
- Wiring, source-text (`:273-303` manualView, `:305-323` gradingView): slices
  each initializer block by unique anchors and asserts the URL branch matches
  `/resolveGradingPointer\(\s*urlParams\.get\("manualView"\),\s*urlParams\.get\("contentView"\)\s*\)/`
  and `/if\s*\(gradingPointer\)\s*return\s+gradingPointer\.(manualView|gradingView)/`.

Non-vacuous, PROVEN by mutation [MEASURED]: I `cp`-backed up
useAppNavigation.ts (md5 d8e6fa5bfb3a57dba0f2e3bf493c403b), deleted only the two
code lines from the manualView URL branch while LEAVING the surrounding comment
that mentions "resolveGradingPointer helper" in prose, and ran
`npm run test:paths -- .../useAppNavigation.test.ts`: 1 failed / 18 passed, the
failure at `:297` (the call regex). The comment's prose reference does NOT
satisfy the regex because it requires `resolveGradingPointer(` immediately
followed by the `urlParams.get(...)` argument pattern - so the exact vacuous-pass
shape that defeated round-1's dep-array guard is closed here. Restored from
backup; md5 re-matched d8e6fa5bfb3a57dba0f2e3bf493c403b. The test pins the
wiring (the half that broke), not merely the pure function. EMPTY.

## Write set - CONFIRMED

`git status --short` [MEASURED]: 13 modified `src/` files, exactly the wave-1
set; the only untracked entry is `docs/grad-subtab-wave1-verify.md` (round-1
report). `GradingTab.tsx` does not appear. No new `src/` file was added.

## Attacks run and returned EMPTY

- Factoring equivalence across the four required URLs (section 1). EMPTY.
- `??` precedence when both alias branches could match (`repo-grades` +
  `contentView=grading` hand-typed): second branch wins, `{grading, repos}`,
  matching inline. EMPTY.
- Initializer ordering hazard (gradingView reads resolved manualView): lazy
  initializers run in declaration order, manualView first. EMPTY.
- No-`?tab` bookmark `?manualView=repo-grades`: not redirected, but buildUrlSearch
  always emits `tab=` (`:411`), so no app-generated bookmark ever lacked it; this
  matches how every manualView has always been gated on urlHasTab, not a
  regression and not introduced by the fix. EMPTY.
- popstate redirect path (`:659` `if (parsed.manualView === "grading")
  setGradingView(parsed.gradingView)`): unchanged, parseUrlState delegates to the
  equivalent helper. EMPTY.
- Required `gradingView` field on UrlNavState reaching all consumers
  (buildUrlSearch, URL-sync object, deps array, popstate): all present; tsc
  exit 0 would catch a miss. EMPTY.
- Test anchor uniqueness (block/urlBranch slices resolve to a single location
  each; identical `resolveGradingPointer` call in the manualView block is outside
  the gradingView slice). EMPTY.

---

## Verdict

DOES WAVE 1 (build + fix) LAND: YES.

- Blockers: 0.
- Residuals: 1 (RES-V2, precedence; pre-existing, unchanged, owner-settled at
  OW-A3). Round-1's RES-V1 (duplicate `getInnerNavAriaLabel` call,
  `ManualRail.tsx:56`) is outside the fix's three files and unchanged.
- Round-1 BLOCKER 1 (class: "migration alias applied in one reader but not the
  parallel initial-load reader") is fixed: both initializers now call the shared
  `resolveGradingPointer` before the plain normalizer, the extraction into that
  shared helper is behavior-preserving for `parseUrlState`, and the new test
  fails when the wiring is reverted.

No new blocker introduced by the fix.

## Stopping point

NOTHING remains for an agent here. The only open item is a MEASUREMENT residual
by construction: sections 2 and 3 are reasoning-from-reading about the
initial-load URL path and the localStorage precedence, unobservable in this
node-env checkout (no component rendered, no jsdom navigation), settled only by
OW-A3 in a real browser - already an owner-only line, not a defect. All executed
gates (tsc, the two vitest paths, docs:gate, the sabotage mutation) are clean.
