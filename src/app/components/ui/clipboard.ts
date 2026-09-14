// docs/recording-controls-ux-acceptance-criteria.md CC14: the same guard
// three discussion sites (DiscussionRepliesPanel.tsx:351-352,
// DiscussionReplyRow.tsx:348 and :378-379) and the new grading "Copy
// feedback" site each inlined independently. Throws under the same
// condition those sites already treat as failure - no `navigator.clipboard`
// (insecure context, or an old/embedded browser) or a non-secure origin.
//
// The optional `html` argument (walkthrough-announcement's own AC-F6) puts a
// SECOND, richer representation on the clipboard alongside the plain-text
// one via a multi-type ClipboardItem, so a paste into a rich-text target
// (an email, a document) renders formatting instead of literal Markdown
// characters. Every one of the seven existing callers omits it and keeps
// working unchanged - `text` alone still writes with the plain-text API.
// When `html` is supplied but `ClipboardItem`/`navigator.clipboard.write`
// is unavailable (an older or embedded browser), this falls back to the
// plain-text write rather than throwing - the caller still gets SOMETHING
// on the clipboard.
export async function writeClipboardText(text: string, html?: string): Promise<void> {
  if (!navigator.clipboard || !window.isSecureContext) {
    throw new Error("clipboard unavailable");
  }
  if (html !== undefined && typeof ClipboardItem !== "undefined" && typeof navigator.clipboard.write === "function") {
    try {
      const item = new ClipboardItem({
        "text/plain": new Blob([text], { type: "text/plain" }),
        "text/html": new Blob([html], { type: "text/html" }),
      });
      await navigator.clipboard.write([item]);
      return;
    } catch {
      // Fall through to the plain-text write below - some browsers support
      // ClipboardItem but reject a multi-type write in certain contexts.
    }
  }
  await navigator.clipboard.writeText(text);
}
