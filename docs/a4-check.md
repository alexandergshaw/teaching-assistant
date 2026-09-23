# A4 check, round 1 of at most two

Adversarial check over `docs/a4-scope.md` at commit ad89027. I did not author
it. Write set for this document: `docs/a4-check.md` only.

Verdict up front: **NOT BUILDABLE AS WRITTEN.** 3 blockers, 7 majors,
4 minors. Two of the three blockers are product calls that DECISION 12 did
not settle and that no revision round can settle either - they are named as
TERMINATING QUESTIONS in section D, not as round-2 work.

Every quantity below names the command that produced it. All commands were
run from the repo root in this checkout on 2026-09-23.

---

## A. What I re-measured and found SOUND

One line each. These are confirmed - do not re-litigate them in a revision.

- Five chips, `AskAiModal.tsx:16-29`, and every individual line number the
  scope cites (`:17`, `:18`, `:19`, `:20`, `:28`, comment `:21-27`).
  Command: `cat -n src/app/components/courses/AskAiModal.tsx | sed -n '14,32p'`.
- Grounding sentence text at `:99-101` inside the `<p>` at `:98-102`.
  Same command over `sed -n '94,120p'`. The scope's "99-102" is the sentence
  plus its closing tag; not wrong.
- `SUGGESTIONS.map` at `:104-117`, `styles.linkButton` at `:108`,
  `includeStudentData: true` at `:56`. Same command.
- The gating split. `course-facts.ts:108` opens `if (includeStudentData)` and
  roster (`:109-111`), weekly checklist (`:113-126`) and grades due
  (`:128-131`) are all inside it; the other four families are outside it.
  Command: `cat -n src/lib/course-facts.ts`.
- The labels-only caution on family 6 is correct and well taken. The comment
  at `course-facts.ts:114-123` says exactly that, and none of the three
  proposed strings asserts done/undone state.
- `llm-content.ts:899` is quoted verbatim and the line number is exact.
  Command: `cat -n src/app/actions/llm-content.ts | sed -n '805,925p'`.
- `computeDeterministicScheduleAnswer` at `:812-837`, returned at `:875-877`
  before any provider dispatch. Same command.
- The closed list is 16 entries: `ASK_AI_CURRENT_WEEK_QUESTIONS` 4 entries at
  `week-numbering.ts:139-144`, `ASK_AI_TERM_END_QUESTIONS` 12 at `:146-159`,
  combined at `:164-167`, exact-match normalization at `:173-175`, shape match
  at `:179-184`. `"what week are we in"` is at `:140`. None of the three
  proposed strings normalizes into the list. Command:
  `cat -n src/lib/week-numbering.ts | sed -n '130,195p'`.
- Line counts agree on both counters, as the scope claims.
  `wc -l` gave 152 / 135 / 921 / 332 for `AskAiModal.tsx`, `course-facts.ts`,
  `llm-content.ts`, `week-numbering.ts`; PowerShell
  `@(Get-Content $_).Count` over the same four gave 152 / 135 / 921 / 332.
- `LIMIT = 1000` is at `:41`. Command:
  `grep -n "LIMIT = 1000" src/file-size-ceiling.structure.test.ts`.
- No `ALLOWED_OVERAGE` entry for any of the four files. Command:
  `grep -n "AskAiModal\|course-facts\|llm-content\|week-numbering" src/file-size-ceiling.structure.test.ts`,
  exit 1. Canary that the file and the mechanism are real:
  `grep -c "ALLOWED_OVERAGE" src/file-size-ceiling.structure.test.ts` returns 2.
- Persistence absence holds. Command:
  `grep -n "localStorage\|ta-" src/app/components/courses/AskAiModal.tsx`,
  exit 1. Canary that the same pattern is valid and does fire:
  `grep -c "localStorage\|ta-" src/lib/weekly-checklist-table-helpers.ts`
  returns 1.
- **The exclusion of the fourth test file is CORRECT.** I opened it.
  `src/loop-docs.structure.test.ts:143-150` opens a describe whose `source` is
  `docs/loop/leverage.md`, and `:190-194` asserts on that string, not on
  `AskAiModal.tsx`. Excluding it from the wave gate is right. Command:
  `grep -n "leverage.md\|const source" src/loop-docs.structure.test.ts`.
- The four test files reading `AskAiModal` reproduce exactly. Command:
  `grep -rln "AskAiModal" src --include=*.test.ts` returns
  `llm-content.test.ts`, `modalAdoption.wiring.test.ts`, `course-facts.test.ts`,
  `loop-docs.structure.test.ts`. Canary against the `--include` filter hiding
  callers: `grep -rln "AskAiModal" src` with no filter returns those four plus
  `CoursesTab.tsx`, `AskAiModal.tsx`, `WeeklyChecklistOverviewModal.tsx`,
  `course-facts.ts`, `week-numbering.ts` - so the filter is doing what the
  scope says it is, and nothing collectable was hidden by it (vitest collects
  `src/**/*.test.ts` only).
- The section 9 gate-coverage claim holds. `src/lib/no-emojis.test.ts:254` is
  `const roots = ["src", "docs"].map(...)`, and
  `src/source-bytes.structure.test.ts:49` sets `SKIP_DIRS` without `docs`, with
  `ROOT = process.cwd()` at `:48`. Command: `sed -n '248,262p'` and
  `sed -n '40,75p'` on those two files.
- **The wave gate command is correctly formed and passes.** I ran the scope's
  own command:
  `npm run test:paths -- src/app/actions/llm-content.test.ts src/lib/course-facts.test.ts src/app/components/ui/modalAdoption.wiring.test.ts`,
  with `echo $? > /tmp/a4gate.exit`. **Exit code read from the file: 0.**
  `Test Files 3 passed (3)`, `Tests 101 passed (101)`, and three per-argument
  `COVERED` lines (39 / 31 / 31 passed). No raw multi-path `vitest run`
  appears anywhere in the scope.

---

## B. BLOCKERS

### BLOCKER 1 - the removal test is not a removal test, on the file that
named this failure mode

**Class: unfalsifiable-claim-presented-as-a-test. NEW.**

`docs/loop/leverage.md:130-135` defines the removal test: "The claim is not
proven by the taxonomy card - it is proven by ONE acceptance criterion (the
test seat's oracle) that goes RED when the claimed advantage is REMOVED from
the feature. Not one a chat merely could not satisfy - that is unfalsifiable."

`leverage.md:145-149` gives the procedure: "State the deletion, then trace the
assertion. Name the exact line or call you would delete to remove the
advantage, then say which assertion's observed value changes as a result. If
the assertion's value is unchanged by that deletion, the test is not a removal
test."

The scope's three "Removal-test reasoning" paragraphs (sections 2.18, 2.19,
2.20) state a deletion and then trace **a hypothesised model behaviour**, not
an assertion. Each ends at "by `llm-content.ts:899` it must fall back to 'I
don't have that information'". No assertion anywhere in this repo observes
that, and none can: `vitest.config.ts` is `environment: "node"` with no
renderer, and `vitest.setup.ts` throws on `fetch`, so no test reaches a model.
The observed value of every assertion in the three gated test files is
unchanged by deleting the `Roster:` block. By leverage.md's own stated
procedure, these are not removal tests.

This is not a generic process nit. `leverage.md:138-144` records the precedent
by name: "three of four candidates from the ideation pass that first used this
taxonomy (2026-09-15, `AskAiModal.tsx`) looked like removal tests and were
not". The scope has reproduced that exact failure, on that exact file, in the
row opened to fix that exact pass.

`leverage.md:175-181` supplies the legal move and the scope does not take it:
"Where no removal test is buildable, say so and record a residual with an
owner and a step." RES-A4-1 gestures at this but is filed as a verification
residual about a shipped change, not as the admission that the row's entire
justification is unfalsifiable in this environment.

**Consequence.** The implementer lands three strings, `tsc`, `lint`,
`next build` and all 101 tests in the gate go green, and nothing anywhere -
now or ever - distinguishes the post-change modal from the pre-change one on
the only axis the row is about. That is the silent-green failure in its purest
form.

### BLOCKER 2 - all three replacement families are nullable, default-null,
optional fields, and the chips render unconditionally

**Class: capability-conditional-on-unguaranteed-data. NEW.**

`src/app/components/courses/AskAiModal.tsx:104` renders every member of
`SUGGESTIONS` unconditionally. There is no gating on field presence, and the
scope proposes none.

But every one of the three replacement families is optional, nullable and
defaulted to null:

- `src/lib/supabase/courses.types.ts:74` - `roster: string | null;`
- `src/lib/supabase/courses.row.ts:48` - `roster: string | null;` (the DB
  column is nullable; `:189` writes `clean(input.roster)`)
- `course-facts.ts:109` - `if (course.roster && course.roster.trim())`
- `course-facts.ts:113` - `if (course.weeklyChecklist && course.weeklyChecklist.length > 0)`
- `course-facts.ts:129` - `if (gradesDue)`, where `describeGradesDue` returns
  `""` for an absent or invalid date (`src/lib/grades-due.ts:106-107`)

I found no seeded default for any of the three. Command:
`grep -rn "DEFAULT_WEEKLY_CHECKLIST\|defaultWeeklyChecklist" src --include=*.ts --include=*.tsx`
returns only `DEFAULT_WEEKLY_CHECKLIST_SORT`, a sort-state constant in
`weekly-checklist-table-helpers.ts:134`, not a seeded item list.

So in the ordinary state where an instructor has not filled the roster field
(or the checklist, or the grades-due date), the re-pointed chip is still shown,
still fires, the named family is absent from the rendered block, and
`llm-content.ts:899` routes the model to "say so plainly and answer from
general teaching practice instead". **That is the precise condition DECISION 12
exists to eliminate**, and after this change it is produced by the chips that
were re-pointed to eliminate it.

The scope's section 1 says "All three gated families (5, 6, 7) are confirmed
emitted in the current tree ... none of this pass's proposed replacement chips
points at a family the code does not actually produce." That is a claim about
CODE sold as a claim about DATA. The brief's question was whether the families
are emitted **with real values in a normal course**, and the scope never asks
it.

Note also that this is strictly WORSE than the status quo in that state. The
old chip ("Suggest three assessments that fit this schedule.") produced a
usable, if generic, answer on an empty course. The new chip produces a
declination. The scope's own cost-of-being-wrong inheritance from the backlog
row ("if the shapes are wrong the chips read as odd rather than as false")
does not cover a dead chip.

Finally, the scope applies "every caller and every reachable state" to the
grounding sentence in section 4 and does not apply it to its own chips. The
empty-roster state is reachable, common and unhandled.

### BLOCKER 3 - the replacement for `:20` routes DATE ARITHMETIC to the
model, against this file's own architecture

**Class: re-point-into-a-mechanism-the-repo-already-rejected. NEW.**

"How much time will I have to submit grades after this course ends?" is
`gradesDueDate` minus `endDate`. This repo already owns that class of
question and deliberately answers it WITHOUT a model:

- `computeDeterministicScheduleAnswer`, `llm-content.ts:812-837`
- `ASK_AI_TERM_END_QUESTIONS`, `week-numbering.ts:146-159` - twelve entries
  including "how many days until the course ends" and "when does the course
  end"
- `SCHEDULE_ANSWER_MARKER`, `week-numbering.ts:191-192`, whose own doc comment
  at `:186-190` says the marker exists so the instructor knows the answer
  "came from the course's own recorded dates, not from the model's reading of
  them, and therefore **cannot be wrong the way the model's other answers in
  the same modal can be**"

The scope picks, as one of three re-pointed chips, a question of exactly the
shape this mechanism exists for, and routes it to the model - where the answer
carries no marker and can be wrong.

It is worse than that, because the two operands reach the model in different
formats:

- `course-facts.ts:57` emits `End date: 2026-12-15` (raw ISO, `line()` does
  not reformat)
- `course-facts.ts:130` emits `Grades due: Dec 15, 2026 at 5:00 PM`
  (`describeGradesDue`, `grades-due.ts:108-112`, via
  `parsed.toLocaleDateString(undefined, { year, month: "short", day })`)

So the model is asked to reconcile an ISO date against a localized prose date
and subtract them, with no deterministic path and no marker, in a modal whose
own architecture says this is the one thing not to do.

RES-A4-4 notices the general weakness ("grounding is enforced by prompt
wording rather than by code that cannot do otherwise") and does not notice that
THIS chip is one closed-list entry away from the guaranteed version. That is
the gap between a residual and a design finding.

---

## C. MAJORS

### MAJOR 1 - section 6's enumeration of `llm-content.test.ts` is incomplete,
and "Each checked directly this pass" is false for that file

The exact string the wave deletes appears twice more in that test file:

- `src/app/actions/llm-content.test.ts:213` - the unmatched arm of
  `AC-LEV-1`, which the comment at `:200-206` calls "the removal test" for the
  A2 deterministic branch
- `src/app/actions/llm-content.test.ts:419` - the model-answered arm of
  `AC-UX-1`

Command: `grep -rn "Suggest three assessments" src docs`. The scope reports
only `:432-447` for that file.

Neither breaks, because both are hardcoded literals rather than reads of
`SUGGESTIONS`. But after the wave, two tests pin a fixture string that exists
nowhere in the product - this repo's own "fixtures must match emitted shape"
class. The wave plan hands the implementer a one-file write set with no
instruction about the two orphans, so they will silently rot.

### MAJOR 2 - a closed-list collision in a new chip is invisible to every gate

`AC-REACH-1` (`llm-content.test.ts:432-447`) asserts
`normalizedChips.some((c) => ASK_AI_CLOSED_LIST_QUESTIONS.includes(c))` at
`:445-446` - **at least one**. If a re-pointed chip ALSO lands in the closed
list (a grades/term-end phrasing is one plausible copy-edit away), that chip
silently takes the no-model arithmetic path, `renderCourseFacts` is never
consulted for it, and the row's stated goal inverts - with the gate green. I
measured the gate at exit 0 with 101 passing tests before any change, so there
is no signal to lose.

The scope names this risk in section 2 and assigns it to a human: "an
implementer wave should re-check this against the exact final strings it
ships." That is a re-read, not an instrument. The one-line instrument that
would catch it - assert the count of chips in the closed list is exactly 1,
not at least 1 - is not proposed anywhere.

### MAJOR 3 - the `:28` out-of-scope justification is stated unconditionally
and is not unconditional

`llm-content.ts:807-810`, the function's own docstring: "Returns null when the
question does not match the closed list, **or when the matched shape's
required field is missing, unparseable, or internally inconsistent (end before
start) - in every such case the caller falls through to the model unchanged.**"
`:819-820` confirms it: `currentCourseWeek(courseDates.startDate, now)` returns
null on a missing or unparseable start date, and the function returns null.

So on a course with no start date, `"What week are we in?"` DOES make a model
call. The scope's "answered from a computed value with no model call" and
"holds regardless of this row's changes" are true on one state, not on every
reachable state. The scope applies the every-reachable-state standard to the
grounding sentence in section 4 and a weaker one to its own exclusion in
section 3.

This matters for the brief's question 4: in the null-start-date state, chip
`:28` reaches the model with a facts block that has no `Start date:` line, and
the sentence's "dates" noun grounds nothing.

### MAJOR 4 - "always-emitted" and "already-emitted" are both false

`course-facts.ts:30-34`: `line()` returns `null` for a null, undefined or
whitespace-only value, and `:134` filters nulls out. `:97` guards the schedule
on `course.csvData && course.csvData.trim()`.

So none of the four ungated families is "always-emitted". Two places lean on
the word:

- Section 3, the `:17` argument: "delete any one of the always-emitted
  families (schedule, dates, textbook, description) and the answer changes".
  They are ungated, not always-emitted.
- Section 2, the `:20` replacement: "paired with the already-emitted end date
  (`course-facts.ts:57`)". `End date` is `line("End date", course.endDate)` -
  conditional like every other.

The second is load-bearing: replacement `:20` needs a CONJUNCTION of two
independently optional fields (`endDate` AND `gradesDueDate`) to be answerable
at all. That is strictly more fragile than the scope states, and it compounds
BLOCKER 2.

### MAJOR 5 - two of four residuals are deletions by the caps card's own rule,
and none is routed to the backlog

`docs/loop/iteration-caps.md:167`: "A residual without an owner, an instrument
and a step is a deletion. Call it that." `:103-104`: "record it with an owner,
an instrument, and the step that will measure it."

- RES-A4-3: Step = "Not scheduled; recorded so a later reader does not mistake
  this row as having settled it." That is a note, not a step. Its Instrument
  column - "A future scoping pass re-reading `AskAiModal.tsx:98-102`" - is a
  step described as an instrument, so the row has an owner and nothing else.
- RES-A4-4: Step = "Not scheduled; out of scope for DECISION 12." Same shape.

Separately, `docs/DEV_LOOP.md` ("Record disposals as they happen") rules that
"A disposal is not recorded until it is in `docs/BACKLOG.md`" and that one
living only in a scratchpad is "the same deletion with extra steps". The scope
creates four residuals, correctly excludes `docs/backlog.yml` from its own
write set, and then never names who owes the append. All four are currently
scratchpad residuals.

### MAJOR 6 - under the brief's literal removal test, all three replacements
still pass to a chat; the scope substitutes a weaker test

The brief's test: could a chat answer this equally well from a pasted facts
blob? For all three replacements the answer is yes, because the blob contains
the family. The scope sees this and substitutes a different test in section 2:
"The relevant contrast is not 'does a chat get the same paste' (it does, since
`AskAiModal.tsx:56` sends the same block either way) - it is whether the
QUESTION's answer actually depends on this course's specific recorded value."

I credit the scope for stating the substitution openly rather than sliding past
it - that is not concealment. But the substituted test is weaker than both the
brief's and `leverage.md`'s, and under it ANY question that names a recorded
field passes. Applied to the individual strings:

- `:19`'s replacement, "What does this course's weekly checklist cover, and is
  anything commonly expected missing from it?", is half **echo** (the
  instructor authored the checklist; reading it back is not an answer) and half
  **general teaching practice** ("commonly expected") - the exact category the
  row was opened to remove. It passes the substituted test and fails the
  original.
- `:18`'s replacement, "Does this course's roster look complete, or is anything
  obviously missing?", has no reference to compare against. `course.roster` is
  free text (`courses.types.ts:74`) and nothing in the facts block carries an
  expected headcount or an enrollment source, so "complete" is not decidable
  from the block. The model can comment on formatting and nothing else.

### MAJOR 7 - `:17` is excluded as already-grounded while a near-clone of it
is proposed as the replacement for `:18`

The brief asked whether the `:17` judgement survives. **Partially, and it
creates a contradiction the scope does not see.**

The `:17` exclusion argument is sound on its own terms: "What is this course
missing before the term starts?" is a completeness audit over the record, and
the model genuinely cannot answer it without inspecting which fields hold
values. I accept that reasoning.

But the proposed replacement for `:18` - "Does this course's roster look
complete, or is anything obviously missing?" - is the SAME SHAPE: a
completeness audit, narrowed from the whole record to one field. So either

- the completeness-audit shape is grounded, in which case the modal now shows
  two chips of one shape and the `:18` replacement is largely redundant with a
  chip already on screen (and `:17` would arguably answer the roster question
  as a sub-case); or
- it is not, in which case `:17` should have been in scope too.

The scope takes both positions in adjacent sections and never reconciles them.

---

## D. TERMINATING QUESTIONS for the owner - NOT round-2 work

These are `iteration-caps.md` (b) Reduce: scope/product calls that no number of
rounds resolves. Per AGENTS.md's "Two rounds, then ask", they go to the owner
now rather than into a revision.

**Q1 (from BLOCKER 2).** The three re-pointed chips are useless on a course
whose roster / weekly checklist / grades-due date is unset, and all three are
optional nullable columns with no default. DECISION 12 did not consider this.
Three options, all beyond a copy edit: (a) render each chip only when its
family is emitted - a real code change to `AskAiModal.tsx`, not three strings;
(b) accept dead chips on incomplete courses and say so; (c) re-point at the
four ungated families instead, which are also conditional but far more commonly
set. My recommendation is (a), and it changes the wave plan from a three-string
edit to a conditional render with its own instrument.

**Q2 (from BLOCKER 3).** Should the grades-due question become a
`ASK_AI_TERM_END_QUESTIONS`-style deterministic closed-list entry rather than a
model chip? That is the mechanism this repo already built for date arithmetic,
and it would give the chip a GUARANTEED-class answer with
`SCHEDULE_ANSWER_MARKER`. It is a build, not a copy edit, and DECISION 12
authorized only re-pointing the chip text - so it cannot be decided inside this
row.

**Q3 (RES-A4-3, which the scope already routes to the owner - I agree).** The
grounding sentence sits above the free-text box, not above the chips, so it is
false for any off-topic typed question. The scope calls this pre-existing and
defers it with an owner. That disposition is correct and should be kept; it
just needs a real step (see MAJOR 5). It should NOT become round-2 work.

---

## E. MINORS

1. Section 5 says `LIMIT` is at line 41, "not line 30 as both the task brief
   and `docs/loop/this-repo.md` state". `docs/loop/this-repo.md` section 3
   already says `:41` and records the correction in the same sentence: "was
   cited as `:30` until 2026-09-23 - re-measured with
   `grep -n "LIMIT = 1000" src/file-size-ceiling.structure.test.ts`". The
   scope's own measurement is right; its claim about that document is wrong.
2. The same function is cited as `llm-content.ts:817-836` in section 2 and
   `:812-837` in section 3. Body versus declaration, but a reader cannot tell.
3. The schedule family is emitted with the label `Schedule of topics:`
   (`course-facts.ts:98`), not `Schedule:`. Section 1's table gives the line
   range but never the emitted label, which is what a later copy pass would
   need.
4. `course-facts.ts:4-8` claims the renderer is deterministic, "the same
   Course value still produces the same string on every call, forever".
   `describeGradesDue` uses `toLocaleDateString(undefined, ...)`
   (`grades-due.ts:109`), so the grades-due line is locale-dependent and
   `AskAiModal.tsx` is a `"use client"` component. Pre-existing, not this
   row's, but it is the operand format BLOCKER 3 depends on.

---

## F. The silent-green failure, stated plainly

This can be built exactly as written, pass `npx tsc --noEmit`, `npm run lint`,
the `Compiled successfully` line of `next build`, and the scope's own gate
(measured: exit 0, 101 tests, three `COVERED` lines), and still:

- ship three chips that produce a declination on any course with an unfilled
  optional field (BLOCKER 2);
- ship a date-arithmetic chip answered by a model where the repo already has a
  guaranteed computed path (BLOCKER 3);
- leave two orphaned fixtures in `llm-content.test.ts` (MAJOR 1);
- silently route a new chip onto the arithmetic path if a copy edit collides
  with the closed list, because `AC-REACH-1` asserts `.some`, not a count
  (MAJOR 2);
- leave four residuals in a document nobody reads at push time (MAJOR 5).

No gate, and no instrument the scope proposes, observes any of these.

I checked my own commands for the three instrument defects named in the brief:
no absence claim here is piped through `head`; the one `--include` filter used
was re-run without the filter as a canary; and every `|` alternation in a grep
pattern was paired with a canary on a file known to contain a match.

---

## G. Output contract

**Verdict: NOT BUILDABLE AS WRITTEN.**

Counts: **3 BLOCKER, 7 MAJOR, 4 MINOR.**

Defect class per blocker:

| # | Class | New or repeat |
|---|---|---|
| BLOCKER 1 | unfalsifiable-claim-presented-as-a-test (a stated deletion with no assertion whose observed value changes) | **NEW** |
| BLOCKER 2 | capability-conditional-on-unguaranteed-data (an unconditional surface pointed at an optional, default-null field) | **NEW** |
| BLOCKER 3 | re-point-into-a-mechanism-the-repo-already-rejected (routing to a model a question class the tree answers deterministically on purpose) | **NEW** |

None of the three shares a corrective rule with either of the others: 1 is
fixed by building an instrument or admitting none is buildable, 2 by gating the
surface on the data, 3 by choosing a different question shape or a different
mechanism. I have no prior A4 check to repeat against: `git log --oneline --all --
docs/a4-check.md` returns empty output. The scope's own no-prior-version claim
also reproduces - `git log --oneline --all -- docs/a4-scope.md` returns exactly
one line, `ad89027`, so there is no earlier revision and no disposition table
owed.

**Stopping point.** What remains is **design and rulings**, not measurement. I
re-measured everything the brief named and the measurements are in section A;
the scope's factual layer is mostly accurate and its excluded-file reasoning is
correct. What is unresolved is (i) two product calls the owner must make (Q1,
Q2), which is why this should not go to a round 2 that cannot settle them, and
(ii) whether a removal test is buildable here at all, which `leverage.md:175-181`
already answers with "say so and record a residual" - a revision can do that,
but only after Q1 and Q2 come back, because the answers change what the chips
are.
