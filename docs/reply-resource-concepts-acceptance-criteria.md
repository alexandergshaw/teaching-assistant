# Reply resources keyed on the reply's concept terms - acceptance criteria

Requested 2026-09-02, mid-session: "the resources that are sought out for the
replies should focus on one or more of the concept terms in the reply that
was generated."

Queued BEHIND the controls group (`docs/recording-controls-ux-acceptance-
criteria.md`) per DEV_LOOP 0d: both touch `DiscussionReplyRow.tsx`, so this
one's code starts after that group's push. The research below is done now.

Revision 2, 2026-09-02: an adversarial check of revision 1 found a colliding
`applyReply` signature, four un-listed tests the change reddens, an
unthreaded wire type (the feature would have shipped dead past a green
suite), an unstated redaction on the per-row path, and a reuse citation that
cannot compile under the target file's import rule. All folded in.

---

## 0. What is actually wrong (surveyed 2026-09-02, cited)

The resource search has two entry points and they disagree about what they
search:

- **Automatic, after a draft lands** (`discussion-draft-loop.ts:655-670` ->
  `enqueueResources([id])` -> the drain at `useReplyResources.ts:274-376`):
  the drain maps rows as `{ id, text: r.post, author: r.author }`
  (`useReplyResources.ts:296-306`). **It searches the student's POST only.
  `r.reply` is never read.** This is the path every reply takes when
  "resources" is among the ingredients, and it is the one the owner is
  describing.
- **Per-row "Search for resources"** (`DiscussionReplyRow.tsx:819-828` ->
  `searchRow`, `useReplyResources.ts:477-486`): `deriveRowSearchConcept(post,
  reply, author)` joins post + reply with a space and redacts the author's
  name via `redactAuthorNameFromText` (`:152-156`), then truncates at 400
  characters on a word boundary (`deriveResourceConcept`,
  `src/lib/discussion-reply-prompt.ts:59-65`, `RESOURCE_CONCEPT_CHARS = 400`
  at `:48`).

Either way the "concept" handed to the grounded search is **raw prose**, not
terms. The action (`src/app/actions/discussion-replies.ts:484-486`) redacts
the author name from each `text` and forwards each string as one concept to
`findResourceLinksForConceptsAction` (`src/app/actions/learning-resource-
links.ts:471-495`), which trims and caps at `MAX_CONCEPTS_PER_RUN = 6`
(`:79`, `:510-517`; one string is one concept - nothing splits on commas)
and researches each with the prompt at `:372-380` ("...for a student
studying one concept. CONCEPT: ${concept} ...").

Nothing in the pipeline extracts concepts today: the drafting prompt's output
contract is `{"post": <number>, "reply": "..."}` only
(`discussion-reply-prompt.ts:490-498`). The action's parser
(`discussion-replies.ts:307`) is `parseLenientJsonArray(r.text) as
Array<{ post?: unknown; reply?: unknown }>`, type-guarded at `:316-331`, and
then **rebuilt as a two-key object** at `:335` (`{ id, reply: r2.reply.trim()
}`) and in the positional fallback at `:341-343` - so an extra `concepts` key
survives parsing and is DISCARDED at the map. The wire type the client
injects is `DraftDiscussionRepliesAction` at `discussion-draft-loop.ts:
386-399` (its own comment at `:375-381` records a feature that once shipped
dead because only one side of this type was widened); the loop reads each
reply at `:646-655` and calls `applyReply` at `:655`, whose signature is
`applyReply(id, reply, userEdited?: boolean)` (`useReplyRows.ts:286`, `:723`)
and which the loop ALSO calls at `:631` with `current.userEdited` to
re-apply a user's own text.

`src/lib/discussion-reply-prompt.ts:3-4` declares "no imports from anywhere
else in the repo" (it is imported by client components); the deck-concepts
parser (`src/lib/workflows/deck-concepts.ts:49`, takes a STRING) imports
`@/app/actions/shared` and is therefore NOT reusable here.

The run log carries `resourceState`/`resourceError` per row
(`discussion-replies-log.ts:166-178`) and **no event carries the query**.
`ROW_CSV_HEADER` spans `:409-421`.

Line counts: `useReplyResources.ts` 496, `learning-resource-links.ts` 655,
`actions/discussion-replies.ts` 558, `discussion-reply-prompt.ts` 506,
`discussion-draft-loop.ts` 685, `discussion-replies-log.ts` 539,
`discussion-serialization.ts` 334, `useReplyRows.ts` 940 (**60 lines of
headroom**), `DiscussionReplyRow.tsx` 917 (the controls group adds to it
first and names `DiscussionReplyResources.tsx` as its escape hatch; RC6 lands
in whichever file holds the resource list by then).

---

## 1. Acceptance criteria

**RC1 - Concepts come out of the drafting call, not a second call.** The
drafting prompt's OUTPUT contract (`discussion-reply-prompt.ts:490-498`)
becomes `{"post": <number>, "reply": "...", "concepts": ["...", "..."]}`
where `concepts` is one to three short noun phrases (2-5 words each) naming
the concepts THE REPLY discusses - taken from the reply's own wording, never
invented and never a person's name. The prompt says so in those words, and
says that `concepts` does not count toward "exactly N elements" (`:491`,
which governs the array length, not keys). Zero extra latency and no new
budget in the serialized action lane; a second LLM call per row is rejected
for that reason. The "3 to 6 sentences" rule (`:457`) governs `reply` only
and is unchanged.

**RC2 - Parse leniently, degrade to absent.** `parseReplyConcepts(raw:
unknown): string[]` is NEW in `src/lib/discussion-reply-prompt.ts`,
dependency-free (that file's import rule): accepts an array of strings or of
`{ concept: string }` objects, trims, drops empties and anything over 60
characters, deduplicates case-insensitively, caps at 3; anything else yields
`[]`. Unit-tested with fixtures in both shapes plus garbage.

**RC2b - The wire contract, every hop named.** `discussion-replies.ts`: the
cast at `:307` gains `concepts?: unknown`; the guard at `:316-331` leaves it
untyped; the map at `:335` and the positional fallback at `:341-343` emit
`concepts` ONLY when `parseReplyConcepts` returns a non-empty array (absent
stays absent - mirroring `postedAt` at `:227` - so
`discussion-replies-draft.test.ts:253` and `:294` stay verbatim); the action
return type at `:278` gains `concepts?: string[]`. `discussion-draft-loop.ts`:
`DraftDiscussionRepliesAction`'s reply item (`:386-399`) gains `concepts?:
string[]` (optional, so the fixtures at `discussion-draft-loop.test.ts:129`
and `:555` still type-check); the success path at `:646-655` passes
`reply.concepts` into `applyReply`.

**RC3 - Stored on the row.** `ReplyRow.concepts?: string[]`
(`discussion-serialization.ts:57-94`, the optional-field idiom; the
deserializer at `:221-239` builds an explicit object, so `concepts` is added
there with coercion - an array of non-empty strings, else `undefined`, absent
stays absent; the serializer's `...r` at `:133` passes it through;
`DISCUSSION_TABLE_VERSION` stays 1 - a bump discards every user's table,
REGRESSION 383). `applyReply`'s signature becomes `applyReply(id: string,
reply: string, userEdited = false, concepts?: readonly string[])`
(`useReplyRows.ts:286`, `:723`): when `concepts` is OMITTED the row's
existing field is untouched (so the `:631` re-apply of a user's own text
keeps the terms); when it is passed (the `:655` success path) it REPLACES the
field, including with `undefined` when the model returned none. **A hand edit
clears them**: `editReply` (`useReplyRows.ts:633`) sets `concepts: undefined`,
because the terms described a generated reply that no longer exists; the
per-row search then falls back honestly (RC4). Regenerate (the controls
group's `redraftRow`) reaches `applyReply` at `:655`, so terms refresh on
every regenerate; `resources` are left alone by `markDrafting` and are
re-searched by the `:668` path only when the "resources" ingredient is on -
RC6's chip wording is chosen so that never reads as a live search.

**RC4 - Both search paths prefer the concepts, and both redact.** In
`useReplyResources.ts` ONE pure function decides the query for both paths:
`resourceQueryForRow(row: Pick<ReplyRow, "post" | "reply" | "author" |
"concepts">, mode: "auto" | "manual"): string` returns
`deriveResourceConcept(redactAuthorNameFromText(base, author))` where `base`
is `row.concepts.join("; ")` when `concepts` is non-empty, else the post
(`mode === "auto"`, today's drain rule) or post + " " + reply (`mode ===
"manual"`, today's `deriveRowSearchConcept` rule). The drain's mapper
(`:296-306`) sends `text: resourceQueryForRow(r, "auto")`; `searchRow`
(`:477-486`) uses `"manual"`. `deriveRowSearchConcept` is deleted and its
five tests (`useReplyResources.test.ts:288, 294, 304, 309, 314`) are moved
onto `resourceQueryForRow` verbatim in the `"manual"` mode, plus new cases:
concepts win in both modes; concepts are redacted (a term equal to the
author's name yields `""`, the `:314` sabotage's twin); the joiner is `"; "`.
Redaction runs client-side here AND server-side at `discussion-replies.ts:
485`; the second is harmless on an already-clean string. The joined string
(max 3 x 60 + 4 = 184 chars) never reaches the 400-char truncation.

**RC5 - One search per row, several terms in it.** The action already caps
concepts per run at 6 and researches each separately; a row's 1-3 terms are
sent as ONE `"; "`-joined string per row (one grounded call per row, as
today), never fanned out per term - a 30-row table must not become a 90-call
run. The research prompt at `learning-resource-links.ts:372-374` says
"studying one concept. CONCEPT: ${concept}"; with a joined string that reads
"CONCEPT: utilitarianism; moral luck", which the grounded model handles as a
compound topic. The prompt text is NOT changed in this group.

**RC6 - The instructor can see why.** In the row's resource block, immediately
after the "Search for resources" button (`DiscussionReplyRow.tsx:819-828`)
and before the "Finding resources…" hint (`:833`), a `.ghBadges` row of
`.ghBadge` chips prefixed by a `.ghMeta` span reading **"Keyed on:"** renders
whenever `row.concepts` is non-empty, with `title` "The resource search is
keyed on these terms from the generated reply; editing the reply clears
them." Not editable in this group (a follow-up; say so in the REGRESSION
entry).

**RC7 - Logged, the query and the terms.** `DiscussionRepliesLogRowEntry`
(`discussion-replies-log.ts:166`) gains `concepts: string[]` (`[]` when
absent) AND `resourceQuery: string` (the exact string the last search sent,
`""` if none - recorded by `useReplyResources.ts` at dispatch); the CSV gains
"Concepts" (joined with `"; "`; `escapeCsvValue` quotes it) and "Resource
query" columns appended to `ROW_CSV_HEADER` (`:409-421`). The diagnostic
questions: "why did this reply get links about X" and "did the search use
the terms or fall back". Fallback is therefore never silent: the log shows
the actual query.

**RC8 - No behaviour change elsewhere.** Redaction, resource kinds, video
length, the profile sentence, the two-call research shape and the ACTION
CALL are unchanged; `discussion-replies-resources.test.ts`,
`discussion-replies-bulk-redaction.test.ts` and `learning-resource-links.
test.ts` need NO widening (RC4 changes only what the client puts in `text`).

## 1b. Tests this group reddens, and the widening for each (AM21: never weaken)

| Test | What it pins | Widening |
| --- | --- | --- |
| `src/lib/discussion-reply-prompt.test.ts:362, :365, :386-387` | the whole prompt byte-for-byte (`toBe`), including `Each element is {"post": ..., "reply": "..."}` | update the OUTPUT substring inside both literals to the RC1 contract; add a fact-pin that the contract names `concepts` after `reply` |
| `discussion-replies-draft.test.ts:253, :294` | `toEqual({ replies: [{ id, reply }] })` | untouched, because RC2b omits `concepts` when empty (a fixture WITH concepts is added beside them) |
| `discussion-replies-log.test.ts:59-71` | the full row entry via `toEqual` | add `concepts: []`, `resourceQuery: ""` |
| `discussion-replies-log.test.ts:439-441` | the frozen CSV header and two rows | append `,Concepts,Resource query` to the header and `,,` to each row |
| `useReplyResources.test.ts:287-318` | `deriveRowSearchConcept` (five `it`s) | moved verbatim onto `resourceQueryForRow(..., "manual")`; new concepts cases added |
| `discussion-serialization.test.ts:279-288` | the frozen serialized oracle | untouched (no fixture has concepts; `JSON.stringify` drops `undefined`); a round-trip case WITH concepts is added |
| `discussion-draft-loop.test.ts:129, :555` | the injected action fixtures | untouched (`concepts` optional) |

Sabotage checks at step 9: delete the `:655` threading (the row never gets
concepts - the round-trip and the drain test go red); make the drain send
`r.post` again (the "concepts win in auto mode" case goes red); remove the
redaction in `resourceQueryForRow` (the `:314` twin goes red); emit
`concepts: []` from the action (the `:294` verbatim assertion goes red).

## 2. Files (one group, after the controls push)

`src/lib/discussion-reply-prompt.ts` (+ its test), `src/app/actions/
discussion-replies.ts` (+ `discussion-replies-draft.test.ts`),
`recording/discussion-serialization.ts` (+ test), `recording/useReplyRows.ts`,
`recording/useReplyResources.ts` (+ test), `recording/discussion-draft-loop.ts`
(+ its test if a fixture is added), `recording/discussion-replies-log.ts`
(+ test), and whichever of `recording/DiscussionReplyRow.tsx` /
`DiscussionReplyResources.tsx` holds the resource list after the controls
group (RC6). Disjoint from nothing in the controls group EXCEPT that row
file, `useReplyRows.ts` and `discussion-draft-loop.ts` - which is why this
waits.

## 3. Limits

No component renders; the chips are verified by reading. Whether the model
reliably emits `concepts` is not measurable here - RC2's degradation means a
missing array reverts to today's post-only search, and RC7's "Resource
query" column is the instrument that shows how often that happens.
