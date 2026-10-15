import { DOMParser } from "@xmldom/xmldom";
import JSZip from "jszip";
import path from "node:path";
import { assertPptxContainer } from "@/lib/decks/pptx-validate";
import { assertContainerWithinCaps, createZipBudget, readOfficeMember, ZipCapError } from "@/lib/zip-caps";
import { checkWireBudget } from "@/lib/upload-budget";
import { TemplateError, type SourceSlide } from "./types";

export function decodeSource(base64: unknown): Buffer {
  if (typeof base64 !== "string" || !base64) throw new TemplateError("PPT_INVALID");
  if (!checkWireBudget(base64.length, "Template").ok) throw new TemplateError("PPT_LIMIT");
  if (base64.length % 4 || !/^[A-Za-z0-9+/]+={0,2}$/.test(base64)) throw new TemplateError("PPT_INVALID");
  const bytes = Buffer.from(base64, "base64");
  if (bytes.toString("base64") !== base64) throw new TemplateError("PPT_INVALID");
  return bytes;
}
function decodeXml(value: string): string {
  return value.replace(/&(#x[0-9a-f]+|#\d+|amp|lt|gt|quot|apos);/gi, (_, entity: string) => {
    const named: Record<string, string> = { amp: "&", lt: "<", gt: ">", quot: '"', apos: "'" };
    if (named[entity]) return named[entity];
    const code = entity[1]?.toLowerCase() === "x" ? parseInt(entity.slice(2), 16) : parseInt(entity.slice(1), 10);
    if (!Number.isInteger(code) || code < 1 || code > 0x10ffff || (code >= 0xd800 && code <= 0xdfff)) throw new TemplateError("PPT_INVALID");
    return String.fromCodePoint(code);
  });
}
function attr(tag: string, name: string): string {
  const m = new RegExp('(?:^|\\s)' + name + '\\s*=\\s*(?:"([^"]*)"|\'([^\']*)\')').exec(tag);
  return decodeXml(m?.[1] ?? m?.[2] ?? "");
}
export async function inventorySlides(bytes: Buffer): Promise<SourceSlide[]> {
  try {
    await assertPptxContainer(bytes);
    const zip = await JSZip.loadAsync(bytes);
    assertContainerWithinCaps(zip, "template");
    const budget = createZipBudget();
    async function xml(member: string): Promise<string> {
      const entry = zip.file(member);
      if (!entry) throw new TemplateError("PPT_INVALID");
      const result = (await readOfficeMember(entry, member, budget)).toString("utf8");
      if (/<!DOCTYPE|<!ENTITY/i.test(result)) throw new TemplateError("PPT_INVALID");
      // Refuse parser warnings as well as errors; never repair malformed source XML.
      new DOMParser({ onError: () => { throw new TemplateError("PPT_INVALID"); } })
        .parseFromString(result, "application/xml");
      return result.replace(/<!--[\s\S]*?-->/g, "");
    }
    await xml("[Content_Types].xml");
    const presentation = await xml("ppt/presentation.xml");
    const rels = await xml("ppt/_rels/presentation.xml.rels");
    const relationships = new Map<string, string>();
    for (const match of rels.matchAll(/<Relationship\b[^>]*\/?\s*>/g)) {
      const tag = match[0], id = attr(tag, "Id");
      if (relationships.has(id)) throw new TemplateError("PPT_INVALID");
      if (attr(tag, "TargetMode") === "External") continue;
      if (!attr(tag, "Type").endsWith("/slide")) continue;
      const target = attr(tag, "Target");
      const member = target.startsWith("/") ? target.slice(1) : path.posix.normalize("ppt/" + target);
      if (!/^ppt\/slides\/[^/]+\.xml$/.test(member) || target.includes("\\") || target.includes("%")) throw new TemplateError("PPT_INVALID");
      relationships.set(id, member);
    }
    const list = presentation.match(/<(?:\w+:)?sldIdLst\b[^>]*>([\s\S]*?)<\/(?:\w+:)?sldIdLst>/)?.[1];
    if (list === undefined) throw new TemplateError("PPT_INVALID");
    const ids = [...list.matchAll(/<(?:\w+:)?sldId\b[^>]*\/?\s*>/g)].map(match => attr(match[0], "r:id"));
    if (!ids.length) throw new TemplateError("PPT_INVALID");
    if (ids.length > 80) throw new TemplateError("PPT_LIMIT");
    const slides: SourceSlide[] = [], seen = new Set<string>();
    let chars = 0;
    for (const id of ids) {
      const member = relationships.get(id);
      if (!member || seen.has(member)) throw new TemplateError("PPT_INVALID");
      seen.add(member);
      const slide = await xml(member);
      if (!/<(?:\w+:)?sld\b/.test(slide) || !/<\/(?:\w+:)?sld>/.test(slide)) throw new TemplateError("PPT_INVALID");
      const text = [...slide.matchAll(/<(?:\w+:)?p\b[^>]*>([\s\S]*?)<\/(?:\w+:)?p>/g)].map(p =>
        [...p[1].matchAll(/<(?:\w+:)?t\b[^>]*>([\s\S]*?)<\/(?:\w+:)?t>/g)].map(t => decodeXml(t[1])).join("")
      ).filter(Boolean).join("\n");
      chars += text.length;
      if (chars > 24000) throw new TemplateError("PPT_LIMIT");
      slides.push({ id: member, ordinal: slides.length + 1, text });
    }
    return slides;
  } catch (error) {
    if (error instanceof TemplateError) throw error;
    if (error instanceof ZipCapError) throw new TemplateError("PPT_LIMIT");
    throw new TemplateError("PPT_INVALID");
  }
}
