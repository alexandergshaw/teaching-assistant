"use client";

// The stateful orchestration half of the multi-draft-slot seam (docs/announcement-from-walkthrough-acceptance-criteria.md
// section 5b). Owns the reducer, the id counter, the async fan-out and
// Copy's payload construction. Imports NO server action - the panel injects
// `draftOne`, `postDraft`, `fetchResources` and `researchFingerprint`, so
// every literal server-action call stays in
// WalkthroughAnnouncementPanel.tsx (blocker 5's requirement, re-armed by
// walkthrough-announcement.structure.test.ts's own pin).
//
// G3 (docs/BACKLOG.md 4.1's sibling chunk): once-per-Generate resource
// research (Ruling 9), never inside buildRequest (which stays synchronous -
// Ruling 4's own finding). `generate` awaits research BEFORE dispatching
// `generate-started` (Ruling 24) and re-reads target ids AFTER that await,
// since an effect may have changed the slot set during the wait. A second
// Generate click while research is in flight REUSES the same in-flight
// promise rather than starting a second research call or silently doing
// nothing (Ruling 34) - Generate itself stays enabled throughout.

import { useCallback, useEffect, useReducer, useRef, useState } from "react";
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
  type ResearchNotice,
  type ResolvedTemplate,
  type ResourceOutcome,
  type TemplateChoice,
} from "./announcement-draft-slots";

/** The synchronous snapshot buildRequest() returns - everything needed to
 * draft EXCEPT the research result, which cannot exist until after an await
 * buildRequest itself cannot perform (Ruling 4/9). */
export interface AnnouncementDraftRequestContext {
  readonly courseLabel: string;
  readonly moduleLabel: string | null;
  readonly materialsText: string;
  readonly coverageBlock: string;
  readonly notes: string;
  readonly provider: LlmProvider;
  /** G3 Ruling 4/11: REQUIRED - whether the model should use emojis. */
  readonly emojiOn: boolean;
  /** G3 Ruling 4/9/11: REQUIRED - whether Generate researches resource
   * links before drafting. */
  readonly researchOn: boolean;
}

/** What actually reaches draftOne - the request context PLUS the once-per-
 * Generate research result (Ruling 9's "research runs once per Generate, at
 * a site that can await"). A plain `{ ...ctx, researchOutcome }` object
 * literal satisfies this exactly, with no excess-property error, because
 * this interface (unlike AnnouncementDraftRequestContext) declares the
 * field. */
export interface AnnouncementDraftDispatchContext extends AnnouncementDraftRequestContext {
  readonly researchOutcome: ResourceOutcome;
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

/**
 * G3 Ruling 17/33: a cached research result may be reused ONLY when its
 * fingerprint still matches every input it depended on - never pairs a new
 * course/module/materials context with a previous context's links. Pulled
 * out as a pure decision, mirroring useTakeAnnouncement.ts's own
 * decideRealTimeGuard precedent: this repo's vitest is node-env and renders
 * no hook, so this is the only shape of the decision a test here can reach
 * directly rather than only by reading source.
 */
export function cachedResearchFor(
  cached: { readonly fingerprint: string; readonly outcome: ResourceOutcome } | null,
  fingerprint: string
): ResourceOutcome | null {
  return cached && cached.fingerprint === fingerprint ? cached.outcome : null;
}

/**
 * G3 Ruling 34: whether a second `generate()` call, landing while a research
 * request is already outstanding, may REUSE that in-flight promise rather
 * than starting a second `fetchResources` call. Reuse is scoped to the SAME
 * fingerprint - a concurrent call for a DIFFERENT course/module/materials
 * must never be handed the first call's (unrelated) in-flight promise, which
 * would be Ruling 17's violation arriving from the dedup path instead of the
 * cache path.
 */
export function shouldReuseInFlightResearch(
  existing: { readonly fingerprint: string } | null,
  fingerprint: string
): boolean {
  return existing !== null && existing.fingerprint === fingerprint;
}

/**
 * G3 Ruling 17: `regenerate`'s own research-outcome resolution. Consults
 * `researchOn` on EVERY call (never sticky from a previous Generate), and
 * falls back to `"off"` - never an inline re-research - when the cache is
 * absent or stale (Res-r3-1, owner: repo owner; `regenerate` never awaits a
 * fresh research call itself).
 */
export function resolveRegenerateResearchOutcome(
  researchOn: boolean,
  cached: { readonly fingerprint: string; readonly outcome: ResourceOutcome } | null,
  fingerprint: string
): ResourceOutcome {
  if (!researchOn) return { kind: "off" };
  return cachedResearchFor(cached, fingerprint) ?? { kind: "off" };
}

export function useAnnouncementDraftSlots(args: {
  readonly buildRequest: () => AnnouncementDraftRequestContext;
  readonly resolveLive: () => LiveDefaults;
  readonly draftOne: (
    ctx: AnnouncementDraftDispatchContext,
    outline: AnnouncementOutline
  ) => Promise<{ title: string; message: string; researchNotice: ResearchNotice } | { error: string }>;
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
  /** G3 Ruling 2/9: the actual research call - injected, per the same
   * blocker-5 rule that keeps every literal server-action call in the
   * panel. Called at most once per distinct fingerprint in flight at a
   * time (see the in-flight dedup in `generate` below). */
  readonly fetchResources: (ctx: AnnouncementDraftRequestContext) => Promise<ResourceOutcome>;
  /** G3 Ruling 17/33: a stable string derived from every input the research
   * result depends on (course, module, materials, researchOn) - used both
   * to decide whether a cached research result may be reused by
   * `regenerate`, and to dedupe two overlapping `generate()` calls into one
   * real `fetchResources` call. Must contain no control characters
   * (Ruling 33) - injected so the panel can use fnv1aHash without this leaf
   * needing to import it. */
  readonly researchFingerprint: (ctx: AnnouncementDraftRequestContext) => string;
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

  // G3 Ruling 17: the last research result, keyed by the fingerprint it was
  // computed from - `regenerate` reuses it ONLY when the fingerprint still
  // matches every input the result depended on, never unconditionally.
  const researchCacheRef = useRef<{ fingerprint: string; outcome: ResourceOutcome } | null>(null);
  // G3 Ruling 34: a REAL shared in-flight promise, not a boolean - a second
  // Generate click while a research call for the SAME fingerprint is still
  // outstanding awaits this same promise rather than starting a second
  // fetchResources call or doing nothing at all (a suppressing boolean would
  // leave the second click doing nothing, indistinguishable from a broken
  // button - the exact complaint this chunk opened with).
  const researchInFlightRef = useRef<{ fingerprint: string; promise: Promise<ResourceOutcome> } | null>(null);
  // Counts concurrent in-flight fetches (a second click with a DIFFERENT
  // fingerprint - e.g. the course changed mid-wait - starts its own fetch
  // rather than reusing the first's, per Ruling 17) so the status line does
  // not clear while a differently-fingerprinted research call is still
  // running.
  const researchInFlightCountRef = useRef(0);
  const [researching, setResearching] = useState(false);

  const runDraft = useCallback(
    (slotId: string, resolved: { template: ResolvedTemplate; outline: AnnouncementOutline }, ctx: AnnouncementDraftDispatchContext) => {
      const onResult = (result: { title: string; message: string; researchNotice: ResearchNotice } | { error: string }) => {
        if ("error" in result) {
          dispatch({ type: "result", id: slotId, result: { error: result.error } });
          return;
        }
        dispatch({
          type: "result",
          id: slotId,
          result: {
            title: result.title,
            message: result.message,
            researchNotice: result.researchNotice,
            builtFrom: resolved.template,
          },
        });
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

  const generate = useCallback(async () => {
    const idsBeforeResearch = emptySlotIds(slotsRef.current);
    if (idsBeforeResearch.length === 0) return;

    const ctx = argsRef.current.buildRequest();
    const fingerprint = argsRef.current.researchFingerprint(ctx);
    const cached = researchCacheRef.current;

    const cachedOutcome = cachedResearchFor(cached, fingerprint);
    let outcome: ResourceOutcome;
    if (cachedOutcome) {
      outcome = cachedOutcome;
    } else if (!ctx.researchOn) {
      outcome = { kind: "off" };
    } else {
      const existing = researchInFlightRef.current;
      let promise: Promise<ResourceOutcome>;
      if (shouldReuseInFlightResearch(existing, fingerprint) && existing) {
        // G3 Ruling 34: reuse the SAME in-flight promise - do not start a
        // second fetchResources call for a research request already
        // outstanding for these exact inputs.
        promise = existing.promise;
      } else {
        researchInFlightCountRef.current += 1;
        setResearching(true);
        promise = argsRef.current
          .fetchResources(ctx)
          .catch((): ResourceOutcome => ({ kind: "failed", reason: "Could not reach the server." }))
          .finally(() => {
            if (researchInFlightRef.current?.promise === promise) researchInFlightRef.current = null;
            researchInFlightCountRef.current = Math.max(0, researchInFlightCountRef.current - 1);
            if (researchInFlightCountRef.current === 0) setResearching(false);
          });
        researchInFlightRef.current = { fingerprint, promise };
      }
      outcome = await promise;
    }
    researchCacheRef.current = { fingerprint, outcome };

    // Re-read AFTER the only await point above - a slot removed or filled
    // during the research wait (by another in-flight generate(), or by the
    // user) must not be handed a stale target list (Ruling 24).
    const ids = emptySlotIds(slotsRef.current);
    if (ids.length === 0) return;

    dispatch({ type: "generate-started", ids });
    const live = argsRef.current.resolveLive();
    for (const id of ids) {
      const slot = slotsRef.current.find((s) => s.id === id);
      if (!slot) continue;
      void runDraft(id, resolveChoice(slot.choice, live), { ...ctx, researchOutcome: outcome });
    }
  }, [runDraft]);

  const regenerate = useCallback(
    (id: string) => {
      const slot = slotsRef.current.find((s) => s.id === id);
      if (!slot) return;
      dispatch({ type: "regenerate-started", id });
      const ctx = argsRef.current.buildRequest();
      const live = argsRef.current.resolveLive();

      // G3 Ruling 17: consult researchOn on EVERY call, and never pair a new
      // course/module/materials context with a previous context's cached
      // research result - resolveRegenerateResearchOutcome requires an exact
      // fingerprint match, or falls back to "off" rather than re-researching
      // inline (Res-r3-1, owner: repo owner - regenerate never awaits a
      // fresh research call itself).
      const fingerprint = argsRef.current.researchFingerprint(ctx);
      const outcome = resolveRegenerateResearchOutcome(ctx.researchOn, researchCacheRef.current, fingerprint);

      void runDraft(id, resolveChoice(slot.choice, live), { ...ctx, researchOutcome: outcome });
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
    researching,
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
