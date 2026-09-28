# A46 residual R2, settled: can two Canvas submissions collapse onto one student?

Authored 2026-09-28 by a `loop-seat` pass whose write set was this one file.
It closes `docs/a46-scope.md`'s residual R2, which has been restated as "open
and untouched" in every A46 sub-wave since it was filed.

**Nothing under `src/` or `supabase/` was touched. No test was run - see
section 9, which states that plainly and is not hedged.**

---

## 0. The verdict, before the evidence

**They can collide, the code does not silently blend them at extraction, and
the collision is absorbed one layer later - in the results/review layer, which
keys on the STUDENT DISPLAY NAME while the Canvas path's real identity lives in
a separate field.** The absorption is not a merge of two rows into one; both
rows survive and both are posted. What collapses is the SCORE AND COMMENT
attached to them. Two Canvas rows that share a display name share one
`RowEdit`, and the payload builder then pairs each row's own correct `userId`
with that one shared, last-writer-wins score.

So the owner's second guarantee - *"if I upload a zip of all student
submissions, the right score goes to the right student"* - holds on the zip
path and **does not hold on the Canvas path**, for a reason the zip path
already solved and the Canvas path never inherited.

Three things follow, and they are the whole of this document:

1. **R2's own framing pointed at the wrong control.** R2 asks whether
   `extractCanvasEntries` has "an equivalent refusal". It should not have one.
   A refusal is the right answer when the app CANNOT TELL two students apart.
   On the Canvas path it can - Canvas hands over an authoritative numeric
   `user_id`. The zip path's answer to *distinct identities, identical display*
   is not a refusal either; it is a **disambiguation pass**
   (`src/lib/grade/utils.ts:479-494`), and that is the control the Canvas path
   is missing. Refusing a run because two students in a course are both named
   "Smith, John" would be a regression, not a fix.
2. **The defect is Canvas-specific, and provably so**, because on the zip path
   the identity key IS the lower-cased display (`utils.ts:116`, `:125`), so two
   surviving rows can never share a display; on the Canvas path the display and
   the identity are independent fields on a plain array
   (`extraction.ts:164-167`), so they can.
3. **The nearest existing instrument passes vacuously.** `seedEdits`'s
   one-slot-per-result assertion already exists
   (`gradingResultsHelpersEditState.test.ts:311`) and its fixture has two
   DISTINCT displays, so it cannot fail on this case. That is the
   fixture-shape trap, live, in the exact test that would otherwise have
   caught this.

---

## 1. What I opened

Everything cited below was read in this pass. Sizes are in section 10, measured
with two instruments that agree on all nine files.

| File | Why |
|---|---|
| `src/lib/grade/extraction.ts` | `extractCanvasEntries`, `canvasWorkToEntry` |
| `src/lib/canvas/work.ts` | the fan-out to discussion vs assignment |
| `src/lib/canvas/submissions.ts` | `fetchAssignment` - the assignment identity source |
| `src/lib/canvas/discussions.ts` | `fetchDiscussion`, `extractDiscussionActivity` - the discussion identity source |
| `src/lib/grade/utils.ts` | `groupSubmissionsByStudent`, the zip path's key and its disambiguation pass |
| `src/lib/grade/collisionRefusal.ts` | the zip path's refusal, in full |
| `src/lib/grade/engine.ts` | `gradeSubmissions`'s refusal, `gradeCanvasUrl`'s absence of one, the positional result loop |
| `src/app/components/grading/incrementalRunPlan.ts` | `sourceIndex`, `mergeArrivedResults` |
| `src/app/actions/grading-incremental.ts` | where tickets get their `sourceIndex` |
| `src/app/components/GradingResults.tsx` | the payload builder, the React keys, the row render |
| `src/app/components/grading-results/gradingResultsHelpers.ts` | `seedEdits`, `loadPersistedEdits`, `fanOutGradingPostResult` |
| `src/lib/canvas/grades.ts` | `postCanvasGrades` - the only grade-write in the repo |
| `src/app/actions/grading.ts` | the single-submission and embedded Canvas paths |
| `src/lib/embedded-grader/discussion.ts` | `gradeDiscussion`'s result construction |
| `docs/owner-decisions-2026-09-23.md`, `docs/owner-decisions-2026-09-27.md` | checked FIRST, per the brief |

**Owner decisions: no decision touches this question.** Both files were read in
full. The seventeen recorded decisions cover A29's N=1 refusal, A38's spend
cap, A39's rubric persistence and Route Handler, A24's digest, A32's per-slot
schedule, A23's import ban, A43's conversational layer, A40's disclosure column
and A39's fill. **None of them constrains Canvas identity, display names, or
the review table's edit keying.** DECISION 1 is the closest in subject - it
rules on an unconfirmed Canvas behaviour and explicitly says the decision to
proceed without confirmation "is a different thing" from confirming the
behaviour. That posture is the precedent I follow in section 7 for the two
shapes I cannot measure here: keep the assumption visible at the point the code
depends on it, rather than resolving it by inference.

---

## 2. The identity key on the Canvas path: there isn't one

This is the finding, stated as precisely as the source allows.

`extractCanvasEntries` (`src/lib/grade/extraction.ts:157-169`), quoted in full
from a brace-matched parse of its body:

```
 157| export async function extractCanvasEntries(
 158|   url: string
 159| ): Promise<{ entries: StudentSubmissionEntry[]; pointsPossible: number | null }> {
 160|   const [{ students }, pointsPossible] = await Promise.all([
 161|     fetchCanvasWork(url),
 162|     fetchAssignmentPointsPossible(url),
 163|   ]);
 164|   const entries: StudentSubmissionEntry[] = [];
 165|   for (const work of students) {
 166|     entries.push(await canvasWorkToEntry(work));
 167|   }
 168|   return { entries, pointsPossible };
 169| }
```

There is **no Map, no group-by, no keyed collection of any kind**. It is a
positional array push, one entry per `CanvasStudentWork`. Two `students`
elements produce two `entries` elements, always.

That is good news and it is the reason the collision is not absorbed HERE. It
is also why R2's "does it have a refusal" question has no useful answer: there
is nothing at this seam for a refusal to protect. The two fields that carry
identity travel independently onto `StudentSubmissionEntry`
(`canvasWorkToEntry`'s return, `extraction.ts:300-310`):

- `student: work.student` - a human display string
- `userId: work.userId` - the Canvas numeric id, optional on the type
  (`src/lib/grade/types.ts:399`, `userId?: number`)

Neither is a key. Nothing enforces a relation between them. **`userId` is
authoritative and `student` is decorative, and every layer below extraction was
written as though `student` were the key.**

### 2.1 Where `student` and `userId` come from

**Assignment path** - `fetchAssignment`, `src/lib/canvas/submissions.ts:111-115`:

```
111|     const userId = typeof submission.user_id === "number" ? submission.user_id : -1;
112|     const student =
113|       submission.user?.sortable_name?.trim() ||
114|       submission.user?.name?.trim() ||
115|       (userId >= 0 ? `User ${userId}` : "Unknown student");
```

Rows are accumulated with `students.push(...)` at `:158` - again a plain array,
no dedupe - then `students.sort((a, b) => a.student.localeCompare(b.student))`
at `:161`. **The sort comparator is the display name, and the display name
alone.** Two equal names compare equal; `Array.prototype.sort` has been stable
since ES2019, so their relative order is whatever order Canvas's paginated
response delivered them in.

Three separate ways `student` repeats while `userId` differs, all visible in
those five lines:

- **`sortable_name` is not unique.** Canvas does not constrain it. Two
  enrolments both named `Smith, John` produce the identical string.
- **`name` is not unique either**, and is the second fallback.
- **The third fallback is a constant.** Any submission whose `user_id` is not a
  number yields `userId = -1` AND `student = "Unknown student"`. Two such
  submissions collide on BOTH fields simultaneously. The code's own author put
  that branch there, so the code already admits the input is possible.

**Discussion path** - `fetchDiscussion`, `src/lib/canvas/discussions.ts:141-157`,
with names from `extractDiscussionActivity` at `:48-53`:

```
 51|       names.set(participant.id, participant.display_name?.trim() || `User ${participant.id}`);
...
148|       student: names.get(userId) ?? `User ${userId}`,
```

Here the *posts* are correctly keyed: `byUser` is a `Map<number,
DiscussionActivity>` at `:55`, so one student's several posts merge into one
row, which is right. But `student` is `display_name`, and `display_name` is
even less constrained than `sortable_name`. The same `students.sort(...
localeCompare)` closes the function at `:156`.

### 2.2 Contrast with the ZIP path, which is the whole argument

On the zip path the identity key is **derived from the display**, not carried
beside it. `src/lib/grade/utils.ts:114-117`:

```
114| }): { studentKey: string; studentDisplay: string } {
115|   return {
116|     studentKey: match.studentPart.toLowerCase(),
117|     studentDisplay: match.studentPart,
```

and the fallback at `:121-125` does the same. `groupSubmissionsByStudent` then
groups by `key` (`:441-456`) and - this is the part the Canvas path lacks -
runs a **terminal disambiguation pass** whose own comment states its contract
(`:458-463`):

> two distinct identity keys can still produce the identical raw display [...]
> This pass guarantees the returned rows' displays are pairwise distinct.

The mechanism, `:479-494`, assigns the first UNCLAIMED label against a
`takenLabels` set rather than a counted suffix, deliberately (`:472-478`, citing
`docs/a44-test-notes.md` R15 fixture K4). Its oracle is
`src/lib/grade/identityInvariants.test.ts`, whose distinctness property is
literally `expect(new Set(displays).size).toBe(displays.length)` at `:505`, with
named fixtures K3 (`:529-533`) and K4 (`:519-527`).

**So: on the zip path, two surviving rows cannot share a display, by
construction and with an executing oracle behind it. On the Canvas path they
can, and nothing checks.** Every display-keyed structure below extraction is
correct for zip input and wrong for Canvas input. That is the defect, and it is
a layering mismatch rather than a bug in any one function.

The zip path's REFUSAL (`collisionRefusal.ts:38-90`, fired at
`extraction.ts:145` and `engine.ts:384`) is a different control for a different
problem: same identity KEY, genuinely indistinguishable, so refuse. Canvas
never reaches that state, which is why the refusal is the wrong import.

---

## 3. Where a Canvas collision IS absorbed

Extraction preserves both rows. `sourceIndex` preserves both rows. The
results/review layer does not.

### 3.1 Not `sourceIndex`, and not `mergeArrivedResults`

The brief asked me to check this, and the answer is that this class of
collision cannot reach it.

`src/app/actions/grading-incremental.ts:112`:

```
112|     const tickets: GradingItemTicket[] = entries.map((entry, sourceIndex) => ({ sourceIndex, entry }));
```

`sourceIndex` is the array index. Two entries always get two distinct indices,
whatever their student or userId. `mergeArrivedResults`
(`incrementalRunPlan.ts:160-173`) does overwrite a duplicate index into its
`Map<number, GradeResult>` at `:165` and does drop an out-of-range index at
`:168-171`, exactly as the audit trail says - but **no Canvas identity
collision can produce a duplicate `sourceIndex`**, because the index is
positional and assigned once, before dispatch. The same is true of
`engine.ts`'s `sourceIndex: i` at `:273`, `:316`, `:329`.

`mergeArrivedResults` is therefore NOT a site for this defect. If it is ever
fed indices from anywhere other than a `.map` position, that changes, and that
is RES-A46R2-4 below.

### 3.2 The absorption site: `seedEdits`, keyed on the bare display name

`src/app/components/grading-results/gradingResultsHelpers.ts:280-297`:

```
280| export function seedEdits(run: GradingRun): Record<string, RowEdit> {
281|   const seeded: Record<string, RowEdit> = {};
282|   for (const result of run.results) {
...
287|     seeded[result.student] = {
288|       total: result.totalScore,
289|       overall: result.overallComment,
...
```

`seeded[result.student]` - a `Record<string, RowEdit>` keyed on the bare display
string, assigned in `run.results` order. **Two results sharing a display leave
ONE slot, holding the SECOND result's score, comment and rubric areas.** No
warning, no count check, no throw. This runs unconditionally at mount
(`GradingResults.tsx:201-203`, via `loadGradingResultsEdits` ->
`loadPersistedEdits` -> `seedEdits` at `gradingResultsHelpers.ts:620`), so the
collapse does not wait for an instructor edit.

The file's own comment at `:534-537` shows the keying was known to be
collision-prone and the consequence was scoped only ACROSS assignments:

> `edits` is keyed by BARE STUDENT NAME (seedEdits above), so the key MUST be
> scoped to the assignment: an unscoped key would leak one assignment's
> feedback onto a different assignment's identically-named student [...]

`docs/BACKLOG.md:88` (the A36 row) records that cross-surface leak and its fix.
**Neither the comment nor the backlog row considers two identically-named
students inside ONE run.** That is the gap.

### 3.3 The consequence: the payload pairs a correct userId with a collapsed score

`src/app/components/GradingResults.tsx:346-356`:

```
346|     const payload = postableResults.map((r) => {
347|       const edit = edits[r.student] ?? defaultRowEdit(r);
348|       return {
349|         userId: r.userId as number,
350|         grade: parseEarnedPoints(edit.total),
351|         comment: edit.overall,
352|         rubricAreas: r.rubricAreas.map((a) => {
353|           const ae = edit.areas[a.area] ?? { score: a.score };
```

`:349` reads `r.userId` - per row, correct. `:350`/`:351` read `edit`, which came
from `edits[r.student]` - the collapsed map. For two rows sharing a display:
both PUTs carry the same grade and comment, and one of the two students
receives a grade that was computed from the other's submission.
`postCanvasGrades` then writes it: `PUT .../submissions/${userId}`,
`src/lib/canvas/grades.ts:161-163`, the repo's only grade-write
(`grading-row.ts:15` says so).

**This is the owner's stated failure mode, reached without any instructor
mistake.** It is not a display glitch.

### 3.4 Every other display-keyed site in the same chain

All in `GradingResults.tsx` unless noted, all keyed on `student`:

| Site | Effect of two same-named rows |
|---|---|
| `:324` `refusals: Record<string, string>`, written `:332`, read `:334` | One row's A13 postability refusal suppresses the other from the payload, or fails to |
| `:326` and `:347` `edits[r.student]` | The collapse in 3.2/3.3 |
| `:339`, `:361-366`, `:390-396` `postStatus[r.student]` | Both rows show one status; one student's Canvas failure is displayed as the other's |
| `fanOutGradingPostResult`, `gradingResultsHelpers.ts:703-712` | Returns `Record<string, GradingPostFanoutEntry>` keyed `row.student`; it looks up correctly BY USERID (`:710-711`) and then writes the answer into a name-keyed record, so the correct per-userId outcome is thrown away at the last step |
| `:626` `edits[result.student]`, `:627` `postStatus[result.student]` | The rendered row shows the collapsed score |
| `:635` `key={`${result.student}-matrix`}`, `:768` `key={`${result.student}-${areaName}`}` | Duplicate React keys. **Unverifiable here** - nothing renders under vitest |
| `persistGradingResultsEdits`, `gradingResultsHelpers.ts:663` | Writes the collapsed map to `localStorage`, so the collapse outlives the reload |

`loadPersistedEdits` (`:619-635`) iterates `Object.entries(seeded)`, so it
inherits the collapse rather than introducing a second one.

### 3.5 All three Canvas ingestion sites lack the disambiguation

Measured by a parser, not `grep -c` (section 10.2): `canvasWorkToEntry` has
exactly **3** call sites in non-test source.

| Site | Path | Disambiguation? |
|---|---|---|
| `src/lib/grade/extraction.ts:166` | `extractCanvasEntries`; reached by `grading-incremental.ts:71` and `grading.ts:789` | None |
| `src/lib/grade/engine.ts:472` | `gradeCanvasUrl` - the whole-run Gemini Canvas path, LIVE today | None |
| `src/app/actions/grading.ts:621` | single submission, `gradeOneSubmissionAction` | N/A - one entry, cannot collide |

So this is **not** an incremental-route-only problem. `INCREMENTAL_ROUTE_ENABLED
= false` (`incrementalRunPlan.ts:99`) gates one of the two reachable sites;
`gradeCanvasUrl` is not gated and is the path a Canvas grading run takes today.
**The defect is live on main, not pending on a flag.** I did not run the app, so
"live on main" here means reachable in source from `gradeCanvasUrl`; RES-A46R2-5
records that as unexercised.

The graded-discussion branch takes a fourth route, `gradeDiscussion`
(`src/lib/embedded-grader/discussion.ts:437-500`), which is a positional
`students.map` carrying `userId` at `:474`. Safe at that layer; it produces
`run.results` and lands in `seedEdits` like everything else.

---

## 4. The five practical shapes, one verdict each

"Two entries?" means two elements in `fetchCanvasWork`'s `students`. "Same
key?" means the same `student` display string, since that is what the absorbing
layer keys on.

| Shape | Two entries? | Same display? | Verdict |
|---|---|---|---|
| **1. Test student / sandbox enrolment** | Cannot determine | Would be `Test Student` | **OWNER FACT.** Whether Canvas's Student-View user appears in `/assignments/:id/submissions` is not determinable from this tree. If it does, it has its own `user_id` and a distinctive name, so it collides with nothing - it is a spurious extra row, not a misattribution. Only one Test Student exists per course, so it cannot collide with itself. Filed as RES-A46R2-1. |
| **2. Same human, two sections / re-enrolment** | Cannot determine | Would be identical on both fields | **OWNER FACT, and the worst case if true.** `fetchAssignment` requests `?per_page=100&include[]=user` (`submissions.ts:72`) with no `grouped` parameter. A user has one `user_id` regardless of section count, and the endpoint is documented as one submission per user per assignment, so I expect one row - but I cannot verify it here, and the code has no defence if I am wrong: two rows with the same `userId` AND the same `student` would collapse in `seedEdits` and then produce two PUTs to the same `userId`, the second overwriting the first. Filed as RES-A46R2-2. |
| **3. Group submission attributed to several members** | **Yes**, one per member | **No** - distinct names, distinct `user_id`s | **DOES NOT COLLIDE, and the fan-out is arguably correct** - each member gets the grade. The identical `content` on N rows is a cost question (N model calls for one artefact), not a correctness one. It collides only if two group members happen to share a display name, which is shape 5's mechanism, not this one. |
| **4. Resubmission / second attempt** | **No** | N/A | **DOES NOT COLLIDE.** `/submissions` returns the current submission per user; prior attempts live under `submission_history`, which requires `include[]=submission_history`, and `submissions.ts:72` requests only `include[]=user`. Independently, `:107-109` skips any `workflow_state === "graded"` row and its own comment records that a resubmission flips the state back to `submitted`, which is a per-user state, not a per-attempt one. Verdict from the request URL and the state filter, both read. |
| **5. Two distinct students with the same display name** | **Yes** | **Yes** | **COLLIDES. This is the reachable one, and it needs no exotic Canvas state at all** - two enrolments whose `sortable_name` strings are equal (`submissions.ts:113`), or whose `display_name` strings are equal on a discussion (`discussions.ts:51`). Also reached by two submissions with a non-numeric `user_id`, which land on `userId = -1` and `"Unknown student"` together (`submissions.ts:111-115`). |

Shape 5 is what R2 should have been asking about. It was not on the brief's
list of five, which is itself worth recording: the list was built from Canvas
enrolment exotica, and the real mechanism is that the app's identity is a name
while Canvas's is a number.

**Deleted-then-restored enrolment** was the brief's fifth shape and I have
folded it into RES-A46R2-3 rather than guessing: whether a restored enrolment
resurfaces a submission row, and whether it can appear alongside a live one, is
not determinable from this tree.

---

## 5. Does anything downstream already prevent it?

I looked for a control and found two partial ones and no real one.

**Nothing keys on `userId` anywhere in the grading path.** Measured: the only
`Map<number, ...>` in `src/lib/grade/`, `src/app/components/grading-results/`
and `src/app/components/grading/` is `mergeArrivedResults`'s
`Map<number, GradeResult>` at `incrementalRunPlan.ts:164`, which is keyed on
`sourceIndex`, not on a Canvas id. Command in section 10.3.

**Partial control A - the `-1` path fails loudly, by accident.**
`postCanvasGrades` PUTs to `.../submissions/-1` (`grades.ts:161-163`), which
Canvas will answer 404, and `:170-177` maps 404 to *"No submission found for
this student in Canvas"* in `failures`. So the `"Unknown student"` variant of
the collision cannot silently write a wrong grade - it writes nothing and
reports a failure. It also reports an unhelpful reason and does not name the
collision. This is a consequence of an invalid URL, not a guard, and a future
change that filters `userId < 0` earlier would remove it without anyone
noticing it was load-bearing.

**Partial control B - `checkRowPostability` reduces the blast radius,
inconsistently.** `GradingResults.tsx:327-332` refuses a row whose submitted
comment is identical to the producer's own `overallComment`. Because the
collapsed `edit` carries the SECOND row's comment, the FIRST row's check
compares against the wrong producer and can refuse or admit for the wrong
reason. It sometimes suppresses the bad post and sometimes does not, depending
on whose text happens to match. **That is worse than no control**, because a
"0 of 2 attempted - every row was refused" message (`:342`) looks like a
deliberate safety refusal rather than the symptom it is.

**No control names the collision, and no test can currently observe it.**
Section 9.

---

## 6. Recommendation

**Give the Canvas path the zip path's disambiguation, at the seam where entries
are built, and fix the review layer's key. Do not add a refusal.**

Three parts, smallest first:

**(a) Disambiguate Canvas displays at entry-build time.** A pure exported
function taking `readonly StudentSubmissionEntry[]` and returning entries whose
`student` values are pairwise distinct, `userId` untouched, walked in a
deterministic order that is a function of the entries alone. Reuse the zip
path's shape - first UNCLAIMED label against a `takenLabels` set, never a
counted suffix (`utils.ts:472-494`, and `docs/a44-test-notes.md` R15's fixture
K4 is the reason: a raw label can already look like `"X (2)"`). Applied at all
three sites in section 3.5, `extraction.ts:164-167`, `engine.ts:471-472`, and a
no-op pass-through at `grading.ts:621` so a later multi-entry caller there
cannot be forgotten.

One substantive design question this leaves open, and I am not deciding it:
**what the disambiguated label SAYS.** `"Smith, John (2)"` is honest about
distinctness and useless for telling the instructor which John it is. The
Canvas path holds a real discriminator the zip path never had - the numeric
`user_id` - so `"Smith, John (id 40912)"` or a short suffix is available and
carries information. That is a UX decision with a click-cost and a copy
dimension, and it belongs to the owner or to a UX seat, not here. Filed as
RES-A46R2-6.

**(b) Make the collapse impossible to reintroduce, at `seedEdits`.** Two
sub-options, and I recommend the first:

- **Recommended: leave `seedEdits` keyed on `student` and add an executing
  invariant** that `Object.keys(seedEdits(run)).length === run.results.length`
  over a fixture that has a repeated display. Under (a) the invariant holds;
  without (a) it fails. This is a one-line assertion against an existing
  export, it costs nothing, and it fails loudly if (a) is ever removed or if a
  fourth Canvas ingestion site appears without it.
- Not recommended now: re-key `edits` on something stable. RULING 93 is cited
  at `gradingResultsHelpersEditState.test.ts:265` and `:300` as having already accounted
  for one storage-key migration and its accepted one-time loss of stored
  edits; a second migration would cost another one, and `userId` is optional
  on the type (`types.ts:399`) so it cannot serve as the key on the zip path.
  A re-key is a bigger change than the defect requires.

**(c) Do not import the refusal.** `decideCollisionRefusal` reads
`submissions`/`zipParents` - file paths - and has no meaning for Canvas input.
Section 2.2.

### What it costs if I am wrong

**If shape 5 never actually occurs in the owner's courses**, (a) and (b) are
dead weight: one pure function, one call at three sites, one test. Small, and
it buys a real invariant either way. Cheap to be wrong here.

**If I am wrong the other way - if the collapse is NOT reachable because
something I did not open prevents two same-named rows** - then I have proposed
a guard for a state that cannot occur, and the honest signal is that the new
invariant test passes trivially. That is detectable rather than silent, which
is the reason to prefer (b)'s executing assertion over an argued claim.

**If I am wrong about shape 2** - if Canvas can return two rows for one
`user_id` - then (a) makes the display distinct while the underlying double-PUT
remains, and the second PUT still overwrites the first. (a) would make that
case LOOK handled while leaving it broken. That is the most expensive way for
this recommendation to be wrong, and it is exactly why RES-A46R2-2 names an
owner and an instrument rather than being resolved by my inference.

**What I am NOT recommending:** any change to `mergeArrivedResults`,
`sourceIndex`, or the incremental transport. Section 3.1 shows this collision
cannot reach them, and the brief's hypothesis that it might is answered no.

---

## 7. Disposition of `docs/a46-scope.md`'s residual R2

This pass restructures one prior requirement. The table maps it.

| Prior requirement | Disposition | Detail |
|---|---|---|
| **R2**, `a46-scope.md:428`: "Whether Canvas submissions (path B) can collide the way zip filenames can, and whether `extractCanvasEntries` has an equivalent refusal" - instrument: "Open `extractCanvasEntries` and `grep` for any refusal call inside it; if none, decide whether Canvas's per-student Canvas user ID already makes the collision class impossible and say why" | **DISCHARGED, with its second clause ANSWERED NO** | Both halves executed. The refusal check: done by brace-matched parse, not `grep` - `extractCanvasEntries`'s body contains zero refusal symbols, `extractStudentEntries`'s contains both (section 10.2). The decision R2 asked for: **Canvas's user id does NOT make the collision class impossible**, because the absorbing layer does not key on the user id. That is the answer R2 wanted and it is the opposite of the reading its own wording invites. |
| R2's stated direction of failure: "RED (as a scope defect) if Wave 4 ships path B's incremental grading with no equivalent check and no stated reason one is unnecessary" | **SUPERSEDED, and widened** | R2 scoped the failure to Wave 4's incremental path. Section 3.5 measures that `gradeCanvasUrl` (`engine.ts:472`) has the same gap and is NOT behind `INCREMENTAL_ROUTE_ENABLED`, so the condition is already met on main. Replaced by RES-A46R2-5's reachability obligation. |
| R2's step: "Before Commit 4c's path-B slice ships" | **KEPT, and made earlier** | Still true, and now additionally owed by whoever next touches `gradeCanvasUrl`. |
| R2's citation `extraction.ts:150` for `extractCanvasEntries` | **CORRECTED** | The declaration is at `:157`; `:151-156` are its doc comment and `:150` is blank. Recorded because a checker following `:150` lands in prose. |
| R1, R3, R4, R5, R6 of `a46-scope.md` section 8 | **UNTOUCHED** | Out of this pass's question. None is withdrawn, reworded, or closed here. I did not open enough of Wave 4's text to speak to R1 or R4. |

**Nothing is withdrawn.** No prior requirement is dropped, and no enforcer is
removed.

---

## 8. Residual register

Every entry names an owner, an instrument, and the step that measures it. Any
entry missing one of those three would be a deletion; none is.

| # | Not proven now | Owner | Instrument | Direction of failure | Step |
|---|---|---|---|---|---|
| **RES-A46R2-1** | Whether Canvas's Test Student / Student-View enrolment appears in `/api/v1/courses/:c/assignments/:a/submissions` and therefore becomes a graded row | **Repo owner** - needs a live Canvas and a real token; this checkout has no `.env` and vitest blocks the network | One authenticated GET of that endpoint on a course where Student View has been used, reading whether a Test Student row is present | RED if a Test Student row is returned, because the run then grades and can post to a non-student | An owner check; not a blocker on section 6, since a distinctly-named extra row is a separate defect from the collapse |
| **RES-A46R2-2** | Whether that endpoint can ever return two rows with the SAME `user_id` - multi-section enrolment, re-enrolment, or a pagination boundary that shifts mid-walk (`submissions.ts:76-95` pages with `per_page=100` and a Link header, and a submission arriving between two page fetches can be served twice) | **Repo owner** for the enrolment half; **whoever next touches `fetchAssignment`** for the pagination half | Enrolment half: one authenticated GET over a multi-section course, counting distinct `user_id` against row count. Pagination half: buildable HERE - a `canvasFetch`-mocked test whose page 1 and page 2 both contain the same `user_id`, asserting `fetchAssignment` returns one row for it | RED if two rows share a `user_id`: section 6(a) would then mask the problem rather than fix it, and two PUTs to one `userId` would silently overwrite | Enrolment half: owner check. Pagination half: in the same commit as section 6(a), since it is the same file |
| **RES-A46R2-3** | Whether a deleted-then-restored enrolment can produce a submission row alongside a live one | **Repo owner** - live Canvas only | One authenticated GET after restoring a deleted enrolment | RED if two rows result; same consequence as RES-A46R2-2 | An owner check, batched with RES-A46R2-1 |
| **RES-A46R2-4** | That `sourceIndex` stays positional. Section 3.1's conclusion depends entirely on `grading-incremental.ts:112` assigning it from a `.map` index | **Whoever next edits `grading-incremental.ts` or `incrementalRunPlan.ts`** | A test asserting the tickets' `sourceIndex` values are `[0..n-1]` for a plan built from n entries, INCLUDING two entries sharing a display and a `userId` | RED if any two tickets share a `sourceIndex`, at which point `mergeArrivedResults`'s silent last-wins at `incrementalRunPlan.ts:165` becomes a live collision site | In the same commit as section 6(a) |
| **RES-A46R2-5** | That the collapse is reachable IN THE RUNNING APP. I traced it in source from `gradeCanvasUrl` to `postCanvasGrades`; I did not exercise it. Nothing renders under vitest, so no test in this repo can mount `GradingResults` and observe two same-named rows sharing an edit | **Repo owner** for the rendered half; **the verify pass on section 6's diff** for the pure half | Rendered half: an owner check in a browser against a Canvas assignment with two identically-named students. Pure half: section 9's INST-2, which observes `seedEdits`'s collapse without a render | RED if the browser shows two rows with independent scores, which would mean something I did not find prevents it | Owner check whenever section 6 ships; INST-2 in the same commit |
| **RES-A46R2-6** | What the disambiguated label should SAY - a bare `(2)` suffix, or a `user_id`-bearing discriminator that tells the instructor which student is which | **Repo owner, or a UX seat** - this is a copy and click-cost decision, not a measurement | The two named options, decided; no instrument can choose between them | N/A - decision residual | Answered alongside section 6(a)'s implementation; (a) is buildable under either answer, so this does not block it |
| **RES-A46R2-7** | Whether the group-assignment fan-out (shape 3) should spend N model calls on one artefact | **Repo owner** - a cost/product call, and it interacts with DECISION 2's confirm-above-N | None buildable here; "should this fan out" is a scope question | N/A - decision residual | Whenever the owner next reviews grading spend; explicitly NOT part of section 6 |

---

## 9. Instruments, their mutations, and what I did not run

**I RAN NO TEST. I wrote no test file. My write set was this one document, so I
could not have run one, and every "would fail" below is a PREDICTION derived
from source I read and quoted - not an observation.** The brief asked for that
statement plainly and it is not softened anywhere below. Four instruments
elsewhere in this project today claimed more than they measured and every one
was caught by running it rather than reading it; treat all four below as
unverified until someone executes them.

Any verification report over these MUST quote the wrapper's per-argument lines,
`npm run test:paths <p1> <p2> ...`, because a raw multi-path `vitest run` drops
unmatched paths and exits 0.

### INST-1 - `seedEdits` keeps one slot per result when two results share a display

*New case in* `src/app/components/grading-results/gradingResultsHelpersEditState.test.ts`.

Fixture: a `GradingRun` whose `results` are two rows with `student: "Smith,
John"` and `userId: 101` / `userId: 102`, distinct `totalScore` values.
Assertion: `Object.keys(seedEdits(run)).length === run.results.length`.

**Predicted to FAIL TODAY**, 1 against 2, from `gradingResultsHelpers.ts:287`'s
`seeded[result.student] = ...` overwriting the first slot. **Unrun.**

**The mutation that must turn it red once section 6(a) lands:** remove the
`while (takenLabels.has(candidate))` loop from the new Canvas disambiguator (or
make it return its input unchanged). The test must go red. If it stays green
after that mutation, the disambiguator is not on the path the fixture
exercises and the instrument is measuring nothing.

**Why this instrument and not the existing one.** The nearest existing
assertion is `gradingResultsHelpersEditState.test.ts:311`:

```
311|      expect(Object.keys(seedEdits(foldedRun)).length).toBe(foldedRun.results.length);
```

labelled *"P4: the seeded map has exactly one slot per result"*. It reads like
the general invariant and it is not: `foldedRun`'s two results are
`"AlvarezMaria/essay"` (`:269`) and `"BrownTom/essay"` (`:278`), in the
`foldedRun` fixture at `:266-287` - already
distinct. **The assertion passes vacuously for the collision case and cannot
ever fail on it.** INST-1 is that assertion with a fixture that can actually
break it. Nothing in the existing test needs changing; it is a second `it`.

### INST-2 - Canvas entries come out with pairwise-distinct displays and untouched userIds

*New file beside the disambiguator, node-env, no render, no network.*

Mirrors `src/lib/grade/identityInvariants.test.ts:505`'s property
(`expect(new Set(displays).size).toBe(displays.length)`) for Canvas input.
Three assertions over two entries sharing a display: displays pairwise
distinct; the multiset of `userId`s unchanged; entry count unchanged.

**The mutations that must each turn it red:** (i) return the input array
unchanged - the distinctness assertion goes red; (ii) dedupe by display instead
of disambiguating - the count assertion goes red; (iii) renumber `userId` while
relabelling - the userId-multiset assertion goes red. Three mutations, three
distinct assertions, so a single weak assertion cannot carry the file.

**Unrun.** It also cannot be written until section 6(a) creates the function.

### INST-3 - `fetchAssignment` keeps two same-named submissions as two rows

*New case in* `src/lib/canvas.submissions.test.ts`.

That file already mocks the right seam: `canvasFetch` from `./canvas-fetch`
(`:31-33`), **not** `fetch`. `vitest.setup.ts` throws on a real fetch, and a
live network call once made a sabotage check pass in this repo, so the seam
matters. Fixture: one `okResult` page holding two submissions with identical
`user.sortable_name` and different `user_id`. Assertion: two rows out, two
distinct `userId`s.

**This is a CHARACTERIZATION guard and passes today. I am calling that out
rather than presenting it as a defect detector.** Its value is one-directional:
it fails if someone "fixes" the collision by deduping in `fetchAssignment` -
which would drop a real student's submission and is the worse repair. **The
mutation that must turn it red:** add a `Map` keyed on `student` inside
`fetchAssignment`'s accumulation loop. If it stays green, it is measuring
nothing and should be deleted rather than kept for reassurance.

### INST-4 - considered and NOT recommended

A source-structure test asserting that `extractCanvasEntries`'s and
`gradeCanvasUrl`'s bodies call the disambiguator. It would catch a fourth
Canvas ingestion site added without it, which is a real risk (section 3.5 found
three).

**I am not recommending it**, for a reason measured in this repo: source-text
assertions here have twice forced contorted implementations by pinning
spellings rather than facts. If a later seat wants it, the fact to pin is *"the
brace-matched body of each named function contains a call to the named
export"* - parsed, as in section 10.2 - and never the spelling of the call. I
cannot show it would fail, because it does not exist and I ran nothing.

### What no instrument in this repo can reach

- **Any rendered behaviour.** The duplicate React keys at
  `GradingResults.tsx:635` and `:768`, whether two collapsed rows share input
  focus or DOM state, and whether React's duplicate-key warning appears.
  vitest here is node-env and collects only `src/**/*.test.ts`; nothing
  renders. This is not a gap in the instruments - it is
  `docs/loop/this-repo.md` section 6 territory, and RES-A46R2-5 owns it.
- **Any live Canvas fact.** Shapes 1, 2 and 5's real-world frequency, and the
  pagination-overlap half of RES-A46R2-2's enrolment question. No `.env`, no
  token, network blocked.
- **The actual PUT.** No test may write to a live gradebook.

---

## 10. Measurements, each with the command that produced it

### 10.1 File sizes - two instruments, agreeing on all nine

`wc -l` from Git Bash at the repo root, and PowerShell
`@(Get-Content <path>).Count`. Both run this pass.

| File | `wc -l` | PowerShell `@(Get-Content).Count` |
|---|---|---|
| `src/lib/grade/extraction.ts` | 311 | 311 |
| `src/lib/canvas/submissions.ts` | 194 | 194 |
| `src/lib/canvas/discussions.ts` | 158 | 158 |
| `src/lib/grade/collisionRefusal.ts` | 152 | 152 |
| `src/app/components/grading-results/gradingResultsHelpers.ts` | 728 | 728 |
| `src/app/components/GradingResults.tsx` | 906 | 906 |
| `src/app/components/grading/incrementalRunPlan.ts` | 199 | 199 |
| `src/lib/canvas/grades.ts` | 184 | 184 |
| `src/lib/grade/identityInvariants.test.ts` | 901 | 901 |

`GradingResults.tsx` at **906** is within ~9% of this project's 1000-line
ceiling. Section 6 adds nothing to it - (a) lands in `extraction.ts`/`engine.ts`
and a new leaf, (b) is a test-only change - but a later seat re-keying `edits`
inside that component should size the work against the ceiling first, per this
project's own measured experience that a dedicated extraction agent still left
a sibling panel over budget.

### 10.2 The refusal check: parsed function bodies, not `grep`

A Python script (`scratchpad/slice.py`) locating each declaration, walking
matched braces to the closing one, and extracting the set of called identifiers
from the resulting body:

```
extractCanvasEntries   CALLED: all, canvasWorkToEntry, extractCanvasEntries,
                               fetchAssignmentPointsPossible, fetchCanvasWork, for, push
                       REFUSAL-SYMBOLS-PRESENT: []

extractStudentEntries  CALLED: Error, decideCollisionRefusal, describeCollisionRefusal,
                               extractStudentEntries, extractSubmissions,
                               groupSubmissionsByStudent, if, themselves
                       REFUSAL-SYMBOLS-PRESENT: ['decideCollisionRefusal',
                                                 'describeCollisionRefusal']
```

The zip entry point calls both refusal exports; the Canvas entry point calls
neither. **Structural, not textual** - a comment mentioning the refusal cannot
satisfy it, and a call cannot hide from it.

### 10.3 Call-site counts: parser against `grep -c`, and they disagree badly

The same script family, filtering out comment lines and declaration/import
matches, over `src/**/*.{ts,tsx}` excluding `*.test.*`:

```
CALL SITES of canvasWorkToEntry (parsed, comments excluded): 3
  src/app/actions/grading.ts:621    const entry = await canvasWorkToEntry(work);
  src/lib/grade/engine.ts:472       entries.push(await canvasWorkToEntry(work));
  src/lib/grade/extraction.ts:166   entries.push(await canvasWorkToEntry(work));
```

`grep -rc "canvasWorkToEntry" src/ --include=*.ts --include=*.tsx` over the same
files reports **13 across 7 files** (`grading.ts` 2, `engine.ts` 2,
`extraction.ts` 3, `repo-content.ts` 1, `single-file-entry.ts` 1, `types.ts` 3,
`grade.ts` 1). Ten of the thirteen are prose, imports or the declaration.
**The cross-check mattered: the naive count is 4.3x the real one.** Every count
in this document that matters came from the parser.

The `Map<number, ...>` claim in section 5 came from
`grep -rn "byUserId\|Map<number" src/lib/grade/ src/app/components/grading-results/ src/app/components/grading/ --include=*.ts --include=*.tsx | grep -v "\.test\.ts"`,
which returns exactly one line, `incrementalRunPlan.ts:164`. A single
`grep -n` is adequate there because the finding is an ABSENCE over a small,
enumerated directory set, and prose inflation cannot manufacture an absence -
it can only manufacture extra hits, and there were none to discard.

### 10.4 Pass conditions

Each names the object under comparison, the instrument producing each quantity
in it, and the direction of failure.

| # | Object under comparison | Instrument per quantity | Direction of failure |
|---|---|---|---|
| **P1** | `Object.keys(seedEdits(run)).length` against `run.results.length`, on a fixture with two results sharing a `student` and differing in `userId` | Both from one `vitest` run of INST-1, via `npm run test:paths src/app/components/grading-results/gradingResultsHelpersEditState.test.ts` | FAILS when keys < results, i.e. the seed map collapsed two rows. Predicted to fail today; unrun |
| **P2** | `new Set(entries.map(e => e.student)).size` against `entries.length`, on the disambiguator's output | Both from one `vitest` run of INST-2 | FAILS when the set is smaller, i.e. two entries still share a display |
| **P3** | The multiset of `userId` on the disambiguator's output against the multiset on its input | Both from the same INST-2 run, same array, before and after | FAILS on any difference - a relabelling that touches an id is worse than one that does not run |
| **P4** | The set of `sourceIndex` on a built plan against `[0..n-1]` | Both from one `vitest` run of RES-A46R2-4's test over `grading-incremental.ts`'s ticket build | FAILS on any duplicate or gap, which is the precondition for `mergeArrivedResults`'s last-wins overwrite to matter |
| **P5** | `fetchAssignment`'s returned row count against the mocked page's submission count, two submissions sharing a `sortable_name` | Both from one `vitest` run of INST-3, `canvasFetch` mocked - never `fetch` | FAILS when rows < submissions, i.e. someone deduped by name upstream and dropped a real submission |

---

## 11. Tree state

`git status --short` at the repo root, run twice - once before my write, once
after. Both are recorded, because they differ and the difference is not mine.

**At pass start:**

```
 M src/app/actions/course-hub-core.ts
 M src/lib/course-files.test.ts
 M src/lib/course-files.ts
 M src/lib/supabase/course-task-attachments.test.ts
 M src/lib/supabase/course-task-attachments.ts
 M src/lib/supabase/courses.ts
 M src/lib/workflows/zip-run-log-completion.test.ts
 M src/lib/workflows/zip-run-log-completion.ts
?? src/app/actions/course-hub-core.storage-path.test.ts
```

Every one of those nine belongs to the concurrent implementer holding
`course-task-attachments` / `course-hub-core` / `course-files` / `courses` /
`zip-run-log-completion`. **None is mine.**

**At pass end, after writing this file:**

```
?? docs/a39-incremental-fill-architecture.md
?? docs/a46-canvas-collision-scope.md
```

The nine `src/` entries are gone because something committed them between the
two reads - this repo's auto-commit hook, not me. I ran no `git add`, no
`git commit`, no `git stash`, no `git add -A` and no `git checkout --`, and I
wrote nothing under `src/` or `supabase/`. The remaining two entries are this
document and the concurrent architecture pass's own file, which I did not open,
read or touch.

A third read, moments later, additionally showed ` M docs/backlog.yml`. Also not
mine - I never opened that file for writing. **The point of recording three
reads rather than one: under concurrency this output is volatile, so a status
listing in a document is a timestamp, not a proof.** The only durable claim I
can make is the negative one - the write set of this pass was
`docs/a46-canvas-collision-scope.md` and nothing else.

**One thing a checker should verify rather than take from me:** I cannot prove
from inside this pass that the nine `src/` files were committed as the
implementer left them. I only observed that they left the working tree between
my two status reads. If that matters, `git log --stat -3` settles it and this
document is not the place it is settled.
