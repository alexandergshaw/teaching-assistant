# Adversarial check: docs/a3-provenance-scope.md (8e1877c), round 1

Fresh checker. Did not author the scope. Default-to-defective where uncertain.
Every quantity below names the command that produced it, run from the repo root
on today's tree (HEAD `a583280`). Every absence claim carries a canary that
proves the pattern fires AND that the pattern shape is valid.

**Verdict: NOT BUILDABLE AS WRITTEN.** 4 blockers, 10 majors, 5 minors.

The central measurement is sound and I could not break it. The measurement
discipline over source is unusually good - I re-opened more than twenty
citations and all but two landed exactly. What fails is the artifact's own
internal consistency: the record shape omits two fields the same document
requires, one acceptance instrument is red against the document's own copy,
one wave instruction is forbidden by a landed gate in the file it names, and
one evidence claim cites lines that did not exist in the cited file.

---

## 0. What re-measured CORRECT - do not relitigate these

Stated first so a revision does not spend rounds re-proving them.

| Claim | My command | Result |
|---|---|---|
| `Course` declares 55 properties | the scope's own python one-liner, re-run | 55 |
| `renderCourseFacts` reads 27 | the scope's own python one-liner, re-run | 27 |
| the 27 are a subset of the 55 | set difference in python over comment-stripped text | `READ not in Course interface: []` |
| the unread set | same script | 28 names, listed |
| no destructuring / bracket access hides a read | `re.findall(r'\{[^}]*\}\s*=\s*course', ...)` -> `[]`; `r'\bcourse\['` -> `[]` | none |
| seven line counts, all three instruments | PowerShell `@(Get-Content $f).Count` and `(Get-Content $f \| Measure-Object -Line).Lines`; Bash `wc -l < $f` | every one of the 21 numbers in the 3.5 table reproduced exactly, deltas included |
| `LIMIT = 1000` at `:41`, `ALLOWED_OVERAGE` at `:75` | `grep -n "const LIMIT" src/file-size-ceiling.structure.test.ts` | `41:const LIMIT = 1000;` |
| none of the seven is in `ALLOWED_OVERAGE` | the scope's grep, plus a proper canary (below) | 0, and the zero is real |
| `PINNED_UNGUARDED` at `:235`, entries `:236-263`, count 28 | `sed -n '236,263p' ... \| grep -c '^\s*"'` | 28 |
| `askAboutCourseAction` at `:258`, `:248` is `generateLecturePlanForAssignmentAction` | read the block, counted ordinals | both correct |
| exact-set equality at `:450` | `grep -n "PINNED_UNGUARDED"` | `450: expect(unguarded).toEqual(PINNED_UNGUARDED);` |
| a new GUARDED action leaves the pin untouched | read `collectActionExports`, `action-guard-coverage.test.ts:118-143` | sound - it records `guarded: GUARD_CALL.test(body)` per exported async function and filters `!a.guarded` at `:445` |
| 30 hits, 8 files, exactly ONE production call site | `grep -rn "askAboutCourseAction" src --include=*.ts --include=*.tsx \| wc -l` -> 30; per-file loop; canary `askAboutCourseActionZZZ` -> 0; second canary `--include=*.tsx` -> 3, so the include filter is not hiding `.tsx` | headline correct; `AskAiModal.tsx:55` is the only production call |
| nine `ta-` keys under `courses/`, zero pinned | the scope's grep, plus a per-key loop, plus the scope's own canary re-run (`ta-course-intel-history-open` -> 3 hits) | nine keys at exactly the cited lines, all nine return 0 |
| no exact label-set oracle in `course-facts.test.ts` | `grep -n "toBe(\|toEqual(\|toContain("` over the file | `:182-184` are three `toContain`; `toBe` exists at `:142`, `:174`, `:189`, `:333`, so a `toBe`-shaped pin is findable when one exists |
| every `knowledge-overview-stale.ts` citation | opened `:57-61`, `:93-99`, `:117-122`, `:134-175` | `:152-158` land exactly on the removed/added/changed branches; `:156` is exactly `stored.updatedAt !== current.updatedAt` |
| every `course_intel_answers` / `institution_knowledge_overview` migration citation | opened `:9-19`, `:91-101`, `:106-118`, `:140-141`, `:109`; and `:107-108` in the overview migration | all correct, including the "a new model id must never make a save fail" comment |
| leverage denominators | `ls supabase/migrations \| wc -l` -> 108; `grep -rln "create table" supabase/migrations \| wc -l` -> 45; `source_pages` in 2 files; `model text` in 1 file (2 lines) | all correct |
| `rubric-bank.ts:28-30`, `:70`; four `createHash(` sites; `cleanText` at `scaffold.ts:23-25` | opened each; `grep -rn "createHash(" src --include=*.ts`; canary `createHashZZZ(` -> 0 | exactly the four listed, and the lowercase/whitespace-collapse consequence is real |
| `leverage.md:37, :42, :20-27, :146-149`; `loop-docs.structure.test.ts:190-193` | opened each | all correct |
| `CourseRow.tsx:687-689`, `CoursesTab.tsx:448`, `page.tsx:662`, `useCourseIntel.ts:120-124`, `CourseIntelHistory.tsx:151-165` | opened each | all correct; the props interface really has no `filter`/`search` |
| `llm-content.ts` structural citations | `grep -n` for each anchor | `:812`, `:844`, `:855`, `:862`, `:865`, `:873`, `:874`, `:881`, `:887`, `:889`, `:892`, `:902`, `:905`, `:910`, `:914`, `:915`, `:917` all exact |

**Section 1's disposition table passes its audit.** All nine prior requirements
from `a3-scope.md` are mapped; the three withdrawals each name a reason; the two
handovers each name a receiver and an obligation. The `ta-` correction from
"three plus three more" to nine is a real correction and I reproduced it. No
finding.

**The central argument (item 1 of the brief) survives.** 27/55 is right in both
directions, and I derived the 28 unread names independently rather than
trusting the subtraction. The one-scalar `updatedAt` design is correctly killed.
Supporting note, not a finding: `courses.row.ts:285-287`'s own comment says the
dedicated-writer fields are kept OUT of `toRow` so `updateCourse` cannot wipe
them - so `updatedAt` is plausibly also UNDER-sensitive on `courseProject`,
which `renderCourseFacts` DOES read. That strengthens the scope's conclusion.

---

## BLOCKERS

### BL-1 - the record has no `question` and no `answer`, while the same document requires both

Class: **a requirement present in the prose and absent from the artifact's own
data shape**. NEW.

- 3.2's recommended shape is `branch`, `factsShapeVersion`, `factFingerprints`,
  `factsDigest`, `promptVersion`, `model`, `askedAt`. No question. No answer.
- 3.5's table spec enumerates its columns: `id`, `user_id`, `course_id`, one
  index on `(user_id, course_id, created_at desc)`, RLS, and `model text`. No
  `question`, no `answer_markdown` - and it enumerates rather than gestures, so
  "obvious by default" does not rescue it.
- 4.2 requires the opposite twice: "Rows are collapsed to one line each: **the
  question**, the ask date, and the verdict", and the table row "The text of a
  past answer | **2** - open the modal, expand one row".
- 6's CONCESSION requires it a third time: "The stored answer text exists in
  this design only so the provenance has an object to be about."

**The silent-green failure, named exactly.** This builds, lints, typechecks,
compiles under `next build`, and passes AC-1 through AC-9. AC-1/2/3/7 exercise
the pure diff over fixtures the test itself constructs. AC-5 asserts copy
strings. AC-6 is source-text wiring. AC-8 is a line count. AC-9 is the guard
pin. Nothing in the set asserts that a stored row carries the question it is
about. The shipped surface is five identical-looking lines reading "Asked Sep
14. 14 recorded facts were sent with this question; none of them has changed
since." with no way to tell which question any of them is.

**Why blocker and not major.** R-MIG-1 records the property that makes this
one-way: migrations auto-apply to production from a GitHub Action on push to
main (`this-repo.md:233-235`), with no local apply step and only a lexical
gate. A missing column is discovered after the TypeScript that depends on the
schema has merged.

### BL-2 - AC-5's instrument is RED against the scope's own S4 sentence, and three different forbidden-verb lists are given

Class: **an acceptance instrument that contradicts the artifact it accepts**.
NEW.

- 5.3 S4 (proposed copy): "Asked <date>. **Answered from** this course's start
  date, end date and week count - no model was called, and no facts were sent."
- AC-5 (the instrument): fails when "Any string contains 'grounded', 'based
  on', 'used to answer', or **'answered from'**".

Implemented as written, AC-5 fails on day one against the copy the same
document specifies. The implementer then either weakens the one instrument that
exists to stop the A4 defect recurring, or rewrites S4 without a mandate.

Compounding it, the document gives three non-identical lists:

| Where | List |
|---|---|
| 5.6 | "Grounded in", "based on", "used", "answered from" - explicitly scoped "about the fact block on B3" |
| 7 / W3 | "grounded", "based on", or "used" |
| AC-5 | "grounded", "based on", "used to answer", "answered from" - unscoped |

5.6 is internally consistent (S4 is B1, so 5.6 does not forbid it). W3 and AC-5
disagree with each other on two members, and AC-5 drops 5.6's scoping clause,
which is the only thing that made the ban coherent. The verb ban is the
feature's honesty guarantee; it cannot be specified three ways.

**Answering the brief's item-2 second half directly:** no proposed sentence
claims the model USED anything. S1, S2 and S3 all say "sent". 5.6's rule is
correct and the scope holds its own line in its claim (section 6: "the exact
fact block that was **sent**"). The defect is in the instrument, not in the
copy.

### BL-3 - 3.3 instructs an export that a landed gate forbids, in the file W1 assigns it to

Class: **a wave file list that cannot satisfy the instruction assigned to it**.
NEW.

3.3: W1 "must extract the invariant text ... into a **named exported constant**
and build the prompt from it". W1's table assigns that edit to
`src/app/actions/llm-content.ts`.

`src/app/actions/llm-content.ts:1` is `"use server"` (`head -8`). The header of
`src/lib/use-server-exports.test.ts` (lines 1-13) states the rule and the blast
radius verbatim: a `"use server"` module "may export NOTHING but async
functions (plus type-only exports, which are erased)"; "a plain `export const`,
a synchronous `export function`, or an `export { x } from "./y"` re-export ...
all compile clean under tsc and pass every unit test, then break `next build`."
That test would go red - so this is a blocked wave, not a shipped defect, but
the scope's own W1 file list is what makes it unbuildable.

**The precedent the scope cites already shows the right answer and the scope
read it the wrong way.** 3.3's idiom is `slide-prompt.test.ts:210-215`. The
constant it pins lives in `src/lib/slide-prompt.ts` - a plain lib leaf whose
first line is an `import`, not `"use server"` (`head -3`). W1 has no lib leaf
for the prompt. It also needs one for a second reason: `promptVersion` requires
`src/lib/ask-ai/provenance.ts` to hash the constant, and a lib module cannot
import a value out of a `"use server"` action module without dragging that
module's closure with it.

### BL-4 - R-SEQ-1's evidence cites two lines that did not exist in the cited file, in a document that claims every citation was opened

Class: **an obligation discharged by citing a document without opening it**
(`iteration-caps.md:34-35`). NEW.

Scope line 19: "**Every citation below was opened this pass.**"
Scope 3.2 and W0: "A39 wave W2 already plans that exact move
(`docs/a39-waves.md:998`, `:1882`: `rubricFingerprint` moved to
`rubric-fingerprint.ts` with `rubric-bank.ts` re-exporting)."

```
git show 8e1877c:docs/a39-waves.md | wc -l          -> 1864
```

Line 1882 did not exist in that file at the commit that wrote the scope. Line
998 at that commit reads
`snapshot-grading.structure.test.ts:141-174`, about persisted-key blocks -
nothing to do with `rubricFingerprint`. Today the file is 3083 lines
(`wc -l docs/a39-waves.md`) and `:998` is a section heading ("## 7. Wave 1 -
one submission needs no zip") while `:1882` is `export const runtime =
"nodejs";`. Neither line supports the claim at either time.

The correct citations were `:898`, `:942`, `:1782` at 8e1877c and are `:1179`,
`:1253`, `:2911` today (`grep -n "rubric-fingerprint" docs/a39-waves.md`).

**The conclusion survives and I verified it independently, so the revision is
narrow.**

```
grep -rn "export function rubricFingerprint" src
  -> src/lib/research/rubric-bank.ts:28
CANARY (pattern shape valid, fires only on a real match):
grep -rn "export function rubricFingerprintZZZ" src | wc -l   -> 0
ls src/lib/research/    -> no rubric-fingerprint.ts
```

So the move is planned, has not landed, R-SEQ-1's instrument is valid, and A3
must wait. What must be struck is the blanket "every citation was opened" claim
and the two line numbers. I re-opened more than twenty other citations and
found this to be isolated - but a blanket claim that is false once cannot be
carried, because it is what a downstream consumer would otherwise rely on
instead of re-opening.

---

## MAJORS

### MJ-1 - AC-4's instrument cannot observe the condition it names

AC-4 fails when the label set and the frozen oracle "differ **without
`FACTS_SHAPE_VERSION` having been bumped in the same commit**". A vitest test
has no access to the commit. The test can only fail when the label set differs
from the oracle, and the cheapest way back to green is to update the oracle and
leave the constant untouched - which is verbatim AC-4's own stated direction of
failure ("AC-3's guard goes silently dead"). The buildable form freezes the
PAIR: assert `FACTS_SHAPE_VERSION` equals a literal in the same assertion that
freezes the label set, so the version line is what has to move.

### MJ-2 - the AC-4 oracle is silently partial unless the fixture is maximal, and the scope never says so

`line()` at `course-facts.ts:30-34` returns `null` for an empty value, so
`renderCourseFacts` OMITS blank fields. A frozen label set taken over a sparse
fixture freezes only the labels that fixture happens to populate, and says
nothing about the rest.

This is not hypothetical - it is exactly why the existing exact-equality oracle
missed A1. `PRE_CHANGE_NO_OPT_IN_OUTPUT` at `course-facts.test.ts:170` is
`"Name: CS 101\nCourse code: CS101"` - two labels out of nineteen scalars - and
`toBe` at `:174` and `:189` stayed green across the addition of three whole
families. The fixture for AC-4 must populate all 27 read properties (including
`repos`, `integrations`, `courseProject` with milestones, `csvData`, `roster`,
`weeklyChecklist`, `gradesDueDate`+`gradesDueTime`) or the guard is partly dead
on arrival.

### MJ-3 - `includeStudentData` is an unpinned free parameter on both sides of the diff

The stored set comes from `renderCourseFacts(course, { includeStudentData: true
})` (`AskAiModal.tsx:56`). W3's read action "recomputes today's fingerprints
with the same server-side function" - but the scope never states that the
option must match, does not record the option on the row, and no AC covers it.

If the read path omits the opt-in, three labels (Roster, Weekly checklist,
Grades due) vanish from the current set and `summaryStaleness`'s removed-branch
reports three facts REMOVED on every row - a false sentence on every row, with
every gate green. AC-1 and AC-2 cannot see it: they build both sides inside one
test, so a call-site mismatch between two different modules is invisible to
them. Either record the option on the row, or make the builder take the option
from one place both sides import.

### MJ-4 - `model` by re-derivation is pinned on the wrong file

R-MODEL-1(a) proposes "a source-text assertion that `askAboutCourseAction`'s
`callLlm` request contains no `webSearch` key". The risk does not live there.
It lives at `llm.ts:492`:

```
const model = req.webSearch ? getGeminiSearchModel() : getGeminiModel();
```

A pin on `llm-content.ts` stays green if a later edit adds a second
model-selecting branch inside `callGemini`, and the stored `model` silently
becomes false - a provenance record that is itself wrong, which R-MODEL-1's own
direction-of-failure column already identifies. The check binds a different
object than the one it protects. The honest pin is on `llm.ts:492`: that
`webSearch` is the only branch.

### MJ-5 - the recommended split routes the provenance record through the browser, and no cost is stated

3.4 recommends: `askAboutCourseAction` returns `{ answer, provenance }` to
`AskAiModal.tsx` (a `"use client"` component, `:1`), which then calls a new
guarded action to insert it. The stored record is therefore client-supplied.

The discipline the scope adopts from A39 is that provenance is "read back from
the run, never re-derived from the store" (`a39-architecture.md:857-858`) - but
A39 stamps at the engine's own server-side return site with no client hop. The
feature's entire value is that the record is trustworthy. 3.4 is titled "where
the prior scope's cost drops" and states no cost at all for the shape it
recommends.

For a single-tenant instructor app this is self-harm rather than a tenancy
hole, so it is a major rather than a blocker. But it must be stated, and the
alternative re-costed: writing inside the action costs exactly one line moving
in `PINNED_UNGUARDED`, which AC-9 already covers and the backlog row already
calls "the CHEAP part".

### MJ-6 - fire-and-forget plus a five-row window makes a dropped record invisible

W2: "it is fire-and-forget from the modal, after `setAnswer`, and a failure is
silent in the answer path." That is right for the ANSWER path. It is wrong for
the PANEL: combined with 4.2's "Newest 5 rows ... no pagination in W3", a failed
insert produces a panel indistinguishable from one where the instructor never
asked. None of S1-S7 covers "there is no record of an answer you saw", and the
panel has no other channel to say so.

### MJ-7 - S6 turns the deliverable off for all pre-bump history, and a narrower rule is available

This is the answer to the brief's "weakest requirement" question: **the clause
most likely to be implemented exactly as written and still produce a bad result
is S6.**

`factsShapeVersion` is one global number. S6 renders "What this app records
about a course has changed since, so these facts cannot be compared" and
**"Never a change list"**. Every bump therefore permanently disables the verdict
for every row stored before it. A1 has already moved the label set once
(`course-facts.ts:108-131`), and W1 moves it again by construction - it reshapes
the traversal and introduces the constant. So S6 is likely to be the dominant
state in practice, and in S6 the feature delivers nothing, while 5.5 calls S2
"the deliverable".

The 5.4 trap it guards is narrower than the guard. The trap is only about
labels ADDED by the app (stored set missing them, naive diff reports them as
added, UI says "Roster was added since this answer"). A label present in BOTH
the stored set and the current set can be diffed honestly across a version
change - the digest comparison is unaffected by the app having started
recording something else. The narrow rule is available, obvious, and not
considered.

### MJ-8 - AC-7's sabotage and AC-7's instrument are in different modules unless a signature the scope never states holds

Section 6's deletion is "make **the read path** recompute the stored
fingerprints from the CURRENT course". The read path is
`src/app/actions/ask-ai-provenance.ts` (W3). AC-7's instrument is
`npm run test:paths -- src/lib/ask-ai/provenance.test.ts` (W1).

The removal test only works if the pure function itself takes
`(storedRow, currentCourse)` and derives the current side internally, so that
"use the current course for both sides" is a mutation INSIDE the lib. Under the
other plausible signature, `diff(storedFingerprints, currentFingerprints)`, the
deletion is not expressible in the lib at all - it becomes a rewrite of the
test's own inputs, which is a tautology, and AC-7 cannot fail for the right
reason. The signature is load-bearing for the one instrument behind the
leverage claim and is not pinned anywhere.

### MJ-9 - the wave plan omits the actions barrel

`src/app/actions.ts` is the barrel; `:58` is `export * from
"./actions/llm-content";`, which is why widening `askAboutCourseAction`'s
return type needs no barrel edit. But `AskAiModal.tsx:8` imports from
`@/app/actions`, and W2 adds a NEW module `src/app/actions/ask-ai-provenance.ts`
whose exports the barrel does not carry until a line is added. Neither W2 nor
W3 lists `src/app/actions.ts`.

tsc catches this, so the wave blocks rather than ships dead. Two things still
make it a major: the repo's own scar is "a group's file list must contain the
file that CALLS the new export", and `src/app/actions.ts` is a file every other
concurrent action-touching row also edits - section 7's "Sequencing and
disjointness" analyses only `llm-content.ts` and `AskAiModal.tsx` and never
names the barrel.

### MJ-10 - B1 already ships a provenance sentence; 3.1's survey missed it and S4 proposes a second spelling of it

Every deterministic answer already ends with `SCHEDULE_ANSWER_MARKER`:

```
grep -rn "SCHEDULE_ANSWER_MARKER" src --include=*.ts --include=*.tsx
  -> src/lib/week-numbering.ts:191  (the literal)
     src/app/actions/llm-content.ts:784, :787, :789, :797, :800  (appended)
     src/app/actions/llm-content.test.ts:415  (positive pin)
     src/app/actions/llm-content.test.ts:423  (negative pin on the model branch)
CANARY: grep -rn "SCHEDULE_ANSWER_MARKER_ZZZ" src --include=*.ts | wc -l -> 0
```

The literal is: "This answer was computed directly from this course's own
recorded dates - not read or guessed by a model - so it cannot be wrong the way
the model's other answers here can be."

S4 proposes "Answered from this course's start date, end date and week count -
no model was called, and no facts were sent." That is the same claim, in a
second place, with no rule keeping the two in sync - in a document whose 3.1
says "A3 must not invent a fifth [idiom]" and then surveys four unrelated
hashing idioms while missing the one idiom that is literally about this
feature's subject on this exact code path.

**This is also the honest answer to the brief's "feature already exists"
question.** For B3 it genuinely does not: nothing persists, `AskAiModal.tsx:44-45`
holds the answer in `useState`, `CoursesTab.tsx:448` unmounts the modal on
close. But for B1 - the branch the scope calls its sharpest hole - provenance
already ships, already has a frozen literal, and already has a passing and a
negative test. The strongest version of the argument is not "the row is built";
it is "the row's most defensible branch is built, and this design adds an
unsynchronised duplicate of it instead of reading the existing one back".

---

## MINORS

1. `llm.ts:385` for `void provider;` - it is `:384`
   (`grep -n "void provider;" src/lib/llm.ts`).
2. 3.4's breakdown of the 30 grep hits does not sum. It accounts for
   1 + 17 + 1 + 3 + 1 = 23. Measured per file
   (`for f in $(grep -rln ...); do echo "$f: $(grep -c ... $f)"; done`):
   `llm-content.test.ts` 20, `AskAiModal.tsx` 3, `week-numbering.ts` 2,
   `action-guard-coverage.test.ts` 1, `llm-content.ts` 1,
   `media-likeness.ts` 1, `loop-docs.structure.test.ts` 1, and
   `src/lib/course-facts.ts:2` - an eighth file the breakdown never names.
   The headline re-measures correct.
3. 5.2 says "28 fields can change without altering one character of what was
   sent". Two of the 28 are `id` (the primary key, not mutated in place) and
   `updatedAt` (the signal itself, not an independent event). The honest
   false-positive surface is 26 of 55. The argument is unaffected.
4. The `ALLOWED_OVERAGE` canary does not test the pattern SHAPE. It proves grep
   fires on the file using a plain literal, while the zero it defends comes
   from a six-way `\|` alternation. I supplied the missing canary:
   `grep -c "llm-content.ts\|ALLOWED_OVERAGE" src/file-size-ceiling.structure.test.ts`
   -> 2, so the alternation is valid and the zero stands. The canary as written
   did not establish that.
5. S2's sentence "<K> of the <N> recorded facts sent with this question have
   changed since: <labels>" cannot carry ADDED labels - an added label was
   never among the N sent. The same row then says added and removed are named
   as such. One count, three lists.
6. 4.1 inflates the precedent by one click. It enumerates three steps of which
   two are clicks (tab, expand) and one is a scan, then totals them as "2
   clicks plus a tab switch plus an unscoped scan" - counting the tab switch
   twice. DECISION 11's own wording is "a tab switch plus an expand click plus
   an unscoped scan" = 2 clicks. The bar is still met; the margin is one click
   smaller than stated.

---

## Item 3, answered directly: is rendering NOTHING on B1 the right answer?

**The branch behaves as described - verified.**
`computeDeterministicScheduleAnswer` is declared at `llm-content.ts:812`,
called at `:874` with `const now = Date.now()` at `:873`, and returns at `:876`
- before the embedded branch at `:881` and before the prompt at `:887`. The
fact block (`facts`, `:865`) is never read on that path; the function's only
inputs are `question`, `courseDates` and `now`. The closed list is
`ASK_AI_CLOSED_LIST_QUESTIONS` (`week-numbering.ts:164-167`), matched by
`matchAskAiQuestionShape` (`:179-184`). "What week are we in?" is a literal
member and a UI chip (`AskAiModal.tsx:28`, with the reason at `:21-27`).
`SUGGESTIONS` has five entries (`:16-29`), so "one of the five UI chips" is
right.

**No, rendering nothing is not the right answer.**

The scope's own rule refutes it. 5.6's third bullet forbids saying "Nothing has
changed" on a B1 row. S4 delivers that sentence by omission instead of by
words. On a panel whose stated purpose is a staleness verdict, and where four
of the six other states DO render one, the absence of a warning is read as the
absence of a problem. An absence is not a refusal to claim - in this layout it
IS a claim, and it is the one false claim the design exists to prevent. Calling
it "the single sharpest hole in the design" and then closing it by rendering
nothing is declining to fill it, not closing it.

**The honest minimum, in increasing cost.**

(a) **FLOOR, non-optional.** An explicit negative on B1 rows: one sentence
saying the answer depended on the date it was asked and that no staleness check
applies to it. A stated "this cannot be checked" is distinguishable by a reader
from "checked, nothing changed". A blank line is not. This costs one more string
in `askAiProvenanceCopy.ts` and one more AC-5 case.

(b) **BETTER, and buildable here.** `computeDeterministicScheduleAnswer` is a
pure function of `(question, courseDates, now)`. W3's read action already loads
the course (`getCourse`, `courses.ts:73`) and has a clock. Re-run it with
today's `now` and compare the result to the stored answer text: when it
differs, the app can say the answer no longer holds, and name it - a true
verdict for the clock exactly as the fingerprint set is a true verdict for the
facts. This makes B1 the STRONGEST branch rather than the blind one, which is
consistent with 6's second concession that B1's claim is the stronger
GUARANTEED one.

**The cost (b) must budget, which the wave plan does not have.**
`computeDeterministicScheduleAnswer` is module-private (`llm-content.ts:812`,
no `export`), and so are `renderCurrentWeekAnswer` (`:782`) and
`renderTermEndAnswer` (`:795`). `llm-content.ts` is `"use server"`, so none of
the three can simply be exported - `use-server-exports.test.ts` forbids a
synchronous `export function` there, and that is the same constraint as BL-3.
(b) therefore requires moving all three to a lib leaf, which is a W1 file the
plan does not list. Moving them also reduces `llm-content.ts` and helps
R-CEILING-1, so the cost is not all downside - but it must be planned, not
discovered.

---

## Item 6, answered directly: the retrieval interaction

**The 1-interaction claim holds structurally.** `CoursesTab.tsx:448` mounts
`AskAiModal` only when `askAiCourse` is set, which `CourseRow.tsx:687`'s "Ask
AI" button sets. A panel rendered in the modal body therefore does cost zero
clicks beyond the one already being spent. The claim is a reading claim and
R-UI-1 correctly owns it with the right instrument (a real browser) and the
right direction of failure.

**Against the precedent it cites, the comparison is real but one click
narrower than stated** (minor 6 above).

**An uncounted cost the scope forecloses rather than resolves.** 4.2 renders
the newest five provenance rows in the modal body on every open, and "The one
thing this design must not become" explicitly rules out collapsing by default,
because that would cost the verdict 2 clicks and collapse the whole argument.
So every instructor pays screen space between the question box
(`AskAiModal.tsx:87-97`) and the answer pane (`:143-149`) on every open,
including the large majority of opens that are simply "ask a question". The
scope counts clicks and never counts the primary task's cost, and it has
pre-committed against the obvious mitigation. That is a shape decision
presented as a copy decision, and it belongs to the UX and architect seats with
the pre-commitment lifted.

---

## Item 7, residuals

**Routed, not implied - the three self-declared unknowns all land somewhere.**
Interaction counts -> R-UI-1 (owner / a browser check). Anything about the
proposed table -> R-MIG-1 (owner watches the Action; architect reviews before
W2). The model id -> R-MODEL-1 (architect decides (a) or (b), then W1's
implementer). Section 10 restates all three as environment limits. Every row in
section 9 carries an owner, an instrument, an object, a direction of failure
and a step, and the two handovers name their receiver. By
`iteration-caps.md`'s test none of them is a disguised deletion.

Two qualifications: R-MODEL-1's instrument is on the wrong file (MJ-4), and
R-SEQ-1's justification is cited to lines that do not exist (BL-4) even though
its own instrument is valid and its conclusion correct.

**Residuals the scope owes and does not have**, one per major that is not
itself a wave-plan fix: the `includeStudentData` binding (MJ-3), the B1
clock-staleness disposition (item 3), the record-integrity cost of the split
(MJ-5), and the S6 breadth question (MJ-7, which is the owner's, below).

---

## TERMINATING QUESTION FOR THE OWNER

One, and it is a product call that no further round can settle - a legal (b)
Reduce under `iteration-caps.md`:

**When the app's own recorded-fact list changes, what should the panel do with
answers stored before the change?**

- **(i) Refuse all comparison** - what S6 specifies today. Safe, and it turns
  the feature's stated deliverable off for the entire pre-change history, for
  good, on every bump. Given A1 already moved the list once and W1 moves it
  again, this is likely the common case rather than the rare one.
- **(ii) Compare the labels present in BOTH sets and say separately that the
  recorded-fact list moved.** Honest for every shared label (a digest
  comparison is unaffected by the app having started recording something
  else), and the 5.4 trap - the app's own additions being reported as the
  instructor's changes - is confined to added labels, which (ii) simply does
  not report as changes.

Both answers terminate: the scope ships as it stands with the chosen rule
written into S6, AC-3 re-pointed at it, and the other reading recorded as a
residual. My recommendation is **(ii)**, because (i) makes the feature's
deliverable rarer than its own schema churn. Cost of being wrong on (ii): one
sentence that has to be carefully worded so an added label is never named as a
change - which 5.3's S2 row already commits to doing.

---

## Verdict and contract

**NOT BUILDABLE AS WRITTEN.** 4 blockers, 10 majors, 5 minors, 0 findings
against the disposition table, 0 findings against the central 27/55
measurement.

| Blocker | Class | NEW / REPEAT |
|---|---|---|
| BL-1 | a requirement present in the prose and absent from the artifact's own data shape | **NEW** |
| BL-2 | an acceptance instrument that contradicts the artifact it accepts | **NEW** |
| BL-3 | a wave file list that cannot satisfy the instruction assigned to it | **NEW** |
| BL-4 | an obligation discharged by citing a document without opening it (`iteration-caps.md:34-35`) | **NEW** |

No blocker shares a corrective rule with another. BL-1 is fixed by adding
fields to a shape; BL-2 by making one list of forbidden verbs and scoping it;
BL-3 by adding a lib leaf to a wave; BL-4 by striking a blanket claim and
re-citing. None of the four is a relabelling of another. This is round 1, so no
prior class exists to repeat.

**Stopping point: DESIGN**, with one item for the owner.

- **design** - BL-1, BL-2, BL-3, MJ-1, MJ-2, MJ-3, MJ-4, MJ-8, MJ-10 and the
  item-3 B1 disposition are all resolvable by one revision of this scope. They
  are not measurement questions; every quantity they touch is already measured
  and correct.
- **rulings** - MJ-9 (the barrel is a shared file no disjointness analysis has
  claimed) and R-SEQ-2's ordering against A4 belong to the orchestrator, not to
  a scope revision.
- **owner** - MJ-7 / S6 only, as the terminating question above.
- **measurement** - nothing. The measurement layer of this document is the part
  that held up.
