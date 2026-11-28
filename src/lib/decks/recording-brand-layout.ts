import "server-only";
import { DOMParser, XMLSerializer, type Document, type Element } from "@xmldom/xmldom";
import type JSZip from "jszip";
import { posix } from "node:path";
import { readOfficeMember, type ZipBudget } from "@/lib/zip-caps";
import type { RecordingBrandSlide } from "./recording-brand-fit";

const P = "http://schemas.openxmlformats.org/presentationml/2006/main";
const A = "http://schemas.openxmlformats.org/drawingml/2006/main";
const R = "http://schemas.openxmlformats.org/officeDocument/2006/relationships";
const REL = "http://schemas.openxmlformats.org/package/2006/relationships";
const CT = "http://schemas.openxmlformats.org/package/2006/content-types";
const MIME = "application/vnd.openxmlformats-officedocument.presentationml";
const presentationPath = "ppt/presentation.xml";
const contentTypesPath = "[Content_Types].xml";
const officeError = "The uploaded file uses a PowerPoint structure this slide generator cannot edit.";
export class RecordingBrandLayoutRefusal extends Error {}

async function xml(zip: JSZip, member: string, budget: ZipBudget): Promise<Document> {
  const file = zip.file(member);
  if (!file) throw new Error(officeError);
  const text = (await readOfficeMember(file, member, budget)).toString("utf8");
  if (/<!DOCTYPE|<!ENTITY/i.test(text)) throw new Error(officeError);
  return new DOMParser({ onError: () => { throw new Error(officeError); } }).parseFromString(text, "application/xml");
}

const serialize = (document: Document) => new XMLSerializer().serializeToString(document);
const members = (node: Document | Element, ns: string, name: string) => Array.from(node.getElementsByTagNameNS(ns, name));
const relsPath = (member: string) => posix.join(posix.dirname(member), "_rels", `${posix.basename(member)}.rels`);

function internalTarget(relation: Element | undefined, member: string, type: string, path: RegExp): string | undefined {
  if (!relation || relation.getAttribute("Type") !== `${R}/${type}` || relation.getAttribute("TargetMode") === "External") return;
  const raw = relation.getAttribute("Target");
  if (!raw || /[\\%#?]/.test(raw)) return;
  const target = raw.startsWith("/") ? raw.slice(1) : posix.join(posix.dirname(member), raw);
  return path.test(target) ? target : undefined;
}

function relay(document: Document, id: string): Element | undefined {
  const related = members(document, REL, "Relationship").filter((relation) => relation.getAttribute("Id") === id);
  return related.length === 1 ? related[0] : undefined;
}

export function convertRecordingTemplateMime(types: Document) {
  if (types.documentElement?.namespaceURI !== CT || types.documentElement.localName !== "Types") throw new Error(officeError);
  const mainParts = members(types, CT, "Override").filter((node) => node.getAttribute("PartName") === "/ppt/presentation.xml");
  if (mainParts.length !== 1) throw new Error(officeError);
  const main = mainParts[0];
  const mime = main.getAttribute("ContentType");
  if (mime === `${MIME}.template.main+xml`) main.setAttribute("ContentType", `${MIME}.presentation.main+xml`);
  else if (mime !== `${MIME}.presentation.main+xml`) throw new Error(officeError);
}

type Placeholder = { type: "title" | "ctrTitle" | "body" | "obj"; idx: string };
type Layout = { path: string; title: Placeholder; body: Placeholder };
type LayoutSource = {
  layout: Layout;
  presentation: Document;
  relations: Document;
  types: Document;
  sample?: { slide: string; slideRelation: Element; notes?: string };
};

function layoutPlaceholders(source: Document, path: string): Layout | undefined {
  if (source.documentElement?.namespaceURI !== P || source.documentElement.localName !== "sldLayout") return;
  const candidates = members(source, P, "sp").flatMap((shape): Placeholder[] => {
    const markers = members(shape, P, "ph");
    if (markers.length !== 1 || !members(shape, P, "txBody").length) return [];
    const marker = markers[0];
    const type = marker.getAttribute("type") || "obj";
    if (type !== "title" && type !== "ctrTitle" && type !== "body" && type !== "obj") return [];
    const idx = marker.getAttribute("idx") ?? "";
    return !idx || /^\d{1,10}$/.test(idx) ? [{ type, idx }] : [];
  });
  const titles = candidates.filter(({ type }) => type === "title" || type === "ctrTitle");
  const bodies = candidates.filter(({ type }) => type === "body" || type === "obj");
  if (titles.length !== 1 || bodies.length !== 1 || (!bodies[0].idx && !titles[0].idx)) return;
  return { path, title: titles[0], body: bodies[0] };
}

export async function readRecordingTemplateTypes(zip: JSZip, budget: ZipBudget) {
  return xml(zip, contentTypesPath, budget);
}

export function writeRecordingTemplateTypes(zip: JSZip, types: Document) {
  convertRecordingTemplateMime(types);
  zip.file(contentTypesPath, serialize(types));
}

/** Fixed-template fill intentionally preserves non-slide parts. Refuse any
 * original private notes or review comments that would otherwise travel with it. */
export async function checkRecordingTemplateComments(zip: JSZip, budget: ZipBudget, fixed: boolean, replacedNotes?: string) {
  for (const member of Object.keys(zip.files)) {
    if (/^ppt\/(?:threadedComments|comments)\/[^/]+\.xml$/i.test(member)) {
      throw new RecordingBrandLayoutRefusal("Remove review comments from the institution template before using it for recording slides.");
    }
    if (!/^ppt\/notesSlides\/notesSlide\d+\.xml$/.test(member)) continue;
    if (!fixed && member !== replacedNotes) {
      throw new RecordingBrandLayoutRefusal("Remove detached speaker notes from the institution template before generating slides.");
    }
    if (zip.file(relsPath(member))) {
      const related = await xml(zip, relsPath(member), budget);
      if (members(related, REL, "Relationship").some((relation) =>
        !internalTarget(relation, member, "notesMaster", /^ppt\/notesMasters\/notesMaster\d+\.xml$/)
        && !internalTarget(relation, member, "slide", /^ppt\/slides\/slide\d+\.xml$/))) {
        throw new RecordingBrandLayoutRefusal("Remove attachments from the institution template’s speaker notes before generating slides.");
      }
    }
    if (!fixed) continue;
    const notes = await xml(zip, member, budget);
    if (members(notes, P, "sp").some((shape) =>
      members(shape, P, "ph").some((node) => node.getAttribute("type") === "body")
      && members(shape, A, "t").some((node) => Boolean(node.textContent?.trim())))) {
      throw new RecordingBrandLayoutRefusal("Clear speaker notes from the institution template before filling its sample slides.");
    }
  }
}

/** Follow the actual master relationships; do not choose a detached layout file. */
export async function findRecordingTemplateLayout(zip: JSZip, types: Document, budget: ZipBudget): Promise<LayoutSource | undefined> {
  const presentation = await xml(zip, presentationPath, budget);
  const relations = await xml(zip, relsPath(presentationPath), budget);
  const root = presentation.documentElement;
  if (root?.namespaceURI !== P || root.localName !== "presentation") throw new Error(officeError);
  const slides = members(presentation, P, "sldId");
  if (slides.length > 1) return;
  let sample: LayoutSource["sample"];
  let attachedLayout: string | undefined;
  let attachedMaster: string | undefined;
  if (slides.length === 1) {
    const slideRelation = relay(relations, slides[0].getAttributeNS(R, "id") ?? "");
    const slide = internalTarget(slideRelation, presentationPath, "slide", /^ppt\/slides\/slide\d+\.xml$/);
    if (!slide || !slideRelation || !zip.file(slide)) return;
    if (members(presentation, "*", "custShowLst").length || members(presentation, "*", "sectionLst").length) {
      throw new RecordingBrandLayoutRefusal("Remove slide sections and custom shows from the single-sample template before generating slides.");
    }
    const sampleSlide = await xml(zip, slide, budget);
    if (["pic", "graphicFrame", "grpSp", "cxnSp", "contentPart"].some((name) => members(sampleSlide, P, name).length)
      || members(sampleSlide, P, "sp").some((shape) => !members(shape, P, "ph").length)
      || members(sampleSlide, P, "bg").length) {
      throw new RecordingBrandLayoutRefusal("Move branding from the sample slide onto its slide layout or master before generating branded slides.");
    }
    const sampleRelations = await xml(zip, relsPath(slide), budget);
    let notes: string | undefined;
    for (const relation of members(sampleRelations, REL, "Relationship")) {
      const layoutPath = internalTarget(relation, slide, "slideLayout", /^ppt\/slideLayouts\/slideLayout\d+\.xml$/);
      if (layoutPath && !attachedLayout) { attachedLayout = layoutPath; continue; }
      const notesPath = internalTarget(relation, slide, "notesSlide", /^ppt\/notesSlides\/notesSlide\d+\.xml$/);
      if (!notesPath || notes) return;
      notes = notesPath;
    }
    if (!attachedLayout || !zip.file(attachedLayout)) return;
    const attached = await xml(zip, relsPath(attachedLayout), budget);
    const declared = members(attached, REL, "Relationship").flatMap((relation) => {
      const path = internalTarget(relation, attachedLayout!, "slideMaster", /^ppt\/slideMasters\/slideMaster\d+\.xml$/);
      return path ? [path] : [];
    });
    if (declared.length !== 1) return;
    attachedMaster = declared[0];
    sample = { slide, slideRelation, notes };
  }
  let firstCompatible: Layout | undefined;
  for (const masterId of members(presentation, P, "sldMasterId")) {
    const master = internalTarget(relay(relations, masterId.getAttributeNS(R, "id") ?? ""), presentationPath, "slideMaster",
      /^ppt\/slideMasters\/slideMaster\d+\.xml$/);
    if (!master || (attachedMaster && master !== attachedMaster)) continue;
    const masterSource = await xml(zip, master, budget);
    const masterRelations = await xml(zip, relsPath(master), budget);
    for (const layoutId of members(masterSource, P, "sldLayoutId")) {
      const layoutPath = internalTarget(relay(masterRelations, layoutId.getAttributeNS(R, "id") ?? ""), master, "slideLayout",
        /^ppt\/slideLayouts\/slideLayout\d+\.xml$/);
      if (!layoutPath || (attachedLayout && layoutPath !== attachedLayout) || !zip.file(layoutPath) || !zip.file(relsPath(layoutPath))) continue;
      const layout = layoutPlaceholders(await xml(zip, layoutPath, budget), layoutPath);
      if (!layout) continue;
      const reverse = await xml(zip, relsPath(layoutPath), budget);
      const masters = members(reverse, REL, "Relationship").flatMap((relation) => {
        const path = internalTarget(relation, layoutPath, "slideMaster", /^ppt\/slideMasters\/slideMaster\d+\.xml$/);
        return path ? [path] : [];
      });
      if (masters.length !== 1 || masters[0] !== master) continue;
      if (layoutPath === attachedLayout) return { layout, presentation, relations, types, sample };
      firstCompatible ??= layout;
    }
    if (firstCompatible && !attachedLayout) break;
  }
  if (firstCompatible && !attachedLayout) return { layout: firstCompatible, presentation, relations, types, sample };
}

/** The positional renderer can only be used when all non-empty paragraphs
 * are authored title/body placeholders, with one title followed by body text. */
export async function assertRecordingSampleSlots(zip: JSZip, budget: ZipBudget) {
  for (const member of Object.keys(zip.files)) {
    if (!/^ppt\/slides\/slide\d+\.xml$/.test(member)) continue;
    const source = await xml(zip, member, budget);
    const roles = members(source, A, "p").filter((paragraph) =>
      members(paragraph, A, "t").some((node) => Boolean(node.textContent?.trim())),
    ).map((paragraph) => {
      let parent = paragraph.parentNode;
      while (parent && !(parent.nodeType === 1 && (parent as Element).namespaceURI === P && (parent as Element).localName === "sp")) {
        parent = parent.parentNode;
      }
      if (!parent) return "unknown";
      const markers = members(parent as Element, P, "ph");
      if (markers.length !== 1) return "unknown";
      const kind = markers[0].getAttribute("type") || "obj";
      if (kind === "title" || kind === "ctrTitle") return "title";
      return kind === "body" || kind === "obj" ? "body" : "unknown";
    });
    if (roles[0] !== "title" || roles.slice(1).some((role) => role !== "body")) {
      throw new RecordingBrandLayoutRefusal("Use PowerPoint title and body placeholders for editable sample text. Move logos, footer text, and other fixed branding onto the slide layout or master.");
    }
  }
}

function editPlaceholder(id: number, placeholder: Placeholder, paragraphs: string[]): string {
  const escape = (text: string) => text.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;");
  const body = paragraphs.map((text) => `<a:p><a:r><a:t xml:space="preserve">${escape(text)}</a:t></a:r></a:p>`).join("");
  const index = placeholder.idx ? ` idx="${placeholder.idx}"` : "";
  return `<p:sp><p:nvSpPr><p:cNvPr id="${id}" name="${id === 2 ? "Title" : "Body"}"/><p:cNvSpPr/><p:nvPr><p:ph type="${placeholder.type}"${index}/></p:nvPr></p:nvSpPr><p:spPr/><p:txBody><a:bodyPr/><a:lstStyle/>${body || "<a:p/>"}</p:txBody></p:sp>`;
}

/** New editable shapes inherit positioning, theme and formatting from the saved layout. */
function slideXml(layout: Layout, slide: RecordingBrandSlide): string {
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><p:sld xmlns:p="${P}" xmlns:a="${A}" xmlns:r="${R}"><p:cSld><p:spTree><p:nvGrpSpPr><p:cNvPr id="1" name=""/><p:cNvGrpSpPr/><p:nvPr/></p:nvGrpSpPr><p:grpSpPr><a:xfrm><a:off x="0" y="0"/><a:ext cx="0" cy="0"/><a:chOff x="0" y="0"/><a:chExt cx="0" cy="0"/></a:xfrm></p:grpSpPr>${editPlaceholder(2, layout.title, [slide.title])}${editPlaceholder(3, layout.body, slide.bullets)}</p:spTree></p:cSld><p:clrMapOvr><a:masterClrMapping/></p:clrMapOvr></p:sld>`;
}

export async function fillRecordingTemplateLayout(zip: JSZip, source: LayoutSource, slides: RecordingBrandSlide[]): Promise<Buffer> {
  const { presentation, relations, types, layout, sample } = source;
  const root = presentation.documentElement!;
  let slideList = members(presentation, P, "sldIdLst")[0];
  if (!slideList) {
    slideList = presentation.createElementNS(P, "p:sldIdLst");
    const afterMasters = Array.from(root.childNodes).find((node) => node.nodeType === 1
      && !["sldMasterIdLst", "notesMasterIdLst", "handoutMasterIdLst"].includes((node as Element).localName ?? ""));
    root.insertBefore(slideList, afterMasters ?? null);
  }
  if (sample) {
    for (const slidesId of members(slideList, P, "sldId")) slideList.removeChild(slidesId);
    sample.slideRelation.parentNode?.removeChild(sample.slideRelation);
    for (const part of [sample.slide, sample.notes]) {
      if (!part) continue;
      zip.remove(part);
      zip.remove(relsPath(part));
      for (const override of members(types, CT, "Override")) {
        if (override.getAttribute("PartName") === `/${part}`) override.parentNode?.removeChild(override);
      }
    }
  }
  let counter = 0;
  const relationshipIds = new Set(members(relations, REL, "Relationship").map((relation) => relation.getAttribute("Id")));
  for (const [index, slide] of slides.entries()) {
    let member: string;
    let id: string;
    do {
      counter++;
      member = `ppt/slides/slide${counter}.xml`;
      id = `rIdRecordingSlide${counter}`;
    } while (zip.file(member) || zip.file(relsPath(member)) || relationshipIds.has(id));
    const slideId = presentation.createElementNS(P, "p:sldId");
    slideId.setAttribute("id", String(256 + index));
    slideId.setAttributeNS(R, "r:id", id);
    slideList.appendChild(slideId);
    const relationship = relations.createElementNS(REL, "Relationship");
    relationship.setAttribute("Id", id);
    relationship.setAttribute("Type", `${R}/slide`);
    relationship.setAttribute("Target", posix.relative("ppt", member));
    relations.documentElement!.appendChild(relationship);
    const override = types.createElementNS(CT, "Override");
    override.setAttribute("PartName", `/${member}`);
    override.setAttribute("ContentType", `${MIME}.slide+xml`);
    types.documentElement!.appendChild(override);
    zip.file(member, slideXml(layout, slide));
    zip.file(relsPath(member), `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="${REL}"><Relationship Id="rId1" Type="${R}/slideLayout" Target="${posix.relative("ppt/slides", layout.path)}"/></Relationships>`);
  }
  zip.file(presentationPath, serialize(presentation));
  zip.file(relsPath(presentationPath), serialize(relations));
  writeRecordingTemplateTypes(zip, types);
  return zip.generateAsync({ type: "nodebuffer", compression: "DEFLATE", compressionOptions: { level: 4 } });
}
