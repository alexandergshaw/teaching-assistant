/**
 * Typed contract for the "open-ai-chat" custom `window` event.
 *
 * This is the ONLY place that owns the event name and its payload shape, so
 * every dispatcher (`ContextMenu.tsx`, the Knowledge tab's "Ask AI" bulk
 * action) and the one listener (`AiChatFab.tsx`) stay in sync instead of
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
 * Optional context carried by an "open-ai-chat" dispatch. Every field is
 * optional - a dispatch with no `detail` at all (the existing `ContextMenu`
 * caller) is just as valid as one carrying a full selection.
 */
export interface OpenChatDetail {
  /** Institution knowledge-base page ids to load into the chat as context. */
  knowledgePageIds?: string[];
  /** Optional human-readable description of the selection, e.g. "3 pages". */
  label?: string;
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

  return result.knowledgePageIds === undefined && result.label === undefined
    ? null
    : result;
}
