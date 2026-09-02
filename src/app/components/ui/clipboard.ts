// docs/recording-controls-ux-acceptance-criteria.md CC14: the same guard
// three discussion sites (DiscussionRepliesPanel.tsx:351-352,
// DiscussionReplyRow.tsx:348 and :378-379) and the new grading "Copy
// feedback" site each inlined independently. Throws under the same
// condition those sites already treat as failure - no `navigator.clipboard`
// (insecure context, or an old/embedded browser) or a non-secure origin.
export async function writeClipboardText(text: string): Promise<void> {
  if (!navigator.clipboard || !window.isSecureContext) {
    throw new Error("clipboard unavailable");
  }
  await navigator.clipboard.writeText(text);
}
