# Grading and feedback from a screen recording

The owner's words:

> give me another option when i select knowledge pages: grading and feedback via
> recording. select the relevant grading/feedback knowledge pages as context / a
> grading-via-screen-recording option appears / paste a rubric into a modal
> (plain text paste, plus PDF/doc upload) / screen record walking through student
> submissions / app generates scores and feedback using the rubric and knowledge
> pages as context, stored in a table like the discussion replies table

> if i'm using the recording to grade students, it's not possible to bind the
> score to a student or upload to an lms

> the table produced by the recording grader should also be filterable on the
> column that holds the name of the original poster

Extends the Discussion replies capture surface (REGRESSION entries 366-375) and
the launch seam built alongside it.

---

## 0. The constraint that shapes the whole feature

**R0-1. This produces a WORKING SURFACE for the instructor. It never writes a
grade anywhere.** The owner ruled that out themselves, and it is the right call:
a score read off a screen recording has no reliable link to a student record.

**R0-2. That boundary must be STRUCTURAL, not a convention.** `postCanvasGrades`
(`src/lib/canvas/grades.ts`) is this repo's only grade-write path and it requires
a non-optional `userId: number`. But `GradeResult.userId?: number` exists and is
commented "enables write-back", and `gradeStudentEntries` copies it through on
both the success and failure branches. So a recording-derived `GradeResult` would
differ from a postable one only by a field happening to be `undefined`.

Therefore: **this feature gets its own row type with no `userId` field at all**,
so posting one is a compile error rather than a discipline. And it must **not**
persist into `grading_drafts` / `GradingRunEntry` - that store is one approved
click away from `post-grades`.

**R0-3. Reuse the grading FUNCTIONS, not the grading PIPELINE.**
`buildSystemPrompt`, `parseRubricResponse`, `composeOverallComment`,
`scaleResultToPoints`, `formatFeedback` and `RESUBMIT_NOTICE` are pure and
Canvas-free. Use them. Do not route through `gradeEntries`, which exists to
produce postable results.

---

## 1. The risk that would ship green and silently wrong

**R1. Reading dense document text off a screen capture is UNPROVEN here, and the
failure profile is the worst possible.** Entry 366's measured table is a *forum
board* at 14.5px: a 4K source arrived at 4.8px and was illegible until
`resolveTargetWidth`'s 0.5 floor fixed it. **Nothing has been measured for
document pages, 12-13px code, or two-column PDFs**, and `FRAME_JPEG_QUALITY =
0.55` at 4:2:0 chroma subsampling is worst exactly on thin dark-on-light strokes -
which is what body text is.

**R1a. An empty extraction is currently treated as SUCCESS.** So an illegible run
shows "Reading...", never errors, and yields zero rows or invented ones, with
every gate green. Before any of this is built, **measure it**: capture a real
submission page at the widths an instructor actually uses and report what the
model reads back. If it cannot read a submission reliably, say so and stop -
shipping a grader that silently invents feedback is worse than not shipping one.

**R1b. This measurement is the first task of the group, not a step in its
verification.** Its result decides whether the rest is worth building.

---

## 2. The rubric modal

**R2. PDF and document upload is NOT a new dependency - the pipeline already
exists end to end.** `officeparser` and `jszip` are already dependencies;
`extractTextFromBuffer` (`src/lib/office-extract.ts`) handles pdf/docx/pptx/
xlsx/odt/rtf. Better, there is already an **extract-without-persisting** flow:
`validateFileUpload` (`src/lib/syllabus-upload-validation.ts`, allow-list
`.docx .pdf .txt .md`, 25 MB, run on BOTH sides so they cannot disagree) ->
direct-to-Storage upload -> `extractSyllabusTextAction`, which downloads,
extracts, **always deletes the object**, and returns `{text}|{error}`.

**Reuse that flow whole.** A rubric is exactly as sensitive as a syllabus and
should not linger in storage either.

**R2a. Plain-text paste is the primary path**, and must work with no upload at
all. Upload is the convenience, not the requirement.

**R2b. Scanned PDFs have no OCR anywhere in this repo.** But `llm-files.ts`
already passes `application/pdf` inline to the vision model - so a PDF that
extracts to nothing can be sent as an image instead. Do that, and tell the
instructor which path was used, because a scanned rubric read by a vision model
is less reliable than extracted text.

**R2c. The extracted rubric is shown for review before it is used.** An
instructor who pastes a rubric and gets a silently mangled extraction has no way
to know why the grades look wrong.

---

## 3. Reading a student's name - the riskiest part

**R3. A misread name means feedback attached to the wrong person.** The
discussion extraction already refuses to guess: a post whose author is not
visible is SKIPPED rather than attributed to the nearest visible name. **That
rule carries over unchanged.**

**R3a. Nothing in this repo validates a vision-read name against a roster**, but
rosters exist client-side (`course.roster`, `studentRepos`) plus
`listCourseRosterAction`. **Check the read name against the roster when one is
available** and mark the row when it does not match. `repo-student-bindings.ts`
is the precedent to READ (not import) - note its explicit `ambiguous` outcome,
which is the right shape: matched, unmatched, and ambiguous are three states, not
two.

**R3b. An unmatched or ambiguous name never blocks the feedback** - the
instructor can still read and copy it. It changes what the row SAYS, not whether
it exists.

---

## 4. The table

**R4. Reuse the generic table machinery, which was written for this.**
`filterRowsByQuery<T>` and `compareNameKey` (`discussion-table-view.ts`) are
already generic, and that file's own header says they were written that way
*because grading-by-recording was known to need them*. `deriveReplyAuthorName`
and `useDiscussionCapture` (which knows nothing about rows, LLMs or storage) are
equally reusable.

**R4a. The filterable name column (the owner's explicit ask) is `filterRowsByQuery`
over a haystack this AC must DEFINE, not inherit.** Entry 372's T5b kept
`replyingToAuthor` out of the discussion haystack so a name search would not
interleave posts BY and AT a person. The same reasoning applies here and cuts
harder: the discussion haystack includes `row.reply`, and the grading analogue is
**feedback text, which routinely contains the student's name**. Searching a name
would then return every row whose feedback mentions them.

**Decision: the grading haystack is the student name and the submission text -
NOT the generated feedback.** State it, pin it with an exact-tuple test the way
`REPLY_ROW_HAYSTACK` is pinned, and record why.

**R4b. What is discussion-specific and must NOT be reused:** the whole extraction
prompt (every clause names forum furniture), the three server actions,
`mergeCapturedPosts`/`isSamePost`, both state machines, and the panel/row
components. This is a second instance sharing an engine, not a parameterisation
of the discussion surface.

---

## 5. Scope and size

**R5. This is a large surface.** Discussion replies is roughly 5,500 non-test
lines across ~25 files. `src/app/components/recording/` is the only
ceiling-policed directory and already has four files at 841-961 of 1000. **Plan
the file layout before writing code**, and expect to need an extraction wave
first, as three features in a row have.

**R5a. Ship the measurement (R1) and the rubric modal (R2) FIRST, as their own
push.** They are independently useful - a rubric-paste-and-extract modal has
value on its own - and the measurement decides whether the capture half is worth
building at all.

**R5b. Any new persisted control joins the ordinal `ta-rec-*` key canary** in the
same commit, with BOTH a read and a write, and no `ta-rec-` literal in a
non-test comment (that scan has been poisoned twice).

---

## 6. Limits the REGRESSION entry must state

- **Whether the model can read a submission off a screen at all is the open
  question**, and an empty read currently looks like success. Until R1 is
  measured, every claim about this feature's accuracy is unfounded.
- **No score produced here is bound to a student or posted anywhere**, by
  construction (R0-2), and that is a deliberate ceiling on the feature, not a
  gap to close later.
- A name read off a screen can be wrong even when it matches a roster entry -
  two students with similar names defeat it.
- The rubric extraction can silently mangle a PDF; R2c shows it, but an
  instructor who does not read it will not notice.
- No component is rendered by any test in this repo.
