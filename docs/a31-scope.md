# A31 scope: the grading engine's "Re-run" instruction

Architecture seat. Revision 1 2026-09-22; **revision 2, 2026-09-23**, applying
the six rulings in `docs/a31-rulings.md` (commit 5ff763f) after revision 1 came
back NOT CLEAN with 4 blockers, 6 majors and 7 minors. Consumer: one
implementer wave, after a fresh `loop-checker` pass. This document decides
SHAPE. It contains no production code.

Every quantity below names the command that produced it, run from the repo root
on 2026-09-23 unless stated otherwise. Every `file:line` cited was opened, and
every citation in revision 1 was re-verified line by line for this revision -
seven were wrong by one to five lines and are corrected here.

Leverage trigger (`docs/loop/leverage.md`, `seats.md` Acceptance criteria):
**FIRED AND RECORDED AS "NO CLAIM"**. A31 is a bug fix - a copy correction to
text the app already emits, plus one filter that stops a false sentence
reaching a model. It builds no capability a user reaches, so there is no
advantage class to name and no removal test to owe.

## What revision 2 changed, in one place

| Ruling | Revision 1 | Revision 2 |
|---|---|---|
| 1 | proposed a replacement sentence ending "this row is only reached if what is submitted for grading changes" | **that sentence was also false** - section 5.1. Replaced with two sentences that assert only what the code guarantees at the moment the row is built, and nothing actionable at all |
| 2 | raised the model prompt, gave it neither requirement nor residual | **A31-R7** fixes it, structurally, with the helper revision 1 had named only as another residual's instrument |
| 3 | closed the localStorage hazard, left the larger Drafted Grades hazard open | **A31-R8** fixes the render path; migrating stored drafts is explicitly OUT, and the asymmetry is stated |
| 4 | two gates could not produce the quantity they failed on | P2 asserts over the exported values; P3's "extra sentence by construction" claim is **withdrawn**, and the honest limit is stated |
| 5 | "four surfaces"; canvasUrl an open question; frozen-literal test not mentioned; residual owners that do not exist; sibling sweep incomplete | three surfaces (measured); canvasUrl measured and folded into A31-R4; the red test named with its real repair; owners replaced; **SIBLING 4 found and answered** |
| 6 | seven stale citations; a client-bundle argument describing a guard A23 replaced; a stale do-not-touch note; a door that cannot be driven | all corrected below |

---

## 1. Measurement log

**M1 - the two strings.**

```
grep -n "Re-run to grade" src/lib/grade/engine.ts
307:        message: "Not graded: the grading run's time budget ran out before this submission could be started. Re-run to grade it.",
320:        message: `Not graded: this run is limited to ${maxSubmissions} submissions. Re-run to grade the rest.`,
```

**M2 - the prefix.** `sed -n '192p' src/lib/grade/engine.ts` ->
`  const limitedEntries = studentSubmissions.slice(0, maxSubmissions);`

**M3 - the bound's value and its reach.**
`grep -n "MAX_SUBMISSIONS\|getGeminiMaxSubmissions" src/lib/gemini.ts` ->
`32:const DEFAULT_MAX_SUBMISSIONS = 40;` and `129:export function
getGeminiMaxSubmissions()`, reading `process.env.GRADE_MAX_SUBMISSIONS` at
`:131`.

`grep -rn "GRADE_MAX_SUBMISSIONS" src --include=*.ts --include=*.tsx` returns
one source hit, `src/lib/gemini.ts:131`, plus four comment mentions in
`src/lib/grade/class-trends-draft.ts`. **No component, no settings surface, no
server action reads or writes it.** It is an environment variable, read per
run.

**Do not trust the comment here.** `src/lib/gemini.ts:58` still says "at the
default cap of 5 submissions per run (DEFAULT_MAX_SUBMISSIONS)". The constant
26 lines above is 40.

**M4 - line counts**, `@(Get-Content <file>).Count` from PowerShell (never
`Measure-Object -Line`; `this-repo.md` section 3 records the 42-line
disagreement on one file):

| File | Lines |
|---|---|
| `src/lib/grade/engine.ts` | 491 |
| `src/app/components/grading-results/ungradedDisclosure.ts` | 177 |
| `src/app/components/grading-results/ungradedDisclosure.test.ts` | 522 |
| `src/lib/grade/engine.ungraded.test.ts` | 376 |
| `src/app/components/GradingResults.tsx` | 892 |
| `src/app/components/DraftedGradesTab.tsx` | 870 |

No file in the write set is within 100 lines of the 1000-line ceiling
(`src/file-size-ceiling.structure.test.ts`, `LIMIT = 1000`), and this design
adds tens of lines, not hundreds.

**M5 - baseline of every test file this chunk touches.** Multi-path runs use
the wrapper, and the exit code is written to a file and read from the file,
never through a pipe:

```
npm run test:paths -- src/app/components/grading-results/ungradedDisclosure.test.ts src/lib/grade/engine.ungraded.test.ts src/app/components/grading-results/ungradedRowLabel.test.ts src/lib/grade/class-trends-insight.test.ts src/app/components/grading-results/gradingResultsHelpersWiring.test.ts *> $out
$LASTEXITCODE | Out-File -FilePath $code -Encoding ascii
```

`Get-Content $code` -> `0`. `Test Files 5 passed (5)`, `Tests 102 passed (102)`,
`Duration 2.28s`, and one credited line per argument: `ungradedDisclosure`
41, `engine.ungraded` 13, `ungradedRowLabel` 13, `class-trends-insight` 12,
`gradingResultsHelpersWiring` 23, all `COVERED`.

**The walkers now carry an explicit 30s timeout (L15, commit 2a2c147), and the
whole five-file run took 2.28s.** A 5000ms failure after this change is
therefore a FINDING about this diff, not the old default biting.

**M6 - search canaries** (`traps-search.md` requires one before any absence
claim; `grep -P` is broken here and is used nowhere in this document).

- Positive: the owns sweep command in section 9 lists `src/lib/grade/engine.ts`,
  a file known to contain the terms.
- Negative: the same instrument over a string the tree does not contain,
  `grep -rln "Re-run to grade the WHOLE" src --include=*.ts --include=*.tsx`,
  prints nothing and exits 1. An empty result from this instrument is a real
  absence.
- Non-ASCII scan of this document: `LC_ALL=C grep -c '[^[:print:][:space:]]'
  docs/a31-scope.md` returns 0, with the same command returning 1 on
  `src/lib/grade/engine.ts` (an em dash at `:184`) as the positive canary.

---

## 2. Three corrections to the A31 row itself

### 2.1 The row's headline surface claim is STALE

The row says both strings "land in an EDITABLE STRENGTHS TEXTAREA on the review
table". On `GradingResults.tsx` that stopped being true at commit b7e62fe.

`GradingResults.tsx:188` and `:208` both wrap the seed map in
`correctUngradedSeeds(run, loadGradingResultsEdits(canvasUrl, run))`.
`correctUngradedSeeds` (`ungradedDisclosure.ts:166-177`) maps
`correctUngradedFeedbackSeed` (`:148-157`) over every row, replacing
`edit.strengths` whenever it equals the engine's own `result.ungraded.message`.
`seedEdits` (`gradingResultsHelpers.ts:280-297`) gives **every** result an
entry and `loadPersistedEdits` (`:603-607`) merges storage over that seeded map
key by key, so no row reaches the correction with `current === undefined`.

**Consequence for scope**: A31 is not "a false sentence in one textarea". It is
a false sentence at the DATA layer with one surface already patched and three
other consumers not. Fixing only the patched surface would fix the one place
that is already correct.

### 2.2 The row's stated LIMIT is closed here, and the answer differs by caller

Section 3. The check confirmed the census is complete and that a re-run grades
the rest on none of the five callers, so that is not re-argued below.

### 2.3 The row's prescribed fix names two remedies, one of which does not exist

The row's `note` says the message "must say what the instructor can actually do
(raise the bound, or split the upload)".

- **"Raise the bound" is not an instructor action.** M3 measured
  `GRADE_MAX_SUBMISSIONS` as reachable from no UI. Copy that names it names a
  control that does not exist - the exact defect A31 exists to remove.
- **"Split the upload" is true on one of five callers.** There is no upload on
  the Canvas path, and the GitHub path's analogue is a repo queue.

Rejected, and replaced by section 5.2's wording.

---

## 3. The caller census

Derived with
`grep -rn "gradeSubmissions\|gradeEntries\|gradeCanvasUrl\|gradeStudentEntries" src --include=*.ts --include=*.tsx | grep -v "\.test\.ts"`,
then every hit opened. `gradeStudentEntries` (`engine.ts:177`) is
module-private; the three exported doors are `gradeSubmissions` (`:396`),
`gradeEntries` (`:450`) and `gradeCanvasUrl` (`:466`), all funnelling into it
(`:435`, `:458`, `:490`).

| # | Production call site | Source | Batch size | Count bound | Deadline |
|---|---|---|---|---|---|
| C1 | `grading.ts:871` `gradeSubmissions(zipBuffer, ...)` | uploaded zip | N in the zip | reachable | reachable (unattended only) |
| C2 | `grading.ts:813` `gradeCanvasUrl(canvasUrl, ...)` | Canvas assignment/discussion | every participant Canvas returns | reachable | reachable (unattended only) |
| C3 | `github.ts:753` `gradeEntries(entries, ...)` | the GitHub panel's repo queue | one per queued repo | reachable | **not** - no `options` argument at that call |
| C4 | `grading.ts:636` `gradeEntries([entry], ...)` | one Canvas submission | exactly 1 | no | no |
| C5 | `github-repos.ts:839` `gradeEntries([entry], ...)` | one repo | exactly 1 | no | no |

C4 and C5 are immune by construction: with one entry `slice(0, maxSubmissions)`
is the identity for any bound >= 1, and the deadline check at `engine.ts:207`
is guarded by `i > 0`, so entry 0 always starts.

**Where the deadline comes from.** `deadlineMs` reaches the engine only through
`GradingRunOptions` (`engine.ts:126-133`), set at `grading.ts:730` from a
FormData field read at `:727-729`. `grep -rn "runDeadlineMs" src --include=*.ts
--include=*.tsx | grep -v "\.test\."` shows exactly four writers of that field,
all unattended workflow steps: `steps.grading-cartridge.ts:105`,
`steps.grading-draft-flow.ts:265`, `steps.grading-run.ts:478` and `:539`.
`src/app/page.tsx:63` drives `gradeAction` through `useActionState` and sets no
such field; `grading.ts:719-726`'s own comment says the same.

**So the run-deadline message (`engine.ts:307`) is produced only on the three
unattended workflow callers.** The check added the second half of that fact,
and it matters: **no unattended run is ever rendered through
`GradingResults`** - workflow runs become drafts, which render in
`DraftedGradesTab`. So `UNGRADED_DISCLOSURE_COPY["run-deadline"]`
(`ungradedDisclosure.ts:48-49`) is copy for a state its own surface cannot
reach today. It is not deleted - the switch at `ungradedDisclosure.ts:77-88` is
the exhaustiveness guard the union needs - but nobody should believe it has
ever been on screen there. It HAS been on screen in Drafted Grades, uncorrected
(section 4, S3).

### Does a re-run grade the rest, per caller?

| # | Pruned before a second run? | Verdict |
|---|---|---|
| C1 zip | No. `gradeSubmissions` re-runs `extractSubmissions(zipBuffer)` (`engine.ts:403-417`) over the whole archive every time. Nothing consults a prior run. | **Same prefix re-taken.** FALSE. |
| C2 Canvas | No. `gradeCanvasUrl` re-runs `fetchCanvasWork(url)` (`engine.ts:476-488`) and builds entries from every student Canvas returns. | **Same prefix re-taken.** FALSE. |
| C3 GitHub | Not by the code. `GithubGradingPanel.tsx:372-378` passes `queue.map(...)`, the panel's own state, and `github.ts:753` grades all of it. | **Same prefix re-taken** unless the instructor edits the queue by hand. FALSE as written. |
| C4, C5 | n/a - the tails never fire. | n/a |
| Unattended C1/C2 | No, and the deadline is re-derived from the same 50s tick budget (`steps.grading-repos.grade-repo.ts:77-78`; `run-schedules/route.ts:126` `now + 50_000`). | **FALSE on both tails.** |

---

## 4. Who reads this text: the full surface trace

`buildUngradedRow` (`engine.ts:146-171`) writes the message into THREE fields:
`strengths` (`:152`), `overallComment` (`:153`, via `composeOverallComment`,
which for an ungraded row returns the message unchanged - `types.ts:28-37`
filters the two empty parts) and `feedback` (`:162`). An identifier sweep for
`strengths` alone misses two thirds of the reach; the sweeps used were
`grep -rn "\.overallComment"` and `grep -rn "\.feedback\b"` over
`src --include=*.ts --include=*.tsx`, with every grading-path hit opened.

| # | Surface | Path | State today |
|---|---|---|---|
| S1 | The "What Went Well" textarea on the review table | `GradingResults.tsx:188,208` -> `correctUngradedSeeds` -> `RowFeedbackBoxes.tsx:115` over `FEEDBACK_FIELDS` (`gradingResultsHelpers.ts:216`) | **CORRECTED** at b7e62fe |
| S2 | The review CSV download | `GradingResults.tsx:512` -> `buildCsvContent` (`gradingResultsHelpers.ts:488`), Strengths column at `:512` is `edit?.strengths ?? result.strengths` | **CORRECTED** transitively - `edit` is always present, so the fallback never fires |
| S3 | **The Drafted Grades Comment field** | `DraftedGradesTab.tsx:188-193` seeds `overallComment` from `r.overallComment` for **every** result with no `isUngraded` filter; `:669-671` renders it in an editable MUI `TextField`, `:676-677` in a `<span>` whose `title` is the same text | **UNCORRECTED, LIVE.** The second editable box. This is where the run-deadline message actually lands. |
| S4 | **A model prompt** | `api/class-trends-insight/route.ts:128` calls `anonymizeGradeResults(entry.run.results)` - the whole array (`class-trends-insight.ts:59-68` maps every element) - and `renderSubmission` (`:131-140`) emits `  Overall: ${submission.overallComment}` at `:136` | **UNCORRECTED, LIVE.** |
| S5 | Unattended run summary lines | `steps.grading-run.ts:507,554`, `steps.grading-draft-flow.ts:293`, `steps.grading-cartridge.ts:226` | A different false claim - section 7, SIBLING 2 |
| S6 | A Canvas comment posted to a student | every posting door | **CLOSED BY CONSTRUCTION** |
| S7 | A gradebook CSV handed to an LMS | `steps.grading-singles.ts:616-621` | **CLOSED.** The pushed record is `{name, externalId, itemName, score}`; it has no comment field. |

### S6, stated plainly

**Instructor-facing text from this defect cannot be posted to a student on the
measured tree.** The mechanism is a type, not a check: `UngradedResult`
declares `readonly userId?: never` (`types.ts:267`, with the reason at
`:261-265`), and `NotAttemptedOutcome` carries the Canvas id as `canvasUserId`
(`types.ts:153-157`), whose own comment says it is "deliberately never spelled
`userId`" so the identity-gated doors stay shut. Doors opened and confirmed:

- `grading.ts:518` (`postGradingDraftAction`, the Drafted Grades "Post" button)
- `grading-review-rows.ts:119` (`buildGradingReviewRows`, the source of both
  workflow review tables)
- `steps.grading-draft-flow.ts:594`
- `steps.grading-singles.ts:605-613` (the compound N13a Ruling 2 check)

**No requirement below adds a `userId` to an ungraded row.**

---

## 5. The replacement copy

### 5.1 Why revision 1's sentence was also false

Revision 1 proposed ending both sentences with "this row is only reached if
what is submitted for grading changes". Ruling 1 rejects it, and the falsifier
is in revision 1's own section 5:

- **The bound is read per run from the environment** (`engine.ts:188` calls
  `getGeminiMaxSubmissions()`, `gemini.ts:129-133` reads
  `process.env.GRADE_MAX_SUBMISSIONS`). Raising it reaches the row with
  nothing submitted changed. The "only ... if" is false.
- **On the deadline member it is worse**: the stop index is wall-clock
  (`engine.ts:207`, `Date.now() >= deadlineMs`), so a faster run reaches the
  row with byte-identical input.
- The same sentence hedged "in about the same place" while asserting
  "only ... if" - self-contradictory inside one sentence.
- It assumed entry ORDER is stable across runs. Nothing in this repo measures
  that, and on C2 the order is whatever Canvas returns.

**The rule this establishes, and every later revision is bound by it: a
sentence may assert only what holds on every caller and every reachable
state.** A row that exists because a sentence is false must not ship another
one.

### 5.2 The wording

Two facts, both guaranteed by the code at the moment the row is constructed,
and nothing else. No instruction, no prediction about a future run, no
assumption about ordering, no hedge.

| Key | Sentence |
|---|---|
| `submission-count-bound` | `Not graded: this run reached its submission limit before this submission.` |
| `run-deadline` | `Not graded: this run's time budget ran out before this submission was started.` |

Nothing actionable is stated, because nothing is reliably actionable. Section
5.3 is the evidence for that, and Ruling 1 is explicit: where nothing is
reliably actionable, say nothing rather than something false.

The engine, and only the engine, appends one further sentence because it is the
only layer that holds the number: `This run's limit was ${maxSubmissions}
submissions.` That is a past-tense statement about the run that happened,
reading the same value the run used (`engine.ts:188`), so it holds in every
reachable state. It is APPENDED, never interpolated into the shared sentence,
so the shared sentence stays a literal a human reviews once.

### 5.3 What is actually true per caller, and why no copy can say it

| Caller | What would let the instructor grade the rest TODAY |
|---|---|
| C1 zip | Upload a zip containing only the ungraded students. Real; no in-app control builds it. |
| C2 Canvas | **Nothing in the attended UI.** The only in-app route is the `grade-one-submission` workflow step, reaching `gradeOneSubmissionAction` (`grading.ts:597`, sole caller `steps.grading-singles.ts:238`, confirmed by `grep -rn "gradeOneSubmissionAction" src` canaried against a known-UI action), which needs the course id, assignment id and numeric Canvas user id typed by hand, one student at a time. |
| C3 GitHub | Remove the already-graded repos from the queue and grade again. True, and the panel has the control. |
| C4, C5 | Not applicable. |
| Unattended | Nothing from a workflow form. |
| All | The owner raises `GRADE_MAX_SUBMISSIONS` in the Vercel dashboard. Read at runtime, so no deploy - but an OWNER action outside the app, and it must not appear in instructor copy. |

The engine cannot tell which caller it is serving: `gradeStudentEntries`'
signature (`engine.ts:177-186`) takes entries, instructions, a rubric, a
provider, `pointsPossible` and `GradingRunOptions`, and `GradingRunOptions`
(`:126-133`) has exactly one member, `deadlineMs`. Neither can the surface leaf:
section 9's measurement shows `GradingResults` is mounted from three places and
two of them pass the identical `canvasUrl` value, so even the surface cannot
distinguish zip from GitHub. Adding a source-kind channel is the tempting
widening and is routed out (section 6).

---

## 6. Is the bound itself the defect?

Both rows read in full from `docs/backlog.yml`.

**A31 is a copy fix. It is ALSO the visible symptom of a missing capability,
and this design does not widen to cover it.**

The missing capability is "grade the submissions this run did not reach". A12
(RES-2/RES-3) and A13 already hold it, with the blocker recorded:
`types.ts:143-149` states that `sourceIndex` is "NOT an index into any caller's
own input array" and that "a caller that treats it as a re-run key re-runs the
wrong student"; `GradeResult` carries no id; `repoDigestToEmbeddedEntry` sets no
`gradedRepo`/`gradedRef`/`userId`.

Two consequences:

1. **A31 must not add a re-run control**, as its own note says.
2. **A31 must not add a source-kind channel to `GradingRunOptions`** so the
   copy can name a per-caller remedy. That touches five call sites, a public
   options type and three wrappers, and it puts instructor guidance in the
   layer furthest from any surface. Routed out as **RES-A31-2**.

---

## 7. Sibling false claims

Swept by CLAIM shape - a sentence promising an outcome - not by the word
"Re-run", because `traps-search.md` records that an identifier-shaped search
cannot find a surface reaching the same data another way.

### SIBLING 1 - CONFIRMED FALSE: the replacement copy shipped at b7e62fe

`ungradedDisclosure.ts:45-50` emits, for both members:

> "... Grading again without changing the queue will grade the same students
> again, not this one - **remove the students who already have a grade from the
> queue first**."

- **C3 GitHub: TRUE.** `GithubGradingPanel.tsx:372-378` grades exactly the
  panel's `queue`, which has editing controls, and the word matches the
  on-screen noun.
- **C1 zip: NOT ACTIONABLE AS WRITTEN.** No queue exists on that surface; the
  control is a file upload. It names a control that is not there.
- **C2 Canvas: FALSE.** `gradeCanvasUrl` grades whatever `fetchCanvasWork(url)`
  returns. There is no queue and no way to remove a student.

The fix for one text-shaped defect shipped a second one in the same box, and
the guard meant to prevent it (`ungradedDisclosure.test.ts:202-210`, "no member
contains the substring Re-run") pins a SPELLING, so a differently-worded false
instruction passes. **In scope: A31-R3.**

### SIBLING 2 - CONFIRMED FALSE: "graded N submission(s)"

`engine.ts:281-291`'s own comment states the post-N13a invariant
`results.length === studentSubmissions.length`. Four unattended summary lines
still read that length as work done:

| Site | Text |
|---|---|
| `steps.grading-run.ts:507` | `graded ${gradeResult.run.results.length} submission(s)` |
| `steps.grading-run.ts:554` | same, offline zip branch |
| `steps.grading-draft-flow.ts:293` | same |
| `steps.grading-cartridge.ts:226` | `graded (${gradeResult.run.results.length} students)` |

All four set `runDeadlineMs`, so all four can report rows never attempted. A
60-student Canvas assignment under a bound of 40 reports "graded 60
submission(s)". `grading-draft-checklist.ts:50` and `grading-draft-view.ts:24`
read the same length. Four files on a different layer - routed out as
**RES-A31-3**, not folded in.

### SIBLING 3 - CHECKED, NOT A DEFECT

`canvas-inbox.ts:701` ("Re-run to resume from here; nothing already confirmed
is repeated") and `:726` are the same wording shape and are **TRUE**, for the
structural reason grading lacks: that loop re-plans against Canvas's current
state every run - `:745` ("never on a week the fresh re-plan resolves to
already-present"), `:756-757`, `:897`. Its queue IS pruned. Left alone, and
recorded so a future sweep does not reopen it.
`visualizer-gap-audit.ts:171` and `steps.grading-run.ts:559` both name real,
reachable behaviour. Left alone.

### SIBLING 4 - CONFIRMED FALSE, and it is the nearest one. Revision 1 missed it.

`src/app/actions/grading-submission-grade.ts` reads the **same constant** at
`:142` (`getGeminiMaxSubmissions()`), applies the **same slice shape** at
`:147-148` (`slice(0, maxSubmissions)` / `slice(maxSubmissions)`), and emits at
`:194-197`:

> `Too many submissions in one grading run (limit ${maxSubmissions}). Retry this row on its own.`

Its own header at `:55-60` describes this as the deliberate improvement over
the engine: each excess submission "still gets its own row back ... naming the
limit and telling the instructor to retry it on its own, so no row is left
wedged in 'grading' forever".

**Measured: the instruction is false.** The action's sole caller is
`GradingRecordingPanel.tsx:593` (`grep -rn "gradeCapturedSubmissionsAction"
src`, canaried against its own test file, which imports it at
`grading-submission-grade.test.ts:28`). That call sits inside `handleGradeAll`
(`:563`), which builds `submissions` from `gradingRows.rawRows` (`:579-583`) -
**the entire table, always** - and it is wired to exactly one control, the
button at `:869`. There is no per-row grade control and no selection. Pressing
it again re-sends the same array, re-takes the same prefix, and the overflow
row receives the identical message.

The instructor can reach the row only by deleting the other rows
(`removeGradingRow`, `grading-rows.ts:320`, wired through
`useGradingCaptureTracking.ts:93`), which is destructive and records a
dismissal - not what "retry this row on its own" describes.

**Routed out as RES-A31-5, not folded in**: it is a different file, a different
action and a different surface, and the honest fix is a product call between
per-row retry and corrected copy. The finding is settled here so the receiving
row starts ahead rather than level.

---

## 8. The design

### 8.1 The shape decision

**The copy has ONE author and THREE consumers, and the author is
`src/lib/grade/types.ts`.**

Today the sentence is authored twice - `engine.ts:307,320` and, differently,
`ungradedDisclosure.ts:45-50`. That duplication is why b7e62fe could correct
one copy and ship a fresh defect in the other (SIBLING 1), and it is the L13
class this repo keeps filing rows about. The fix is not to correct both
strings; it is for there to be one string.

`src/lib/grade/types.ts` is the only module all three consumers may reach:

- `engine.ts:9-21` already imports from `./types`.
- `ungradedDisclosure.ts:24` already value-imports from `@/lib/grade/types`.
- `DraftedGradesTab.tsx:8` imports `@/lib/grade` **type-only**, and the comment
  at `:40` warns explicitly about "the risk a value import of @/lib/grade
  would" carry - so it must value-import from `@/lib/grade/types`, the narrow
  leaf, exactly as A22/A23 narrowed `classTrendsEntry.ts`.

**The client-bundle argument, corrected (Ruling 6).** Revision 1 justified this
by the name-based exemption A13's Ruling R created. That guard has been
REPLACED. `gradingResultsHelpersWiring.test.ts:80-87` records the current one:
a transitive runtime-import-graph walk under a capability predicate on the
RESOLVED path, in which "types.ts is a NAMED ROOT of this walk (Ruling Z3): it
is judged by its own reachability, not by a name-based exemption". That is
STRONGER than the exemption revision 1 cited, and it yields the real
constraint:

> **`types.ts` must gain no import.** Adding string constants adds none, so the
> walk, the `CLIENT_FILES` completeness assertion
> (`gradingResultsHelpersWiring.test.ts:230`) and `next build`'s client
> boundary are all unaffected.

**And it decides A31-R8's shape.** `CLIENT_FILES`
(`gradingResultsHelpersWiring.test.ts:103-122`) is asserted at `:230` to be
exactly this directory's non-test files plus its parent's non-local consumers,
and `../DraftedGradesTab.tsx` is not in it. Had `DraftedGradesTab` imported the
correction from `./grading-results/ungradedDisclosure`, that assertion would go
red and the guard file would enter the write set. Importing the record from
`@/lib/grade/types` instead keeps `DraftedGradesTab` outside that directory's
consumer set entirely. **No guard file is edited by this chunk.**

### 8.2 Requirements

Ids are re-derived in section 11 AFTER all numbering below was final.

**A31-R1. One authored copy, in the layer all three consumers may import.**
`src/lib/grade/types.ts` exports a record keyed by
`NotAttemptedOutcome["stoppedBy"]` holding section 5.2's two sentences. **No
`import` statement is added to that file** (section 8.1). Neither sentence
names a control, predicts a future run, or assumes entry order.

**A31-R2. The engine emits the shared sentence, and adds the count only where
it has it.** `engine.ts:298-310` (the deadline tail) emits the `run-deadline`
member verbatim. `engine.ts:311-323` (the count tail) emits the
`submission-count-bound` member followed by `This run's limit was
${maxSubmissions} submissions.`

**A31-R3. The surface stops authoring its own copy.**
`UNGRADED_DISCLOSURE_COPY` (`ungradedDisclosure.ts:45-50`) becomes the A31-R1
record, re-exported under its existing name so its consumers
(`ungradedDisclosure.ts:80,82,153,154`, `ungradedRowLabel.ts`, the tests) do not
move. The "remove the students who already have a grade from the queue first"
clause is DELETED on the evidence in SIBLING 1.

**A31-R4. A persisted edit written before this change is still corrected.**
`correctUngradedFeedbackSeed` (`ungradedDisclosure.ts:148-157`) corrects
`edit.strengths` only when it equals the CURRENT engine message or one of the
CURRENT literals. Edits persist under `ta-grading-results-edits:${canvasUrl}`
(`gradingResultsEditsKey`, `gradingResultsHelpers.ts:538`; written by
`persistGradingResultsEdits`, `:626-633`). After this change none of the four
retired strings matches any allowlist member, so the retired sentence -
including the original "Re-run to grade the rest." - would survive in the
textarea permanently.

**The storage key is SHARED, which widens this (Ruling 5).** Measured:
`GradingResults` is mounted from three places -
`GithubGradingPanel.tsx:852`, `GradingTab.tsx:427`, `LiveFeedPanel.tsx:430`
(`grep -rn "<GradingResults" src --include=*.tsx`). `GithubGradingPanel.tsx:854`
passes `canvasUrl=""` literally, and `GradingTab.tsx:429` passes its
`canvasUrl` state, which is `useState("")` at `:77` and is bound to the Canvas
URL field at `:250-254` - **so on the zip path it is `""` too**. Two reads, not
an open question: the GitHub surface and the zip surface share the single key
`ta-grading-results-edits:`, keyed within it by bare student name. A retired
sentence stored by either one is seeded onto the other.

The requirement: a frozen `RETIRED_NOT_ATTEMPTED_MESSAGES` list beside the
correction holding the four strings verbatim -

1. `Not graded: this run is limited to 40 submissions. Re-run to grade the rest.`
2. `Not graded: the grading run's time budget ran out before this submission could be started. Re-run to grade it.`
3. the b7e62fe `submission-count-bound` literal, transcribed from `ungradedDisclosure.ts:46-47`
4. the b7e62fe `run-deadline` literal, transcribed from `:48-49`

plus, because string 1 interpolated a number and an equality list cannot cover
every value `GRADE_MAX_SUBMISSIONS` has ever held, a condition that also fires
on a `strengths` CONTAINING `Re-run to grade` - a substring the app never emits
again once A31-R2 lands. State that trade in the code comment; it can only
false-positive on text an instructor typed containing that exact phrase.

**A31-R5. Both hand-transcribed test pins are re-transcribed, and the cheap
repair is forbidden.** Two places transcribe these sentences by hand:

- `ungradedDisclosure.test.ts:95,105` - the engine's literals, as fixtures.
  Its header at `:9` and `:67` says they are "Transcribed from
  buildUngradedRow, src/lib/grade/engine.ts:146-171". Left stale, the tests at
  `:314` and `:341` keep passing while asserting about a string the engine no
  longer emits.
- `ungradedDisclosure.test.ts:222-228` - `FROZEN_LITERALS`, which transcribes
  BOTH leaf sentences verbatim at `:225-226`. **This chunk turns that test
  red**, and revision 1 never said so.

**The cheap repair is forbidden by that test's own comment** (`:216-220`):
importing `UNGRADED_DISCLOSURE_COPY` there "would make this assertion a
tautology (a sabotaged copy would still equal 'itself'), exactly the failure
mode AC-3a's S4 sabotage exposed against an earlier draft of this test". The
real repair is to re-transcribe the new sentences by hand, in the same commit.
That is deliberately expensive, because the whole job of that test is that a
human reads the sentence once.

**A31-R6. The anti-drift guard asserts over the EXPORTED VALUES, driven through
a door that can be driven.** In `engine.ungraded.test.ts`: for a run driven
through `gradeEntries` - which is the door that file already imports and mocks
for (`gradeEntries` from `./engine`, with `../gemini`, `../llm` and
`../code-runner` mocked at the top of the file); `gradeSubmissions`, which
revision 1 named, needs a real zip buffer and `extractSubmissions` and cannot
be driven there - every `kind: "not-attempted"` row's `ungraded.message` STARTS
WITH the A31-R1 record's member for its own `stoppedBy`.

**The claim revision 1 made here is WITHDRAWN (Ruling 4).** Revision 1 said an
EXTRA sentence would be "caught by construction". It would not: a runtime
assertion over rows a fixture produced sees only the sentences that fixture
drives, and a new sentence on an undriven path is invisible. The only
structural guard is the leaf's exhaustive switch
(`ungradedDisclosure.ts:77-88`), and that fires when the UNION grows, not when
a member gains a new message. **Recorded as a known limit, not as a
strengthening**, and it is the reason A31-R5's hand-transcribed pin still
carries weight.

**A31-R7. The model prompt sees graded rows only (Ruling 2).** Two changes,
both in `src/lib/grade/class-trends-insight.ts`, which its own header
(`:13-18`) says is where every rule that matters lives because the route is a
thin shell - and there is no route test in this tree (`find src -path
"*class-trends-insight*" -name "*.test.ts"` returns exactly one file, the
module's own).

- `hasSubmissionsToAnalyze` (`:163-165`) currently returns
  `entry.run.results.length > 0` - it counts ROWS. A run in which every row is
  not-attempted therefore calls the model and spends the work budget on N
  copies of a not-graded notice. It must count GRADED rows, via `gradedResults`
  (`types.ts:180-182`).
- The route's single call, `anonymizeGradeResults(entry.run.results)`
  (`route.ts:128`), must pass only graded rows. Put the composition in the pure
  module as one exported selector the route calls, so the rule is
  unit-testable; leave `anonymizeGradeResults` itself unchanged so its existing
  three-slot contract (`class-trends-insight.test.ts:39-41`) and its "only
  function that touches `.student`" doc stay true.

**Renumbering slots is safe, and this was checked rather than assumed.** Slots
are prompt-internal labels only (`class-trends-insight.ts:116`, `:134`), and
`parseClassTrendsInsightResponse` returns `{kind, concept, reading}` (`:240`) -
nothing maps a slot back to a row. The new value import of `gradedResults` into
`class-trends-insight.ts` (which today imports `./types` type-only) adds one
runtime edge to a module that is import-free and is itself a named walk root,
so it reaches nothing new.

**A31-R8. The Drafted Grades render path is corrected the same way (Ruling
3).** `DraftedGradesTab.tsx` renders a not-attempted row's message at two
places - the editable `TextField` seed at `:669-671` (and the matching seeds at
`:648` and `:671`, and `startEdit`'s map at `:188-193`) and the read-only
`<span>` plus its `title` at `:676-677`. For a row where
`isUngraded(r) && r.ungraded.kind === "not-attempted"`, all of them render the
A31-R1 record's member for that row's `stoppedBy` instead of
`r.overallComment`. Both symbols come from `@/lib/grade/types` as VALUE
imports, never from the `@/lib/grade` barrel (`DraftedGradesTab.tsx:8,40`).

**NOT IN REMIT, and a reader will hit this exactly here: this chunk does not
migrate drafts already stored.** Corrections happen at render. Rewriting the
`overallComment` inside a stored `grading_drafts` payload would rewrite text an
instructor may have edited by hand, and it is a bigger and more dangerous
change than this row is chartered for.

**State the asymmetry, because revision 1 left it unstated**: A31-R4 spends a
whole requirement closing the strictly SMALLER version of this same hazard -
a per-browser `localStorage` value - while A31-R8 closes the larger one at
render and leaves the server-stored text alone. The difference is not
importance, it is reversibility: a `localStorage` seed is the app's own derived
value and correcting it loses nothing, whereas a stored draft row is a document
the instructor owns.

**A31-R9. One comment in one do-not-otherwise-edit file goes stale at this
diff.** `GradingResults.tsx:59-63` says `classifyRow` gives a row a correct
disclosure "instead of the engine's own 'Re-run to grade the rest' sentence
landing verbatim in the What Went Well box". After A31-R2 no such sentence
exists. This repo has been misled by five stale comments; correcting it is a
comment-text-only edit with no code change, and the file's classification in
section 9 says exactly that.

### 8.3 Pass conditions

Each names the object under comparison, the instrument producing each quantity,
and the direction of failure.

| # | Object | Instrument | RED when |
|---|---|---|---|
| P1 | the string literals in `src/lib/grade/engine.ts` | `grep -n "Re-run" src/lib/grade/engine.ts` | the command prints any line. Canary: the same command on `HEAD~1` prints `:307` and `:320`, proving the instrument fires. |
| P2 | **the VALUES of the exported record**, not any file's text | a unit assertion over `Object.values(UNGRADED_DISCLOSURE_COPY)`: no member contains `Re-run`, `queue`, or `Retry` | any member contains one. **Revision 1's version is withdrawn (Ruling 4)**: it grepped `ungradedDisclosure.ts`, which after A31-R3 only re-exports the values and which A31-R4 fills with the retired strings, so the named grep would print lines on correct code forever. |
| P3 | every `not-attempted` row from a run driven through `gradeEntries`, against the A31-R1 record | the assertion in A31-R6 | a row's message does not start with its own `stoppedBy` member. **Direction: missing-prefix only.** An extra sentence on an undriven path is NOT caught here and is not claimed to be. |
| P4 | a `RowEdit` whose `strengths` is any of the four retired strings, before and after `correctUngradedFeedbackSeed` | one case per retired string in `ungradedDisclosure.test.ts` | the returned `edit.strengths` is unchanged. Unchanged is failure. |
| P5 | `hasSubmissionsToAnalyze` and the new selector, over a run whose rows are all `not-attempted` | cases in `class-trends-insight.test.ts` | the predicate returns true, or the selector returns a non-empty array. Direction: either one non-empty means the model would still be called. |
| P6 | the five test files this chunk touches | `npm run test:paths -- <five paths>`, exit code written to a file and read from the file | exit non-zero, or any argument prints `NOT COVERED`. Baseline to beat: exit 0, 5 files, 102 tests, 2.28s (M5). A raw multi-path `vitest`/`npm test` is forbidden - it drops unmatched arguments and exits 0. A walker failing at 5000ms is a finding about this diff, since L15 (2a2c147) gave them 30s. |
| P7 | the whole suite | `npm test` from PowerShell | the pass count falls below the pre-change count for any reason other than a test this chunk deliberately rewrote, named. |
| P8 | the type gate | `npx tsc --noEmit`, exactly one caller (it races on `tsconfig.tsbuildinfo`) | any output at all. |

**Sabotage, required before the chunk is called done.** Revert A31-R2's engine
edit alone - restore the two "Re-run" sentences, leave everything else - and
prove P1 and P3 both go RED. Separately, revert A31-R7's filter alone and prove
P5 goes RED. A guard nobody has watched fail is not a guard. Restore from a
`cp` backup, never `git checkout --`, which reverts to the index and destroys
uncommitted work in the same file.

---

## 9. Write set

Derived, not asserted:

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

and, for tests reading a changed file AS SOURCE TEXT - the class that turns a
correct change red:

```
grep -rln "grade/engine\.ts" src --include=*.test.ts
src/app/components/grading-results/ungradedDisclosure.test.ts
src/lib/code-runner.test.ts
src/lib/grade/grouping-zip-parents.wiring.test.ts
```

Canaries for both instruments are in M6. **This enumeration is a FLOOR, never
the set.** The implementer must re-derive it with its own instrument against
the tree as the wave opens and report what this list missed.

### WRITE

| Path | Why |
|---|---|
| `src/lib/grade/types.ts` | A31-R1. New exported record. **No import added.** |
| `src/lib/grade/engine.ts` | A31-R2. `:298-310` and `:311-323` only. |
| `src/app/components/grading-results/ungradedDisclosure.ts` | A31-R3, A31-R4 |
| `src/app/components/grading-results/ungradedDisclosure.test.ts` | A31-R5 (both pins), P2, P4 |
| `src/lib/grade/engine.ungraded.test.ts` | A31-R6, P3 |
| `src/lib/grade/class-trends-insight.ts` | A31-R7 |
| `src/lib/grade/class-trends-insight.test.ts` | P5 |
| `src/app/api/class-trends-insight/route.ts` | A31-R7 - the one call site. No route test exists; the rule lives in the pure module. |
| `src/app/components/DraftedGradesTab.tsx` | A31-R8, render path only |
| `src/app/components/GradingResults.tsx` | **A31-R9, comment text only at `:59-63`. No code change, no import change.** |
| `docs/BACKLOG.md` + `docs/backlog.yml` | close A31; file RES-A31-1..5. Both together - `src/tools/backlog/check-generated.ts:49-50` reads both and gates on their agreement. |
| `docs/REGRESSION.md` | the behaviour entry. `grep -a` is required on this file. |

### ADOPTED - reads the changed data, verified unaffected, not edited

- `src/app/components/grading-results/ungradedRowLabel.ts` and its test - read
  `classifyRow`'s six-state output, not message text.
- `src/app/components/repo-grades/repoGradesBulkGrade.ts:229` and
  `useRepoGradesBulkGrade.ts:319` - read `ungraded.message`, but only on a
  `grading-failed` row (C5 is one-entry, so no not-attempted row reaches them).
  Their test at `repoGradesBulkGrade.test.ts:293` parameterises the message
  rather than transcribing a literal - opened and checked.
- `src/app/components/grading-recording/classTrendsRunCohort.test.ts` - its
  message literals at `:140`/`:142` are its own, unrelated to the engine's.
- `src/lib/code-runner.test.ts`,
  `src/lib/grade/grouping-zip-parents.wiring.test.ts` - read `engine.ts` by
  path but assert on code-runner wiring and zip-parent grouping. Both opened.
- `src/app/components/grading-results/gradingResultsHelpersWiring.test.ts` -
  the client-bundle guard. **Deliberately NOT edited**: section 8.1 shows the
  design adds no file to that directory, no new import specifier, and no new
  non-local consumer of it, so `CLIENT_FILES` (`:103-122`) and its completeness
  assertion (`:230`) stay true. It is in P6's baseline so a mistake here is
  caught rather than assumed away.

### DO NOT TOUCH

`docs/css-orphans.md` (modified in the working tree, another owner) and
`docs/a29-architecture.md`.

**Revision 1's note about another agent holding 38 test files is now STALE:
L15 landed at 2a2c147** and `git status --short` at the time of this revision
shows only ` M docs/css-orphans.md`. There is no concurrent hold on any file in
this write set.

### Structural gates in play

| Gate | Why |
|---|---|
| `src/file-size-ceiling.structure.test.ts` | every edited file gains lines; M4 shows the largest at 892. |
| `src/lib/no-emojis.test.ts` | new user-facing copy, and the scan covers `docs/` as well as `src/`. Do not hand-roll a scan. |
| `src/source-bytes.structure.test.ts` | new literals written through Write/Edit, which materialise `\uXXXX` escapes as the literal character. The recommended copy is pure ASCII, including the ASCII apostrophe; **do not write an en dash or a curly quote**. |
| `src/tools/backlog/check-generated.ts` | `backlog.yml` and `BACKLOG.md` regenerate together. |
| `npx tsc --noEmit` | exactly one caller, the wave gate. |

---

## 10. Residual register

Each names an OWNER, an INSTRUMENT and a STEP. **Revision 1's owners were
rejected (Ruling 5): they pointed at a design pass A12's note records as
promised and never run - and A31 exists precisely because a residual routed
that way was lost.** Every entry below is therefore filed as its own backlog
ROW with an id, and its owner is either a mechanically-triggered step or the
repo owner, never a pass someone intends to run.

**RES-A31-1 - the run-deadline surface copy has never been on the review
table.** Section 3: `deadlineMs` reaches the engine only from the three
unattended callers, and no unattended run renders through `GradingResults`. Not
deleted - `ungradedDisclosure.ts:77-88` needs both members for exhaustiveness.
OWNER: filed as a backlog row; no assignee needed until its trigger fires.
INSTRUMENT: `grep -rn "runDeadlineMs" src --include=*.ts --include=*.tsx | grep
-v "\.test\."` - if an attended caller ever appears, the member is live.
STEP: the next chunk that may write `src/app/actions/grading.ts`, which is
where such a caller would have to appear.

**RES-A31-2 - the per-surface remedy.** A31 ships copy naming no control
(section 5). What the instructor can do differs by caller, and section 5.3
measures that neither the engine nor the leaf can tell them apart - two of the
three `GradingResults` mount sites pass an identical `canvasUrl`, so even the
surface cannot. OWNER: filed as a backlog row, blocked_by A12/A13's identity
question. INSTRUMENT: `grep -rn "<GradingResults" src --include=*.tsx` plus
opening each mount site's `canvasUrl` argument, then deciding whether a source
discriminator is added as a prop or as a `GradingRunOptions` member. STEP:
before any per-surface copy or re-run control is designed - i.e. gated on the
A12/A13 row, not on a promise.

**RES-A31-3 - "graded N submission(s)" counts rows never attempted.** SIBLING
2. Six sites named there. Root cause `engine.ts:281-291`. OWNER: filed as a
backlog row. INSTRUMENT: `gradedResults(entry.run.results).length`
(`types.ts:180-182`) for the graded count and `ungradedResults(...)` for the
disclosure, with a test driving `gradeAction` into the bound and asserting the
summary number equals the graded count. STEP: the next chunk that may write
`src/lib/workflows/registry/steps.grading-*.ts`.

**RES-A31-4 - OWNER-ONLY: nothing here renders.** Whether the new copy is
legible and correctly wrapped in the "What Went Well" box and in the Drafted
Grades `TextField`, and whether it reads as this app's voice, cannot be
established in this checkout (`this-repo.md` section 6: no component is
rendered by any test, no `.env`, network blocked). OWNER: the repo owner.
INSTRUMENT: a browser, a real run with `GRADE_MAX_SUBMISSIONS` below the queue
size, inspecting a dropped row on both surfaces. STEP: the owner-verification
pass, batched with A13's RES-4/RES-5, which need the same session.

**RES-A31-5 - "Retry this row on its own" is false.** SIBLING 4, now answered
rather than open: one all-or-nothing control, no per-row grade path. OWNER:
filed as a backlog row. INSTRUMENT: the measurement is done -
`grading-submission-grade.ts:142,147-148,194-197`,
`GradingRecordingPanel.tsx:563,579-583,593,869`; what remains is a product call
between adding a per-row retry and correcting the copy under section 5.1's
rule. STEP: the next chunk that may write
`src/app/actions/grading-submission-grade.ts` or
`src/app/components/grading-recording/GradingRecordingPanel.tsx`.

---

## 11. Disposition of the A31 backlog row's own claims

Re-derived LAST, after all requirement numbering was final.

| A31 row claim or prescription | Disposition | Where it went |
|---|---|---|
| `grep -n "Re-run to grade" engine.ts` returns `:307` and `:320` | KEPT - re-measured identical | M1 |
| `engine.ts:192` is the prefix slice | KEPT - re-measured identical | M2 |
| A re-run re-takes the same prefix on the zip caller | KEPT, EXTENDED to all five callers | section 3 |
| "Both strings land in an EDITABLE STRENGTHS TEXTAREA on the review table" | **WITHDRAWN as written.** True before b7e62fe; false for `GradingResults.tsx` today. The defect is real and lives at the data layer plus three other consumers. Enforcer it protected: none - the row had no instrument. | 2.1, 4 (S1, S3, S4) |
| "I traced the zip caller only" (the row's own LIMIT) | CLOSED | section 3 |
| "raise the bound, or split the upload" | **WITHDRAWN.** "Raise the bound" names a control in no UI (M3); "split the upload" is true on one of five callers. | 2.3, 5.3 |
| "never Re-run" | KEPT and made enforceable | A31-R1, P1, P2 |
| "DO NOT close it by adding a re-run control" | KEPT | section 6 |
| "a frozen-literal assertion over the copy set the engine emits" | KEPT, **and its strength is now stated honestly rather than overclaimed** - it catches a missing or changed prefix, not a new sentence on an undriven path | A31-R6, P3 |
| "closed by CONSTRUCTION rather than by a prose check" | KEPT, with the construction being single authorship in `types.ts` rather than two independently frozen lists | 8.1 |
| "STEP: the next chunk that may write `src/lib/grade/engine.ts`" | KEPT - this is that chunk | section 9 |

| Revision 1 item | Disposition in revision 2 |
|---|---|
| R1 wording ("only reached if what is submitted changes") | **WITHDRAWN as false.** Replaced by 5.2. |
| R4's localStorage requirement | KEPT and WIDENED - the storage key is shared between two surfaces (8.2, A31-R4) |
| R6's "an EXTRA sentence is caught by construction" | **WITHDRAWN** (Ruling 4). Recorded as a known limit. |
| P2's grep-a-file instrument | **WITHDRAWN** (Ruling 4). Replaced by an assertion over the exported values. |
| P3's door `gradeSubmissions` | CORRECTED to `gradeEntries` - the door that file already drives |
| "four surfaces that mount GradingResults" | CORRECTED to three, measured |
| "I could not determine whether the zip path passes canvasUrl=''" | **ANSWERED** - it does, two reads, and it shares a key |
| the model prompt, raised with no disposal | **PROMOTED to a requirement**, A31-R7 |
| Drafted Grades, raised with no disposal | **PROMOTED to a requirement**, A31-R8, with the stored-draft migration explicitly excluded |
| the client-bundle exemption argument | CORRECTED - A23 replaced that guard; the real constraint is that `types.ts` gains no import |
| the do-not-touch note about L15 | CORRECTED - L15 landed at 2a2c147 |
| seven citations | CORRECTED: `engine.ts` tails `:298-310`/`:311-323` (was 301-309/313-322); `gradingResultsHelpers.ts:512` Strengths column (was 509); `:538` key function (was 625-630); `:280-297` seedEdits (was 280-296); `grading.ts:518` userId guard (was 521); `grading.ts:719-726` deadline comment (was 715-721); `grading-review-rows.ts:119` (was 118); `steps.grading-singles.ts:605-613` and `:616-621` (was 604-613, 620-622); `types.ts:153-157` canvasUserId (was 152-156) |

---

## 12. What this environment cannot verify

- **Nothing renders.** vitest is `environment: "node"` and collects only
  `src/**/*.test.ts`. Every claim in section 4 about what an instructor SEES is
  a READING CLAIM traced through code. Specifically: S1's text is built from
  the A31-R1 record via `classifyRow`/`correctUngradedFeedbackSeed` reading
  `result.ungraded.stoppedBy`, and rendered by `RowFeedbackBoxes.tsx:115`
  mapping `FEEDBACK_FIELDS` (`gradingResultsHelpers.ts:216`) over `edit[field]`;
  S3's is built from `r.overallComment` alone today
  (`DraftedGradesTab.tsx:669`) and from the same record after A31-R8. No test
  in this repo observes either.
- **No live model, no API key.** S4's downstream effect - what the model does
  when handed a not-graded notice as a submission - cannot be observed. A31-R7
  removes the input rather than reasoning about the output, which is why it is
  a structural fix and not a claim about model behaviour.
- **No live database and no network.** The persisted-edit hazard A31-R4 closes,
  and the shared-key finding, are reasoned from
  `gradingResultsHelpers.ts:538,614-633` and the three mount sites' props, not
  observed in a browser. A unit test exercises the predicate; nothing exercises
  a real stored value.
- **No claim is made about `next build`'s client boundary beyond the walk.**
  Section 8.1's reasoning is that `types.ts` gains no import and no new
  non-local consumer of `grading-results/` appears. `next build` is the only
  gate that catches certain module-boundary errors, and it cannot complete in
  this checkout past the prerender tail (no `.env`); the implementer must read
  the `Compiled successfully` line rather than the exit code.
