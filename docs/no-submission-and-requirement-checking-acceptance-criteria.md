# Saying what a student actually submitted, and checking it against the instructions

Three asks from the owner, in their words:

> For those students who did not have a submission, the score and comment should
> say as much

> this repo grader should also be capable of checking to see if there are other
> branches with appropriate folder with files in it (i.e. a merge did not
> occur). in that case, it still counts as not submitting, but this should be
> flagged in comments

> the grader catches the fact that the files are named incorrectly, but doesn't
> catch that the content of those files does not match the instructions

One group, because all three write to the same result shape and cross the same
downstream consumers. Extends REGRESSION entries 370 and 371.

---

## 0. The finding that reframes ask 1

**G0-1. Entry 370's fix is half-applied, and the unfixed half is still
rendered.** `gradeRepoAction` (`github-repos.ts`) got the `noSubmission` branch.
`gradeReposAction` (`app/actions/github.ts:602`) did not, and
`GradingTab.tsx:207` still renders `GithubGradingPanel`, which calls it. An
empty scoped folder there produces a digest whose entire text is
`# Repository: owner/repo`, handed straight to `gradeEntries`.

The load-bearing sentence is `src/lib/grade/prompts.ts:70`: *"If nothing in the
submission explicitly violates a rubric area, award full points for that area."*
**An empty submission violates nothing.** So yes - a student who submitted
nothing can still be awarded full marks today, on a path the app still shows.

Also unguarded: `gradeOneSubmissionAction` (`grading.ts:549`) has
`submission.workflowState` in hand and ignores it, and a Canvas-submitted repo
link that 404s (`extraction.ts:198-200`) grades the error note.

**G0-2. The owner's ask is not "add a sentence" - today those students get NO
ROW AT ALL.** The workflow paths `continue` past a no-submission repo, so it
never enters the draft. The one existing producer, `buildZeroGradingEntry`
(`src/lib/grade-zeros.ts:44`), emits `0/N` with **all four comment fields
deliberately empty**. That function is the thing to change; do not write a
second one beside it.

---

## 1. The score

**G1. A no-submission result scores 0, and says why in the comment.** Decided
after weighing the alternative: a blank or dash is arguably more honest ("not
assessed" rather than "assessed as worthless"), but it does not upload, and
non-numeric score text is actively dangerous here - see G1a. A 0 with an
explicit comment is defensible to the student, uploadable, and unambiguous.

**G1a. The no-submission fact is its OWN FIELD. It must never be encoded into
the score string.** Two Canvas-post paths (`grading.ts:491`,
`repoGradesPosting.ts:150`) take the first number found anywhere in the score
text, so a marker like `"No submission - checked 3 branches"` would post **3**.
`steps.grading-cartridge.ts:121-122` writes an unparseable score raw into a
gradebook CSV. Nothing downstream may have to parse English to learn a student
did not submit.

**G1b. `grade-zeros.ts:56` can emit `"0/0"`**, which every fraction parser in
this repo rejects. Fix it in passing or the new path inherits it.

**G1c. Three allowlists silently drop new `GradeResult` fields** -
`grading-review-rows.ts:33`, `grading-drafts.ts:108`,
`github-grading-run-store.ts:157`. `submissionTruncated` is the live proof that
this happens. Every new field must be added to all three, and a test must fail
if one is missed. This is `verify-reachability` in its persistence form.

**G1d. `pointsWereDeducted` (`parsing.ts:150`) returns `false` on an unparseable
total**, which suppresses `RESUBMIT_NOTICE` and makes a failure indistinguishable
from full credit. A no-submission result must reach the resubmit notice
deliberately, not by accident of parsing.

---

## 2. The comment

**G2.** The comment states plainly that no submission was found, what was looked
for, and where. It is written to be read by the student, in the instructor's
voice, and to survive being quoted back in an appeal. It must not imply
wrongdoing - a missing submission has innocent causes, and the most common one
is ask 2.

**G2a.** All four feedback fields are populated coherently, not just
`overallComment`. `composeOverallComment` already owns composition; use it
rather than authoring the field directly, so the parts cannot drift.

**G2b. No LLM call is made for a no-submission result.** There is nothing to
grade, the text is deterministic, and a model asked to comment on an empty
submission is exactly the setup that produced entry 370.

---

## 3. Unmerged branches (ask 2)

**G3. When the graded ref has no submission, look at the other branches for the
same folder, and say so in the comment.** The outcome does not change - still
not submitted, still 0 - but "your work is on a branch that was never merged" is
a different thing to tell a student than "you did not do the work", and it is
the most common innocent cause.

**G3a. This runs ONLY on the no-submission path.** It is bounded to the students
who already appear to have submitted nothing, which is what makes it affordable
across a ~66-student roster.

**G3b. Reuse `scanOrgRepoTrees` and `DEFAULT_TREE_SCAN_CONCURRENCY = 5`
(`repo-grade-tree-scan.ts:122,198`)** - the same shape with the axis changed from
repos to refs. `listBranches` (`github.repos.ts:155`) already exists and
`GITHUB_TOKEN` already has the scope; no new auth. Cost is roughly
`branches + 2` calls per no-submission repo.

**G3c. The repo has NO `Retry-After` handling or backoff anywhere.** Secondary
rate limits are the real risk, not the primary quota. Cap the branches examined,
and **log what was skipped** - a silent cap reads as "checked everywhere" when it
did not. `listBranches` caps at 200 and throws away each branch's head SHA
(`:160`), so there is no free dedupe of identical branches.

**G3d. The three states that must never collapse into "no unmerged work
found".** A repo that 404s, an empty repo (GitHub answers 409, currently
unhandled), and a truncated tree (`treeTruncated`, which the `noSubmission`
branch does not consult today) are all **"could not determine"**, not "nothing
there". Reporting an access failure as a confident statement about a student's
work is entry 370's error shape exactly.

**G3e.** `gradedRepo`/`gradedRef` are set only by the Canvas-link path - both
`repoDigestToEmbeddedEntry` copies leave them undefined. Do not build the branch
comparison on a field that is usually empty; establish the graded ref explicitly.

---

## 4. Content versus instructions (ask 3)

**G4. Confirmed cause.** `pickReadmeInstructions` returns the whole README and
`buildSystemPrompt` (`prompts.ts:45-51`) interpolates it raw under
`ASSIGNMENT INSTRUCTIONS:`. The module README contains a **complete worked
example for a different scenario** and says so itself. Students copied it; their
code closely matches the instructions' own reference; the model read the
resemblance as correctness. Measured: of 11 students graded on module 02, 7 have
feedback referencing the example's scenario, and one was awarded **25/25 on
"Functional Arithmetic Operations"** while two of the four required operations
were absent.

**G4a. Both causes are present and need different fixes.** The wording genuinely
licenses it - `prompts.ts:70` is about something *present* that "violates", a
missing operation is an absence, and `:71` forbids deducting for "missing
assumptions". Entry 371 had to add an explicit "a missing required file **is** an
explicit rubric violation, not ambiguity" clause for exactly this reason; **no
equivalent clause exists for behaviours.** And separately, the model was never
*required* to check: there is no enumerated requirement list and no item-by-item
adjudication.

**G4b. Example code in the instructions is NOT a reference solution.** State it
explicitly: resemblance to any code printed in the instructions is not evidence
of meeting a requirement, and where the instructions say an example uses a
different scenario, submitting that example is a failure to do the assignment.

**G4c. The structural blocker, which is why this cannot be fixed by prompt
wording alone.** `prompts.ts:66` **forbids** per-criterion comments, and
`parsing.ts:46` **hard-blanks the field even when the model sends one**. So an
evidence requirement has nowhere to land until both ends are opened. Meanwhile
`canvas/grades.ts:92-94` already posts `rubric_assessment[id][comments]` - the
delivery pipe is wired end to end and has always been empty - and the embedded
engine's `runCheck` already computes a per-check `detail` that nothing in
production reads (`index.ts:141` writes `comment: ""`).

**G4d. Require per-criterion evidence.** Each rubric area's score must be
accompanied by a citation from the submission - the line or construct that
satisfies the requirement, or an explicit statement that it is absent. Pin the
FACT that evidence is required and non-empty; do not pin its wording.

**G4e. Reuse `buildChecklistPrompt` / `fullCreditChecklist`, do not duplicate
it.** It already distils instructions + rubric into concrete full-credit actions
and is persisted and rendered - and is **never fed back into the grading
prompt**. It is hard-capped at 3 items, which is too few to enumerate an
assignment's requirements; raising that cap is part of this work. Do NOT reuse
`extractRubricCriteria` - it parses the rubric, not the instructions, and yields
names and points only.

**G4f. Two amplifiers to fix or fence.** `github-repos.ts:778` generates the
rubric from `instructions + the student's own code` when the rubric field is
blank, and `github.ts:661` does it ONCE from `entries[0]` for the whole class -
so one student's work can shape the rubric everyone is graded against.
`generateRubric`'s own prompt (`rubric.ts:182`) forbids criteria that require
test execution, so a generated rubric is **structurally incapable** of demanding
behavioural verification.

**G4g. The code runner cannot currently supply behavioural evidence, and one
premise about it was wrong.** stdin is hardcoded `""` in both backends
(`code-runner.ts:404`, `:309`) with no parameter anywhere, and the repo has no
concept of expected output. It does not hang - the program gets EOF - so
Python/Java fail and are penalised for being correctly interactive, while
**C++ `cin >>` usually exits 0 and the model is shown garbage stdout as if it
were real output**. Feeding stdin and comparing against expected output is the
right long-term answer and is explicitly OUT of scope here; this group must not
pretend the runner is evidence.

---

## 5. What this group must NOT do

- Not remove the generosity policy. The owner has not asked for a harsher
  grader; they asked for an accurate one. Requirements checking and generosity
  are orthogonal - a submission that does everything asked should still be
  graded kindly.
- Not bind a recording-derived score to a student or upload it (the owner has
  said that is impossible on that surface).
- Not touch the discussion-replies surface.

---

## 6. Limits the REGRESSION entry must state

- **Whether the model actually honours per-criterion evidence is unmeasured.**
  Every assertion is that an instruction is present and that a field is
  non-empty, not that the citation is correct or even real. A fabricated
  citation would pass every gate here.
- **The branch scan is best-effort.** Capped, subject to secondary rate limits
  with no backoff in the codebase, and blind to work pushed to a fork rather
  than a branch.
- **A 0 is a real grade with real consequences.** If the branch scan or the
  no-submission detection is wrong, the student receives a 0 with a confident
  explanation. The three "could not determine" states (G3d) exist precisely
  because that failure is worse than no grade at all.
- No component is rendered by any test in this repo.
