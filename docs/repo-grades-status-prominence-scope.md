# Scope: make the grading status indicator more prominent in Repo Grades

Owner request, 2026-10-11, verbatim: "the status indicator needs to be more
prominent when grading repos."

This is a PRESENTATIONAL change to an existing status - visual treatment and
placement, not new data. No leverage claim and no new diagnostic (section 6,
justified). It is one wave, one implementer, one commit (section 8), and it
MUST sequence after the in-flight REPO-GRADING-REMOVE-ACTIVITY-LOG build and be
serialized against REPO-GRADES-MODULE-PICKER-HEADER because all three write
`index.tsx` (section 7).

Every quantity below names the command that produced it. Every `file:line` was
opened. The tree is mid-removal right now: the production files cited are the
WORKING-TREE (post-removal-in-progress) versions, which is the tree this
feature builds on after the removal commits.

---

## 1. What "the status indicator ... when grading repos" is (located, cited)

Grading a column ("Grade all") runs a bounded-concurrency bulk pool. Its live,
in-progress state is two values, both produced in `useRepoGradesBulkGrade.ts`
and set/cleared together:

- `runningFolder: string | null` - the folder being bulk-graded, or null
  (`useRepoGradesBulkGrade.ts:199,212,227`; set at start, cleared in the
  `finally`).
- `progress: { done: number; total: number } | null` - "done of total" for the
  running folder, or null (`:200,213,228`; incremented at
  `:408-409,425-426`).

They re-export through `useRepoGradesGradingActions.ts` as `bulkRunningFolder`
and `bulkProgress` (result interface `:139-140`, returned `:620-621`) and land
in the view at `index.tsx:557-558` (destructured from the hook).

**Where the in-progress state renders TODAY - and the whole problem:** it is
shown ONLY as a `<Button>` LABEL, in two places, computed the same way:

- `RepoGradesRunBar.tsx:79-82`: `gradeAllLabel = gradingThisColumn &&
  bulkProgress ? "Grading ${done} of ${total}..." : gradeLabel`, rendered as the
  Grade button's text (`:102`) and `aria-label` (`:95`).
- `RepoGradesGrid.tsx:372-373` (ColumnHeaderControls): the identical
  `gradeAllLabel`, rendered on the per-column Grade button (`:426,432`).

That is the entire "status indicator when grading": a short string inside a
small MUI `size="small"` contained button. There is no banner, no spinner, no
placement that keeps it in view while the grid scrolls.

**The other status surface (NOT the in-progress indicator):** `postSummary`,
the view's single `role="status" aria-live="polite"` region
(`index.tsx:730-734`, class `gridStyles.statusBanner`,
`repo-grades.module.css:356-364`). It carries the TERMINAL announcement
("Bulk grading finished: 3 graded.", `useRepoGradesBulkGrade.ts:433`) and
per-cell messages via `setPostSummary`. It is not the live, during-run
indicator - it mostly shows after the run ends. It is load-bearing for
accessibility and MUST be preserved exactly (section 3, AC-3).

**The status transitions to preserve** (owner's "keep the transitions"):
idle -> (per-run) `bulkProgress` counts up `done` from 0 to `total` while
`bulkRunningFolder` is set -> both null on completion/error, then the terminal
`postSummary` line. These live entirely in the hook and are pinned by
`useRepoGradesBulkGrade.lifecycle.test.ts` (A27/A27b assert
`bulkRunningFolder`/`bulkProgress` return to null; the T-1 table asserts the
terminal `postSummary` literals). This feature touches NONE of that.

---

## 2. The feature: concrete recommended treatment

Make the in-progress state a PROMINENT, visible-while-scrolling status banner,
reusing the app's canonical in-progress idiom.

**Recommended treatment (concrete):** a sticky status banner rendered while a
bulk run is in progress:

- a spinner + a bold line `Grading <done> of <total> in <folder>...` (fall back
  to `Grading <folder>...` when `bulkProgress` is momentarily null);
- built from the canonical in-repo loading idiom already used by THIS view's
  scan banner (`RepoGradesStatusBanners.tsx:93-100`): `styles.loadingState` +
  `styles.spinner` + `styles.loadingTitle` from `page.module.css:105-139`. The
  spinner rule is the app's single canonical recipe (`page.module.css:115-133`,
  the "X6" rule: do not fork it; if a different size/colour is wanted, add a
  class that still uses its three declarations verbatim);
- placed inside the sticky working header
  (`RepoGradesStickyHeader`'s `.stickyWorkingHeader`,
  `repo-grades.module.css:31-43`, `position: sticky; top: 0; z-index: 3`) so it
  stays pinned at the top of the bounded scroll shell while the grid scrolls
  under it - this placement is the primary prominence lever the button label
  lacks.

**Prominence = visual + placement, not new data** (owner's framing, and the
brief's). The three levers, in priority order: (1) placement in the sticky
header (visible without scroll, unlike a button label inside a control); (2)
spinner + bold count (`loadingTitle` is weight 700); (3) the accent-bordered
surface `loadingState` already carries (`page.module.css:111-112`). If the
owner/visual pass wants emphasis BEYOND the scan banner, add exactly ONE new
`repo-grades.module.css` class that layers stronger weight/accent ON TOP of the
`loadingState` base - the exact token delta is the Wave-3 visual/UX seat's
call; what is pinned here is the REUSE of `loadingState`/`spinner` as the base,
not a reinvented banner.

**Leave the button-label cue in place.** `RepoGradesRunBar.tsx` and
`RepoGradesGrid.tsx` keep their `Grading N of M...` button labels unchanged. The
new banner is additive. (Not touching the grid is also what keeps this feature
off REPO-GRADES-MODULE-PICKER-HEADER's `RepoGradesGrid.tsx` - section 7.)

### 2a. THE SHAPE DECISION that decides whether this ships whole (reachability)

A bulk grade starts from TWO paths, and the indicator must cover BOTH or it
ships half-dead:

- single-folder view: the Grade button in the sticky run bar
  (`RepoGradesRunBar.tsx`), which renders only when
  `model && currentSelectedFolder !== ALL_FOLDERS && displayedColumns[0]`
  (`index.tsx:768`).
- ALL_FOLDERS view: the per-column Grade button in the grid header
  (`RepoGradesGrid.tsx` ColumnHeaderControls, `onGradeColumn={handleGradeColumn}`
  passed unconditionally at `index.tsx:800`). The run bar is ABSENT here
  (`RepoGradesStickyHeader.tsx:17` comment: "Null ... or the all-folders
  view").

Therefore the indicator MUST bind to the VIEW-LEVEL `bulkRunningFolder` /
`bulkProgress` (already in `index.tsx:557-558`) and render INDEPENDENT of
folder scope and of the run bar. Putting it in the run bar only (the tempting,
smaller change) would show nothing during an ALL_FOLDERS grade - the
"surface is a layer" failure this repo has shipped before. The sticky working
header renders in BOTH views (`RepoGradesStickyHeader.tsx:31`, `hasHeader` is
always true because `onSearchChange` is always a function), so hosting the
banner there covers both paths with one render. This is the load-bearing shape
requirement; placement style is negotiable, coverage is not (AC-2).

### 2b. THE ACCESSIBILITY SHAPE DECISION: exactly one live region, visual-only banner

There is exactly ONE `aria-live` region in the view: the `postSummary`
`role="status" aria-live="polite"` region (`index.tsx:731`). Both hooks'
comments forbid a second ("index.tsx's single role="status" aria-live region.
Never add a second" - `useRepoGradesGradingActions.ts:116`,
`useRepoGradesBulkGrade.ts:95`; `index.tsx:725` calls two live regions racing
for one announcement an "ARIA inversion").

**Decision: the new banner is VISUAL ONLY - no `role`, no `aria-live`.** Two
reasons, both decisive: (1) a polite live region bound to `bulkProgress` would
announce "Grading 1 of 24", "2 of 24", ... on every repo - spamming a screen
reader; (2) it would be a second live region racing `postSummary`. Today the
in-progress state is announced to assistive tech only via a button-label change
(not reliably announced at all); the terminal summary is announced via
`postSummary`. A visual-only banner keeps that behaviour EXACTLY - it preserves
the single live region and changes no transition, satisfying the owner's "keep
the aria-live semantics; do not drop it." The accessibility checker's "mount
live regions unconditionally" concern does not apply because the new element is
NOT a live region; the existing one at `:730-734` is untouched.

Optional, NOT recommended, recorded as RES-3: route a single START line through
the EXISTING `setPostSummary` region ("Grading 24 repos in week-1..."). This
ADDS a transition, which the brief says to keep intact, so it is left to the
owner, not defaulted on.

---

## 3. Reachability: state -> prominent render, pinned

`useRepoGradesBulkGrade.ts` sets `runningFolder`/`progress` (`:212-213`),
increments `progress` (`:408-409,425-426`), clears both (`:226-228`) ->
re-exported as `bulkRunningFolder`/`bulkProgress`
(`useRepoGradesGradingActions.ts:620-621`) -> `index.tsx:557-558` -> the new
banner reads them. The banner's PRESENCE gate is `bulkRunningFolder !== null`
(the authoritative "a run is in progress" signal, set/cleared atomically with
`progress`); the COUNT reads `bulkProgress?.done`/`bulkProgress?.total`. No new
state, no new prop on the hooks. Moving/restyling that reads a DIFFERENT value,
or a static element, is the "prominent but stale" failure AC-1 guards.

---

## 4. Minimal write set

Derived by: `grep -rln "bulkRunningFolder\|bulkProgress" src/app/components/repo-grades`
(the state's consumers) and the sticky-header placement decision (section 2).

Edit - production (3 files):
- `src/app/components/repo-grades/index.tsx` - build the banner node from
  `bulkRunningFolder`/`bulkProgress` and pass it to the sticky header.
  (UNAVOIDABLE: the state lives here and this is the view-level render.)
- `src/app/components/repo-grades/RepoGradesStickyHeader.tsx` (73 lines,
  `wc -l`) - add one optional slot prop (e.g. `gradingIndicator?: ReactNode`)
  rendered inside `.stickyWorkingHeader`. CLEAN file: NOT in either in-flight
  item's write set.
- `src/app/components/repo-grades/repo-grades.module.css` - only if the owner
  wants emphasis beyond `loadingState`; then ONE new class. If `loadingState`
  as-is suffices, this file is NOT edited.

**Adds NO new file** (deliberate): the change lives in files already listed in
`FROZEN_REPO_GRADES_ROOTS`, so the directory-root canary
(`repoGradesFeedbackAndFiles.wiring.test.ts`) is NOT affected by this feature
(the removal takes it 41->39; this feature adds/removes no root file). This
avoids the `gate-must-include-directory-canary` hazard entirely.

**Does NOT edit** `useRepoGradesGradingActions.ts` or `useRepoGradesBulkGrade.ts`
- the status state is already surfaced to `index.tsx`; prominence is purely a
consumer-side render/placement change. This REMOVES what would otherwise be the
worst collision with the removal (which edits both hooks). Stated because the
brief flagged `useRepoGradesGradingActions.ts` as a suspected intersection:
it is NOT one for this feature.

**Does NOT edit** `RepoGradesGrid.tsx` or `RepoGradesRunBar.tsx` (button-label
cue left as-is). Not editing the grid keeps this feature off
REPO-GRADES-MODULE-PICKER-HEADER's grid edits.

### owns list (files that read my edit targets AS SOURCE TEXT)

`grep -rln "RepoGradesStickyHeader\|stickyWorkingHeader\|bulkProgress\|bulkRunningFolder\|statusBanner" src/app/components/repo-grades/*.test.ts`
and the structure tests scanning this directory:

```
src/app/components/repo-grades/repoGrades.wiring.test.ts
src/app/components/repo-grades/repoGradesFeedbackAndFiles.wiring.test.ts
src/app/components/repo-grades/repoGradesResultsPersist.structure.test.ts
src/app/components/repo-grades/repoGradesWaveASticky.structure.test.ts
src/app/components/repo-grades/repoGradesWaveBSearch.structure.test.ts
src/app/components/repo-grades/repoGradesWaveCTypeahead.structure.test.ts
src/app/components/repo-grades/useRepoGradesBulkGrade.lifecycle.test.ts
```

The binding one is **`repoGradesWaveASticky.structure.test.ts`** - it slices
`RepoGradesStickyHeader.tsx` and `repo-grades.module.css` as source text, and
the new slot MUST respect its pins:
- **W-A8 (`:112-121`)** the order inside the header must stay
  `.stickyShell` < `.stickyWorkingHeader` < `<RepoGradesRunBar` < `{children}`.
  The slot goes inside `.stickyWorkingHeader` (so after `stickyWorkingHeader`,
  and it may sit before or after `<RepoGradesRunBar` as long as `{children}`
  stays last). Adding a slot does not reorder these.
- **VH-10(a) (`:151-154`)** `.stickyWorkingHeader` must carry NO `overflow`
  declaration - do not add one.
- **W-A2 (`:60-69`)** every CSS scroll container must be `max-height`-bounded -
  a NEW class with `overflow: auto/scroll` would need `max-height`. (The banner
  does not scroll, so it carries neither.)
- **W-A10 (`:128-147`)** identifier bans: `index.tsx` must not contain
  `planRows`; `RepoGradesStickyHeader.tsx` must not contain `visibleRepoRows`,
  `bodyRows`, `planRows`. Name the new slot/node anything else.
- **W-A7 (`:106-110`)** `index.tsx` must NOT contain `<RepoGradesRunBar` - do
  not render a run bar in index; the banner is a plain element.

None of these break from adding an optional slot; they are the walls the
implementer stays inside.

---

## 5. ACCEPTANCE CRITERIA (embedded)

No component is rendered by any test here (`docs/loop/this-repo.md` section 6),
so the real "it looks more prominent" check is an owner walk (AC-5). Everything
else is machine-checkable by source-reading, tsc, lint, and the existing
canaries. Each pass condition names the object, the instrument, and the
direction of failure.

- **AC-1 (the indicator exists and is BOUND to the live run state).** `index.tsx`
  renders a status element whose presence is gated on `bulkRunningFolder`
  (the run-in-progress signal) and whose text reads `bulkProgress` (`.done`
  and `.total`). Object: the view source; instrument: a `*.wiring.test.ts`
  that reads `index.tsx` (comments stripped via the repo's `withoutLineComments`
  idiom) and asserts the new element's gate references `bulkRunningFolder` and
  its content references `bulkProgress`; failure: a static element, or one
  bound to a different value (the "prominent but stale" failure).
- **AC-2 (covers BOTH grade-start paths - the reachability wall).** The
  indicator renders regardless of folder scope: its gate is `bulkRunningFolder`,
  NOT `currentSelectedFolder`/`ALL_FOLDERS`, and it is NOT nested inside the
  run-bar conditional. Object: the view source; instrument: the same wiring
  test asserts the indicator node/slot is passed to `RepoGradesStickyHeader`
  (present in both views) and that its gate does not reference `ALL_FOLDERS`
  or `currentSelectedFolder`; failure: the indicator sits inside the
  single-folder run-bar branch (ships blank during an ALL_FOLDERS grade).
- **AC-3 (single aria-live region preserved - no ARIA inversion).** After
  stripping comments, `index.tsx` has exactly ONE `aria-live` attribute and it
  is the existing `postSummary` `role="status" aria-live="polite"` region; the
  new banner carries NO `role="status"` and NO `aria-live`. Object: the
  comment-stripped `index.tsx`; instrument: a structure/wiring assertion that
  the `aria-live` attribute count is 1 (the oracle, measured below) and the new
  element matches neither `role="status"` nor `aria-live`; failure: a second
  `aria-live`/`role="status"` appears, or the existing region is removed.
  Oracle: comment-stripped `aria-live` count in `index.tsx` is **1** today
  (`grep -c aria-live` returns 3, but 2 are in comment prose at `:715,:737`;
  the only attribute is `:731` - verified by `grep -n`). The instrument MUST
  strip comments first or a new comment mentioning "aria-live" false-trips.
- **AC-4 (the grade-run behaviour and transitions are unchanged).** The hooks
  (`useRepoGradesBulkGrade.ts`, `useRepoGradesGradingActions.ts`) are not in the
  write set; `bulkRunningFolder`/`bulkProgress` transitions and the terminal
  `setPostSummary` line are untouched. Object: the hook state machine;
  instrument: `useRepoGradesBulkGrade.lifecycle.test.ts` passes unchanged (it
  pins the null/non-null transitions at A27/A27b and the terminal `postSummary`
  literals at the T-1 table); failure: any diff to those hooks, or a lifecycle
  assertion reddens.
- **AC-5 (visual prominence - OWNER WALK, not machine-checkable).** During a
  bulk grade, the instructor sees a prominent spinner + count banner that stays
  in view while the grid scrolls, in both the single-folder and all-folders
  views. Object: the rendered view mid-run; instrument: owner walk (no
  component renders in tests); recorded RES-1. The source pins above are NOT a
  proxy for this - they prove the element exists and is bound, never that it
  reads as "prominent".
- **AC-6 (house rules).** No emojis/non-ASCII (`src/lib/no-emojis.test.ts`);
  `index.tsx` stays under the 1000-line ceiling
  (`src/file-size-ceiling.structure.test.ts`) - measured post-removal-in-progress
  at **828** (`@(Get-Content src/app/components/repo-grades/index.tsx).Count`);
  a ~15-25 line addition lands near ~850, well under 1000 (RE-MEASURE against
  the removal's actual commit before building - section 8). The spinner reuses
  the canonical recipe, not a fork (`page.module.css:115-133`, the X6 rule).
  Object: the three files; instrument: the two structure tests + the no-emoji
  test; failure: ceiling breach, non-ASCII, or a forked spinner rule.
- **AC-7 (persist nothing new).** The banner is derived from transient run
  state; no new `ta-` key. Object: the key set; instrument:
  `repoGradesStorageKeys.structure.test.ts` `FROZEN_KEYS` unchanged by THIS
  feature (the removal leaves it at 19; this feature adds none); failure: a new
  persisted key appears.

### Leverage claim

None. This is a presentational enhancement of an existing surface, not a new
user-reached capability (`DEV_LOOP.md` "Criteria": no claim on a refactor or
presentational change). The underlying batch-grading SCALE advantage
(`docs/loop/leverage.md`, `src/lib/grade/engine.ts:186`) already exists and is
not what this touches. Trigger recorded.

---

## 6. Diagnostics representation (DEV_LOOP b907ff8e)

NONE, and justified. This is a presentational change to an existing status with
NO new data path and NO new failure mode: `bulkProgress`/`bulkRunningFolder`
are already computed and already surfaced to `index.tsx`; the banner only
re-renders them more prominently. The grading-action diagnostics seam
(`timeGradingAction` -> `session-diagnostic-log.ts`/`gradingDiagnosticLog.ts`,
used by both hooks) is untouched and already reports the grade/post calls. No
diagnostic operation is added or orphaned. Per DEV_LOOP, this absence is STATED
and justified, not assumed. Trigger recorded.

---

## 7. Sequencing and write-set intersections (CRITICAL)

Two repo-grades items are in flight. Computed by exact path against each item's
write set:

| File | REPO-GRADING-REMOVE-ACTIVITY-LOG | REPO-GRADES-MODULE-PICKER-HEADER (projected) | THIS feature | Verdict |
|---|---|---|---|---|
| `index.tsx` | YES (`docs/repo-grading-remove-activity-log-scope.md` section 7) | YES (brief: "will edit index.tsx") | YES | **COLLISION - serialize** |
| `repo-grades.module.css` | YES (removes `.logPanel` etc.) | unknown (likely no) | YES (if new class) | **COLLISION with removal - serialize** |
| `RepoGradesStickyHeader.tsx` | NO | NO | YES | clean |
| `useRepoGradesGradingActions.ts` | YES | unknown | **NO** | no intersection for this feature |
| `useRepoGradesBulkGrade.ts` | YES | unknown | **NO** | no intersection for this feature |
| `RepoGradesGrid.tsx` | NO | YES (brief: "will edit ... RepoGradesGrid.tsx") | **NO** (recommended) | clean if the recommendation holds |
| `RepoGradesRunBar.tsx` | NO | NO | **NO** | clean |

**The intersection the brief asked me to flag explicitly:**
`useRepoGradesGradingActions.ts` is edited by the activity-log removal
(append-site removal) AND was suspected to be edited by this feature if the
status state lived there. It does NOT: the state is produced in
`useRepoGradesBulkGrade.ts` and already re-exported to `index.tsx`, so this
feature reads it at the consumer and edits neither hook. That suspected
collision is CLEARED.

**Build order (explicit):**
1. REPO-GRADING-REMOVE-ACTIVITY-LOG must COMMIT first. This feature builds on
   the post-removal `index.tsx` and `repo-grades.module.css` (both shared). Do
   not start this build until the removal's commit lands;
   re-measure `index.tsx` line count against that commit (section 8 /
   AC-6).
2. This feature is SERIALIZED against REPO-GRADES-MODULE-PICKER-HEADER because
   both write `index.tsx` - they MUST NOT run concurrently (one agent outside
   its list can revert the other's `index.tsx`). Whichever the orchestrator
   lands first, the second rebases on the resulting `index.tsx`. Order between
   the two is the orchestrator's call; this feature has no dependency on the
   module-picker's content, only on not co-writing the file.
3. Not editing `RepoGradesGrid.tsx` or the hooks is what keeps this feature's
   ONLY hard serialization the shared `index.tsx` (plus the css vs the removal).

Standard wave gate: `git status --short` against the write set (section 4), and
confirm no `.claude/worktrees` copy was edited (`stale-worktree-shadows-glob`).

---

## 8. One wave

One wave, one implementer, one commit. The three edits (build the node in
`index.tsx`, add the slot in `RepoGradesStickyHeader.tsx`, optional css class)
are mutually dependent and tiny; there is no disjoint second item inside this
scope and no sequencing benefit within it. RE-MEASURE `index.tsx` with
`@(Get-Content).Count` against the post-removal commit before building (it was
828 in the working tree; the removal commits that shrink).

### Instruments / wave gate (exact commands)
- `npx tsc --noEmit` (AC-4 clean program; one caller only - no concurrent
  sabotage-verify).
- `npm run lint` (no NEW warning in the written files vs the same command before
  the change; do not pin an absolute count).
- Targeted test run (AC-1, AC-2, AC-3, AC-6, AC-7 and the owns structure
  tests), multi-path via the wrapper so no path is silently dropped:
  `npm run test:paths -- src/app/components/repo-grades/repoGradesWaveASticky.structure.test.ts src/app/components/repo-grades/repoGrades.wiring.test.ts src/app/components/repo-grades/repoGradesFeedbackAndFiles.wiring.test.ts src/app/components/repo-grades/useRepoGradesBulkGrade.lifecycle.test.ts src/app/components/repo-grades/repoGradesStorageKeys.structure.test.ts`
  plus whichever new wiring test implements AC-1/AC-2/AC-3.
- `src/file-size-ceiling.structure.test.ts` and `src/lib/no-emojis.test.ts`
  (AC-6) - run unconditionally.
- Full `npm test` (the change is small and view-local, but the suite is the
  regression instrument and catches any source-text assertion the new element
  trips).

---

## 9. Residual register

Per DEV_LOOP, a residual not in `docs/BACKLOG.md` does not exist - the
orchestrator files these at disposal/push. Each names owner, instrument, step.

| ID | Residual | Owner | Instrument | Step |
|---|---|---|---|---|
| RES-1 | **Visual prominence is an owner walk.** No component renders under vitest, so AC-5 (the banner reads as "prominent", stays visible while scrolling, in both folder views, both themes) cannot be machine-verified here. | Repo owner | Manual: start a Grade all in a single-folder view and in the all-folders view; watch the banner while scrolling | Owner walk post-ship |
| RES-2 | **Prominence token delta is deferred to the Wave-3 visual/UX seat.** This scope pins REUSE of `loadingState`/`spinner`/`loadingTitle` as the base; whether a stronger accent/weight class is layered on top (and its exact tokens) is the visual seat's call, measured against both themes. | Visual/UX seat (then owner walk) | Open both theme definitions of any token used (per `seats.md` Visual checker); owner walk | At the UX/visual pass on this feature |
| RES-3 | **Optional START announcement not added.** Routing a one-time "Grading N repos in <folder>..." line through the existing `setPostSummary` region would ADD a transition, which the brief says to keep intact. Left to the owner, not defaulted. | Repo owner | n/a (a product decision) | Owner's next batched decision if wanted |
| RES-4 | **Serialization is a process constraint, not a test.** The `index.tsx` collision with REPO-GRADES-MODULE-PICKER-HEADER is enforced only by the orchestrator not running the two concurrently; no gate detects a concurrent edit except the post-hoc `git status --short` wave gate. | Orchestrator | `git status --short` against the write set at each wave gate | Enforced at dispatch and at the wave gate |

---

## 10. What I could not determine in this environment

- AC-5 / RES-1 (the rendered banner is actually prominent and stays visible
  while scrolling): not verifiable here - no component renders under vitest.
  Owner walk only.
- REPO-GRADES-MODULE-PICKER-HEADER's exact write set: its scope file does not
  exist yet (`docs/*module-picker*` returns nothing). Its `index.tsx` and
  `RepoGradesGrid.tsx` edits are taken from the orchestrator's brief, not a
  committed scope; the `index.tsx` serialization is the safe reading regardless
  of its final content.
