# Workflow run form - field reference

Detail that used to live inline in a run-form field's `help` text (or, for
"Outputs to generate," concatenated into every option's own label) but was
too long to keep there once each option started rendering a real,
identifiable label instead of a raw key. This file is where that prose
moved; the run form itself now shows only enough to identify each choice.

## Course Build - "Outputs to generate"

`select-course-outputs` (`src/lib/workflows/registry/steps.course-build-scope.ts`)
lets an instructor choose one, several, or all of thirteen output families for
this run. Blank means every family (the default - reproduces a full build). A
deselected family does no work this run: the generator that makes it stays in
the workflow and passes its files through unchanged, so the terminal Common
Cartridge export and zip always still run and still produce something.

| Option | What it produces |
|---|---|
| Assignments | Per-module assignments. |
| Module objectives | Per-module learning objectives. |
| Class openers | Per-module opening-of-class activities. |
| Lecture decks | Per-module slide decks, including the module introduction (rides as the opening slide's speaker notes - it is not a separate artifact). |
| Course guides | The Resources, Schedule, FAQ, and Instructor Contact guide documents. |
| Weekly announcements | Per-week announcement text. |
| Knowledge checks / quizzes | Per-module knowledge checks. |
| Significance of the Material | Per-week documents on why that week's material matters in the real world. |
| Instructor notes | Per-module notes (free-software alternatives, debugging help); published unpublished/invisible to students by default. |
| Codebase and associated assignments | Mimics the codebase kickoff workflow. Requires a codebase source - the "Codebase" source, or the repository already linked on the course tile ("The repository on the course tile" source). Producing nothing without one of those. |
| Start Here module | Seeds the Start Here module: a syllabus and syllabus-acknowledgement quiz always, and - only when a codebase is involved - a GitHub sign-up and username-submission assignment. |
| Anticipated lecture Q&A | Per-module anticipated student questions with instructor-ready answers, grounded in that module's own generated materials. |
| Current events | Per-module current-events research report, grounded in that module's own generated materials. |

A blank ("all") selection excludes the Codebase family specifically when the
run is not already anchored to a real repository - see that input's own
`isCodebase` comment in `steps.course-build-scope.ts`. An EXPLICIT "Codebase"
selection is unaffected by that rule; it always requests the family, and the
step throws its own named, actionable error if there is no repository to
attach it to.

## Course Build - "Course structure source"

`course-schedule-from-source` (`src/lib/workflows/registry/steps.course-schedule-from-source.ts`)
turns one of seven sources into the same week-by-week schedule shape the rest
of course setup consumes. Pick one; only its matching input on the run form
is used (and only that input is shown/required - see AC B3).

| Option label | Raw value | What it needs |
|---|---|---|
| A codebase | `codebase` | A repository (owner/name). |
| A typed course description | `course-description` | Free text describing the course. |
| An uploaded course cartridge | `course-cartridge` | A Common Cartridge (`.imscc`) file. |
| An uploaded syllabus | `syllabus-document` | A syllabus file (`.docx`, `.pdf`, `.txt`, or `.md`). |
| An existing LMS course | `existing-lms-course` | A Canvas course link, or - left blank - the selected course tile's own Canvas link (a Blackboard-tiled course has no such fallback and needs an explicit selection). |
| The course tile's saved LMS export | `tile-export` | Nothing beyond the course tile already selected elsewhere on this workflow - it reads the tile's own newest saved LMS export. |
| The repository on the course tile | `tile-repo` | Nothing beyond the course tile already selected elsewhere on this workflow - it reads the tile's own first linked repository. |
