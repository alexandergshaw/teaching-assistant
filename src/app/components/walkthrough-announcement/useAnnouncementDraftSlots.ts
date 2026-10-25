"use client";

// The existing slot reducer remains the single draft store. pair-dispatch owns
// synchronous call reservations and finalized snapshots; this hook binds it to
// React state, clipboard, scheduling and explicit posting confirmations.

import { useCallback, useReducer, useRef, useState, useLayoutEffect } from "react";
import { markdownToHtml } from "@/lib/markdown";
import { writeClipboardText } from "../ui/clipboard";
import type { AnnouncementOutline } from "@/lib/announcement-outline-types";
import type { LlmProvider } from "@/lib/llm";
import {
  FIRST_SLOT_ID,
  emptySlotIds,
  makeSlot,
  mayCommitPost,
  slotsReducer,
  type AnnouncementTiming,
  type DraftSlot,
  type LiveDefaults,
  type ResearchNotice,
  type ResourceOutcome,
  type TemplateChoice,
} from "./announcement-draft-slots";
import { resolveScheduledVisibility } from "./scheduled-visibility";

/** The synchronous snapshot buildRequest() returns - everything needed to
 * draft EXCEPT the research result, which cannot exist until after an await
 * buildRequest itself cannot perform (Ruling 4/9). */
export interface AnnouncementDraftRequestContext {
  readonly sourceKind?: "live" | "upload";
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
  /** A19: the SLOT's own timing, not a shared/batch value (AC-5) - there is
   * no `timing` on AnnouncementDraftRequestContext above; it is per-slot,
   * read from `slot.timing` at each dispatch site, never from `ctx`. */
  readonly timing: AnnouncementTiming;
  readonly revision?: { readonly editedDraft: { readonly title: string; readonly message: string }; readonly revisionNote: string };
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

/**
 * A32/REQ-A32-1, RULING 65: commitPost's own decision, pulled into a pure
 * exported function - mirroring cachedResearchFor/shouldReuseInFlightResearch/
 * resolveRegenerateResearchOutcome above - precisely so a test can EXECUTE
 * the confirm path directly rather than only reading commitPost as source
 * text (which is what shipped with no instrument at all: the checker's
 * BLOCKER 3). commitPost below calls this function; it never re-derives the
 * decision inline. Resolves through resolveScheduledVisibility - the same
 * function AnnouncementDraftSlot.tsx reads for its copy - never a
 * hand-rolled truthiness check on the raw string. The discriminating case
 * this function's own test pins: a past-dated, non-empty pick (which a raw
 * `.trim()` truthiness check would treat as "scheduled") must resolve
 * "commit" with `delayedPostAt: undefined`, exactly like an empty pick -
 * see resolvePostCommit.test cases below for the executing proof.
 */
export function resolvePostCommit(
  scheduledAt: string,
  now: number
):
  | { readonly kind: "invalid" }
  | { readonly kind: "commit"; readonly delayedPostAt: string | undefined; readonly scheduledLabel: string | null } {
  const visibility = resolveScheduledVisibility(scheduledAt, now);
  if (visibility.kind === "invalid") return { kind: "invalid" };
  if (visibility.kind === "scheduled") {
    return { kind: "commit", delayedPostAt: visibility.iso, scheduledLabel: visibility.label };
  }
  return { kind: "commit", delayedPostAt: undefined, scheduledLabel: null };
}

/**
 * A32 round-2 remediation, BLOCKER R2-1: the EXACT third argument commitPost
 * forwards to `postDraft` - pulled out of commitPost's body so a test can
 * EXECUTE the forwarding itself rather than only reading commitPost as
 * source text. The round-2 check measured that no test in this repo reads
 * useAnnouncementDraftSlots.ts as source at all
 * (`grep -rn 'readFileSync[^)]*useAnnouncementDraftSlots' src --include=*.test.ts`
 * exits 1), so `decision.delayedPostAt` -> `undefined` at the old inline call
 * site kept every gate green while publishing every scheduled post
 * immediately and irrevocably. commitPost below calls this function and
 * forwards nothing else on this path.
 */
export function postArgsFor(decision: {
  readonly kind: "commit";
  readonly delayedPostAt: string | undefined;
}): string | undefined {
  return decision.delayedPostAt;
}

/**
 * A32 round-2 remediation, BLOCKER R2-1 (RULING 64's field): the EXACT
 * success payload commitPost dispatches as "post-result" - pulled out for
 * the same reason as postArgsFor above. An error result passes through
 * unchanged; a success result is paired with the decision's OWN
 * scheduledLabel (resolved once, at commit time), never re-resolved from a
 * later render-time clock.
 */
export function postResultFor(
  decision: { readonly kind: "commit"; readonly scheduledLabel: string | null },
  result: { course: string } | { error: string }
): { error: string } | { course: string; scheduledLabel: string | null } {
  return "error" in result ? result : { course: result.course, scheduledLabel: decision.scheduledLabel };
}

/**
 * A32/M7 (RULING 68): the confirm-arm signature - now includes
 * `slot.scheduledAt`, so changing the scheduled time on an armed post
 * disarms it exactly as editing the title or message already does
 * (`announcement-draft-slots.ts`'s "edit" case). Before this, the field
 * deciding WHEN an irrevocable act takes effect was the one field excluded
 * from the signature an armed confirm re-checks. Promoted to a top-level
 * pure function (it closed over nothing even as a useCallback) so a test
 * can exercise it directly.
 */
/** Shown when the post request itself rejects (no server answer). The post may
 * have landed, so the copy never claims otherwise and points at Canvas. */
export const POST_TRANSPORT_FAILURE_MESSAGE =
  "Could not reach the server - the post may or may not have gone through. Check the course's announcements in Canvas before posting again.";

export function postSignatureFor(slot: DraftSlot): string | null {
  if (slot.draft.phase !== "drafted") return null;
  return JSON.stringify([
    "walkthrough-announcement",
    slot.id,
    slot.draft.draft.title,
    slot.draft.draft.message,
    slot.scheduledAt,
  ]);
}

export { dispatchResolvedAnnouncementDraft } from "./pair-dispatch";
import { createPairDraftRunner } from "./pair-dispatch";

export function useAnnouncementDraftSlots(args: {
  readonly scopeKey?: string;
  readonly mayGenerate?: () => boolean;
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
   *
   * A32/REQ-A32-1: the 3rd argument is the ALREADY-RESOLVED scheduled ISO
   * string (or `undefined` for "post immediately"), computed once by
   * `resolveScheduledVisibility` in `commitPost` below - never the raw
   * per-slot input. This function forwards it verbatim to
   * `postWalkthroughAnnouncementAction`'s own `delayedPostAt` parameter.
   */
  readonly postDraft: (
    title: string,
    message: string,
    delayedPostAt?: string
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
  const [slots, reactDispatch] = useReducer(slotsReducer, FIRST_SLOT_ID, initialSlotsFromId);
  const argsRef = useRef(args);
  const slotsRef = useRef(slots);
  const [researching, setResearching] = useState(false);
  const dispatch = useCallback((action: Parameters<typeof slotsReducer>[1]) => {
    slotsRef.current = slotsReducer(slotsRef.current, action);
    reactDispatch(action);
  }, []);
  useLayoutEffect(() => { argsRef.current = args; });
  const runnerRef = useRef<ReturnType<typeof createPairDraftRunner> | null>(null);
  useLayoutEffect(() => {
    runnerRef.current = createPairDraftRunner(() => slotsRef.current, dispatch, () => argsRef.current, setResearching);
    return () => runnerRef.current?.invalidate();
  }, [dispatch]);
  const nextIdRef = useRef(3);

  const addSlot = useCallback((choice: TemplateChoice, timing: AnnouncementTiming) => {
    const id = `wta-slot-${nextIdRef.current}`;
    nextIdRef.current += 1;
    dispatch({ type: "add", id, choice, timing });
  }, [dispatch]);

  // A new run preserves explicit pair selections; a scope change clears them
  // before that scope's saved preferences load. Optional slots are per run.
  const reset = useCallback(() => {
    const choices = slotsRef.current.slice(0, 2).map(slot => slot.choice);
    runnerRef.current?.invalidate();
    nextIdRef.current = 3;
    dispatch({ type: "reset" });
    dispatch({ type: "choose", id: FIRST_SLOT_ID, choice: choices[0] ?? { kind: "unresolved" } });
    dispatch({ type: "add", id: "wta-slot-2", choice: choices[1] ?? { kind: "unresolved" }, timing: "midweek" });
  }, [dispatch]);
  useLayoutEffect(() => {
    reset();
    dispatch({ type: "choose", id: FIRST_SLOT_ID, choice: { kind: "unresolved" } });
    dispatch({ type: "choose", id: "wta-slot-2", choice: { kind: "unresolved" } });
  }, [args.scopeKey, reset, dispatch]);

  const removeSlot = useCallback((id: string) => dispatch({ type: "remove", id }), [dispatch]);
  const chooseTemplate = useCallback((id: string, choice: TemplateChoice) => dispatch({ type: "choose", id, choice }), [dispatch]);
  const chooseTiming = useCallback((id: string, timing: AnnouncementTiming) => dispatch({ type: "choose-timing", id, timing }), [dispatch]);
  const setScheduledAt = useCallback((id: string, raw: string) => dispatch({ type: "set-scheduled-at", id, raw }), [dispatch]);
  const editSlot = useCallback(
    (id: string, field: "title" | "message" | "revisionNote", value: string) => dispatch({ type: "edit", id, field, value }),
    [dispatch]
  );

  const generate = useCallback(() => runnerRef.current!.generate(), []);
  const regenerate = useCallback((id: string) => { void runnerRef.current!.regenerate(id); }, []);
  const retry = useCallback((id: string) => { void runnerRef.current!.retry(id); }, []);

  const armRegenerate = useCallback((id: string) => dispatch({ type: "arm-regenerate", id }), [dispatch]);
  const cancelRegenerate = useCallback((id: string) => dispatch({ type: "cancel-regenerate", id }), [dispatch]);

  const commitPost = useCallback(
    (id: string) => {
      const slot = slotsRef.current.find((s) => s.id === id);
      if (!slot || slot.draft.phase !== "drafted") return;
      // WA-POST-LOCK: a locked (already posted) or in-flight slot never commits.
      if (!mayCommitPost(slot)) return;
      // A32/REQ-A32-1, RULING 65: resolve ONCE, through resolvePostCommit -
      // the SAME resolveScheduledVisibility call AnnouncementDraftSlot.tsx
      // reads for its consequence copy and all five ConfirmArmButtons
      // labels. A past-dated (but valid) pick resolves to "immediate" here
      // exactly as it does there, so the copy and the post decision can
      // never disagree (this is what the mandatory watched failure in
      // docs/a24-a32-waves.md section 6.4.4 proved: a length check here and
      // a future-time check there CAN disagree on this exact input). The
      // resolved scheduledLabel (or null) is carried into "post-result" so
      // the success sentence never has to re-resolve visibility at a later
      // render-time clock (RULING 64).
      const decision = resolvePostCommit(slot.scheduledAt, Date.now());
      if (decision.kind === "invalid") {
        dispatch({ type: "post-result", id, result: { error: "Could not read the scheduled visibility time." } });
        return;
      }
      const promise = argsRef.current.postDraft(slot.draft.draft.title, slot.draft.draft.message, postArgsFor(decision));
      if (promise === null) {
        dispatch({ type: "post-result", id, result: { error: "Choose a course above to post." } });
        return;
      }
      dispatch({ type: "posting", id });
      promise.then(
        (result) =>
          dispatch({
            type: "post-result",
            id,
            result: postResultFor(decision, result),
          }),
        () =>
          dispatch({
            type: "post-result",
            id,
            result: { error: POST_TRANSPORT_FAILURE_MESSAGE },
          })
      );
    },
    [dispatch]
  );

  const armPost = useCallback(
    (id: string) => {
      const slot = slotsRef.current.find((s) => s.id === id);
      if (!slot) return;
      // WA-POST-LOCK: nothing arms or commits while locked or in flight.
      if (!mayCommitPost(slot)) return;
      const signature = postSignatureFor(slot);
      if (signature === null) return;
      if (slot.postArmedFor === signature) {
        commitPost(id);
        return;
      }
      dispatch({ type: "arm-post", id, signature });
    },
    [commitPost, dispatch]
  );

  const cancelPost = useCallback((id: string) => dispatch({ type: "cancel-post", id }), [dispatch]);

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
  }, [dispatch]);

  const readyToDraftCount = emptySlotIds(slots).length;

  return {
    slots,
    readyToDraftCount,
    researching,
    addSlot,
    reset,
    removeSlot,
    chooseTemplate,
    chooseTiming,
    setScheduledAt,
    editSlot,
    generate,
    regenerate,
    retry,
    copySlot,
    armPost,
    cancelPost,
    armRegenerate,
    cancelRegenerate,
    postSignatureFor,
  };
}

function initialSlotsFromId(id: string): readonly DraftSlot[] {
  return [makeSlot(id, { kind: "unresolved" }, "beginning-of-week"), makeSlot("wta-slot-2", { kind: "unresolved" }, "midweek")];
}
