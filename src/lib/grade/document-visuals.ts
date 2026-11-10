import JSZip from "jszip";
import { SaxesParser } from "saxes";
import { activeDocxHeaderFooterPaths } from "./document-active-sections";
import { assertContainerWithinCaps, createZipBudget, declaredSizesOf, readOfficeMember } from "../zip-caps";
import { DOCUMENT_PICTURE_LIMIT, DOCUMENT_PICTURE_BYTE_LIMIT, DOCUMENT_VISUAL_BYTE_LIMIT, type DocumentVisuals } from "./document-visual-schema";

const MIME: Record<string, string> = { png: "image/png", jpg: "image/jpeg", jpeg: "image/jpeg", webp: "image/webp", heic: "image/heic", heif: "image/heif" };
const WORD_NAMESPACES = new Set(["http://schemas.openxmlformats.org/wordprocessingml/2006/main", "http://purl.oclc.org/ooxml/wordprocessingml/main"]);
const PRESENTATION_NAMESPACES = new Set(["http://schemas.openxmlformats.org/presentationml/2006/main", "http://purl.oclc.org/ooxml/presentationml/main"]);
const DRAWING_NAMESPACES = new Set(["http://schemas.openxmlformats.org/drawingml/2006/main", "http://purl.oclc.org/ooxml/drawingml/main"]);
const REL_NAMESPACES = new Set(["http://schemas.openxmlformats.org/officeDocument/2006/relationships", "http://purl.oclc.org/ooxml/officeDocument/relationships"]);
const PACKAGE_REL = "http://schemas.openxmlformats.org/package/2006/relationships";

function imageTargets(xml: string | null): ReadonlyMap<string, string> {
  const targets = new Map<string, string>();
  if (xml === null) return targets;
  const ids = new Set<string>();
  const parser = new SaxesParser({ xmlns: true });
  let depth = 0, rootSeen = false;
  parser.on("doctype", () => { throw new Error("DTD not supported"); });
  parser.on("opentag", (tag) => {
    depth++;
    if (depth === 1) { if (tag.uri !== PACKAGE_REL || tag.local !== "Relationships") throw new Error("Invalid relationships root"); rootSeen = true; return; }
    if (depth !== 2 || tag.uri !== PACKAGE_REL || tag.local !== "Relationship") throw new Error("Invalid relationship element");
    const values = Object.values(tag.attributes);
    const get = (name: string) => values.find((attribute) => !attribute.uri && attribute.local === name)?.value;
    const id = get("Id");
    if (!id || ids.has(id)) throw new Error("Ambiguous relationship");
    ids.add(id);
    const type = get("Type"), target = get("Target"), mode = get("TargetMode");
    if (target && (!mode || mode.toLowerCase() === "internal") && [...REL_NAMESPACES].some((prefix) => type === `${prefix}/image`)) targets.set(id, target);
  });
  parser.on("closetag", () => { depth--; });
  parser.write(xml).close();
  if (!rootSeen) throw new Error("Missing relationships root");
  return targets;
}

/** Namespace-aware parsing ignores comments and honors locally scoped/default prefixes. */
function imageRelationships(xml: string, extension: string): (string | null | undefined)[] {
  const expected = extension === "docx" ? WORD_NAMESPACES : PRESENTATION_NAMESPACES;
  const target = extension === "docx" ? "drawing" : "pic";
  const found: (string | null | undefined)[] = [];
  const active: { depth: number; embedded?: string; blips: number; wordShape?: boolean }[] = [];
  const parser = new SaxesParser({ xmlns: true });
  let depth = 0;
  parser.on("doctype", () => { throw new Error("DTD not supported"); });
  parser.on("opentag", (tag) => {
    depth++;
    if (expected.has(tag.uri) && tag.local === target) active.push({ depth, blips: 0 });
    else if (active.length && DRAWING_NAMESPACES.has(tag.uri) && tag.local === "graphicData" && Object.values(tag.attributes).some((attribute) => !attribute.uri && attribute.local === "uri" && attribute.value === "http://schemas.microsoft.com/office/word/2010/wordprocessingShape")) active[active.length - 1].wordShape = true;
    else if (active.length && DRAWING_NAMESPACES.has(tag.uri) && tag.local === "blip") {
      const drawing = active[active.length - 1];
      if (++drawing.blips > 1) throw new Error("Ambiguous image");
      const ids = Object.values(tag.attributes).filter((attribute) => REL_NAMESPACES.has(attribute.uri) && attribute.local === "embed");
      if (ids.length > 1) throw new Error("Ambiguous image relationship");
      drawing.embedded = ids[0]?.value;
    }
  });
  parser.on("closetag", () => { if (active.at(-1)?.depth === depth) { const drawing = active.pop()!; found.push(drawing.wordShape ? null : drawing.embedded); } depth--; });
  parser.write(xml).close();
  return found;
}
/** Count VML image-bearing Word pict containers by namespace, not prefix. */
function countLegacyPictures(xml: string): number {
  if (!/<(?:[\w.-]+:)?pict\b/.test(xml)) return 0;
  const parser = new SaxesParser({ xmlns: true });
  const active: boolean[] = [];
  let count = 0;
  parser.on("doctype", () => { throw new Error("DTD not supported"); });
  parser.on("opentag", (tag) => {
    if (["http://schemas.openxmlformats.org/wordprocessingml/2006/main", "http://purl.oclc.org/ooxml/wordprocessingml/main"].includes(tag.uri) && tag.local === "pict") active.push(false);
    else if (active.length && tag.uri === "urn:schemas-microsoft-com:vml" && (tag.local === "imagedata" || (tag.local === "fill" && Object.values(tag.attributes).some((attr) => (attr.local === "type" && attr.value.toLowerCase() === "frame") || (["http://schemas.openxmlformats.org/officeDocument/2006/relationships", "http://purl.oclc.org/ooxml/officeDocument/relationships"].includes(attr.uri) && attr.local === "id") || ["src", "href", "relid"].includes(attr.local.toLowerCase()))))) active[active.length - 1] = true;
  });
  parser.on("closetag", (tag) => {
    if (["http://schemas.openxmlformats.org/wordprocessingml/2006/main", "http://purl.oclc.org/ooxml/wordprocessingml/main"].includes(tag.uri) && tag.local === "pict" && active.pop()) count++;
  });
  parser.write(xml).close();
  return count;
}
export async function prepareDocumentVisuals(extension: string, bytes?: Buffer, limits: { parts: number; bytes: number } = { parts: DOCUMENT_PICTURE_LIMIT, bytes: DOCUMENT_VISUAL_BYTE_LIMIT }): Promise<DocumentVisuals> {
  if (extension !== "docx" && extension !== "pptx") return { status: "unavailable", reason: "unsupported-format", found: 0, omitted: 0, parts: [] };
  const out: DocumentVisuals = { status: "complete", reason: "none", found: 0, omitted: 0, parts: [] };
  try {
    if (!bytes) throw new Error("No container");
    const zip = await JSZip.loadAsync(bytes);
    assertContainerWithinCaps(zip, extension);
    const budget = createZipBudget();
    const read = async (name: string) => {
      const member = zip.file(name);
      return member ? (await readOfficeMember(member, member.name, budget)).toString("utf8") : null;
    };
    const names = extension === "docx" ? ["word/document.xml"] : Object.keys(zip.files).filter(n => /^ppt\/slides\/slide\d+\.xml$/.test(n)).sort();
    if (!names.length) throw new Error("No document");
    for (let index = 0; index < names.length; index++) {
      const name = names[index];
      const xml = await read(name);
      const valid = extension === "docx" ? name === "word/document.xml" ? /<w:document\b[\s\S]*<\/w:document>/.test(xml ?? "") : /<(?:[\w.-]+:)?(?:hdr|ftr)\b[\s\S]*<\/(?:[\w.-]+:)?(?:hdr|ftr)>/.test(xml ?? "") : /<p:sld\b[\s\S]*<\/p:sld>/.test(xml ?? "");
      if (xml === null || !valid) throw new Error("Invalid document XML");
      const base = name.slice(0, name.lastIndexOf("/"));
      const rels = await read(`${base}/_rels/${name.slice(name.lastIndexOf("/") + 1)}.rels`);
      const drawings = imageRelationships(xml, extension);
      const targets = imageTargets(rels);
      if (extension === "docx" && name === "word/document.xml") names.push(...activeDocxHeaderFooterPaths(xml, rels));
      const legacyPictures = extension === "docx" ? countLegacyPictures(xml) : 0;
      if (legacyPictures) { out.found += legacyPictures; out.omitted += legacyPictures; out.status = "incomplete"; if (out.reason !== "unsupported-shape") out.reason = "unsupported-image"; }
      for (const embed of drawings) {
        out.found++;
        const omit = (reason: DocumentVisuals["reason"]) => { out.omitted++; out.status = "incomplete"; if (reason === "unsupported-shape" || out.reason !== "unsupported-shape") out.reason = reason; };
        if (embed === null) { omit("unsupported-shape"); continue; }
        if (out.parts.length >= limits.parts) { omit("budget"); continue; }
        const target = embed && targets.get(embed);
        if (!target) { omit("missing-data"); continue; }
        const segments: string[] = [];
        for (const segment of (target.startsWith("/") ? target : `${base}/${target}`).split("/")) {
          if (segment === "..") segments.pop(); else if (segment && segment !== ".") segments.push(segment);
        }
        const path = segments.join("/");
        const mimeType = MIME[path.split(".").pop()?.toLowerCase() ?? ""];
        if (!mimeType) { omit("unsupported-image"); continue; }
        const member = zip.file(path);
        if (!member) { omit("missing-data"); continue; }
        const declared = declaredSizesOf(member, path).declared;
        const projected = new TextEncoder().encode(JSON.stringify(out)).byteLength + 4 * Math.ceil(declared / 3) + 160;
        if (declared > DOCUMENT_PICTURE_BYTE_LIMIT || projected > limits.bytes) { omit("budget"); continue; }
        const data = await readOfficeMember(member, member.name, budget);
        if (!data.length) { omit("missing-data"); continue; }
        out.parts.push({ name: `Picture ${out.found}`, mimeType, base64: data.toString("base64") });
      }
    }
    return out;
  } catch {
    return { status: "failed", reason: "inspection-failed", found: 0, omitted: 0, parts: [] };
  }
}
