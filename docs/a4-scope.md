# A4 scope: re-point three AskAiModal suggestion chips at grounded questions

Decision: `docs/owner-decisions-2026-09-23.md` DECISION 12. Option (b) - RE-POINT
the three chips at questions that need the course's recorded facts, so the
grounding sentence becomes true rather than weaker. Not (a) softening the
copy, not (c) dropping the chips. This document is the scope for that
re-pointing. **Write set for this document: `docs/a4-scope.md` only.** No
production file is touched by writing this document; the wave plan in
section 7 describes work for a later implementer wave.

No prior version of this file exists (`git log --oneline --all -- docs/a4-scope.md`,
2026-09-23, empty output), so there is no disposition table to carry forward.

## 0. Re-measured chip inventory (do not inherit the row's counts)

`src/app/components/courses/AskAiModal.tsx:16-29`, read directly this pass:

```
16  const SUGGESTIONS = [
17    "What is this course missing before the term starts?",
18    "Suggest three assessments that fit this schedule.",
19    "Where is this schedule too heavy or too light?",
20    "Draft a welcome announcement for this course.",
21    // ... comment, :21-27 ...
28    "What week are we in?",
29  ];
```

**Five chips**, confirmed by direct read (the row's own text already corrected
itself to five on 2026-09-23; re-confirmed here rather than inherited). Three
are in scope for re-pointing (:18, :19, :20). Two are not (:17, :28) - see
section 3.

The grounding sentence is at `AskAiModal.tsx:99-102`:

```
99   <p className={...}>
100    Answers are grounded in this course&apos;s own recorded facts - its schedule, dates,
101    textbook, and description, plus its roster, weekly checklist, and grades-due date,
102    each only when set.
103  </p>
```

The model receives the full facts block regardless of which chip fired:
`AskAiModal.tsx:56` passes `includeStudentData: true` unconditionally on
every `ask()` call, so all seven families below reach the model on every
question, chip or typed. What is NOT unconditional is whether a given
question's ANSWER actually uses any given family - that is what section 2
addresses.

## 1. The seven fact families, named from the emitter, and what each could ground

Source: `src/lib/course-facts.ts`, the sole renderer for the block
`AskAiModal.tsx:56` sends (`renderCourseFacts`, `course-facts.ts:48`). The
sentence's seven nouns map onto these emitters, each opened directly:

| # | Sentence noun | Emitter (file:line) | Gated by `includeStudentData`? | What it could ground a question about |
|---|---|---|---|---|
| 1 | schedule | `course-facts.ts:97-99` (`course.csvData`, full topic-by-week table, included in full not summarized - comment at :95-96) | No | Specific weeks, specific topics, density/gaps between named weeks |
| 2 | dates | `course-facts.ts:56-57` (`Start date`/`End date` lines) | No | Term-length arithmetic, timing relative to term boundaries |
| 3 | textbook | `course-facts.ts:64` (`Textbook: course.textbook`) | No | Whether/which textbook is recorded, questions naming it |
| 4 | description | `course-facts.ts:65` (`Description: course.description`) | No | The instructor's own stated purpose/content for the course |
| 5 | roster | `course-facts.ts:108-111` (`Roster:\n${course.roster.trim()}`, free text) | Yes | Specific enrolled students, roster completeness or headcount |
| 6 | weekly checklist | `course-facts.ts:113-126` (`Weekly checklist:\n...`, **labels only, no done/undone state** - comment at :114-123 explains the state is deliberately omitted because it would go stale with no clock) | Yes | What recurring per-week items/tasks this course tracks; NOT their completion status, which is never emitted |
| 7 | grades-due date | `course-facts.ts:128-131` (`describeGradesDue(course.gradesDueDate, course.gradesDueTime)`, `Grades due: ...`) | Yes | Grading deadline, turnaround time relative to the end date |

All three gated families (5, 6, 7) are confirmed emitted in the current tree
(A1 landed, matching the row's own claim) - none of this pass's proposed
replacement chips (section 2) points at a family the code does not actually
produce.

Caution carried into section 2: family 6 (weekly checklist) emits **labels
only**. A replacement question that asks "what's left to do" or "what's
still open" would imply completion state the app deliberately does not send
- that would be a second defect of the same shape DECISION 12 exists to fix
(copy that overstates what is grounded), so no replacement below uses that
phrasing.

## 2. Proposed replacements for the three chips

For each, the test named in the brief is applied explicitly: **could a chat
answer this equally well from a pasted blob?** The relevant contrast is not
"does a chat get the same paste" (it does, since `AskAiModal.tsx:56` sends
the same block either way) - it is whether the QUESTION's answer actually
depends on this course's specific recorded value, or is general
teaching-practice advice the model would give regardless. This distinction is
sharpened by the model's own prompt instruction at
`src/app/actions/llm-content.ts:899`: *"If the facts do not contain what you
would need, say so plainly and answer from general teaching practice instead
- do not invent specifics about this course."* That is the fallback the three
original chips silently exercised: nothing in their phrasing requires a
specific recorded fact, so the model's own instructions route it straight to
generic advice. A grounded replacement must be a question where that fallback
would visibly degrade the answer (the model would have to say "I don't have
that information" rather than substitute something plausible).

None of the three replacement strings below normalizes to a member of
`ASK_AI_CLOSED_LIST_QUESTIONS` (`src/lib/week-numbering.ts:164-167`, which
concatenates `ASK_AI_CURRENT_WEEK_QUESTIONS` (4 entries, `:139-144`) and
`ASK_AI_TERM_END_QUESTIONS` (12 entries, `:146-159`) - 16 total, exact-match
only per `normalizeAskAiQuestion` at `:173-175`) - checked by reading all 16
entries directly; none matches "roster", "checklist" or "grades due" in any
form. This matters because a collision would silently
route the chip onto the no-model-call arithmetic path
(`llm-content.ts:817-836`), which reads typed `Course` date fields directly
and never touches `renderCourseFacts` at all - the opposite of what this row
is trying to prove.

### Replacement for `:18` ("Suggest three assessments that fit this schedule.")

**New text:** `"Does this course's roster look complete, or is anything obviously missing?"`

**Family:** roster (`course-facts.ts:108-111`).

**Removal-test reasoning:** delete the `Roster:` block from the rendered
facts and the model has no student list to inspect at all - by
`llm-content.ts:899` it must fall back to "I don't have that information"
rather than a real answer. A generic chat with no course-specific paste
cannot evaluate a roster it has never seen; "suggest three assessments" by
contrast is stock pedagogical advice a model gives with or without any
specific fact present, which is exactly why the ideation pass flagged the
original as chat-equivalent.

### Replacement for `:19` ("Where is this schedule too heavy or too light?")

**New text:** `"What does this course's weekly checklist cover, and is anything commonly expected missing from it?"`

**Family:** weekly checklist (`course-facts.ts:113-126`).

**Removal-test reasoning:** delete the `Weekly checklist:` block and the
model has no concrete list of this course's tracked items to describe or
audit; it can only offer a generic list of things courses commonly track,
disconnected from this course's actual recorded items. With the block
present, a faithful answer must name items that are actually on the list.
Phrasing avoids any claim about done/not-done, since that state is never
emitted (section 1, family 6 caution).

### Replacement for `:20` ("Draft a welcome announcement for this course.")

**New text:** `"How much time will I have to submit grades after this course ends?"`

**Family:** grades-due date (`course-facts.ts:128-131`), paired with the
already-emitted end date (`course-facts.ts:57`).

**Removal-test reasoning:** delete the `Grades due:` line and the model has
no course-specific deadline to compute from; a generic chat has no way to
know when THIS course's term ends or when grades are due, so it cannot
produce a real number - it must decline rather than invent one. A welcome
announcement, by contrast, is boilerplate a model produces from the course
name alone; none of the seven families is load-bearing for it, which is why
the original was flagged.

## 3. The two chips not in scope

**`:28`, `"What week are we in?"`** - answered from a computed value with no
model call. Confirmed by tracing the call: `AskAiModal.tsx:110-113` calls
`ask(s)` for any chip, which calls `askAboutCourseAction` at
`AskAiModal.tsx:55-60`; inside that action,
`computeDeterministicScheduleAnswer` (`llm-content.ts:812-837`) runs BEFORE
any model dispatch and matches this exact string via
`matchAskAiQuestionShape` (`week-numbering.ts:179-184`,
`"what week are we in"` is a literal member of
`ASK_AI_CURRENT_WEEK_QUESTIONS` at `week-numbering.ts:140`). When matched, the
function returns a string built from `currentCourseWeek`/`courseProgressStatus`
computed from the typed `startDate`/`weeks` fields
(`llm-content.ts:818-822`), and `askAboutCourseAction` returns that answer at
`:875-877` without ever calling the model. `renderCourseFacts`'s rendered
block is not consulted for this chip at all - the grounding sentence's truth
for this chip therefore rests on the typed `dates` fields directly
(`course.startDate`/`endDate`/`weeks`, passed at `AskAiModal.tsx:58`), not on
the prose block, and holds regardless of this row's changes. Unaffected by
every option DECISION 12 considered.

**`:17`, `"What is this course missing before the term starts?"`** - the "one
other" the row's correction names, confirmed independently here rather than
inherited. This question's shape differs in kind from the three re-pointed
above: answering it requires enumerating what IS and ISN'T present across the
whole recorded block (is there a textbook, a description, a schedule, enough
weeks) - the model cannot answer without inspecting the specific field values,
because "missing" is only meaningful relative to what this course's own
record actually holds. Applying the same removal test: delete any one of the
always-emitted families (schedule, dates, textbook, description) and the
answer changes - that family's presence-or-absence becomes something the
model can no longer speak to, which is different from the three chips above
where deleting a family made no difference because the answer never depended
on it. Not touched by this row; listed here only so a later reader does not
read its absence from section 2 as an oversight.

## 4. Does the grounding sentence need to change

**No change proposed**, per DECISION 12's stated preference (make the copy
true, not weaker) - and the check below finds no case where it still
overstates once the three chips are re-pointed.

Checked against all five chips as the brief requires, not just the three:

- `:17` - grounded in schedule/dates/textbook/description by nature of the
  question (section 3).
- `:18` (replacement) - grounded in roster (section 2).
- `:19` (replacement) - grounded in weekly checklist (section 2).
- `:20` (replacement) - grounded in grades-due date, paired with dates
  (section 2).
- `:28` - grounded in dates, read directly from typed fields rather than the
  rendered block (section 3). The sentence says "grounded in this course's
  own recorded facts", not "grounded in the rendered facts block" - it holds
  either way the app reads the date fields.

**Scope boundary stated, not fixed here:** the sentence is static copy shown
above the whole question box (`AskAiModal.tsx:98-102`), not just above the
five chips - an instructor can type any free-form question, and for an
arbitrary typed question ("what is the capital of France?") the sentence is
not literally true. This condition predates this row (the sentence covers
free text today, unchanged by DECISION 12) and DECISION 12 did not ask to
narrow the sentence's scope to the five chips only. Recording as a residual
(section 8, RES-A4-3) rather than fixing it here, since fixing it would be a
copy change beyond what DECISION 12 authorized (re-point the chips, not
rescope the sentence's audience).

## 5. Surface, ceiling, persistence

**Surface (the file that renders the chips):**
`src/app/components/courses/AskAiModal.tsx` - the `SUGGESTIONS` array
(`:16-29`) is both defined and rendered (`.map` at `:104-117`) in the same
file, so the render file and the file holding the strings are identical. This
is the one file a later implementer wave must include (section 7).

**Line counts, both counters, this pass:**

```
wc -l src/app/components/courses/AskAiModal.tsx        -> 152
@(Get-Content src/app/components/courses/AskAiModal.tsx).Count (PowerShell) -> 152

wc -l src/lib/course-facts.ts                           -> 135
@(Get-Content src/lib/course-facts.ts).Count             -> 135

wc -l src/app/actions/llm-content.ts                     -> 921
@(Get-Content src/app/actions/llm-content.ts).Count       -> 921

wc -l src/lib/week-numbering.ts                          -> 332
@(Get-Content src/lib/week-numbering.ts).Count            -> 332
```

The two counters agree on all four files measured this pass (unlike the
gap `this-repo.md` documents on other files - not a claim that they always
agree, only that they do on these four, this pass).

**Ceiling:** `LIMIT = 1000` in `src/file-size-ceiling.structure.test.ts`.
Measured this pass at **line 41**, not line 30 as both the task brief and
`docs/loop/this-repo.md` state - re-measured by opening the file directly
(`sed -n '25,45p' src/file-size-ceiling.structure.test.ts`); the doc citation
has drifted. None of the four files above is on the `ALLOWED_OVERAGE` ratchet
list (checked by grep for each filename in
`file-size-ceiling.structure.test.ts`; no match). `AskAiModal.tsx` at 152
lines and `course-facts.ts` at 135 lines are nowhere near the 1000-line
ceiling; a three-string text edit does not move either file meaningfully.
`llm-content.ts` at 921 lines is the closest of the four to the ceiling, but
this row's write set (section 7) does not touch it - no chip re-pointing
changes any code in that file, only in `AskAiModal.tsx`.

**Persistence / `ta-` keys:** none touched. Checked directly:
`grep -n "localStorage\|ta-" src/app/components/courses/AskAiModal.tsx`
returns no matches (exit 1, confirmed the grep pattern itself is valid - it
matches the literal `ta-` prefix used elsewhere in this codebase, e.g.
`ta-rec-*`, and simply finds none in this file). `AskAiModal.tsx` holds
`question`/`answer`/`busy`/`error` in local component `useState` only
(`:44-47`) and is unmounted on close by its caller - re-checked independently
of the A3 row's citation (the row cited a path that does not exist,
`src/app/components/courses/CoursesTab.tsx`; the real file is
`src/app/components/CoursesTab.tsx`, confirmed by
`grep -n "AskAiModal" src/app/components/CoursesTab.tsx`, which returns the
import at `:28` and `{askAiCourse && <AskAiModal course={askAiCourse}
onClose={() => setAskAiCourse(null)} />}` at `:448` - the conditional render
is what unmounts the modal when `askAiCourse` is set back to `null` on
close). Nothing here persists across sessions today, and re-pointing three
chip strings does not add a persisted control, so no exact-key-set canary is
implicated.

## 6. How this is tested

Nothing renders under vitest (`environment: "node"`, collection
`src/**/*.test.ts` only per `docs/loop/this-repo.md` section 2), and the
network is blocked (`vitest.setup.ts` stubs `fetch` to throw). This means:

Four existing test files read `AskAiModal.tsx` today, found by
`grep -rl "AskAiModal" src --include=*.test.ts` (run this pass; the wrapper
form is used for the actual re-run since it is more than one path):
`src/app/actions/llm-content.test.ts`,
`src/app/components/ui/modalAdoption.wiring.test.ts`,
`src/lib/course-facts.test.ts`, and `src/loop-docs.structure.test.ts`. Each
checked directly this pass for whether a three-string edit at `:18-20` can
affect it:

- `llm-content.test.ts:432-447` (`AC-REACH-1`) - reads the `SUGGESTIONS`
  block via `readFileSync` + regex and asserts only that SOME chip
  normalizes into `ASK_AI_CLOSED_LIST_QUESTIONS`. Stays true via the
  untouched `:28` chip regardless of the other three (section 3).
- `course-facts.test.ts:322-335` (also labelled `AC-REACH-1`, a different
  acceptance criterion under the same name - Ruling A1-9, not the closed-list
  one above) - regex-matches the `renderCourseFacts(course, {...})` call
  and asserts `includeStudentData: true` is present exactly once. Does not
  read the `SUGGESTIONS` array at all; unaffected by chip text.
- `modalAdoption.wiring.test.ts:62` - lists `AskAiModal.tsx` as a known
  "wave-2 adopter" of the shared modal-dismiss mechanism, cross-checked
  against a directory scan (`modalAdoptionScan.ts`) that classifies files by
  whether they import `ModalShell`/the dismiss hook, not by suggestion-chip
  content. Unaffected by chip text.
- `src/loop-docs.structure.test.ts:190-194` - reads `docs/loop/leverage.md`
  (not `AskAiModal.tsx`) and asserts that document's negative-example section
  still mentions the literal string `"AskAiModal.tsx"`. Unrelated to this
  row's write set; not re-run by the wave below since neither file it touches
  is `leverage.md`.

**What CAN be asserted, once an implementer wave lands the string changes:**

- That the chip strings ARE the proposed replacements - a source-text read of
  `AskAiModal.tsx:16-29` (the same technique `llm-content.test.ts:432-447`
  already uses via `readFileSync` + regex against the `SUGGESTIONS` block).
- That the fact families named in section 2 ARE emitted by
  `renderCourseFacts` - already true today, confirmed by direct read of
  `course-facts.ts` in section 1; no new test is required to prove existence,
  since the emitters are unchanged by this row.
- That `llm-content.test.ts`'s `AC-REACH-1` and `course-facts.test.ts`'s
  `AC-REACH-1` both still pass post-edit - re-run after the wave to confirm,
  not assumed (wave gate, section 7).
- That none of the three new strings collides with
  `ASK_AI_CLOSED_LIST_QUESTIONS` - checked in section 2 by reading all 16
  entries directly; an implementer wave should re-check this against the
  exact final strings it ships, since a copy-edit pass could still land on a
  near-miss.

**What CANNOT be asserted here, and must route to the owner:**

- Whether a given chip's MODEL ANSWER actually uses the named fact family.
  This is the core claim of section 2 and it is a reading/design claim, not
  an executed one - no test here calls a real model, and no test renders the
  modal to click a chip. Routed to the owner as RES-A4-1 (section 8).
- Whether the new chip text reads naturally in the actual UI (wrapping,
  button sizing, the `styles.linkButton` class at `AskAiModal.tsx:108`) -
  a reading claim only, since no component is rendered. Routed to the owner
  as RES-A4-2.

## 7. Wave plan

One wave. The change is a three-string edit inside a single 152-line file;
splitting it would not reduce risk and would violate file-set disjointness
for no benefit.

**Wave 1 - re-point the three chips**

- Write set: `src/app/components/courses/AskAiModal.tsx` only (the file that
  both holds and renders the strings, per section 5 - satisfies the
  render-file requirement trivially since they are the same file).
- Change: replace the three chip strings at `:18`, `:19`, `:20` with the
  section 2 replacements, byte-for-byte. Leave `:17`, `:21-27` (the pinning
  comment), and `:28` untouched.
- Gate: `npx tsc --noEmit` (sole caller per wave, per
  `docs/loop/this-repo.md` section 2's tsc concurrency rule), `npm run lint`,
  then, because three test files (excluding `loop-docs.structure.test.ts`,
  which reads a different document and is unaffected - section 6) exercise
  this file:
  `npm run test:paths -- src/app/actions/llm-content.test.ts src/lib/course-facts.test.ts src/app/components/ui/modalAdoption.wiring.test.ts`
  (per-argument `COVERED`/`NOT COVERED` lines required, per
  `docs/loop/this-repo.md` section 1 - a bare multi-path `vitest run` is
  forbidden here because it silently drops an unmatched argument and still
  exits 0).
- `git status --short` must show exactly `AskAiModal.tsx` modified and
  nothing else, checked against this assignment before the wave is
  considered done (per `docs/DEV_LOOP.md`, "Gate the wave on the tree").

No second wave. There is no data-shape change, no new persisted key, no new
exported function, and no other call site to update - `course-facts.ts` and
`llm-content.ts` are read-only inputs to this row, not part of its write set.

## 8. Residual register

| ID | What is not proven now | Owner | Instrument | Step |
|---|---|---|---|---|
| RES-A4-1 | Whether each re-pointed chip's actual model answer draws on the named fact family (roster / weekly checklist / grades-due date) rather than falling back to general teaching practice | Repo owner, in a real browser with a configured model provider | Open Ask AI on a course with all three gated fields set (roster text, at least one weekly-checklist item, a grades-due date), click each of the three re-pointed chips, and read whether the answer references the actual recorded values (a specific headcount or name from the roster, an actual checklist item, or the actual computed day count) rather than generic advice | Owner verification pass, after wave 1 lands, before this row is marked closed |
| RES-A4-2 | Whether the new chip text reads naturally in the rendered modal (wrapping inside `styles.linkButton`, three now-longer strings next to two shorter ones) | Repo owner, in a real browser | Open Ask AI and visually inspect the suggestion row for awkward wrapping or truncation | Same owner verification pass as RES-A4-1 |
| RES-A4-3 | The grounding sentence (`AskAiModal.tsx:99-102`) is verified true for the five curated chips (section 4) but is not bounded to them - it also covers arbitrary free-typed questions, for which it can be literally false (e.g. an off-topic question). This condition predates this row and DECISION 12 did not ask to narrow the sentence's audience | Repo owner (product decision: leave as-is, since it is a pre-existing condition, or file a new row to scope the sentence down to "the suggestions below" rather than every question) | A future scoping pass re-reading `AskAiModal.tsx:98-102` against DECISION 12's binding rule (a sentence may assert only what holds on every caller and every reachable state) | Not scheduled; recorded so a later reader does not mistake this row as having settled it |
| RES-A4-4 | The three re-pointed chips remain answered via a live model call (no `computeDeterministicScheduleAnswer`-style guarantee), so their grounding is enforced by prompt wording (`llm-content.ts:897-899`) rather than by code that cannot do otherwise - weaker than the GUARANTEED class in `docs/loop/leverage.md` | Repo owner (product decision: is a stronger, code-enforced grounding worth building for these three, e.g. a receipt check comparing the answer against the relevant fact block the way `course-intel/ask` does) | A future architecture pass against `docs/loop/leverage.md`'s GUARANTEED class if the owner wants it | Not scheduled; out of scope for DECISION 12, which asked only to re-point the chip text |

## 9. Gate run for this document

`npm run test:paths -- src/lib/no-emojis.test.ts src/source-bytes.structure.test.ts`
was run from the repo root after writing this file; both tests scan `docs/`
as well as `src/` (`no-emojis.test.ts:254` walks `["src", "docs"]`;
`source-bytes.structure.test.ts:48-69` walks `process.cwd()`, `docs` is not
in its `SKIP_DIRS` set at `:49`), so this file is covered. Exit code and
`git status --short` are reported in the chat turn that delivers this
document, read from the actual command output rather than assumed.
