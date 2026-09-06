// Client-safe leaf: the ONE implementation of Canvas description-to-HTML.
//
// TWO reasons it lives here, and both matter.
//
// 1. It must have exactly one implementation. It previously existed twice -
//    once in gradables.ts and once as `plainTextToPageHtml` - and nothing
//    enforced the copies staying identical, while a proposal preview is
//    required to show the EXACT bytes that will be sent to Canvas. A drift
//    would have made that preview a lie about a live write with every gate
//    still green.
//
// 2. It must be reachable from a Client Component. `gradables.ts`, where it
//    used to live, imports `../canvas-core`, which since the per-user
//    credential work resolves through `canvas-credentials.ts` ->
//    `supabase/server.ts` -> `next/headers` and `node:async_hooks` -
//    genuinely server-only and unbundleable for a browser target. Importing
//    this pure six-line string function dragged that entire graph into the
//    browser chunk and broke `next build`.
//
// So it lives here, importing NOTHING, and `gradables.ts` re-exports it so
// every server caller is unchanged. Client-reachable code must import from
// THIS module directly - never through `gradables.ts` or the
// `@/lib/canvas-modules` barrel, either of which reintroduces the edge.

/**
 * Canvas expects HTML in a description field. Plain text is escaped and its
 * newlines converted; text that already looks like HTML is passed through
 * untouched, because re-escaping it would double-encode a description the
 * instructor deliberately authored as markup.
 */
export function descriptionToHtml(text: string): string {
  if (text.trim() === "") return text;
  if (/<\/?[a-z][\s\S]*>/i.test(text)) return text;
  const escaped = text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  return escaped.replace(/\r\n?/g, "\n").replace(/\n/g, "<br>\n");
}
