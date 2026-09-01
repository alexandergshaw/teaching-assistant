// Resource-controls feature: "it should be a simple one click to add in a
// found resource's link to a reply". This is the ONE pure function that
// decides what the reply text looks like after an insert - a plain,
// dependency-free leaf so it has a test surface at all (vitest in this repo
// is node-env and renders no component - see DiscussionReplyRow.tsx's own
// header for the same discipline).
//
// PLACEMENT DECISION: always appends at the END of the current reply text,
// never at the caller's cursor position. Two reasons, not one:
//   1. This textarea (DiscussionReplyRow.tsx's reply TextField) has no
//      existing cursor-tracking infrastructure anywhere in this codebase -
//      reading a live selectionStart/selectionEnd off a MUI-controlled
//      textarea across a click handler's own re-render is a real source of
//      stale-read bugs for a payoff (mid-sentence insertion) nobody asked
//      for here.
//   2. The codebase already establishes "resources live below the reply,
//      never inside it" as the canonical placement - see
//      DiscussionReplyRow.tsx's own R10 comment ("resources render beneath
//      the reply, never inside the textbox") and replyClipboardText /
//      tableClipboardText (discussion-capture.ts), which already render a
//      copied reply's resources as trailing lines in exactly this format
//      ("Title - url"). Appending at the end, in that same format, is not a
//      new convention - it is the existing one, now written into the box
//      itself instead of only onto the clipboard.
//
// Because this only ever APPENDS (slices nothing out of the existing text),
// it structurally cannot clobber a cursor position or wipe anything the
// instructor already wrote - the entire prior string survives unchanged as
// a prefix of the result.
export function appendResourceToReply(currentReply: string, resource: { title: string; url: string }): string {
  const trimmed = currentReply.replace(/\s+$/, "");
  const line = `${resource.title} - ${resource.url}`;
  return trimmed.length > 0 ? `${trimmed}\n\n${line}` : line;
}

// FIX 2 (review pass): one-click insert is a MOVE within a single render of
// the row's resource list - appendResourceToReply appends, and the caller
// (useDiscussionReplies.ts's insertResource) removes the item from that
// list, so a second click on the SAME rendered item is structurally
// impossible. But `applyResources` (useReplyRows.ts) replaces the row's
// resource list WHOLESALE, so if a resource pass runs again (a retry, a
// redraft, a per-row search) and happens to return the same URL, that item
// remounts in the list as a "new" entry and Insert becomes clickable on it
// again - the per-list guard above says nothing about it, and a second click
// would append a duplicate line.
//
// Guards against that by checking the REPLY TEXT itself for the URL,
// immediately before appending - not a separate "already inserted" id/url
// set. A separate list is state that can drift from what the instructor
// actually has in the box: if they delete the inserted line by hand and then
// click Insert again, a stale "already inserted" flag would wrongly refuse
// to re-add it, even though the text no longer contains it and re-inserting
// is exactly the correct behaviour there. Reading the live text instead
// means the check is always asking the right question - "is this URL in the
// box right now" - and needs no separate state to keep in sync.
export function replyAlreadyHasResource(currentReply: string, resource: { url: string }): boolean {
  return currentReply.includes(resource.url);
}
