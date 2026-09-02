// "Navigate directly back to where I left off on the Knowledge page"
// (docs/knowledge-recording-handoff-acceptance-criteria.md, AC4) - the
// window-event bridge from a recording destination's "Back to Knowledge"
// control back to the Knowledge tab.
//
// Modeled on src/lib/chat/open-chat.ts for its SSR guard, its defensive
// posture, and its documentation style - but the SHAPE this module gives its
// payload is deliberately the OPPOSITE of that module's (and of
// src/lib/recording-launch.ts's `view`/`knowledgeContext` split), for a
// reason worth stating rather than copying blindly:
//
// - recording-launch.ts's `view` rides the event `detail` itself, because
//   RecordingTab/GradingRecordingPanel are kept mounted for the WHOLE app
//   session (see page.tsx's own "kept mounted at all times" comment) - a
//   live `window.addEventListener` registered once, on mount, is the only
//   shape that ever observes a SECOND launch, not just the first.
// - This module's consumer is the opposite. page.tsx renders KnowledgeTab
//   only as `{activeTab === "knowledge" && <KnowledgeTab ... />}` (verified
//   directly in page.tsx, not assumed) - it fully UNMOUNTS the instant the
//   instructor leaves the Knowledge tab, and mounts fresh every time they
//   come back. A "Back to Knowledge" button lives on the Recording tab,
//   which means this event is always dispatched while KnowledgeTab does not
//   exist yet - a live listener registered inside ITS OWN mount effect could
//   never see an event that fired a moment before that effect could run.
//
// So the one thing every dispatch needs to reach a listener that is ALREADY
// registered when it fires - page.tsx's own always-mounted handler, the sole
// place allowed to call setActiveTab (see its header comment) - rides the
// bare event itself, exactly like RECORDING_LAUNCH_EVENT's `view`. The page
// to land on, by contrast, is consumed by a listener that does not exist yet
// at dispatch time, so it is parked in a one-shot module slot (mirroring
// recording-launch.ts's own `pendingKnowledgeContext`) that KnowledgeTab.tsx
// drains in ITS OWN mount effect, once it exists to read it and once its own
// page list has loaded far enough to validate the id against.
//
// Kept a LEAF module, like open-chat.ts: no React import, no DOM types
// beyond a CustomEvent dispatch, nothing server-only - either the Knowledge
// tab or a recording destination can import it without pulling in anything
// heavier.

/** The event name, so nobody re-types the string literal. */
export const KNOWLEDGE_RETURN_EVENT = "ta-knowledge-return";

// One-shot slot for the page id to land on - see this module's header for
// why this rides a slot (KnowledgeTab.tsx's own mount effect) rather than
// the event `detail` a live listener would read.
let pendingReturnPageId: string | null = null;

/**
 * Request a return to the Knowledge tab, optionally landing on a specific
 * page (KnowledgeTab.tsx selects it and expands its ancestors, mirroring its
 * own openSearchHit behavior for a search result - reused there rather than
 * reinvented). Stashes `pageId` (when it is a non-blank string) for one-shot
 * pickup by takeKnowledgeReturnPageId, then dispatches
 * KNOWLEDGE_RETURN_EVENT so page.tsx's live listener can switch tabs.
 *
 * A missing or blank `pageId` still requests the tab switch - it just leaves
 * nothing for KnowledgeTab to select once it lands, same as visiting the tab
 * any other way. Any previously-pending id is overwritten (not merged) by a
 * bare call, mirroring recording-launch.ts's own "a bare-view launch clears
 * any previously pending context" rule - a caller that fires this a second
 * time meant the SECOND call's payload, not a stale earlier one.
 *
 * No-ops the dispatch outside a browser (SSR), matching openChat()'s own
 * guard - the pending id is still stashed either way, so a later, real
 * dispatch from the same call is never the reason a value goes missing.
 */
export function returnToKnowledge(pageId?: string): void {
  pendingReturnPageId = typeof pageId === "string" && pageId.trim().length > 0 ? pageId : null;
  if (typeof window === "undefined") return;
  window.dispatchEvent(new CustomEvent(KNOWLEDGE_RETURN_EVENT));
}

/**
 * Read and clear the page id stashed by the most recent returnToKnowledge()
 * call, or null when there is none (a bare "just switch tabs" request, or
 * nothing pending at all). One-shot: a second call in a row always returns
 * null, so a page id can never be applied twice - see KnowledgeTab.tsx's own
 * mount effect for why applying it more than once (e.g. on a re-render
 * rather than a fresh mount) would be wrong.
 */
export function takeKnowledgeReturnPageId(): string | null {
  const id = pendingReturnPageId;
  pendingReturnPageId = null;
  return id;
}
