# Message replies: record a student inbox, read the threads, draft a reply to each

Owner request (2026-09-03): "add another recording tool: this time for
recording and replying to student messages."

Revision 5 (as built: after the verifier, follow-up architect and follow-up
UX passes on the first wave). Sibling of the discussion-replies tool
(docs/discussion-reply-capture-acceptance-criteria.md, REGRESSION 367),
built by COPYING its row-typed machinery and IMPORTING its row-free
machinery, exactly as the grading tool did. Where this document is silent,
the discussion-replies contract applies verbatim.

## 0. What exists and what this reuses

Import as-is from `src/app/components/recording/` (row-free, already
imported cross-directory by the grading tool): `useDiscussionCapture`;
from `discussion-capture.ts` every frame constant, `resolveTargetWidth`,
`computeFrameSignature`, `framesDifferEnough`, `packFrameBatch`,
`accumulateDroppedFrames`, `normalizeForMatch`, `authorsMatch`,
`postSimilarityDistance`, `partitionDraftOutcome`,
`isDispatchableDraftItem`, `draftDispatchForce`, `shouldLoopContinue`,
`shouldTickerRun`; `useDiscussionNotices`, `useDiscussionLoopWake`,
`useDiscussionLoopStarter`, `useDiscussionCourses`,
`discussion-knowledge-context.ts` (already generic), `captureLiveRegion.ts`, `RunLogRow`; from
`discussion-reply-controls.ts` ONLY `formalityIndexFromStop`,
`formalityStopFromIndex`, `formalityAriaValueText` (keyed to the shared
`ReplyFormality`; `ingredientsRenderValue` is closed to the discussion
ingredient union and is COPIED into `message-reply-prompt.ts` re-typed to
`MessageIngredient`); `compareNameKey`, `filterRowsByQuery` (generic over
the row; the STATUS filter family is NOT copied - M18 defines its own); `PREFIX_TOKENS`,
`SIMILARITY_THRESHOLD`, `MIN_TOKENS_FOR_SIMILARITY`, `MAX_TABLE_ROWS`;
`greetingNameFromAuthor` (`src/lib/person-name.ts`); `isConfirmArmed`
(`src/app/components/content-tab/modules/confirmArming.ts`);
`EXTRACT_BATCH_SIZE`, `DRAFT_BATCH_SIZE`, `MAX_POST_CHARS`, `ReplyFormality`,
`REPLY_FORMALITY_STOPS`, `REPLY_FORMALITY_LABELS` from
`src/lib/discussion-reply-prompt.ts`. That file is NOT edited by this
wave: `ReplyCompositionSettings` has a closed `ingredients` union and
`formalityClause`/`ingredientClause` are module-private, so
`message-reply-prompt.ts` defines its own `MessageCompositionSettings {
ingredients: readonly MessageIngredient[]; addressByName: boolean;
formality: ReplyFormality }`; `formalityClause` (discussion-reply-prompt.ts)
and `tokenLevenshtein` (discussion-capture.ts) are EXPORTED from their
owners and imported - one prompt rule, one distance - and only the
audience-typed greeting block is copied.

Copy and re-type (drop the resource lane and the thread-position lane
while copying; budgets in section 9): `ReplyRow` + serializers,
`useReplyRows`, `runDraftLoop` (its deps hard-require the resource hook),
`useDiscussionReplies`, `useDiscussionRepliesRunLog`,
`useDiscussionReplyFiltering`, `useDiscussionSessionSummary`,
`discussion-replies-log.ts`, `mergeCapturedPosts`, `sortReplyRows`,
`swapAdjacentRows`, `replyClipboardText`, `tableClipboardText`,
`draftingArmSignature`, `useDiscussionKnowledgeContext` (copied as
`useMessageKnowledgeContext`: it hardcodes `detail.view !== "discussions"`
and the `ta-rec-disc-kb-context-label` key, so the copy is guarded on
`detail.view === "messages"` and keyed to `ta-rec-msg-kb-context-label`),
`readLocalStorage`/`writeLocalStorage`/`LOOP_IDLE_POLL_MS` and a re-typed
`coerceReplyComposition` from `discussion-draft-loop.ts`, and the four
`DiscussionReply*.tsx` components. The discussion status-filter family
(`ReplyStatusFilter` and friends, a closed five-member union) is neither
imported nor copied - M18 defines its own.
No generic-parameter refactor of the discussion hooks: the repo's two
generic precedents are pure functions, never hooks, and the discussion
files are mid-change for another feature.

Canvas Inbox is reachable today: `src/lib/canvas/inbox.ts`
(`listConversations` - institution-wide, `per_page=50`, page 1 only, no
course filter; `getConversation` with `selfId`; `replyToConversation`,
which re-fetches and so marks the conversation read) behind
`src/app/actions/canvas-inbox.ts` (`listConversationsAction(acronym?)`,
`getConversationAction`, `replyToConversationAction(id: number, body,
acronym?)`). Drafts: `saveMessageDraftAction(summary, payload)` in
`src/app/actions/messaging.ts` with `MessageDraftPayload` (`kind`, `body`,
`conversationId: string`, `institution`, `title`, `recipientName`,
`context`); `postMessageDraftAction` rejects a `reply` whose
`conversationId` is not `/^\d+$/`. `MessageDraftsTab.tsx` reviews and sends
each draft with its own confirm.

## 1. Goal

Record the screen while scrolling a student inbox (Canvas Inbox by
default; any message list works because extraction reads pixels), read
every conversation off the frames, draft one reply per thread that answers
the student's latest message in the context of the whole thread, and let
the instructor copy it, save it as a reviewable draft, or - when the
thread is matched to a real Canvas conversation - send it from inside the
app after an explicit arm-and-confirm. Every control persists; every run
has a downloadable log; nothing is ever sent without the confirm click.

## 2. Vocabulary

- **Message**: one dated body from one sender. `fromMe` is DERIVED on the
  client (`authorsMatch(sender, instructorName)`) - never asked of the
  model, because the inbox does not mark own messages.
- **Thread** (the row): the messages that share one conversation - one
  subject and one student - ordered by `sentAtMs`. The **latest incoming**
  message is the newest with `fromMe === false`. A thread whose newest
  message is the instructor's own is **answered**: it never enters the
  automatic draft queue and shows an `Answered` badge; Redraft still works.
- **Student**: the thread's non-instructor participant.
- **previewOnly**: a thread known only from the list pane (subject,
  student, one-line preview) - never drafted until a thread-pane frame
  supplies a message body.

## 3. Group W - wiring and canaries

Files: `src/app/components/RecordingTab.tsx`, `src/lib/recording-launch.ts`
+ `.test.ts`, `src/app/components/recording/recording-split.structure.
test.ts`, `src/app/components/ui/buttonVariant.test.ts`,
`src/app/components/recording/runLogRow.test.ts`,
`src/app/components/message-replies/message-replies.structure.test.ts`
(NEW), `docs/REGRESSION.md`, `docs/recording-controls-ux-acceptance-
criteria.md` (prose counts only).

- **M1.** Tenth sub-tab: key `messages`, label `Message replies`, strip
  position directly after `["discussions", "Discussion replies"]` (the
  strip tuple stays on ONE physical line). In the `recView` UNION the new
  member is APPENDED after `"moduledeck"` - the module-deck structure test
  anchors on the literal `"record" | "discussions" | "speed"` and must
  keep matching. Restore guard gains `v === "messages"`. New
  `<div role="tabpanel" id="rec-panel-messages" aria-labelledby="rec-tab-
  messages" style={{ display: recView === "messages" ? undefined : "none"
  }}>` (the display:none idiom every sibling panel carries - without it the
  panel renders under every other view) with `<MessageRepliesPanel active={active && recView ===
  "messages"} />` mounted after the module-deck panel. `RecordingLaunchView`
  and `RECORDING_LAUNCH_VIEWS` gain `"messages"` (appended) and
  `recording-launch.test.ts` gains positive cases mirroring the
  `moduledeck` ones (the launch test has no count assertion, so without
  these the union grows uncovered). `RecordingTab.tsx` is 881 lines and
  lands near 890; the structure test fails at 1001 with no warning band.
- **M2.** `recording-split.structure.test.ts` moves FIVE numbers: strip
  entries 9 -> 10; `role="tabpanel"` 8 -> 9; `panelTargets.size` 8 -> 9
  with `"messages"` added to its `keys` array; the `aria-labelledby` loop
  7 -> 8; the restore-guard value list gains `"messages"`. Its
  `expectedKeys` inventory (62 keys, exact-set) and `discKeys` (15) do
  NOT change - that scan only sees `recording/` and `RecordingTab.tsx`, so
  every `ta-rec-msg-*` key lives in the new directory and is pinned ONLY
  by M3's directory-local canary.
- **M3.** `message-replies.structure.test.ts`, mirroring
  `module-deck-capture.structure.test.ts`: mount reachability (import,
  `<MessageRepliesPanel`, the `active && recView === "messages"` idiom),
  union membership on the union's own line, the restore guard separately,
  the strip entry, the display:none idiom on the new tabpanel
  (`toMatch(/id="rec-panel-messages"[\s\S]{0,200}display: recView ===
  "messages"/)`), a directory-wide `ta-` key ORDINAL canary (exact
  `distinctKeys.size` for the key list in M5), a `toContain` naming at
  least one extracted sibling file, AND its own `readdirSync` 1000-line
  ceiling loop over the directory (nothing else covers it).
  `buttonVariant.test.ts`: `SECTION_4_DIRS` gains
  `"src/app/components/message-replies"`; `FROZEN_PRIMARY_SITES` gains exactly
  these entries, keyed by FULL repo-relative path exactly like the existing
  ones (`"src/app/components/message-replies/MessageReplyToolbar.tsx": 1`):
  `MessageReplyToolbar.tsx: 1` (`Draft the missing replies`),
  `MessageRepliesPanel.tsx: 1` (Start/Stop capture via `variantFor` - CC1:
  a live capture beats everything, so the panel always has exactly one
  filled button in every state) and `0` for `MessageCaptureSettings.tsx`,
  `MessageThreadTable.tsx`, `MessageThreadRow.tsx`,
  `MessageThreadRowActions.tsx`. `runLogRow.
  test.ts`: `RUN_BEARING_PANELS` gains
  `"src/app/components/message-replies/MessageRepliesPanel.tsx"` and the
  test title "five run-bearing panels" becomes six (exactly
  one `<RunLogRow` with `summary=` and `onDownload=`; the "Download run
  log (CSV)" literal never appears in the panel). No modal ships, so
  `modalAdoption.wiring.test.ts` counts are untouched; the repo-wide
  `confirmArmButtons.test.ts` rule (no `onBlur` on an element with a
  consequence `aria-describedby`) binds M14. No workflow step is
  registered (`HEADLESS_SAFE_STEP_TYPES` stays 154).
- **M4.** REGRESSION entry; `docs/recording-controls-ux-acceptance-criteria.
  md`:747 ("nine-and-nine") corrected to ten-and-nine. The dated 2026-09-02
  baseline in `docs/REGRESSION.md` ("all nine inner views") is a historical
  record and stays as written.

## 4. Persistence (Group C owns the writes; Group L owns the serializer)

- **M5.** Keys, all `ta-rec-msg-<control>` with a read AND a write, exact
  ordinal pinned by M3: `course`, `instructor-name`, `ingredients`,
  `formality`, `address-name`, `signoff`, `skip-answered` (`"1"`/`"0"`,
  default `"1"`), `thread-expand` (`"1"`/`"0"`, default `"0"`), `save-video`,
  `table`, `sort`, `filter`, `status-filter`, `kb-context-label` - fourteen.
  No `capture-interval` (the discussion tool persists none).
- **M6.** `MessageThreadRow` (`message-replies/message-serialization.ts`):
  `{ id, subject, student, messages: ThreadMessage[], omittedMessages:
  number, messagesTrimmed?: true, previewOnly?: true, answered: boolean,
  reply, state: "pending" | "drafting" | "ready" | "failed", error?,
  userEdited, skipped?, handledAt?, firstSeenAt: number, order: number,
  canvas?: { conversationId: number; matchedBy: "subject+student" |
  "student+count"; matchedAt: number; subject: string; participants:
  string[]; messageCount: number }, savedDraft?: { id: string; at: number },
  sent?: { at: number; conversationId: number; messageCount: number;
  messageId?: number }, matchOutcome?: "none" | "ambiguous", sendAttempt?:
  { at: number; conversationId: number }, sendError?: string }` -
  `matchOutcome` is written by every match pass for each unmatched
  non-preview row it examined and cleared when `canvas` is set;
  `sendAttempt` is written before the send fetch and cleared on success;
  `sendError` carries the M17 failure text until a Check confirms delivery.
  A `previewOnly` row survives a reload with zero messages. where `ThreadMessage = { sender, text, fromMe,
  sentAt?: string, sentAtMs?: number, precision: "minute" | "day" | "none"
  }`. `MESSAGE_TABLE_VERSION = 1`; serialize spreads; deserialize builds an
  explicit coerced object (`coerceThreadMessages` drops entries whose
  `text` is not a non-empty string, `fromMe` is `v === true`, `sentAtMs`
  kept only when finite; a row that coerces to zero messages is dropped)
  and returns `[]` on a version mismatch. Caps: `MAX_THREAD_MESSAGES = 12`
  (keep the newest, count the rest in `omittedMessages`),
  `MAX_MESSAGE_CHARS = 800` for every stored body except the latest
  incoming, which keeps `MAX_POST_CHARS`; `MAX_TABLE_BYTES = 3_500_000` -
  when the serialized JSON exceeds it, oldest threads first have
  `messages` reduced to the latest incoming only and get
  `messagesTrimmed: true` until it fits. `MAX_TABLE_ROWS` reused.

## 5. Capture and extraction (Group L leaves; Group A actions)

- **M7.** Capture reuses `useDiscussionCapture` and the frame constants
  unchanged; the Capture fieldset is the discussion tool's.
- **M8.** `buildMessageExtractionPrompt(courseName, frameCount)` in
  `src/lib/message-reply-prompt.ts`, structured like
  `buildPostExtractionPrompt`: HOW THE IMAGES RELATE, THE TWO PANES (a
  conversation list on the left - subject, participants, one-line preview;
  an open conversation on the right - dated message bodies), WHAT COUNTS
  AS A MESSAGE, SUBJECT (thread-level; repeat it on every entry of that
  thread), SENDER (the name shown, verbatim - there is no "you" marker
  and the model must not guess direction), TIMESTAMPS (`sentAt` verbatim
  as shown, omitted when absent), TEXT THAT IS CUT OFF, IF THERE ARE NO
  MESSAGES (`[]`), OUTPUT: `{"subject","sender","sentAt","text","pane"}`
  only, `pane` exactly `"list"` or `"thread"`. A frame showing only the
  list yields `"list"` entries; neither pane yields `[]`.
  `extractStudentMessagesAction` in `src/app/actions/message-replies.ts`
  mirrors `extractDiscussionPostsAction` (batch, wire budget,
  `MAX_POST_CHARS` truncation, lenient parsing, empty-field filtering,
  `pane` coerced to `"thread"` when unrecognised) and returns `sender`
  verbatim.
- **M9.** Threading (`message-replies/message-thread.ts`, pure):
  - Thread key: `normalizeForMatch(subject)` when non-empty and not
    `"(no subject)"`, else the sentinel `""`. A message joins the thread
    whose key matches AND whose `student` satisfies `authorsMatch` (for
    `""`-key threads always; otherwise when `student` is set). Two
    `""`-key threads with different students never merge. A `fromMe`
    message joins by key alone and inherits the thread's `student`; a
    `fromMe` message with a `""` key and no thread to join is dropped.
  - `fromMe = instructorName.trim().length > 0 && authorsMatch(sender,
    instructorName)`. While `instructor-name` is empty every message is
    incoming, no thread is answered, and the panel shows one `fieldHint`:
    `Set your Canvas display name so replies you already sent are
    recognised.`
  - `isSameMessage(a, b)`: `authorsMatch` AND `messageSimilarityDistance
    <= SIMILARITY_THRESHOLD`, where `messageSimilarityDistance` is NEW in
    `message-thread.ts` (built on the imported `postSimilarityDistance`
    tokeniser and constants) and strips a leading quoted
    block (lines matching `/^\s*(>|On .* wrote:)/`) before tokenising and
    compares BOTH the first and the last `PREFIX_TOKENS`, taking the max.
    Timestamps confirm, never distinguish: a match is vetoed only when
    both sides parse to `minute` precision more than 5 minutes apart.
    Below `MIN_TOKENS_FOR_SIMILARITY` tokens, normalized equality is
    required. Merge keeps the longer read; a `"list"` preview never
    overwrites a `"thread"` body. A `"list"` entry never becomes a message:
    it creates or confirms a thread's subject and student and sets
    `previewOnly` on a thread with no `"thread"` entries yet.
  - `parseInboxTimestamp(raw, capturedAtMs)`: "Sep 3 at 2:14pm" / "Sep 3,
    2025" -> `minute`/`day` (year from `capturedAtMs`, rolled back one year
    when the result is more than 7 days in the future); "Today"/"Yesterday"
    -> that date at 12:00 local, `day`; a bare "2:14 PM" -> the capture
    date, `minute`; anything else -> `precision: "none"`, `raw` kept. `raw`
    is what the UI and log render; `ms` is only a sort key.
  - Ordering inside a thread: ascending `sentAtMs`; `none`-precision
    entries keep first-seen order immediately after the last dated
    message that preceded them. Threads: descending latest-incoming `ms`,
    then descending `firstSeenAt`, then ascending `id`. Row ids
    `msg-${now}-${counter}`.

## 6. Drafting (Group L; Group A)

- **M10.** `buildMessageReplyPrompt(threads, courseName, styleBlock,
  composition, knowledgeContext?)` mirrors `buildReplyDraftingPrompt`'s
  block order with the audience stance replaced by one fixed line: `You
  are the instructor replying privately to one student who wrote to you.`
  Each thread renders oldest-first as `[student]` / `[you]` labelled
  lines under `THREAD n`, with `MAX_DRAFT_THREAD_CHARS = 2400` applied
  after `MAX_POST_CHARS`: the latest incoming message is never truncated;
  older messages are dropped whole, oldest first, replaced by one line
  `[... N earlier messages omitted]`. The reply must answer the LATEST
  student message. OUTPUT keeps the discussion key verbatim - `{"post":
  <the THREAD number>, "reply": "..."}` - so the seen-position dedupe and
  the length-equal fallback are reused unchanged; no `concepts`. The
  prompt says `Do not write a closing signature, sign-off or your name.`
  `MESSAGE_INGREDIENTS = ["acknowledge", "answer", "next-step",
  "offer-help", "deadline-reminder"]` with stem-completing labels
  `MESSAGE_INGREDIENT_LABELS = { acknowledge: "an acknowledgement of what
  they asked", answer: "a direct answer to their question", "next-step":
  "the next step they should take", "offer-help": "an offer to help
  further", "deadline-reminder": "a reminder of the deadline, only if one
  applies" }`, default selection `["acknowledge", "answer", "next-step"]`;
  `ingredientClause` is rewritten for this list (no audience parameter).
  Zero selected is legal; when `answer` is unselected the cluster shows one
  `fieldHint`: `Replies will not try to answer the question directly.`
  Formality and address-by-name reuse the discussion clauses.
- **M11.** Sign-off is appended IN CODE, never by the model: `applySignoff(reply,
  signoff)` (section 9) appends `\n\n${signoff.trim()}` when `signoff` is non-empty and the
  drafted text does not already end with it; the row stores the reply
  WITH the sign-off so Copy, Save as draft and Send are byte-identical.
  Control: `<TextField size="small" label="Sign off with"
  placeholder="Best, Dr. Ruiz" className={controls.fieldLg} />` on its own
  `.adaptRow` directly under the composition row in the Replies fieldset,
  key `signoff`. The instructor-name field sits beside it: `label="Your
  name in Canvas"`, key `instructor-name`.
- **M12.** `draftMessageRepliesAction` mirrors `draftDiscussionRepliesAction`
  (batch 5, composition and knowledge coercion at the boundary, positional
  ids, `withConcepts` deleted, and the writing-style block resolved
  SERVER-SIDE via `getWritingStyleBlock(user.id)` after `requireOwner` -
  the client never sees the sample and passes no style argument). The draft loop, wake/ticker, greeting-name
  gating and per-row Redraft are the discussion tool's, copied per
  section 0. `Skip answered threads` (key `skip-answered`, default on)
  keeps `answered` threads out of the automatic queue; `previewOnly`
  threads never enter it, and `Draft the missing replies` never drafts a
  thread with no incoming message at all (every line `[you]`).

## 7. Outputs (Group C; Group A for the Canvas seam)

- **M13 - row layout.** Two-`<tr>` shape as the discussion row: header bar
  columns First / Last / Subject / Status / Actions; continuation row with
  the thread in the post block's existing fixed-height scroller
  (`role="group"`, `aria-label="Thread with <student>"`), messages
  oldest-first, each preceded by `<p className={styles.ghMeta}>{fromMe ?
  "You" : student} - {sentAt raw}</p>`, scrolled to the bottom on mount.
  Messages before the latest incoming sit inside `<details><summary>
  Earlier in this thread (N)</summary>` whose default open state is the
  table-level `thread-expand` checkbox (`Show the whole thread`, Replies
  fieldset); a one-message thread renders no `<details>`. Earlier bodies
  carry `.threadEarlier` (`color: var(--text-secondary)`, defined in a new
  `MessageReplies.module.css`); `ghMeta`/`fieldHint` come from
  `../../page.module.css` exactly as the discussion row imports them; only
  the latest incoming is at `--text-primary`. No new colour, no icon. Badges: `In Canvas` (`ghBadgeNeutral`) when matched; `Answered`
  (`ghBadgeNeutral`) REPLACES the pending state badge when answered; `Sent
  <time>` (`ghBadgeSuccess`) replaces the handled badge when `sent` is set.
  A capped thread prints `N older messages were not kept.` under the
  summary; a thread with no incoming message dims every line; an absent
  `sentAt` prints no separator. The `Show the whole thread` checkbox
  re-seeds every row's `<details>` when toggled (keyed on the value).
- **M14 - controls.** Visible per-row cluster, in order: `Copy reply`
  (outlined, unchanged), `Save as draft` (outlined), `Send`
  (`ConfirmArmButtons`, tone `danger`, `idleVariant="outlined"`,
  `idleLabel="Send"`, `confirmLabel="Confirm send"`, consequence `This
  sends the reply to <student> in Canvas. It cannot be undone.`),
  `Redraft` (`ConfirmArmButtons`, tone `warning`, outlined idle, existing
  consequence), then the hover-reveal reorder pair and the More menu.
  `Skip - no reply needed`, `Mark as handled` and `Remove` live in More,
  as in the sibling. One armed control per row: a row-local `armed:
  "send" | "redraft" | null`; the arm signature is `JSON.stringify([row.id,
  armedKind, row.reply])` compared through `isConfirmArmed`, so any edit
  disarms by construction and only one consequence `<p>` ever renders. No
  row control is `contained` while idle (`Draft the missing replies`, rendered in
  `MessageReplyToolbar.tsx`, is the feature's only primary).
- **M15 - Match to Canvas.** Zero clicks in the common case: matching runs
  automatically for every unmatched, non-preview thread when a course is
  selected - on capture stop and whenever a thread merges afterwards - and
  the toolbar offers a manual retry `Match to Canvas (N)` (outlined, N =
  unmatched non-preview threads, after `Draft the missing replies`,
  disabled at 0 with `title="Every thread is matched"`). Seam (Group A):
  `listConversations(code?, opts?: { courseId?: string; scope?: "unread" |
  "archived"; perPage?: number })` appends `filter[]=course_<id>` and
  `scope=` (the `grading-queue.ts:174` idiom) and follows `parseNextLink`
  (the URL template and pagination at `grading-queue.ts:161-174`) for at
  most 5 pages of 100; `listConversationsAction` gains the same
  options; existing callers are byte-unaffected. `courseId` comes from the
  selected course's `canvasUrl` via `/\/courses\/(\d+)/`; the institution
  acronym comes from `useInstitutionSelection()` (`src/lib/institutions.ts`,
  the hook `canvas-tab/inbox-panel.tsx` already uses - `canvas-core.ts` is
  server-only and never imported by a component), `undefined` when unset so
  the server default applies. Scope is NOT `unread`. Predicate
  (`message-replies/message-canvas-match.ts`, pure):
  `normalizeForMatch(conv.subject) === normalizeForMatch(row.subject)` AND
  `conv.participants.some((p) => authorsMatch(p, row.student))`; a row
  whose subject is empty or `"(no subject)"` matches on participant alone
  only when that match is unique across the list AND
  `Math.abs(conv.messageCount - row.messages.length) <= 1`, `matchedBy:
  "student+count"`. A unique match sets `row.canvas` with the snapshot in
  M6; zero or several set `row.matchOutcome` and the row shows one
  `fieldHint` under the actions cell ONLY once a pass has examined it:
  `none` - `Not found in your Canvas inbox - copy the reply and send it
  there yourself.`; `ambiguous` - `More than one Canvas conversation
  matches this subject and student - reply in Canvas.` The conversation
  list is cached for about 60 s and merges re-run only the pure predicate
  against the cache; stop and the manual retry refetch. A manual retry
  takes precedence over a background pass. Matching never sends anything.
- **M16 - Save as draft.** Enabled ONLY on a matched row with a non-empty
  reply (a reply draft without a numeric `conversationId` can never be
  posted); an unmatched row shows `Match this thread to Canvas before
  saving a draft.` Calls `saveMessageDraftAction(summary, payload)` with
  `summary = "Reply to <student> - <subject>"` and `payload = { kind:
  "reply", body: reply, conversationId: String(row.canvas.conversationId),
  institution: acronym, title: subject, recipientName: student, context:
  <oldest-first transcript> }`; stores `savedDraft` on the row; the row
  shows `Saved to drafts` with an in-app link (`openMessageDrafts()` in
  `src/lib/drafts-nav.ts`, a window event `page.tsx` listens for exactly
  like `knowledge-return.ts` - never an `<a href>` that reloads the app and
  kills a live capture). Toolbar
  `Save all as drafts (N)` (outlined; N = matched, drafted, unsent,
  unsaved, unskipped rows) - the per-draft confirm then happens in
  `MessageDraftsTab`, which already confirms each send.
- **M17 - Send.** Only on a matched row with a non-empty reply. On
  confirm: a per-row in-flight ref makes a second click a no-op; the arm
  clears on dispatch; `replyToConversationAction(Number(conversationId),
  reply, acronym)`. Success sets `sent: { at, conversationId, messageCount:
  conversation.messages.length, messageId: <last message id whose authorId
  === selfId, else omitted> }` and `handledAt`. Failure sets `sendError: "The
  reply may or may not have been sent - check the conversation before
  resending."` (persisted, so a reload mid-send still shows it - a row
  with `sendAttempt` and no `sent` on load gets the same text), is never
  auto-retried, refuses a second send while `sent` is set, and shows a
  `Check` control that
  calls `getConversationAction` and marks the row sent when a message
  exists whose `authorId === selfId` and whose body normalizes equal to
  the reply. No call to `setConversationStateAction` (the reply action's
  own re-fetch marks it read). No bulk send.
- **M18 - chips, sort, summary.** Status chips (`MessageStatusFilter`, a closed six-member union
  REPLACING the discussion five, with its own `MESSAGE_STATUS_FILTERS`,
  label record, type guard, `threadMatchesStatusFilter`,
  `computeMessageStatusCounts` and `filterThreadsByStatus` in
  `message-table-view.ts`): `All
  / Needs a draft / Failed / Edited by you / Not sent yet / Answered`
  (`Not sent yet` = `!!row.reply && !row.sent`). Sort by clickable column
  headers with `aria-sort` (First, Last, Subject), no sort select.
  `messageRepliesLogSummaryLine` (frozen oracle): `12 threads captured
  across 3 batches - 9 drafted, 0 failed, 3 already answered, 2 sent, 1
  saved as a draft, 0 notices.` Directly under `<RunLogRow>` one
  `fieldHint` computed from `rawRows` (a different run from the oracle
  above): `7 threads still need you - 5 drafted and not sent, 2 waiting to
  draft.` - drafted-and-not-sent = `state === "ready" && reply && !sent &&
  !skipped`, waiting = `state === "pending"` and not answered/preview/
  skipped; hidden when the total is zero.

## 8. Run log (Group L)

- **M19.** `message-replies/message-replies-log.ts`: RUN (started, ended,
  course, ingredients, formality, address-by-name, `signoff set` yes/no -
  never the text, skip answered, frames, batches, dropped, stalled),
  BATCHES, NOTICES, RETRIES, ROWS. CSV ROWS columns: id, subject, student,
  messageCount, latestIncomingAt (raw), answered, state, userEdited,
  retried, error, matchedConversationId, savedDraftId, sentAt. Message
  bodies and replies are JSON-only. Every cell through `escapeCsvValue`
  with `?? ""`; `csvRow`/`yesNo` live beside it in
  `course-tasks-view-csv.ts`. Filename `message-replies-log-<course>-
  <stamp>` via `src/lib/log-file-name.ts` (`slugify`, `fileStamp`,
  `logFileName`), which the discussion and grading logs now share too. A
  batch whose table epoch changed mid-flight is logged `discarded` and not
  merged.

## 9. File plan, groups and budgets

Group L lands its exported signatures FIRST (A and C import from it);
the wave is gated as a whole on tsc/lint/vitest. L's export surface, by
file, is fixed here so A and C compile against the same names:

- `src/lib/message-reply-prompt.ts`: `MessageIngredient`,
  `MESSAGE_INGREDIENTS`, `MESSAGE_INGREDIENT_LABELS`,
  `DEFAULT_MESSAGE_INGREDIENTS`, `MessageCompositionSettings`,
  `MAX_DRAFT_THREAD_CHARS`, `buildMessageExtractionPrompt(courseName,
  frameCount)`, `buildMessageReplyPrompt(threads, courseName, styleBlock,
  composition, knowledgeContext?)`, `parseExtractedMessages(raw)`,
  `ExtractedMessage`, `MessagePane`.
- `message-replies/message-serialization.ts`: `MessageThreadRow`,
  `ThreadMessage`, `MessageRowState`, `MESSAGE_TABLE_VERSION`,
  `MAX_THREAD_MESSAGES`, `MAX_MESSAGE_CHARS`, `MAX_TABLE_BYTES`,
  `serializeMessageTable(rows): string`, `deserializeMessageTable(raw):
  MessageThreadRow[]`, `coerceThreadMessages(raw): ThreadMessage[]`.
- `message-replies/message-thread.ts`: `threadKey(subject)`,
  `parseInboxTimestamp(raw, capturedAtMs)`, `messageSimilarityDistance(a,
  b)`, `isSameMessage(a, b)`, `mergeCapturedMessages(rows, entries, opts:
  { instructorName: string; capturedAtMs: number; now: number }): { rows:
  MessageThreadRow[]; addedIds: string[]; capped: boolean }`,
  `latestIncoming(row)`, `sortThreads(rows)`, `applySignoff(reply,
  signoff)`.
- `message-replies/message-canvas-match.ts`: `ThreadCanvasMatch`,
  `matchThreadToConversation(row, conversations): { kind: "matched";
  canvas } | { kind: "none" } | { kind: "ambiguous" }`.
- `message-replies/message-table-view.ts`: the M18 status-filter family.
- `message-replies/message-replies-log.ts`: the types
  `MessageRepliesLogBatch`, `MessageRepliesLogNotice`,
  `MessageRepliesLogRetry`, `MessageRepliesLogRowEntry`,
  `MessageRepliesLogInput`, `MessageRepliesLogSummary`,
  `MessageRepliesRunLog`; `makeMessageRepliesLogBatch(args)`,
  `buildMessageRepliesLogRowEntry(row)`, `buildMessageRepliesLog(input:
  MessageRepliesLogInput): MessageRepliesRunLog`,
  `formatMessageRepliesLogCsv(log)`, `formatMessageRepliesLogJson(log, {
  exportedAt })`, `messageRepliesLogFileName(course, extension: "csv" |
  "json", at)` (RunLogRow's `onDownload(format)` needs both),
  `summarizeMessageRepliesLog(log)`, `messageRepliesLogSummaryLine(summary)`.

Group A's surface, also fixed: `extractStudentMessagesAction(frames:
Array<{ base64: string }>, courseName, provider): Promise<{ messages:
ExtractedMessage[] } | { error: string }>`; `draftMessageRepliesAction(
threads, courseName, composition, knowledgeContext?): Promise<{
replies: Array<{ post: number; reply: string }> } | { error: string }>`;
`listConversationsAction(acronym?, opts?)` per M15.

Group C's own leaf, `message-replies/message-capture.ts` (~300, pure):
`MessageSort`, `sortMessageRows`, `swapAdjacentThreads`,
`messageClipboardText`, `tableClipboardText`, `draftingArmSignature`,
`readLocalStorage`, `writeLocalStorage`, `LOOP_IDLE_POLL_MS`,
`coerceMessageComposition` - the copies section 0 orders that have no
other home; M18's column sort is `sortMessageRows`.

- **L (leaves):** `src/lib/message-reply-prompt.ts` (~350) + test;
  `message-replies/message-thread.ts` (~300) + test;
  `message-replies/message-table-view.ts` (~150) + test;
  `message-replies/message-serialization.ts` (~250) + test;
  `message-replies/message-canvas-match.ts` (~120) + test;
  `message-replies/message-replies-log.ts` (~400) + test.
- **A (actions):** `src/app/actions/message-replies.ts` (~350) + test;
  `src/lib/canvas/inbox.ts` + `src/app/actions/canvas-inbox.ts` (the M15
  option widening only) + their tests.
- **C (components/hooks):** `MessageRepliesPanel.tsx` (~450) +
  `MessageCaptureSettings.tsx` (~250), `MessageReplyToolbar.tsx` (~260),
  `MessageThreadTable.tsx` (~300), `MessageThreadRow.tsx` (~450) +
  `MessageThreadRowActions.tsx` (~300) - split from the start, the
  discussion row is 914 lines; `useMessageRows.ts` (~350),
  `useMessageReplies.ts` (~600 after extracting `useMessageDelivery.ts`
  - save/send/check - `message-extraction-loop.ts` and
  `useMessagePersistedControls.ts`), `message-draft-loop.ts` (~350),
  `message-capture.ts` (~300) + test, `useMessageKnowledgeContext.ts`,
  `useMessageRepliesRunLog.ts`, `useMessageReplyFiltering.ts`,
  `useMessageSessionSummary.ts`; `MessageReplies.module.css` (`.threadEarlier` and nothing the existing
  stylesheets already provide).
- **W (wiring):** section 3.

## 10. What must NOT change

Every existing sub-tab, key, canary value and the discussion tool's
behaviour - this feature only ADDS to registries. The 1000-line ceiling;
no emojis; LF; "use server" exports async-only; no client import of
server-only modules; clipboard, ConfirmArmButtons, SegmentedToggle and
RunLogRow used as-is; `listConversationsAction()` with no options returns
exactly what it returns today.

## 11. Tests

Pure functions and prompts get unit tests that can fail (frozen literal
oracles for prompts and the summary line; fixtures in the shape the
extraction actually emits, including `"list"`-pane entries, quoted-reply
bodies, "Yesterday" timestamps and `"(no subject)"`); wiring is pinned by
source-text tests of facts and ordering, not spelling; M3's structure test;
action tests mock `callLlm`, `requireOwner` and the Canvas client, and
pin that `listConversations` without options builds today's exact URL.

## 12. Out of scope (recorded)

- A launcher BUTTON elsewhere in the app for `openRecordingTool({ view:
  "messages" })` - the launch union and the knowledge-carry read side ARE
  wired by M1 and the copied knowledge hook.
- Attachments in messages; group conversations with several students.
- Sending through Outlook (`messaging-outlook.ts`) - Canvas only.
