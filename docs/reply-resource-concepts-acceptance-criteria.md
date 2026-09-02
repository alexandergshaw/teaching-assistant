# Reply resources keyed on the reply's concept terms - acceptance criteria

Requested 2026-09-02, mid-session: "the resources that are sought out for the
replies should focus on one or more of the concept terms in the reply that
was generated."

Revision 3, 2026-09-02: revision 2 folded in one adversarial check; revision
3 reconciles the four pre-code passes (architect, UX, data engineer,
aesthetics) run against HEAD ef73094, after the controls group shipped. The
two passes that disagreed - chip placement - are settled by moving the
"Search for resources" button into the resources component so the chips sit
under the reply and above the button. Every file:line below is against
ef73094.

---

## 0. What is actually wrong (surveyed 2026-09-02, cited)

The resource search has two entry points and they disagree about what they
search:

- **Automatic, after a draft lands** (`discussion-draft-loop.ts:667-682` ->
  `enqueueResources([id])` -> the drain at `useReplyResources.ts:274-376`):
  the drain maps rows as `{ id, text: r.post, author: r.author }`
  (`useReplyResources.ts:296-306`). **It searches the student's POST only;
  `r.reply` is never read.** This is the path every reply takes when
  "resources" is among the ingredients, and it is the one the owner is
  describing.
- **Per-row "Search for resources"** (`DiscussionReplyRow.tsx:887-898` ->
  `searchRow`, `useReplyResources.ts:477-486`): `deriveRowSearchConcept(post,
  reply, author)` joins post + reply with a space and redacts the author's
  name (`:152-156`), then truncates at 400 characters on a word boundary
  (`deriveResourceConcept`, `src/lib/discussion-reply-prompt.ts:59-65`,
  `RESOURCE_CONCEPT_CHARS = 400` at `:48`). Measured: a six-sentence reply
  already overruns that cap today (609 -> 396 chars).

Either way the "concept" handed to the grounded search is **raw prose**, not
terms. The action (`src/app/actions/discussion-replies.ts:484-486`) redacts
the author name from each `text` and forwards each string as one concept to
`findResourceLinksForConceptsAction` (`src/app/actions/learning-resource-
links.ts:471-495`), which trims and caps at `MAX_CONCEPTS_PER_RUN = 6`
(`:79`, `:510-517`; one string is one concept - nothing splits on commas)
and researches each with the prompt at `:372-380` ("...studying one concept.
CONCEPT: ${concept} ..."). Rows go to the action five at a time
(`RESOURCE_BATCH_SIZE = 5`, `useReplyResources.ts:281`): a 30-row table is
6 action calls, 30 grounded calls, 30 structuring calls, today and after.

Nothing in the pipeline extracts concepts today: the drafting prompt's output
contract is `{"post": <number>, "reply": "..."}` only
(`discussion-reply-prompt.ts:490-498`). The action's parser
(`discussion-replies.ts:307`) is `parseLenientJsonArray(r.text) as
Array<{ post?: unknown; reply?: unknown }>` (`src/lib/lenient-json.ts` is
JSON.parse plus four textual repairs and inspects no keys), type-guarded at
`:316-331`, then **rebuilt as a two-key object** at `:335` and in the
positional fallback at `:341-343` - an extra `concepts` key survives parsing
and is DISCARDED at the map. The wire type the client injects is
`DraftDiscussionRepliesAction` at `discussion-draft-loop.ts:398-411` (comment
`:385-397` records a feature that once shipped dead because only one side of
this type was widened); the loop reads each reply at `:656-684`, calls
`applyReply` at `:667`, and ALSO calls it at `:643` with `current.userEdited`
to re-apply a user's own text. `applyReply(id, reply, userEdited?: boolean)`
is declared at `useReplyRows.ts:286` and implemented at `:722-734`;
`editReply` at `:633-656`; `markResourceSearching` at `:838-853`; the
resource mutators live at `:792-882`. `useReplyRows.ts` is **940 lines - at
the soft cap** - so the addition needs an extraction (RC10).

`src/lib/discussion-reply-prompt.ts:3-4` declares "no imports from anywhere
else in the repo" (it is imported by client components); the deck-concepts
parser (`src/lib/workflows/deck-concepts.ts:49`, takes a STRING, imports
`@/app/actions/shared`) is therefore NOT reusable here.

The run log carries `resourceState`/`resourceError` per row
(`discussion-replies-log.ts:166-178`, builder `:217-236`, `ROW_CSV_HEADER`
`:409-421`, CSV rows `:481-496`, JSON export `:507`) and **no field carries
the query**. The log is built from LIVE rows (`useDiscussionRepliesRunLog.
ts:73-90`), so a dispatch-time value must live on the row to be logged.

Redaction of a concept string (`src/lib/discussion-reply-redact.ts:97-121`,
measured on twelve cases): a term that IS the author's name redacts to `""`;
a term that CONTAINS the name is mangled ("Newton's laws of motion" under
author Isaac Newton -> "'s laws of motion"; "free will" under Will Smith ->
"free "). Today `searchRow` returns early on `""` with no state change
(`useReplyResources.ts:482`), while the drain's empty entries are dropped
server-side (`discussion-replies.ts:486`) and come back as zero links marked
`done` - two silent outcomes for one cause.

Line counts (ef73094): `useReplyResources.ts` 496, `learning-resource-links.
ts` 655, `actions/discussion-replies.ts` 558, `discussion-reply-prompt.ts`
506, `discussion-draft-loop.ts` 697, `discussion-replies-log.ts` 539,
`discussion-serialization.ts` 334, `useReplyRows.ts` 940,
`DiscussionReplyRow.tsx` 921, `DiscussionReplyResources.tsx` 143.

---

## 1. Acceptance criteria

**RC1 - Concepts come out of the drafting call, not a second call.** In
`src/lib/discussion-reply-prompt.ts`, line 492 becomes
`'Each element is {"post": <the POST number>, "reply": "...", "concepts": ["...", "..."]} - the number, not the name.'`
and ONE new line is inserted after line 493 (before the C3-i line):
`'"concepts" is one to three short noun phrases (2 to 5 words each) naming the ideas that reply discusses, copied from the reply\'s own wording. Never a person\'s name, never an idea the reply does not mention. It does not count toward the element count above.'`
Measured cost: ~55 input tokens per drafting call (6 calls per 30-row
table), 7-18 output tokens per reply, under 100 per five-row batch against
`maxOutputTokens: 4096`. A second LLM call per row is rejected: the drafting
lane is serialised and already starves frame extraction
(`useReplyResources.ts:20-28`). The "3 to 6 sentences" rule (`:457`)
governs `reply` only and is unchanged.

**RC2 - Parse leniently, degrade to absent.** `parseReplyConcepts(raw:
unknown, max = 3): string[]` is NEW in `src/lib/discussion-reply-prompt.ts`,
dependency-free. The cap is a parameter because the pure parser cannot see
the author: the action parses with `max = 6`, applies RC2c's drop, then
caps at 3, so a name term never consumes one of the three slots (found by
group A on 2026-09-02; the AC's worked example below only holds with this
ordering). Accepts: an array of strings; an array of `{ concept:
string }`; a single string split on `;` or `,` (the model emits this shape
often enough that refusing it would make the fallback column constant).
Each term is trimmed; empty terms and terms over 60 characters are DROPPED
(not truncated); duplicates are removed case-insensitively keeping the FIRST
spelling; the result is capped at 3 - and the cap is applied LAST, after
every drop (including RC2c's), so `["Isaac Newton", "a", "b", "c"]` under
author Isaac Newton yields `["a", "b", "c"]`. Anything else (`null`, a number, an
object, a nested array) yields `[]`. Fixtures in the test: every shape in
this paragraph plus `[1, null, ["x"], {}]` and `[{ concept: 5 }, { name:
"x" }]`.

**RC2b - The wire contract, every hop named.** `discussion-replies.ts`: the
cast at `:307` gains `concepts?: unknown`; the filter's type predicate at
`:317` widens to `r2 is { post: number; reply: string; concepts?: unknown }`
(logic unchanged - without it `r2.concepts` at `:335` is a type error); a
local `withConcepts(id, reply, raw, author)` used by the map at `:335` and
the positional fallback at `:341-343` emits `concepts` ONLY when non-empty
(absent stays absent - mirroring `postedAt` at `:227` - so
`discussion-replies-draft.test.ts:253` and `:294` stay verbatim); the return
type at `:278` gains `concepts?: string[]`. **RC2c, in that helper:** a term
that `redactAuthorNameFromText(term, author)` (import it beside the existing
`redactAuthorNameFromPost` import at `:36`; no new dependency edge) leaves
with NO LETTERS is DROPPED before emission - "Isaac Newton" under that
author redacts to `""`, "Newton's" to `"'s"`; both drop - so a chip never
names a term the search will not send. The author is `posts[i].author`,
typed `string` on the action parameter (`:256-262`). The only caller,
`useDiscussionReplies.ts:531`, injects the action into the loop's optional
field and compiles in either landing order. `discussion-draft-loop.ts`:
`DraftDiscussionRepliesAction`'s reply item (`:411`) gains `concepts?:
string[]` (optional, so `discussion-draft-loop.test.ts:129` and `:555`
type-check); the success path at `:667` becomes `applyReply(reply.id,
reply.reply, false, reply.concepts ?? [])` - **`[]` means "the model
returned none, clear"; `undefined` means "leave alone"** - and the `:643`
re-apply stays three-argument.

**RC3 - Stored on the row.** Three optional fields on `ReplyRow`
(`discussion-serialization.ts:57-95`, the optional-field idiom):
`concepts?: string[]`, `resourceQuery?: string`, and `resourceQuerySource?:
"concepts" | "post" | "post-reply"` - the last records WHICH base the last
search used, because without it the row cannot tell "terms were used and
then cleared by an edit" from "no terms existed", and RC6's two explanatory
lines would fire together. The deserializer at `:221-240` adds
`coerceConcepts(raw)` (shape only - an array whose non-empty strings are
kept; an empty result, including a persisted `[]`, coerces to `undefined`;
RC2's length and count rules are not re-applied on read), `resourceQuery`
(a non-empty string, else `undefined`) and `resourceQuerySource` (one of the
three literals, else `undefined`); the serializer's `...r` at `:133` passes
all three through and `JSON.stringify` drops `undefined`;
`DISCUSSION_TABLE_VERSION` stays 1 (pinned by three tests; a bump discards
every user's table). `applyReply(id, reply, userEdited = false, concepts?:
readonly string[])` (`useReplyRows.ts:286`, `:723`): `concepts === undefined`
leaves the field alone; `[]` sets it `undefined`; a non-empty array replaces
it (copied). **A hand edit clears them**: `editReply` (`:633-654`) sets
`concepts: undefined`, because the terms described a generated reply that no
longer exists. Redraft reaches `applyReply` at `:667` and refreshes them.
`markResourceSearching(ids, queryById?: ReadonlyMap<string, { text: string;
source: "concepts" | "post" | "post-reply" }>)` (`:838-853`) sets
`resourceQuery` and `resourceQuerySource` from the map's entry when present,
alongside `resourceState: "searching"`; neither is ever cleared (they record
the LAST search, including one that failed). Persistence footprint: typical 66 chars
per row, worst 201 for concepts plus up to 400 for the query, against rows
of 160-420 chars before resources - acceptable.

**RC4 - One function decides the query, both paths use it, both redact.**
In `useReplyResources.ts`:
`resourceQueryForRow(row: Pick<ReplyRow, "post" | "reply" | "author" |
"concepts">, mode: "auto" | "manual"): { text: string; source: "concepts" |
"post" | "post-reply" }`. `base` is `row.concepts.join("; ")` when
`concepts` is non-empty (source `"concepts"`); the text is
`deriveResourceConcept(redactAuthorNameFromText(base, row.author))`. **If
that redacts to no letters, the function falls back to the prose base for
the mode** - post (`"auto"`, today's drain rule, source `"post"`) or post +
" " + reply (`"manual"`, today's `deriveRowSearchConcept` rule, source
`"post-reply"`) - redacted the same way; `text` is `""` only when the prose
is blank too (the case `useReplyResources.test.ts:304` pins). The drain's
mapper (`:296-306`) sends `text` (and keeps sending `author`, so the server's
idempotent redaction at `discussion-replies.ts:485` and
`discussion-replies-bulk-redaction.test.ts` stay meaningful) and calls
`markResourceSearching(ids, map)` at `:311` with each row's `{ text,
source }`; `searchRow` (`:477-486`) uses `"manual"` and `dispatchRowSearch`
(`:435-446`) passes its `{ text, source }` the same way. `deriveRowSearchConcept` is
deleted; its five tests (`useReplyResources.test.ts:288, 294, 304, 309,
314`) move verbatim onto `resourceQueryForRow(..., "manual")`, plus: concepts
win in both modes; the joiner is `"; "`; an all-name concept set falls back
to the prose (the `:314` sabotage twin: no name survives in the fallback
either); a mangled term is sent as mangled (the log shows it). The server's
`:486` filter remains the single drop point for empties; the drain does not
filter client-side. The joined string (max 3 x 60 + 4 = 184 chars) never
reaches the 400-char truncation.

**RC5 - One search per row, several terms in it.** Rows go to the action
five at a time and each row is ONE `"; "`-joined string, so a 30-row table
stays at 30 grounded calls. Per-term fan-out is rejected for a stronger
reason than cost: 5 rows x 3 terms = 15 concepts per batch exceeds
`MAX_CONCEPTS_PER_RUN = 6` and the excess is sliced SILENTLY (`learning-
resource-links.ts:517`; the hazard is recorded at `discussion-reply-prompt.
ts:22-30`). The research prompt reads "CONCEPT: utilitarianism; moral luck"
and is NOT changed in this group.

**RC6 - The instructor can see why, keyboard included.** The "Search for
resources" button and its `.ghActions` row MOVE from `DiscussionReplyRow.tsx:
887-898` into `DiscussionReplyResources.tsx` (group C owns both), which then
renders, in this order inside the reply block: the chip row, the button row,
the "Finding resources…" hint, the error line, the list. The chip row renders
whenever `row.concepts` is non-empty, in every `resourceState`:
`<span className={styles.ghBadges} title={HINT}>` holding
`<span className={styles.ghMeta}>Search terms:</span>` followed by one
`<span className={`${styles.ghBadge} ${styles.ghBadgeNeutral}`}>` per term,
each term followed by a visually-hidden ", " (`ui/visuallyHidden.ts`) so a
screen reader separates them, and, LAST in the same container and in the
reading flow, a visually-hidden `<span>` carrying HINT = "Resource searches
use these terms from the drafted reply. Editing the reply clears them." (A
description in the reading flow is what assistive technology actually
reads; `aria-describedby` on a non-focusable span is ignored, so it is not
used. `title` serves pointer users.) Neutral is the only chip variant (the header row's status
badges already carry state); no truncation (a 60-char term fits the 680px
column; three wrap between chips); no inline styles; no new class (the
orphan ratchet stays at 137). Three explanatory `.fieldHint` lines, mutually
exclusive by construction on `resourceQuerySource`, each rendered only when
it explains something and never while `resourceState === "searching"`
(the "Finding resources…" hint covers that):

| Line | Predicate | Text |
| --- | --- | --- |
| terms were used, then a hand edit cleared them | `!concepts?.length && resourceQuerySource === "concepts"` | "Search terms cleared - the next search uses your edited reply." (goes away the moment a prose search lands, because that search rewrites the source) |
| the last search used no terms | `!concepts?.length && (resourceQuerySource === "post" \|\| resourceQuerySource === "post-reply")` | "Searched the post text - no terms were drawn from the reply." for `"post"`; "Searched the post and your reply - no terms were drawn from the reply." for `"post-reply"` |
| new terms over links found under different text (a redraft with the resources ingredient off, or a mangled-term mismatch) | `concepts?.length && resources?.length && resourceQuery && resourceQuery !== concepts.join("; ")` | "Links below came from an earlier search for: {resourceQuery}" - printing the actual text keeps it true even when the only difference is redaction |

Chips are not editable this group; the cheapest honest edit
affordance, if asked next, is a per-row "Search terms" text field
pre-filled from the concepts, not editable chips.

**RC7 - Logged, the terms and the search text.** `DiscussionRepliesLogRowEntry`
(`discussion-replies-log.ts:166`) gains `concepts: string[]` (`[]` when
absent), `resourceQuery: string` (`""` when absent) and
`resourceQuerySource: string` (`""` when absent), built at `:223-235` from
the row; `ROW_CSV_HEADER` (`:409-421`) appends `"Search terms"`, `"Resource
search text"` and `"Resource search source"` (the on-screen noun and the
column noun are the same); the CSV row (`:483-495`) appends
`concepts.join("; ")`, the query and the source;
the JSON export picks both up. Diagnostic questions answered: "why did this
reply get links about X" and "did the search use the terms or fall back"
(empty Search terms with prose in Resource search text is the fallback
signature; a mangled term shows verbatim).

**RC8 - No behaviour change elsewhere.** Redaction, resource kinds, video
length, the profile sentence, the two-call research shape and the ACTION
CALL are unchanged; `discussion-replies-resources.test.ts`,
`discussion-replies-bulk-redaction.test.ts` and `learning-resource-links.
test.ts` need NO widening (RC4 changes only what the client puts in `text`).
Two follow-ups recorded, not built: announcing "Found N resources for the
reply to {author}" through the panel's live region needs `announce` threaded
into `useReplyResources` via `useDiscussionReplies.ts` (870 lines, outside
this group); deduplicating identical concept strings within one batch would
save grounded calls but needs a batching change.

**RC10 - Line ceiling.** `useReplyRows.ts` is at 940. Group B FIRST moves
`:792-882` (the R3/R7 header comment, `applyResources`, `removeResource`,
`markResourceSearching`, `markResourceFailed`, `bumpResourceSeq`,
`snapshotResourceSeq`, `resourcesUnchangedSince`) AND `isResourceBatchFresh`
(`:152`, with its doc) into a new `recording/useReplyRowResourceMutators.ts`
exporting `useReplyRowResourceMutators(deps: { rowsRef; resourceSeqRef;
commitRows; scheduleSave })` returning the seven callbacks, which
`useReplyRows.ts` spreads into its return. Those functions also close over
the module-private `STRUCTURAL_DEBOUNCE_MS` (`:95`, used at `:815, :833,
:850, :867`) - it and `TYPING_DEBOUNCE_MS` (`:96`) MOVE into the leaf and
`useReplyRows.ts` imports them from there (never back-import from the
parent - the recorded cycle trap). `isResourceBatchFresh` moves WITH the leaf
and is re-exported from `useReplyRows.ts` so `useReplyResources.test.ts:30`
keeps its import; that test's comment at `:24-29` ("rather than testing a
re-export") is updated to say the re-export is now the point. The
`ReplyResource` type is imported from `discussion-serialization` by the
leaf directly. Run the suite green after the pure move, BEFORE any
behaviour change. Expected after: `useReplyRows.ts` ~860, the new file ~115,
`DiscussionReplyRow.tsx` ~910, `DiscussionReplyResources.tsx` ~185.

## 1b. Tests this group reddens, and the widening for each (AM21)

| Test | What it pins | Widening |
| --- | --- | --- |
| `src/lib/discussion-reply-prompt.test.ts:362, :365, :386-387` | the whole prompt byte-for-byte (`toBe`), including line 492 | update the OUTPUT substring and insert the new sentence at the same position inside both literals; add a fact-pin that the element shape on the `Each element is` line names `"concepts"` after `"reply"`, and that the `"concepts" is one to three` sentence immediately FOLLOWS the `Include every post number` line |
| `discussion-replies-draft.test.ts:253, :294` | `toEqual({ replies: [{ id, reply }] })` | untouched (absent stays absent); add a fixture WITH concepts beside them, and one where a term equals the author's name and is dropped (RC2c) |
| `discussion-replies-log.test.ts:59-71` | the full row entry via `toEqual` | add `concepts: []`, `resourceQuery: ""` |
| `discussion-replies-log.test.ts:439-441` | the frozen CSV header and two rows | append `,Search terms,Resource search text,Resource search source` to the header and `,,,` to each row; add a third fixture row showing the fallback signature |
| `useReplyResources.test.ts:287-318` | `deriveRowSearchConcept` (five `it`s) | moved verbatim onto `resourceQueryForRow(..., "manual")`; new cases per RC4 |
| `discussion-serialization.test.ts:279-288` | the frozen serialized oracle | untouched; add a round-trip case WITH both fields and one proving absent stays absent |
| `discussion-draft-loop.test.ts:129, :555` | the injected action fixtures | untouched (`concepts` optional); add a loop test asserting `applyReply` received `["a", "b"]` and, for a reply without concepts, `[]` |
| `discussion-capture.test.ts:69`, `.thread.test.ts:72`, `.resources.test.ts:316` | `DISCUSSION_TABLE_VERSION === 1` | untouched |

Sabotage checks at step 9: delete the `:667` fourth argument (the loop
test and the round-trip go red); make the drain send `r.post` again
("concepts win in auto mode" goes red); remove the redaction in
`resourceQueryForRow` (the `:314` twin goes red); emit `concepts: []` from
the action (the `:294` verbatim assertion goes red); delete RC2c's drop (the
author-name fixture goes red).

## 2. The split (architect, 2026-09-02)

**Wave 0 (orchestrator, before dispatch):** `discussion-serialization.ts`
only - the three optional fields on `ReplyRow`, their coercion in the
deserializer, nothing else. Group C also updates
`DiscussionReplyResources.tsx`'s header comment (`:8`, "beneath the Search
for resources button" goes stale) and uses `useId` for any generated id. Lands as tree state so A, B and C compile
independently.

| Group | Files | Calls the new export at |
| --- | --- | --- |
| A - contract + server | `src/lib/discussion-reply-prompt.ts` (+ `.test.ts`), `src/app/actions/discussion-replies.ts` (+ `discussion-replies-draft.test.ts`) | `parseReplyConcepts` at `discussion-replies.ts:335/:342` (in-group); the widened return is assignable to the loop's optional field in either order |
| B - row model, loop, search | `recording/useReplyRows.ts`, NEW `recording/useReplyRowResourceMutators.ts`, `recording/useReplyResources.ts` (+ `.test.ts`), `recording/discussion-draft-loop.ts` (+ `.test.ts`), `recording/discussion-serialization.test.ts` (round-trip cases only) | `applyReply`'s fourth argument at loop `:667`; `markResourceSearching`'s map at `useReplyResources.ts:311/:437`; `resourceQueryForRow` at `:306/:481` |
| C - readers | `recording/discussion-replies-log.ts` (+ `.test.ts`), `recording/DiscussionReplyResources.tsx`, `recording/DiscussionReplyRow.tsx` (the button row moves out; `concepts`, `resourceQuery`, `resourceState`, `userEdited`, `onSearchRow` and its disabled predicate cross as props) | reads wave-0 fields only |

`discussion-capture.ts` re-exports `ReplyRow` (`:33`) and is edited by no
one. Every reddened test sits with the code it pins.

## 2b. As built (2026-09-02, after the Opus verification and one fix wave)

- `parseReplyConcepts(raw, max = 3)` also collapses internal whitespace, so
  a term with a double space cannot differ from the query normaliser's
  spelling and light the third line on the current search.
- The second explanatory line's predicate is `sourceIsProse && !(hasConcepts
  && hasResources)`: a prose-sourced search is disclosed even when the row
  carries terms from a later draft, and the three lines stay mutually
  exclusive. The third line reads "Links below came from a search for:
  {resourceQuery}" (no "earlier").
- `CONCEPT_JOINER = "; "` is exported from `discussion-serialization.ts` and
  used by the query builder, the CSV row and the comparison predicate; a
  wiring test pins that no literal joiner sits beside a `join(`.
- `userEdited` is not a prop of `DiscussionReplyResources` (it was threaded
  and read by nothing).
- Source-reading guards (`resourceQuery.wiring.test.ts`) pin the drain's
  `"auto"` call, `searchRow`'s `"manual"` call, the `queryById` map into
  `markResourceSearching`, `applyReply`'s conditional concepts write and
  `editReply`'s clear, each with a canary of the old shape - the automatic
  path can no longer be unwired with the suite green.
- `discussion-reply-redact.ts`'s comment now names the two surfaces that
  display the redacted text; stale citations of the deleted
  `deriveRowSearchConcept` repointed to `resourceQueryForRow`.
- Follow-ups, not built: a live-region announcement when links land
  (`announce` must cross `useDiscussionReplies.ts`); deduplicating identical
  concept strings within a batch; a blank manual query is still a silent
  no-op.

## 3. Limits

No component renders; the chips, the two explanatory lines and the
keyboard description are verified by reading. Whether the model reliably
emits `concepts` is not measurable here - RC2's degradation reverts to
today's post-only search silently on screen, and RC7's "Resource search
text" column plus RC6's "no terms were drawn" line are the two instruments
that make it visible. Heights and wrapping of the chip row are arithmetic.
