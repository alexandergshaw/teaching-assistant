# Answers woven into the reply - acceptance criteria

Owner's ask, verbatim (2026-09-04): "when a question is identified in a
discussion board post, it should be integrated naturally into the drafted
reply."

Revision 2. Revision 1 was reviewed by an architect pass, a UX pass, a data
pass and an adversarial sabotage check; all four are folded in here and the
design changed in three material ways as a result (Insert is deleted, the
locator has no fuzzy path, "Show in reply" is dropped). Section 9 records
what each pass overturned so the reasoning is not re-litigated.

## 0. What this reverses, and why that is fine

`docs/post-questions-acceptance-criteria.md` section 1 argued for the
opposite and wrote the argument into the prompt itself
(`discussion-reply-prompt.ts:729`): the reply "must not reproduce an answer
written in `questions`", because on a discussion board an instructor may
deliberately leave a question for peers. That reasoning is not wrong; the
owner has now decided the default the other way.

The escape hatch is an EDIT, not a control: an instructor who does not want
an answer in the reply deletes those sentences. Revision 1 claimed this was
"exactly the pre-existing separate-answer workflow, Insert button and all".
The sabotage check proved that false, and the correction is section 2's D5.

## 1. What this feature is

A drafted reply now ANSWERS the questions the post asks, inside its own
prose, where its own argument reaches them. No trailing block, no "You asked
whether ...", no label.

The per-row questions list stops being where the answer LIVES and becomes
the RECEIPT for it - the answer to "did it see my student's second
question?", which is the only question a count could not answer. Per item:

- **In the reply** - the answer's words are in the reply text. One line:
  badges, the question, Remove. Nothing else, because everything else is
  six lines above in the reply box.
- **Not in the reply** - the model's answer is not present (it drifted, or
  the instructor edited those sentences out). Renders the answer text and a
  Copy control.
- **Needs you** - answering needs a course fact the model cannot know. The
  note names the fact. Orthogonal to the two states above, not a third one:
  an item may carry a partial answer AND a gap, and both must show.

Zero clicks is the designed path, and it is the measured one: two questions
accepted as drafted costs 2 clicks today and 0 after.

## 2. Decisions (do not re-open)

- **D1. No new setting.** `answerQuestions` keeps its name, its persisted key
  (`ta-rec-disc-answer-questions`), its default (on) and its place in the arm
  signature. Only where the answer lands changes.
- **D2. `PostQuestion` gains no field, stored or derived.** State is computed
  from the live reply text at render - the discipline
  `replyAlreadyHasResource` already states (`discussion-reply-insert.ts:36-58`).
  A stored flag drifts the moment the instructor edits, and surviving an edit
  is this feature's whole job.
- **D3. One predicate.** `replyContainsAnswer` (section 3, A1) is the only
  implementation of "is this answer in this reply". Nothing else compares
  answer text.
- **D4. `answer` changes meaning, not type.** Still `string`; now the words
  OF THE REPLY that answer the question, copied exactly. Parser, coercer,
  serializer and every log field keep working unchanged.
- **D5. Insert is DELETED, end to end.** Not kept as a fallback.
  `appendAnswerToReply` appends the answer as a trailing paragraph, and its
  own header says it needs no "Q:"/"A:" prefix *because* the prompt forces
  every answer to stand alone as a paragraph (`discussion-reply-insert.ts:68-70`,
  citing `discussion-reply-prompt.ts:726`). This feature deletes that rule.
  An `answer` that is now mid-flow reply prose ("It does, but only because
  the outer loop is re-entered before the inner one drains.") appended after
  the reply's own mandated closing question (`:524`) is a dangling fragment
  answering nothing. Every path that could fire it produces that, so the
  path goes: `appendAnswerToReply`, `replyAlreadyHasAnswer`, `insertAnswer`,
  `handleInsertAnswerForRow`, the prop chain through panel/table/row, the
  block's Insert button, `insertAnswerAriaLabel`,
  `insertedAnswerAnnouncement`, and their tests. Copy is the escape hatch.
- **D6. No fuzzy matching, ever.** A false "In the reply" tells the
  instructor the reply answers a question it does not, and they post it. A
  false "Not in the reply" only costs the item its one-line form. The
  predicate errs toward the second on purpose.
- **D7. No locate control.** "Show in reply" is dropped - see 9c.

## 3. Wire contract

### A1. The locator - DONE, landed ahead of the groups

`src/lib/discussion-answer-location.ts` + `.test.ts`, already written and
green (20 cases). Pure, dependency-free, zero repo imports.

```ts
export const MIN_LOCATABLE_ANSWER_CHARS = 12;
export function replyContainsAnswer(reply: string, answer: string): boolean;
```

Three attempts, each EXACT containment in a normalised projection
(case-folded; zero-width characters dropped; curly quotes, dashes and U+2026
folded to ASCII; whitespace runs collapsed - deleting no word):

1. the whole answer;
2. the whole answer minus a trailing truncation marker
   (`normalizePostQuestionAnswer` truncates at `MAX_ANSWER_CHARS` and appends
   a literal `...` the reply never contains);
3. every sentence of the answer, in order, with other reply text allowed
   between them - which covers a model that answers one question in two
   places, and one that elides the middle of its own quotation. Order is
   enforced; a segment sheds a trailing ellipsis, and only the last sheds a
   single period, subject to a 4-character floor so a short segment cannot
   match inside a longer word. VERIFY PASS: the matched sentences must also
   fall within `MAX_SPLIT_ANSWER_SPREAD` (3x) of the answer's own length -
   without a bound, two sentences arbitrarily far apart in a long reply, on
   unrelated subjects, satisfied it and the badge claimed an answer the
   reply never joins up.

Read but deliberately NOT reused: `normalizeForMatch`
(`discussion-capture.ts:233-240`). It maps every non-`[a-z0-9 ]` character to
a space, so `"due on 3/14"` equals `"due on 3 14"` to it - far too loose for
a badge claiming the reply literally contains these words; its output is
frozen by `discussion-capture.dedupe.test.ts:32-46` and consumed by seven
modules; and `discussion-capture.ts` imports `@/lib/upload-budget`, so
importing it from `src/lib` would invert the repo's lib -> app direction.
The new file's header records all three.

### A2. The prompt (`buildReplyDraftingPrompt`) - GROUP B

Only the `composition.answerQuestions === true` branch changes. With the flag
OFF the prompt stays byte-identical, which is pinned
(`discussion-reply-prompt.questions.test.ts:513-516` against the frozen
baselines in `discussion-reply-prompt.test.ts:363-367`).

- The listing rules (what counts as asked / implied / what to skip) are
  UNCHANGED.
- The answering rule is rewritten: the reply itself answers each listed
  question, in its own voice and flow, where its argument reaches the point.
  Never appended at the end, never introduced by restating the question,
  never labelled.
- **Register-compatible, and unconditionally so.** The peers register says
  "do not explain the underlying concepts back to them" (`:530`). The new
  rule must be written so it does not contradict that in either register -
  phrase it as answering *in the register already being written*, giving
  your reading of the point rather than a tutorial. Do NOT add an audience
  branch: `questions.test.ts:604` pins this block as structural and
  audience-blind, and that test should stay honest rather than be updated.
- The old separation line (`:729`, "must not reproduce an answer written in
  `questions`") is replaced by its inverse: what goes in `answer` must be
  text that appears in the reply. **Keep its second clause** - "If the reply
  mentions a question, it does not say whether, where or by whom it will be
  answered" - which otherwise re-admits "I'll come back to that below" in a
  reply that has no below.
- **The sentence rule is ONE line, made conditional** - not restated in the
  questions block. `:760` (`"- 3 to 6 sentences. Plain prose."`) becomes a
  ternary on `answerQuestions` whose OFF arm emits that exact string, so the
  frozen baselines are untouched. ON: 3 to 6 sentences, up to 10 when it is
  answering questions the post asks, **and the ceiling wins** - if 10 is not
  enough room, answer each question more briefly rather than writing an
  eleventh. (Data pass: at `MAX_POST_QUESTIONS` = 3 the "+2 per question"
  allowance and the ceiling collide, and the model must be told which
  loses.) Putting this in `questionsBlock` instead would leave two different
  sentence counts in one prompt with the stricter one first.
- `needsYou` rules UNCHANGED, including `:727`'s "give `needsYou` alongside
  an `answer` only when the answer is partial". Add one clause about the
  REPLY: where a question needs a fact not in the material shown, the reply
  writes around it as `:769` already requires - it does not answer that
  question, invent the fact, or promise to check.
- The output-shape line keeps its keys and its within-element order (reply,
  concepts, questions). `answer` is redescribed as the words from the reply
  that answer it, copied exactly.
- `:803`'s paragraph-break rule is UNCHANGED and deliberately so; note it in
  the comment, since a longer reply changes its effect without the line
  being edited.

### A3. Parsing (`parsePostQuestions`) - UNCHANGED, no group owns it

### A4. The block (`DiscussionReplyQuestions.tsx`) - GROUP C

Props after this change - this list is the contract that lets C and D work
concurrently; neither may deviate from it:

```ts
authorName: string;
questions: PostQuestion[] | undefined;
reply: string;              // NEW - the row's live reply text
onRemoveQuestion: (question: string) => void;
focusReplyInput: () => void;
announce: (text: string) => void;
onCopyError: (text: string) => void;
```

`onInsertAnswer` is GONE (D5). Per item, `const inReply = item.answer !== ""
&& replyContainsAnswer(reply, item.answer)`:

| | `answer` present, `inReply` | `answer` present, not `inReply` | `answer` empty |
| --- | --- | --- | --- |
| state badge | `In the reply` | `Not in the reply` | none |
| answer text | not rendered | rendered (`panelStyles.answerText`) | n/a |
| Copy | no | yes | no |

and, independently of that column, **`needsYou` renders whenever it is
non-empty** - its `Needs you` badge and its `styles.fieldHint` note line,
exactly as today (`:236-241`). An item may show `In the reply` and
`Needs you` together; that combination is legal, the prompt produces it, and
dropping it would hide the one thing only the instructor can supply.

- Badge labels extend `QUESTION_BADGE_LABELS` (`discussion-post-questions.ts:33-37`),
  never a second table: `In the reply`, `Not in the reply`, plus the existing
  `Needs you`, `Asked`, `Implied`.
- Tone: `In the reply` and `Not in the reply` are BOTH neutral
  (`styles.ghBadge` + `styles.ghBadgeNeutral`) - hand-deleting an answer is a
  supported workflow and must not be badged as a problem. `Needs you` keeps
  `styles.ghBadgeWarning`, the one warning here. Never `ghBadgeDanger`,
  never `ghBadgeAccent`, never `replyErrorText`.
- Remove is rendered in EVERY state, keeping one stable tab stop per item as
  the derivation flips under a typing user. Its accessible name changes one
  word - `Remove the question "X" from the list for the reply to Y` - since
  removal has never touched reply text and in the `In the reply` state the
  old wording implies it does.
- Copy keeps copying `item.answer` and is rendered ONLY where that is
  non-empty and not in the reply. The needs-you note is not clipboard
  material and gets no control.
- No `aria-live` on the badge or the item: a status that flips per keystroke
  inside a live region babbles. The panel's polite region stays tied to
  explicit clicks.
- `memo()` is kept. Perf is a non-issue - measured at 0.27 ms per keystroke
  for 3 items against a 1,346-char reply, ~3,800 keystrokes/sec before one
  frame budget - so NO `useDeferredValue`, no debounce, and no per-item
  `useMemo` (which cannot legally be called inside `questions.map`).
- The block loses its Insert button, `handleInsert`, and the
  pending-focus-fallback intent that existed for it. Keep the keyed-ref /
  pending-focus / deps-less `useLayoutEffect` idiom for REMOVE.

### A5. The un-wiring (GROUP D)

Delete the Insert path from every file it threads through, changing nothing
else: `discussion-reply-insert.ts` (+ its test: delete the
`appendAnswerToReply` / `replyAlreadyHasAnswer` describes; the resource
functions and their tests stay), `useDiscussionReplies.ts` (`insertAnswer`,
its return-object entry and doc comment), `useDiscussionReplyFiltering.ts`
(the arg and `handleInsertAnswerForRow`), `DiscussionRepliesPanel.tsx`,
`DiscussionReplyTable.tsx`, `DiscussionReplyRow.tsx` (the prop,
`handleInsertAnswer`, and pass `reply={row.reply}` to the block instead),
`discussion-post-questions.ts` is GROUP C's, not D's.
`postQuestions.wiring.test.ts` and `useDiscussionReplies.wiring.test.ts`
update here. `discussion-draft-loop.ts:153` also carries `insertAnswer` in a
type - that line belongs to GROUP E, which removes it.

### A6. The control (`DiscussionReplyControls.tsx`) - GROUP C

Label: `Answer the questions in each post` - today's string minus the word
"Draft". NOT "... inside the reply": with the flag off no questions are
returned at all, so a label ending "inside the reply" makes OFF read as
"answer them somewhere else", which is false. Hint
(`ANSWER_QUESTIONS_HINT_ID`): `The reply answers what the post asks or
implies, in its own words. The list under the reply says which questions it
answered; a question that needs a course fact only you have is flagged
instead.` Deliberately says "which questions it answered", never "every
question the post asks" - the list holds only what the model found, and the
copy must not promise coverage.

### A7. The run log and the loop (GROUP E)

- `DiscussionRepliesLogDraft` gains `questionsAnsweredInReply: number`,
  placed IMMEDIATELY after `questionsReturned` (`discussion-replies-log.ts:200`)
  so the CSV's trailing columns keep their positions and
  `discussion-replies-log.test.ts:870-872`'s `endsWith(",,,")` still holds.
  Computed at RECEIVE time from the drafted reply with `replyContainsAnswer`.
  The frozen header (`:731`) and whole-file CSV fixture (`:583-618`) are
  updated by ADDING the column, never by loosening the assertion.
- Column label says **located in the reply**, not "answered" - it inherits
  the predicate's miss rate and must not overclaim.
- NO per-question `answeredInReply` on the row entry: it would be recomputed
  on every keystroke through `useDiscussionRepliesRunLog`'s `rawRows` memo,
  and it would answer a different question at a different time from the
  draft-time number, with no label to separate them.
- **Questions travel with the reply they were drafted for.** `answer` now
  quotes one particular draft, so any path that REPLACES the reply must
  replace or clear the questions: `discussion-draft-loop.ts:829` passes
  `undefined` (meaning "leave them alone") when `answerQuestions` is off -
  it must pass `[]`. Both files' comments claiming "questions describe the
  POST, which this edit did not change" (`useReplyRows.ts:690-696`,
  `discussion-draft-loop.ts:818-822`) were true and are now false; change
  them, with the reason.
- **CORRECTED BY THE VERIFY PASS: `resolveEditedDuringDispatch` must NOT
  clear them.** Revision 2 said it should, and that was wrong. That path
  replaces nothing - it writes the row's OWN current text back over itself
  because the model's reply is being discarded and never reaches the row.
  The questions on the row at that moment were written by an earlier
  `applyReply` together with the text still in the box, so they belong to
  it. Clearing there deleted a row's entire question list - including the
  only copy of any answer not located in the reply - because the instructor
  typed while a redraft was in flight, and it treated `questions` and
  `concepts` oppositely on a path where neither input changed. It passes
  `undefined`.

### A8. The truncation recovery (GROUP F)

Caused by this change, so fixed with it. `parseLenientJsonArray`
(`src/lib/lenient-json.ts:11-15`) slices from the first `[` to the LAST `]`;
on a truncated response that last bracket is an inner array's
(`concepts`/`questions`), so the slice ends inside a previous element, and
the element walk-back (`:64-86`) scans for `}` with no depth tracking and
returns null - discarding complete elements that were present. Measured over
every cut position: today 11.4% of truncations lose the whole batch; under
this change 18.2%, and all 1,721 new cut positions are adverse (the added
characters live inside `reply`, exactly where no `]` has been emitted yet).

The fix must be strictly ADDITIVE: when today's path returns a non-null
result, return it byte-identically; only when it returns null may a
depth-tracked recovery run. **And OPT-IN** (verify pass): the parser has 18
call sites, and turning null into a partial array for all of them would
silently change every caller that reads null as "this batch failed, retry
it". `recoverTruncatedElements` defaults false; `discussion-replies.ts`'s
drafting call is the only opt-in, because its elements are independent
per-post drafts where a partial batch beats losing every reply in it.
Two further verify-pass rules: the recovered slice is tried UNREPAIRED
first (the depth scan is string-aware, so its slice is usually already valid
JSON, and the unquoted-key repair rewrites `, though:` inside a string value
and breaks it - failing the exact input the recovery exists for); and the
smart-quote repair step at `:43` is a documented no-op that must stay one -
making it live would rewrite curly quotes inside drafted reply text. Freeze an oracle of today's resolved output over
a corpus of cut positions BEFORE changing anything, prove the oracle catches
a deliberate break, and only then add the branch. Truncation is not
reachable at realistic volumes (measured headroom ~5,300 tokens against
`maxOutputTokens: 8192`), so this is insurance, not a live bug.

## 4. Groups - disjoint, every file in exactly one

**A (DONE, landed):** `src/lib/discussion-answer-location.ts` + `.test.ts`.

**B - prompt:** `src/lib/discussion-reply-prompt.ts`,
`src/lib/discussion-reply-prompt.questions.test.ts`.
`src/lib/discussion-reply-prompt.test.ts` must stay byte-untouched.

**C - the block and the copy:** `DiscussionReplyQuestions.tsx`,
`discussion-post-questions.ts` + `.test.ts`, `DiscussionReplyControls.tsx`,
`DiscussionRepliesPanel.module.css` (only if a class is genuinely needed).

**D - the un-wiring:** `discussion-reply-insert.ts` + `.test.ts`,
`useDiscussionReplies.ts`, `useDiscussionReplyFiltering.ts`,
`DiscussionRepliesPanel.tsx`, `DiscussionReplyTable.tsx`,
`DiscussionReplyRow.tsx`, `postQuestions.wiring.test.ts`,
`useDiscussionReplies.wiring.test.ts`.

**E - log and loop:** `discussion-replies-log.ts` + `.test.ts`
(+ a `discussion-replies-log.questions.test.ts` sibling if the additions
push that 930-line file past ~975), `discussion-draft-loop.ts` + `.test.ts`
+ `.questions.test.ts`, `useReplyRows.ts` (comment only).

**F - truncation:** `src/lib/lenient-json.ts` + its test.

Contended and resolved: `discussion-post-questions.ts` is C's alone (D
deletes its callers, C deletes the two now-unused builders);
`discussion-draft-loop.ts` is E's alone (D leaves its `insertAnswer` type
line to E).

## 5. File size (measured, ceiling 1000)

`DiscussionReplyRow.tsx` 952 and `useReplyRows.ts` 947 are the pressure
points. This change is net-negative for the row (Insert plumbing out, one
prop in), so no pre-split is needed - but GROUP D must measure with
`@(Get-Content <f>).Count` after its edit and report the number. If the row
lands above 960, extract the overflow `Menu` and its four handlers
(`:276-277`, `:415-463`, `:719-774`) to `DiscussionReplyRowMenu.tsx` in the
same group. `discussion-replies-log.test.ts` at 930 is E's watch-list.

## 6. Tests

- Locator: done, 20 cases including two that only normalisation can pass and
  four negatives that a fuzzy matcher would fail.
- Prompt (B): OFF byte-identity holds (existing); ON contains the
  integration rule and NOT `"must not reproduce"`; ON keeps the
  no-forward-promise clause; the sentence ternary's OFF arm is the exact old
  string; block order unchanged.
- Block/copy (C): the three badge labels; the new Remove aria wording; the
  state table as a pure function if one is extracted; that `In the reply`
  renders no Copy and no answer text; that `needsYou` renders alongside
  `In the reply`.
- Un-wiring (D): `postQuestions.wiring.test.ts` asserts the row passes
  `reply={` to the block - without it, `reply=""` would make every item read
  "Not in the reply" with every gate green - and asserts no file still
  references `onInsertAnswer`.
- Log/loop (E): `questionsAnsweredInReply` against a fixture pair; the
  OFF-redraft path clears questions rather than keeping them.
- Truncation (F): the frozen oracle, plus a case that fails before the fix
  and passes after.

## 7. Limits (carry into the REGRESSION entry verbatim)

1. Every row persisted before this ships holds an `answer` written under the
   old rule as a standalone paragraph deliberately ABSENT from the reply, so
   on first render after deploy all of them show "Not in the reply" with
   their answer text and a Copy control. Behaviour is correct and the copy
   accuses nobody, but it is not "nothing visible changes".
2. Output grows +38% per batch at 2 questions/post and SHRINKS 19% at 3 (the
   reply's sentence ceiling caps what `answer` can quote). Prompt cost is
   +199 chars.
3. A question routed to `needsYou` is one the reply does not answer, so the
   posted reply can read as if it ignored the student's main question. The
   note names exactly what to add; the app cannot add it.
4. The predicate is exact-only. A light edit inside an answered span, a
   model paraphrase instead of a quote, or an inserted connective flips the
   item to "Not in the reply" while the answer is substantially still there.
   That is the chosen error direction (D6), not a defect.
5. The docs/post-questions AC's section 4 prompt-growth figure (+1,367
   chars) is not reproducible against HEAD; the measured ON-vs-OFF cost is
   +2,360 chars. Recorded here rather than by editing that shipped doc.

## 8. What each pass overturned (do not re-litigate)

- **a. Insert kept as a fallback -> deleted (sabotage).** Its safety rested
  on the standalone-paragraph rule this feature removes; see D5.
- **b. 8-significant-word prefix fallback -> removed (sabotage + data).** It
  would badge a drifted answer as "In the reply" while the code silently
  refused to offer it; the data pass also showed the phrase reading is
  ambiguous three ways and that two of the three readings admit a false
  positive. The measured cost of dropping it is that some true positives
  land in "Not in the reply", which is the benign direction.
- **c. "Show in reply" -> dropped (UX).** The textarea has no internal
  scroll (`minRows={6}`, no `maxRows`, so `TextareaAutosize` never
  overflows), so the scroll objection was wrong - but the control hands back
  a focused textarea with the answer SELECTED, and the next keystroke
  replaces it, with no reliable undo in a React-controlled MUI textarea.
- **d. A three-state table -> two states plus an orthogonal `needsYou`
  (sabotage).** Both-fields-set is legal and the prompt produces it.
- **e. Widening the sentence rule inside `questionsBlock` -> one ternary on
  the existing line (sabotage + architect).** Otherwise the prompt states
  two different sentence counts, the stricter one first.
- **f. `useDeferredValue` / per-item `useMemo` -> neither (data + architect).**
  Measured at 0.27 ms/keystroke; the per-item `useMemo` the first revision
  asked for is an illegal hook inside `.map`.
- **g. Per-question `answeredInReply` in the log -> a draft-time count
  instead (architect).** Two numbers computed at two times with one name is
  how a diagnostic log starts lying.
