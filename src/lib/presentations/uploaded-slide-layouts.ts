import { createHash } from "node:crypto";
import path from "node:path";
import { DOMParser, type Document as XmlDocument, type Element as XmlElement } from "@xmldom/xmldom";
import JSZip from "jszip";
import { inventorySlides } from "@/lib/powerpoint-template-library/inventory";
import { assertContainerWithinCaps, createZipBudget, readOfficeMember, ZipCapError } from "@/lib/zip-caps";

const P = "http://schemas.openxmlformats.org/presentationml/2006/main";
const REL = "http://schemas.openxmlformats.org/package/2006/relationships";
const OFFICE_REL = "http://schemas.openxmlformats.org/officeDocument/2006/relationships";
const LAYOUT_PART = /^ppt\/slideLayouts\/[^/]+\.xml$/;
const MASTER_PART = /^ppt\/slideMasters\/[^/]+\.xml$/;
const MAX_SLIDES = 80;

export interface UploadedSlideLayout { member: string; name: string; placeholders: Array<{ type: string; index: string }> }
export interface UploadedSlideLayouts { packageDigest: string; slideNumber: number; currentLayoutMember: string | null; layouts: UploadedSlideLayout[] }

function parseXml(xml: string) {
  if (/<!DOCTYPE|<!ENTITY/i.test(xml)) throw new Error("invalid_xml");
  let failed = false;
  const doc = new DOMParser({ onError: () => { failed = true; } }).parseFromString(xml, "application/xml");
  if (failed || !doc.documentElement || doc.getElementsByTagName("parsererror").length) throw new Error("invalid_xml");
  return doc;
}
function all(root: XmlDocument | XmlElement, namespace: string, local: string): XmlElement[] { return Array.from(root.getElementsByTagNameNS(namespace, local)); }
function resolve(source: string, target: string, expected: RegExp): string {
  if (!target || target.includes("\\") || target.includes("%") || target.includes("?") || target.includes("#")) throw new Error("invalid_target");
  const member = target.startsWith("/") ? path.posix.normalize(target.slice(1)) : path.posix.normalize(path.posix.join(path.posix.dirname(source), target));
  if (member.startsWith("../") || path.posix.isAbsolute(member) || !expected.test(member)) throw new Error("invalid_target");
  return member;
}
function placeholders(doc: import("@xmldom/xmldom").Document): UploadedSlideLayout["placeholders"] {
  return all(doc, P, "ph").map((node) => ({ type: node.getAttribute("type") || "obj", index: node.getAttribute("idx") || "0" }))
    .sort((left, right) => left.type.localeCompare(right.type) || Number(left.index) - Number(right.index));
}
async function readXml(zip: JSZip, member: string, budget: ReturnType<typeof createZipBudget>) {
  const entry = zip.file(member);
  if (!entry || entry.dir) throw new Error("missing_member");
  return parseXml((await readOfficeMember(entry, member, budget)).toString("utf8"));
}
async function relationships(zip: JSZip, source: string, budget: ReturnType<typeof createZipBudget>): Promise<Map<string, XmlElement>> {
  const member = source.replace(/([^/]+)$/, "_rels/$1.rels");
  const doc = await readXml(zip, member, budget);
  const root = doc.documentElement;
  if (!root || root.namespaceURI !== REL || root.localName !== "Relationships") throw new Error("invalid_relationships");
  const result = new Map<string, XmlElement>();
  for (const relation of all(doc, REL, "Relationship")) {
    const id = relation.getAttribute("Id");
    if (!id || result.has(id)) throw new Error("duplicate_relationship");
    result.set(id, relation);
  }
  return result;
}
async function related(zip: JSZip, source: string, relation: XmlElement, suffix: string, targetPattern: RegExp, budget: ReturnType<typeof createZipBudget>) {
  if ((relation.getAttribute("TargetMode") ?? "").toLowerCase() === "external" || !relation.getAttribute("Type")?.endsWith(suffix)) throw new Error("invalid_relationship");
  const member = resolve(source, relation.getAttribute("Target") ?? "", targetPattern);
  if (!zip.file(member) || zip.file(member)?.dir) throw new Error("missing_member");
  return { member, doc: await readXml(zip, member, budget) };
}

/** Build layout metadata once and associate slides only with layouts registered by their master. */
export async function inspectUploadedSlideLayoutSet(bytes: Buffer, slideMembers: Array<{ id: string }>): Promise<UploadedSlideLayouts[]> {
  try {
    if (slideMembers.length > MAX_SLIDES) throw new Error("slide_limit");
    const zip = await JSZip.loadAsync(bytes);
    assertContainerWithinCaps(zip, "office-file");
    const budget = createZipBudget();
    const layoutMembers = Object.keys(zip.files).filter((member) => LAYOUT_PART.test(member) && !zip.files[member]?.dir).sort();
    if (layoutMembers.length > 200) throw new Error("layout_limit");
    const layoutByMember = new Map<string, UploadedSlideLayout>();
    for (const member of layoutMembers) {
      const doc = await readXml(zip, member, budget);
      const root = doc.documentElement;
      if (!root || root.namespaceURI !== P || root.localName !== "sldLayout") continue;
      const common = all(doc, P, "cSld")[0];
      layoutByMember.set(member, { member, name: common?.getAttribute("name") || member.split("/").at(-1) || "Layout", placeholders: placeholders(doc) });
    }
    const masterLayoutCache = new Map<string, string[]>();
    const slideResults: UploadedSlideLayouts[] = [];
    for (let index = 0; index < slideMembers.length; index += 1) {
      const slide = slideMembers[index]!;
      const slideRels = await relationships(zip, slide.id, budget);
      const slideLayouts = [...slideRels.values()].filter((item) => item.getAttribute("Type") === `${OFFICE_REL}/slideLayout`);
      if (slideLayouts.length !== 1) throw new Error("invalid_slide_layout_relation");
      const { member: current } = await related(zip, slide.id, slideLayouts[0]!, "/slideLayout", LAYOUT_PART, budget);
      const layoutRels = await relationships(zip, current, budget);
      const masters = [...layoutRels.values()].filter((item) => item.getAttribute("Type") === `${OFFICE_REL}/slideMaster`);
      if (masters.length !== 1) throw new Error("invalid_layout_master_relation");
      const masterRelation = masters[0]!;
      const masterMember = resolve(current, masterRelation.getAttribute("Target") ?? "", MASTER_PART);
      if ((masterRelation.getAttribute("TargetMode") ?? "").toLowerCase() === "external" || !zip.file(masterMember)) throw new Error("invalid_master_target");
      let registered = masterLayoutCache.get(masterMember);
      if (!registered) {
        const master = await readXml(zip, masterMember, budget);
        const masterRoot = master.documentElement;
        if (!masterRoot || masterRoot.namespaceURI !== P || masterRoot.localName !== "sldMaster") throw new Error("invalid_master");
        const list = all(master, P, "sldLayoutIdLst")[0];
        const masterRels = await relationships(zip, masterMember, budget);
        registered = [];
        for (const layoutId of list ? all(list, P, "sldLayoutId") : []) {
          const relId = layoutId.getAttributeNS(OFFICE_REL, "id");
          const relation = relId ? masterRels.get(relId) : undefined;
          if (!relation) throw new Error("invalid_master_layout_relation");
          const target = resolve(masterMember, relation.getAttribute("Target") ?? "", LAYOUT_PART);
          if (relation.getAttribute("Type") !== `${OFFICE_REL}/slideLayout` || (relation.getAttribute("TargetMode") ?? "").toLowerCase() === "external" || !layoutByMember.has(target)) throw new Error("invalid_master_layout_target");
          registered.push(target);
        }
        masterLayoutCache.set(masterMember, registered);
      }
      if (!registered.includes(current)) throw new Error("current_layout_unregistered");
      const layouts = registered.map((member) => layoutByMember.get(member)).filter((layout): layout is UploadedSlideLayout => Boolean(layout));
      slideResults.push({ packageDigest: createHash("sha256").update(bytes).digest("hex"), slideNumber: index + 1, currentLayoutMember: current, layouts });
    }
    return slideResults;
  } catch (error) {
    if (error instanceof ZipCapError) throw error;
    throw new Error("layout_inventory_unavailable");
  }
}

export async function inspectUploadedSlideLayouts(bytes: Buffer, slideNumber: number): Promise<UploadedSlideLayouts> {
  const slides = await inventorySlides(bytes);
  if (!Number.isInteger(slideNumber) || slideNumber < 1 || !slides[slideNumber - 1]) throw new Error("layout_inventory_unavailable");
  return (await inspectUploadedSlideLayoutSet(bytes, slides))[slideNumber - 1]!;
}
