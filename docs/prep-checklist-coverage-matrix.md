# Course-prep checklist: automation coverage matrix

The ask: every checklist item in the course prep table should have an automatic
action available on the Manual/LMS tab, in as few clicks as possible.

This document is the analysis that has to come first, because the ask cannot be
taken literally. The checklist is the **Term Setup** view of the Tasks tab -
40 items from `TERM_TASKS` in `src/lib/course-tasks-catalog.ts`. A meaningful
number of them describe things that happen in a room, in a filing cabinet, or in
the college's own SIS. Building "automatic actions" for those would be theatre.

## What is already true

**All 40 items are pure manual ticks.** A cell cycles `open -> done -> blocked ->
na` via `nextTaskStatus`, and `setTaskCellStatus` is the only writer. Nothing
derives completion from real state.

**Except one, and that is the whole design.** `createSyllabusAckQuizAction`
(`src/app/actions/lms-syllabus-buttons.ts`) already calls
`markSyllabusAckTaskDone`, which patches `course_tasks.statuses` through
`setCourseTaskCellsAction`. So a one-click LMS button already completes a
checklist item today. The mechanism does not need inventing - it needs
extending.

Two decisions inside it are worth copying verbatim:
- It marks the task on BOTH the create and the already-exists path, because the
  item asks "Quiz Added?" and the answer is yes either way. Marking only on
  creation leaves the checklist permanently open for any course whose quiz
  predates the button.
- A checklist failure never fails the action - it appends
  `(could not update the Tasks checklist: ...)` to the message. A stale checkbox
  is strictly better than losing Canvas work that already succeeded.

**The click floor is 3-4** before any action starts: Manual -> LMS -> sub-view ->
select a course. So "as few clicks as possible" concretely means each covered
item must cost **+1**.

## The four categories

### A. Covered by an existing action, needs only the checklist write (2)

The cheapest work in the whole feature.

| Item | Existing action |
|---|---|
| Syllabus Acknowledgement Quiz Added? | `createSyllabusAckQuizAction` - ALREADY marks it |
| Syllabus Added to LMS? | `generateAndInsertSyllabusAction` - one-click today, does NOT mark it |

The second is a live gap: the app demonstrably adds the syllabus and the
checklist stays open.

### B. Automatable by sequencing actions that already exist (roughly 14)

These follow the `lms-syllabus-buttons.ts` pattern - resolve the course row,
idempotency-check, sequence proven actions, name every partial failure, mark the
task, reload. Short enough to run synchronously inside one request.

- LMS Shells Populated? (`lms-modules` / `lms-populate`, or bulk create modules)
- Labs Added? / Lectures Added? (class-session template, prepare-lecture)
- Deadlines Added? (`setModuleDueDatesAction`, already behind SchedulerModal)
- Points Added? (`bulkUpdateAction`)
- All Modules and Assignments Published? (bulk publish - exists as both a bulk
  bar action and a `bulk-publish-modules` step)
- Course Published? (Canvas course-level publish)
- External Grade Set to Percentage? (Canvas course settings)
- Links Validated? (`check-broken-links` step exists)
- Accessibility at 100%? (`api/accessibility` exists, plus AccessibilityCenter)
- Tests Made? (`generate-test-from-template`)
- Welcome Note Scheduled in LMS? / Closing Note Scheduled in LMS?
  (`createAnnouncementAction` already takes `delayedPostAt`)
- Digital Office Hours Linked and Checked?

### C. Derivable from state already in the app - no action needed, just a read (roughly 9)

These do not need a button at all. Their answer is already sitting in
`course_hub` or in Canvas, and the honest fix is to compute the tick rather than
ask the instructor to confirm what the app can see.

- Course Accessible in LMS? (can the course be fetched at all)
- Updated Syllabus Template Obtained? (a template resolves for the course or its
  institution)
- Textbook Location Specified? / Textbook Specified for Students? / Syllabus or
  Course Objectives Owned? / Syllabus Upload Location ID'ed? / Method of
  Populating LMS Shells Identified? (non-empty `course_hub` columns)
- Dates Chosen for Tests? (quizzes carry due dates)
- Lecture room # / class days / times obtained? (meeting fields, if populated)

This category is worth more than it looks: it removes clicks entirely rather
than reducing them to one.

### D. Not automatable by anything, and should be said so (roughly 12)

- Course Evaluation Form Owned?
- Lecture room code / fob obtained?
- Textbook Owned?
- Run Through Projects/Homework on My Own?
- Instructor/Student Versions of Software Obtained?
- Lecture/Lab Practiced in Classroom?
- Standups Implemented?
- Updated for FERPA and Title IX? (judgement)
- All Modules Double Checked? (judgement - and automating it would defeat it)
- Syllabus Uploaded to College? (the college's own system)
- Census Entered? / Midterm Grades Entered? / Final Grades Entered? (SIS;
  Canvas-side posting exists via `post-grades`, but "entered" here means the
  institution's system)

For these the right product answer is NOT a fake button. It is to stop implying
one is missing - the checklist should distinguish "nobody can automate this"
from "not automated yet", so the instructor's attention goes where it counts.

## The shape of the fix

**One button, not fourteen.** The strongest reading of "as few clicks as
possible" is a single **Run course prep** action on the LMS tab that executes
every category-B item that is not already satisfied, skips the ones that are
(idempotency-checked, exactly like the ack quiz), refreshes every category-C
derivation, and reports one summary naming what it did, what it skipped and why,
and what it could not do. Per-item buttons remain available for granular
control, but the default is one click.

**Two execution shapes, and the repo already has the classifying rule.** Short
side-effecting work runs synchronously through the `lms-syllabus-buttons.ts`
pattern. Anything that cannot finish inside the 60-second function cap -
generating a term's lectures, Course Refresh - must be kickoff-plus-poll,
reusing the unattended runner so it inherits the Files-tab deliverable badge and
the run report for free.

**Derivation must never un-tick a manual tick.** An instructor who marked
something done, or `blocked`, or `na`, has said something the app does not know.
Derivation may fill `open` cells; it must not overwrite a human's answer.
