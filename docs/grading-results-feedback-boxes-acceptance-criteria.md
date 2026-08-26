# Three independent feedback boxes per grading result row - acceptance criteria

Requested 2026-08-26, verbatim: "i also need mult textboxes for each grading
results row - one textbox for what students did well, one textbox for what
they could do better, one textbox telling the student they can resubmit. all
should be copyable independently of each other".

Surface: `src/app/components/GradingResults.tsx`, which today renders ONE
"Overall feedback" box per student row with its own Copy button (`:820-900`).

## What the research pass established (read this before designing anything)

**Box 3 already exists as content.** `RESUBMIT_NOTICE`
(`src/lib/grade/types.ts:7-8`) is a fixed string - "You are welcome to
resubmit this assignment, and I will regrade it with no late penalty." -
that THREE producers already append into `overallComment` whenever points
were deducted: `engine.ts:69-71`, `embedded-grader/index.ts:165-166`,
`embedded-grader/discussion.ts:213-214`. So the third box is a DE-MERGE of
text the app already writes, not new content.

**Box 2 is currently forbidden by the shipped prompt.**
`src/lib/grade/prompts.ts:79` instructs the model: do not include
suggestions for how the student could improve, next steps, or advice for
future work, and do not coach the student on getting better. Adding an
"what they could do better" box therefore REVERSES a deliberate policy
decision. The instructor asked for it explicitly and that is their call, but
it must be recorded as a policy change, not slipped in as a UI change.

**This kills the cheap implementation.** Splitting the existing text
client-side cannot work, because the improvement text was never generated.

## A1 - The three fields

1. `GradeResult` (`src/lib/grade/types.ts`) gains three REQUIRED fields:
   `strengths`, `improvements`, `resubmitNotice`. Required, not optional -
   that turns every "silently dropped the new field" site into a `tsc` error
   instead of a runtime surprise (see A5).
2. `overallComment` is RETAINED, and becomes the composition of the three.
   Roughly 32 downstream files read it; retaining it is what keeps them
   working. It is derived, never independently authored.
3. `resubmitNotice` keeps `RESUBMIT_NOTICE`'s exact current wording and its
   exact current condition (present when points were deducted, empty at full
   credit). It is a promise about instructor policy and must be identically
   worded everywhere, so it is NOT model-generated and NOT reworded.
4. `improvements` requires the prompt change described above
   (`prompts.ts:79`). The prompt must ask for improvement guidance in its own
   field rather than merely deleting the prohibition, so the model cannot
   scatter coaching back into the other two boxes.
5. No per-course resubmission policy field is added. There is no policy field
   on the course row (`courses.types.ts:62-253`), and the natural future home
   is `institution_pages` / `renderInstitutionPolicyText`, not a new column.
   Out of scope, named so nobody invents one.

## A2 - The UI

6. Each result row renders THREE labelled textareas instead of one, each
   independently editable and each with its OWN copy control - the
   instructor's explicit requirement.
7. Each copy control's accessible name distinguishes both the box and the
   student, since many rows are on screen at once (today's is
   `Copy overall feedback for ${result.student}`, `:833`). Three per row
   times N rows means the name must carry both facts or the page becomes
   unusable with a screen reader.
8. The existing expand-to-modal affordance (`:846-892`) applies per box, and
   its accessible name carries the same two facts.
9. Match the file's existing visual language exactly. No emojis anywhere.
10. Click cost: three boxes must not triple the work of the common case.
    A single control that copies all three composed together stays available
    alongside the three independent ones.

## A3 - Persistence

11. `GradingResults.tsx` persists NOTHING today: `useState(() =>
    seedEdits(run))` at `:257`, wiped on every run change at `:269-278`, no
    `localStorage` anywhere in the file. The standing project rule (every
    control persists across reload under a `ta-` key) is therefore ALREADY
    violated by the single box that exists.
12. The three-box version persists under an ASSIGNMENT-SCOPED key, e.g.
    `ta-grading-results-edits:${canvasUrl}`. Scoping matters: `edits` is
    keyed by bare student name, so an unscoped key leaks one assignment's
    feedback onto a different assignment's identically-named student.
13. Restore never trusts stored data, matching this repo's standing posture:
    malformed JSON, wrong types, or a student who is not in the current run
    degrade to the seeded value rather than throwing or resurrecting a
    phantom row.

## A4 - File size (do this FIRST)

14. `GradingResults.tsx` is 950 of the 1000-line cap. The feature costs an
    estimated 120-150 lines, so the extraction happens BEFORE the feature,
    as its own change: the pure helpers at `:57-199` (sort helpers,
    `seedEdits`, `recomputeTotal`, `buildCsvContent`) move to
    `grading-results/gradingResultsHelpers.ts`, about 145 lines out, landing
    the component near 805.
15. That extraction is worth doing on its own merits: vitest here is node-env
    and collects only `src/**/*.test.ts`, so nothing in this component is
    tested today - `buildCsvContent` and the copy handler have ZERO coverage.
    Extracting them makes them testable at all.

## A5 - What silently drops two thirds of the feedback (the highest-risk part)

16. `stripGradeResultForDraft` (`grading-review-rows.ts:33-49`) is an
    ALLOWLIST whose own comment says new fields are excluded by default.
    This exact bug already shipped here once, with `submissionTruncated`,
    and is documented at `github-grading-run-store.ts:70-80`. The three new
    fields must be added to that allowlist, and a test must prove a draft
    round-trip preserves them.
17. `GradingResults.tsx:322` and `:385` post `comment: edit.overall` to
    Canvas. If that keeps pointing at a now-stale field, Canvas receives the
    PRE-EDIT text, reports success, and writes to a live gradebook with no
    undo. This is the single most dangerous line in the feature.
18. `github-grading-run-store.ts:151-196` is the inverse trap: it
    HARD-VALIDATES fields, and `:196` makes one bad result invalidate the
    ENTIRE run. Copying that idiom for the new fields would erase every run
    already sitting in a user's localStorage. The correct pattern is
    documented in that same file at `:164-168` - degrade the one field to a
    default, never invalidate the run.
19. Every one of the remaining sites the research pass listed is checked by
    hand before this ships; making the fields required (A1 item 1) converts
    the first class of them into compile errors, but it does NOT catch the
    ones that read `overallComment` and would now show a composed string
    where a single box's text was intended.
20. CSV export (`:192`) and the Canvas comment must each have a DECIDED
    answer for what the three texts become, stated in the shipped entry:
    composed in a fixed order for the Canvas comment, and three separate
    columns for the CSV.

## A6 - Traps named so nobody walks into them

21. There are TWO unrelated functions named `formatFeedback`
    (`GradingResults.tsx:161` and `src/lib/grade/parsing.ts:232`). They are
    not interchangeable.
22. The LLM path's resubmit-notice append (`engine.ts:69-71`) is the one
    variant with NO test, while the embedded variants are tested. Moving the
    append will therefore fail the embedded tests loudly and the engine's
    silently - the engine path needs a test written BEFORE it is touched.

## A7 - Sequencing

23. This work does not begin until the rubric-picker chunk
    (`docs/repo-grades-rubric-picker-acceptance-criteria.md`) is pushed.
    Standing project rule: a new mid-chunk request gets research in parallel,
    but no code until the previous chunk lands.
24. Order within this feature: (1) the helper extraction of A4, pushed and
    green on its own; (2) the engine-path test of item 22; (3) the type and
    prompt change of A1; (4) the drop-site sweep of A5; (5) the UI of A2 and
    the persistence of A3.
25. `docs/REGRESSION.md` gets a BASELINE entry for the current single-box
    behaviour before any of it starts, in the same shape as entry 352.
