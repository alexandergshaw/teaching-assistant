// "Jump to the Message Drafts tab" - the Saved-to-drafts link in
// MessageThreadRow.tsx (docs/message-replies-acceptance-criteria.md M16)
// needs to land the instructor on Manual > Workflows > Drafts > Messages
// without a plain <a href="?tab=workflows&workflowsView=drafts&draftsView=
// messages">: `tab`/`workflowsView`/`draftsView` are held in page.tsx's own
// component state (src/app/url-state.ts, src/app/components/home/
// useAppNavigation.ts), read fresh off the URL only on first load - a bare
// query-string link would force a full page reload just to switch tabs
// instead of using the SPA's own setters.
//
// Modeled on src/lib/knowledge-return.ts for its SSR guard, its
// documentation style and its "dispatch a live-listener event rather than
// thread a callback prop" shape - MessageThreadRow.tsx sits many components
// below page.tsx (the sole owner of setActiveTab/setWorkflowsView/
// setDraftsView, see that file's own header comment on the seam), the same
// distance knowledge-return.ts's own "Back to Knowledge" control crosses.
//
// Unlike knowledge-return.ts, this event carries no payload of its own to
// stash: there is no further "which page" to land on beyond the three fixed
// values every dispatch wants (tab=workflows, workflowsView=drafts,
// draftsView=messages) - so page.tsx's own listener can set all three itself
// with no one-shot slot to drain.
//
// Kept a LEAF module, like open-chat.ts and knowledge-return.ts: no React
// import, no DOM types beyond a CustomEvent dispatch, nothing server-only -
// either MessageThreadRow.tsx or page.tsx can import it without pulling in
// anything heavier.

/** The event name, so nobody re-types the string literal. */
export const MESSAGE_DRAFTS_NAV_EVENT = "ta-message-drafts-nav";

/**
 * Request a jump to Manual > Workflows > Drafts > Messages. Dispatches
 * MESSAGE_DRAFTS_NAV_EVENT so page.tsx's live listener (registered once, on
 * mount, next to its KNOWLEDGE_RETURN_EVENT listener - see that file's own
 * header on why it is the sole owner of these setters) can apply
 * setActiveTab("workflows"), setWorkflowsView("drafts") and
 * setDraftsView("messages") together.
 *
 * No-ops the dispatch outside a browser (SSR), matching returnToKnowledge()'s
 * own guard.
 */
export function openMessageDrafts(): void {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new CustomEvent(MESSAGE_DRAFTS_NAV_EVENT));
}
