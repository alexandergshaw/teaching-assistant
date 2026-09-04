# Answers to the questions in each post - acceptance criteria

Owner request 2026-09-04: "i need another output to the discussion board
screen reader to be answering questions (explicit or implicit) within the
original posts."

Revision 2, 2026-09-04, written against HEAD a6c7674. Revision 1 was the
survey and the first contract; revision 2 reconciles five concurrent passes
run against it (an adversarial sabotage check, architect, UX, data engineer,
aesthetics). Where two passes disagreed the disagreement is recorded in
section 5 with the decision. Every file:line below is against a6c7674.

Implementers: read the WHOLE document. Sections 2-4 are the contract; section
6 is the disjoint split; section 7 lists every existing test that changes
and how. Nothing in here is advice.

---

## 0. What exists today (surveyed, cited)

The Discussion replies sub-tab (Manual > Recording > Discussion replies)
records the screen, reads posts off the frames
(`extractDiscussionPostsAction`, `src/app/actions/discussion-replies.ts:166`),
merges them into `ReplyRow`s (`discussion-serialization.ts:66-121`), and
drafts ONE reply per post through `draftDiscussionRepliesAction` (`:258-404`)
using `buildReplyDraftingPrompt` (`src/lib/discussion-reply-prompt.ts:471-577`).
The drafting call already returns a second, non-reply output per post:
`concepts` (RC1/RC2, `:562-564`), parsed leniently by `parseReplyConcepts`
(`:93-135`) and stored on the row (`ReplyRow.concepts`,
`discussion-serialization.ts:112`) via `applyReply`'s optional 4th parameter
(`useReplyRows.ts:733-760`). A per-row output block already exists beneath
the reply: `DiscussionReplyResources.tsx` (chips, "Search for resources", the
`<ul>` of links, per-link Insert / Remove). Insert is a MOVE
(`useDiscussionReplies.ts:673-681`): `appendResourceToReply` +
`replyAlreadyHasResource` (`discussion-reply-insert.ts:30,56`) write the text
through `editReply`, then `removeResource` drops the suggestion.

The two outputs a row has today are the reply (with its concept terms) and
the resources. **Nothing today identifies or answers a question a student
asked.** The students-register stance (`discussion-reply-prompt.ts:321-327`)
says "Add one substantive thing: an idea they did not raise, a correction if
something is wrong, or a concrete example" - a question in the post may or
may not get answered inside the reply, and if it does the instructor cannot
separate the answer from the rest. The sibling Message replies tool has an
`"answer"` INGREDIENT (`src/lib/message-reply-prompt.ts:40,232-233`) that
folds the answer INTO the reply; that is the opposite of what is asked for
here ("another output").

Settings that govern drafting live in `ReplyCompositionSettings`
(`discussion-reply-prompt.ts:216-226`: `ingredients`, `addressByName`,
`formality`), persisted by `discussion-persisted-controls.ts:150-162` under
`ta-rec-disc-ingredients` / `ta-rec-disc-address-name` /
`ta-rec-disc-formality`, coerced by `coerceReplyComposition`
(`discussion-draft-loop.ts:322-360`, three positional `string | null`
params) on the client and `coerceCompositionAtBoundary`
(`discussion-replies.ts:92-117`) on the server, threaded via
`compositionRef` (`useDiscussionReplies.ts:288-291`) into `runDraftLoop`
(`discussion-draft-loop.ts:557,613`), folded into the "Redraft every reply"
arming signature (`DraftingArmSignatureArgs` `discussion-capture.ts:763-781`,
`draftingArmSignature` `:793-795`, fed at `DiscussionRepliesPanel.tsx:424-431`)
and into the run log's settings (`useDiscussionRepliesRunLog.ts:79-81`,
`DiscussionRepliesLogInput`, `discussion-replies-log.ts:214-228`). The
control cluster is `DiscussionReplyControls.tsx` (select + checkbox +
slider), mounted by `DiscussionCaptureSettings.tsx:171`.

The run log records extraction batches, notices and retries, and NO drafting
events at all (`useDiscussionReplies.ts:437-438` is the only `logBatch`
site) - every drafting-side fact in today's log is inferred from live rows
at download time. Its per-row entry (`discussion-replies-log.ts:187-204`)
carries no post text and no reply text; its only content field,
`resourceQuery`, is post text AFTER `redactAuthorNameFromText`.

Line counts (the 1000-line ceiling, `recording-split.structure.test.ts`,
counted with `countLines` = PowerShell `@(Get-Content).Count`; all files end
in a newline so `wc -l` agrees): `DiscussionReplyRow.tsx` 914,
`DiscussionRepliesPanel.tsx` 913, `useReplyRows.ts` 880,
`useDiscussionReplies.ts` 870, `src/lib/discussion-reply-prompt.test.ts` 842,
`discussion-draft-loop.ts` 703, `discussion-replies.ts` (actions) 738,
`discussion-reply-prompt.ts` 577, `discussion-serialization.ts` 461,
`discussion-replies-log.ts` 583.

The localStorage key canary (`recording-split.structure.test.ts:355-369`)
lists every `ta-rec-disc-*` key literally; `:462-503` requires each to be
both read and written somewhere in the recording folder's source, and
`:508` pins the COUNT of keys found by that regex scan (`toHaveLength(15)`).

## 1. What this feature is

A THIRD per-row output: **the questions the post asks, each with an answer.**

- "Asked": the post asks it outright - a sentence ending in a question mark,
  or a direct request ("can someone explain...", "I'd like to know...").
- "Implied": the post does not ask, but a competent instructor would hear a
  question - a stated confusion ("I still don't see why the loop runs
  twice"), a wrong assumption stated as fact ("since Python passes by
  reference..."), or something the writer says they could not work out. The
  model phrases it as the question the writer would have asked.

Each question carries an answer written TO THE STUDENT, standing on its own
as a paragraph - OR, when answering would require a course fact the model
cannot know (a due date, a policy, what a reading or the assignment says, a
grade), a one-sentence "needs you" note written TO THE INSTRUCTOR naming the
fact to supply. An item may carry both (a partial answer plus the gap). This
mirrors the drafting prompt's standing rule (`discussion-reply-prompt.ts:536`:
never state a course fact not written in the posts shown) - the rule is
extended to the new output, not relaxed.

Why a SEPARATE output rather than folding the answer into the reply (the
Message tool's approach): on a discussion board the instructor often chooses
NOT to answer a student's question in the thread - leaving it for peers is
a deliberate pedagogical move, and answering privately is another. The
separate output gives that choice per question: one click inserts the answer
into the reply, one click copies it to use elsewhere, zero clicks leaves it
(an item never reaches the clipboard unless inserted), one optional click
dismisses it. The reply stays a reply.

One setting, ON by default, produced in the SAME drafting call as the reply
(no second model pass, no second queue, no new state machine). The measured
cost of that choice is in section 4c and in Limits.

## 2. Wire contract

### Q1. The type (leaf: `src/lib/discussion-reply-prompt.ts`)

```ts
export interface PostQuestion {
  question: string;   // as asked, or the implied question as the model phrased it
  implied: boolean;   // false = asked outright, true = read between the lines
  answer: string;     // "" exactly when only needsYou is set; written to the student
  needsYou?: string;  // one sentence naming the fact only the instructor can supply
}
```

Invariant: `answer !== "" || (needsYou !== undefined && needsYou !== "")`.
An item satisfying neither is dropped at parse time (Q3). Both present is
legal: an answer that stands alone plus a `needsYou` naming the gap, e.g.
answer "In a history essay you are always free to argue against a source, as
long as you engage its evidence and give your own." with needsYou "Whether
this essay requires the textbook's court-packing framing." The answer never
contains instructor-facing text ("you will need to confirm...") - that goes
in `needsYou`, which is never shown to a student.

`PostQuestion` is imported ONLY from `@/lib/discussion-reply-prompt`,
type-only in client files. It is NOT re-exported from
`discussion-serialization.ts` or `discussion-capture.ts` (one type, one
path - the "one set restated in four modules" lesson at
`discussion-reply-prompt.ts:156-157`). The leaf keeps ZERO repo imports
(`:3-4`); after Group A lands, `grep -n "^import" src/lib/discussion-reply-prompt.ts`
still returns nothing.

`ReplyCompositionSettings` gains a fourth field, REQUIRED (not optional - a
caller that forgets it must fail to compile, not silently read as OFF):

```ts
export interface ReplyCompositionSettings {
  ingredients: readonly ReplyIngredient[];
  addressByName: boolean;
  formality: ReplyFormality;
  answerQuestions: boolean;   // NEW
}
export const DEFAULT_REPLY_COMPOSITION = { ..., answerQuestions: true };
```

Default ON - not inert, the same C4b-i decision the composition controls
took. The first capture after this ships produces the new output with no
action taken. That is the request.

Two exported helpers also live in the leaf, beside `deriveResourceConcept`:

```ts
export function truncateWithMarker(text: string, max: number, marker = "..."): string
export function postQuestionKey(question: string): string
```

`truncateWithMarker`: returns `text` unchanged when `text.length <= max`;
otherwise `text.slice(0, max)`, cut back to the last space when one exists
past index 0 (the `deriveResourceConcept` rule `:62-64`), then `marker`
appended. Three ASCII periods, never U+2026. Used by Q3 (answer, needsYou,
question), by the log (nothing) and by Group C's aria clamp (Q11) - one
implementation, not four restatements.

`postQuestionKey`: the dedupe identity - lowercase, whitespace collapsed to
single spaces, trimmed, surrounding straight or curly double quotes stripped,
trailing `?`, `.`, `!` characters stripped. `"Why does the loop run twice?"`,
`why does the loop run twice` and `"\"Why does the loop run twice?\""` all
share one key. Used by Q3 and Q6.

### Q2. The prompt (`buildReplyDraftingPrompt`)

Emitted ONLY when `composition.answerQuestions === true`. With it `false`
the returned prompt is BYTE-IDENTICAL to today's for the same other inputs.
`grep answerQuestions src/lib/discussion-reply-prompt.ts` finds it in the
type, the default, and exactly the THREE conditionals below - nowhere else in
the builder. Three, not two: (b) specifies both a ternary on the existing
element-shape line AND a new explanatory element, and each needs its own
gate.

(a) A new array element immediately after `greetingNamesBlock` (`:548`) and
before `"THE POSTS"` (`:550`), `""` when the flag is false:

```
QUESTIONS IN THE POST
- Separately from the reply, list the questions each post asks. Include every question the post asks outright, and any question it only implies - a stated confusion, a wrong assumption stated as fact, or something the writer says they could not work out. Phrase an implied question as the question the writer would have asked. One entry per distinct question; split a compound sentence only when its parts need different answers.
- Answer each one in plain prose, 1 to 4 sentences, in your own voice, pitched at the people in this discussion. No markdown, no bullet lists. Write each answer to the person who asked, so that it reads on its own as a paragraph of the reply with the question never shown: its first sentence names the point being answered, and it never begins with Yes, No, or a word that refers back to the question.
- If answering would require a fact about the course that is not written in the posts or the reference material shown to you here - a due date, a policy, what a reading or the assignment says, a grade - leave "answer" empty and name that fact in "needsYou" as a short sentence fragment addressed to the instructor: the thing itself, not an instruction. Give "needsYou" alongside an "answer" only when the answer is partial and the rest depends on such a fact. Nothing addressed to the instructor ever goes in "answer". Never write a placeholder such as null, N/A or None for either field - leave the key out.
- Do not list a question the post itself goes on to answer, a question it repeats from the discussion prompt in order to answer it, or a rhetorical question. A post with no questions gets an empty array.
- The reply may still do what the rules above ask of it, including a brief correction, but it must not reproduce an answer written in "questions". A clause is enough; the full answer belongs in "questions", where the instructor decides whether to use it. If the reply mentions a question, it does not say whether, where or by whom it will be answered.
```

(b) The OUTPUT element line at `:562` becomes a ternary in the SAME array
slot: when true,
`'Each element is {"post": <the POST number>, "reply": "...", "concepts": ["...", "..."], "questions": [...]} - the number, not the name.'`;
when false, today's line byte-identical. A new array element is placed
immediately after the `"concepts" is one to three...` line (`:564`) and
before `Write the reply as plain text...` (`:568`), `""` when false:

```
"questions" is an array, at most 3 per post - when there are more, keep the ones asked outright first, then the ones that matter most. Each is {"question": "...", "implied": true or false, "answer": "..."}, plus "needsYou": "..." only when the rules above call for it. It does not count toward the element count above.
```

The within-element order reply, concepts, questions is load-bearing: the
data pass measured that `parseLenientJsonArray` recovers every complete
element on 60% of mid-array truncation positions with this order versus 19%
with questions first. Do not reorder, and do not move questions to a second
top-level array.

(c) Lines `:536` and `:537` are unchanged. RC1's adjacency pin
(`discussion-reply-prompt.test.ts:398-415`: the concepts sentence
immediately follows the post-number-range line) still holds because the new
sentence goes AFTER the concepts sentence.

### Q3. Parsing (`parsePostQuestions`, leaf)

```ts
export const MAX_POST_QUESTIONS = 3;
export const MAX_QUESTION_CHARS = 300;
export const MAX_ANSWER_CHARS = 1200;
export function parsePostQuestions(raw: unknown, max = MAX_POST_QUESTIONS): PostQuestion[]
```

Lenient, dependency-free, never throws:

- A lone object is wrapped as `[obj]`; any other non-array -> `[]`. Each
  element must be a plain object; anything else (a string, a number, an
  array) is dropped.
- Key aliases, read in this order and only when the canonical key is not a
  string: `question` | `q` | `text`; `answer` | `a` | `response`; `needsYou`
  | `needs_you` | `needsInstructor`. `implied` is `true` for boolean `true`,
  the strings `"true"`, `"implicit"`, `"implied"` (case-insensitive), a `kind`
  or `type` key equal to `"implicit"`/`"implied"`, or `explicit === false`;
  everything else -> `false`.
- Placeholder values: after trimming, a `question`, `answer` or `needsYou`
  matching `/^(n\/?a|none|null|nil|-|no|not applicable)\.?$/i` is treated as
  absent.
- `question`: whitespace collapsed to single spaces, trimmed; empty -> item
  dropped; longer than `MAX_QUESTION_CHARS` -> `truncateWithMarker` (truncated,
  NOT dropped - a long transcription with a good answer is still worth a
  row).
- `answer`: a string, or an array of strings joined with `"\n\n"`; split on
  `/\n\s*\n/`, collapse `\s+` to one space inside each paragraph, trim, drop
  empty paragraphs, join with `"\n\n"`; non-string -> `""`; longer than
  `MAX_ANSWER_CHARS` -> `truncateWithMarker`.
- `needsYou`: whitespace collapsed, trimmed; empty/non-string -> key ABSENT
  (never `""`); longer than `MAX_QUESTION_CHARS` -> `truncateWithMarker`.
- Item with `answer === ""` and no `needsYou` -> dropped.
- Dedupe on `postQuestionKey(question)`, first kept.
- `max` applied LAST.

### Q4. The server action (`draftDiscussionRepliesAction`)

- `coerceCompositionAtBoundary` gains `answerQuestions: typeof
  obj.answerQuestions === "boolean" ? obj.answerQuestions :
  DEFAULT_REPLY_COMPOSITION.answerQuestions`.
- The raw element type widens to `{ post?, reply?, concepts?, questions? }`.
  `withConcepts` becomes `withOutputs(id, reply, rawConcepts, rawQuestions,
  author)` and emits `questions` ONLY when `safeComposition.answerQuestions`
  is true AND `parsePostQuestions` returns a non-empty array. A model that
  volunteers questions under OFF is ignored - the setting gates the OUTPUT,
  not only the prompt. It also emits `questionsDropped: number` (the count of
  raw array elements minus kept items, only when > 0) so a server-side drop
  is visible to the log.
- Success return widens to
  `{ replies: Array<{ id; reply; concepts?: string[]; questions?: PostQuestion[]; questionsDropped?: number }>; finishReason?: string; usage?: LlmUsage; elapsedMs?: number }`
  - `finishReason?: string`, `usage?: LlmUsage`, `elapsedMs?: number` are
  the exact optional fields on the success branch of `LlmResult`
  (`src/lib/llm.ts:199-201`); `LlmUsage` (`:179-183`, exported) carries
  `promptTokenCount?` / `candidatesTokenCount?` / `totalTokenCount?`. Copy
  each with the conditional-spread idiom `llm.ts:538-540` uses
  (`...(r.finishReason ? { finishReason: r.finishReason } : {})` etc.) so
  the 13 whole-object deep-equals on the success return in
  `discussion-replies-draft.test.ts` (`:222, :287, :304, :345, :595, :609,
  :621, :638, :653, :665, :679, :691`) pass UNCHANGED with mocks that omit
  them. No assertion in that file changes beyond the ones section 7 names.
- `maxOutputTokens`: `safeComposition.answerQuestions ? 8192 : 4096`; the
  rest of `generationConfig` unchanged, so the OFF path sends
  `{ temperature: 0.7, maxOutputTokens: 4096 }` byte-identical.
  `normalizeGenerationConfig` only raises a cap below 512, so 8192 passes
  through.

### Q5. The client wire type and the loop (`discussion-draft-loop.ts`)

- `DraftDiscussionRepliesAction`'s return type widens identically to Q4 (the
  `draftAction: draftDiscussionRepliesAction` assignment in
  `useDiscussionReplies.ts` stays the proof - entry 372's dead-feature
  lesson).
- `coerceReplyComposition(rawIngredients, rawAddressByName, rawFormality,
  rawAnswerQuestions: string | null = null)` - a FOURTH TRAILING parameter
  with a default. Rule mirrors address-by-name (`:351-352`): `"0"` -> false,
  `"1"` -> true, anything else (including `null`) -> the default (true).
- `runDraftLoop` passes a FIFTH argument to `applyReply` at `:673`:
  `compositionNow.answerQuestions ? (reply.questions ?? []) : undefined`.
  `undefined` = leave the row's current questions alone (OFF for this
  dispatch: turning the feature off stops producing, it does not delete what
  a row has - the same rule unchecking "resources" follows for existing
  links); `[]` = the model found none this time, clear. The discard path
  (`resolveEditedDuringDispatch`, `:643`) stays three-argument.
- Missing-row failure text: when `result.finishReason === "MAX_TOKENS"` and
  rows are missing, `markFailed(stillFailed, "No reply came back for this post - the model's output hit its length limit. Retry usually lands.")`;
  otherwise today's "No reply came back for this post." unchanged.
- `RunDraftLoopDeps` gains `pushDraftEvent: (event: DiscussionRepliesLogDraft) => void`
  (type from `discussion-replies-log.ts`, Q9), called exactly once per
  `draftAction` call, after the result (or the catch) resolves and before
  the `if (!loopsActiveRef.current) return;` guard at `:619`, with the
  dispatch-time values (`compositionNow`, `audienceNow`) - never
  `compositionRef.current` re-read.

### Q6. Row storage (`useReplyRows.ts`, `discussion-serialization.ts`)

- `ReplyRow.questions?: PostQuestion[]` - PERSISTED, absent-stays-absent,
  serialized only when non-empty (the `resources` idiom at `:238,244`).
  `DISCUSSION_TABLE_VERSION` stays 1.
- `coercePostQuestions(raw: unknown): PostQuestion[] | undefined` in
  `discussion-serialization.ts`: shape-only - drops an entry whose
  `question` is not a non-empty string or that violates the Q1 invariant,
  coerces `implied` to `=== true`, keeps `needsYou` only as a non-empty
  string, DEDUPES on `postQuestionKey` (first kept) so identity is unique by
  construction on both entry paths. Never re-applies Q3's caps. Empty
  result -> `undefined`.
- `applyReply(id, reply, userEdited = false, concepts?, questions?: readonly PostQuestion[])`
  - the same three-way switch as `concepts` (`:743-744,753`): undefined
  leave / `[]` clear / array replace with a COPY. `UseReplyRowsReturn.applyReply`
  (`:283`) widens to match.
- `editReply` does NOT clear `questions`. Beside the `concepts: undefined`
  at `:661`, add the comment: questions describe the POST, which the edit
  did not change; and Insert IS an `editReply` call, so clearing here would
  make inserting answer 1 delete questions 2 and 3.
- New mutator `removeQuestion(id: string, question: string)`: filters out
  EVERY item whose `question` equals the argument exactly (idempotent, the
  `removeResource` shape), sets the field to `undefined` when the list
  empties, no-op when the row has no matching item (AC40 idiom),
  `scheduleSave(STRUCTURAL_DEBOUNCE_MS)`. The same question text can
  legitimately appear on two rows; the mutator is scoped by `id`.

### Q7. Insert / Copy / Remove

- `appendAnswerToReply(currentReply: string, answer: string): string`
  (`discussion-reply-insert.ts`) - appends `answer` as its own paragraph
  (`\n\n`) after the right-trimmed reply; returns `answer` alone for an empty
  reply. No "Q:"/"A:" prefix. Append-after-the-closing-question is a known
  trade-off (a cursor-aware insert is out of scope per that file's header
  `:8-24`); the answer's standalone rule in Q2 is what makes it read.
- `replyAlreadyHasAnswer(currentReply, answer): boolean` -
  `currentReply.includes(answer)`, same reasoning as
  `replyAlreadyHasResource` (`:36-58`).
- `insertAnswer(id: string, item: PostQuestion): void` on
  `UseDiscussionRepliesReturn`: reads `rowsApiRef.current.rawRows` (never
  `rows`); no-op when the row is gone or `item.answer === ""`; if
  `!replyAlreadyHasAnswer(row.reply, item.answer)` ->
  `rowsApiRef.current.editReply(id, appendAnswerToReply(row.reply, item.answer))`;
  then `rowsApiRef.current.removeQuestion(id, item.question)` - a MOVE.
- `removeQuestion(id, question)` on `UseDiscussionRepliesReturn`, forwarded
  straight through like `removeResource` (`:645-647`).
- `useDiscussionReplyFiltering.ts`: `UseDiscussionReplyFilteringArgs` gains
  `insertAnswer: (id: string, item: PostQuestion) => void` (required);
  `handleInsertAnswerForRow` calls `clearHandled(id)` then `insertAnswer(id,
  item)` (the `:164-170` idiom); returned. The PANEL adds `insertAnswer` to
  the args object at `DiscussionRepliesPanel.tsx:225` and destructures
  `handleInsertAnswerForRow`.
- Expected side effects of Insert, all pre-existing consequences of routing
  through `editReply`, correct here for the same reasons they are for
  `insertResource`: the row becomes `userEdited: true` ("Edited by you"
  badge; Redraft arms with "This replaces the reply you edited."),
  `concepts` is cleared (`:661` - the chips vanish and "Search terms cleared
  - the next search uses your edited reply." appears), `handledAt` is
  cleared by the filtering wrapper.
- Copy (owned by the block, Q10): `await writeClipboardText(item.answer)`;
  on success `announce(\`Copied the answer to "${clamp}".\`)` where `clamp`
  is `truncateWithMarker(item.question, 60)` - the question is named so two
  consecutive copies in one row set DIFFERENT announce text (the panel's
  live region is `setAdhocAnnouncement(text)`; identical text is a skipped
  render and nothing is spoken). Copy does NOT call `onMarkHandled` (handled
  means the reply went out), does NOT touch the row's `copied` state, and
  leaves the item in the list. On failure both channels:
  `announce(ANSWER_CLIPBOARD_FAILURE_MESSAGE)` and `onCopyError(...)` with
  the text "Could not copy automatically. Select the answer text and copy
  it." (the row's own message says "in the reply box", which is false here).
- Insert announces `Added the answer to the reply to ${author}.` (from the
  block, after calling `onInsertAnswer`). Remove announces nothing; focus
  moves to a neighbour whose name states a different question.
- Remove has NO arm/confirm: it discards a model suggestion, not the
  instructor's work, and an un-dismissed item never reaches the clipboard.
- `replyClipboardText` / `tableClipboardText` are UNCHANGED.

### Q8. The control (`DiscussionReplyControls.tsx`, `discussion-persisted-controls.ts`)

- Label: **"Draft answers to the questions in each post"**. Hint (the
  `aria-describedby` paragraph, id constant `ANSWER_QUESTIONS_HINT_ID` beside
  `ADDRESS_BY_NAME_HINT_ID` at `:45`): **"Listed under the reply: what the
  post asks or implies, each with an answer you can insert, copy, or
  dismiss. The reply itself leaves the answering to you."**
- Structure: the bare `<div>` at `:124` becomes
  `<div className={\`${controls.stack} ${controls.fieldGrow}\`}>` containing
  TWO child `<div>`s, each a `FormControlLabel` + its `<p
  className={styles.fieldHint}>`. `controls.stack` (`RecordingControls.module.css:39-43`)
  gives 8px between the pairs and 0 within; `controls.fieldGrow` (`:83-85`)
  (`flex: 1 1 300px`) lets the block share the row like the other fields.
  Same `size="small"` Checkbox, `checked={composition.answerQuestions}`,
  `onChange={(e) => onChange({ ...composition, answerQuestions: e.target.checked })}`.
  The `.rowTop` fix (`panelStyles.rowTop`, `DiscussionRepliesPanel.module.css:33`, applied at `:89`) is unaffected. No `FormGroup`, `FormHelperText`
  or `Typography`.
- Persisted under `ta-rec-disc-answer-questions` (`"1"`/`"0"`), read as the
  FOURTH argument of `coerceReplyComposition` in
  `useDiscussionPersistedControls` (`:151-155`) and written in
  `setComposition` (`:157-162`). Whole string literal, never a template.
- Canary: the literal list at `recording-split.structure.test.ts:355-369`
  gains the key (alphabetical position: after `ta-rec-disc-address-name`);
  `toHaveLength(15)` at `:508` becomes 16 (the set is DERIVED by regex from
  the source, so it flips the moment the literal lands) and its `it()` title
  at `:507` gains ", and the post-questions group's own answer-questions".
- `DraftingArmSignatureArgs` (`discussion-capture.ts:763-781`) gains
  `answerQuestions: boolean` with a comment mirroring `:767-776`; the
  signature appends it as the SEVENTH `|` field, after `formality`. The
  panel passes `answerQuestions: composition.answerQuestions` at
  `DiscussionRepliesPanel.tsx:424-431` (and still no `statusFilter` -
  `discussion-table-view.test.ts:762-766` scans that call).

### Q9. The run log (`discussion-replies-log.ts`, `useDiscussionRepliesRunLog.ts`, `useDiscussionReplies.ts`)

Diagnostic questions this log must answer: "was the setting on for the
dispatch that drafted row X?", "how many questions did the model return for
that dispatch, how many did the server drop, and were any flagged needs
you?", "what did it say the instructor has to supply?", "how long did the
call take and did it hit the length limit?".

- NEW event stream `drafts: readonly DiscussionRepliesLogDraft[]` on
  `DiscussionRepliesLogInput`, one entry per `draftAction` call, collected
  in `useDiscussionReplies.ts` (a `useState` array like `logRetries`, pushed
  through the `pushDraftEvent` dep, Q5):

```ts
export interface DiscussionRepliesLogDraft {
  at: string;                 // ISO, when the result landed
  rowIds: string[];           // the dispatched rows, in order
  audience: string;
  ingredients: string[];
  addressByName: boolean;
  formality: string;
  answerQuestions: boolean;   // the dispatch-time value
  outcome: "ok" | "error";
  error: string;              // "" when ok
  repliesReturned: number;
  rowsMissing: number;        // dispatched ids with no reply
  questionsReturned: number;  // sum of replies[].questions.length
  questionsNeedingYou: number;
  questionsDropped: number;   // sum of replies[].questionsDropped
  finishReason: string;       // "" when absent
  candidatesTokenCount: number | null;   // result.usage?.candidatesTokenCount ?? null
  elapsedMs: number | null;
}
```

`ingredients` is a fresh `string[]` (`[...compositionNow.ingredients]` - the
settings hold `readonly ReplyIngredient[]`). The loop imports the type
TYPE-ONLY by extending the existing `import type { DiscussionRepliesRunLog }`
at `discussion-draft-loop.ts:72`; a value import would pull the log file's
own value imports into the loop's runtime graph.

- `DiscussionRepliesLogInput.answerQuestions: boolean` (the CURRENT setting,
  from `composition` at `useDiscussionRepliesRunLog.ts:79-81`). Labelled in
  the CSV "Answer questions (at export time)" - honest, like "Stalled at
  export time" (`:497`).
- `DiscussionRepliesLogRowEntry` gains `questionCount: number`,
  `questionsNeedingYou: number`, and
  `questions: Array<{ question: string; implied: boolean; needsYou: string; answerChars: number }>`
  where `question` and `needsYou` pass through
  `redactAuthorNameFromText(text, row.author)` (`@/lib/discussion-reply-redact:105`,
  a NEW import for the log file - client-safe, already imported by
  `useReplyResources.ts:54`; `resourceQuery` arrives pre-redacted from
  upstream today) at log-build time, `needsYou`
  is `""` when absent, and the ANSWER TEXT IS NOT CARRIED - only its length.
  Reason: today's log carries no unredacted student content, and the
  question is frequently the student's own sentence. Full answers in the
  export would be a new, explicit download-time opt-in; it is not in this
  feature.
- CSV: the settings section gains `Answer questions (at export time),Yes|No`
  immediately after `Formality`. `ROW_CSV_HEADER` gains `Questions` and
  `Needs you` (the two counts) inserted immediately after `Error` and before
  `Resource state` - reply-derived outputs before resource outputs - so the
  `endsWith(",Links,Resource search outcome")` pin at
  `discussion-replies-log.test.ts:649` stays true. A new `=== Drafts ===`
  section (one CSV row per draft event, columns in the interface's order,
  `rowIds` joined with `;`) goes after `=== Batches ===` (the existing
  section's exact name, fixture `discussion-replies-log.test.ts:599`) and
  before `=== Notices ===`. Question text never appears in the CSV.
- Summary gains `rowsWithQuestions`, `questionsTotal`, `questionsNeedingYou`,
  `draftCalls`, `draftCallsHitLengthLimit` (count of drafts with
  `finishReason === "MAX_TOKENS"`). `discussionRepliesLogSummaryLine`
  appends, after `noLinks` in the same conditional-clause idiom (`:426-429`),
  `` ` ${questionsTotal} question${questionsTotal === 1 ? "" : "s"} found${questionsNeedingYou > 0 ? ` (${questionsNeedingYou} need${questionsNeedingYou === 1 ? "s" : ""} you)` : ""}.` ``
  only when `questionsTotal > 0` - every existing frozen summary-line oracle
  is unchanged.
- Sabotage rules (each must turn a test red): delete the `questions` read in
  `buildDiscussionRepliesLogRowEntry`; delete `answerQuestions` from the
  draft event; delete the redaction call.

### Q10. The block (`DiscussionReplyQuestions.tsx`, NEW; `DiscussionReplyRow.tsx` mounts it)

Rendered inside `panelStyles.replyBlock`, directly after the reply
`TextField` (`:863-884`) and BEFORE `<DiscussionReplyResources>` (`:891`).
`memo()`-wrapped; every callback prop stable.

```ts
export interface DiscussionReplyQuestionsProps {
  authorName: string;
  questions: PostQuestion[] | undefined;
  onInsertAnswer: (item: PostQuestion) => void;   // bound to the row id by the row
  onRemoveQuestion: (question: string) => void;   // bound to the row id by the row
  focusReplyInput: () => void;                    // the row's textarea: fallback after the last Remove, target after Insert
  announce: (text: string) => void;               // the panel's polite region, forwarded unwrapped
  onCopyError: (text: string) => void;            // the panel's visible error line, forwarded unwrapped
}
```

The block OWNS: its keyed Remove-button ref map (by `question`), its
pending-focus ref, a deps-less `useLayoutEffect` (the
`DiscussionReplyRow.tsx:284-303` idiom relocated one level down - the block
re-renders whenever `questions` changes, and when the last item goes it
renders `null` but stays mounted so the fallback still runs), its clipboard
call with the two-channel failure handling, and a `copiedQuestion: string |
null` state with a `COPY_RESET_MS` (1500) timer cleared on unmount. The row
adds only: two props destructured, two `useCallback`s binding `row.id`, one
`focusReplyInput = useCallback(() => replyInputRef.current?.focus(), [])`,
and the mount. The row is 914 lines and must land at or under 960; the
implementer MEASURES it and, if over, extracts the overflow `Menu` and its
four handlers (`:420-463`, `:719-774`) into `DiscussionReplyRowMenu.tsx`
before reporting.

Renders `null` when `questions` is empty/undefined - no heading, no empty
state, no reserved space. A row with no questions is byte-identical to
today. The block never changes appearance when the setting is OFF, never
shows a skeleton or "updating" caption while the row drafts (the row's own
skeleton at `:842-854` is the only loading state; the questions describe
the post, which did not change), and its controls stay LIVE on a skipped
row (Copy is the private-answer path; "Skip" says the thread gets no reply).

The pure leaf `discussion-post-questions.ts` (NEW, tested) owns:
`QUESTION_BADGE_LABELS = { asked: "Asked", implied: "Implied", needsYou: "Needs you" }`,
`questionBadgeLabel(item)`, the three aria-name builders (below),
`neighbourQuestionAfterRemove(questions, removed): string | null` (next
item's question, else previous, else null), `ANSWER_CLIPBOARD_FAILURE_MESSAGE`,
`COPY_RESET_MS = 1500`, and imports only `type PostQuestion` and
`truncateWithMarker` from the leaf. `CloseIcon` comes from
`./discussion-icons` (`DiscussionReplyResources.tsx:30`), never
`@mui/icons-material`.

### Q11. Each item

Markup and classes (aesthetics pass, all BINDING):

- Root: `<ul className={\`${panelStyles.resourceList} ${panelStyles.questionList}\`} aria-label={\`Questions in the post by ${authorName}\`}>`
  - the list is named for assistive tech; there is NO visible heading (the
  spacing rhythm and the badge vocabulary separate it from the resources
  block). The `<ul>` is the component's only root element - no wrapper.
- Item: `<li className={\`${panelStyles.resourceItem} ${panelStyles.resourceItemStacked}\`}>`.
- Line 1: `<div className={\`${panelStyles.resourceItem} ${panelStyles.resourceItemTop}\`}>`:
  badge `<span className={\`${styles.ghBadge} ${styles.ghBadgeNeutral}\`}>`
  (`Asked` or `Implied` - neutral for both; implied is a description, never
  a warning, never accent); the question as
  `<span className={styles.ghRowName}>` (weight 600, `--text-primary`,
  inherits the table's 13px - the student's words are the item's title, not
  a muted label; a `<span>`, never an `<a>`, because `.resourceItem a`
  ellipsis-clamps anchors); then Insert, Copy (text `<Button size="small"
  variant="text" style={{ minWidth: 0 }}>`, byte-for-byte the sibling's
  Insert at `DiscussionReplyResources.tsx:261-263`, rendered ONLY when
  `item.answer !== ""` - never `disabled`), then Remove (`<IconButton
  size="small" title="Remove question" aria-label=... ref=...><CloseIcon /></IconButton>`,
  `:269-277`). Direct flex children, no `.ghActions` wrapper, no `.ghBadges`
  wrapper around a single badge.
- Line 2, only when `item.answer !== ""`: `<p className={panelStyles.answerText}>{item.answer}</p>`
  - a single text node, `white-space: pre-wrap` carries the paragraph
  breaks; no `split().map(<p>)`, no `<br>`, no markdown.
- Line 3, only when `item.needsYou`: `<div className={\`${panelStyles.resourceItem} ${panelStyles.resourceItemTop}\`}>`
  with `<span className={\`${styles.ghBadge} ${styles.ghBadgeWarning}\`}>Needs you</span>`
  and `<p className={styles.fieldHint}>{item.needsYou}</p>`.
- Copy confirmation, only while `copiedQuestion === item.question`: the LAST
  child of the `<li>`, `<p className={\`${styles.ghMeta} ${panelStyles.metaTight}\`}>Copied the answer.</p>`
  (the row's own transient-line idiom at `:835-837`). The Copy button's own
  label never swaps (D10). Never a Snackbar, Tooltip or toast.
- Accessible names (from `discussion-post-questions.ts`, `clamp =
  truncateWithMarker(question, 60)`): `Insert the answer to "${clamp}" into
  the reply to ${author}`; `Copy the answer to "${clamp}"`; `Remove the
  question "${clamp}" from the reply to ${author}`. Visible text is never
  clamped.
- Focus after Remove: `neighbourQuestionAfterRemove` -> that item's Remove
  button, else `focusReplyInput()`. Focus after Insert: `focusReplyInput()`
  always (set the fallback intent before calling `onInsertAnswer`, the
  `handleInsertResource` shape at `:329-335`). Never "Search for resources"
  (it can be disabled mid-search and a disabled element cannot take focus).
- Three NEW classes in `DiscussionRepliesPanel.module.css`, directly after
  `.resourceItemStacked` (`:432-435`), token-only, exactly:

```css
/* Post-questions: composed with .resourceItem for a line whose text WRAPS
   (the question, the needs-you sentence). .resourceItem's own
   `align-items: center` was tuned for a single nowrap link; on a 3-5 line
   question it floats the badge and the controls at mid-paragraph. */
.resourceItemTop {
  align-items: flex-start;
}

/* Post-questions: composed with .resourceList. Items here are 2-3 lines
   with an 8px internal gap, so the list gap must be wider than that (12px),
   and the block must sit further from the resources block beneath it
   (8px replyBlock gap + 8px here = 16px) than its own items sit from each
   other. Textarea -> this block stays 8px on purpose: answers are material
   for the reply, resources are appendices. */
.questionList {
  gap: var(--space-3);
  margin-bottom: var(--space-2);
}

/* Post-questions: the answer paragraph. Content, not a hint -
   --text-primary, not fieldHint's --text-secondary. .postCell is NOT
   reusable here (fixed height, border, scroll). pre-wrap preserves the
   "\n\n" paragraph breaks parsePostQuestions keeps. */
.answerText {
  margin: 0;
  font-size: var(--font-size-md);
  line-height: var(--line-snug);
  color: var(--text-primary);
  white-space: pre-wrap;
  word-break: break-word;
}
```

  All three are referenced by LITERAL `panelStyles.x` in
  `DiscussionReplyQuestions.tsx`, which imports the module DIRECTLY
  (`import panelStyles from "./DiscussionRepliesPanel.module.css"`, as
  `DiscussionReplyResources.tsx:29` does) - the orphan ratchet
  (`src/app/components/courses/page-module-css-orphan-classes.test.ts`,
  `PINNED_ORPHAN_CEILING = 137`, exact `toBe`, tree-wide, covers this module)
  attributes references per importing file. The pin is NOT changed: three
  referenced classes leave the total at 137; a reported 138 means a class is
  unreferenced - fix the reference, never the pin.
- Prohibitions: no `sx`, no inline style except `minWidth: 0` and
  `visuallyHidden`; no MUI `Typography`/`Chip`/`Divider`/`Paper`/`Card`/
  `Collapse`/`Tooltip`/`Alert`/`Stack`; no colour literal; no new token; no
  border, background, padding or radius on the list or items; no numbering,
  no "Q:"/"A:" prefixes, no question-mark icon; no `title` on the `<li>` or
  the question span; the block does not import `RecordingControls.module.css`.

### Q12. Threading

`DiscussionReplyTable.tsx` gains `insertAnswer: (id, item) => void` and
`removeQuestion: (id, question) => void` props forwarded UNWRAPPED to the
row as `onInsertAnswer` / `onRemoveQuestion` (no inline arrows - header
`:15-22`). `DiscussionRepliesPanel.tsx` destructures `insertAnswer` and
`removeQuestion` from the hook, passes `insertAnswer` INTO
`useDiscussionReplyFiltering` at `:225`, and passes
`insertAnswer={handleInsertAnswerForRow}` (the WRAPPED one - the raw one
compiles and ships the handled-badge lie) and `removeQuestion={removeQuestion}`
to the table. `UseDiscussionRepliesReturn` (`discussion-draft-loop.ts:81-265`)
gains both. `postQuestions.wiring.test.ts` (NEW, modelled on
`redraftRow.wiring.test.ts:17-115`) pins the chain by source scan: the
checkbox reads/writes `answerQuestions`; the persisted key is read as the
fourth `coerceReplyComposition` argument and written in `setComposition`;
`runDraftLoop`'s `applyReply` call has the fifth argument; the panel passes
`handleInsertAnswerForRow` (not `insertAnswer`) to the table; the table
forwards unwrapped; the row mounts `DiscussionReplyQuestions` with
`row.questions`. It is red until B lands - Group C reports that, never
"fixes" it.

## 3. Reuse survey (verified by reading the code and its call sites)

| Need | Reuse | Where |
|---|---|---|
| lenient array parse of a model field | `parseReplyConcepts` idiom | `discussion-reply-prompt.ts:93-135` |
| word-boundary cut | `deriveResourceConcept` rule (no marker) | `:59-65` |
| marker idiom | `MAX_POST_CHARS` `...` (no word boundary) | `discussion-replies.ts:228` |
| three-way optional row field write | `applyReply`'s `concepts` switch | `useReplyRows.ts:733-760` |
| absent-stays-absent (de)serialize | `resources` / `concepts` handling | `discussion-serialization.ts:238-246, 332` |
| shape-only coercion of a persisted array | `coerceReplyResources` | `:383-397` |
| append-to-reply + live-text guard | `appendResourceToReply`, `replyAlreadyHasResource` | `discussion-reply-insert.ts:30,56` |
| MOVE-style insert | `insertResource` | `useDiscussionReplies.ts:673-681` |
| clear-handled wrapper on insert | `handleInsertResourceForRow` | `useDiscussionReplyFiltering.ts:164-169` |
| per-item Remove focus restoration | `registerResourceRemoveRef` + pending refs + layout effect | `DiscussionReplyRow.tsx:284-322` |
| clipboard with two-channel failure | `handleCopy` | `:345-375`, `../ui/clipboard` |
| transient copied line | `copied && <p ghMeta metaTight>` | `:835-837` |
| checkbox + aria-describedby hint | address-by-name control | `DiscussionReplyControls.tsx:126-149` |
| stacked pairs / bounded flex item | `controls.stack`, `controls.fieldGrow` | `RecordingControls.module.css:39-43, 83-85` |
| persisted "1"/"0" boolean with default ON | `rawAddressByName` rule | `discussion-draft-loop.ts:351-352` |
| list/item/badge markup | `.resourceList`, `.resourceItem`, `.resourceItemStacked`, `ghBadge*`, `ghRowName` | `DiscussionRepliesPanel.module.css:169-190,432`; `DiscussionReplyResources.tsx:231-292`; `page.module.css:1560-1563` |
| log row entry + summary + CSV | `buildDiscussionRepliesLogRowEntry`, `summarizeDiscussionRepliesRunLog`, `formatDiscussionRepliesLogCsv` | `discussion-replies-log.ts:243-266, 332, 482` |
| log event stream collected per event | `logRetries` / `setLogRetries` | `useDiscussionReplies.ts` (search `setLogRetries`) |
| redaction at the log boundary | `redactAuthorNameFromText` | `src/lib/discussion-reply-redact.ts:105-129`; precedent `resourceQuery` |
| arming-signature per-field test | `draftingArmSignature` block | `discussion-capture.resources.test.ts:221-305` |
| key canary | literal list + count + read/write scan | `recording-split.structure.test.ts:355-369, 479, 462-503` |
| wiring test by source scan | `redraftRow.wiring.test.ts` | `:17-115` |

NOT reused, and why: `message-reply-prompt.ts`'s `"answer"` ingredient
(folds the answer into the reply); `deck-concepts.ts` (imports a server
action; the prompt leaf must stay dependency-free); `.postCell` for the
answer (fixed height, border, scroll - `DiscussionRepliesPanel.module.css:123-131`).

## 4. Measured facts (data-engineer pass, 2026-09-04; method in each row)

| Fact | Value | Method |
|---|---|---|
| Prompt growth, flag ON | +1,367 chars (~340-390 tokens), zero student data | real `buildReplyDraftingPrompt` on 5 oracle posts, compiled leaf |
| Output, today, 5 posts | 2,536 chars (~630-730 tokens) | `JSON.stringify` of a realistic response |
| Output, 3 questions/post, 4-sentence answers | 10,081 chars (~2,520-2,880 tokens) | same |
| Output at every parse cap | 31,976 chars (~8-9k tokens) - does NOT fit 8192; accepted, made legible via `finishReason` | same |
| Per-batch output growth | 3.5-4x; batches are sequential, so a 100-row "Redraft every reply" goes from roughly 66s to roughly 200s at an assumed 300 tok/s | estimate; `elapsedMs` in the drafts log replaces it with the real number |
| Truncation recovery, this element order | 60% of cut positions recover every complete element; 15% lose one; 25% fail the batch | `parseLenientJsonArray` swept over every cut of a real response |
| Same, questions-before-reply | 19% / 45% / 35% - hence the order rule in Q2 | same |
| Pre-existing: today's shape loses the last complete element on ~60% of cuts | follow-up group (14 callers, frozen oracle needed), not this feature | same |
| 4-sentence instructor answer | 352-427 chars | three written answers |
| Persisted row growth, 3 realistic questions | +1,509 UTF-16 units; +0.7 MiB on a full 500-row table (1.63 MiB total) against a ~5 MiB origin quota | `JSON.stringify(row).length` |
| Compound worst case (4,000-char posts + capped questions, 500 rows) | 5.5 MiB - the existing `STORAGE_FULL_MESSAGE` path is the right failure; no new cap | same |
| `implied: false` round-trips; `needsYou: undefined` drops from JSON; `needsYou: ""` survives, so Q6's non-empty rule is load-bearing | verified | round trip |

## 5. Disagreements between passes, and the decision

| Point | Positions | Decision |
|---|---|---|
| Visible heading above the list | UX: "Questions in the post" label so two badge-led lists do not merge; aesthetics: no heading, spacing separates | No visible heading; the `<ul>` carries `aria-label` (the accessibility half of the UX ask). The 16px block gap vs 12px item gap and the resources block's own lead-in (chips or the Search row) separate them visually. |
| Copy control form | UX: IconButton with icon swap + visible confirmation; aesthetics: text Button matching Insert, label never swaps | Text Button "Copy" (parity with Insert); visible confirmation is the transient "Copied the answer." line inside the item; announce names the question. |
| CSV column position | sabotage: after `Error`, before `Resource state` (keeps the `:649` pin); architect: append last, update the pin | Sabotage's placement - fewer oracle changes, and counts of reply-derived output belong before resource columns. |
| Copy announce text | architect: `Copied the answer for ${author}.`; UX: name the question | UX - identical consecutive announce text is not re-spoken. |
| Correction vs "reply must not answer" | sabotage: a stance-required correction lives in the reply and is not repeated in questions; data: reply may briefly correct, full answer in questions | Data's wording (Q2 last bullet). The implied question keeps its standalone answer; a brief correction plus an inserted fuller explanation is acceptable redundancy, and suppressing the implied question would hide the output the owner asked for. |
| Over-long question | AC rev 1: drop; data: truncate | Truncate. |
| Focus/clipboard ownership | AC rev 1: row-owned; sabotage + architect: block-owned (row lands ~994 otherwise); aesthetics: generalise the row's map | Block-owned. |
| Drafts event stream | data: required or strike the diagnostic question; architect: scope growth to weigh | Included (Q5/Q9). Without it the log cannot say whether the setting was on for a dispatch, and it is the only way the owner ever sees the real latency number. |
| Answer text in the log export | AC rev 1: verbatim; data: redacted question + answer length only | Data's rule (Q9). |

Follow-ups recorded, NOT built here: a "Needs you" status-filter chip in
the toolbar (UX 1d); the `parseLenientJsonArray` truncation defect (data
1e); the resources list's 13px title over 14px note inversion (aesthetics
B4); gating `clearHandled` on the insert guard in both wrappers (UX 7c); a
caret-to-end after Insert focus (UX 4d).

## 6. Ownership - the disjoint split (architect pass; every file in exactly one group)

| Group | Files (allow-list) | Owns |
|---|---|---|
| **A - prompt + server** | `src/lib/discussion-reply-prompt.ts`; `src/lib/discussion-reply-prompt.test.ts` (fixture edits ONLY - it is 842 lines); `src/lib/discussion-reply-prompt.questions.test.ts` (NEW - every new parser/prompt test); `src/app/actions/discussion-replies.ts`; `src/app/actions/discussion-replies-draft.test.ts` | Q1, Q2, Q3, Q4 |
| **B - row data + loop + log + persistence** | `discussion-serialization.ts` + `.test.ts`; `useReplyRows.ts`; `discussion-draft-loop.ts` + `.test.ts`; `discussion-persisted-controls.ts` + `.test.ts`; `discussion-reply-insert.ts` + `.test.ts`; `useDiscussionReplies.ts`; `useDiscussionReplyFiltering.ts`; `discussion-replies-log.ts` + `.test.ts`; `useDiscussionRepliesRunLog.ts`; `discussion-capture.ts`; `discussion-capture.resources.test.ts`; `recording-split.structure.test.ts` (canary list + count only) | Q5, Q6, Q7 (all but the block's own Copy), Q8 persistence + signature, Q9 |
| **C - UI** | `DiscussionReplyQuestions.tsx` (NEW); `discussion-post-questions.ts` + `.test.ts` (NEW); `DiscussionReplyRow.tsx` (+ `DiscussionReplyRowMenu.tsx` if the extraction is needed); `DiscussionReplyTable.tsx`; `DiscussionRepliesPanel.tsx`; `DiscussionReplyControls.tsx`; `DiscussionRepliesPanel.module.css`; the orphan-class ratchet test if it covers that module; `postQuestions.wiring.test.ts` (NEW) | Q8 control, Q10, Q11, Q12, the block's Copy |

All files in B and C without a path are in `src/app/components/recording/`.
The three groups dispatch concurrently, coded against THIS contract.
Expected tsc red mid-wave (report, never stub or inline): B's coercers and
`type PostQuestion` imports until A lands; C's `row.questions`,
`insertAnswer`, `removeQuestion`, `handleInsertAnswerForRow` until B lands.

Contract names that cross the boundaries: A->B/C: `PostQuestion`,
`parsePostQuestions`, `truncateWithMarker`, `postQuestionKey`,
`MAX_POST_QUESTIONS`, `ReplyCompositionSettings.answerQuestions` (required),
`DEFAULT_REPLY_COMPOSITION.answerQuestions === true`, the widened action
return (Q4). B->C: `ReplyRow.questions?: PostQuestion[]`;
`UseDiscussionRepliesReturn.insertAnswer(id, item)`,
`.removeQuestion(id, question)`; `UseDiscussionReplyFilteringArgs.insertAnswer`,
`UseDiscussionReplyFilteringReturn.handleInsertAnswerForRow`;
`DraftingArmSignatureArgs.answerQuestions`. B->A: none (B injects the action
type; the shapes are pinned here).

Order within groups (minimises time in red): A - type/consts/default, then
`parsePostQuestions` + new test file, then the prompt, then the action, then
fixtures. B - serialization, rows, loop (coercer, wire type, fifth arg,
draft event), persisted controls + canary, insert leaf, orchestrator +
filtering, signature + its test, log. C - the pure leaf + test first (zero
sibling dependency), the block, the row mount, table/panel, the checkbox,
the wiring test last.

## 7. Existing tests that change - each by ADDING the field, never by widening a type or loosening an assertion

| File:line | Change |
|---|---|
| `src/lib/discussion-reply-prompt.test.ts:38-42` `LEGACY_COMPOSITION` | gains `answerQuestions: false` - this IS the frozen OFF oracle; `BASELINE_STUDENTS_PROMPT`/`BASELINE_PEERS_PROMPT` literals at `:362-366` MUST NOT change |
| same file `:607-608` (`...DEFAULT_REPLY_COMPOSITION, ingredients: []`) | gains `answerQuestions: false` or its `toBe(BASELINE_STUDENTS_PROMPT)` goes red |
| same file `:652-656`, `:669-673` typed literals | gain `answerQuestions: false` |
| `src/app/actions/discussion-replies-draft.test.ts:104-114` (pins 4096 under DEFAULT) | split into: DEFAULT -> `maxOutputTokens` 8192 with temperature 0.7; `{ ...DEFAULT, answerQuestions: false }` -> `generationConfig` deep-equal `{ temperature: 0.7, maxOutputTokens: 4096 }`; a third test: a model volunteering `questions` under OFF yields no `questions` key on any reply |
| same file `:354-358` typed literal | gains `answerQuestions: false` |
| `discussion-draft-loop.test.ts:312-316`, `:415,:425,:435,:449` typed literals | gain `answerQuestions: false` |
| same file `:711-712` `toEqual` | gains `answerQuestions: true` (three-arg call -> default); new cases `"0"` -> false, `"1"` -> true, `"garbage"` -> true |
| same file `:604-670` `applyReplyCalls` tuple | widens to five elements; cases: ON + questions -> the array; ON + none -> `[]`; OFF -> `undefined`; discard path -> three args |
| `discussion-capture.resources.test.ts:227-234` `base`, `:237,:241,:245` frozen literals, `:297-305` SABOTAGE (f) object with its expected string at `:306` | `base` gains `answerQuestions: true`; literals gain a trailing `\|true`, the `:306` string a trailing `\|false`; that test's title ("all six fields") and comment ("three new fields") are corrected; `discussion-capture.ts:783-792`'s doc comment gets the update it predicted; add "C6a: varying answerQuestions alone changes the signature" |
| `discussion-replies-log.test.ts:31-47` `emptyInput()`, `:190-200`, `:558-570` input literals | gain `answerQuestions: true` and `drafts: []` |
| same file `:583-618` frozen whole-file CSV, `:613` header literal | re-frozen deliberately with the new settings line, the two new columns after `Error`, and the empty `=== Drafts ===` section; the `:649` `endsWith` pin stays as is |
| `recording-split.structure.test.ts:355-369`, `:507-508` | key added to the literal list; the derived-count pin 15 -> 16 with the title suffix |

Every fixture in these files that constructs a `ReplyCompositionSettings`
literal MUST compile after A's required field lands - Group A owns the two
`src/lib` and `src/app/actions` files, Group B the recording-folder ones.
No other file in `src/` constructs this type (`message-replies.ts:45` and
`take-announcement.ts:84,196` are different types).

## 8. Limits (to be carried into the REGRESSION entry verbatim)

- Same-call generation multiplies each drafting batch's output by 3.5-4x
  with the setting on; batches are sequential, so a whole-table redraft
  takes roughly three times longer than with it off. The drafts section of
  the run log carries the measured `elapsedMs` per call.
- At every parse cap simultaneously the response does not fit 8192 output
  tokens; the loop then marks the missing rows failed with a message that
  names the length limit, and Retry usually lands.
- `parseLenientJsonArray` loses the last complete element on some
  truncations (pre-existing, measured, follow-up recorded).
- The log export carries redacted question text and the answer's length,
  never the answer text.
- The log's per-row question counts are "still showing", not "found": Insert
  and Remove both delete the item from the row. The drafts section carries
  "found".
- A row whose table write fails on quota loses its questions with everything
  else (no partial write); the existing storage-full message is the voice.
