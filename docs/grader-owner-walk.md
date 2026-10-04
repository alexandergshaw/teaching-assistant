# Grader owner walk: is the Chat grader fully functional?

Author seat: `loop-seat` (authoring, docs only). Consumer: the repo owner, after a
fresh `loop-checker` reads this. Written 2026-10-04 against HEAD `18eb17ad`
(`git rev-parse --short HEAD`), with the engine wave and the W1 driver wave
UNCOMMITTED in the working tree (`git status --short` shows modified
`engine.ts`, `parsing.ts`, `route.ts`, `useContinuousGradingRun.ts` and their
tests) and the W2 panel wave not started (`GradingChatPanel.tsx:175` still reads
`canvasUrl=""`, opened).

## READ THIS FIRST: why this is a walk and not a test

None of the checks below can be machine-verified in this repo. Nothing renders
under vitest (it is node-env and collects only `src/**/*.test.ts`), there is no
`.env`, no Gemini key, no live Canvas and no network (`docs/loop/this-repo.md`
section 6, opened). A green suite proves nothing about markup, focus, or what
the screen shows. Every check here is a thing only your browser, your Gemini key
and your Canvas can answer. Each one is OWNER-ONLY and is listed so it is not
forgotten, never so an agent can pick it up or fill in a result.

How to read each check:

- **Click path** = what to do. **Look at** = the one thing to inspect. **Pass**
  and **Fail** are written so exactly one applies; if neither applies, the check
  is **VOID** (record it, do not guess).
- **Closes** names the defect or criterion. Ids come from three sources, opened
  and cited per check:
  - SCOPE = `docs/grader-fully-functional-scope.md` (649 lines, `wc -l`)
  - W1 = `docs/grader-w1-test-notes.md` (138 lines, `wc -l`)
  - ENG = `docs/grader-engine-test-notes.md` (135 lines, `wc -l`)
- A check that depends on a wave that has not shipped will FAIL by design. That is
  the point: it tells you the wave is missing, not that the walk is wrong. Record
  the deployed build's commit hash (`git log --oneline -1` of the deployed ref)
  next to every result.

## Pre-flight (do once; 3 minutes)

| Step | Do | Pass |
|---|---|---|
| PF-1 | Record the deployed commit hash. | You have a hash. Without it no result below is attributable. |
| PF-2 | Confirm `GEMINI_API_KEY` is set in the deployment and you are signed in as the app owner (the Chat actions and `/api/grade-run-item` call `requireAppOwner`: `grading-chat-intake.ts:52,115`, `route.ts:147`, per SCOPE 2.1). | The Chat tab loads and a text submission in WK-14 grades. If not, every check is VOID. |
| PF-3 | Prepare the test kit below. Use a TEST Canvas course: WK-1 and WK-2 write to the live gradebook (the app says so itself: `GradingResults.tsx:325`). | Kit exists. |

### Test kit (owner-supplied; the repo has none of it)

- **K-A**: a Canvas ASSIGNMENT in a test course, URL form
  `https://<your-canvas-host>/courses/<id>/assignments/<id>`, with at least 3
  student submissions of visibly different quality. Call it ASSIGN-A. A second
  assignment ASSIGN-B in the same course with no grades for those students (to
  prove a post did not land in the wrong place).
- **K-B**: two `.docx` files both literally named `Assignment 1.docx`, different
  content, kept in two different folders (for example `student-a/` and
  `student-b/`). The composer takes ONE file per pick (`ChatComposer.tsx:87-90`,
  `files?.[0]`) and has no drop target (`grep -n "onDrop\|dragover"` over
  `grading-chat/*.tsx` returned nothing), so "drop" below means: File mode, "+",
  pick the first file; then again, pick the second.
- **K-C**: assignment instructions plus a 5-criterion rubric you wrote yourself
  (paste the same text into both walks so results compare).
- **K-D**: one text submission with PLANTED flaws. Before you submit it, write down
  on paper: 3 praise points it genuinely earns, and 3 deductions it genuinely
  deserves (each tied to a rubric criterion). WK-13 is scored against that list.
- **K-E**: the marker strings `OLD-SESSION-MARKER-1` and `OLD-SESSION-MARKER-2`.

### Labels this walk relies on, and where each was verified (opened, not recalled)

- Top tab "Tools": `tab-sections.ts:40`. Rail group "Grading", item "Chat":
  `manual-rail.ts:158`.
- Panel: fields "Assignment instructions" and "Rubric" (`GradingChatPanel.tsx:129,143`);
  button "New session" with a confirm dialog (`:162`, `:88`); persistent line "This
  session is not saved. Reloading or closing this tab loses every graded row and
  anything still grading." (`:33-34`); "Instructions and rubric are locked for this
  session." (`:159`).
- Composer: toggle Text / File / URL (`ChatComposer.tsx:102-108`); text field "Submission
  text" and "Label (optional)", button "Send" (`:131,142,147-148`); file "+" button,
  aria-label "Attach a file" (`:116`); URL field "Canvas or GitHub repo URL" and
  button "Add" (`:159,165-167`).
- Results table (`GradingResults.tsx`): heading "Grading Results" (`:555`); bulk button
  "Post N grade(s) to Canvas" (`:559`) with a confirm "Post N grade(s) to Canvas? This
  writes to the live gradebook." (`:325`); per-row button "Post to Canvas", which
  reads "Re-post" once posted (`:672`); per-row status "Posted to Canvas" (`:689`);
  failure status "Failed: <message>" (`:694`); summary sentence "Posted X of Y
  attempted." (`:415`).
- Feedback boxes: "What Went Well", "What Could Be Better", "Resubmission Note"
  (`gradingResultsHelpers.ts`, `FEEDBACK_FIELD_META`, opened); each box has an expand
  control titled "Expand feedback" (`RowFeedbackBoxes.tsx:138`).
- A row that was not graded carries the visible label "Not posted - grading failed"
  (`ungradedRowLabel.ts`, the `grading-failed` entry) and its feedback text starts
  "This submission could not be graded: " (`types.ts:11`).

**NOT in the tree when this was written, so named by role only:** the retry control
(WK-11) and the rubric display (WK-12). SCOPE section 6 row W2 says the panel will
carry a "Failed-submissions list with Retry" and mount `RubricProvenance` and
`GeneratedRubricCard`. Those two existing components render the literals "Rubric
used: <first 80 characters> (version <12 hex characters>)" (`RubricProvenance.tsx:20`
with `rubricProvenance.ts`, opened) and a collapsed disclosure titled "Rubric was
auto-generated from assignment instructions" (`GeneratedRubricCard.tsx:17`, opened).
If W2 ships different wording, judge by meaning as the Pass line states.

**Common click path, C0:** open the app, top tab **Tools**, rail group **Grading**,
item **Chat**. Every check starts here.

---

## Part A. The eight defects (G1 to G8), plus their live halves

### WK-1  A grade posted from a Canvas assignment URL lands on THAT assignment
THE "fully functional" check.
- **Origin / closes:** SCOPE G1, FF-L, FF-5, FF-R4, FF-R7 (the panel passing the URL is
  only a source-text pin; this is its real end). W1 Oracle 1 READ last hop and
  W1-R6.
- **Click path:** C0. Type K-C into Assignment instructions and Rubric. Composer toggle
  **URL**. Paste ASSIGN-A's URL into "Canvas or GitHub repo URL", click **Add**. Wait
  until the student rows appear in **Grading Results**. On ONE student's row click
  **Post to Canvas**.
- **Look at:** (1) the status text under that row's button; (2) in Canvas, open
  ASSIGN-A in SpeedGrader or the gradebook, find that student; (3) open ASSIGN-B for the
  same student; (4) compare the Total in the app row to the Canvas grade.
- **Pass:** the row shows "Posted to Canvas" AND in Canvas ASSIGN-A that student's grade
  equals the Total shown in the app row AND the feedback comment is on their submission
  AND ASSIGN-B has no new grade for them AND a different student's Canvas grade is
  unchanged.
- **Fail (any one):** the row shows "Failed: ..." (the old defect reads "Could not read a
  discussion or assignment from that URL", SCOPE G1, quoted from the scope, not run);
  or "Posted to Canvas" shows but Canvas has no grade; or the grade is on the wrong
  assignment or the wrong student; or the Post button is absent from a Canvas-URL row.
- **Void if:** you pasted a discussion URL, or the row has no Post button because the
  Canvas read returned no user ids (record which).

### WK-2  Bulk post writes every row to the same assignment
- **Origin / closes:** SCOPE FF-5 ("singly or in bulk to U"), FF-R4.
- **Click path:** continue from WK-1 in a FRESH session (C0, **New session**, confirm,
  repeat the URL submission for ASSIGN-A so all rows are unposted). Click **Post N
  grade(s) to Canvas** at the top of Grading Results, accept the confirm dialog.
- **Look at:** the sentence "Posted X of Y attempted." in the hint paragraph, and each
  row's status; then Canvas ASSIGN-A for every student.
- **Pass:** X equals Y equals the number of Canvas-URL rows, every row shows "Posted to
  Canvas", and every student's Canvas grade on ASSIGN-A equals that row's Total.
- **Fail:** X is less than Y with no per-row reason; or any row shows "Failed:" or a
  skipped reason you cannot explain; or any Canvas grade differs from its row.

### WK-3  Text and file rows show NO post control
- **Origin / closes:** SCOPE FF-5 ("a text/file/GitHub row shows no Post control",
  honest-limit F2=A).
- **Click path:** C0, **New session**. Toggle **Text**, paste any submission, click
  **Send**. Then toggle **File**, click **+**, pick any `.txt` file.
- **Look at:** the row for each, in Grading Results.
- **Pass:** neither the text row nor the file row has a "Post to Canvas" button and the
  top button "Post N grade(s) to Canvas" is not shown (while only these rows exist).
- **Fail:** any "Post to Canvas" control appears on a row that has no Canvas identity
  (it could only post to nowhere).

### WK-4  Two same-named files from different students make two distinct rows (G2)
- **Origin / closes:** SCOPE G2, FF-2. W1 Oracle 2. Frozen expectation (W1 Oracle 2):
  first claimant keeps `Assignment 1`, the second becomes `Assignment 1 (2)`.
- **Click path:** C0, **New session**, fill instructions and rubric. Toggle **File**,
  click **+**, pick `student-a/Assignment 1.docx`; wait for its row. Click **+** again,
  pick `student-b/Assignment 1.docx`.
- **Look at:** the student-name column, and then the edit slot. In the SECOND row's "What
  Went Well" box, type `EDIT-ROW-2`. Look at the FIRST row's same box.
- **Pass:** exactly two rows named `Assignment 1` and `Assignment 1 (2)` (first claimant
  unrenamed), each showing feedback about its OWN file's content, and `EDIT-ROW-2`
  appears in row 2 only.
- **Fail:** one row only; or two rows both named `Assignment 1`; or the first row was
  renamed; or `EDIT-ROW-2` appears in both rows (edit-slot collision, the defect); or
  row 2's feedback describes file A.
- **Variant (same pass/fail, 2 minutes):** in Text mode send two pastes both with Label
  `Same`; expect `Same` and `Same (2)`.

### WK-5  A NEW session never inherits a previous session's edited text (G3)
- **Origin / closes:** SCOPE G3, FF-3. W1 Oracle 3. READING claim in SCOPE (never run);
  this is the instrument that settles it. Note the stored-edits key for a non-empty
  Canvas URL is `ta-grading-results-edits:<canvasUrl>` and does NOT contain the session
  (`gradingResultsHelpers.ts:558-560`, opened), so variant (c) is the one most likely to
  fail even after the empty-URL case is fixed.
- **Click path, variant (a) New session, text:** C0. Send one text submission (it becomes
  `Submission 1`). In its "What Went Well" box type `OLD-SESSION-MARKER-1`; in "What Could
  Be Better" type `OLD-SESSION-MARKER-2`. Click **New session**, confirm. Send a DIFFERENT
  text submission (it becomes `Submission 1` again).
- **Click path, variant (b) reload:** repeat the first half of (a), then reload the page
  (instructions and rubric restore, rows are gone: see WK-6). Send a text submission.
- **Click path, variant (c) same Canvas URL:** C0, URL mode, submit ASSIGN-A, edit one
  student's "What Went Well" to `OLD-SESSION-MARKER-1`. Click **New session**, confirm,
  submit ASSIGN-A again.
- **Look at:** the "What Went Well" and "What Could Be Better" boxes of the first row of
  the NEW session (and, in (c), the same student's row).
- **Pass (all three variants):** the new row's boxes contain the model's fresh output for
  THAT submission and neither marker appears anywhere in them or in the Total.
- **Fail (any variant):** either marker appears in the new session's row.

### WK-6  Reload restores the three persisted controls; rows are disclosed as lost (FF-R1)
- **Origin / closes:** SCOPE FF-R1, H5, FF-12. Two repo statements conflict on whether a
  `localStorage`-seeded `useState` initializer ever shows after reload
  (`docs/grading-chat-architecture.md:822-829` says correct; `SnapshotGradingPanel.tsx:167-172`
  and backlog row `G2` say it does not; both cited in SCOPE H5). A FAIL here is a real,
  informative result. NOTE: backlog row `G2` (reload restore) is a different id from
  this document's defect G2.
- **Click path:** C0. Type text into Assignment instructions and Rubric; toggle the
  composer to **URL** (not the default). Reload the browser tab (F5). Return to C0.
- **Look at:** the two fields and the composer toggle. Then, with rows from an earlier
  session on screen before the reload, look for them after.
- **Pass:** both fields show exactly what you typed AND the toggle is on **URL** AND the
  grading rows from before the reload are gone AND the line "This session is not saved.
  Reloading or closing this tab loses every graded row and anything still grading." was
  visible before the reload.
- **Fail:** either field is empty after reload, or the toggle is back on **Text**.
- **Void if:** the build includes the durable row store (SCOPE W6 / FF-8, conditional on
  fork F4=A). Then rows should RESTORE instead and the disclosure copy changes; this
  walk does not cover that variant (see residual W-R1).

### WK-7  The "Posted" badge survives later rows arriving (G4)
- **Origin / closes:** SCOPE G4, FF-4, FF-5. W1 Oracle 4 and W1-R4: the unit test proves
  only that the key is stable; the badge is the seven-state survival, owner-only.
- **Click path:** C0, **New session**, submit ASSIGN-A by URL, post ONE student's row
  (**Post to Canvas**, wait for "Posted to Canvas"). Do NOT edit any grade or criterion
  score afterward: editing a number clears the badge by design
  (`GradingResults.tsx:251-256`, the B5 comment above `clearPostStatus`). Now toggle **Text** and
  **Send** three different text submissions, one after another.
- **Look at:** that first student's row after each of the three new rows lands, and the
  sentence that follows "Post N grade(s)..." in the hint paragraph if one was shown.
- **Pass:** that row still reads "Posted to Canvas" and its button still reads "Re-post"
  after all three new rows are present.
- **Fail:** the status disappears or the button reads "Post to Canvas" again (the
  double-post invitation, the defect).
- **Honest limit:** G4 resets seven pieces of state; only the badge, the summary
  sentence and the expand modal (WK-8) are visible here. The other four (code-run,
  code-running, code-output, browse-files) appear only on rows that offer those
  controls; if you see none, they are UNOBSERVED, not passed (residual W-R2).

### WK-8  An open expand modal does not close when rows arrive (G4)
- **Origin / closes:** SCOPE G4 (effect list), FF-4.
- **Click path:** C0, **New session**, Send ONE text submission and wait for its row.
  Then Send FIVE more text submissions quickly (Enter after each). Immediately, on row 1,
  click the **Expand feedback** control on its "What Went Well" box. Leave the modal
  open for 60 seconds.
- **Look at:** whether the modal is still open after 60 seconds; then close it and count
  the rows.
- **Pass:** the modal stayed open the whole time AND, when you closed it, 6 rows exist
  AND the row count at the moment you opened the modal was fewer than 6.
- **Fail:** the modal closed by itself.
- **Void if:** all 6 rows had already landed before you opened the modal (nothing
  arrived while it was open). Repeat with longer submissions.

### WK-9  A garbled or truncated model reply shows as a needs-retry row, not a grade (G5)
- **Origin / closes:** SCOPE G5, FF-6. ENG G5a/G5b (the mocked halves) and ENG section 9
  (live behaviour is OWNER).
- **How to cause it (try 1 first, 2 only if 1 never fails in 5 tries):**
  1. Use a rubric with 8 or more criteria and instructions that say "write at least 150
     words of explanation for every criterion", and submit a long text.
  2. Optional production configuration change, your call, revert afterwards: set
     `GEMINI_MAX_OUTPUT_TOKENS` to 512 in the deployment (`gemini.ts:124`). Do not go
     lower: caps below `GEMINI_MIN_OUTPUT_TOKENS` (default 512) are raised to it
     (`gemini.ts:68,178-189`, opened).
- **Click path:** C0, **New session**, submit the long text once per try.
- **Look at:** the row's name cell label, and all three feedback boxes of any row that
  fails.
- **Pass:** a failing row carries the label "Not posted - grading failed"; its feedback
  text starts with "This submission could not be graded: " followed by a cause (as of
  the uncommitted working tree the causes read "The model's response was cut off or
  blocked before it finished (...)" or "The model's response was not valid grading JSON";
  wording may change, record it verbatim); and NO box contains the raw model reply
  (nothing starting with `{` or containing `"overallComment"` or `"rubricResults"`); and
  it has no Post to Canvas button.
- **Fail:** any row WITHOUT the label whose boxes contain raw JSON, a blank `Overall`
  area with no score, or half a sentence of braces (a bad reply shown as a grade, the
  defect).
- **Void if:** you could not make a reply fail in 5 tries at the production setting AND
  you declined step 2. Record "not reproduced"; the mocked tests (ENG G5a-d) still hold.

### WK-10  How often production truncates grading output (FF-R2)
- **Origin / closes:** SCOPE FF-R2 and FF-12 ("a real Gemini grade on a 5-criterion rubric
  not truncated"); ENG residual FF-R2.
- **Click path:** C0, **New session**, K-C (the 5-criterion rubric), production
  configuration unchanged. Send 5 DIFFERENT realistic text submissions.
- **Look at:** count the rows labelled "Not posted - grading failed" whose cause names a
  cut-off or invalid reply (WK-9 wording).
- **Pass:** 0 of 5.
- **Fail:** 1 or more of 5. Record N and the count, and the value of
  `GEMINI_MAX_OUTPUT_TOKENS` in force; whether to raise it is your decision (the sources
  do not decide it; this is the measurement SCOPE FF-R2 asked for).

### WK-11  A failed row is retried IN PLACE, with no duplicate (G6)
- **Origin / closes:** SCOPE G6, FF-7. W1 Oracle 5.
- **Click path:** C0, **New session**, Send one good text submission so the session is
  established. In the browser developer tools set the Network panel to **Offline**. Send
  a second text submission (it becomes a failed row). Set the Network panel back to
  **Online**. Use the retry control the panel provides for that failed row (location and
  label set by wave W2, not in the tree when this was written; if you cannot find one,
  that is the Fail below).
- **Look at:** the row list (names and count) and the failed row's label.
- **Pass:** before retry, 2 rows and the second is labelled "Not posted - grading
  failed"; after retry there are STILL 2 rows, the second now has feedback and no "Not
  posted" label, and its name is unchanged. Also: the retry control is NOT offered on
  the first, already-graded row (or, if offered, using it does not add a row).
- **Fail:** a retry control is missing; or after retry there are 3 rows or two rows with
  the same name; or the failed row stays failed with no error; or retry on a graded row
  adds a row.
- **Void if:** going offline made the Send itself refuse without creating a failed row
  (record the message shown).

### WK-12  The rubric that graded the rows, and its version, are visible in the Chat panel (G7)
- **Origin / closes:** SCOPE G7, FF-1, FF-9. W1 Oracle 6 (exposure is machine-checked;
  the mount is READ and OWNER).
- **Click path, (a) blank rubric:** C0, **New session**. Type instructions only; leave the
  Rubric box EMPTY. Send one text submission.
- **Click path, (b) typed rubric:** **New session**, type instructions AND a rubric (K-C),
  Send one text submission. Then **New session** again, change one criterion's wording
  in the rubric, Send one submission.
- **Look at:** the panel, between the locked fields and the table, for (1) a line starting
  "Rubric used:" ending "(version <12 characters>)", and (2) in case (a) a disclosure
  "Rubric was auto-generated from assignment instructions" that you can open to read the
  generated criteria.
- **Pass:** (a) the generated rubric text is readable in the panel and the Rubric box
  being empty is explained by it; "Rubric used:" shows a 12-character hexadecimal
  version, NOT the word "unknown"; (b) the line shows YOUR rubric's opening text, and the
  version string DIFFERS between the first and the second typed-rubric session.
- **Fail:** no rubric text or no "Rubric used" line anywhere in the Chat panel; or the
  version reads "unknown"; or the two different rubrics show the same version.
- **Void if:** W2 shipped different wording for these lines; then Pass requires "the
  effective rubric is visible, and a version/fingerprint that changes when the rubric
  changes is visible", judged by meaning.

### WK-13  Deductions land under "What Could Be Better"; only praise under "What Went Well" (G8)
- **Origin / closes:** SCOPE G8, F1=B; ENG FF-10-owner, section 1 (reading R1: the
  deductions and the advice share "What Could Be Better"; ENG dropped the "advice in
  neither box" clause as unbuildable under the stated constraints, residual G8-FORK).
- **Precheck (separates wiring from model):** open the browser developer tools, Network
  panel, filter `grade-run-item`. Send K-D. Open the request's payload.
  `commentSplit` must be `true` (the route reads it: `route.ts:65,135`). If it is absent
  or false the Chat surface is not requesting the split: result is **FAIL (wiring)**,
  stop, the model was never asked. At the time of writing `grep -rn commentSplit
  src/app/components` returned no matches, so the driver does not send it yet.
- **Click path:** C0, **New session**, K-C. Send K-D five times (the same text each time;
  each Send is a fresh model call, so the five rows are five independent samples). Score
  each row against the paper list you wrote for K-D.
- **Look at:** for each of the five rows, the "What Went Well" box and the "What Could Be
  Better" box.
- **Pass (per row), all three required:** (1) NONE of your 3 planted deductions (its
  criterion name or its reason) appears in "What Went Well"; (2) ALL 3 appear in "What
  Could Be Better"; (3) "What Went Well" is not empty and names at least one of your
  planted praise points. Advice also appearing in "What Could Be Better" is expected
  and is NOT a fail.
- **Fail (per row):** any one of (1), (2), (3) does not hold.
- **Overall:** record misses out of 5. One miss in five is a FAIL for that row and you
  decide whether the rate is acceptable; the sources do not set a threshold (live-model
  compliance is statistical, ENG section 5 OWNER note).

---

## Part B. The carried FF-12 checks (also OWNER or READ in the sources)

### WK-14  It looks and feels like an LLM chat
- **Origin / closes:** SCOPE FF-R8 and FF-12, original request "really mimic the look and
  feel of an llm chat" (SCOPE 0, from backlog row `GRADING-CHAT`). The layout today is
  form, then results table, then composer, not a transcript (`GradingChatPanel.tsx:126-188`).
- **Click path:** C0. Run a normal session of 3 text submissions.
- **Look at:** the whole page as a first-time user would.
- **Pass:** you, the owner, judge it reads as a chat; write one sentence why.
- **Fail:** you judge it does not; write one sentence what is missing. This check has no
  machine counterpart and no objective threshold: it is YOUR call by construction.

### WK-15  Keyboard: Enter sends, Shift+Enter breaks the line, Send keeps focus
- **Origin / closes:** SCOPE FF-12; `docs/grading-chat-wave1-verify.md` OW-2 and OW-3.
- **Click path:** C0, Text mode. Click in "Submission text", type a line, press
  **Shift+Enter**, type a second line, press **Enter**. Then type again and click the
  **Send** button with the mouse. Switch to URL mode, paste a URL, press **Enter**.
- **Look at:** whether the text sent; where the caret is after sending.
- **Pass:** Shift+Enter inserted a new line without sending; Enter sent both lines as ONE
  submission; after clicking **Send** the caret is back in "Submission text" (you can
  type without clicking); in URL mode Enter submitted.
- **Fail:** Enter inserts a line instead of sending; Shift+Enter sends; the caret is
  lost after clicking Send; URL Enter does nothing.

### WK-16  The table survives navigating away and back, including mid-grade
- **Origin / closes:** SCOPE FF-12; verify doc OW-7 (the always-mounted design).
- **Click path:** C0. Send three text submissions and, while the third is still
  grading, click a different rail item under Tools (for example **Submissions**), wait
  10 seconds, click **Chat** again.
- **Look at:** the rows and the locked fields.
- **Pass:** every row is still there, the third row has landed, the fields are still
  locked with the same text, and no row duplicated.
- **Fail:** rows lost, fields unlocked, or the in-flight row never arrives.

### WK-17  Ten submissions at once: rate limiting (FF-R3)
- **Origin / closes:** SCOPE FF-R3, H1 (three calls in flight, no spacing).
- **Click path:** C0, **New session**. Send 10 different text submissions as fast as you
  can (Enter, paste, Enter).
- **Look at:** count rows labelled "Not posted - grading failed" and read their cause
  text.
- **Pass:** 10 graded rows, 0 failed.
- **Fail:** 1 or more failed; record the count and the cause verbatim (a rate-limit cause
  means H1 needs a pacing fix; the sources leave that decision open).

### WK-18  A class-sized Canvas assignment, and the over-the-ceiling notice (FF-R5)
- **Origin / closes:** SCOPE FF-R5, H4 (one server action reads the whole class, no
  declared time limit of its own); verify doc OW-5 (the partial notice). The session
  ceiling is 40 rows (`useContinuousGradingRun.ts:57` `DEFAULT_MAX_ENTRIES = 40`, opened).
- **Click path:** C0, **New session**, URL mode, paste a REAL class-size assignment URL
  (ideally with more than 40 submissions; otherwise record the actual count).
- **Look at:** whether the Add completes without an error banner; the number of rows; if
  the class is over 40, the alert paragraph under the "New session" button.
- **Pass:** it completes without a timeout or error; the row count equals the class
  count up to 40; if over 40, an alert explains that only 40 were graded and the styling
  does not read as a hard failure of the 40 that succeeded.
- **Fail:** a timeout or error before any row appears; rows silently missing with no
  explanation; or an over-40 class shows no notice at all.
- **Void if:** you have no assignment with at least 10 submissions.

---

## Result log (owner fills in; one line per check)

Deployed commit: ______________   Date: ____________

| Check | Result (PASS / FAIL / VOID) | Evidence (what you saw, counts) |
|---|---|---|
| WK-1 | | |
| WK-2 | | |
| WK-3 | | |
| WK-4 | | |
| WK-5 a / b / c | | |
| WK-6 | | |
| WK-7 | | |
| WK-8 | | |
| WK-9 | | |
| WK-10 (N, count) | | |
| WK-11 | | |
| WK-12 a / b | | |
| WK-13 (misses of 5) | | |
| WK-14 | | |
| WK-15 | | |
| WK-16 | | |
| WK-17 | | |
| WK-18 | | |

"Fully functional" in the sources' own sense (SCOPE FF-12) holds only when WK-1 through
WK-13 are PASS or an explained VOID, and WK-14 is your own yes. A VOID is not a pass.

## Which wave each check needs (so a FAIL points at the right place)

| Wave | Content (SCOPE section 6) | Checks that depend on it |
|---|---|---|
| W1 driver state (in working tree, uncommitted) | retained Canvas URL, session key, relabel, retry, exposed rubric | WK-1, 2, 4, 5, 7, 8, 11, 12 (driver half) |
| W2 panel wiring (NOT started) | pass `canvasUrl`/`runKey`, edits scoping, mount rubric display, retry control | WK-1, 2, 5, 7, 8, 11, 12 (display half) |
| Engine wave (in working tree, uncommitted) | bad-output guard, comment split route | WK-9, 10, 13 (plus the driver sending `commentSplit`, not yet wired) |
| None (already shipped) | continuous grading, composer, locks | WK-3, 6, 14, 15, 16, 17, 18 |

## Residuals: what this walk cannot close (owner, instrument, step, all three)

| Id | Not proven | Owner | Instrument | Step that measures it |
|---|---|---|---|---|
| W-R1 | Reload restore of graded rows, if the durable store (W6, fork F4) is built | owner | a reload with rows on screen | a revision of WK-6 once W6 ships; BACKLOG entry owed |
| W-R2 | The four unobservable G4 states (code-run, code-running, code-output, browse-files) | owner | a row that offers those controls | WK-7 on such a row; nobody else can see it |
| W-R3 | Whether a 504 at the 50-second budget can coincide with Gemini retry backoff (SCOPE FF-R6, section 2.4) | owner | a deliberately slow submission against the real key plus the deployment's function logs (not visible in the browser) | not walkable from the UI; stays open until someone reads the logs |
| W-R4 | A SECOND, different Canvas URL in one session should be refused (F3=A; W1-R1) | loop-ac / architect for the wording | the node-drivable fact in W1 Oracle 1; wording is theirs | W2 acceptance criteria; not an owner-walk item |
| W-R5 | Roster-matched Canvas identity for text and file rows (fork F2=B, SCOPE W7) | owner decision | none yet | not walked: WK-3 only confirms the honest copy-only limit |

## Measurements behind this document

- Source line counts: `wc -l docs/grader-fully-functional-scope.md docs/grader-w1-test-notes.md docs/grader-engine-test-notes.md` printed 649, 138, 135.
- HEAD: `git rev-parse --short HEAD` printed `18eb17ad`.
- Tree state: `git status --short` listed the in-flight modified files named at the top.
- No drop target: `grep -rn "onDrop\|dragover" src/app/components/grading-chat/*.tsx` printed nothing.
- `commentSplit` unwired from the components: `grep -rn commentSplit src/app/components` printed "No matches found" (Grep tool).
- Panel still hardcodes the empty Canvas URL: `GradingChatPanel.tsx:175`, opened.
- Check count: see the final report; counted with `grep -c "^### WK-" docs/grader-owner-walk.md`.
- Not run, because nothing here can be: any Gemini call, Canvas call, browser rendering, reload, or click. Every Pass/Fail line above is a procedure, not a measured result.
