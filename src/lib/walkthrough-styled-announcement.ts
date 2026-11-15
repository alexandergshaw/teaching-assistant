import { HTMLElement, parse } from "node-html-parser";
import { markdownToHtml } from "./markdown";
import { sanitizeRecordingAnnouncementHtml } from "./recording-announcement-html";

/** Verify the styled representation has exactly the same content and links as
 * the Markdown draft, and sanitize it again at every trust boundary. */
export function verifiedStyledAnnouncement(message: string, html: string | undefined): string | null {
  if (!html || html.length > 1_000_000) return null;
  const safe = sanitizeRecordingAnnouncementHtml(html);
  const expected = parse(markdownToHtml(message));
  const actual = parse(safe);
  const text = (value: string) => value.replace(/\s+/g, " ").trim();
  const content = (root: ReturnType<typeof parse>) => {
    let prefix = "";
    const anchors: { href: string; text: string; offset: number }[] = [];
    const visit = (node: (typeof root)["childNodes"][number]) => {
      if (node.nodeType === 3) { prefix += node.text; return; }
      if (!(node instanceof HTMLElement)) return;
      const tag = node.rawTagName?.toLowerCase() ?? "";
      const block = ["p", "div", "h1", "h2", "h3", "h4", "h5", "h6", "ul", "ol", "li", "br"].includes(tag);
      if (block) prefix += " ";
      if (tag === "a") anchors.push({ href: node.getAttribute("href") ?? "", text: text(node.text), offset: text(prefix).length });
      node.childNodes.forEach(visit);
      if (block) prefix += " ";
    };
    root.childNodes.forEach(visit);
    return { text: text(prefix), anchors };
  };
  const structure = (root: ReturnType<typeof parse>) => {
    const visit = (node: (typeof root)["childNodes"][number], inListItem: boolean): string[] => {
      if (!("rawTagName" in node)) return [];
      const tag = node.rawTagName?.toLowerCase() ?? "";
      const block = tag === "div" ? "p" : tag;
      const own = ["p", "h1", "h2", "h3", "h4", "h5", "h6", "ul", "ol", "li"].includes(block) && !(block === "p" && inListItem) ? [block] : [];
      return [...own, ...node.childNodes.flatMap(child => visit(child, inListItem || tag === "li"))];
    };
    return root.childNodes.flatMap(node => visit(node, false));
  };
  const actualContent = content(actual), expectedContent = content(expected);
  const actualStructure = structure(actual), expectedStructure = structure(expected);
  const structureMatches = actualStructure.length === expectedStructure.length && actualStructure.every((tag, index) => tag === expectedStructure[index] || (tag === "p" && /^h[1-6]$/.test(expectedStructure[index])));
  if (!actualContent.text || actualContent.text !== expectedContent.text || JSON.stringify(actualContent.anchors) !== JSON.stringify(expectedContent.anchors) || !structureMatches) return null;
  return safe;
}
