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
  /**
   * For runs inside a docx <w:hyperlink>, the hyperlink element's attributes
   * (e.g. `r:id="rId5"` or `w:anchor="top"`), kept verbatim so the link can be
   * re-wrapped on rebuild. The r:id points at an existing relationship we never
   * touch, so it stays valid.
   */
  link?: string;
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

/** Whether two spans carry the same marks (ignoring text). */
function sameMarks(a: RunSpan, b: RunSpan): boolean {
  return (
    !!a.bold === !!b.bold &&
    !!a.italic === !!b.italic &&
    !!a.underline === !!b.underline &&
    a.sizePt === b.sizePt &&
    (a.link ?? "") === (b.link ?? "")
  );
}

/** Whether two span lists carry identical text and formatting. */
export function spansEqual(a: RunSpan[], b: RunSpan[]): boolean {
  if (a.length !== b.length) return false;
  return a.every((s, i) => s.text === b[i].text && sameMarks(s, b[i]));
}

/** Merge neighbouring spans that share identical marks. */
function mergeSpans(spans: RunSpan[]): RunSpan[] {
  const out: RunSpan[] = [];
  for (const s of spans) {
    const prev = out[out.length - 1];
    if (prev && sameMarks(prev, s)) {
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
  // Walk runs and hyperlink boundaries in order so each run knows whether it
  // sits inside a <w:hyperlink> (hyperlinks can't nest, so a flat flag suffices).
  let link: string | undefined;
  const tokens = /<w:hyperlink\b([^>]*)>|<\/w:hyperlink>|<w:r\b[^>]*>([\s\S]*?)<\/w:r>/g;
  for (const m of paraXml.matchAll(tokens)) {
    if (m[0] === "</w:hyperlink>") {
      link = undefined;
      continue;
    }
    if (m[0].startsWith("<w:hyperlink")) {
      link = m[1].trim();
      continue;
    }
    const inner = m[2];
    const rprInner = inner.match(/<w:rPr>([\s\S]*?)<\/w:rPr>/)?.[1] ?? "";
    let text = "";
    for (const t of inner.matchAll(/<w:t\b[^>]*>([\s\S]*?)<\/w:t>/g)) text += decodeXmlEntities(t[1] ?? "");
    if (!text) continue;
    const span: RunSpan = { text, ...readDocxMarks(rprInner) };
    if (link) span.link = link;
    spans.push(span);
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

// All of `newText` collapses into a paragraph's first run, so if that run is
// bold/italic/underlined the whole line inherits it (e.g. a bold "Label:" run
// in front of a plain value). The plain path means the spans carry no marks, so
// neutralize those toggles on the first text-bearing run to keep the text plain.
function stripFirstRunMarksDocx(paraXml: string): string {
  let done = false;
  return paraXml.replace(/<w:r\b[^>]*>[\s\S]*?<\/w:r>/g, (run) => {
    if (done || !/<w:t\b/.test(run)) return run;
    done = true;
    return run.replace(/<w:rPr>([\s\S]*?)<\/w:rPr>/, (_m, inner: string) => {
      const stripped = inner
        .replace(/<w:b\b[^>]*\/>/g, "")
        .replace(/<w:bCs\b[^>]*\/>/g, "")
        .replace(/<w:i\b[^>]*\/>/g, "")
        .replace(/<w:iCs\b[^>]*\/>/g, "")
        .replace(/<w:u\b[^>]*\/>/g, "");
      return stripped ? `<w:rPr>${stripped}</w:rPr>` : "";
    });
  });
}

// pptx equivalent: run marks are attributes (b/i/u) on the first run's <a:rPr>.
function stripFirstRunMarksPptx(paraXml: string): string {
  let done = false;
  return paraXml.replace(/<a:r\b[^>]*>[\s\S]*?<\/a:r>/g, (run) => {
    if (done || !/<a:t\b/.test(run)) return run;
    done = true;
    return run.replace(/<a:rPr\b([^>]*?)(\/?)>/, (_m, attrs: string, slash: string) => {
      const cleaned = attrs.replace(/\s+(?:b|i|u)="[^"]*"/g, "");
      return `<a:rPr${cleaned}${slash}>`;
    });
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
  // Keep the base run's character style; if a link run has none, fall back to the
  // built-in "Hyperlink" style so it still renders blue/underlined (Word ignores
  // the reference if that style isn't defined, so it's safe).
  if (rStyle) parts.push(rStyle);
  else if (span.link) parts.push('<w:rStyle w:val="Hyperlink"/>');
  if (rFonts) parts.push(rFonts);
  if (span.bold) parts.push("<w:b/>");
  if (span.italic) parts.push("<w:i/>");
  if (color) parts.push(color);
  if (half != null) parts.push(`<w:sz w:val="${half}"/><w:szCs w:val="${half}"/>`);
  if (span.underline) parts.push('<w:u w:val="single"/>');
  return parts.length ? `<w:rPr>${parts.join("")}</w:rPr>` : "";
}

// Rebuild a docx paragraph from formatted spans, keeping its <w:pPr> and basing
// each run's properties on the paragraph's first run. Consecutive spans that
// share a `link` are re-wrapped in their original <w:hyperlink> so links survive
// edits. Used only when a span carries formatting (or a link); other structural
// inline content (bookmarks) in that paragraph is not preserved.
function rebuildDocxParagraph(paraXml: string, spans: RunSpan[]): string {
  if (spansArePlain(spans) && spans.every((s) => !s.link)) {
    return rewriteRuns(stripFirstRunMarksDocx(paraXml), spansPlainText(spans), "w:t");
  }
  const open = paraXml.match(/^<w:p\b[^>]*>/)?.[0] ?? "<w:p>";
  const pPr = paraXml.match(/<w:pPr>[\s\S]*?<\/w:pPr>/)?.[0] ?? paraXml.match(/<w:pPr\/>/)?.[0] ?? "";
  const afterPPr = pPr ? paraXml.slice(paraXml.indexOf(pPr) + pPr.length) : paraXml;
  const baseInner = afterPPr.match(/<w:rPr>([\s\S]*?)<\/w:rPr>/)?.[1] ?? "";
  const run = (s: RunSpan) =>
    `<w:r>${buildDocxRunProps(baseInner, s)}<w:t xml:space="preserve">${escapeXml(s.text)}</w:t></w:r>`;
  let body = "";
  for (let i = 0; i < spans.length; ) {
    const link = spans[i].link;
    if (link) {
      let group = "";
      while (i < spans.length && spans[i].link === link) group += run(spans[i++]);
      body += `<w:hyperlink ${link}>${group}</w:hyperlink>`;
    } else {
      body += run(spans[i++]);
    }
  }
  return `${open}${pPr}${body}</w:p>`;
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
  if (spansArePlain(spans)) return rewriteRuns(stripFirstRunMarksPptx(paraXml), spansPlainText(spans), "a:t");
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

/**
 * Apply an ordered list of sections back into the original file. Each section
 * names the source paragraph id whose style/position it borrows; multiple
 * sections may share a source id (the first rewrites that paragraph, the rest
 * are clones placed right after it — this is how "add below" works). A known
 * paragraph with no section is deleted. A paragraph whose single section is
 * unchanged is left byte-for-byte (so its formatting, images, and hyperlinks
 * are untouched); only edited/added/cloned paragraphs are rebuilt. Structural
 * paragraphs (no editable text) are always left as-is. Works for docx + pptx.
 */
export async function applyOfficeSections(
  kind: OfficeKind,
  buffer: Buffer,
  sections: Array<{ sourceId: string; spans: RunSpan[] }>
): Promise<Buffer> {
  const originals = await parseOfficeParagraphs(kind, buffer);
  const originalRuns = new Map(originals.map((p) => [p.id, p.runs]));

  const groups = new Map<string, RunSpan[][]>();
  for (const s of sections) {
    const list = groups.get(s.sourceId);
    if (list) list.push(s.spans);
    else groups.set(s.sourceId, [s.spans]);
  }

  const rebuild = kind === "docx" ? rebuildDocxParagraph : rebuildPptxParagraph;
  const render = (para: string, id: string): string => {
    const base = originalRuns.get(id);
    if (!base) return para; // structural / non-text paragraph — leave as-is
    const spanLists = groups.get(id);
    if (!spanLists || spanLists.length === 0) return ""; // deleted by the user
    if (spanLists.length === 1 && spansEqual(spanLists[0], base)) return para; // unchanged
    return spanLists.map((spans) => rebuild(para, spans)).join("");
  };

  const zip = await JSZip.loadAsync(buffer);
  if (kind === "docx") {
    const file = zip.file("word/document.xml");
    if (!file) return buffer;
    let xml = await file.async("string");
    let i = -1;
    xml = xml.replace(DOCX_PARA, (para) => {
      i += 1;
      return render(para, `p${i}`);
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
        const out = render(para, `s${s}_p${p}`);
        if (out !== para) touched = true;
        return out;
      });
      if (touched) zip.file(file.name, xml);
    }
  }

  return Buffer.from(await zip.generateAsync({ type: "nodebuffer" }));
}

// ── Image alt text (accessibility) ────────────────────────────────────────────

/** One image in an Office file and its current alt text. */
export interface OfficeImage {
  /** Stable handle: docx "d{docPrId}", pptx "s{slideIdx}_{cNvPrId}". */
  id: string;
  /** The image's name (e.g. "Picture 1"). */
  name: string;
  /** Current alt text (the descr attribute), "" when missing. */
  alt: string;
}

const attr = (attrs: string, name: string): string => {
  const m = attrs.match(new RegExp(`\\b${name}="([^"]*)"`));
  return m ? decodeXmlEntities(m[1]) : "";
};

// Set (or replace) the descr attribute on an element's opening-tag attribute string.
// Escapes for an attribute value (incl. the double-quote that delimits it).
const withDescr = (attrs: string, alt: string): string => {
  const cleaned = attrs.replace(/\s+descr="[^"]*"/, "");
  return `${cleaned} descr="${escapeXml(alt).replace(/"/g, "&quot;")}"`;
};

/** List the images (with alt text) in a docx/pptx file. */
export async function extractOfficeImages(kind: OfficeKind, buffer: Buffer): Promise<OfficeImage[]> {
  const zip = await JSZip.loadAsync(buffer);
  const images: OfficeImage[] = [];

  if (kind === "docx") {
    const file = zip.file("word/document.xml");
    if (!file) return [];
    const xml = await file.async("string");
    for (const m of xml.matchAll(/<wp:docPr\b([^>]*?)\/?>/g)) {
      const id = attr(m[1], "id");
      if (!id) continue;
      images.push({ id: `d${id}`, name: attr(m[1], "name") || `Image ${id}`, alt: attr(m[1], "descr") });
    }
    return images;
  }

  const slides = sortedSlides(zip);
  for (let s = 0; s < slides.length; s += 1) {
    const xml = await slides[s].async("string");
    // Only <p:cNvPr> inside a <p:pic> (a picture) — not every shape.
    for (const pic of xml.matchAll(/<p:pic\b[\s\S]*?<\/p:pic>/g)) {
      const cn = pic[0].match(/<p:cNvPr\b([^>]*?)\/?>/);
      if (!cn) continue;
      const id = attr(cn[1], "id");
      if (!id) continue;
      images.push({ id: `s${s}_${id}`, name: attr(cn[1], "name") || `Image ${id}`, alt: attr(cn[1], "descr") });
    }
  }
  return images;
}

/** Set alt text (descr) on images by their {@link OfficeImage.id}; return new bytes. */
export async function setOfficeImageAlt(
  kind: OfficeKind,
  buffer: Buffer,
  edits: Record<string, string>
): Promise<Buffer> {
  const zip = await JSZip.loadAsync(buffer);

  if (kind === "docx") {
    const file = zip.file("word/document.xml");
    if (!file) return buffer;
    let xml = await file.async("string");
    xml = xml.replace(/<wp:docPr\b([^>]*?)(\/?)>/g, (whole, attrs: string, slash: string) => {
      const id = attr(attrs, "id");
      const alt = id ? edits[`d${id}`] : undefined;
      return alt === undefined ? whole : `<wp:docPr${withDescr(attrs, alt)}${slash}>`;
    });
    zip.file("word/document.xml", xml);
  } else {
    const slides = sortedSlides(zip);
    for (let s = 0; s < slides.length; s += 1) {
      const file = slides[s];
      let xml = await file.async("string");
      let touched = false;
      xml = xml.replace(/<p:pic\b[\s\S]*?<\/p:pic>/g, (pic) =>
        pic.replace(/<p:cNvPr\b([^>]*?)(\/?)>/, (whole, attrs: string, slash: string) => {
          const id = attr(attrs, "id");
          const alt = id ? edits[`s${s}_${id}`] : undefined;
          if (alt === undefined) return whole;
          touched = true;
          return `<p:cNvPr${withDescr(attrs, alt)}${slash}>`;
        })
      );
      if (touched) zip.file(file.name, xml);
    }
  }

  return Buffer.from(await zip.generateAsync({ type: "nodebuffer" }));
}
