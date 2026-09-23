# A31 scope: the grading engine's "Re-run" instruction

Architecture seat, 2026-09-22. Consumer: one implementer wave, after a fresh
`loop-checker` pass. This document decides SHAPE. It contains no production
code.

Every quantity below names the command that produced it, run from the repo
root `C:\Users\alexa\OneDrive\Documents\Projects\teaching-assistant` on
2026-09-22 unless stated otherwise. Every `file:line` cited was opened.

Leverage trigger (`docs/loop/leverage.md`, `seats.md` Acceptance criteria):
**FIRED AND RECORDED AS "NO CLAIM"**. A31 is a bug fix - a copy correction to
text the app already emits. It builds and changes no capability a user
reaches, so there is no advantage class to name and no removal test to owe.

---

## 1. Measurement log

Commands and their real output. Nothing below is recalled.

**M1 - the two strings.**

```
grep -n "Re-run to grade" src/lib/grade/engine.ts
307:        message: "Not graded: the grading run's time budget ran out before this submission could be started. Re-run to grade it.",
320:        message: `Not graded: this run is limited to ${maxSubmissions} submissions. Re-run to grade the rest.`,
```

Exactly `:307` and `:320`, as the row states. Confirmed.

**M2 - the prefix.** `sed -n '192p' src/lib/grade/engine.ts` returns
`  const limitedEntries = studentSubmissions.slice(0, maxSubmissions);`.
Confirmed at the line the row names.

**M3 - the bound's value and its reach.**
`grep -n "MAX_SUBMISSIONS\|getGeminiMaxSubmissions" src/lib/gemini.ts` gives
`32:const DEFAULT_MAX_SUBMISSIONS = 40;` and `129:export function
getGeminiMaxSubmissions()` reading `process.env.GRADE_MAX_SUBMISSIONS` at
`:131`.

`grep -rn "GRADE_MAX_SUBMISSIONS" src --include=*.ts --include=*.tsx` returns
exactly two source hits, `src/lib/gemini.ts:131` and three comment mentions in
`src/lib/grade/class-trends-draft.ts` (`:52,:55,:90,:92`). **No component, no
settings surface, no server action reads or writes it.** The bound is an
environment variable only.

**Do not trust the comment here.** `src/lib/gemini.ts:58` still reads "at the
default cap of 5 submissions per run (DEFAULT_MAX_SUBMISSIONS)". The constant
four lines earlier is 40. The comment is stale; the constant is the fact.

**M4 - line counts**, `@(Get-Content <file>).Count` from PowerShell (never
`Measure-Object -Line`; `docs/loop/this-repo.md` section 3 records the 42-line
disagreement):

| File | Lines |
|---|---|
| `src/lib/grade/engine.ts` | 491 |
| `src/lib/grade/types.ts` | (not measured - not resized by this design) |
| `src/app/components/grading-results/ungradedDisclosure.ts` | 177 |
| `src/app/components/grading-results/ungradedDisclosure.test.ts` | 522 |
| `src/lib/grade/engine.ungraded.test.ts` | 376 |
| `src/app/components/GradingResults.tsx` | 892 |
| `src/app/components/DraftedGradesTab.tsx` | 870 |

No file in the write set is within 100 lines of the 1000-line ceiling
(`src/file-size-ceiling.structure.test.ts`, `LIMIT = 1000`), and this design
adds tens of lines, not hundreds.

**M5 - baseline of the tests that pin this copy.** Run as
`npm run test:paths -- <p1> <p2> <p3>`, exit code written to a file and read
from the file (never through a pipe):

```
npm run test:paths -- src/app/components/grading-results/ungradedDisclosure.test.ts src/lib/grade/engine.ungraded.test.ts src/app/components/grading-results/ungradedRowLabel.test.ts *> $out
$LASTEXITCODE | Out-File -FilePath $code -Encoding ascii
```

`Get-Content $code` -> `0`. Output: `Test Files 3 passed (3)`,
`Tests 67 passed (67)`, and one credited line per argument:
`COVERED ...ungradedDisclosure.test.ts files=1 passed=41`,
`COVERED ...engine.ungraded.test.ts files=1 passed=13`,
`COVERED ...ungradedRowLabel.test.ts files=1 passed=13`.

**M6 - search canaries.** `docs/loop/traps-search.md` requires a canary for
every absence claim.

- Positive canary for the owns sweep: the same command that must find the
  engine also finds it - `grep -rln "Re-run to grade\|ungraded\.message\|
  UNGRADED_DISCLOSURE_COPY\|correctUngradedFeedbackSeed\|correctUngradedSeeds"
  src --include=*.ts --include=*.tsx` lists `src/lib/grade/engine.ts`.
- Negative canary: the same instrument over a string the tree does not
  contain, `grep -rln "Re-run to grade the WHOLE" src --include=*.ts
  --include=*.tsx`, prints nothing and exits 1. So an empty result from this
  instrument is a real absence, not a broken invocation.
- `grep -P` is not used anywhere in this document (it reports clean without
  checking here - `this-repo.md` section 5).

---

## 2. Three corrections to the A31 row itself

`docs/DEV_LOOP.md` and this seat's brief both require refusing a handed
fact the tree disproves. Three of A31's own claims do not survive measurement.
None of them removes the defect; all three change its shape.

### 2.1 The row's headline surface claim is STALE

The row says: "Both strings land in an EDITABLE STRENGTHS TEXTAREA on the
review table". On `GradingResults.tsx` that is **no longer true**, and it
stopped being true at commit b7e62fe (the A12/A13 chunk).

`src/app/components/GradingResults.tsx:188` and `:208` both wrap the seed map
in `correctUngradedSeeds(run, loadGradingResultsEdits(canvasUrl, run))`.
`correctUngradedSeeds` (`ungradedDisclosure.ts:166-177`) maps
`correctUngradedFeedbackSeed` over every row, and that function
(`ungradedDisclosure.ts:148-157`) replaces `edit.strengths` with a frozen
literal whenever it equals the engine's own `result.ungraded.message`.
`seedEdits` (`gradingResultsHelpers.ts:280-296`) gives **every** result an
entry, and `loadPersistedEdits` (`:603-607`) merges storage over that seeded
map key by key, so no row arrives at `correctUngradedSeeds` with
`current === undefined`. The correction therefore reaches every not-attempted
row on that surface.

**Consequence for scope**: A31 is not "a false sentence in one textarea".
It is a false sentence at the DATA layer with one surface already patched and
the others not. Fixing only the patched surface again would be fixing the one
place that is already correct.

### 2.2 The row's stated LIMIT is closed here, and the answer differs by caller

The row states it traced the zip caller only. Section 3 closes that. The
answer is not uniform: on the GitHub panel a re-run CAN be made to reach the
rest by the instructor, on the zip path it can with effort, and on the Canvas
path it cannot at all. That difference is what decides the copy.

### 2.3 The row's prescribed fix names two remedies, one of which does not exist

The row's `note` says: "the message must say what the instructor can actually
do (raise the bound, or split the upload)".

- **"Raise the bound" is not an instructor action.** M3 measured
  `GRADE_MAX_SUBMISSIONS` as reachable from no UI in this tree. It is a Vercel
  dashboard value. Copy that tells the instructor to raise it names a control
  that does not exist in the app - the exact defect A31 exists to remove.
- **"Split the upload" is true on one of five callers.** It is meaningful for
  the zip path only. There is no upload on the Canvas path, and the GitHub
  path's analogue is a repo queue, not an upload.

So the row's own prescription, applied literally, ships a second false
instruction. This design rejects it and says why (section 6).

---

## 3. The caller census

Derived with
`grep -rn "gradeSubmissions\|gradeEntries\|gradeCanvasUrl\|gradeStudentEntries"
src --include=*.ts --include=*.tsx | grep -v "\.test\.ts"`, then every hit
opened. `gradeStudentEntries` (`engine.ts:177`) is module-private; the three
exported doors are `gradeSubmissions` (`:396`), `gradeEntries` (`:450`) and
`gradeCanvasUrl` (`:466`), and all three funnel into it (`:435`, `:458`,
`:490`), so the bound and the deadline are one code path with five production
entries.

| # | Production call site | Source | Batch size | Count bound reachable? | Deadline reachable? |
|---|---|---|---|---|---|
| C1 | `src/app/actions/grading.ts:871` `gradeSubmissions(zipBuffer, ...)` | uploaded zip | N students in the zip | YES | YES (see below) |
| C2 | `src/app/actions/grading.ts:813` `gradeCanvasUrl(canvasUrl, ...)` | Canvas assignment/discussion | every participant Canvas returns | YES | YES |
| C3 | `src/app/actions/github.ts:753` `gradeEntries(entries, ...)` | the GitHub panel's repo queue | one entry per queued repo | YES | NO - no `options` argument is passed at that call |
| C4 | `src/app/actions/grading.ts:636` `gradeEntries([entry], ...)` | one Canvas submission (`gradeOneSubmissionAction`) | exactly 1 | NO | NO |
| C5 | `src/app/actions/github-repos.ts:839` `gradeEntries([entry], ...)` | one repo (`gradeRepoAction`) | exactly 1 | NO | NO |

C4 and C5 are structurally immune to both tails: with one entry,
`slice(0, maxSubmissions)` is the identity for any bound >= 1, and the
deadline check at `engine.ts:207` is guarded by `i > 0`, so entry 0 always
starts. This confirms - by re-measurement, not by inheritance - A12's note
that the repo-grades grid "cannot occur on the surface it names".

**Where the deadline actually comes from, and why it is not a browser fact.**
`deadlineMs` reaches the engine only through
`GradingRunOptions` (`engine.ts:126-133`), set at `grading.ts:730` from a
FormData field. `grep -rn "runDeadlineMs" src --include=*.ts --include=*.tsx
| grep -v "\.test\."` shows exactly four writers of that field, all
unattended workflow steps: `steps.grading-cartridge.ts:105`,
`steps.grading-draft-flow.ts:265`, `steps.grading-run.ts:478` and `:539`.
`src/app/page.tsx` drives `gradeAction` through `useActionState` (`:63`) and
sets no such field; `grading.ts:715-721`'s own comment says the same.

**So the run-deadline message (`engine.ts:307`) is produced only on the three
unattended workflow callers, never on the attended browser path.** That is a
material finding: `UNGRADED_DISCLOSURE_COPY["run-deadline"]`
(`ungradedDisclosure.ts:48-49`) is copy for a state the surface it lives on
cannot currently reach. It is not dead code to delete - the switch at
`ungradedDisclosure.ts:77-88` is the exhaustiveness guard the union needs -
but nobody should believe it has ever been on screen.

### Does a re-run grade the rest, per caller?

| # | Is the entry list pruned before a second run? | Verdict |
|---|---|---|
| C1 zip | No. `gradeSubmissions` re-runs `extractSubmissions(zipBuffer)` (`engine.ts:403-417`) over the whole archive every time, then `groupSubmissionsByStudent`. Nothing consults a prior run. | **A re-run re-takes the same prefix.** The instruction is FALSE. |
| C2 Canvas | No. `gradeCanvasUrl` re-runs `fetchCanvasWork(url)` (`engine.ts:476-488`) and builds `entries` from every student Canvas returns. Nothing consults a prior run or an existing Canvas grade. | **A re-run re-takes the same prefix.** The instruction is FALSE. |
| C3 GitHub | No, not by the code. `GithubGradingPanel.tsx:372-378` passes `queue.map(...)` - the panel's own queue state - and `github.ts:753` grades all of it. The queue is never pruned by the app. | **A re-run re-takes the same prefix** unless the instructor edits the queue by hand. FALSE as written; the underlying capability exists here and nowhere else. |
| C4, C5 | n/a - the tails never fire. | n/a |
| Unattended C1/C2 via the workflow steps | No, plus the deadline is re-derived from the same 50s tick budget (`repoGradingStopAt`, `steps.grading-repos.grade-repo.ts:77-78`; `run-schedules/route.ts:126` `now + 50_000`), so the next tick re-grades the same head of the same list and stops in roughly the same place. | **FALSE on both tails.** |

There is no caller on which "Re-run to grade the rest" is true. The row's
claim generalises; I am confirming it, not inheriting it.

---

## 4. Who reads this text: the full surface trace

`buildUngradedRow` (`engine.ts:146-171`) writes the message into THREE fields
of every ungraded row: `strengths` (`:152`), `overallComment` (`:153`, via
`composeOverallComment`, which for an ungraded row returns the message
unchanged - `types.ts:28-37` filters the two empty parts and joins) and
`feedback` (`:162`, `formatFeedback(overallComment, [], "")`). So an
identifier sweep for `strengths` alone would miss two thirds of the reach.
Sweep commands: `grep -rn "\.overallComment"` and `grep -rn "\.feedback\b"`
over `src --include=*.ts --include=*.tsx`, test files excluded, every hit on
a grading path opened.

| # | Surface | Path | State today |
|---|---|---|---|
| S1 | The "What Went Well" textarea on the review table | `GradingResults.tsx:188,208` -> `correctUngradedSeeds` -> `RowFeedbackBoxes.tsx:115` over `FEEDBACK_FIELDS` (`gradingResultsHelpers.ts:216`) | **CORRECTED** at b7e62fe. Shows `UNGRADED_DISCLOSURE_COPY`, not the engine string. Serves all four surfaces that mount `GradingResults` - including `GithubGradingPanel.tsx:851-861`. |
| S2 | The review CSV download | `GradingResults.tsx:512` -> `buildCsvContent` (`gradingResultsHelpers.ts:488`), whose Strengths column is `edit?.strengths ?? result.strengths` (`:509`) | **CORRECTED** transitively - `edit` is always present (section 2.1), so the fallback never fires on this surface. |
| S3 | **The Drafted Grades Comment field** | `DraftedGradesTab.tsx:188-193` seeds `overallComment` from `r.overallComment` for **every** result with no `isUngraded` filter; `:669-671` renders it in an editable MUI `TextField` and `:676-677` in a `<span>` with the same text as its `title` | **UNCORRECTED, LIVE.** This is the second editable box A31's row did not find. A workflow run that hits either tail persists a draft whose Comment column reads "Re-run to grade the rest." |
| S4 | **A model prompt** | `src/app/api/class-trends-insight/route.ts:128` calls `anonymizeGradeResults(entry.run.results)` - the whole array, ungraded rows included (`class-trends-insight.ts:59-68` maps every element) - and `renderSubmission` (`:131-140`) emits `  Overall: ${submission.overallComment}` | **UNCORRECTED, LIVE.** The false sentence is fed to the model as one anonymised submission's overall comment, with an empty rubric-area list. |
| S5 | Unattended run summary lines | `steps.grading-run.ts:507,554`, `steps.grading-draft-flow.ts:293`, `steps.grading-cartridge.ts:226` | A different false claim, not this string - see section 7. |
| S6 | A Canvas comment posted to a student | every posting door | **CLOSED BY CONSTRUCTION - see below.** |
| S7 | A gradebook CSV handed to an LMS | `steps.grading-singles.ts:620-622` | **CLOSED.** The pushed record is `{name, externalId, itemName, score}` - no comment field exists on it. |

### S6, stated plainly because the brief asks for it

**Instructor-facing text from this defect cannot be posted to a student on the
measured tree.** The mechanism is a type, not a check: `NotAttemptedOutcome`
carries the Canvas id as `canvasUserId` (`types.ts:152-156`), and that field's
own comment says it is "deliberately never spelled `userId`" precisely so the
fifteen `typeof x.userId === "number"` doors stay shut. `userId` and
`ungraded` are mutually exclusive on the union, which
`grading-review-rows.ts:83-86` documents as a compile error rather than a
convention. The doors I opened and confirmed:

- `grading.ts:521` (`postGradingDraftAction`, the Drafted Grades "Post"
  button) - `if (typeof r.userId !== "number") continue;`
- `grading-review-rows.ts:118` (`buildGradingReviewRows`, which builds the
  approval table both workflow review steps post from) - same predicate
- `steps.grading-draft-flow.ts:589-596` - same predicate, with its own comment
  naming the union as the reason
- `steps.grading-singles.ts:604-613` - the compound N13a Ruling 2 check

That door stays shut only while the union does. **This design must not open
it, and no requirement below adds a `userId` to an ungraded row.**

---

## 5. What is true instead, per caller

The engine knows `maxSubmissions` and `stoppedBy`. It does **not** know which
caller invoked it: `gradeStudentEntries`' signature (`engine.ts:177-186`) takes
entries, instructions, a rubric, a provider, `pointsPossible` and
`GradingRunOptions`, and `GradingRunOptions` (`:126-133`) has exactly one
member, `deadlineMs`. There is no source-kind channel and this design does not
add one (section 6).

| Caller | What would actually let the instructor grade the rest TODAY |
|---|---|
| C1 zip | Upload a zip containing only the ungraded students. Real, but there is no in-app control that builds it - the instructor re-zips outside the app. |
| C2 Canvas | **Nothing in the attended UI.** The only in-app route is the `grade-one-submission` workflow step, which reaches `gradeOneSubmissionAction` (`grading.ts:597`, its sole caller `steps.grading-singles.ts:238`; confirmed by `grep -rn "gradeOneSubmissionAction" src`, canaried against a known-UI action) and needs the course id, assignment id and the numeric Canvas user id typed in by hand, one student at a time. |
| C3 GitHub | Remove the already-graded repos from the queue and grade again. True, and the panel has a real queue control. |
| C4, C5 | Not applicable. |
| Unattended | Nothing the instructor can do from a workflow form. |
| All | The owner can raise `GRADE_MAX_SUBMISSIONS` in the Vercel dashboard - it is read at runtime (`gemini.ts:129-133`), so no deploy is needed. This is an OWNER action outside the app and must not appear in instructor copy. |

**The one statement true on every caller** is that the run stopped before this
submission and that grading the same submissions again stops in the same
place. That, and not an instruction, is what the copy may say.

---

## 6. Is the bound itself the defect? (A12/A13 read, and the routing)

Both rows read in full from `docs/backlog.yml` via
`python -c "import yaml,io; d={r['id']:r for r in yaml.safe_load(io.open('docs/backlog.yml',encoding='utf-8'))}; print(d['A12'])"` and the same for `A13`.

**A31 is a copy fix. It is ALSO the visible symptom of a missing capability,
and this design does not widen to cover it.**

The missing capability is "grade the submissions this run did not reach". A12
(RES-2/RES-3) and A13 already hold it, and both record the blocker:
`types.ts:143-149` states that `sourceIndex` is "NOT an index into any
caller's own input array" and that "a caller that treats it as a re-run key
re-runs the wrong student"; `GradeResult` carries no id; and
`repoDigestToEmbeddedEntry` sets no `gradedRepo`/`gradedRef`/`userId`. A
re-run control therefore needs an identity that does not exist yet. That is a
separate, larger row and it is already filed.

Two things follow, and they are the reason this section exists rather than a
sentence:

1. **A31 must not add a re-run control**, exactly as its own note says.
2. **A31 must not add a source-kind channel to `GradingRunOptions` so the copy
   can name a per-caller remedy.** That is the tempting widening. It would
   touch five call sites, a public options type and the type's three wrappers,
   and it would put instructor-facing guidance in the engine - the layer
   furthest from any surface. The remedy belongs at a surface that knows which
   source it is showing. Routed out as **RES-A31-2** (section 10).

---

## 7. Sibling false claims in the same family

`docs/loop/traps-search.md` records that an identifier-shaped search cannot
find a surface that reaches the same data another way, so I swept by CLAIM
shape (a sentence that promises an outcome) rather than by the word "Re-run".

### SIBLING 1 - CONFIRMED FALSE: the replacement copy shipped at b7e62fe

`ungradedDisclosure.ts:45-50` currently emits, for both members:

> "... Grading again without changing the queue will grade the same students
> again, not this one - **remove the students who already have a grade from
> the queue first**."

Measured against section 3's census:

- **C3 GitHub: TRUE.** `GithubGradingPanel.tsx:372-378` grades exactly the
  panel's `queue`, and the panel has controls to edit it. The word "queue"
  even matches the on-screen noun.
- **C1 zip: NOT ACTIONABLE AS WRITTEN.** There is no queue on that surface -
  the control is a file upload. The instruction names a control that does not
  exist, which is the same defect class as "Re-run".
- **C2 Canvas: FALSE.** `gradeCanvasUrl` grades whatever `fetchCanvasWork(url)`
  returns. There is no queue, and the instructor cannot remove a student from a
  Canvas assignment's submission list to make grading reach further.

This is the recorded pattern: the fix for one text-shaped defect shipped a
second one in the same box, and the guard that was supposed to prevent it
(`ungradedDisclosure.test.ts:202-210`, "no member contains the substring
Re-run") tests for a SPELLING, so a differently-worded false instruction
passes it. **A31 must correct this string too; it is not out of scope, it is
the same defect one layer up.**

### SIBLING 2 - CONFIRMED FALSE: "graded N submission(s)"

`engine.ts:281-291`'s own comment states the post-N13a invariant:
`results.length === studentSubmissions.length`, strictly stronger than the
pre-N13a contract where results were truncated at the bound. Four unattended
summary lines still read that length as a count of work done:

| Site | Text |
|---|---|
| `steps.grading-run.ts:507` | `graded ${gradeResult.run.results.length} submission(s)` |
| `steps.grading-run.ts:554` | same, offline zip branch |
| `steps.grading-draft-flow.ts:293` | same |
| `steps.grading-cartridge.ts:226` | `graded (${gradeResult.run.results.length} students)` |

All four set `runDeadlineMs` (section 3), so all four can produce a run in
which some of those rows were never attempted. A 60-student Canvas assignment
under a bound of 40 reports "graded 60 submission(s)". `grading-draft-checklist.ts:50`
(`studentCount: entry.run.results.length`) and `grading-draft-view.ts:24` read
the same length for their own counts.

This is NOT in A31's write set - it is four different files on a different
layer, and mixing it in would make A31's diff unreviewable. Routed out as
**RES-A31-3** (section 10) with its instrument named.

### SIBLING 3 - CHECKED, NOT A DEFECT

`src/app/actions/canvas-inbox.ts:701` ("Re-run to resume from here; nothing
already confirmed is repeated") and `:726` ("Re-run to draft and schedule this
week") are the same wording shape and are **TRUE**, for the structural reason
grading lacks: that loop re-plans against Canvas's current state on every run.
`canvas-inbox.ts:745` says "never on a week the fresh re-plan resolves to
already-present", `:756-757` classifies `already-present`, and `:897` counts
it. The queue there IS pruned; grading's is not. Left alone, and recorded here
so a future sweep does not re-open it.

`src/lib/workflows/visualizer-gap-audit.ts:171` ("Re-run the sweep after these
are added to pick up the rest") and `steps.grading-run.ts:559` ("run Grade
Submissions again with only this course selected") both name real, reachable
behaviour. Left alone.

---

## 8. The design

### 8.1 The shape decision, stated once

**The copy has ONE author and TWO consumers, and the author is
`src/lib/grade/types.ts`.**

Today the sentence is authored twice: once in `engine.ts:307,320` and once,
differently, in `ungradedDisclosure.ts:45-50`. That duplication is why the
b7e62fe fix could correct one copy and ship a fresh defect in the other, and
it is the L13 class this repo keeps filing rows about. The fix is not to
correct both strings; it is to make there be one string.

`src/lib/grade/types.ts` is the only module both sides may reach:

- `engine.ts:9-21` already imports from `./types`.
- `ungradedDisclosure.ts:24` already value-imports from `@/lib/grade/types`,
  and A13's Ruling R narrowed the directory's client-bundle ban specifically
  to permit that specifier because `types.ts` has exactly one import and it is
  type-only.
- `gradingResultsHelpersWiring.test.ts:131` names `src/lib/grade/types.ts` as
  a root of the runtime-import-graph walk, so the exemption is guarded.

Adding two string constants to `types.ts` adds **no import edge**, so the walk,
the CLIENT_FILES completeness assertion (`:230`) and the `next build` client
boundary are all unaffected. This is stated rather than assumed because that
test file is being edited right now by another agent (section 9).

### 8.2 Requirements

Ids are re-derived in section 11 AFTER all numbering, per this seat's brief.

**A31-R1. One authored copy, in the layer both consumers may import.**
`src/lib/grade/types.ts` exports a frozen record keyed by
`NotAttemptedOutcome["stoppedBy"]`, holding the two instructor-facing
sentences. No `import` statement is added to that file.

Recommended text (house voice: professional, minimal, no emoji, no control
named, true on every caller in section 3):

| Key | Sentence |
|---|---|
| `submission-count-bound` | `Not graded: this run stopped before reaching this submission because of the run's submission limit. Grading the same submissions again will stop in the same place - this row is only reached if what is submitted for grading changes.` |
| `run-deadline` | `Not graded: this run's time budget ran out before this submission was started. Grading the same submissions again will stop in about the same place - this row is only reached if what is submitted for grading changes.` |

Why this wording and not the alternatives:

- It states the FACT (not graded, and why) and the CONSEQUENCE (a repeat run
  lands in the same place), which is all that is true on all five callers.
- It names no control, so it cannot name one that does not exist. This is the
  property that both the original defect and SIBLING 1 violated.
- "what is submitted for grading" is caller-agnostic by construction: it reads
  correctly against a zip, a Canvas assignment and a repo queue, and it does
  not imply the instructor has a control for changing it - because on C2 they
  do not.
- "in about the same place" on the deadline member is deliberate. The stop
  point is wall-clock, so it is not exactly reproducible; claiming it were
  would be a smaller version of the same defect.

**A31-R2. The engine emits the shared sentence, and adds the count only where
it has it.**
`engine.ts:301-309` (the deadline tail) emits the `run-deadline` member
verbatim. `engine.ts:313-322` (the count tail) emits the
`submission-count-bound` member followed by one sentence carrying the number
the engine alone knows: `This run's limit was ${maxSubmissions} submissions.`

The count clause is APPENDED, never interpolated into the shared sentence, so
the shared sentence stays a frozen literal that a human reviews once and a
test can compare by equality. The count is kept because removing it would
delete information that is on screen today - and because
`docs/a12-a13-scope.md` already established that the surface leaf cannot state
it (`classifyRow`'s signature is `(result, edit)`, with no run and no count,
and parsing it back out of the prose is forbidden by that document's G2).

**A31-R3. The surface stops authoring its own copy.**
`UNGRADED_DISCLOSURE_COPY` (`ungradedDisclosure.ts:45-50`) becomes the record
from A31-R1 - re-exported under its existing name so its consumers
(`ungradedDisclosure.ts:80,82,153,154`, `ungradedRowLabel.ts`, the tests) do
not move. The "remove the students who already have a grade from the queue
first" clause is DELETED, on the evidence in section 7, SIBLING 1.

**A31-R4. A persisted edit written before this change is still corrected.**
This is the hazard the shape creates and it must ship with it.
`correctUngradedFeedbackSeed` (`ungradedDisclosure.ts:148-157`) corrects
`edit.strengths` only when it equals the CURRENT engine message or one of the
two CURRENT frozen literals. Edits are persisted under
`ta-grading-results-edits:${canvasUrl}` (`gradingResultsHelpers.ts:625-630`;
note `GithubGradingPanel.tsx` passes `canvasUrl=""`, so every GitHub run
shares one key). An instructor who opened a bound-stopped run before this
change has a stored `strengths` holding one of FOUR now-retired strings. After
the change none of them matches any allowlist member, so the retired sentence -
including the original "Re-run to grade the rest." - survives in the textarea
permanently.

The fix is a frozen `RETIRED_NOT_ATTEMPTED_MESSAGES` array beside the
correction, holding the four strings verbatim:

1. `Not graded: this run is limited to 40 submissions. Re-run to grade the rest.`
   (and the same with any other `maxSubmissions` value - see the pass condition
   below, which is why this is a PREDICATE, not only a literal list)
2. `Not graded: the grading run's time budget ran out before this submission could be started. Re-run to grade it.`
3. the b7e62fe `submission-count-bound` literal, transcribed from
   `ungradedDisclosure.ts:46-47`
4. the b7e62fe `run-deadline` literal, transcribed from `:48-49`

Because string 1 interpolated a number, an equality list cannot cover every
value `GRADE_MAX_SUBMISSIONS` may have held. The correction condition must
therefore also fire on a `strengths` that CONTAINS `Re-run to grade` - a
substring the app will never emit again once A31-R2 lands, so the test is
exact in practice and cannot false-positive on instructor-typed text unless
the instructor typed that phrase themselves. State that trade in the code
comment; do not leave it implicit.

**A31-R5. The transcribed fixtures are re-transcribed.**
`ungradedDisclosure.test.ts:95` and `:105` hold the engine's CURRENT literals
as hand-written fixtures - the file's header at `:9` and `:67` says they are
"Transcribed from buildUngradedRow, src/lib/grade/engine.ts:146-171". They are
the only place in `src/` outside the engine that carries those sentences
(derivation in section 9). If A31-R2 lands without them, the tests at `:314`
and `:341` keep passing while asserting about a string the engine no longer
emits - a guard that has silently stopped guarding. They must be re-transcribed
in the same commit.

**A31-R6. The copy set is closed by CONSTRUCTION, driven through the
production path.**
`docs/a12-a13-scope.md` already ruled that "no returned string instructs the
instructor to press a control that does not exist" has no instrument in this
repo and must be replaced by a construction. The construction here is:

- an assertion in `engine.ungraded.test.ts` that for a run driven through the
  real `gradeSubmissions`/`gradeEntries` door (not a hand-built row), every
  `kind: "not-attempted"` row's `ungraded.message` STARTS WITH the
  `types.ts` member for its own `stoppedBy`, and
- an assertion that the set of distinct `ungraded.message` prefixes the engine
  produces equals the `types.ts` record's value set.

Driving the production path rather than importing `buildUngradedRow` is the
`seats.md` Test-seat practice 3 rule and it is also what makes the assertion
meaningful: a fixture-built row proves nothing about `engine.ts:301-322`.

### 8.3 Pass conditions

Each names the object under comparison, the instrument producing each
quantity, and the direction of failure (`traps-spec.md`).

| # | Object | Instrument | RED when |
|---|---|---|---|
| P1 | the set of string literals in `src/lib/grade/engine.ts` | `grep -n "Re-run" src/lib/grade/engine.ts` | the command prints any line. Direction: any output at all is failure. Canary: the same command on HEAD~1 prints `:307` and `:320`, proving the instrument fires. |
| P2 | the set of string literals in `src/app/components/grading-results/ungradedDisclosure.ts` | `grep -n "queue\|Re-run" src/app/components/grading-results/ungradedDisclosure.ts` | any line matches inside a value of `UNGRADED_DISCLOSURE_COPY`. Comment mentions are permitted; the assertion is over the exported record's values, not the file text. |
| P3 | every `not-attempted` row produced by a run driven through `gradeSubmissions`, compared to `types.ts`'s record | the new assertion in `engine.ungraded.test.ts` (A31-R6) | a row's `ungraded.message` does not start with its own `stoppedBy` member, OR the engine's distinct prefix set is not equal to the record's value set. Direction: both a missing prefix and an EXTRA one fail. An extra one is the case that catches a future sentence added without a diff to `types.ts`. |
| P4 | a `RowEdit` whose `strengths` is any of the four retired strings, before and after `correctUngradedFeedbackSeed` | a new case in `ungradedDisclosure.test.ts` per retired string | the returned `edit.strengths` is unchanged. Direction: unchanged is failure; the whole point is that it must move. |
| P5 | the three test files that pin this copy | `npm run test:paths -- src/app/components/grading-results/ungradedDisclosure.test.ts src/lib/grade/engine.ungraded.test.ts src/app/components/grading-results/ungradedRowLabel.test.ts`, exit code written to a file and read from the file | exit code is non-zero, or any argument prints `NOT COVERED`. Baseline to beat: exit 0, 3 files, 67 tests (M5). A raw multi-path `vitest`/`npm test` is forbidden here - it drops unmatched arguments and exits 0 (`this-repo.md` section 1). |
| P6 | the whole suite | `npm test` from PowerShell | the pass count falls below the pre-change count for any reason other than a test this chunk deliberately rewrote, which must be named. |
| P7 | the type gate | `npx tsc --noEmit`, exactly one caller | any output at all. |

**Sabotage, required before the chunk is called done.** Revert A31-R2's engine
edit alone (restore the two "Re-run" sentences, leave everything else) and
prove P1 and P3 both go RED. A guard nobody has watched fail is not a guard.
Restore with a `cp` backup, never `git checkout --` (that reverts to the index
and destroys uncommitted work in the same file).

---

## 9. Write set

Derived, not asserted. The command and its real output:

```
grep -rln "Re-run to grade\|ungraded\.message\|UNGRADED_DISCLOSURE_COPY\|correctUngradedFeedbackSeed\|correctUngradedSeeds" src --include=*.ts --include=*.tsx
src/app/components/grading-recording/classTrendsRunCohort.test.ts
src/app/components/grading-results/ungradedDisclosure.test.ts
src/app/components/grading-results/ungradedDisclosure.ts
src/app/components/GradingResults.tsx
src/app/components/repo-grades/repoGradesBulkGrade.test.ts
src/app/components/repo-grades/repoGradesBulkGrade.ts
src/app/components/repo-grades/useRepoGradesBulkGrade.ts
src/lib/grade/engine.ts
src/lib/grade/engine.ungraded.test.ts
src/lib/grade/types.ts
```

and, for tests that read a changed file AS SOURCE TEXT (the class that turns a
correct change red):

```
grep -rln "grade/engine\.ts" src --include=*.test.ts
src/app/components/grading-results/ungradedDisclosure.test.ts
src/lib/code-runner.test.ts
src/lib/grade/grouping-zip-parents.wiring.test.ts
```

Negative canary for both instruments: `grep -rln "Re-run to grade the WHOLE"
src --include=*.ts --include=*.tsx` prints nothing, exit 1. Positive canary:
both commands list `src/lib/grade/engine.ts` / `ungradedDisclosure.test.ts`,
files known to contain the terms.

**This enumeration is a FLOOR, not the set.** The implementer must re-derive it
with its own instrument against the tree as it stands when the wave opens, and
report what this list missed.

### WRITE - the implementer may edit exactly these

| Path | Why |
|---|---|
| `src/lib/grade/types.ts` | A31-R1. New exported record. No import added. |
| `src/lib/grade/engine.ts` | A31-R2. `:301-322` only. |
| `src/app/components/grading-results/ungradedDisclosure.ts` | A31-R3, A31-R4. |
| `src/app/components/grading-results/ungradedDisclosure.test.ts` | A31-R5, and the P4 cases. Reads `engine.ts` by path (`:412`, `:498` read sibling sources) and transcribes its literals at `:95`/`:105`. |
| `src/lib/grade/engine.ungraded.test.ts` | A31-R6, P3. |
| `docs/BACKLOG.md`, `docs/backlog.yml` | close A31; file RES-A31-1..3 (section 10). Both, together - `src/tools/backlog/check-generated.ts:49-50` reads both and gates on their agreement. |
| `docs/REGRESSION.md` | the behaviour entry. `grep -a` is required on this file. |

### ADOPTED - reads the changed data, verified unaffected, must not be edited

- `src/app/components/GradingResults.tsx` - calls `correctUngradedSeeds`; the
  function's signature does not change.
- `src/app/components/grading-results/ungradedRowLabel.ts` and its test - read
  `classifyRow`'s six-state output, not the message text.
- `src/app/components/repo-grades/repoGradesBulkGrade.ts:229` and
  `useRepoGradesBulkGrade.ts:319` - read `ungraded.message`, but only on a
  `grading-failed` row (C5 is a one-entry caller, so no not-attempted row can
  reach it). Their test at `repoGradesBulkGrade.test.ts:293` parameterises the
  message rather than transcribing a literal - checked by opening it.
- `src/app/components/grading-recording/classTrendsRunCohort.test.ts` - its
  message literals are its own (`:140`, `:142`), unrelated to the engine's.
- `src/lib/code-runner.test.ts`, `src/lib/grade/grouping-zip-parents.wiring.test.ts` -
  read `engine.ts` by path but assert on code-runner wiring and zip-parent
  grouping, neither of which this diff touches. Both were opened.

### DO NOT TOUCH - held by another agent right now

`git status --short` at the start of this pass shows 38 modified `*.test.ts`
files plus `docs/css-orphans.md`. They are backlog row **L15**'s whole-tree
walkers. Two of them matter to this chunk:

- **`src/app/components/grading-results/gradingResultsHelpersWiring.test.ts`**
  (modified) owns the client-bundle guard: `CLIENT_FILES` at `:103`, the
  completeness assertion at `:230`, and the walk-roots assertion naming
  `src/lib/grade/types.ts` at `:131`. **This design adds no file to that
  directory and no new import specifier**, so nothing in it needs to change.
  The implementer must NOT edit it, and the wave gate must re-run it after
  L15 lands.
- **`src/lib/grade/grade-result-doors.wiring.test.ts`** (modified) - the door
  guard. Not in this write set. A13 RES-7 already records that it is satisfied
  by a comment; that is L9's row, not A31's.

`docs/a29-architecture.md` (modified, a third agent) and `docs/css-orphans.md`
are out of scope and must not be touched.

**Disjointness against L15**: none of the five source/test files in the WRITE
set appears in `git status --short`. Verified by inspection of the 39-line
status output against the seven write paths; the intersection is empty.

### Structural gates this diff must clear

| Gate | Why it is in play |
|---|---|
| `src/file-size-ceiling.structure.test.ts` | every edited file gains lines. M4 shows the largest is 892; none approaches 1000. |
| `src/lib/no-emojis.test.ts` | new user-facing copy, and the scan covers `docs/` as well as `src/`. Do not hand-roll a scan; this test owns the policy and its one authorized exception. |
| `src/source-bytes.structure.test.ts` | new string literals written through Write/Edit, which materialise `\uXXXX` escapes as the literal character. The recommended copy uses only ASCII, including the ASCII hyphen-minus in " - "; **do not write an en dash**. |
| `src/tools/backlog/check-generated.ts` | `docs/backlog.yml` and `docs/BACKLOG.md` must be regenerated together. |
| `npx tsc --noEmit` | exactly one caller - the wave gate. It races on `tsconfig.tsbuildinfo`. |

---

## 10. Residual register

Each entry names an OWNER, an INSTRUMENT and a STEP. A residual missing any of
the three is a deletion, and one that is not in `docs/BACKLOG.md` does not
exist - so all three below are filed as backlog rows by this chunk's own push,
not merely listed here.

**RES-A31-1 - the run-deadline surface copy has never been on screen.**
Section 3 measured that `deadlineMs` reaches the engine only from the three
unattended workflow callers, and no unattended run renders through
`GradingResults.tsx`, so `UNGRADED_DISCLOSURE_COPY["run-deadline"]` is
unreachable on the only surface that reads it. It is not deleted: the switch at
`ungradedDisclosure.ts:77-88` needs both members for exhaustiveness, and the
member becomes live the moment a workflow-produced run is shown in that table.
OWNER: the next chunk that renders an unattended run through `GradingResults`,
or A12/A13's re-run design pass. INSTRUMENT: `grep -rn "runDeadlineMs" src
--include=*.ts --include=*.tsx | grep -v "\.test\."` re-run against the tree -
if any attended caller appears, the member is live. STEP: that chunk's own
scoping pass.

**RES-A31-2 - the per-surface remedy.** A31 deliberately ships copy that names
no control (section 6). What the instructor can actually DO differs by caller
and only a surface knows which caller it is showing. OWNER: the A12/A13 re-run
design pass, which already holds the identity question this depends on.
INSTRUMENT: open `GradingResults.tsx`'s props and establish whether the
mounting surface is distinguishable there today (it receives `canvasUrl`,
`assignmentName`, `filesRetained` - `canvasUrl` is `""` for both
`GithubGradingPanel.tsx:852` and, needs checking, the zip path, so it is NOT a
source discriminator as things stand). STEP: before any per-surface copy or
re-run control is designed.

**RES-A31-3 - "graded N submission(s)" counts rows that were never
attempted.** Section 7, SIBLING 2. Four sites: `steps.grading-run.ts:507,554`,
`steps.grading-draft-flow.ts:293`, `steps.grading-cartridge.ts:226`, plus
`grading-draft-checklist.ts:50` and `grading-draft-view.ts:24` reading the
same length. Root cause is `engine.ts:281-291`'s post-N13a invariant
`results.length === studentSubmissions.length`. OWNER: an implementer wave on
the workflow registry. INSTRUMENT: `gradedResults(entry.run.results).length`
(`types.ts:180-182`) for the graded count, and
`ungradedResults(...).length` for the disclosure, with a test driving a run
through `gradeAction` that hits the bound and asserting the summary line's
number equals the graded count, not the row count. STEP: the next chunk that
may write `src/lib/workflows/registry/steps.grading-*.ts`.

**RES-A31-4 - OWNER-ONLY: nothing here renders.** Whether the new copy is
legible, correctly line-wrapped in the "What Went Well" box and in the Drafted
Grades Comment `TextField`, and whether it reads as this app's voice on a real
screen, cannot be established in this checkout. `docs/loop/this-repo.md`
section 6: no component is rendered by any test, there is no `.env`, and the
network is blocked. OWNER: the repo owner. INSTRUMENT: a browser, a real
grading run with `GRADE_MAX_SUBMISSIONS` set below the queue size, inspecting
a dropped row on both surfaces. STEP: the owner-verification pass. This is the
same shape as A13's RES-4/RES-5 and should be batched with them rather than
escalated separately.

---

## 11. Disposition of the A31 backlog row's own claims

Re-derived LAST, after all requirement numbering above was final.

| A31 row claim or prescription | Disposition | Where it went |
|---|---|---|
| `grep -n "Re-run to grade" engine.ts` returns `:307` and `:320` | KEPT - re-measured, identical | M1 |
| `engine.ts:192` is the `.slice(0, maxSubmissions)` prefix | KEPT - re-measured, identical | M2 |
| A re-run re-takes the same prefix on the zip caller | KEPT, and EXTENDED to all five callers | section 3 |
| "Both strings land in an EDITABLE STRENGTHS TEXTAREA on the review table" | **WITHDRAWN as written.** True before b7e62fe; false for `GradingResults.tsx` today. The defect is real and lives at the data layer plus two other surfaces. Enforcer it protected: none - the row had no instrument yet. | sections 2.1, 4 (S1, S3, S4) |
| "I traced the zip caller only" (the row's own stated LIMIT) | CLOSED | section 3 |
| "the message must say what the instructor can actually do (raise the bound, or split the upload)" | **WITHDRAWN.** "Raise the bound" names a control that exists in no UI (M3); "split the upload" is true on one of five callers. Adopting it would ship a second false instruction. Replaced by A31-R1's control-free wording. | sections 2.3, 5, 8.2 |
| "never Re-run" | KEPT, and made enforceable | A31-R1, P1 |
| "DO NOT close it by adding a re-run control" | KEPT | section 6 |
| "a frozen-literal assertion over the copy set the engine emits" | KEPT, and STRENGTHENED - the assertion is driven through the production grading door and ranges over the engine's distinct prefix set, so an EXTRA sentence fails too | A31-R6, P3 |
| "this copy family is closed by CONSTRUCTION rather than by a prose check" | KEPT, and the construction is now single-authorship in `types.ts` rather than two independently frozen lists | section 8.1 |
| "STEP: the next chunk that may write `src/lib/grade/engine.ts`" | KEPT - this is that chunk | section 9 |

Three findings this scope adds that the row did not contain: the second
editable surface (Drafted Grades), the model prompt, and the false replacement
copy shipped by the fix for the original defect.

---

## 12. What this environment cannot verify

Stated rather than worked around, per `docs/loop/this-repo.md` section 6.

- **Nothing renders.** vitest is `environment: "node"` and collects only
  `src/**/*.test.ts`. Every claim in section 4 about what an instructor SEES
  is a READING CLAIM, traced through code. Specifically: S1 is built from
  `UNGRADED_DISCLOSURE_COPY[stoppedBy]` via `classifyRow`/
  `correctUngradedFeedbackSeed` reading `result.ungraded.stoppedBy`, and
  rendered by `RowFeedbackBoxes.tsx:115` mapping `FEEDBACK_FIELDS`
  (`gradingResultsHelpers.ts:216`) over `edit[field]`; S3 is built from
  `result.overallComment` alone (`DraftedGradesTab.tsx:669`). No test in this
  repo observes either.
- **No live model, no API key.** S4's effect - what the model does when handed
  a "submission" whose only content is a not-graded notice - cannot be
  observed here. The trace is established; the consequence is not.
- **No live database and no network.** The persisted-edit hazard A31-R4 closes
  is reasoned from `localStorage` code (`gradingResultsHelpers.ts:614-630`),
  not observed. A unit test can exercise the predicate; nothing can exercise a
  real browser's stored value.
- **I could not determine** whether the zip path passes `canvasUrl=""` to
  `GradingResults` the way `GithubGradingPanel.tsx:852` does. It matters only
  to RES-A31-2, not to any requirement here, and it is recorded in that
  residual as a thing to open rather than answered by inference.
