/** A row retains its complete HTML so comments and other fields are not discarded. */
export interface BrightspaceIndexRow { readonly cellTexts: readonly string[]; readonly html: string }
export interface BrightspaceIndexEvidence {
  readonly sourceHtml: string;
  readonly groups: Readonly<Record<string, readonly string[]>>;
  readonly unassigned: readonly string[];
}

/** Only a narrow set of static layout wrappers can be treated as non-evidence. */
export function isBrightspaceFormattingOnly(fragment: string): boolean {
  let cursor = 0; const tags = /<[^>]*>/g;
  for (const match of fragment.matchAll(tags)) {
    if (fragment.slice(cursor, match.index).replace(/\uFEFF/g, "").trim()) return false;
    const token = match[0], close = /^<\/\s*(html|body|table|tr|td)\s*>$/i.test(token);
    if (!close) {
      const open = /^<\s*(html|body|table|tr|td)\b([\s\S]*?)\s*\/?>$/i.exec(token); if (!open) return false;
      let rest = open[2];
      while (rest.trim()) {
        const attr = /^\s+(bgcolor|width|cellpadding|cellspacing|border|colspan)\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'<>`=]+))/i.exec(rest); if (!attr) return false;
        const name = attr[1].toLowerCase(), value = attr[2] ?? attr[3] ?? attr[4];
        if (name === "bgcolor" ? !/^(?:white|black|#[0-9a-f]{3,8})$/i.test(value) : !/^\d{1,4}%?$/.test(value)) return false;
        rest = rest.slice(attr[0].length);
      }
    }
    cursor = (match.index ?? 0) + token.length;
  }
  return !fragment.slice(cursor).replace(/\uFEFF/g, "").trim();
}

/** Untrusted HTML must never be rendered. The caller must preserve the original
 * separately and supply every outside-row fragment; this helper does not parse HTML. */
export function partitionBrightspaceRows(sourceHtml: string, rows: readonly BrightspaceIndexRow[], verifiedNames: Readonly<Record<string, string>>, outsideRows: readonly string[]): BrightspaceIndexEvidence {
  const groups: Record<string, string[]> = Object.create(null), unassigned = [...outsideRows];
  const normalize = (value: string) => value.normalize("NFKC").toLocaleLowerCase().trim().replace(/\s+/g, " ");
  const nameCounts = new Map<string, number>(); for (const name of Object.values(verifiedNames)) { const key = normalize(name); nameCounts.set(key, (nameCounts.get(key) ?? 0) + 1); }
  let header: string | null = null, headerName = "", headerUsed = false;
  const flushHeader = () => { if (header && !headerUsed) unassigned.push(header); header = null; headerName = ""; headerUsed = false; };
  for (const row of rows) {
    if (row.cellTexts.length === 1 && /^[^,\r\n]+,\s*[^,\r\n]+$/.test(row.cellTexts[0].trim())) { flushHeader(); header = row.html; headerName = normalize(row.cellTexts[0]); continue; }
    const label = row.cellTexts.length === 2 ? /^(\d+-\d+)\s+-\s+/.exec(row.cellTexts[0].trim())?.[1] : undefined;
    if (!label || !Object.hasOwn(verifiedNames, label) || normalize(verifiedNames[label]) !== headerName || nameCounts.get(headerName) !== 1 || !header) { unassigned.push(row.html); continue; }
    const entries = groups[label] ??= [];
    if (!headerUsed || !entries.includes(header)) entries.push(header);
    entries.push(row.html); headerUsed = true;
  }
  flushHeader();
  return { sourceHtml, groups, unassigned };
}
import { parse, type DefaultTreeAdapterMap } from "parse5";


type ParsedNode = DefaultTreeAdapterMap["node"];
type ParsedElement = DefaultTreeAdapterMap["element"];
const children = (node: ParsedNode): readonly ParsedNode[] => "childNodes" in node ? node.childNodes : [];
const isElement = (node: ParsedNode): node is ParsedElement => "tagName" in node;
function textOf(node: ParsedNode): string {
  return node.nodeName === "#text" && "value" in node ? node.value : children(node).map(textOf).join("");
}
function containsRow(node: ParsedNode): boolean {
  return (isElement(node) && node.tagName === "tr") || children(node).some(containsRow);
}

/** Parse without a browser or resource loading. Preserve every source text range:
 * unmatched markup, attributes, comments and outside text stay unassigned. */
export function parseBrightspaceIndexEvidence(sourceHtml: string, verifiedNames: Readonly<Record<string, string>>): BrightspaceIndexEvidence {
  const document = parse(sourceHtml, { sourceCodeLocationInfo: true });
  const leaves: ParsedElement[] = [];
  const walk = (node: ParsedNode) => {
    if (isElement(node) && node.tagName === "tr" && !children(node).some(containsRow)) leaves.push(node);
    for (const child of children(node)) walk(child);
  };
  walk(document);
  const rows: BrightspaceIndexRow[] = [], outside: string[] = []; let cursor = 0;
  for (const row of leaves) {
    const location = row.sourceCodeLocation;
    if (!location || location.startOffset < cursor || location.endOffset > sourceHtml.length) return { sourceHtml, groups: {}, unassigned: [sourceHtml] };
    const gap = sourceHtml.slice(cursor, location.startOffset); if (gap.trim()) outside.push(gap);
    rows.push({ cellTexts: children(row).filter((node): node is ParsedElement => isElement(node) && node.tagName === "td").map(textOf), html: sourceHtml.slice(location.startOffset, location.endOffset) });
    cursor = location.endOffset;
  }
  const tail = sourceHtml.slice(cursor); if (tail.trim()) outside.push(tail);
  if (!leaves.length) return { sourceHtml, groups: {}, unassigned: [sourceHtml] };
  return partitionBrightspaceRows(sourceHtml, rows, verifiedNames, outside);
}
