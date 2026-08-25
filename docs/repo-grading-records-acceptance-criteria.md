# Records for the other two repo-grading paths

Three code paths grade student GitHub repos. Entry 333 gave one of them a
downloadable record; this document covers the other two, which are gaps of
DIFFERENT KINDS and must not be given the same fix.

| Path | Today | Gap |
| --- | --- | --- |
| Repo Grades view | localStorage activity log, CSV/JSON download (entry 333) | none |
| Grading tab -> "Grade from: GitHub Repo" (`GithubGradingPanel`) | results live in React state only | **the run is lost on reload** |
| `grade-repo` / `batch-grade-repos-to-draft` steps, attended AND cron | a `grading_drafts` row | **no record of the run itself** |

## R1 - the workflow path: a per-repo run record

**R1.1 - THE DRAFT IS NOT A RECORD OF THE RUN.** A draft row lists the repos
that produced a grade. It cannot answer the question that actually matters
after an unattended batch: *what did not make it in, and why.* A scheduled run
over 30 repos that grades 22 and skips 8 lands a draft of 22 and says nothing
about the other 8. The skips are already classified in the code (no matching
folder, no binding, a fetch failure, a model error) - they are simply discarded.

**R1.2 - RECORD ONE ENTRY PER REPO ATTEMPTED**, not per repo graded: the repo,
what happened (`graded` / `skipped` / `failed`), the reason for anything that is
not `graded`, and the score when there is one. An entry means an attempt
finished; a repo the run never reached is not an entry (and R1.5 covers that
case separately).

**R1.3 - IT TRAVELS WITH THE DRAFT.** The log is written onto the
`grading_drafts` row the run already creates, in the same write - not a second
row, not a follow-up patch. Entry 340 records what a follow-up write costs: a
failure on it misreports the primary write's outcome. If the draft save fails,
the log goes with it; that is correct, since there is then nothing to attach it
to.

**R1.4 - AN UNATTENDED RUN ALSO LEAVES A FILE.** The cron path has nobody
watching, and the Drafted Grades tab only shows a badge once a draft exists.
So an unattended repo-grading run additionally persists a Markdown report
through the existing `saveRecordingFile` deliverable path the cron route
already uses for other step types - so a run that graded NOTHING (every repo
skipped) still leaves a trace, which is precisely the run a draft cannot
represent. An attended run does not need this and must not create the file.

**R1.5 - A RUN THAT DIED MID-BATCH MUST SAY SO.** If the step is cut off (the
60-second cap, a thrown error), the record must distinguish "these repos were
attempted" from "the run ended before reaching the rest". Silence about the
remainder reads as "there were none".

**R1.6 - DOWNLOADABLE FROM DRAFTED GRADES.** CSV and JSON, reusing
`escapeCsvValue` (`src/lib/course-tasks-view-csv.ts`) and `triggerFileDownload`
(`src/app/components/course-planning/utils.ts`) - never a hand-rolled escaper
or object-URL dance (REGRESSION entry 267 check 4, and entry 333's own reuse).

## R2 - the Grading tab's GitHub panel: stop losing the run

**R2.1 - THE GAP IS PERSISTENCE, NOT DOWNLOAD.** `GradingResults` already has
an Export CSV button, and it already works for this path. What fails is that
the run itself is React state: reload, switch tabs and back, or close the
laptop, and every score and comment is gone - along with the only opportunity
to export them. The instructor has already paid the model cost per repo.

**R2.2 - PERSIST THE LAST RUN UNDER A `ta-` KEY**, restored on mount, per this
repo's standing rule that UI state survives a reload. The panel already
persists its QUEUE (`ta-github-grading-queue`) and not its RESULTS, which is
the asymmetry to fix.

**R2.3 - NEVER TRUST STORED DATA.** A malformed or partial blob restores as
"no run", never as a crash - the posture `parseRepoGradeLogEntries` and
`parseAssignmentMapByCourse` already take.

**R2.4 - PERSIST THE RESULTS, NOT THE SUBMITTED FILE BYTES.** `grading_drafts`
already strips those before storing (`saveGradingDraftAction`); localStorage
has a far smaller budget and must strip at least as much. A quota failure
loses persistence for that run and nothing else.

**R2.5 - A RESTORED RUN MUST BE OBVIOUSLY RESTORED**, not passed off as fresh:
say when it was graded. An instructor who cannot tell a restored run from a new
one may post stale scores believing they just produced them.

## R3 - what is NOT in scope

Not posting to Canvas from the GitHub panel. `GradingResults.tsx:301` documents
why it is absent and it is deliberate, not an oversight: results carry Canvas
user ids only when they came from Canvas, "which is exactly when posting back
applies." Do not add a post path here.

## R4 - gates

`npx eslint` clean on every touched path; `npx tsc --noEmit` clean; full
`vitest run` green from the 13639 baseline measured at dispatch; `npx next
build` reaching "Compiled successfully" and "Finished TypeScript". Every
decision pure and tested - vitest here is node-env and collects only
`src/**/*.test.ts`, so nothing rendered is ever exercised.
