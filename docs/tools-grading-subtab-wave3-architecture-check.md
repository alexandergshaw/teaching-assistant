# Check: wave-3 derivation for Tools > Grading (GRAD-SUBTAB)

Adversarial check of `docs/tools-grading-subtab-wave3-architecture.md`, round 1 of
the WAVE-3-DERIVATION activity. Fresh checker; did not author the derivation.
Consumer is an implementer. Read-only: no source, code, or other doc was edited;
the one file written is this check.

**Tree.** HEAD `b899d19` (past the derivation's baseline `33a08c8`; a concurrent
accessibility-scans RLS migration landed in between). `git diff --name-only
33a08c8 b899d19` touches NO wave-3 file, so the derivation's measurements on
`33a08c8` are valid against the current tree - every cited line matched when I
opened it (`GradingView` at manual-rail.ts:33, `DraftsView` at url-state.ts:86,
`resolveGradingPointer` at :349-359, `RETIRED_GRADING_POINTERS` at
manual-rail.ts:244-255, etc.). `git status --short` at start and end: empty.
`npm run docs:gate`: PASS (3 files, 49 tests).

## Verdict

**WAVE 3 IS NOT DISPATCHABLE AS DERIVED. 1 BLOCKER, 4 RESIDUALS.** The
feasibility core (the `toolsSection` crossing needs no `tab-rails.ts` /
`tab-sections.ts` edit; conditional mount not always-mounted; id free; E-full
code closure complete) is CORRECT and verified. The blocker is a single missing
read-path edit point plus its missing instrument - the exact class the
derivation's own section 3.3 claims to have learned from - and the fix is a
bounded round-2 transcription, not a redesign.

Counts: **BLOCKER 1, RESIDUAL 4.**

## BLOCKER 1 - the returning-user localStorage restore lands on the wrong family

**CLASS: retired-pointer-missed-on-a-read-path (initial-load, the governing
`toolsSection` discriminant, localStorage sub-path).**
**REPEAT-OF the wave-1 shipped blocker** ("the initial-load path bypassed the
alias resolution the popstate path had"). Same mechanism, same corrective rule:
apply the pointer treatment to EVERY initial-load initializer that governs the
landing - including the discriminant - on BOTH the URL and the localStorage
sub-paths. **BLOCKER.**
**file:line:** the missing edit is in `src/app/components/home/useAppNavigation.ts:138-148`
(the `toolsSection` initializer's localStorage branch); the derivation's omission
is `docs/tools-grading-subtab-wave3-architecture.md` P3(iii) and the section 3.3
read-path table.

**The trace** (labelled [READING] - no component renders here; this is a
source-traced state-init walk). A returning user who last sat on Drafts > Grades
carries, persisted by useAppNavigation's own effects (:462, :474, :490):

- `ta-active-tab = "manual"`, `ta-tools-section = "workflows"`,
  `ta-workflows-view = "drafts"`, `ta-drafts-view = "grades"` [MEASURED,
  key names at useAppNavigation.ts:57/55/64; persist effects at :473-475/:489-491].

On a bare load (no `?tab=` param), the state initializers run top-to-bottom:

1. `toolsSection` initializer (:138-148): `urlHasTab` false; `ta-active-tab="manual"`
   resolves to the default destination whose `toolsSection` IS the default, so the
   first `if` is skipped; `saved = localStorage.getItem("ta-tools-section") = "workflows"`;
   `isToolsSection("workflows")` is true -> **returns `"workflows"`.**
2. `manualView`/`gradingView` initializers: even if P3(iii)'s localStorage
   migrations fire and return `"grading"`/`"drafts"`, they do not touch
   `toolsSection` (initializers are independent `const`s, and `toolsSection`
   is computed above them).
3. `page.tsx` renders on `toolsSection`: `{toolsSection === "manual" && ...}`
   (:513) is false; `{toolsSection === "workflows" && <WorkflowsPanel .../>}`
   (:620) is TRUE. WorkflowsPanel with `workflowsView="drafts"` renders (E-full)
   `<MessageDraftsTab>`.

**Result: the user lands on Workflows > Drafts > Messages, not Tools > Grading >
Drafted Grades.** The first URL sync then builds `?tab=manual&toolsSection=workflows&workflowsView=drafts`
from that (wrong) state and stamps the address bar with it - so the wrong landing
is also made canonical. This is precisely the "silent wrong landing" section 3.3
declares the treatment exists to prevent ("Without it ... landing the user on
Drafts > Messages"). The derivation's write set prevents it on the URL path only.

**Why the derivation misses it.** P3(ii) forces `toolsSection:"manual"` but scopes
it in prose to "for a drafts-grades URL" (the parenthetical cites the URL branches
at :186/:344). P3(iii) then enumerates the localStorage migration as landing in
"the manualView initializer (:200-227) and gradingView initializer (:356-361)" -
NOT the `toolsSection` initializer. Section 3.3's read-path table has three rows
(popstate/parse, initial-load manualView, initial-load gradingView) and no row for
the `toolsSection` localStorage sub-path. Since `toolsSection` is the discriminant
that decides which family renders, migrating the other two while leaving it stored
as `"workflows"` renders the manualView/gradingView migrations dead.

This holds under BOTH dispositions (E-full deletes `"grades"`; E-min normalizes it
to `"messages"`) and under DECISION 19's E-full, so it is not disposition-dependent.

**No instrument catches it.** `useAppNavigation.test.ts` is source-text only
(vitest renders nothing here); its BLOCKER-1 wiring pins (`:273-320`) assert the
manualView and gradingView initializer branches and the 2-arg
`resolveGradingPointer` shape (regexes at :297/:319), but NOTHING pins the
`toolsSection` initializer. The derivation's proposed I-retired-drafts is a
"parse+build round trip" (url-state.test.ts, executable) plus those two wiring
pins - so the localStorage `toolsSection` path is uninstrumented on top of being
unspecified.

**Shortest fix (bounded, round-2 transcription - the file is already in the write
set):**
1. Add to the `toolsSection` initializer (:138-148) a stored-drafts-grades
   migration: when `ta-tools-section==="workflows" && ta-workflows-view==="drafts"
   && ta-drafts-view==="grades"`, return `"manual"` (symmetric to the manualView/
   gradingView localStorage migrations P3(iii) already specifies, and it fires only
   on that exact stored combination, so it is low-risk). Note the raw
   `"ta-drafts-view"` string must stay readable even after E-full deletes
   `DRAFTS_VIEW_KEY` - keep the literal or a retained constant.
2. Commission a source-text instrument in `useAppNavigation.test.ts` pinning that
   the `toolsSection` initializer forces `"manual"` for the stored drafts-grades
   shape, symmetric to the existing BLOCKER-1 wiring pins at :273-320.
3. Add the `toolsSection`-localStorage row to the section 3.3 read-path table so
   the enumeration is complete.

## What ran and held (attacks to source)

- **Attack 1 - the `toolsSection` crossing needs no rail/section edit: HOLDS.**
  `TOOLS_RAIL_ITEMS` (tab-rails.ts:132-149) is derived from `MANUAL_VIEW_ORDER`
  and `WORKFLOWS_VIEW_ORDER`; wave 3 changes neither (grading stays in
  MANUAL_VIEW_ORDER:135-143, drafts stays in WORKFLOWS_VIEW_ORDER:109), so the rail
  chip set is unchanged and `tab-rails.ts`/`tab-sections.ts` are genuinely out of
  the write set. The new `gradingView` member does NOT reach the top rail at all -
  it is an INNER destination under the unchanged `manual:grading` chip, rendered
  via `getInnerDestinations("grading")`, so no rail derivation is bypassed.
  `manualRailItemId("grading")` (tab-rails.ts:118) exists, so badging the Grading
  chip (attack 4) is mechanically reachable.
- **Attack 2 - the retired-pointer crossing, URL paths: HOLD; localStorage path:
  BLOCKER 1.** Canonical (`?tab=manual&toolsSection=workflows&workflowsView=drafts&draftsView=grades`)
  and legacy (`?tab=workflows&...`) URLs both land correctly IF the three specified
  URL edits land (toolsSection URL force in parseUrlState:381 and in the initializer;
  resolveGradingPointer gains `rawWorkflowsView`/`rawDraftsView`; manualView/gradingView
  URL branches pass them). Init order (toolsSection at :138 before manualView at
  :160 before gradingView at :338) makes the forced `"manual"` visible to the
  downstream gates - verified. The localStorage sub-path is the gap (above).
- **Attack 3 - conditional mount, not always-mounted: HOLDS (run-and-empty).**
  `grep -n "getUserMedia|MediaRecorder|MediaStream|WebSocket|EventSource|addEventListener|setInterval|RECORDING_LAUNCH" src/app/components/DraftedGradesTab.tsx`
  returns EMPTY - no live capture. It takes exactly `{ onOpenWorkflow }`
  (DraftedGradesTab.tsx:90, optional) and self-wraps `<TabShell>` (:420 `return (`
  / `<TabShell>`), so it mounts bare as a plain conditional sibling. The I-W2
  always-mounted guard (topLevelTabs.wiring.test.ts:516-564) names only
  `GradingRecordingPanel`/`SnapshotGradingPanel`, so a separate DraftedGradesTab
  mount leaves it green - verified. Giving it wave 2's always-mounted treatment
  would be wrong, as the derivation says.
- **Attack 4 - the badge: handled, with a measurement gap (see RESIDUAL R-2).**
  `draftsGradesCount` badges the removed "Grades" button (WorkflowsPanel.tsx:59);
  the relocation is in the write set (P4b(iv), page.tsx:333-337) and mechanically
  possible via `manualRailItemId("grading")`. Real regression risk, but flagged
  and dispositioned to OW-W3-4.
- **Attack 5 - write-set closure / caller rule: HOLDS.** The new mount lands in
  `page.tsx` (P4a) and the old mount is removed in `WorkflowsPanel.tsx` (P5); both
  present. `DraftedGradesTab.tsx` correctly NOT written (only `onOpenWorkflow`
  needed, supplied by `openWorkflow` at page.tsx:309/632). `GradingTab.tsx`
  untouched and unreferenced by any edit point - verified.
- **Attack 6 - the new member flows through: HOLDS (run-and-empty).**
  `grep -rn '"grading-drafts"' src` = 0 files (id free). The derived guard
  `manual-rail.test.ts:322-334` iterates `GRADING_VIEWS` with 5th arg `"run"`, so a
  `"drafts"` member with no resolver branch falls back to `"run" != "drafts"` ->
  RED; it auto-covers and forces the P1(iv) branch. `getActiveDestinationId`'s
  grading branch is the generic `` `grading-${gradingView}` `` (manual-rail.ts:227)
  - no edit. The exact-list canaries are at :238-245 and :377-390 (currently 4 ids/
  labels) - CANARY to 5, as claimed.
- **Attack 7 - E-full coherence: HOLDS (closure complete).**
  `grep -rln "draftsView|DraftsView" src --include=*.ts --include=*.tsx` (non-test)
  returns exactly `useAppNavigation.ts, WorkflowsPanel.tsx, page.tsx, url-state.ts,
  drafts-nav.ts`. The first four are all in the write set; `drafts-nav.ts`'s
  matches are comment-only (its `openMessageDrafts()` carries no payload and no
  code `draftsView` reference) - so it is correctly NOT written (its docstring goes
  stale, cosmetic). Test-file references live only in `url-state.test.ts` (34) and
  `tab-rails.test.ts` (6, incl. `EXPECTED_PARAM_NAMES` at :299 and `DEFAULT_STATE`
  at :280) - both in the gate list and both flagged CANARY. No dangling `draftsView`
  consumer survives E-full.

## Residuals (none blocking)

- **RESIDUAL R-1 - `resolveGradingPointer` arity churn (tsc-caught).** The new
  `rawWorkflowsView`/`rawDraftsView` params must be optional, or the existing 2-arg
  behavioral calls (`useAppNavigation.test.ts:264/266`, and url-state.test.ts
  cases) stop compiling. tsc catches it; note it so the implementer makes the two
  new params optional rather than churning every call site.
- **RESIDUAL R-2 - badge relocation has no gate instrument.** If the implementer
  omits the Grading-chip count, `draftsGradesCount` silently vanishes (nothing
  renders here). In the write set with a default and routed to OW-W3-4; make the
  relocation mandatory in the brief, not merely "flagged".
- **RESIDUAL R-3 - the R-1 guard's `indexOf` collision, unanalyzed.**
  `topLevelTabs.wiring.test.ts:572-585` does `source.indexOf('manualView === "grading" &&')`;
  after the drafts mount (`{manualView === "grading" && gradingView === "drafts" && ...}`)
  is added there are TWO occurrences. It stays green by slice mechanics whether the
  drafts mount is before or after the run/repos block (the slice runs to the next
  `</TabShell>`, which is the run/repos block's) - BUT only because the derivation
  correctly forbids wrapping the drafts mount in a page.tsx `<TabShell>`. If an
  implementer adds a page.tsx `<TabShell>` around it, R-1 breaks. Adequately
  specified (self-wrap); note the fragility.
- **RESIDUAL R-4 - I-drafts-mount must not be modeled on `assertAlwaysMounted`.**
  The new I-drafts-mount instrument must be a plain presence assertion; modeling it
  on the I-W2 `assertAlwaysMounted` helper (topLevelTabs.wiring.test.ts:517) would
  wrongly demand a `display`-toggle wrapper for what is correctly a conditional
  mount. The derivation says "plain source-text assertion" - keep it so.

## The one-wave call and the 3a/3b cut

Sound as reasoning, but note: the risky part - the `toolsSection`-crossing retired
pointer at the initial-load seat - is exactly where BLOCKER 1 lives, and the
derivation puts that risk entirely in 3a. Whether one wave or the 3a/3b cut, 3a
(or the single wave) is NOT dispatchable until BLOCKER 1's toolsSection
localStorage edit + instrument are added. The cut does not change the fix.

## Stopping point

**Design and measurement, one item each, both inside BLOCKER 1.** No **ruling** is
in question (the derivation reopens nothing settled; DECISION 17/18/19 and waves
1-2 untouched). The feasibility design is sound EXCEPT the single missed read-path
initializer; the measurement gap is the missing instrument for that same path.
Both are closed by the one bounded round-2 transcription named above (add the
`toolsSection` localStorage migration + its source-text pin + the section 3.3
table row). Everything else - closure, the crossing on the URL paths, conditional
mount, id freedom, E-full coherence, the canary/guard calls - ran and held. After
that transcription, wave 3 is dispatchable as one wave.
