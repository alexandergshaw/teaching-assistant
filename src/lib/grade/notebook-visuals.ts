import { parseFragment } from "parse5";
import sharp from "sharp";
import { DOCUMENT_PICTURE_BYTE_LIMIT, DOCUMENT_PICTURE_LIMIT, DOCUMENT_VISUAL_BYTE_LIMIT, type DocumentVisuals } from "./document-visual-schema";

/** Accept only inert table/text markup and alignment-only CSS. */
function safeNotebookHtml(value: unknown): boolean {
  const html = Array.isArray(value) && value.every(x => typeof x === "string") ? value.join("") : value;
  if (typeof html !== "string" || Buffer.byteLength(html) > 200_000) return false;
  const declarations = (css: string): boolean => css.split(";").filter(x => x.trim()).every(x => /^\s*(?:vertical-align\s*:\s*(?:middle|top)|text-align\s*:\s*(?:left|right))\s*$/i.test(x));
  const stylesheet = (css: string): boolean => {
    let rest = css.trim();
    while (rest) {
      const match = /^([.#a-zA-Z0-9_\-\s>:,]+)\{([^{}]*)\}/.exec(rest);
      if (!match || !declarations(match[2])) return false;
      rest = rest.slice(match[0].length).trim();
    }
    return true;
  };
  let invalid = false, count = 0;
  const fragment = parseFragment(html, { onParseError: () => { invalid = true; } });
  const tags = new Set(["div", "table", "thead", "tbody", "tfoot", "tr", "th", "td", "p", "span", "b", "strong", "i", "em", "br", "pre", "code", "style"]);
  const walk = (node: { nodeName: string; tagName?: string; value?: string; attrs?: { name: string; value: string }[]; childNodes?: unknown[] }): void => {
    if (++count > 20_000) { invalid = true; return; }
    if (node.tagName && !tags.has(node.tagName)) invalid = true;
    for (const attr of node.attrs ?? []) {
      const ok = ((attr.name === "class" || attr.name === "id") && /^[\w -]{0,200}$/.test(attr.value)) ||
        (attr.name === "border" && /^\d{1,2}$/.test(attr.value)) ||
        ((attr.name === "colspan" || attr.name === "rowspan") && /^[1-9]\d?$/.test(attr.value)) ||
        (attr.name === "halign" && /^(?:left|right)$/i.test(attr.value)) ||
        (attr.name === "style" && declarations(attr.value)) ||
        (node.tagName === "style" && ((attr.name === "type" && attr.value === "text/css") || (attr.name === "scoped" && !attr.value)));
      if (!ok) invalid = true;
    }
    if (node.tagName === "style" && !stylesheet((node.childNodes ?? []).map(child => (child as { value?: string }).value ?? "").join(""))) invalid = true;
    for (const child of node.childNodes ?? []) walk(child as typeof node);
  };
  walk(fragment);
  return !invalid;
}
/** Extract only bounded, complete raster outputs. Unsupported rich output fails closed. */
export async function prepareNotebookVisuals(text: string, truncated: boolean): Promise<DocumentVisuals> {
  const failed = (): DocumentVisuals => ({ status: "failed", reason: "inspection-failed", found: 0, omitted: 0, parts: [] });
  const result: DocumentVisuals = { status: "complete", reason: "none", found: 0, omitted: 0, parts: [] };
  if (truncated || Buffer.byteLength(text, "utf8") > 2_000_000) return failed();
  let decodedBytes = 0;
  try {
    const notebook = JSON.parse(text);
    if (!notebook || !Array.isArray(notebook.cells)) return failed();
    for (const [cellIndex, cell] of notebook.cells.entries()) {
      if (!cell || typeof cell !== "object" || !["code", "markdown", "raw"].includes(cell.cell_type) || (cell.cell_type === "code" && !Array.isArray(cell.outputs)) || (cell.outputs !== undefined && !Array.isArray(cell.outputs))) return failed();
      if (cell.cell_type !== "code" && cell.outputs !== undefined) return failed();
      if (typeof cell.source !== "string" && !(Array.isArray(cell.source) && cell.source.every((part: unknown) => typeof part === "string"))) return failed();
      if (cell.attachments !== undefined && (typeof cell.attachments !== "object" || !cell.attachments || Object.keys(cell.attachments).length)) return failed();
      if (cell.cell_type !== "code" && /!\[|<\s*\/?[a-z]/i.test(Array.isArray(cell.source) ? cell.source.join("") : String(cell.source ?? ""))) return failed();
      for (const [outputIndex, output] of (cell.outputs ?? []).entries()) {
        if (!output || typeof output !== "object") return failed();
        const data = output.data;
        if (data === undefined) {
          if (output.output_type === "stream" && (typeof output.text === "string" || (Array.isArray(output.text) && output.text.every((x: unknown) => typeof x === "string")))) continue;
          if (output.output_type === "error" && typeof output.ename === "string" && typeof output.evalue === "string" && Array.isArray(output.traceback) && output.traceback.every((x: unknown) => typeof x === "string")) continue;
          return failed();
        }
        if (output.output_type !== "display_data" && output.output_type !== "execute_result") return failed();
        if (!data || typeof data !== "object" || Array.isArray(data)) return failed();
        if ("text/html" in data && !safeNotebookHtml(data["text/html"])) return failed();
        if ("text/markdown" in data) {
          const md = Array.isArray(data["text/markdown"]) ? data["text/markdown"].join("") : data["text/markdown"];
          if (typeof md !== "string" || /!\[|<\s*\/?[a-z]/i.test(md)) return failed();
        }
        const rich = Object.keys(data).filter(key => !["text/plain", "text/html", "text/markdown"].includes(key));
        if (!rich.length) continue;
        if (rich.length !== 1 || !["image/png", "image/jpeg"].includes(rich[0])) return failed();
        const raw = data[rich[0]];
        const base64 = Array.isArray(raw) && raw.every(x => typeof x === "string") ? raw.join("") : raw;
        if (typeof base64 !== "string" || base64.length === 0 || base64.length % 4 !== 0 || !/^[A-Za-z0-9+/]*={0,2}$/.test(base64) || base64.length > 4 * Math.ceil(DOCUMENT_PICTURE_BYTE_LIMIT / 3)) return failed();
        const bytes = Buffer.from(base64, "base64");
        if (bytes.toString("base64") !== base64 || bytes.length > DOCUMENT_PICTURE_BYTE_LIMIT) return failed();
        const valid = rich[0] === "image/png" ? bytes.subarray(0, 8).equals(Buffer.from([137,80,78,71,13,10,26,10])) : bytes.length >= 4 && bytes[0] === 255 && bytes[1] === 216 && bytes[bytes.length-2] === 255 && bytes[bytes.length-1] === 217;
        if (!valid) return failed();
        if (result.parts.length >= DOCUMENT_PICTURE_LIMIT) return failed();
        const decoder = sharp(bytes, { limitInputPixels: 16_000_000, failOn: "warning" });
        const info = await decoder.metadata();
        if (!info.width || !info.height || info.width > 4096 || info.height > 4096 || info.width * info.height > 16_000_000 || decodedBytes + info.width * info.height * 4 > 32_000_000) return failed();
        const decoded = await decoder.toColourspace("srgb").ensureAlpha().raw().toBuffer();
        decodedBytes += decoded.length;
        if (decodedBytes > 32_000_000) return failed();
        result.parts.push({ name: `cell ${cellIndex + 1} output ${outputIndex + 1}`, mimeType: rich[0], base64 });
        result.found++;
        if (result.parts.length > DOCUMENT_PICTURE_LIMIT || Buffer.byteLength(JSON.stringify(result)) > DOCUMENT_VISUAL_BYTE_LIMIT) return failed();
      }
    }
    return result;
  } catch { return failed(); }
}

/** Remove binary payloads from text sent to the model; image bytes travel separately. */
export function projectNotebookText(text: string): string {
  const notebook = JSON.parse(text);
  for (const cell of notebook.cells) for (const output of cell.outputs ?? []) {
    if (output.data && typeof output.data === "object") for (const key of ["image/png", "image/jpeg"]) {
      if (key in output.data) output.data[key] = "[Image output attached separately]";
    }
  }
  return JSON.stringify(notebook);
}
