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

/** One editable paragraph. `slide` is set (1-based) for pptx. */
export interface OfficeParagraph {
  id: string;
  slide?: number;
  text: string;
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
      if (text.trim()) out.push({ id: `p${i}`, text });
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
      if (text.trim()) out.push({ id: `s${s}_p${p}`, slide: s + 1, text });
      p += 1;
    }
  }
  return out;
}

/** Apply edited paragraph text back into the original file; return the new bytes. */
export async function applyOfficeEdits(
  kind: OfficeKind,
  buffer: Buffer,
  edits: Record<string, string>
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
      return id in edits ? rewriteRuns(para, edits[id], "w:t") : para;
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
        return rewriteRuns(para, edits[id], "a:t");
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
  sections: Array<{ sourceId: string; text: string }>
): Promise<Buffer> {
  const groups = new Map<string, string[]>();
  for (const s of sections) {
    const list = groups.get(s.sourceId);
    if (list) list.push(s.text);
    else groups.set(s.sourceId, [s.text]);
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
    const texts = groups.get(id);
    if (!texts || texts.length === 0) return ""; // deleted by the user
    let out = rewriteRuns(para, texts[0], "w:t");
    for (let k = 1; k < texts.length; k += 1) out += rewriteRuns(para, texts[k], "w:t");
    return out;
  });
  zip.file("word/document.xml", xml);
  return Buffer.from(await zip.generateAsync({ type: "nodebuffer" }));
}
