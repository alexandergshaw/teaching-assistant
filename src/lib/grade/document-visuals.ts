import JSZip from "jszip";
import { assertContainerWithinCaps, createZipBudget, declaredSizesOf, readOfficeMember } from "../zip-caps";
import { DOCUMENT_PICTURE_LIMIT, DOCUMENT_PICTURE_BYTE_LIMIT, DOCUMENT_VISUAL_BYTE_LIMIT, type DocumentVisuals } from "./document-visual-schema";

const MIME: Record<string, string> = { png: "image/png", jpg: "image/jpeg", jpeg: "image/jpeg", webp: "image/webp", heic: "image/heic", heif: "image/heif" };
const attr = (xml: string, name: string) => xml.match(new RegExp(`(?:^|\\s)${name}=["']([^"']*)["']`))?.[1];
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
    for (const name of names) {
      const xml = await read(name);
      if (xml === null || !(extension === "docx" ? /<w:document\b[\s\S]*<\/w:document>/.test(xml) : /<p:sld\b[\s\S]*<\/p:sld>/.test(xml))) throw new Error("Invalid document XML");
      const base = name.slice(0, name.lastIndexOf("/"));
      const rels = await read(`${base}/_rels/${name.slice(name.lastIndexOf("/") + 1)}.rels`);
      const drawings = xml.match(extension === "docx" ? /<w:drawing\b[\s\S]*?<\/w:drawing>/g : /<p:pic\b[\s\S]*?<\/p:pic>/g) ?? [];
      for (const drawing of drawings) {
        out.found++;
        const omit = (reason: DocumentVisuals["reason"]) => { out.omitted++; out.status = "incomplete"; out.reason = reason; };
        if (out.parts.length >= limits.parts) { omit("budget"); continue; }
        const embed = attr(drawing.match(/<a:blip\b[^>]*>/)?.[0] ?? "", "r:embed");
        const rel = rels?.match(/<Relationship\b[^>]*>/g)?.find(r => attr(r, "Id") === embed);
        const target = rel && attr(rel, "Target");
        if (!embed || !target || attr(rel ?? "", "TargetMode") === "External") { omit("missing-data"); continue; }
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
