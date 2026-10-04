/**
 * Conservative markdown-to-plain-text stripper for Canvas inbox bodies, which
 * render as plain text. Only unambiguous markup is removed; a bare "#1" or an
 * underscore inside an address is left alone.
 */
export function canvasInboxPlainText(body: string): string {
  let out = body.replace(/<\/?[a-zA-Z][^>]*>/g, "");
  out = out
    .split("\n")
    .map((line) =>
      line.replace(/^(\s*)#{1,6}[ \t]+/, "$1").replace(/^(\s*)[-*+][ \t]+/, "$1")
    )
    .join("\n");
  out = out.replace(/\*\*([^*\n]+)\*\*/g, "$1");
  out = out.replace(/(^|[^\w])__([^_\n]+)__(?=[^\w]|$)/g, "$1$2");
  out = out.replace(/(^|[^\w*])\*([^*\n]+)\*(?=[^\w*]|$)/g, "$1$2");
  out = out.replace(/`([^`\n]+)`/g, "$1");
  return out;
}
