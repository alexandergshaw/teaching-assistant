"use client";

// Message replies - M16 (Save as draft) and M17 (Send/Check). Pulled out of
// useMessageReplies.ts (which had grown past its ~500-line budget) as its
// own hook - the orchestrator wires it with `{ rowsApiRef, acronymRef,
// pushNotice }`, the same dispatch-time-ref shape its two async loops
// already use, so this hook's own async callbacks read exclusively from
// those refs and are never stale across a render the way a state closure
// would be.
//
// `sendErrorById` (UseMessageRepliesReturn's own field) is DERIVED from
// `rawRows` (`row.sendError`) and therefore NOT returned by this hook: this
// hook receives only `rowsApiRef` (a ref), and react-hooks/refs forbids
// reading a ref's `.current` during render (see useMessageReplies.ts's own
// `courseName` comment for the same rule) - the derivation has to happen
// where the REACTIVE `rawRows` array is in scope, which is the orchestrator
// itself. `sendingIds`/`savingDraftIds` stay real React state HERE, because
// they describe an in-flight network call this hook alone drives, not a
// fact of the row.
//
// Two load-bearing contract points:
// - `send()` refuses when `row.sent` is already set - a confirmed delivery
//   is never re-sent, even if some stale UI state still shows a Send
//   control.
// - `sendAttempt` is written BEFORE the send fetch goes out (so a reload
//   mid-flight still remembers an attempt was made - message-
//   serialization.ts's own load-time hydration reads it) and `sendAttempt`/
//   `sendError` are cleared together, in the SAME commit as `sent`, by
//   `setSent` (useMessageRows.ts).
// - `checkSent()` distinguishes a Canvas/network FAILURE (pushes a notice)
//   from a clean check that simply found nothing (stays silent; the Check
//   control remains available for the instructor to try again later) - the
//   two cases must never collapse into one code path.

import { useCallback, useRef, useState } from "react";
import type { MutableRefObject } from "react";
import { saveMessageDraftAction } from "@/app/actions/messaging";
import { getConversationAction, replyToConversationAction } from "@/app/actions/canvas-inbox";
import { buildMessageDraftPayload, findSentMessageId } from "./message-draft-loop";
import { SEND_FAILURE_TEXT, type MessageThreadRow } from "./message-serialization";
import type { UseMessageRowsReturn } from "./useMessageRows";

export interface UseMessageDeliveryArgs {
  rowsApiRef: MutableRefObject<UseMessageRowsReturn>;
  acronymRef: MutableRefObject<string>;
  pushNotice: (text: string) => void;
}

export interface UseMessageDeliveryReturn {
  // M16 - Save as draft. `saveDraft` is enabled only on a matched row with a
  // non-empty reply (the UI disables the control otherwise; this no-ops
  // defensively too). `saveAllDrafts` is "Save all as drafts (N)" - N =
  // matched, drafted, unsent, unsaved, unskipped rows.
  saveDraft: (id: string) => void;
  saveAllDrafts: () => void;
  savingDraftIds: readonly string[];

  // M17 - Send. `send` dispatches on confirm; a second call for the same id
  // while the first is in flight, OR a row already `sent`, is a no-op.
  // `checkSent` re-checks a row whose send may or may not have gone
  // through.
  send: (id: string) => void;
  checkSent: (id: string) => void;
  sendingIds: readonly string[];

  /** `clearTable()`'s own drain: a save/send left
   *  in flight against a table the instructor just deleted must not linger
   *  as a spinner or a stale in-flight guard forever - clears
   *  `savingDraftIds`/`sendingIds` and the in-flight id set. Does not, and
   *  cannot, cancel an already-dispatched fetch; that request's own
   *  `rowsApiRef.current.set*` calls simply write to ids no longer in the
   *  table and are no-ops there (every mutator in useMessageRows.ts bails
   *  out when the id is not found). */
  clearDeliveryState: () => void;
}

export function useMessageDelivery({ rowsApiRef, acronymRef, pushNotice }: UseMessageDeliveryArgs): UseMessageDeliveryReturn {
  const [savingDraftIds, setSavingDraftIds] = useState<string[]>([]);

  const saveDraft = useCallback(
    (id: string) => {
      const row = rowsApiRef.current.rawRows.find((r) => r.id === id);
      const built = row && buildMessageDraftPayload(row, acronymRef.current);
      if (!row || !built) return;
      setSavingDraftIds((prev) => (prev.includes(id) ? prev : [...prev, id]));
      void (async () => {
        try {
          const result = await saveMessageDraftAction(built.summary, built.payload);
          if ("error" in result) {
            pushNotice(`Could not save the draft for ${row.student}: ${result.error}`);
          } else {
            rowsApiRef.current.setSavedDraft(id, { id: result.id, at: Date.now() });
          }
        } catch (err) {
          pushNotice(`Could not save the draft for ${row.student}: ${err instanceof Error ? err.message : "unknown error"}`);
        } finally {
          setSavingDraftIds((prev) => prev.filter((x) => x !== id));
        }
      })();
    },
    [rowsApiRef, acronymRef, pushNotice]
  );

  const saveAllDrafts = useCallback(() => {
    rowsApiRef.current.rawRows
      .filter((r) => r.canvas && r.reply && !r.sent && !r.savedDraft && !r.skipped)
      .forEach((row) => saveDraft(row.id));
  }, [rowsApiRef, saveDraft]);

  const [sendingIds, setSendingIds] = useState<string[]>([]);
  const sendInFlightRef = useRef<Set<string>>(new Set());

  const markSending = useCallback((id: string, on: boolean) => {
    setSendingIds((prev) => (on ? (prev.includes(id) ? prev : [...prev, id]) : prev.filter((x) => x !== id)));
  }, []);

  const send = useCallback(
    (id: string) => {
      if (sendInFlightRef.current.has(id)) return; // M17: a second click while in flight is a no-op
      const row = rowsApiRef.current.rawRows.find((r) => r.id === id);
      if (!row || !row.canvas || !row.reply) return;
      if (row.sent) return; // a confirmed delivery is never re-sent
      const conversationId = row.canvas.conversationId;
      sendInFlightRef.current.add(id);
      markSending(id, true);
      // Written BEFORE the fetch - see this file's header.
      rowsApiRef.current.setSendAttempt(id, { at: Date.now(), conversationId });
      void (async () => {
        try {
          const result = await replyToConversationAction(Number(conversationId), row.reply, acronymRef.current || undefined);
          if ("error" in result) {
            rowsApiRef.current.setSendError(id, SEND_FAILURE_TEXT);
            return;
          }
          const messageId = findSentMessageId(result.conversation, row.reply);
          const now = Date.now();
          const sent: NonNullable<MessageThreadRow["sent"]> = { at: now, conversationId, messageCount: result.conversation.messages.length };
          if (messageId !== undefined) sent.messageId = messageId;
          rowsApiRef.current.setSent(id, sent, now); // clears sendAttempt/sendError in the same commit
        } catch {
          rowsApiRef.current.setSendError(id, SEND_FAILURE_TEXT);
        } finally {
          sendInFlightRef.current.delete(id);
          markSending(id, false);
        }
      })();
    },
    [rowsApiRef, acronymRef, markSending]
  );

  const checkSent = useCallback(
    (id: string) => {
      if (sendInFlightRef.current.has(id)) return;
      const row = rowsApiRef.current.rawRows.find((r) => r.id === id);
      if (!row || !row.canvas) return;
      const conversationId = row.canvas.conversationId;
      sendInFlightRef.current.add(id);
      markSending(id, true);
      void (async () => {
        try {
          const result = await getConversationAction(conversationId, acronymRef.current || undefined);
          if ("error" in result) {
            // A Canvas/network failure here must read as a failure, not
            // silently as "confirmed not found."
            pushNotice(`Could not check Canvas: ${result.error}`);
            return;
          }
          const messageId = findSentMessageId(result.conversation, row.reply);
          if (messageId === undefined) return; // checked successfully, genuinely not found - stays silent, Check remains available
          const now = Date.now();
          rowsApiRef.current.setSent(id, { at: now, conversationId, messageCount: result.conversation.messages.length, messageId }, now);
        } catch (err) {
          pushNotice(`Could not check Canvas: ${err instanceof Error ? err.message : "unknown error"}`);
        } finally {
          sendInFlightRef.current.delete(id);
          markSending(id, false);
        }
      })();
    },
    [rowsApiRef, acronymRef, pushNotice, markSending]
  );

  const clearDeliveryState = useCallback(() => {
    sendInFlightRef.current.clear();
    setSavingDraftIds((prev) => (prev.length === 0 ? prev : []));
    setSendingIds((prev) => (prev.length === 0 ? prev : []));
  }, []);

  return { saveDraft, saveAllDrafts, savingDraftIds, send, checkSent, sendingIds, clearDeliveryState };
}
