# Resources in drafted discussion replies - acceptance criteria

Every drafted reply carries 2-3 relevant resources - a video, documentation, a
news article, a paper, whatever actually fits that post - and the links have to
be real.

Extends `docs/discussion-reply-capture-acceptance-criteria.md` (Manual >
Recording > Discussion replies, shipped as REGRESSION entry 367). Read that
first; this document is the delta.

The owner's words:

> i also need the replies that are drafted to these students to include relevant
> youtube, documentation, news articles, etc - whatever is most appropriate, 2-3
> of those resources

**An earlier draft of this document contained three factual errors, caught by
the architect pass before any code was written. They are recorded in section 12
rather than silently deleted, because each one would have produced a green build
that did the wrong thing.**

---

## 0. The decisions that govern everything else

**R0-1. Resources come from a SEPARATE grounded pass. They are never asked for
in the drafting call.**

The obvious implementation - add `webSearch: true` to
`draftDiscussionRepliesAction` and ask for links in the same JSON - is wrong, and
the decision stands. **The stated mechanism, however, was dated and is corrected
here.**

An earlier draft said the demanded JSON shape suppresses the tool, citing the
rule that combining `responseMimeType` with `google_search` returns a `400`. That
rule **no longer applies to Gemini 3**, which is the family this repo pins, and
the drafting call does not set `responseMimeType` anyway. Whether a
prompt-level "return only JSON" instruction suppresses grounding is
**UNVERIFIED**.

The decision survives on the reasons that do hold: a grounded call and a
structuring call have genuinely different jobs, the reused pipeline corroborates
each URL against the sources its own grounded call returned (R0-3), and a model
asked for prose-plus-links in one shot has every opportunity to recite a
plausible URL from training data. This repo has measured that at roughly a **51%
dead-link rate** (`docs/learning-resources-real-links-acceptance-criteria.md`),
which is the evidence that matters - not the vendor error code.

**R0-2. The gathering is REUSED.** `findResourceLinksForConceptsAction`
(`src/app/actions/learning-resource-links.ts:351`) already runs the whole
pipeline and was adversarially reviewed under REGRESSION entry 324 (14 checks,
11 sabotage mutations). Per concept: a grounded prose call, a separate
ungrounded structuring call, `sanitizeResourceUrl` + `encodeUrlForRenderSafety`,
an `isPlaceholderUrl` rejection, `verifyItemUrls` corroborating each URL against
**that concept's own grounding sources**, a dedupe, and `checkUrlsReachable`.

**R0-3. ONE action call carrying all N concepts. Never a per-post fan-out.**

The corroboration boundary is per **concept**, not per **call**:
`verifyItemUrls` is invoked inside `settled.forEach` with `outcome.value.sources`
- that concept's own sources (`learning-resource-links.ts:409-471`). One call
with five concepts already keeps five corroboration sets separate. So the
anti-fabrication guarantee does not require five calls, and five calls cost:

- **five separate `checkUrlsReachable` batches**, each with its own 12s budget -
  up to 60s of reachability alone against a 60s platform ceiling, versus one 12s
  batch;
- five `requireOwner()` round trips;
- **five independent 40s retry clocks**, each measured from its own start, which
  destroys the run-wide cutoff that budget exists to enforce;
- and R0-4.

The action already fans out internally with `Promise.allSettled` over its
concepts (`:398-402`). Fanning out five calls to it re-fans-out a fan-out.

**R0-4. The drain YIELDS while the capture pipeline is busy. This is a data-loss
requirement, not a performance nicety.**

Next serializes client-dispatched Server Functions - this feature's own hook says
so at `useDiscussionReplies.ts:499-502`. So a long resource request does not run
alongside extraction; it **holds the single lane**. Extraction is the
time-critical consumer: `MAX_PENDING_FRAMES` is 16, which AC10c sizes at roughly
**19 seconds of scrolling** before frames are dropped. Hold the lane during a
live capture and the user scrolls a whole board into a full queue - AC10's silent
loss, restored, with only a `Catching up` counter they cannot see because they
are looking at another window.

The drain therefore checks `!(capturing || pendingFrames > 0 || extracting)`
before dispatching. When busy it exits without dispatching; the next enqueue, or
the `capturing -> false` transition, restarts it. R5's "a reply is never held
back waiting for resources" is preserved - resources were never on the reply's
critical path.

**R0-5. What "verified" honestly means. Weaker than an earlier draft of this
document claimed, in two specific ways.**

`checkUrlsReachable` proves a URL answered an HTTP request with a 2xx or 3xx. It
does not prove the resource is right, still exists, or is readable: a removed
YouTube video returns **200** and renders "Video unavailable"; `redirect: "follow"`
means a dead deep link that 302s to a homepage passes; paywalls and soft 404s
pass.

**R0-5a. Corroboration is HOST-level, not URL-level.** This is the sharpest
limit on the whole feature and it was missing from the first draft.
`verifyItemUrls` matches an item's **host** against the hosts of that concept's
grounding sources; **the path is never checked**. So a fabricated path on a real
domain clears the anti-fabrication gate - and since reachability follows
redirects and cannot see a soft 404, a plausible-looking deep link on a genuine
site can survive both gates and reach the instructor.

What the pipeline therefore guarantees is *"this link is on a domain the search
actually surfaced for this post, and something answered at that address"* - not
*"this page exists and is about this"*. `news` is the most exposed of the two new
kinds, since news sites carry dense, guessable-looking paths.

This is why R10's standing hint is worded the way it is, and why the instructor
being able to remove a link in one click is a requirement rather than a
convenience.

**R0-5b. The checker's headers were misstated.** An earlier draft said it "sends
no headers at all". Measured on Node v22.14.0: it sends `user-agent: node`,
`sec-fetch-mode: cors` and `accept-language: *`. That is a **worse** signature
than none - it advertises a script - from a serverless egress IP, with a HEAD 403
treated as final and no GET retry. So the false-negative risk is real and
slightly higher than described: a bot-blocking host drops a good resource
silently.

**No UI string may say "verified", "checked" or "working"** (R10). Given R0-5a
that would not merely overclaim - it would be false.

---

## 1. `ResourceKind` does not exist yet. Create it as a leaf.

`Select-String "ResourceKind"` over `src/**` returns **zero hits**.

- `src/lib/resource-links.ts` is the **curated map** module. Its `ResourceLink.kind`
  is `"tool" | "field"`. Widening that is meaningless and would perturb
  `resolveToolTutorials` / `resolveFieldResources`.
- The `"doc" | "video" | "tutorial"` union is an inline member of
  `ResourceLink["kind"]` at `learning-resource-links.ts:96-103`, and
  `coerceResourceKind` is a **private, non-exported** function at `:130` in that
  same `"use server"` module.

**R1.** A new dependency-free leaf, `src/lib/resource-kind.ts`:

```ts
export type ResourceKind = "doc" | "video" | "tutorial" | "news" | "paper";
export const RESOURCE_KINDS: readonly ResourceKind[];
export const RESOURCE_KIND_LABELS: Record<ResourceKind, string>;  // Docs/Video/Tutorial/News/Paper
export function coerceResourceKind(raw: unknown): ResourceKind;   // default "doc"
```

`learning-resource-links.ts` imports it and **deletes its private copy** - two
implementations of the same coercion is how the last group shipped a tested-but-
dead twin (REGRESSION 367 defect 4). `discussion-capture.ts` imports it, which
keeps AC35's dependency-free requirement intact: `src/lib/resource-links.ts`
drags `@/lib/urls` and the whole curated map behind it and must never reach a
client bundle for a five-member string union.

**Not** in `src/lib/resource-links.ts`: that module already exports a
*different* `ResourceLink`, and two same-shaped names one export list apart is
the near-miss trap this repo keeps falling into.

**R2. The widening ships DEAD unless the PROMPTS change too.**
`learning-resource-links.ts:222`, `:224` and `:257` tell the model three times -
including in the demanded output schema - to emit only doc, video or tutorial.
Change the type and the coercion alone and every news article is badged `Docs`,
with a green round-trip test of `coerceResourceKind("news")` proving nothing.

But editing those prompts in place is a **cross-feature regression**: they are
the shipped Learning Resources page's own search (REGRESSION 324), specified as
documentation + video + written tutorials.

So `findResourceLinksForConceptsAction` gains an **optional resource-profile
argument** selecting (a) the prose call's resource-type sentence and (b) the
structuring call's allowed-kind list, **defaulting to today's three-kind
behaviour** so the existing Learning Resources call site is byte-unaffected. A
`"use server"` module may take an options object; only its *exports* are
constrained to async functions.

The kind list handed to the prompt is **derived from the same constant the
coercion uses**, so the two can never drift - this repo has already been bitten
by a coercion and its prompt disagreeing.

---

## 2. Data shape

**R3.** `ReplyRow` gains two optional fields:

```ts
resources?: ReplyResource[];
resourceState?: "idle" | "searching" | "done" | "failed";
resourceError?: string | null;

export interface ReplyResource {
  title: string;
  url: string;
  kind: ResourceKind;
  note?: string;   // why this fits THIS post; a UI affordance, never copied
}
```

**R3a. Two state machines, because the axes are orthogonal** - a row can be
`ready` + `searching`, `ready` + `failed`, `failed` + `done`. A single machine
would enumerate the cross product and every consumer would decompose it straight
back. `resourceState` therefore **never appears in the Status badge**; it renders
beneath the reply (R9). A second `Failed` in the Status cell meaning something
different is exactly the collapse this AC exists to avoid.

**R3b. `DISCUSSION_TABLE_VERSION` stays at `1`.** `deserializeReplyTable` returns
`[]` on a version mismatch and there is **no migration path**, so bumping it
would silently wipe every saved table on first load, hand-written replies
included. The fields are added additively.

**R3c. Serialization, field by field.** `serializeReplyTable` writes `resources`
only when non-empty, normalises `"searching" -> "idle"` (nothing is in flight
after a reload - the same rule already applied to `drafting -> pending`), and
preserves `resourceError` **only** when `resourceState === "failed"` - the same
invariant whose absence was defect 4 last group.

`deserializeReplyTable` coerces defensively and never throws: a non-array
`resources` yields `undefined`; an entry whose `title` or `url` is not a
non-empty string is dropped; `url` is **not** re-sanitized on load (it cleared
`sanitizeResourceUrl` before it was written); `kind` goes through
`coerceResourceKind`; `note` survives only as a non-empty string; `resourceState`
falls back to `"idle"` on anything outside the four-member set.

**R3c-i. "Absent" is NOT "invalid", and the distinction is load-bearing.** A row
whose stored JSON never carried a `resourceState` key at all keeps it
`undefined` - it is not forced to `"idle"`. Only a key that is PRESENT and holds
an unrecognised value falls back.

This mirrors how `postedAt` already behaves in the same function, and the
maximal reading of the sentence above (which would coerce the absent case too)
was tried and rejected on evidence: it injects `resourceState: "idle"` and
`resourceError: null` into rows that never had them, which breaks the existing
round-trip test in `discussion-capture.rows.test.ts` - `toEqual` does not treat
an explicit `undefined` property as equivalent to an absent one. Recorded here so
the next reader does not "fix" the implementation back toward the looser
wording.

**R3d. `resourceState` MUST persist, or R11 is unimplementable.** After a reload,
a row the instructor emptied by deleting every link and a row that was never
searched are both `resources: undefined`. Without the persisted state, the first
`Find resources` after any reload re-searches and re-adds every link they
deliberately deleted - and spends a grounded call per row doing it.

---

## 3. The gathering pass

**R4.** A new action in `src/app/actions/discussion-replies.ts`:

```ts
export async function gatherReplyResourcesAction(
  posts: Array<{ id: string; text: string }>,
  courseName: string,
  provider: LlmProvider
): Promise<
  { resources: Array<{ id: string; resources: ReplyResource[] }>; degraded: boolean }
  | { error: string }
>;
```

- `requireOwner()` first, whole body in `try/catch`, `{ error }` never thrown.
- `resources` carries **an entry for every id in `posts`**, including ids that
  yielded nothing - the caller must distinguish "searched, found nothing"
  (`done`, empty array) from "never ran".
- `degraded` is forwarded from the reused action and surfaces as **one** notice
  per batch. Its `notes` are per-concept prose written for a different UI and are
  ignored.
- `posts.length > RESOURCE_BATCH_SIZE` -> `{ error: "Too many posts in one batch." }`.

**R4a. `RESOURCE_BATCH_SIZE = 5`** lives in `src/lib/discussion-reply-prompt.ts`
beside the other three shared constants and is re-exported from
`discussion-capture.ts`. It is **not** `DRAFT_BATCH_SIZE` - reusing that constant
means raising it to 7 later would make the reused action silently `slice` the 7th
concept away, and that post would get no resources with no error anywhere. It
must never exceed `MAX_CONCEPTS_PER_RUN` (6).

**R4b. Keying results back to posts - the highest-risk line in this document.**
`findResourceLinksForConceptsAction` takes `readonly string[]`, applies
`concepts.map(c => c.trim()).filter(Boolean)` and `.slice(0, MAX_CONCEPTS_PER_RUN)`,
and returns links keyed by a `concept` **string**. So **positional index
alignment is destroyed** by any post whose concept trims to empty, and two posts
with identical truncated text collapse to one indistinguishable key.

Therefore: build `entries = posts.map(p => ({ id, concept: conceptFromPost(p) }))`,
**drop entries whose concept is empty before calling** (they return
`resources: []`), so the action's own `filter(Boolean)` is a no-op and cannot
shift the mapping. Key results back by grouping links on `link.concept` into a
`Map<string, ResourceLink[]>` and assigning to **every** entry sharing that
string. **Never by array index.** Two posts with identical concept text
legitimately receive the same links.

**R4c. `conceptFromPost`** is a pure exported function in `discussion-capture.ts`:
`post.text` normalised to single spaces and truncated to
`RESOURCE_CONCEPT_CHARS = 400` on a word boundary. **The author's name is never
included** - it is a student's name, it would go into a web search query, and it
contributes nothing to finding a resource. Pinned by a test.

**R4d. `courseKind`.** The reused action's second parameter is `courseKind?: string`
and reaches the prompt as `for a ${courseKind} course`. Pass this feature's
`courseName`; pass `""` when none is selected, which the prompt builder already
drops.

**R4e. The embedded provider short-circuits.** The reused action returns
`{ error }` outright for `provider === "embedded"`, and this feature takes its
provider from `getStoredProvider()` at dispatch - so an embedded-provider user
would otherwise get a resource failure notice on **every batch for the whole
session**. Instead: return `{ resources: [], degraded: true }` with every row set
to `done`, and show the standing hint once. The embedded engine makes no network
call; this is a capability limit, not a failure, and must not go through the
per-batch notice channel.

**R4f.** Keep up to 3 links per post by slicing the returned array.
`MAX_ITEMS_PER_CONCEPT = 4` is a private module constant of a `"use server"`
file and cannot be exported; do not add a parameter for it. The 4th candidate has
already passed all three gates and discarding it costs nothing.

---

## 4. The queue

**R5. The resource drain is SELF-KICKING, not a third ticker-driven loop.**

Extraction polls a Worker ticker because its producer mints frames
asynchronously. Drafting is fed from inside extraction's await. The resource
queue is fed by exactly three explicit events - a reply landing, `Find
resources`, a per-row `Retry` - so it needs no idle path at all:

```ts
const enqueueResources = (ids) => { push(ids); if (!inFlightRef.current) void drain(); };
// drain(): while queue non-empty and not capture-busy -> splice -> dispatch -> merge; then exit.
```

**`shouldTickerRun` is NOT modified.** A third ticker participant would recreate
the exact coupling that blocked the last push (the ticker sleeping while work is
pending), and a drain with no idle path satisfies AC8f by construction rather
than by remembering to. **Say this in the brief** - an implementer reading AC8f
next to `runDraftLoop` will otherwise "correctly" add a ticker.

The StrictMode epoch machinery is also unnecessary here: nothing suspends across
the remount, so `loopsActiveRef.current` checked after each await is sufficient,
and the worst case of getting it wrong is one duplicate batch rather than a
permanent hang.

**R6. The trigger.** The drafting loop enqueues a row at exactly one point: after
`applyReply` lands a **model-authored** reply. Never on the edited-during-dispatch
discard path, which re-applies the user's own text and searched nothing new. A
row that never drafted, or that the user wrote by hand, is reachable only through
`Find resources` and per-row `Retry`.

**R7. Guards - two to NOT copy, and one that is missing.**

- **No `tableEpochRef` guard.** The extraction loop needs one because
  `mergeIncoming` *creates* rows, so a stale batch could resurrect deleted posts.
  `applyResources(id, ...)` is an id lookup that returns early on a miss; after
  `clearTable` every id misses and nothing lands. Copying the guard would be
  actively wrong, because `redraftAll` bumps that **same shared counter** without
  deleting anything - an epoch-guarded resource batch would be thrown away every
  time the user redrafts, discarding a completed grounded search for rows that
  still exist and whose post text did not change.
- **No `editSeq` guard.** That counts *reply* edits. Resources are keyed to the
  post. The two writes touch disjoint fields and cannot clobber each other;
  gating on it would discard good resources because the instructor fixed a typo.
- **A `resourceSeq` guard IS required, and the AC previously missed it.**
  Sequence: `Find resources` re-queues a row that already has resources; while
  the search is in flight the instructor removes a bad link; the batch lands;
  `applyResources` replaces the array; **the removed link is back.** Reachable
  from both R11's bulk control and R9's per-row Retry. So: a per-row
  `resourceSeq` in `useReplyRows.ts` mirroring `editSeqRef` exactly, bumped by
  `removeResource`, snapshotted at dispatch, checked before `applyResources`.

**R8. Resources survive a redraft.** A redraft rewrites `reply` only.
`resources` is untouched and is **not** re-searched by `markDrafting`,
`applyReply` or `redraftAll` - they were found for the post, and the post is what
they are relevant to. `Redraft every reply`'s confirm text must not imply
otherwise.

---

## 5. The copy path - the one that would ship dead

**R9. `handleCopy` must carry the resources.** It is currently one line,
`navigator.clipboard.writeText(row.reply)`, and copy is the **only** way anything
leaves this feature. REGRESSION 367 records **four** separate defects of exactly
this shape shipping green in this same feature. This is R-E's must-not-omit line.

**R9a.** Both `handleCopy`'s early return and the button's `disabled` prop become
`!row.reply && !(row.resources?.length)`. A row whose draft failed but whose
resources landed currently has a dead copy button.

**R9b.** The clipboard text is built by a PURE function in the lib -
`replyClipboardText(row): string` - following `cell-copy.ts:346,370`, so it is
testable in a node-env suite. **Bare URLs on their own lines, never markdown**: a
discussion composer pastes `[title](url)` verbatim. The `note` is **not** copied -
it is an affordance for choosing, not something to paste to a student.

Frozen literal oracle for the test, all three shapes, no trailing newline in any:

| input | output |
| --- | --- |
| reply only | `"<reply>"` |
| reply + 2 resources | `"<reply>\n\n<t1> - <u1>\n<t2> - <u2>"` |
| resources only | `"<t1> - <u1>"` |

---

## 6. UI

**R10.** Resources render beneath the reply textbox, never inside it. Each is a
link with `target="_blank"` and `rel="noopener noreferrer"`, carrying a
`ghBadgeNeutral` badge from `RESOURCE_KIND_LABELS`. **Never `ghBadgeSuccess`** -
green reads as "checked" whatever the word says, and R0-5 is why that would be a
lie.

Each has a one-click remove: the instructor is the last line of defence against a
link that resolves and is still wrong. Removal persists.

`searching` shows `Finding resources...` beneath the reply; `failed` shows the
real reason plus a per-row `Retry` that re-queues only the resource pass.

**R10a. The standing hint**, near the table, once:

> `Links are found by search and checked for a response, not read. Open anything
> you are about to send.`

**R11. `Find resources`** enqueues every row with `resourceState === "idle"` and
a reply. It never enqueues `"done"` (searched, whether or not it found anything,
whether or not the user then emptied it) and never `"searching"`. `"failed"` is
reachable only through that row's own `Retry` - mirroring the bulk-versus-targeted
policy AC28a already established for drafting.

**R11a. `undefined` counts as `"idle"` here, and reading R11 literally would
make the control useless.** A freshly captured row - and any reply the
instructor typed by hand - has no `resourceState` at all until something touches
it. R3c-i deliberately keeps that absent rather than coercing it on load. So an
eligibility test that matches only the literal string `"idle"` can never reach
exactly the rows R6 says are reachable *only* through `Find resources` and
per-row `Retry`, and the button would appear to do nothing on a table that has
never searched.

**R11a.** On a 500-row table this enqueues 500 ids and drains 5 per request; at
~25s per request that is over 40 minutes of the serialized action lane. The
control states the row count it is about to search, and the drain stays
interruptible. Whether it needs a confirm step is a UX-pass question.

---

## 7. File ownership

**Wave 0 - alone, blocking. R-A is the group's LARGEST risk, not its smallest.**
It edits a file REGRESSION 324 covers with 14 checks and 11 sabotage mutations,
including two prompt strings whose exact pairing is what keeps the 51%
dead-link rate from returning.

| Set | Files |
| --- | --- |
| **R-A** | `src/lib/resource-kind.ts` (new) + test; `src/app/actions/learning-resource-links.ts` + `learning-resource-links.test.ts` - delete the private coercion, adopt the leaf, add the resource-profile argument, widen both prompt strings behind it, and **pin that the three-kind default is unchanged for the Learning Resources call site** |

**Wave 1 - three concurrent, disjoint.**

| Set | Files |
| --- | --- |
| **R-B** | `src/app/components/recording/discussion-capture.ts` + a **NEW** `discussion-capture.resources.test.ts`. Does NOT touch `shouldTickerRun`, `discussion-capture.test.ts`, `.rows.test.ts` or `.dedupe.test.ts`, and imports no helper from any sibling `*.test.ts` |
| **R-C** | `src/app/actions/discussion-replies.ts` + test; `src/lib/discussion-reply-prompt.ts` |
| **R-E** | `DiscussionRepliesPanel.tsx`, `DiscussionReplyRow.tsx`, `DiscussionRepliesPanel.module.css` |

**Wave 2 - follows R-B and R-C.**

| Set | Files |
| --- | --- |
| **R-D** | `src/app/components/recording/useReplyResources.ts` (**new**), `useReplyRows.ts`, and ~35 lines of wiring in `useDiscussionReplies.ts` |

**`src/app/page.module.css` and `src/lib/resource-links.ts` are edited by
NOBODY.**

**R12. Why `useReplyResources.ts` exists.** `useDiscussionReplies.ts` is at
**892** lines. The resource queue's additions, sized against that file's own
comment density, are **186-272** lines - landing at 1078-1164 against a 1000-line
ceiling. Measured, not estimated. Extracting the queue leaves ~35 lines of
wiring in the orchestrator (~927 total).

Its contract, sealed so R-E can be written against it in parallel:

```ts
export interface UseReplyResourcesReturn {
  resourceQueueSize: number;
  searchingResources: boolean;
  enqueueResources: (ids: string[]) => void;
  findMissing: () => void;
  retryResources: (id: string) => void;
}
```

**R12a. `UseDiscussionRepliesReturn` gains FOUR fields, not three.**
`resourceQueueSize`, `findMissing` and `retryResources` were sealed above; a
fourth, `removeResource`, is required and was missed. R10 makes per-resource
removal a one-click affordance and R7 makes `removeResource` the thing that
bumps `resourceSeq` - so without it on the return, the mutator this AC mandates
is unreachable from the panel and the guard it feeds can never fire. It is a
plain forwarded mutator with no queue involvement.

**Do not generalise the drafting queue and the resource queue into a shared
abstraction in this group.** That is a refactor of shipped concurrent code whose
only tests are pure predicates, and consolidating two implementations makes the
tests that compared them tautologies. If it is worth doing it is its own group,
with a frozen literal oracle.

---

## 8. Limits this group's REGRESSION entry must state

- No link produced by this feature was ever opened, by a human or a test. "It
  answered an HTTP request" is the whole of what is known about any of them.
- **`"news"` and `"paper"` were never observed coming back from a real grounded
  call.** The type, the coercion and the prompt all admit them; nothing proves
  the model emits them.
- **The Learning Resources page's behaviour is ARGUED unchanged, not measured.**
  The prompt widening sits behind a default-preserving parameter and a test pins
  the default, but no one ran that page.
- The 60s-cap risk as originally stated does not exist under the single-call
  design - but **the serialized Server Action lane does**, and nothing here
  measures what a 5-post resource batch does to extraction latency during a live
  capture. The capture-busy yield (R0-4) is read-verified only.
- Bot-blocked hosts silently drop good resources; there is no "checked but
  blocked" tier to distinguish that from "dead".
- vitest renders no components, so the resource list's markup, its links, the
  remove control and the copy behaviour are verified by reading only.

---

## 9. Trade-offs rejected

1. **Per-post `Promise.all` over the action** - R0-3, R0-4.
2. **Chunking the batch to stay under 60s** - the single-call shape already fits
   the envelope a shipped feature was sized for; chunking would double the
   reachability spend to solve a problem that only exists under the fan-out.
3. **A third ticker-driven loop** - R5.
4. **Putting `ResourceKind` in `src/lib/resource-links.ts`** - R1.
5. **Importing `ResourceLink` from `learning-resource-links.ts` into client code,
   even as `import type`** - it makes a `"use server"` module part of a client
   file's declared surface, which is what the registry-client-bundle-guard
   lesson is about. The leaf costs 30 lines and removes the question.
6. **Copying `runDraftLoop`'s epoch and edit-seq guards** - R7. Both would
   silently discard completed work, and copying the neighbouring loop is the
   obvious move that looks right.
7. **Generalising the two queues** - R12.
8. **Any UI string implying verification, and any green badge** - R0-5, R10.

---

## 10. Errors in the first draft of this document

Recorded, not deleted, because each would have produced a green build doing the
wrong thing - and because the pattern is the point.

1. **It named a type that does not exist.** `ResourceKind` has zero hits in the
   repo. The draft sent implementers to `src/lib/resource-links.ts`, whose
   `ResourceLink.kind` is `"tool" | "field"` - so an implementer would have
   widened the wrong union or invented a type. Both compile.
2. **It would have shipped the widening dead.** Changing the type and the
   coercion without the prompts yields `"news"` in zero percent of real runs,
   with a passing round-trip test. Exactly the failure R0-1 is written about,
   reintroduced two sections later.
3. **It mandated a fan-out on a false premise.** It claimed per-post calls were
   needed to keep the corroboration boundary. The boundary is per-concept and one
   call preserves it; the fan-out would have cost five reachability budgets, five
   retry clocks, and two minutes of the serialized action lane - starving the
   extraction loop during a live capture.

---

## 11. Facts established by the step-10 research pass

Checked 2026-08-31 against the tree and current vendor sources. Recorded here so
the next group cites them rather than re-deriving them.

**Confirmed - the capture-busy yield is genuinely necessary (R0-4).** Next.js
documents that client-dispatched Server Functions are serialized
(`node_modules/next/dist/docs/.../07-mutating-data.md:206`), and it is not
bypassable from our side: `app-call-server.js:14-26` wraps every dispatch in
`startTransition` into a module-level singleton queue, so even a bare `await`
participates. A resource batch therefore really does hold the single lane and
really would starve extraction. Hedge worth knowing: the doc calls this "an
implementation detail [that] may change", so the yield should not be removed on
the grounds that it looks redundant.

**Confirmed - the compound CSS selector is required, not stylistic.** The
specificity arithmetic (0-1-2 beating 0-1-1) is right, and Next explicitly
declines to guarantee stylesheet emission order - dev differs from prod and the
default `cssChunking: true` merges "in any order". A 0-1-1 tie would be
undefined behaviour, not merely fragile.

**Confirmed - `React.memo` on the row still bites.** Every new prop is
reference-stable and every new mutator preserves the identity of untouched rows.
The architect predicted this would break once, and it did; it did not break
again.

**Confirmed - the bundle is clean.** `resource-kind.ts` has zero imports, and no
client file imports `learning-resource-links.ts` even as a type.

**Corrected - grounding URIs.** `groundingChunks[].web.uri` are Google redirect
URLs, not destination URLs. This is **not** a risk in this design, because the
shipped link is always the model's own `item.url` and the redirect host fails
corroboration - so a redirect can never survive as a link. Recorded because a
future change that started trusting `groundingChunks` directly would ship
redirect URLs to students.

**Corrected - the requested temperatures do not apply.** `normalizeGenerationConfig`
strips sub-1.0 temperatures for Gemini 3.x, so **both** the grounded prose call
and the URL-structuring call run at 1.0 - including the step that transcribes
URLs, where determinism would be most valuable. Pre-existing and inherited from
the reused action; it is also what drives the empty-result retry that can double
wall clock.

**Model id is current.** `gemini-3.1-flash-lite` is GA; only the `-preview` id
was retired (2026-05-25) and this repo does not use it.

**Timing, with the inputs stated.** A 5-post batch is ~8-18s typical and about
**52s worst case inside the design's own budgets** - a 40s retry budget plus a
12s reachability batch - against a 60s platform cap. **The 80s hole is real**:
`callLlm` honours `Retry-After` up to 20s four times and the retry budget cannot
see inside a single call. Inherited from REGRESSION 324, but now reachable up to
100 times in a 500-row sweep, and no `maxDuration` is declared anywhere on this
action's path.

**Storage, corrected upward.** `ta-rec-disc-table` grows from ~2.68M to ~3.18M
characters at the 500-row ceiling - **+19%**, about 64% of a conservative 5M
budget, and the origin is shared with **230** `ta-` keys, not the 40-plus an
earlier draft assumed. A realistic table is ~136KB, so this is not a blocker; it
moves the worst case from half the budget to two thirds, and the key that
eventually throws will still probably belong to some other feature.