// Message replies (Manual > Recording > Message replies) - the drafting
// queue's consumer loop. Mirrors src/app/components/recording/
// discussion-draft-loop.ts's own `runDraftLoop`, simplified per docs/
// message-replies-acceptance-criteria.md section 0 (no resource lane, no
// thread-position lane) and retargeted at M10-M12's own contract, which
// differs from the discussion sibling in two real ways:
//
// 1. NO `provider` parameter on `draftMessageRepliesAction` (section 9's
//    action's surface omits it - that action's own header explains why:
//    callLlm ignores whatever provider it is given for this interface
//    anyway, matching extractStudentMessagesAction's own comment).
// 2. `threads` carries NO id (M10's buildMessageReplyPrompt signature has
//    none) - the model's response is purely POSITIONAL
//    (`{"post": <THREAD number>, "reply": ...}`), and
//    draftMessageRepliesAction's own header is explicit that it returns
//    `post` unchanged rather than remapping to a caller id ("this feature
//    has no opaque row id to rebuild - the client reads `post` back against its
//    own `threads` array by index"). This loop is that reader: it maps
//    `reply.post` back to `dispatchable[reply.post - 1].row.id` itself.
//
// The instructor's writing-style block is resolved entirely server-side, by
// draftMessageRepliesAction itself via getWritingStyleBlock(user.id) - this
// loop never sees the raw sample text and passes no style argument at all.

import type { Dispatch, MutableRefObject, SetStateAction } from "react";
import { isDispatchableDraftItem, normalizeForMatch, partitionDraftOutcome, shouldLoopContinue } from "../recording/discussion-capture";
import { greetingNameFromAuthor } from "@/lib/person-name";
import { DRAFT_BATCH_SIZE, type MessageCompositionSettings } from "@/lib/message-reply-prompt";
import { applySignoff } from "./message-thread";
import { matchThreadToConversation } from "./message-canvas-match";
import type { MessageThreadRow } from "./message-serialization";
import type { UseMessageRowsReturn } from "./useMessageRows";
import type { RecordingKnowledgeContext } from "@/lib/recording-launch";
import type { MessageDraftPayload } from "@/lib/message-drafts";
import type { CanvasConversationSummary, CanvasConversationDetail } from "@/lib/canvas/inbox";

export interface MessageDraftQueueItem {
  id: string;
  force: boolean;
}

// The drafting server action's shape, injected rather than imported - this
// file stays decoupled from "@/app/actions/message-replies" the same way
// discussion-draft-loop.ts stays decoupled from its own action module.
// Matches draftMessageRepliesAction's real, already-landed signature exactly
// (src/app/actions/message-replies.ts) - see this file's header for the two
// ways it differs from the discussion sibling. No styleBlock parameter -
// that action resolves the writing-style block itself, server-side.
export type DraftMessageRepliesAction = (
  threads: Array<{
    messages: Array<{ text: string; fromMe: boolean }>;
    greetingName?: string;
  }>,
  courseName: string,
  composition: MessageCompositionSettings,
  knowledgeContext?: string
) => Promise<{ replies: Array<{ post: number; reply: string }> } | { error: string }>;

export interface RunMessageDraftLoopDeps {
  loopsActiveRef: MutableRefObject<boolean>;
  loopEpochRef: MutableRefObject<number>;
  draftQueueRef: MutableRefObject<MessageDraftQueueItem[]>;
  setDraftQueueSize: (size: number) => void;
  setDrafting: Dispatch<SetStateAction<boolean>>;
  waitForWake: () => Promise<void>;
  rowsApiRef: MutableRefObject<UseMessageRowsReturn>;
  courseNameRef: MutableRefObject<string>;
  compositionRef: MutableRefObject<MessageCompositionSettings>;
  /** M11: applied IN CODE to a landed reply, never asked of the model - see
   *  applySignoff's own doc comment (message-thread.ts). */
  signoffRef: MutableRefObject<string>;
  knowledgeContextRef: MutableRefObject<RecordingKnowledgeContext | null>;
  pushNotice: (text: string) => void;
  draftAction: DraftMessageRepliesAction;
}

export async function runMessageDraftLoop(epoch: number, deps: RunMessageDraftLoopDeps): Promise<void> {
  const {
    loopsActiveRef,
    loopEpochRef,
    draftQueueRef,
    setDraftQueueSize,
    setDrafting,
    waitForWake,
    rowsApiRef,
    courseNameRef,
    compositionRef,
    signoffRef,
    knowledgeContextRef,
    pushNotice,
    draftAction,
  } = deps;

  while (shouldLoopContinue(loopsActiveRef.current, loopEpochRef.current, epoch)) {
    if (draftQueueRef.current.length === 0) {
      // A functional update - React bails out when the updater returns the
      // same value it already holds, so this branch (every idle wake) does
      // not schedule a needless re-render.
      setDrafting((prev) => (prev ? false : prev));
      await waitForWake();
      continue;
    }

    const batch = draftQueueRef.current.splice(0, DRAFT_BATCH_SIZE);
    setDraftQueueSize(draftQueueRef.current.length);
    // rawRows, never the filtered rows - a batch spliced off the queue above
    // must not vanish because a search-box keystroke hid its ids at this
    // exact instant.
    const currentRows = rowsApiRef.current.rawRows;
    const dispatchable = batch
      .map((item) => ({ item, row: currentRows.find((r) => r.id === item.id) }))
      .filter(
        (x): x is { item: MessageDraftQueueItem; row: MessageThreadRow } => !!x.row && isDispatchableDraftItem(x.item, x.row)
      );
    if (dispatchable.length === 0) continue;

    setDrafting(true);
    const ids = dispatchable.map((x) => x.row.id);
    rowsApiRef.current.markDrafting(ids);
    // Snapshot the edit generation for every dispatched row BEFORE the
    // request goes out.
    const editSnap = rowsApiRef.current.snapshotEditSeq(ids);
    const courseName = courseNameRef.current;
    const compositionNow = compositionRef.current;
    const signoffNow = signoffRef.current;
    const knowledgeContextNow = knowledgeContextRef.current?.text || undefined;

    let result: Awaited<ReturnType<DraftMessageRepliesAction>>;
    try {
      result = await draftAction(
        dispatchable.map((x) => {
          const messages = x.row.messages.map((m) => ({ text: m.text, fromMe: m.fromMe }));
          const greetingName = greetingNameFromAuthor(x.row.student) || undefined;
          const thread: { messages: Array<{ text: string; fromMe: boolean }>; greetingName?: string } = { messages };
          if (greetingName) thread.greetingName = greetingName;
          return thread;
        }),
        courseName,
        compositionNow,
        knowledgeContextNow
      );
    } catch (err) {
      result = { error: err instanceof Error ? err.message : "Could not draft replies." };
    }
    if (!loopsActiveRef.current) return;

    // A row edited WHILE it was "drafting" (after dispatch, before this
    // response lands) is resolved to "ready" on its OWN current reply
    // (never the model's) - mirrors discussion-draft-loop.ts's own F10 fix.
    const isUnchanged = (id: string) => rowsApiRef.current.isUnchangedSince(id, editSnap);
    const resolveEditedDuringDispatch = (id: string) => {
      const current = rowsApiRef.current.rawRows.find((r) => r.id === id);
      if (current) rowsApiRef.current.applyReply(id, current.reply, current.userEdited);
    };

    if ("error" in result) {
      const { unchanged, editedDuringDispatch } = partitionDraftOutcome(ids, isUnchanged);
      editedDuringDispatch.forEach(resolveEditedDuringDispatch);
      if (unchanged.length > 0) rowsApiRef.current.markFailed(unchanged, result.error);
      pushNotice(result.error);
      continue;
    }

    // POSITIONAL response mapping - see this file's header, point 2.
    // `reply.post` is 1-based against `dispatchable`, the same array order
    // the request was built from above.
    const editedDuringDispatchSet = new Set(partitionDraftOutcome(ids, isUnchanged).editedDuringDispatch);
    const returnedPositions = new Set<number>();
    for (const reply of result.replies) {
      returnedPositions.add(reply.post);
      const dispatchedRow = dispatchable[reply.post - 1]?.row;
      if (!dispatchedRow) continue; // defensive: the action already bounds-checks `post`
      if (editedDuringDispatchSet.has(dispatchedRow.id)) {
        resolveEditedDuringDispatch(dispatchedRow.id);
      } else {
        // M11: the sign-off is applied IN CODE here, at the one point a
        // model-authored reply lands - never inside the prompt, and never
        // re-applied on the discard path above (which re-applies the user's
        // own text, already whatever it already was).
        rowsApiRef.current.applyReply(dispatchedRow.id, applySignoff(reply.reply, signoffNow), false);
      }
    }

    const missingIds = dispatchable.filter((_, i) => !returnedPositions.has(i + 1)).map((x) => x.row.id);
    if (missingIds.length > 0) {
      const { unchanged: stillFailed, editedDuringDispatch: missingEdited } = partitionDraftOutcome(missingIds, isUnchanged);
      missingEdited.forEach(resolveEditedDuringDispatch);
      if (stillFailed.length > 0) rowsApiRef.current.markFailed(stillFailed, "No reply came back for this thread.");
    }
  }
}

// ---------------------------------------------------------------------------
// M15/M16/M17: the three pure(-ish) helpers useMessageReplies.ts's own
// match/save/send orchestration dispatches through. Pulled out here rather
// than left inline in that hook so the hook itself stays thin wiring (fetch/
// resolve, then call one of these) - these three carry the actual iteration/
// matching/payload-building logic, and are directly unit-testable with no
// hook render required (this repo's vitest never renders one).
// ---------------------------------------------------------------------------

/** M15: applies `matchThreadToConversation` to every unmatched, non-preview
 * row in the table (or, when `rowIds` is given, just those), writing a match
 * through `rowsApiRef.current.setCanvasMatch` and stamping `matchedAt` with
 * `now`. No network call itself - `conversations` is already fetched.
 *
 * A row this function EXAMINES but cannot match ("none"/"ambiguous") gets
 * `matchOutcome` written through `setMatchOutcome` - every examined row ends
 * the pass either matched or carrying its own outcome, so the actions-cell
 * fieldHint (M15's own "not found"/"ambiguous" text) survives a reload with
 * no live Canvas call needed to redecide it. */
export function applyCanvasMatches(
  rowsApiRef: MutableRefObject<UseMessageRowsReturn>,
  conversations: ReadonlyArray<CanvasConversationSummary>,
  now: number,
  rowIds?: ReadonlyArray<string>
): void {
  const candidates = rowsApiRef.current.rawRows.filter((r) => !r.canvas && !r.previewOnly && (!rowIds || rowIds.includes(r.id)));
  for (const row of candidates) {
    const match = matchThreadToConversation(row, conversations);
    if (match.kind === "matched") {
      rowsApiRef.current.setCanvasMatch(row.id, { ...match.canvas, matchedAt: now });
    } else {
      rowsApiRef.current.setMatchOutcome(row.id, match.kind);
    }
  }
}

/** M16: the draft payload for one matched row - `null` when the row is not
 * matched or has no reply yet (the caller's own guard; `saveDraft` no-ops on
 * `null`). `context` is the thread transcript, oldest-first (M9's own
 * message ordering, unchanged here). */
export function buildMessageDraftPayload(
  row: MessageThreadRow,
  institution: string
): { summary: string; payload: MessageDraftPayload } | null {
  if (!row.canvas || !row.reply) return null;
  const transcript = row.messages
    .map((m) => `${m.fromMe ? "You" : row.student || "Student"} (${m.sentAt ?? "unknown time"}): ${m.text}`)
    .join("\n\n");
  return {
    summary: `Reply to ${row.student} - ${row.subject}`,
    payload: {
      kind: "reply",
      body: row.reply,
      conversationId: String(row.canvas.conversationId),
      institution,
      title: row.subject,
      recipientName: row.student,
      context: transcript,
    },
  };
}

/** M17: the last message in `conversation` whose `authorId === selfId` and
 * whose body normalizes equal to `reply` - `undefined` when none matches
 * (used by both `send`'s own success snapshot and `checkSent`'s re-check). */
export function findSentMessageId(conversation: CanvasConversationDetail, reply: string): number | undefined {
  const own = conversation.messages.filter((m) => m.authorId === conversation.selfId);
  for (let i = own.length - 1; i >= 0; i--) {
    if (normalizeForMatch(own[i].body) === normalizeForMatch(reply)) return own[i].id;
  }
  return undefined;
}
