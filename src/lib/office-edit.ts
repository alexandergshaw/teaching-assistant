import JSZip from "jszip";

/**
 * In-place paragraph-level editing of Office Open XML files (.docx / .pptx).
 *
 * docx/pptx are ZIP archives of XML. To edit text without losing the original
 * formatting, images, or layout, we rewrite only the affected paragraphs' text
 * runs inside the original XML rather than regenerating the document. Each
 * edited paragraph's full text is written into its first text run and the rest
 * of that paragraph's runs are emptied, so paragraph structure and styles are
 * preserved (formatting that varies within a paragraph collapses to its base
 * style). Unedited paragraphs are left byte-for-byte untouched.
 *
 * Server-only: imports jszip.
 */

export type OfficeKind = "docx" | "pptx";

/**
 * One inline span of a paragraph: a stretch of text with uniform formatting.
 * Marks are direct run formatting only (what the run carries itself, not what
 * it inherits from paragraph/character styles), which is what the editors can
 * toggle. `sizePt` is the font size in points.
 */
export interface RunSpan {
  text: string;
  bold?: boolean;
  italic?: boolean;
  underline?: boolean;
  sizePt?: number;
}

/** One editable paragraph. `slide` is set (1-based) for pptx. */
export interface OfficeParagraph {
  id: string;
  slide?: number;
  /** The paragraph's full text (all runs concatenated). */
  text: string;
  /** The paragraph split into formatted spans (concatenate to `text`). */
  runs: RunSpan[];
}

/** Whether a span list carries no formatting (so it can use the plain path). */
export function spansArePlain(spans: RunSpan[]): boolean {
  return spans.every((s) => !s.bold && !s.italic && !s.underline && s.sizePt == null);
}

/** The plain text of a span list. */
export function spansPlainText(spans: RunSpan[]): string {
  return spans.map((s) => s.text).join("");
}

/** Merge neighbouring spans that share identical marks. */
function mergeSpans(spans: RunSpan[]): RunSpan[] {
  const out: RunSpan[] = [];
  for (const s of spans) {
    const prev = out[out.length - 1];
    if (
      prev &&
      !!prev.bold === !!s.bold &&
      !!prev.italic === !!s.italic &&
      !!prev.underline === !!s.underline &&
      prev.sizePt === s.sizePt
    ) {
      prev.text += s.text;
    } else {
      out.push({ ...s });
    }
  }
  return out;
}

function decodeXmlEntities(value: string): string {
  return value
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&amp;/g, "&");
}

function escapeXml(value: string): string {
  return value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

// Non-self-closing paragraph matchers (the negative lookbehind skips <w:p/> / <a:p/>).
const DOCX_PARA = /<w:p\b[^>]*(?<!\/)>[\s\S]*?<\/w:p>/g;
const PPTX_PARA = /<a:p\b[^>]*(?<!\/)>[\s\S]*?<\/a:p>/g;
const DOCX_RUN = /<w:t\b[^>]*>([\s\S]*?)<\/w:t>/g;
const PPTX_RUN = /<a:t\b[^>]*>([\s\S]*?)<\/a:t>/g;

/** Concatenate a paragraph's run text. */
function paragraphText(paraXml: string, runRe: RegExp): string {
  let text = "";
  for (const match of paraXml.matchAll(new RegExp(runRe.source, "g"))) {
    text += decodeXmlEntities(match[1] ?? "");
  }
  return text;
}

// An on/off docx toggle (<w:b/>, <w:i/>): present and not explicitly disabled.
function docxToggleOn(rprInner: string, tag: "w:b" | "w:i"): boolean {
  const m = rprInner.match(new RegExp(`<${tag}\\b(?:[^>]*\\bw:val="([^"]*)")?[^>]*/>`));
  if (!m) return false;
  return m[1] == null || !/^(0|false|none|off)$/i.test(m[1]);
}

/** Read the direct formatting marks from a docx run's <w:rPr> inner XML. */
function readDocxMarks(rprInner: string): Omit<RunSpan, "text"> {
  const u = rprInner.match(/<w:u\b[^>]*\bw:val="([^"]*)"[^>]*\/>/);
  const sz = rprInner.match(/<w:sz\b[^>]*\bw:val="(\d+)"[^>]*\/>/);
  return {
    bold: docxToggleOn(rprInner, "w:b") || undefined,
    italic: docxToggleOn(rprInner, "w:i") || undefined,
    underline: u && !/^none$/i.test(u[1]) ? true : undefined,
    sizePt: sz ? Number(sz[1]) / 2 : undefined,
  };
}

/** Split a docx paragraph into formatted spans (runs that carry text). */
function extractDocxRuns(paraXml: string): RunSpan[] {
  const spans: RunSpan[] = [];
  for (const run of paraXml.matchAll(/<w:r\b[^>]*>([\s\S]*?)<\/w:r>/g)) {
    const inner = run[1];
    const rprInner = inner.match(/<w:rPr>([\s\S]*?)<\/w:rPr>/)?.[1] ?? "";
    let text = "";
    for (const t of inner.matchAll(/<w:t\b[^>]*>([\s\S]*?)<\/w:t>/g)) text += decodeXmlEntities(t[1] ?? "");
    if (!text) continue;
    spans.push({ text, ...readDocxMarks(rprInner) });
  }
  return mergeSpans(spans);
}

/** Split a pptx paragraph into formatted spans (runs that carry text). */
function extractPptxRuns(paraXml: string): RunSpan[] {
  const spans: RunSpan[] = [];
  for (const run of paraXml.matchAll(/<a:r\b[^>]*>([\s\S]*?)<\/a:r>/g)) {
    const inner = run[1];
    const rpr = inner.match(/<a:rPr\b[^>]*?(?:\/>|>[\s\S]*?<\/a:rPr>)/)?.[0] ?? "";
    let text = "";
    for (const t of inner.matchAll(/<a:t\b[^>]*>([\s\S]*?)<\/a:t>/g)) text += decodeXmlEntities(t[1] ?? "");
    if (!text) continue;
    const u = rpr.match(/\bu="([^"]*)"/);
    const sz = rpr.match(/\bsz="(\d+)"/);
    spans.push({
      text,
      bold: /\bb="(?:1|true|on)"/i.test(rpr) || undefined,
      italic: /\bi="(?:1|true|on)"/i.test(rpr) || undefined,
      underline: u && !/^none$/i.test(u[1]) ? true : undefined,
      sizePt: sz ? Number(sz[1]) / 100 : undefined,
    });
  }
  return mergeSpans(spans);
}

/** Put `newText` into the paragraph's first text run; empty the remaining runs. */
function rewriteRuns(paraXml: string, newText: string, tag: "w:t" | "a:t"): string {
  const re = new RegExp(`<${tag}\\b([^>]*)>[\\s\\S]*?</${tag}>`, "g");
  let first = true;
  return paraXml.replace(re, (_match, attrs: string) => {
    if (first) {
      first = false;
      const withSpace = /xml:space=/.test(attrs) ? attrs : `${attrs} xml:space="preserve"`;
      return `<${tag}${withSpace}>${escapeXml(newText)}</${tag}>`;
    }
    return `<${tag}${attrs}></${tag}>`;
  });
}

// Build a docx run's <w:rPr> from a base run's rPr inner XML (keeps rStyle,
// font, and colour) with this span's bold/italic/underline/size layered on.
// Children are emitted in OOXML CT_RPr order so Word accepts the file.
function buildDocxRunProps(baseInner: string, span: RunSpan): string {
  const rStyle = baseInner.match(/<w:rStyle\b[^>]*\/>/)?.[0] ?? "";
  const rFonts = baseInner.match(/<w:rFonts\b[^>]*\/>/)?.[0] ?? "";
  const color = baseInner.match(/<w:color\b[^>]*\/>/)?.[0] ?? "";
  const baseSz = baseInner.match(/<w:sz\b[^>]*\bw:val="(\d+)"/)?.[1];
  const half = span.sizePt != null ? Math.round(span.sizePt * 2) : baseSz ? Number(baseSz) : undefined;
  const parts: string[] = [];
  if (rStyle) parts.push(rStyle);
  if (rFonts) parts.push(rFonts);
  if (span.bold) parts.push("<w:b/>");
  if (span.italic) parts.push("<w:i/>");
  if (color) parts.push(color);
  if (half != null) parts.push(`<w:sz w:val="${half}"/><w:szCs w:val="${half}"/>`);
  if (span.underline) parts.push('<w:u w:val="single"/>');
  return parts.length ? `<w:rPr>${parts.join("")}</w:rPr>` : "";
}

// Rebuild a docx paragraph from formatted spans, keeping its <w:pPr> and basing
// each run's properties on the paragraph's first run. Used only when a span
// carries formatting; structural inline content (hyperlinks, bookmarks) in that
// paragraph is not preserved, matching how intra-paragraph runs already collapse.
function rebuildDocxParagraph(paraXml: string, spans: RunSpan[]): string {
  if (spansArePlain(spans)) return rewriteRuns(paraXml, spansPlainText(spans), "w:t");
  const open = paraXml.match(/^<w:p\b[^>]*>/)?.[0] ?? "<w:p>";
  const pPr = paraXml.match(/<w:pPr>[\s\S]*?<\/w:pPr>/)?.[0] ?? paraXml.match(/<w:pPr\/>/)?.[0] ?? "";
  const afterPPr = pPr ? paraXml.slice(paraXml.indexOf(pPr) + pPr.length) : paraXml;
  const baseInner = afterPPr.match(/<w:rPr>([\s\S]*?)<\/w:rPr>/)?.[1] ?? "";
  const runs = spans
    .map((s) => `<w:r>${buildDocxRunProps(baseInner, s)}<w:t xml:space="preserve">${escapeXml(s.text)}</w:t></w:r>`)
    .join("");
  return `${open}${pPr}${runs}</w:p>`;
}

// Build a pptx run's <a:rPr> from a base run's rPr (keeps fill/font children)
// with this span's marks merged in as attributes (order-independent in XML).
function buildPptxRunProps(baseRpr: string, span: RunSpan): string {
  const open = baseRpr.match(/^<a:rPr\b([^>]*?)(\/?)>/);
  let attrs = open ? open[1] : "";
  const children = open && open[2] !== "/" ? baseRpr.slice(open[0].length, baseRpr.lastIndexOf("</a:rPr>")) : "";
  attrs = attrs.replace(/\s+(?:b|i|u|sz)="[^"]*"/g, "");
  const baseSz = baseRpr.match(/\bsz="(\d+)"/)?.[1];
  const hundredths = span.sizePt != null ? Math.round(span.sizePt * 100) : baseSz ? Number(baseSz) : undefined;
  let add = "";
  if (hundredths != null) add += ` sz="${hundredths}"`;
  if (span.bold) add += ' b="1"';
  if (span.italic) add += ' i="1"';
  if (span.underline) add += ' u="sng"';
  const attrStr = `${attrs}${add}`.trim();
  const prefix = attrStr ? ` ${attrStr}` : "";
  return children ? `<a:rPr${prefix}>${children}</a:rPr>` : `<a:rPr${prefix}/>`;
}

// Rebuild a pptx paragraph from formatted spans, keeping <a:pPr> and the closing
// <a:endParaRPr>. Used only when a span carries formatting.
function rebuildPptxParagraph(paraXml: string, spans: RunSpan[]): string {
  if (spansArePlain(spans)) return rewriteRuns(paraXml, spansPlainText(spans), "a:t");
  const open = paraXml.match(/^<a:p\b[^>]*>/)?.[0] ?? "<a:p>";
  const pPr = paraXml.match(/<a:pPr\b[^>]*?(?:\/>|>[\s\S]*?<\/a:pPr>)/)?.[0] ?? "";
  const endPr = paraXml.match(/<a:endParaRPr\b[^>]*?(?:\/>|>[\s\S]*?<\/a:endParaRPr>)/)?.[0] ?? "";
  const afterPPr = pPr ? paraXml.slice(paraXml.indexOf(pPr) + pPr.length) : paraXml;
  const baseRpr = afterPPr.match(/<a:rPr\b[^>]*?(?:\/>|>[\s\S]*?<\/a:rPr>)/)?.[0] ?? "";
  const runs = spans
    .map((s) => `<a:r>${buildPptxRunProps(baseRpr, s)}<a:t>${escapeXml(s.text)}</a:t></a:r>`)
    .join("");
  return `${open}${pPr}${runs}${endPr}</a:p>`;
}

function sortedSlides(zip: JSZip) {
  return Object.values(zip.files)
    .filter((entry) => /^ppt\/slides\/slide\d+\.xml$/i.test(entry.name))
    .sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true }));
}

/** Parse a file's editable paragraphs (those that contain text). */
export async function parseOfficeParagraphs(kind: OfficeKind, buffer: Buffer): Promise<OfficeParagraph[]> {
  const zip = await JSZip.loadAsync(buffer);

  if (kind === "docx") {
    const file = zip.file("word/document.xml");
    if (!file) return [];
    const xml = await file.async("string");
    const out: OfficeParagraph[] = [];
    let i = 0;
    for (const match of xml.matchAll(DOCX_PARA)) {
      const text = paragraphText(match[0], DOCX_RUN);
      if (text.trim()) out.push({ id: `p${i}`, text, runs: extractDocxRuns(match[0]) });
      i += 1;
    }
    return out;
  }

  // pptx
  const slides = sortedSlides(zip);
  const out: OfficeParagraph[] = [];
  for (let s = 0; s < slides.length; s += 1) {
    const xml = await slides[s].async("string");
    let p = 0;
    for (const match of xml.matchAll(PPTX_PARA)) {
      const text = paragraphText(match[0], PPTX_RUN);
      if (text.trim()) out.push({ id: `s${s}_p${p}`, slide: s + 1, text, runs: extractPptxRuns(match[0]) });
      p += 1;
    }
  }
  return out;
}

/** Apply edited paragraph spans back into the original file; return the new bytes. */
export async function applyOfficeEdits(
  kind: OfficeKind,
  buffer: Buffer,
  edits: Record<string, RunSpan[]>
): Promise<Buffer> {
  const zip = await JSZip.loadAsync(buffer);

  if (kind === "docx") {
    const file = zip.file("word/document.xml");
    if (!file) return buffer;
    let xml = await file.async("string");
    let i = -1;
    xml = xml.replace(DOCX_PARA, (para) => {
      i += 1;
      const id = `p${i}`;
      return id in edits ? rebuildDocxParagraph(para, edits[id]) : para;
    });
    zip.file("word/document.xml", xml);
  } else {
    const slides = sortedSlides(zip);
    for (let s = 0; s < slides.length; s += 1) {
      const file = slides[s];
      let xml = await file.async("string");
      let p = -1;
      let touched = false;
      xml = xml.replace(PPTX_PARA, (para) => {
        p += 1;
        const id = `s${s}_p${p}`;
        if (!(id in edits)) return para;
        touched = true;
        return rebuildPptxParagraph(para, edits[id]);
      });
      if (touched) zip.file(file.name, xml);
    }
  }

  return Buffer.from(await zip.generateAsync({ type: "nodebuffer" }));
}

/**
 * Rebuild a .docx from an ordered list of sections so paragraphs can be edited,
 * deleted, or added while keeping the original formatting. Each section names the
 * source paragraph id whose style/position it borrows; multiple sections may share
 * a source id (the first rewrites that paragraph, the rest are clones placed right
 * after it, inheriting its style). A known paragraph with no section is dropped.
 * Empty/structural paragraphs (not in `knownIds`) are always kept untouched.
 */
export async function applyDocxSections(
  buffer: Buffer,
  knownIds: string[],
  sections: Array<{ sourceId: string; spans: RunSpan[] }>
): Promise<Buffer> {
  const groups = new Map<string, RunSpan[][]>();
  for (const s of sections) {
    const list = groups.get(s.sourceId);
    if (list) list.push(s.spans);
    else groups.set(s.sourceId, [s.spans]);
  }
  const known = new Set(knownIds);

  const zip = await JSZip.loadAsync(buffer);
  const file = zip.file("word/document.xml");
  if (!file) return buffer;
  let xml = await file.async("string");
  let i = -1;
  xml = xml.replace(DOCX_PARA, (para) => {
    i += 1;
    const id = `p${i}`;
    if (!known.has(id)) return para; // empty/structural paragraph — leave as-is
    const spanLists = groups.get(id);
    if (!spanLists || spanLists.length === 0) return ""; // deleted by the user
    return spanLists.map((spans) => rebuildDocxParagraph(para, spans)).join("");
  });
  zip.file("word/document.xml", xml);
  return Buffer.from(await zip.generateAsync({ type: "nodebuffer" }));
}
