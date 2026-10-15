# Scope: remove the activity log from the repo grading view

Owner request, 2026-10-11, verbatim: "remove the activity log from the repo
grading view."

This is a REMOVAL. It adds no user capability, so there is no leverage claim and
no new diagnostic (justified in section 7). It is one wave, one implementer, one
commit (section 8). It is NOT a one-liner: the activity log is a woven feature
with append sites across two hooks, a persisted `ta-` key with a frozen-key
canary, a directory-root canary, three wiring-test describes, and one behavioural
test that must be surgically rewritten rather than deleted (section 5).

All quantities below name the command that produced them. Every `file:line` was
opened.

---

## 1. What "the repo grading view" and "the activity log" are (located, cited)

**The view** is `RepoGradesTab`, the default export of
`src/app/components/repo-grades/index.tsx:115`. It renders the Repo Grades tab.

**The activity log** is ONE surface in that view: the `RepoGradesLogPanel`
component, mounted at `src/app/components/repo-grades/index.tsx:987-995`:

```
{course && (
  <RepoGradesLogPanel log={log} courseId={uiState.courseId}
    courseName={course.name} onClear={() => setLog([])} onAnnounce={setPostSummary} />
)}
```

It renders a section headed "Activity log"
(`RepoGradesLogPanel.tsx:143-145`, `id="repo-grades-log-heading"`): a summary
count line, the ten most recent entries, and Download CSV / Download JSON /
Clear log buttons (`RepoGradesLogPanel.tsx:146-207`).

**What feeds it** (traced, each cited):
- Component file: `RepoGradesLogPanel.tsx` (209 lines by `@(Get-Content).Count`),
  imported only by `index.tsx:58`.
- Pure data/format module: `repoGradesLog.ts` (298 lines) - append/cap, parse,
  summarize, recent, CSV/JSON format, filename. Imported by `RepoGradesLogPanel.tsx:21-29`,
  `index.tsx:54-57`, `useRepoGradesGradingActions.ts:50` (types only),
  `useRepoGradesBulkGrade.lifecycle.test.ts:73` (type only), `repoGradesUiState.ts:19`,
  `repoGradesUiState.test.ts:27`, and the two `.test.ts` for the module/state.
- State in `index.tsx`: `const [log, setLog]` (`:552`); `recordLog` (`:646-649`);
  `buildLogEntry` (`:630-644`); the persist effect `persistRepoGradeLog` (`:598-601`);
  the restore line `setLog(loadRepoGradeLog(...))` (`:562`); the scan-error logging
  effect (`lastLoggedScanError` ref + effect, `:659-672`).
- Append call sites in `index.tsx`: `handleAssignmentChange` (`:431-437`),
  `handleAcceptBinding` (`:448-454`), `handleLinkUsernames` (`:469-474`),
  `handleConfirmAllSuggested` (`:508-516`), `handleLinkFromCourseRoster` (`:531-539`),
  plus the scan-error effect above.
- Append call sites in `useRepoGradesGradingActions.ts`: `handleGradeCell`
  (`:316`, `:326`, `:453-460`), `handlePostColumn` (`:506-516`, `:527-533`,
  `:541-543`, `:582-607`), `handlePostOneCell` (`:646-655`, `:663-671`, `:694-711`),
  `handleBulkOutcomes` (`:742-751`), wired to the bulk hook via
  `onOutcomes: handleBulkOutcomes` (`:759`). `recordLog`/`buildLogEntry` enter this
  hook as params (`:142-146`, interface `:97-149`).
- The bulk hook `useRepoGradesBulkGrade.ts`: `onOutcomes` param (`:112`, destructured
  `:216`), called once at `:481` (`onOutcomes(outcomes)`).
- Persisted key: `LOG_KEY = "ta-repo-grades-log"` (`repoGradesUiState.ts:103`),
  with `loadRepoGradeLog`/`persistRepoGradeLog`/`parseLogByCourse`
  (`repoGradesUiState.ts:376-413`).
- **Sibling wiring tests that assert on the log symbols as SOURCE-TEXT** (found
  by the symbol-level sweep, section 4; these red the full `npm test` and are
  missed by tsc/eslint/the targeted run): `repoGradesRubricPicker.wiring.test.ts:405,409`
  (`toMatch` that `describeResolvedRubricForLog(resolved, result.rubric)` exists
  in both hooks), and `repoGrades.wiring.linking.test.ts:184-211` (slices the
  real `index.tsx` and asserts `buildLogEntry("usernames-linked"` /
  `buildLogEntry("binding-confirmed"` exist). Both are in the write set (section
  4 items 6-7).
- CSS: `.logPanel/.logHeader/.logActions/.logList/.logEntry/.logEntryTime/
  .logEntryKind/.logEntryTarget/.logEntryDetail` and a `@media` `.logEntry`
  override (`repo-grades.module.css:769,777,792,798,811,821,826,831,837,846`).

**Candidate disambiguation (the brief asked for this).** There are several
log-like surfaces in the tree. Only one is in the repo grading view:

| Candidate | Location | In the repo grading view? |
|---|---|---|
| **Repo Grades "Activity log"** | `RepoGradesLogPanel.tsx`, mounted `index.tsx:987` | **YES - this is the target.** |
| "Repo grading log" | `drafted-grades/RepoGradingLogPanel.tsx`, `src/lib/repo-grading-log.ts` | No - a different surface (Drafted Grades). Not imported by repo-grades `index.tsx`. |
| "Rubric run log" | `content-tab/modules/RubricRunLogPanel.tsx`, `src/lib/rubric-run-log.ts` | No - Content tab. |
| Content diagnostic log | `content-tab/ContentDiagnosticLogSection.tsx` | No - Content tab. |

Confirmed by `grep -rn "RepoGradingLogPanel\|RubricRunLogPanel\|ContentDiagnosticLogSection" src/app/components/repo-grades` - zero hits. Recommended
reading: remove the Repo Grades `RepoGradesLogPanel` and everything that feeds
only it. The other surfaces are untouched.

---

## 2. The one shape decision that matters: UI-only vs full removal

Two readings of "remove the activity log from the repo grading view":

- **(A) Unmount only** - delete the `<RepoGradesLogPanel .../>` mount, leave
  `repoGradesLog.ts`, the `log` state, the `LOG_KEY`, and every append site in
  place. Smaller diff, but it leaves the whole log machinery recording and
  persisting invisibly - dead-by-use, a reachability inversion of the exact kind
  this repo has shipped before.
- **(B) Full removal + orphan sweep** - delete the panel AND everything whose
  only consumer is the panel: the data module, the `log` state and its persist/
  restore, every append site, the `LOG_KEY` and its canary. The brief directs
  this ("if the log is the only consumer, the append sites are now dead - remove
  them"), and it is the correct reading of "remove", not "hide".

**This scope takes (B).** Reachability check that makes (B) safe: the append
sites feed ONLY the log. Every user-visible outcome travels a SEPARATE channel
that (B) does not touch - `setPostSummary` into the view's one `role="status"`
aria-live region (`index.tsx:886-890`), the per-cell status in the grid
(`RepoGradeCellControl`), and the scan-error banner
(`RepoGradesStatusBanners`, fed by `scanError` directly, `index.tsx:808`). So
removing the log removes NO user-visible behaviour. This is pinned, not
assumed: `repoGrades.wiring.test.ts:411` already asserts `handleGradeCell`'s
no-submission branch announces through `setPostSummary` "not just the activity
log" - that assertion stays green after removal (section 4).

**Consequence the owner is accepting (a FINDING, not a refusal).** The activity
log is the ONLY durable record of what this view posts to the LIVE Canvas
gradebook. Its own module header states the gap it exists to close
(`repoGradesLog.ts:10-21`): `postCanvasGradesAction` writes to Canvas with no
undo and no audit table, per-cell status and the one-line `postSummary` are both
wiped on reload and on course switch, and nothing on our server ever sees these
entries. After removal, ten minutes after a grading session the instructor can
no longer answer "who did I post, at what score, to which assignment, and what
did Canvas say about the one that failed", and can no longer download that record
as CSV/JSON. This does not change the removal - the owner asked to remove it -
but it is recorded as RES-1 (section 9) so the scope decision is the owner's and
is visible, per DEV_LOOP's rule that a capability the built diff no longer
supports is a finding, never a silent drop.

---

## 3. Orphan sweep: every reference, remove / keep-because-shared

Candidate set produced by:
`grep -rln "repoGradesLog\|RepoGradesLogPanel\|RepoGradeLogEntry\|recordLog\|buildLogEntry\|loadRepoGradeLog\|persistRepoGradeLog\|appendRepoGradeLogEntries\|onOutcomes\|ta-repo-grades-log" src`
then each classified by opening it:

### 3a. Delete whole file (exclusively the activity log, no other consumer)
- `src/app/components/repo-grades/RepoGradesLogPanel.tsx` - only consumer is
  `index.tsx:58`, which is being removed. DELETE.
- `src/app/components/repo-grades/repoGradesLog.ts` - after the edits below,
  every importer is gone. DELETE.
- `src/app/components/repo-grades/repoGradesLog.test.ts` - tests the deleted
  module. DELETE.

### 3b. Edit production files
- `index.tsx`: remove the imports at `:54-57` (`appendRepoGradeLogEntries`,
  `RepoGradeLogEntry`, `RepoGradeLogEventKind`), `:58` (`RepoGradesLogPanel`),
  `:63` (`linkUsernamesLogDetail` - now unused, see 3c), and `loadRepoGradeLog`/
  `persistRepoGradeLog` from the `./repoGradesUiState` import block (`:39-46`);
  remove `log`/`setLog` state (`:552`), `recordLog` (`:646-649`), `buildLogEntry`
  (`:630-644`), the persist effect (`:598-601`), the `setLog(loadRepoGradeLog(...))`
  line (`:562`), the scan-error logging effect and its `lastLoggedScanError` ref
  (`:659-672`); strip the `recordLog([...])` calls from `handleAssignmentChange`,
  `handleAcceptBinding`, `handleLinkUsernames`, `handleConfirmAllSuggested`,
  `handleLinkFromCourseRoster` (cited in section 1 - the surrounding handlers
  STAY; only the log append is removed, and `handleAcceptBinding`/the link
  handlers keep returning their result unchanged); drop `recordLog`/`buildLogEntry`
  from the `useRepoGradesGradingActions({...})` params object (`:728-729`); delete
  the `<RepoGradesLogPanel .../>` mount (`:987-995`). KEEP `setPostSummary`,
  `restoredNotice`/`persistError`, the discard-saved-results block (`:978-986`),
  and every other handler body.
- `useRepoGradesGradingActions.ts`: remove the `RepoGradeLogEntry`/
  `RepoGradeLogEventKind` type import (`:50`); remove `recordLog`/`buildLogEntry`
  from `UseRepoGradesGradingActionsParams` (`:142-146`) and the destructure
  (`:194-195`); remove `describeResolvedRubricForLog` (`:90-95`) and the per-cell
  `rubricNote`/`feedbackNote`/`detail` locals (`:348-356`) - they feed only the
  removed `recordLog`; replace `bulkGradeOutcomeFromRun({...}, result.run.results, detail)`
  (`:357`) with the same call passing `""` as `successDetail` (the returned
  `outcome.status`/`outcome.score` still drive the cell at `:358-360`; `outcome.detail`
  was consumed only by the log). KEEP `cuts` (`:345-347`) - it feeds the
  `setPostSummary` "graded, but ..." announcement (`:445-447`). Remove
  `handleBulkOutcomes` (`:742-751`) and the `onOutcomes: handleBulkOutcomes`
  wiring in the `useRepoGradesBulkGrade({...})` call (`:759`). Strip every
  `recordLog([...])` in `handlePostColumn`/`handlePostOneCell` (cited in section
  1). KEEP `setPostSummary`, `setColumnPosting`, the Canvas calls, `trendsEntry`.
- `useRepoGradesBulkGrade.ts`: remove `onOutcomes` from `UseRepoGradesBulkGradeParams`
  (`:112`) and the destructure (`:216`); remove the `onOutcomes(outcomes)` call
  (`:481`). `outcomes` is STILL built and STILL feeds
  `onAnnounce(bulkGradeSummaryLine(outcomes, plan))` (`:482`) - `bulkGradeSummaryLine`
  reads only `outcome.status` (`repoGradesBulkGrade.ts:175-191`), never `detail`.
  Therefore `describeResolvedRubricForLog` (`:89-94`), `readmeNote`/`rubricNote`/
  `feedbackNote`/`detail` (`:386-393`) also go dead; the final
  `outcomes.push(bulkGradeOutcomeFromRun(target, result.run.results, detail))`
  (`:399`) becomes `...successDetail ""`. KEEP `provisionalOutcome` (`:322`, its
  own `successDetail ""`), the cell writes, `runResults`, and the two "activity
  log" mentions in comments must be reworded or removed (`:16-21`, `:111`).
- `repoGradesUiState.ts`: remove `LOG_KEY` (`:95-103`), `loadRepoGradeLog`/
  `persistRepoGradeLog`/`parseLogByCourse` (`:367-413`), and the
  `parseRepoGradeLogEntries, type RepoGradeLogEntry` import (`:19`). KEEP every
  other key and function.
- `repo-grades.module.css`: remove `.logPanel` (`:769`), `.logHeader` (`:777`),
  `.logActions` (`:792`), `.logList` (`:798`), `.logEntry` (`:811`),
  `.logEntryTime` (`:821`), `.logEntryKind` (`:826`), `.logEntryTarget` (`:831`),
  `.logEntryDetail` (`:837`), and the `@media` `.logEntry` block (`:846`).

### 3c. Keep-because-shared (becomes production-unreferenced but KEEP the file)
- `repoGradeScoreDisplay.ts` - `formatScorePercent` is used across the view
  (`RepoGradeCellControl`, `repoGradesPosting`, `repoGradeTreeLink`,
  `repoGradesRows`, `repoGradePostScore`, and more - `grep -rln formatScorePercent src`).
  KEEP the file. `summarizeScoreSpread` (`:126`) becomes production-unreferenced
  (its only production caller was `RepoGradesLogPanel.tsx:102`) but stays exported
  and has its own tests (`repoGradeScoreDisplay.test.ts:119-160`). RES-2:
  recommend leaving it (tested, exported, zero tsc/eslint cost) rather than
  removing it and its test block; owner may rule otherwise.
- `linkRepoUsernames.ts` - core link logic, kept. `linkUsernamesLogDetail` (`:121`)
  becomes production-unreferenced (only caller was `index.tsx:472`) but stays
  exported and tested (`linkRepoUsernames.test.ts:140-166`). RES-3: same
  recommendation as RES-2.
- `.logTitle` (`repo-grades.module.css:785`) - ALSO used by
  `LinkUsernamesPanel.tsx:262`. KEEP.
- `.banner` (`:324`) and `.statusBanner` (`:356`) - shared with
  `RepoGradesStatusBanners`/`index.tsx`. KEEP.
- `bulkGradeOutcomeFromRun`, `BulkGradeOutcome`, `bulkGradeSummaryLine`
  (`repoGradesBulkGrade.ts`) - still used for cell state and the aria-live
  summary. KEEP.

---

## 4. Canaries and tests to flip/update (same commit as the removal)

A removal that deletes files and a `ta-` key reddens three frozen-list canaries
and three source-reading wiring describes. Each is flipped or updated in the
SAME commit (the `gate-must-include-directory-canary` lesson):

1. **Storage-key canary** - `repoGradesStorageKeys.structure.test.ts`: remove
   `"ta-repo-grades-log"` from `FROZEN_KEYS` (`:29`), making it 19 entries;
   update the `it("K1: ... exactly the frozen 20")` title at `:43` to 19.
   (Wording correction from round 1: K2 at `:47-49` is `toBeGreaterThan(10)` with
   NO literal count - it stays as-is, still true at 19; K3/K4 at `:51-58` inject
   a synthetic added/renamed key and stay valid.) Object: `collectKeys(source)`
   vs `FROZEN_KEYS`; instrument: that test; failure direction: an extra/missing
   key reddens it.
2. **Directory-root canary** - `repoGradesFeedbackAndFiles.wiring.test.ts`:
   remove `"RepoGradesLogPanel.tsx"` (`:313`) and `"repoGradesLog.ts"` (`:337`)
   from `FROZEN_REPO_GRADES_ROOTS`; update the "41 frozen basenames" comment
   (`:303`) and the `it("directoryRoots(repo-grades) names exactly the 41 ...")`
   title/assertion (`:360-365`) to 39. The client-boundary walk (R-1/R-3/R-4)
   over `directoryRoots` stays green with fewer browser-safe leaves.
3. **Wiring describes** - `repoGrades.wiring.test.ts`: DELETE the `LOG_PANEL_PATH`/
   `logPanelSource` consts (`:763-764`), the `describe("the activity log's
   download and clear are click-gated")` block (`:766-813`), and the
   `describe("index.tsx actually feeds and renders the activity log")` block
   (`:815-844`). KEEP `callSitesGatedByClick`, `extractUseEffectBodies`,
   `stripComments`, `hasBlanketPersistEffect`, `usesSharedFunction` and every
   other describe (binding/grade/post gating, the selection mount-time race, the
   run-bar). Lightly reword the header-comment mention of the log
   (`:33`) - non-blocking prose.
4. **Storage/log round-trip tests** - `repoGradesUiState.test.ts`: remove the
   `loadRepoGradeLog, persistRepoGradeLog` imports (`:19-20`), the
   `type RepoGradeLogEntry` import (`:27`), the `logEntry` fixture (`:505-518`),
   and the whole `describe("loadRepoGradeLog / persistRepoGradeLog")` block
   (`:520-577`). KEEP every other describe.
5. **Behavioural lifecycle test - REWRITE, do not delete**
   (`useRepoGradesBulkGrade.lifecycle.test.ts`). Its PRIMARY subject is A26/A27
   concurrency (double-click refusal, stuck-lock recovery) and the A28/A30
   status-line/trends/cell-error agreement - all unrelated to the log and
   load-bearing. But it constructs `UseRepoGradesGradingActionsParams` with
   `recordLog`/`buildLogEntry` (`:246-260`), imports `type RepoGradeLogEntry`
   (`:73`), and asserts on `recordLogCalls` log kinds (A27a `:414-416`, R-5
   `:607-618`, R-6 `:454`, A30's four `:645-704`). Rewrite:
   - drop the `RepoGradeLogEntry` import, the `recordLog`/`buildLogEntry` params,
     and the `recordLogCalls` scaffolding;
   - DELETE the assertions whose sole subject is a log kind (they lose their
     oracle with the log gone): A27a's `kinds.filter(...)` (`:414-416`), R-5
     (`:607-618`), and the `recordLogCalls.some(... grade-failed/succeeded ...)`
     lines inside R-6 and the four A30 tests;
   - KEEP every assertion on `cellEditsState` (gradeError/score), `announceCalls`
     (the status line - A27a `:417-418` and the whole T-1 table), `gradeRepoActionMock`
     call counts (A26/A26b/R-4), `bulkRunningFolder`/`bulkProgress` (A27/A27b),
     and `trendsEntry`/`repoRunTrendsLabel` (T-1). These are the tests' real
     purpose and survive untouched.
   This is "update the oracle, do not delete it": the concurrency and status-line
   coverage must remain. RES-4 records that the per-outcome log-kind coverage is
   deliberately dropped (its subject no longer exists).
6. **Rubric-picker wiring test - SURGICAL rewrite, do not delete**
   (`repoGradesRubricPicker.wiring.test.ts`). The describe `"AC item 76: the
   prologue gate and the log's rubric gate were BOTH updated"` (`:380-412`)
   asserts (`:405`, `:409`) that `const rubricNote = describeResolvedRubricForLog(resolved, result.rubric);`
   exists in BOTH hooks. Section 3b removes `describeResolvedRubricForLog` and the
   dead `rubricNote` local from both `useRepoGradesBulkGrade.ts:89` and
   `useRepoGradesGradingActions.ts:90` (forced: leaving the unused module
   function in place reds eslint `no-unused-vars`), so both `toMatch` lines red.
   - DROP ONLY the two `describeResolvedRubricForLog` lines: delete the `it` at
     `:404-406` entirely (its sole assertion is `:405`); in the `it` at
     `:408-411` delete line `:409` and KEEP line `:410`
     (`not.toMatch(/\brubric\.trim\(\) === ""/)`), rewording that `it`'s title to
     name only what it now pins (the per-cell hook carries no page-level
     empty-rubric gate).
   - KEEP the item 72/76 REGRESSION assertions in the same describe - they are
     NOT log coverage: the canary `:381-391`, the bulk-hook gate
     `not.toMatch(/\brubric\.trim\(\) === ""/)` at `:401`, and `:410`. They stay
     green because the removal does not reintroduce `rubric.trim() === ""` (the
     bulk prologue gate remains `resolved.text.trim() === ""`, `useRepoGradesBulkGrade.ts:449`).
     The describe title's "log's rubric gate" half is now stale prose - optional
     reword, non-blocking.
7. **Row-link wiring test - delete two describes, keep the canary**
   (`repoGrades.wiring.linking.test.ts`). It slices the real `index.tsx` and
   asserts the log append exists: `:184-194` `body.toContain('buildLogEntry("usernames-linked"')`
   (handleLinkUsernames) and `:196-211` `buildLogEntry("binding-confirmed"`
   (handleConfirmAllSuggested). Section 1/3b strips exactly those
   `recordLog([buildLogEntry(...)])` calls from `index.tsx` (`:469-474`,
   `:508-516`), so both `.toContain` red and both describes lose their subject.
   - DELETE the two describes at `:184-194` and `:196-211`.
   - KEEP the self-contained `isCallSiteWithinIfBlock` canary describe (`:167-182`,
     pure string fixtures, reads no production source) and the helper it proves.
     After the two describes go, that helper is used only by its own canary -
     green, harmless, vestigial; the checker ruled keep it.
   - The `:82` comment ("matching how RepoGradesLogPanel below it is gated")
     becomes stale prose - optional reword, non-blocking (RES-8).

**Sweep level (corrected from round 1).** Round 1 covered module/import refs and
frozen basenames but NOT symbol-level SOURCE-TEXT assertions in sibling wiring
tests. This sweep greps EVERY `src/app/components/repo-grades/*.test.ts` for
`describeResolvedRubricForLog | buildLogEntry( | recordLog( | RepoGradesLogPanel |
repoGradesLog | loadRepoGradeLog | persistRepoGradeLog | LOG_KEY |
ta-repo-grades-log | appendRepoGradeLogEntries | RepoGradeLogEntry | onOutcomes`
and the log-kind literals (`usernames-linked`, `binding-confirmed`,
`post-succeeded`, `grade-succeeded`). Every `*.test.ts` that matched is now in
the write set: `repoGradesLog.test.ts` (deleted) + the 7 edited tests listed in
section 7. No OTHER test matched -
`repoGradesSliceA.guards.test.ts`, `repoGradesSliceB.guards.test.ts`,
`repoGradesCodeExecution.wiring.test.ts` and every pure-module test returned
ZERO hits. `componentStorageKeys.structure.test.ts` is non-recursive and never
sees this directory (`repoGradesStorageKeys.structure.test.ts:2-6`); the
file-size-ceiling and emoji/byte scans glob all files and only shrink. The write
set stays entirely within `src/app/components/repo-grades/`.

---

## 5. Diagnostics representation (DEV_LOOP b907ff8e)

A removal adds no new user capability, so it carries NO new diagnostic. The
required check - does removing the log orphan a diagnostic operation tied to it?
- is answered NO, with evidence:

- The app's diagnostics surface is the grading-action seam `timeGradingAction`
  (`../grading/gradingActionSeam`), used by `useRepoGradesGradingActions.ts:302,556,676`
  and `useRepoGradesBulkGrade.ts:283`, feeding `session-diagnostic-log.ts` /
  `gradingDiagnosticLog.ts` (the files modified in the working tree per the
  session's `git status`, both OUTSIDE `repo-grades`). `timeGradingAction` wraps
  the Canvas/grade calls and is INDEPENDENT of `recordLog` - it is NOT removed,
  and the removal does not touch it.
- `repoGradesLog.ts` imports only `escapeCsvValue` (`:23`); it is not wired into
  any diagnostic-log system. It is a per-course localStorage AUDIT trail with a
  CSV/JSON download, not a diagnostics feed.

Therefore no diagnostic operation is orphaned. The audit-trail loss is a
product-capability loss (RES-1), not a diagnostics-representation gap.

Leverage: N/A - removal, not a user-reached new capability (DEV_LOOP "Criteria":
no claim on a refactor/removal). Trigger recorded.

---

## 6. ACCEPTANCE CRITERIA

Each pass condition names the object under comparison, the instrument, and the
direction of failure. No component is rendered by any test here, so the lived
"the view no longer shows an Activity log" check is an owner walk (AC-8);
everything else is machine-checkable by source-reading, tsc, lint, and the
deleted/flipped canaries.

- **AC-1 (the panel is gone).** `src/app/components/repo-grades/RepoGradesLogPanel.tsx`
  does not exist, and `index.tsx` contains no `RepoGradesLogPanel` and no
  `repo-grades-log-heading`. Object: the view's source + file tree; instrument:
  `Test-Path` on the file (expect False) and `grep -n "RepoGradesLogPanel\|repo-grades-log-heading" src/app/components/repo-grades/index.tsx` (expect empty); failure: either present.
- **AC-2 (the data module is gone).** `repoGradesLog.ts` and `repoGradesLog.test.ts`
  do not exist. Instrument: `Test-Path` (expect False for both); failure: present.
- **AC-3 (orphan sweep complete - tsc clean).** `npx tsc --noEmit` exits 0.
  Object: the whole typed program; instrument: tsc; failure: any dangling import
  of `./repoGradesLog`, `./RepoGradesLogPanel`, `loadRepoGradeLog`,
  `persistRepoGradeLog`, `RepoGradeLogEntry`, or the removed `recordLog`/
  `buildLogEntry`/`onOutcomes` params produces a nonzero exit.
- **AC-4 (no dead log symbols left - lint clean).** `npm run lint` exits 0.
  Object: unused imports/locals (tsconfig has no `noUnusedLocals`, confirmed by
  `grep -n noUnusedLocals tsconfig.json` -> no match, so eslint `no-unused-vars`
  is the instrument, not tsc); failure: a left-behind `describeResolvedRubricForLog`,
  `rubricNote`, `feedbackNote`, `detail`, or `handleBulkOutcomes` reddens lint.
- **AC-5 (the `ta-repo-grades-log` key is gone and its canary flipped).**
  `grep -n "ta-repo-grades-log" src/app/components/repo-grades/repoGradesUiState.ts`
  is empty AND `repoGradesStorageKeys.structure.test.ts` passes with `FROZEN_KEYS`
  at 19. Object: the key set in `repoGradesUiState.ts` vs `FROZEN_KEYS`;
  instrument: that structure test; failure: key present, or frozen list not
  updated.
- **AC-6 (the directory-root canary flipped).**
  `repoGradesFeedbackAndFiles.wiring.test.ts` passes with `FROZEN_REPO_GRADES_ROOTS`
  at 39 (neither `RepoGradesLogPanel.tsx` nor `repoGradesLog.ts` listed). Object:
  `directoryRoots(repo-grades)` vs the frozen list; instrument: that test;
  failure: list not updated to match the two deletions.
- **AC-7 (kept repo-grades capabilities intact).** Grade-all, per-cell grade,
  post-column, post-one-cell, the grid, search/sticky, folder scoping, binding
  confirm, and username linking all still function. Object: the surviving
  handlers + their wiring guards; instrument: the full repo-grades test suite
  (`repoGrades.wiring.test.ts`, `repoGrades.wiring.linking.test.ts`,
  `repoGradesRubricPicker.wiring.test.ts`, `repoGradesFeedbackAndFiles.wiring.test.ts`,
  `useRepoGradesBulkGrade.lifecycle.test.ts`, `repoGradesBulkGrade.test.ts`,
  `repoGradesPosting.test.ts`, etc.) passing, plus the kept assertions in
  section 4 items 5-7; failure: any grading/posting/binding guard reddens, OR a
  left-behind source-text assertion on a removed log symbol reds the full
  `npm test` (the round-1 miss, now closed by section 4 items 6-7). In particular
  `repoGrades.wiring.test.ts:411` (no-submission announces via `setPostSummary`)
  MUST stay green - proving user-visible feedback survived the log removal.
- **AC-8 (owner-walk, not machine-checkable here).** With a course selected, the
  Repo Grades tab shows no "Activity log" section and no Download/Clear-log
  controls; grading and posting still announce through the status region and
  the grid. Object: the rendered view; instrument: owner walk (no component is
  rendered by any test); recorded as RES-5.

---

## 7. Minimal write set

Derived from the orphan sweep (section 3); classification command in section 3a.

Delete (3 files):
- `src/app/components/repo-grades/RepoGradesLogPanel.tsx`
- `src/app/components/repo-grades/repoGradesLog.ts`
- `src/app/components/repo-grades/repoGradesLog.test.ts`

Edit - production (5 files):
- `src/app/components/repo-grades/index.tsx` (998 lines now; shrinks)
- `src/app/components/repo-grades/useRepoGradesGradingActions.ts` (827)
- `src/app/components/repo-grades/useRepoGradesBulkGrade.ts` (490)
- `src/app/components/repo-grades/repoGradesUiState.ts` (648)
- `src/app/components/repo-grades/repo-grades.module.css`

Edit - tests/canaries (7 files):
- `src/app/components/repo-grades/repoGradesStorageKeys.structure.test.ts` (20->19, section 4 item 1)
- `src/app/components/repo-grades/repoGradesFeedbackAndFiles.wiring.test.ts` (41->39, section 4 item 2)
- `src/app/components/repo-grades/repoGrades.wiring.test.ts` (remove 2 describes, section 4 item 3)
- `src/app/components/repo-grades/repoGradesUiState.test.ts` (remove log describe, section 4 item 4)
- `src/app/components/repo-grades/useRepoGradesBulkGrade.lifecycle.test.ts` (rewrite, section 4 item 5)
- `src/app/components/repo-grades/repoGradesRubricPicker.wiring.test.ts` (drop 2 toMatch lines, section 4 item 6)
- `src/app/components/repo-grades/repoGrades.wiring.linking.test.ts` (delete 2 describes, section 4 item 7)

Nothing OUTSIDE `src/app/components/repo-grades/` is in the write set
(`grep` for every log symbol over `src` returns only this directory plus `docs`;
`docs/REGRESSION.md` is reconciled by the orchestrator at push, see RES-6).
House rules: no emojis/non-ASCII (`src/lib/no-emojis.test.ts` is the gate); no
file approaches the 1000-line ceiling - every edited file shrinks, and
`index.tsx` moves comfortably below 998.

### Instruments / wave gate (exact commands)
- `npx tsc --noEmit` (AC-3) - note it has ONE caller; no concurrent sabotage-verify.
- `npm run lint` (AC-4).
- Targeted test run (AC-5, AC-6, AC-7, section 4 items 1-7), multi-path via the wrapper
  so no path is silently dropped:
  `npm run test:paths -- src/app/components/repo-grades/repoGradesStorageKeys.structure.test.ts src/app/components/repo-grades/repoGradesFeedbackAndFiles.wiring.test.ts src/app/components/repo-grades/repoGrades.wiring.test.ts src/app/components/repo-grades/repoGradesUiState.test.ts src/app/components/repo-grades/useRepoGradesBulkGrade.lifecycle.test.ts src/app/components/repo-grades/repoGradesRubricPicker.wiring.test.ts src/app/components/repo-grades/repoGrades.wiring.linking.test.ts`
- Full `npm test` (the change touches shared hooks; the whole suite is the
  regression instrument) - expect no net change except the deleted
  `repoGradesLog.test.ts` cases and the removed log describes.
- Wave gate: `git status --short` against this write set, and confirm no
  `.claude/worktrees` copy was edited (`stale-worktree-shadows-glob`).

---

## 8. One wave

One wave, one implementer, one commit. The production edits and the four canary/
test edits are mutually dependent - deleting the files without flipping the two
frozen lists reddens them; removing the hook params without editing the lifecycle
test breaks tsc; they MUST land together. There is no disjoint second item to run
in parallel inside this scope, and no sequencing benefit. The removal relieves,
not adds, ceiling pressure.

---

## 9. Residual register

Each entry names an owner, an instrument, and the step that measures it. Per
DEV_LOOP, a residual not in `docs/BACKLOG.md` does not exist - the orchestrator
files these at disposal/push.

| ID | Residual | Owner | Instrument | Step |
|---|---|---|---|---|
| RES-1 | **Audit-trail capability lost.** Removing the log deletes the only durable record of live-gradebook posts (section 2); instructor can no longer answer "who/what/which assignment/what did Canvas say" after reload, nor download CSV/JSON. | Repo owner (product decision - accept, or replace with a lighter record later) | n/a (a capability judgement; no test) | Owner's next batched decision; filed as a backlog row if a replacement is wanted |
| RES-2 | `summarizeScoreSpread` (`repoGradeScoreDisplay.ts:126`) is now production-unreferenced but exported and tested. Recommend LEAVE (zero tsc/lint cost, tested). | Repo owner | `grep -rn summarizeScoreSpread src` (one prod caller gone) | Owner rules leave vs remove-with-test; if remove, a follow-up edits `repoGradeScoreDisplay.ts` + its test |
| RES-3 | `linkUsernamesLogDetail` (`linkRepoUsernames.ts:121`) same situation (only caller was `index.tsx:472`). Recommend LEAVE. | Repo owner | `grep -rn linkUsernamesLogDetail src` | Same as RES-2 |
| RES-4 | The lifecycle test's per-outcome LOG-KIND assertions are deliberately dropped (item 5); their subject (the log) no longer exists. The concurrency/status-line/trends/cell-error coverage is kept. | Implementer (this wave) | `useRepoGradesBulkGrade.lifecycle.test.ts` passing after rewrite | Verified in this wave's test run |
| RES-5 | "The view shows no Activity log" is an owner walk - no component is rendered by any test here (AC-8). | Repo owner | Manual: open Repo Grades, select a course | Owner walk post-ship |
| RES-6 | `docs/REGRESSION.md` entries describing the activity log (e.g. entry 333, the truncation/rubric-in-log notes) become stale. | Orchestrator | `grep -a "activity log\|ta-repo-grades-log" docs/REGRESSION.md` | Reconciled at the push, per DEV_LOOP's REGRESSION/backlog reconciliation |
| RES-7 | Dead log-only CSS classes (`.logPanel` etc., section 3b) have NO enforcing instrument here (CSS-module class usage is not statically gated). Recommend removing them in this wave for hygiene; if missed, nothing reddens. | Implementer (this wave) | None automated - reading only | Removed in this wave's CSS edit; owner may skip |
| RES-8 | Stale comments naming the deleted panel/module/symbol: `LinkUsernamesPanel.tsx:52,221`, `repoGradesBulkGrade.ts:151`, `useRepoGradesRubricSource.ts:112`, `repoGradeScoreDisplay.ts:123`, plus prose in `repoGrades.wiring.linking.test.ts:82`, `repoGrades.wiring.test.ts:33,110,432`, and the rubric-picker describe title (section 4 item 6). None break tsc/eslint. **Policy:** comments in files ALREADY in the write set (`useRepoGradesBulkGrade.ts:16-21,111`, `repoGradesUiState.ts:583`'s `parseLogByCourse` mention, and the two reworded test files/titles) are reworded in-pass by the implementer at no blast-radius cost. Comments in files NOT otherwise edited (`LinkUsernamesPanel.tsx`, `repoGradesBulkGrade.ts`, `useRepoGradesRubricSource.ts`, `repoGradeScoreDisplay.ts`) are LEFT as residual to avoid widening the write set for prose; owner may schedule a hygiene sweep. | Implementer (in-pass) / owner (the four non-edited files) | Reading only - no automated gate | In-pass for write-set files; a later hygiene row for the four others |

---

## 10. What I could not determine in this environment

- AC-8 / RES-5 (the rendered view has no Activity log): not verifiable here - no
  component is rendered by vitest. Owner walk only.
- RES-1's real-world impact (whether any instructor relies on the downloaded
  audit record): a product judgement, not measurable from the tree.
