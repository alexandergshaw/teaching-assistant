/**
 * Typed contract for the "open-ai-chat" custom `window` event.
 *
 * This is the ONLY place that owns the event name and its payload shape, so
 * every dispatcher (`ContextMenu.tsx`, the Knowledge tab's "Ask AI" bulk
 * action, the Modules bulk bar's "Ask AI" row - see `OpenChatSelectionContext`
 * below) and the one listener (`AiChatFab.tsx`) stay in sync instead of
 * re-typing the string and the shape independently.
 *
 * `ContextMenu.tsx` dispatches this event with NO detail at all
 * (`window.dispatchEvent(new CustomEvent("open-ai-chat"))`) and must keep
 * working unchanged - see `parseOpenChatDetail` below.
 *
 * Kept a LEAF module on purpose: no React import, no DOM types beyond what a
 * `CustomEvent` dispatch needs, no `@/app/actions`. Anything that dispatches
 * or listens for this event - client component or plain module - can import
 * it without pulling in React or server-action machinery.
 */

/** The event name, so nobody re-types the string literal. */
export const OPEN_AI_CHAT_EVENT = "open-ai-chat";

/**
 * A Modules bulk-selection's already-gathered materials, carried by an
 * "open-ai-chat" dispatch (Contract 2 in
 * docs/modules-selection-ask-ai-acceptance-criteria.md). Built client-side
 * by the bulk bar's "Ask AI" row via `buildSelectionContextBlock`
 * (src/lib/chat/selection-context.ts) BEFORE this event ever fires - D1's
 * "gathered once, at click time" rule means this event carries the
 * finished text, never ids or a promise the listener would have to resolve.
 */
export interface OpenChatSelectionContext {
  /** Already-gathered material text, already framed and capped by
   * `buildSelectionContextBlock`. Never empty when present - a dispatcher
   * with nothing usable to show (A5: a blank gather result) must not
   * construct this object at all rather than constructing one with `text:
   * ""` and relying on the listener to notice. */
  text: string;
  /** Human-readable description of the selection, e.g. "12 items from 2
   * modules" (see `selectionContextLabel` in
   * src/lib/chat/selection-context.ts) - read by the chat window's context
   * strip (C4) and, independently, by the bulk bar's own success note (A6). */
  label?: string;
}

/**
 * Optional context carried by an "open-ai-chat" dispatch. Every field is
 * optional - a dispatch with no `detail` at all (the existing `ContextMenu`
 * caller) is just as valid as one carrying a full selection.
 */
export interface OpenChatDetail {
  /** Institution knowledge-base page ids to load into the chat as context. */
  knowledgePageIds?: string[];
  /** Optional human-readable description of the selection, e.g. "3 pages". */
  label?: string;
  /** Modules bulk-selection context (see `OpenChatSelectionContext` above).
   * Independent of `knowledgePageIds`/`label` above - a single dispatch may
   * carry either, both, or neither (C3), and the listener must never let
   * setting one clear the other. */
  selectionContext?: OpenChatSelectionContext;
}

/**
 * Dispatches the "open-ai-chat" event, optionally carrying a typed detail.
 * Calling this with no argument reproduces `ContextMenu.tsx`'s existing
 * `new CustomEvent("open-ai-chat")` dispatch exactly (`detail` is
 * `undefined`), which `parseOpenChatDetail` below is required to accept.
 *
 * No-ops outside a browser (e.g. during SSR) rather than throwing on a
 * missing `window`.
 */
export function openChat(detail?: OpenChatDetail): void {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new CustomEvent(OPEN_AI_CHAT_EVENT, { detail }));
}

/**
 * Pure, defensive parse of a dispatched event's `detail` into an
 * `OpenChatDetail`, or `null` when there is no usable context to apply.
 *
 * NEVER throws. A missing/`null` detail, a non-object (string, number,
 * array), a non-array `knowledgePageIds`, or an array containing non-string
 * entries all degrade safely rather than blowing up the listener - the chat
 * still opens, it just opens with no context (A2). `null` is the single
 * "no context" signal this function ever produces: an input object that,
 * once its fields are validated, contributes nothing usable (e.g.
 * `{ knowledgePageIds: "not-an-array" }`, or `{}`) also collapses to `null`,
 * so callers only ever have to check one thing rather than distinguishing
 * "malformed" from "valid-but-empty".
 *
 * `selectionContext` (C1) gets the same defensive treatment: it is accepted
 * ONLY when it is a plain object (not an array, not `null`) whose `text` is
 * a non-empty string once trimmed - anything else (missing, wrong type, an
 * empty/whitespace-only string) is ignored rather than passed through, so a
 * listener can trust that a present `selectionContext.text` is always
 * usable without re-checking it. `label`, like the top-level `label` field,
 * is kept only when it is itself a string; a non-string label degrades to
 * "no label", not to dropping the whole selectionContext.
 *
 * This is what keeps `ContextMenu.tsx`'s zero-detail dispatch
 * (`parseOpenChatDetail(undefined)`) working once the listener starts
 * reading `detail` - it parses to `null`, exactly like today's no-op.
 */
export function parseOpenChatDetail(detail: unknown): OpenChatDetail | null {
  if (detail === null || typeof detail !== "object" || Array.isArray(detail)) {
    return null;
  }

  const raw = detail as Record<string, unknown>;
  const result: OpenChatDetail = {};

  if (Array.isArray(raw.knowledgePageIds)) {
    result.knowledgePageIds = raw.knowledgePageIds.filter(
      (id): id is string => typeof id === "string"
    );
  }

  if (typeof raw.label === "string") {
    result.label = raw.label;
  }

  // selectionContext (C1): a plain object (never an array, never null)
  // whose `text` survives trimming to something non-empty. A malformed
  // shape here (wrong type entirely, or a blank/whitespace-only `text`)
  // simply means "no selection context was usable" - it never propagates
  // as an error, matching this function's overall "degrade, never throw"
  // contract.
  const rawSelectionContext = raw.selectionContext;
  if (
    typeof rawSelectionContext === "object" &&
    rawSelectionContext !== null &&
    !Array.isArray(rawSelectionContext)
  ) {
    const rawSc = rawSelectionContext as Record<string, unknown>;
    if (typeof rawSc.text === "string" && rawSc.text.trim().length > 0) {
      result.selectionContext = {
        text: rawSc.text,
        ...(typeof rawSc.label === "string" ? { label: rawSc.label } : {}),
      };
    }
  }

  return result.knowledgePageIds === undefined &&
    result.label === undefined &&
    result.selectionContext === undefined
    ? null
    : result;
}
