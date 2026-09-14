"use client";

// The stateful orchestration half of the multi-draft-slot seam (docs/announcement-from-walkthrough-acceptance-criteria.md
// section 5b). Owns the reducer, the id counter, the async fan-out and
// Copy's payload construction. Imports NO server action - the panel injects
// `draftOne` and `postDraft`, so every literal server-action call stays in
// WalkthroughAnnouncementPanel.tsx (blocker 5's requirement, re-armed by
// walkthrough-announcement.structure.test.ts's own pin).

import { useCallback, useEffect, useReducer, useRef } from "react";
import { markdownToHtml } from "@/lib/markdown";
import { writeClipboardText } from "../ui/clipboard";
import type { AnnouncementOutline } from "@/lib/announcement-outline-types";
import type { LlmProvider } from "@/lib/llm";
import {
  FIRST_SLOT_ID,
  emptySlotIds,
  makeSlot,
  resolveChoice,
  slotsReducer,
  type DraftSlot,
  type LiveDefaults,
  type ResolvedTemplate,
  type TemplateChoice,
} from "./announcement-draft-slots";

export interface AnnouncementDraftRequestContext {
  readonly courseLabel: string;
  readonly moduleLabel: string | null;
  readonly materialsText: string;
  readonly coverageBlock: string;
  readonly notes: string;
  readonly provider: LlmProvider;
}

/** Local mirror of markdown.ts's own `escapeHtml` (markdown.ts:28-29) - not
 * imported, since that function is a module-local `const` with no `export`
 * keyword. Escapes the four characters unsafe in Copy's HTML title:
 * `& < > "` - the quote is the one that closes an href="..." attribute
 * breakout, the same hole markdown.ts's own header documents fixing.
 * Exported (only) so announcement-draft-slots.test.ts can pin this
 * duplicate's own escaping directly, rather than only indirectly through
 * copySlot's clipboard payload. */
export function escapeForCopyTitle(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

export function useAnnouncementDraftSlots(args: {
  readonly buildRequest: () => AnnouncementDraftRequestContext;
  readonly resolveLive: () => LiveDefaults;
  readonly draftOne: (
    ctx: AnnouncementDraftRequestContext,
    outline: AnnouncementOutline
  ) => Promise<{ title: string; message: string } | { error: string }>;
  /**
   * `null`: no Canvas-linked course is selected. Checked BEFORE dispatching
   * `posting`, so there is no `posting: true` flash - dispatches
   * `post-result {error}` directly instead.
   *
   * Rejection: called as `postDraft(...).then(onOk, onRejected)`, mirroring
   * `runDraft`'s own `.then(onResult, onRejected)` - `onRejected` dispatches
   * `post-result {error: "Could not reach the server - the post may or may
   * not have gone through."}`.
   */
  readonly postDraft: (
    title: string,
    message: string
  ) => Promise<{ course: string } | { error: string }> | null;
}) {
  const [slots, dispatch] = useReducer(slotsReducer, FIRST_SLOT_ID, initialSlotsFromId);

  // Two latest-refs, not one - `slots` is reducer state and is read by every
  // callback below via `slotsRef.current`, never via the `slots` closure
  // variable, so an empty dependency array stays truthful. Safe because
  // React flushes pending passive effects before the next discrete input
  // event; NOT safe against two Generate clicks landing inside the same
  // event-processing tick (residual R8 - the reducer's own guards keep
  // STATE correct even then, but do not stop duplicate in-flight calls).
  const argsRef = useRef(args);
  const slotsRef = useRef(slots);
  useEffect(() => {
    argsRef.current = args;
    slotsRef.current = slots;
  });

  const nextIdRef = useRef(2);

  const runDraft = useCallback(
    (slotId: string, resolved: { template: ResolvedTemplate; outline: AnnouncementOutline }, ctx: AnnouncementDraftRequestContext) => {
      const onResult = (result: { title: string; message: string } | { error: string }) => {
        if ("error" in result) {
          dispatch({ type: "result", id: slotId, result: { error: result.error } });
          return;
        }
        dispatch({ type: "result", id: slotId, result: { ...result, builtFrom: resolved.template } });
      };
      const onRejected = () => {
        dispatch({ type: "result", id: slotId, result: { error: "Could not reach the server - nothing was drafted." } });
      };
      return argsRef.current.draftOne(ctx, resolved.outline).then(onResult, onRejected);
    },
    []
  );

  const addSlot = useCallback((choice: TemplateChoice) => {
    const id = `wta-slot-${nextIdRef.current}`;
    nextIdRef.current += 1;
    dispatch({ type: "add", id, choice });
  }, []);

  const removeSlot = useCallback((id: string) => dispatch({ type: "remove", id }), []);
  const chooseTemplate = useCallback((id: string, choice: TemplateChoice) => dispatch({ type: "choose", id, choice }), []);
  const editSlot = useCallback(
    (id: string, field: "title" | "message", value: string) => dispatch({ type: "edit", id, field, value }),
    []
  );

  const generate = useCallback(() => {
    const ids = emptySlotIds(slotsRef.current);
    if (ids.length === 0) return;
    dispatch({ type: "generate-started", ids });
    const ctx = argsRef.current.buildRequest();
    const live = argsRef.current.resolveLive();
    for (const id of ids) {
      const slot = slotsRef.current.find((s) => s.id === id);
      if (!slot) continue;
      void runDraft(id, resolveChoice(slot.choice, live), ctx);
    }
  }, [runDraft]);

  const regenerate = useCallback(
    (id: string) => {
      const slot = slotsRef.current.find((s) => s.id === id);
      if (!slot) return;
      dispatch({ type: "regenerate-started", id });
      const ctx = argsRef.current.buildRequest();
      const live = argsRef.current.resolveLive();
      void runDraft(id, resolveChoice(slot.choice, live), ctx);
    },
    [runDraft]
  );

  const armRegenerate = useCallback((id: string) => dispatch({ type: "arm-regenerate", id }), []);
  const cancelRegenerate = useCallback((id: string) => dispatch({ type: "cancel-regenerate", id }), []);

  const postSignatureFor = useCallback((slot: DraftSlot): string | null => {
    if (slot.draft.phase !== "drafted") return null;
    return JSON.stringify(["walkthrough-announcement", slot.id, slot.draft.draft.title, slot.draft.draft.message]);
  }, []);

  const commitPost = useCallback(
    (id: string) => {
      const slot = slotsRef.current.find((s) => s.id === id);
      if (!slot || slot.draft.phase !== "drafted") return;
      const promise = argsRef.current.postDraft(slot.draft.draft.title, slot.draft.draft.message);
      if (promise === null) {
        dispatch({ type: "post-result", id, result: { error: "Choose a course above to post." } });
        return;
      }
      dispatch({ type: "posting", id });
      promise.then(
        (result) => dispatch({ type: "post-result", id, result }),
        () =>
          dispatch({
            type: "post-result",
            id,
            result: { error: "Could not reach the server - the post may or may not have gone through." },
          })
      );
    },
    []
  );

  const armPost = useCallback(
    (id: string) => {
      const slot = slotsRef.current.find((s) => s.id === id);
      if (!slot) return;
      const signature = postSignatureFor(slot);
      if (signature === null) return;
      if (slot.postArmedFor === signature) {
        commitPost(id);
        return;
      }
      dispatch({ type: "arm-post", id, signature });
    },
    [postSignatureFor, commitPost]
  );

  const cancelPost = useCallback((id: string) => dispatch({ type: "cancel-post", id }), []);

  const copySlot = useCallback((id: string) => {
    const slot = slotsRef.current.find((s) => s.id === id);
    if (!slot || slot.draft.phase !== "drafted") return;
    const { title, message } = slot.draft.draft;
    writeClipboardText(
      `${title}\n\n${message}`,
      `<p><strong>${escapeForCopyTitle(title)}</strong></p>${markdownToHtml(message)}`
    ).then(
      () => dispatch({ type: "copy-result", id, error: null }),
      // `writeClipboardText`'s own rejection ("clipboard unavailable" for a
      // missing/insecure clipboard API) is an internal signal, not
      // user-facing prose - surfacing it verbatim reads as jargon to an
      // instructor. Every rejection this call can produce reduces to the
      // same actionable fact regardless of cause, so it is not further
      // distinguished here.
      () =>
        dispatch({
          type: "copy-result",
          id,
          error: "Could not copy - your browser blocked clipboard access. Copy the text manually instead.",
        })
    );
  }, []);

  const readyToDraftCount = emptySlotIds(slots).length;

  return {
    slots,
    readyToDraftCount,
    addSlot,
    removeSlot,
    chooseTemplate,
    editSlot,
    generate,
    regenerate,
    copySlot,
    armPost,
    cancelPost,
    armRegenerate,
    cancelRegenerate,
    postSignatureFor,
  };
}

function initialSlotsFromId(id: string): readonly DraftSlot[] {
  return [makeSlot(id, { kind: "default" })];
}
