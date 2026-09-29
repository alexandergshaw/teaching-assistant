# Verify: as-built wave-3 diff for Tools > Grading > Drafted Grades (GRAD-SUBTAB)

Fresh adversarial verification of the UNCOMMITTED wave-3 diff, against
`docs/tools-grading-subtab-wave3-architecture.md`, its check
(`-architecture-check.md`, BLOCKER 1 + 4 residuals), and DECISION 18/17/19
(fork = E-full). I did not author the diff. Read-and-reason plus the mechanical
gates; nothing renders here, so every visible/runtime claim is labelled
[READING] and routed to the owner walk. The one file I wrote is this one; no
source was mutated.

## Instruments (every quantity names its command)

| Quantity | Command |
|---|---|
| Diff | `git --no-pager diff -- src/app/` (1246 lines, 10 files) |
| Sizes, counter A | `wc -l <path>` (Bash) |
| Sizes, counter B | `@(Get-Content <path>).Count` (PowerShell) |
| Symbol / value occurrences | `grep -rn`/`grep -rln ... --include=*.ts --include=*.tsx`, each hit opened; never `grep -c`/`grep -P` |
| id collision | `grep -rln '"grading-drafts"' src` |
| Type gate | `npx tsc --noEmit --incremental false` (exit 0) |
| Tests | `npm run test:paths -- <paths>` (COVERED lines confirm no path dropped) |
| Docs gate | `npm run docs:gate` |

## Verdict

**WAVE 3 LANDS AS-IS. 0 BLOCKERS, 3 RESIDUALS (all low, none gating).** The
check's BLOCKER 1 (the returning-user localStorage restore) is FIXED on all
three read paths and instrumented. The `toolsSection` crossing, the E-full
retirement, the badge relocation, the new member, the R-1/R-3 guard fragility,
and the frozen oracle all hold. tsc clean; 20 test files / 659 tests green
across the two `test:paths` runs; docs:gate 49/49; `git status --short` shows
exactly the 10 wave-3 files.

Counts: **BLOCKER 0, RESIDUAL 3.**

---

## Attack 1 - the retired pointer on all three read paths (the wave-1-repeat headline)

**HOLDS on all three paths. Run-and-verified.** The check's BLOCKER 1 fix is
present and correct.

**(a) URL path** - `src/app/url-state.ts`:
- `resolveGradingPointer` gains optional `rawWorkflowsView`/`rawDraftsView`
  (`:350-354`) and matches the drafts-grades shape FIRST in the `??` chain
  (`:357-359`).
- `parseUrlState` reads both raw params (`:383-384`), passes all four to the
  resolver (`:385`), and FORCES `toolsSection: gradingPointer ? "manual" : ...`
  (`:388-396`), plus `manualView`/`gradingView` from the pointer. Confirmed the
  force actually happens on this path (executable test I-retired-drafts,
  `url-state.test.ts:1058-1106`, passes).

**(b) popstate** - `src/app/components/home/useAppNavigation.ts:693-703`: the
handler calls `parseUrlState`, then `setToolsSection(parsed.toolsSection)`
(=`"manual"`), `setManualView("grading")`, and
`if (parsed.manualView === "grading") setGradingView(parsed.gradingView)`
(=`"drafts"`). Lands on manual/grading/drafts. [READING] for the live event,
source-verified.

**(c) initial-load localStorage** - the exact line the derivation MISSED, now
present: `useAppNavigation.ts:166-172`, the `toolsSection` initializer's
localStorage branch, checks all three keys
(`TOOLS_SECTION_KEY==="workflows" && WORKFLOWS_VIEW_KEY==="drafts" &&
"ta-drafts-view"==="grades"`) and returns `"manual"`. Placed AFTER the
`destination.toolsSection !== DEFAULT_DESTINATION.toolsSection` early return
(`:155`) and BEFORE the generic `saved` read (`:173`), so it fires only on that
exact stored triple, not on any stored workflows state. The `manualView`
initializer migrates the same triple to `"grading"` (`:237-243`) and the
`gradingView` initializer to `"drafts"` (`:400-405`). The raw `"ta-drafts-view"`
literal is kept (not `DRAFTS_VIEW_KEY`, which E-full deleted).

`page.tsx` discriminant confirmed: it renders on `toolsSection` -
`{toolsSection === "manual" && ...}` vs
`{toolsSection === "workflows" && <WorkflowsPanel/>}` (`page.tsx:662`), so
forcing `toolsSection` is what actually moves the landing. Verified.

**The source-text pin can fail (not vacuous).** `useAppNavigation.test.ts:189-217`
slices the `toolsSection` initializer block and asserts the three
`localStorage.getItem(...) === ...` checks by tight regex. Removing the
migration block reddens all three (nothing else in that block references
`WORKFLOWS_VIEW_KEY` or `"ta-drafts-view"`). Note: the fourth assertion
(`/if\s*\(\s*[\s\S]{0,200}?return\s+"manual"/`, `:210-215`) is LOOSE - it also
matches the URL-branch `if (gradingPointer) return "manual"` at `:151`, so it
alone proves nothing - but the three key-name assertions carry the pin. See
RESIDUAL V-1.

## Attack 2 - the badge (R-2, no gate instrument)

**HOLDS - relocated, did not vanish.** `page.tsx:355-361`, `toolsRailOptions`:
the Drafts chip count narrowed to `draftsMessagesCount` (was `draftsInbox`), and
`item.id === manualRailItemId("grading")` carries `draftsGradesCount`. Both
counts still sourced from `useDraftedGradesInbox()` (`page.tsx:71`,
`gradesCount`/`messagesCount`), independent of the tab mount. The target id is a
real rendered chip: `TOOLS_RAIL_ITEMS` is built from `MANUAL_VIEW_ORDER` via
`manualRailItemId` (`tab-rails.ts:133-140`), `MANUAL_VIEW_ORDER` contains
`"grading"` (`manual-rail.ts:147-155`), so `manual:grading` is in the rail.
`manualRailItemId` imported (`page.tsx:48`). Whether a badge visibly paints on
the grading chip is [READING] -> OW-W3-4 (the Drafts chip used the identical
`count` field, so the same rendering applies).

## Attack 3 - E-full coherence (DECISION 19)

**HOLDS - no dangling consumer.** `grep -rn 'draftsView\|DraftsView' src
--include=*.ts --include=*.tsx | grep -v .test.ts` returns only: comments; the
legitimate raw-param reads `params.get("draftsView")` /
`urlParams.get("draftsView")` (`useAppNavigation.ts:149/227/385`); and
`url-state.ts`'s retained-for-reading `DRAFTS_VIEW_PARAM="draftsView"` (`:292`,
read at `:384`, used at `:385`) - the private legacy-param the task allows.
Per-symbol greps for `normalizeDraftsView`, `isDraftsView`, `setDraftsView`,
`onDraftsViewChange`, `DRAFTS_VIEW_VALUES`, `DEFAULT_DRAFTS_VIEW`,
`DRAFTS_VIEW_KEY` in production: ZERO code hits (only comment mentions in
`useAppNavigation.ts`, `page.tsx`, `drafts-nav.ts`). No consumer switches on
`draftsView`. `WorkflowsPanel.tsx` (41 lines, was 83) renders
`{workflowsView === "drafts" && <MessageDraftsTab onOpenWorkflow={onOpenWorkflow}/>}`
directly (`:38`); message drafts still work ([READING], `drafts-nav.test.ts`
passes 3/3). `DRAFTS_VIEW_PARAM` is not lint-dead (used at `:385`).

## Attack 4 - the R-3 guard fragility (indexOf collision)

**HOLDS - guard resolves to the correct run/repos block, green for the right
reason.** `topLevelTabs.wiring.test.ts:579` does
`source.indexOf('manualView === "grading" &&')`. First occurrence in `page.tsx`
is the run/repos render at `:619`
(`{manualView === "grading" && (gradingView === "run" || gradingView === "repos") && (`);
`end = indexOf("</TabShell>", start)` lands on the run/repos block's own
`</TabShell>` at `:635`; the slice contains
`gradingView === "run" || gradingView === "repos"`, matching the regex. The
`refreshDrafts` effect at `:233` writes
`... gradingView === "drafts" && manualView === "grading";` - `manualView ===
"grading"` is the LAST clause (followed by `;`, not ` &&`), so it does NOT
create an earlier `manualView === "grading" &&` match. The drafts mount at
`:649` DOES contain `manualView === "grading" &&`, but it is AFTER `:619`, so
indexOf never reaches it. The drafts mount is a bare conditional OUTSIDE any
`page.tsx` `<TabShell>` (`:649-651`; DraftedGradesTab self-wraps). Guard passes
authentically (confirmed: `topLevelTabs.wiring.test.ts` 30/30 green).

## Attack 5 - the mount (I-drafts-mount, R-4)

**HOLDS.** `page.tsx:649-651` is a bare conditional sibling after the run/repos
`</TabShell>`, not TabShell-wrapped. I-drafts-mount
(`topLevelTabs.wiring.test.ts:603-623`) asserts presence, exactly one render
site, the `manualView === "grading" ... gradingView === "drafts"` guard, and -
explicitly NOT modelled on `assertAlwaysMounted` - `.not.toMatch(/display:\s*[\s\S]{0,40}?"none"/)`
(a plain conditional, not a display toggle). Passes. R-1 clause unaffected
(above). Verified.

## Attack 6 - the new member flows through

**HOLDS.** `manual-rail.ts`: `GradingView` gains `"drafts"` (`:35`),
`GRADING_VIEW_PRESENCE.drafts:true` (`:41`, tsc-forced), destination
`{id:"grading-drafts", label:"Drafted Grades", ...}` (`:120`), resolver branch
`if (id === "grading-drafts") return "drafts"` (`:333`), retired pointer
`"drafts-view:grades": {manualView:"grading", gradingView:"drafts"}` (`:272`).
id collision-free: `grep -rln '"grading-drafts"' src` = 2 files
(`manual-rail.ts`, `manual-rail.test.ts`) only. The derived `GRADING_VIEWS` loop
(`manual-rail.test.ts:322-334`) auto-covers `"drafts"` and passed - which also
proves `getActiveDestinationId` stayed generic (`grading-${gradingView}`,
unedited; a missing branch would redden that guard). Exact-list canaries went
4->5 ids and 4->5 labels (`manual-rail.test.ts:241/377-390`). All green (66/66).

## Attack 7 - the frozen oracle

**HOLDS.** `tab-rails.test.ts` `EXPECTED_PARAM_NAMES` shrank 12->11 (`draftsView`
removed, `:301` region) and `DEFAULT_STATE.draftsView` dropped (`:280`). This is
correct: `buildUrlSearch`'s drafts branch was deleted (`url-state.ts:453-456`,
the `if (state.workflowsView === "drafts" && ...) params.set(DRAFTS_VIEW_PARAM
...)` block is gone), and `UrlNavState.draftsView` is removed (`:308` region),
so `draftsView` is genuinely no longer emitted. Not masking a param that should
persist. `tab-rails.test.ts` 29/29, `url-state.test.ts` 87/87 green.

## Collateral / hygiene

**Clean.** `git status --short` = exactly the 10 wave-3 files.
`git status --short docs/css-orphans.md` = empty (the three `git checkout --`
of that test-regenerated doc left it clean; no wave-3 work collateral-damaged).
The CSS-orphan pair (RES-W3-3) runs GREEN
(`page-module-css-classes.test.ts` 8/8, `page-module-css-orphan-classes.test.ts`
8/8) - removing the WorkflowsPanel tablist orphaned no class.

---

## Residuals (none gating)

- **RESIDUAL V-1 - measurement (the manualView/gradingView localStorage
  migrations are uninstrumented).** The BLOCKER-1 fix added a source-text pin
  for the `toolsSection` localStorage migration only; the symmetric `manualView`
  (`useAppNavigation.ts:237-243`) and `gradingView` (`:400-405`) localStorage
  migrations have no source-text pin and are not executed here (node-env, no
  render). The code is correct now, but a future edit deleting either would stay
  green and silently land a returning user on Build Courses / the "run" default.
  This mirrors the pre-wave-1 pattern (the wave-1 pins covered URL branches
  only), so it is not introduced by this wave. Owner/next-nav-chunk.
- **RESIDUAL V-2 - the toolsSection pin's 4th assertion is loose.** Documented
  under Attack 1; the three key-name assertions carry it, so the pin is not
  vacuous, but the `return "manual"` regex also matches `:151` and should be
  tightened (anchor it to the `WORKFLOWS_VIEW_KEY` branch) if the file is
  revised. Cosmetic.
- **RESIDUAL V-3 - `drafts-nav.ts` docstring stale.** `src/lib/drafts-nav.ts:15/38`
  still narrate `setDraftsView("messages")`, which `page.tsx` no longer calls
  (E-full dropped the fourth setter, `page.tsx:210`). Comment-only; already noted
  by the derivation's check. No code effect.

## Owner-walk-only (this closes GRAD-SUBTAB; these cannot be settled here)

- **OW-W3-1** - the inner nav shows "Drafted Grades" rendering the surface;
  inner tablist accessible name still "Grading tools" (INNER_NAV unedited).
- **OW-W3-2** - a returning user (old URL / legacy URL / stored triple) plus
  Back/Forward actually lands on Tools > Grading > Drafted Grades and the address
  bar rewrites to canonical. Source-verified on all three paths; only the owner
  can confirm the live redirect.
- **OW-W3-3** - Workflows > Drafts shows Message Drafts directly (no degenerate
  one-item tablist); "Saved to drafts" link still reaches it.
- **OW-W3-4** - the grading-drafts badge paints on the Grading chip and the
  Drafts chip badges message drafts only. Wired in code (Attack 2); rendering is
  [READING].

## Stopping point

**Nothing** blocks the ship. Rulings: none in question (DECISION 17/18/19 and
waves 1-2 untouched; the diff reopens nothing). Design: sound - the missed
read-path from round 1 is fixed on all three paths. Measurement: one low
residual (V-1, the two symmetric localStorage migrations are uninstrumented) and
one cosmetic (V-2). Everything the mechanical gates can settle here ran and held:
tsc exit 0, 20 test files green, docs:gate 49/49, both size counters agree, git
status shows only the 10 files. Wave 3 is dispatchable/shippable as-is; the four
OW items are the owner's final visual pass and close the row.
