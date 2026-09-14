# Grading-path survey: recording / snapshot / zip-upload methods vs the N-series patterns

Owner's ask, verbatim: "sweep all other grading by recording/snapshot/zip
upload methods and find those that would benefit from the recent work on
discussion board and assignment grading."

This is a survey only. No file under `src/` was changed. One deliverable:
this document.

## 0. What "the recent work" is, measured

`grep -an "^## 41[5-9]\." docs/REGRESSION.md` (also re-run as `grep -a`,
same result - see note at the end of section 1) returns entries 415-419:

- **415** (G1, exemplar fetch): a `Promise.race` bound plus a four-state
  status (`loading` / `loaded` / `failed` / `timedout`) instead of two
  booleans - the false-claim family, pattern 1.
- **416** (N4, accommodations): AC states "a failed fetch is NOT rendered as
  an empty list" - pattern 1 again, plus a privacy-surface pattern that has
  no counterpart in the five listed here.
- **417** (N5, ZIP intake): refuse-rather-than-truncate stating both numbers
  (pattern 2) and JPEG re-encode to keep a hard-coded `mimeType` true
  (pattern 3).
- **418** (N1, role suggestion): suggest-and-confirm (pattern 4) and a
  call-site canary pinning `setRole` (pattern 5).
- **419** (G6, courseId trim): trim at the seed rather than widen a boundary
  - a variant of pattern 1 (empty-vs-not-queried).

## 1. How the candidate set was found

Starting points named in the task, expanded by directory listing
(`ls src/app/components`) and two greps:

```
grep -rn "callLlm(" src/ --include=*.ts --include=*.tsx | grep -v "\.test\." | wc -l   -> 124
grep -rn "inlineData" src/ --include=*.ts --include=*.tsx | grep -v "\.test\."
```

The `inlineData` grep is the master list of every vision-model call site in
the repo (13 non-test hits). Of those, the ones that are actually a
**grading** path (score a submission, or gate whether/what gets posted to a
gradebook) are:

- `src/app/actions/snapshot-grade.ts:92`, `snapshot-read.ts:52` - already the
  source of 417/418, used as the reference, not surveyed as a candidate.
- `src/app/actions/grading-submission-extract.ts:100` - screen-recording
  grading (extraction phase).
- `src/app/actions/legibility-probe.ts:50` - a pre-grading readability check
  for the same screen-recording feature.
- `src/app/actions/discussion-replies.ts:203`, `message-replies.ts:131` -
  discussion board / message replies. These are the *source* of the
  "recent work" comparison (message-replies ships the same shape), not a
  gap to find - excluded as candidates, included as the reference standard.
- `src/app/actions/module-content-extract.ts:125`, `canvas-accessibility.ts:37`,
  `media.ts:501,547` (`describeScreenRecordingAction`,
  `generateVideoNarrationAction`) - checked and ruled **out of scope**: none
  of these assigns a score, posts a grade, or gates what gets posted. They
  caption/narrate/accessibility-check content. Verdict: NOT-APPLICABLE
  (wrong feature class), not surveyed further.
- `llm-content.ts`, `shared.ts`, `lib/llm-files.ts`, `lib/grade/engine.ts`,
  `lib/llm.ts` - type definitions or a generic multi-file image path
  (`shared.ts:188`) whose `mimeType` is NOT hard-coded (`img.mimeType`, a
  variable) - pattern 3 does not apply there by construction; not a
  candidate.

Beyond vision calls, the task also names ZIP upload and repo/GitHub grading.
Directory sweep of every grading-adjacent folder
(`src/app/components/{recording,snapshot-grading,repo-grades,github-grading,
grading-recording,grading-results,drafted-grades,content-tab}`) plus their
server actions produced the candidate set in section 2. `message-replies/`
and `recording/discussion-*` were read as the **reference** (what "already
benefited" looks like), not re-surveyed as candidates, since they are named
in the ask as the source of the pattern, not a sweep target.

23 candidate files/paths were opened and read (listed with their verdicts in
section 2); of those, 9 are reported here as distinct verdict rows (grouped
by mechanism rather than by file, since several files share one verdict).

## 2. Per-path table

| # | Path (feature) | Pattern checked | Verdict | Evidence |
|---|---|---|---|---|
| 1 | Screen-recording grading extraction (`extractGradingSubmissionsAction`, `src/app/actions/grading-submission-extract.ts`) | 1 - false-claim family | **NOT-APPLICABLE (already shipped, independently)** | `grading-submission-extract.ts:16-40` documents "R1a - THE EMPTY-VS-NOTHING DISTINCTION" with three named outcomes (confirmed-empty / skipped-unnamed / hard error), predating this task's N-series citation. `src/app/components/grading-recording/grading-extraction-outcome.ts:1-84` renders all three as distinct notices, with `isDangerNotice` giving "skipped-unnamed" the same urgency as a hard error (:36-38). This is the SAME distinction pattern 1 asks for, done under a different ruling (docs/grading-via-recording-acceptance-criteria.md R1a, per the file's own header), before entries 415/416 existed. |
| 2 | Same feature, roster name matching (`grading-roster-match.ts`) | 4 - suggest-and-confirm vs inference | **NOT-APPLICABLE (already shipped)** | `grading-roster-match.ts:1-27` header: four outcomes (matched/ambiguous/unmatched/no-roster) rather than collapsing to a binary; the matched name is never written back into `studentName` (`grading-row.ts:108`, confirmed by grep - `nameMatch` and `rosterCandidates` are separate fields, never assigned into the row's name field: `grading-rows.ts:166-168` `applyRosterMatch` only ever writes `nameMatch`/`rosterCandidates`). `GradingTableRow.tsx:95,101` render it as a badge, not an applied value. Posting a score is a separate explicit action regardless of `nameMatch`. |
| 3 | Same feature, frame-count cap wording (`grading-submission-extract.ts:91`, `legibility-probe.ts:43`) | 2 - refuse rather than truncate, stating both numbers | **MISSING (small)** | Both refuse correctly (`if (frames.length > GRADING_EXTRACT_BATCH_SIZE) return { error: "Too many frames in one batch." }` at `grading-submission-extract.ts:91`; `"Too many frames in one probe batch."` at `legibility-probe.ts:43`) but neither error string names the actual count or the cap, unlike N5's ZIP-intake refusal which "states both numbers" (entry 417b). **Reachability caveat, checked**: the sole caller uses `takeFrameBatch(GRADING_EXTRACT_BATCH_SIZE, EXTRACT_BATCH_WIRE_BUDGET)` (`GradingRecordingPanel.tsx:406`) and `takeFrameBatch(PROBE_MAX_FRAMES, ...)` (`LegibilityProbeModal.tsx:183`), so today this branch is defense-in-depth, not reachable through the UI - same shape as G6's "latent, not live" finding (entry 419a). Low value, sized in section 3. |
| 4 | Same feature, screen-frame source (JPEG-hardcoded `inlineData`) | 3 - JPEG re-encode to keep a hard-coded mimeType true | **NOT-APPLICABLE** | Frames reaching both actions come from `takeFrameBatch`, which reads the SAME capture queue `useDiscussionCapture.ts` fills via `canvas.toDataURL("image/jpeg", FRAME_JPEG_QUALITY)` (`useDiscussionCapture.ts:263,280` - the "LP3 FIX" already cited in `LegibilityProbeModal.tsx:180-188` as the mechanism that keeps the reported quality honest). There is no file-upload or extraction path here that could hand these actions a non-JPEG byte stream - unlike N5's ZIP intake, there is no ZIP/archive producer feeding this action. Canary that the search itself works: the same grep found the real hit at `snapshot-grade.ts:92` (section 1). |
| 5 | Repo Grades: data loading (`useRepoGradesData.ts`, courses/scan/roster/assignments) | 1 - false-claim family | **NOT-APPLICABLE (already shipped)** | Every fetch is stored as `{ key, data, error }` and matched against a request key before being trusted (`useRepoGradesData.ts:86,93-96,304-307,315-318` for courses/scan; same shape repeated for roster/assignments/export at `:121,207-222`), so `loading` (`result === null`), `error` (non-null `error`), and a genuinely empty `data` are three distinct read positions, not one boolean. This is the SAME discipline the 415 fix introduced for exemplars, already present here under different naming (`KeyedResult`), predating this survey. |
| 6 | Repo Grades: GitHub-username-to-roster linking (`linkRepoUsernames.ts`, `rosterUsernameOverlay.ts`, `acceptBinding`) | 4 - suggest-and-confirm vs inference | **NOT-APPLICABLE (already shipped, stricter)** | `linkRepoUsernames.ts:9-16` states explicitly: "linking a username does NOT confirm a repo binding... classifies the row as `state: \"suggested\"`... every string this module produces about a successful link says 'suggested', never 'linked' or 'confirmed'." The one commit action, `acceptBinding` (`useRepoGradesData.ts:498`), has exactly one call site (`index.tsx:432`), and `repoGrades.wiring.test.ts:1-13` is a click-gating text-scan guard (with its own canary `describe("canary...")` block per the file's header, proving the scan function can tell a gated call from an unguarded one BEFORE trusting it against the real file) - a stronger version of 418's `setRole`-callsite pin, since it also covers `gradeRepoAction`/`postCanvasGradesAction`, not just one setter. |
| 7 | Repo Grades: bulk AI grading (`repoGradesBulkGrade.ts`, `useRepoGradesBulkGrade.ts`) | 2 - refuse rather than truncate at a budget | **NOT-APPLICABLE** | No file-count or byte cap exists on the bulk-grade batch; concurrency is bounded (`repoGradesBulkGrade.ts:136-139`, below `DEFAULT_TREE_SCAN_CONCURRENCY`) but every target is eventually processed, and a per-target failure is reported per-target (`useRepoGradesBulkGrade.ts:307`, "single failed grade... never aborts the rest" per its own comment) rather than the whole batch being silently cut. There is no budget being refused against, so pattern 2 does not apply here - this is throttling, not truncation. |
| 8 | Repo Grades / grading-results: no vision calls at all | 3 - JPEG re-encode | **NOT-APPLICABLE** | `grep -rn "inlineData" src/app/components/repo-grades src/app/components/grading-results src/app/components/drafted-grades src/app/components/github-grading` returns zero hits (re-run, zero matches). Repo grading reads code/text, not images; pattern 3 requires an `inlineData` call site with a literal `mimeType`, which does not exist in this feature family. |
| 9 | `describeScreenRecordingAction` / `generateVideoNarrationAction` (`src/app/actions/media.ts:477-565`) - captioning/narration keyframes | 1, 2, 3 (all) | **NOT-APPLICABLE (wrong feature class)** | Neither function assigns a score, reads a rubric, or posts anything to a gradebook - both return caption/narration text for an authored video. Confirmed by reading both functions in full (`media.ts:477-565`) and their callers: no caller under `src/app/components` imports either for a grading surface (`grep -rn "describeScreenRecordingAction\|generateVideoNarrationAction" src` shows only the two definitions and their own file's internal use). Excluded from the grading sweep on that basis, not evaluated further against the five patterns. |

## 3. Findings sized as chunks

Only one genuine gap surfaced across the sweep; everything else in this
family had already been through an equivalent (often stricter) treatment
under earlier rulings (R-series/U-series, cited in the files' own headers)
before the N-series work this task points at existed. Padding the table with
manufactured findings against code that already carries the property would
misrepresent the sweep, so the list below is short on purpose.

1. **State both numbers in the two frame-count-cap refusals in
   grading-recording.** `src/app/actions/grading-submission-extract.ts:91`
   and `src/app/actions/legibility-probe.ts:43` refuse correctly (no
   truncation) but the error text omits the actual count and the cap, unlike
   N5's ZIP-intake refusal. One-line justification: matches an established
   in-repo wording convention (417b) at near-zero cost, even though the
   branch is not reachable through today's UI (row 3 above) - fix it anyway
   because a future caller of either action that does not route through
   `takeFrameBatch` would otherwise regress into the exact silent-shape
   this survey was asked to check for. Sized: a two-line change to two error
   strings, no new tests beyond updating the two existing string-literal
   assertions if any pin the current wording (checked: none do -
   `grep -rn "Too many frames in one batch\|Too many frames in one probe batch" src` finds only the two production sites, no test pins the literal text).

No other item from this sweep is being filed. Rows 1-2 and 5-8 above are
recorded as NOT-APPLICABLE with evidence rather than converted into backlog
items, per the task's instruction that a legitimate NOT-APPLICABLE result is
more useful than invented work.

## 4. Residual register

| Residual | Owner | Instrument | Step that will measure it |
|---|---|---|---|
| Whether the two frame-count-cap branches in grading-submission-extract.ts / legibility-probe.ts are truly unreachable through every current and future caller, not just `GradingRecordingPanel.tsx` / `LegibilityProbeModal.tsx` today | whoever files the chunk in section 3 | `grep -rn "extractGradingSubmissionsAction\|probeFrameLegibilityAction" src` re-run at fix time, checked against every call site found | the fix's own PR/wave gate |
| Whether repo-grades' click-gating text-scan guard (`repoGrades.wiring.test.ts`) still passes its own canary after any future refactor of `RepoBindingControl.tsx`/`RepoGradeCellControl.tsx` | next agent touching those files | the existing canary `describe` block in that test file | that file's own test run, part of any wave gate touching those components |
| Whether the recording-based grading extraction (`extractGradingSubmissionsAction`) is reachable end-to-end today, beyond the one call site cited (`GradingRecordingPanel.tsx:419`) - the action's own header (`grading-submission-extract.ts:60-64`) still says "NOT YET WIRED TO A PRODUCTION CALLER", which reads stale against the call site found, but was not independently re-verified beyond that one grep | next agent working in `grading-recording/` | `grep -rn "extractGradingSubmissionsAction" src` plus a manual trace of the button that triggers `runExtraction` | not scheduled here - flagged so the next reader does not trust the header comment over the grep |

## 5. Confidence

Least confident in:

- **Row 3 / section 3's finding.** I verified the two error-string sites and
  their one call site each, but I did not exhaustively verify every possible
  future caller does not exist (the header-comment discrepancy noted in the
  residual register above is exactly this kind of risk - a comment claiming
  "no caller" while a caller exists elsewhere in the tree).
- **Row 9 (media.ts exclusion).** I read both functions in full and grepped
  for callers, but did not trace every route/API handler that might reach
  `describeScreenRecordingAction` indirectly through a workflow step; the
  exclusion rests on "no score, no rubric, no gradebook post" being visible
  in the function bodies themselves, which I did verify by reading them.
- **The `grep -a` requirement on REGRESSION.md.** Measured directly: both
  `grep -c` and `grep -a -c` for the section-415-419 anchor pattern returned
  the same count (5) in this run. I could not reproduce the byte-content
  reason `-a` is required elsewhere in that file (the instruction states it
  as a standing fact from a different search), so I am reporting what I
  measured rather than asserting the discrepancy exists for this particular
  pattern.
