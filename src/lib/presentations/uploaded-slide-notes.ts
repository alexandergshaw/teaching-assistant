import { createHash } from "node:crypto";
import path from "node:path";
import { DOMParser, XMLSerializer, type Document as XmlDocument, type Element as XmlElement } from "@xmldom/xmldom";
import JSZip from "jszip";
import { inventorySlides } from "@/lib/powerpoint-template-library/inventory";
import { assertContainerWithinCaps, createZipBudget, readOfficeMember, ZipCapError } from "@/lib/zip-caps";

const P = "http://schemas.openxmlformats.org/presentationml/2006/main";
const A = "http://schemas.openxmlformats.org/drawingml/2006/main";
const R = "http://schemas.openxmlformats.org/officeDocument/2006/relationships";
const REL = "http://schemas.openxmlformats.org/package/2006/relationships";
const NOTES = `${R}/notesSlide`;
const SLIDE = `${R}/slide`;
export interface UploadedSlideNotes { member: string; id: string; text: string; editable: boolean; reason?: string }
export class UploadedSlideNotesError extends Error {
  constructor(readonly code: "invalid_package" | "invalid_slide" | "unsupported_notes" | "invalid_notes_edit" | "shared_notes") { super(code); this.name = "UploadedSlideNotesError"; }
}
function parse(xml: string): XmlDocument {
  if (/<!DOCTYPE|<!ENTITY/i.test(xml)) throw new UploadedSlideNotesError("invalid_package");
  let failed = false;
  const doc = new DOMParser({ onError: () => { failed = true; } }).parseFromString(xml, "application/xml");
  if (failed || !doc.documentElement || doc.getElementsByTagName("parsererror").length) throw new UploadedSlideNotesError("invalid_package");
  return doc;
}
function all(root: XmlDocument | XmlElement, namespace: string, local: string): XmlElement[] { return Array.from(root.getElementsByTagNameNS(namespace, local)); }
function direct(root: XmlElement, namespace: string, local: string): XmlElement[] { return Array.from(root.childNodes).filter((node): node is XmlElement => node.nodeType === 1 && (node as XmlElement).namespaceURI === namespace && (node as XmlElement).localName === local); }
function notesRelMember(slideMember: string): string { return slideMember.replace(/([^/]+)$/, "_rels/$1.rels"); }
function resolve(source: string, target: string, prefix: string): string {
  if (!target || target.includes("\\") || target.includes("%") || target.includes("?") || target.includes("#")) throw new UploadedSlideNotesError("invalid_package");
  const member = target.startsWith("/") ? path.posix.normalize(target.slice(1)) : path.posix.normalize(path.posix.join(path.posix.dirname(source), target));
  if (!member.startsWith(prefix) || member.startsWith("../") || path.posix.isAbsolute(member)) throw new UploadedSlideNotesError("invalid_package");
  return member;
}
async function readXml(zip: JSZip, member: string, budget: ReturnType<typeof createZipBudget>): Promise<XmlDocument> {
  const entry = zip.file(member); if (!entry || entry.dir) throw new UploadedSlideNotesError("invalid_package");
  return parse((await readOfficeMember(entry, member, budget)).toString("utf8"));
}
function bodyShape(doc: XmlDocument): { shape: XmlElement; body: XmlElement; paragraphs: XmlElement[]; id: string } {
  const shapes = all(doc, P, "sp").filter((shape) => all(shape, P, "ph").some((ph) => ph.getAttribute("type") === "body"));
  if (shapes.length !== 1) throw new UploadedSlideNotesError("unsupported_notes");
  const shape = shapes[0]!;
  const body = all(shape, P, "txBody")[0];
  const nonvisual = all(shape, P, "cNvPr")[0];
  const paragraphs = body ? direct(body, A, "p") : [];
  if (!body || !nonvisual || !/^\d+$/.test(nonvisual.getAttribute("id") ?? "") || paragraphs.length < 1 || paragraphs.length > 50) throw new UploadedSlideNotesError("unsupported_notes");
  if (paragraphs.some((p) => all(p, A, "fld").length || all(p, A, "br").length || all(p, A, "tab").length || all(p, A, "t").length > 1 || all(p, A, "r").length > 1)) throw new UploadedSlideNotesError("unsupported_notes");
  if (!paragraphs.some((p) => direct(p, A, "r").length === 1)) throw new UploadedSlideNotesError("unsupported_notes");
  return { shape, body, paragraphs, id: nonvisual.getAttribute("id")! };
}
function paragraphText(paragraph: XmlElement): string { return all(paragraph, A, "t").map((node) => node.textContent ?? "").join(""); }

async function resolveNotes(bytes: Buffer, slideNumber: number, knownSlides?: Array<{ id: string }>, referenceCounts?: Map<string, number>) {
  const slides = knownSlides ?? await inventorySlides(bytes);
  const slide = slides[slideNumber - 1];
  if (!slide) throw new UploadedSlideNotesError("invalid_slide");
  const zip = await JSZip.loadAsync(bytes); assertContainerWithinCaps(zip, "office-file"); const budget = createZipBudget();
  const slideRelMember = notesRelMember(slide.id);
  if (!zip.file(slideRelMember)) return { zip, budget, slide, notesMember: null as string | null, notesDoc: null as XmlDocument | null, body: null as ReturnType<typeof bodyShape> | null, shared: false };
  const relsDoc = await readXml(zip, slideRelMember, budget);
  const notesRels = all(relsDoc, REL, "Relationship");
  const links = notesRels.filter((relation) => relation.getAttribute("Type") === NOTES);
  if (links.length === 0) return { zip, budget, slide, notesMember: null as string | null, notesDoc: null as XmlDocument | null, body: null as ReturnType<typeof bodyShape> | null, shared: false };
  if (links.length !== 1 || (links[0]!.getAttribute("TargetMode") ?? "").toLowerCase() === "external") throw new UploadedSlideNotesError("invalid_package");
  const notesMember = resolve(slide.id, links[0]!.getAttribute("Target") ?? "", "ppt/notesSlides/");
  const notesDoc = await readXml(zip, notesMember, budget);
  const notesRoot = notesDoc.documentElement;
  if (!notesRoot || notesRoot.namespaceURI !== P || notesRoot.localName !== "notes") throw new UploadedSlideNotesError("unsupported_notes");
  const body = bodyShape(notesDoc);
  const backRelsDoc = await readXml(zip, notesRelMember(notesMember), budget);
  const backLinks = all(backRelsDoc, REL, "Relationship").filter((relation) => relation.getAttribute("Type") === SLIDE);
  if (backLinks.length !== 1 || (backLinks[0]!.getAttribute("TargetMode") ?? "").toLowerCase() === "external" || resolve(notesMember, backLinks[0]!.getAttribute("Target") ?? "", "ppt/slides/") !== slide.id) throw new UploadedSlideNotesError("invalid_package");
  let references = referenceCounts?.get(notesMember);
  if (references === undefined) {
    references = 0;
    for (const candidate of slides) {
      const relationMember = notesRelMember(candidate.id);
      const relationEntry = zip.file(relationMember);
      if (!relationEntry) continue;
      const candidateRels = all(await readXml(zip, relationMember, budget), REL, "Relationship");
      for (const relation of candidateRels.filter((item) => item.getAttribute("Type") === NOTES)) {
        if ((relation.getAttribute("TargetMode") ?? "").toLowerCase() !== "external" && resolve(candidate.id, relation.getAttribute("Target") ?? "", "ppt/notesSlides/") === notesMember) references += 1;
      }
    }
  }
  return { zip, budget, slide, notesMember, notesDoc, body, shared: references !== 1 };
}

export async function inspectUploadedSlideNotes(bytes: Buffer, slideNumber: number, knownSlides?: Array<{ id: string }>, referenceCounts?: Map<string, number>): Promise<UploadedSlideNotes | null> {
  try {
    const result = await resolveNotes(bytes, slideNumber, knownSlides, referenceCounts);
    if (!result.notesMember || !result.body) return null;
    const id = `s${slideNumber}:notes:${createHash("sha256").update(result.notesMember).digest("hex").slice(0, 12)}:shape${result.body.id}`;
    const text = result.body.paragraphs.map(paragraphText).join("\n").slice(0, 4000);
    return { member: result.notesMember, id, text, editable: !result.shared, ...(result.shared ? { reason: "This notes part is shared by multiple slides and is read-only." } : {}) };
  } catch (error) {
    if (error instanceof UploadedSlideNotesError || error instanceof ZipCapError) return { member: "", id: "", text: "", editable: false, reason: "The notes relationship or notes structure is unsupported." };
    return { member: "", id: "", text: "", editable: false, reason: "The notes relationship or notes structure is unsupported." };
  }
}

export async function inspectUploadedSlideNotesSet(bytes: Buffer, slideMembers: Array<{ id: string }>): Promise<Array<UploadedSlideNotes | null>> {
  const zip = await JSZip.loadAsync(bytes); assertContainerWithinCaps(zip, "office-file"); const budget = createZipBudget();
  const references = new Map<string, number>();
  for (const slide of slideMembers) {
    const member = notesRelMember(slide.id);
    if (!zip.file(member)) continue;
    try {
      const rels = all(await readXml(zip, member, budget), REL, "Relationship");
      for (const relation of rels.filter((item) => item.getAttribute("Type") === NOTES && (item.getAttribute("TargetMode") ?? "").toLowerCase() !== "external")) {
        const target = resolve(slide.id, relation.getAttribute("Target") ?? "", "ppt/notesSlides/");
        references.set(target, (references.get(target) ?? 0) + 1);
      }
    } catch { /* Individual inspection reports malformed relationship state as read-only. */ }
  }
  return Promise.all(slideMembers.map((_, index) => inspectUploadedSlideNotes(bytes, index + 1, slideMembers, references)));
}

export async function applyUploadedSlideNotes(bytes: Buffer, slideNumber: number, input: unknown): Promise<{ bytes: Buffer; changedMembers: string[] }> {
  try {
    const result = await resolveNotes(bytes, slideNumber);
    if (!result.notesMember || !result.notesDoc || !result.body || result.shared) throw new UploadedSlideNotesError(result.shared ? "shared_notes" : "unsupported_notes");
    if (!input || typeof input !== "object" || Array.isArray(input)) throw new UploadedSlideNotesError("invalid_notes_edit");
    const value = input as Record<string, unknown>;
    const expectedId = `s${slideNumber}:notes:${createHash("sha256").update(result.notesMember).digest("hex").slice(0, 12)}:shape${result.body.id}`;
    if (Object.keys(value).sort().join(",") !== "id,text" || value.id !== expectedId || typeof value.text !== "string" || value.text.length > 4000 || value.text.includes("\r")) throw new UploadedSlideNotesError("invalid_notes_edit");
    const lines = value.text.split("\n");
    if (lines.length > 50 || lines.some((line) => line.length > 1000)) throw new UploadedSlideNotesError("invalid_notes_edit");
    const template = result.body.paragraphs.find((paragraph) => direct(paragraph, A, "r").length === 1)!;
    const outputParagraphs = lines.map((line, index) => {
      const source = result.body!.paragraphs[index] ?? template;
      const paragraph = source.cloneNode(true) as XmlElement;
      for (const child of direct(paragraph, A, "r")) paragraph.removeChild(child);
      for (const child of direct(paragraph, A, "fld")) paragraph.removeChild(child);
      for (const child of direct(paragraph, A, "br")) paragraph.removeChild(child);
      for (const child of direct(paragraph, A, "tab")) paragraph.removeChild(child);
      const sourceRun = direct(source, A, "r")[0] ?? template;
      const run = sourceRun === template ? direct(template, A, "r")[0]!.cloneNode(true) as XmlElement : sourceRun.cloneNode(true) as XmlElement;
      for (const text of direct(run, A, "t")) run.removeChild(text);
      const text = result.notesDoc!.createElementNS(A, "a:t");
      if (/^\s|\s$/.test(line)) text.setAttributeNS("http://www.w3.org/XML/1998/namespace", "xml:space", "preserve");
      text.appendChild(result.notesDoc!.createTextNode(line));
      run.appendChild(text);
      const endProperties = direct(paragraph, A, "endParaRPr")[0];
      paragraph.insertBefore(run, endProperties ?? null);
      return paragraph;
    });
    for (const paragraph of result.body.paragraphs) result.body.body.removeChild(paragraph);
    const extensionList = direct(result.body.body, A, "extLst")[0];
    for (const paragraph of outputParagraphs) result.body.body.insertBefore(paragraph, extensionList ?? null);
    result.zip.file(result.notesMember, new XMLSerializer().serializeToString(result.notesDoc));
    const updated = Buffer.from(await result.zip.generateAsync({ type: "nodebuffer" }));
    return { bytes: updated, changedMembers: [result.notesMember] };
  } catch (error) {
    if (error instanceof UploadedSlideNotesError) throw error;
    if (error instanceof ZipCapError) throw new UploadedSlideNotesError("invalid_package");
    throw new UploadedSlideNotesError("invalid_package");
  }
}
