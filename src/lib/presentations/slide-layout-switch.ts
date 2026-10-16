import { DOMParser, XMLSerializer, type Document as XmlDocument, type Element as XmlElement } from "@xmldom/xmldom";
import JSZip from "jszip";
import path from "node:path";
import { inventorySlides } from "@/lib/powerpoint-template-library/inventory";
import { assertContainerWithinCaps, createZipBudget, readOfficeMember, ZipCapError } from "@/lib/zip-caps";

const PACKAGE_RELATIONSHIPS = "http://schemas.openxmlformats.org/package/2006/relationships";
const PRESENTATION_NS = "http://schemas.openxmlformats.org/presentationml/2006/main";
const OFFICE_REL_NS = "http://schemas.openxmlformats.org/officeDocument/2006/relationships";
const LAYOUT_REL = `${OFFICE_REL_NS}/slideLayout`;
const MASTER_REL = `${OFFICE_REL_NS}/slideMaster`;

export type SlideLayoutSwitchErrorCode =
  | "invalid_package"
  | "invalid_slide"
  | "invalid_relationship"
  | "invalid_target"
  | "layout_missing"
  | "same_layout"
  | "placeholder_mismatch";

export class SlideLayoutSwitchError extends Error {
  constructor(readonly code: SlideLayoutSwitchErrorCode) {
    super(code);
    this.name = "SlideLayoutSwitchError";
  }
}

export interface SlidePlaceholderRef {
  type: string;
  index: string;
}

export interface SlideLayoutSwitchResult {
  bytes: Buffer;
  slideNumber: number;
  relationship: { id: string; before: string; after: string };
  placeholders: {
    slide: SlidePlaceholderRef[];
    beforeLayout: SlidePlaceholderRef[];
    afterLayout: SlidePlaceholderRef[];
    added: SlidePlaceholderRef[];
    removed: SlidePlaceholderRef[];
  };
}

function parseXml(xml: string): XmlDocument {
  if (/<!DOCTYPE|<!ENTITY/i.test(xml)) throw new SlideLayoutSwitchError("invalid_package");
  let failed = false;
  const document = new DOMParser({ onError: () => { failed = true; } }).parseFromString(xml, "application/xml");
  if (failed || !document.documentElement || document.getElementsByTagName("parsererror").length > 0) {
    throw new SlideLayoutSwitchError("invalid_package");
  }
  return document;
}

function elements(document: XmlDocument, namespace: string, localName: string): XmlElement[] {
  return Array.from(document.getElementsByTagNameNS(namespace, localName));
}

function relationshipDocument(xml: string): XmlDocument {
  const document = parseXml(xml);
  const root = document.documentElement;
  if (!root || root.namespaceURI !== PACKAGE_RELATIONSHIPS || root.localName !== "Relationships") {
    throw new SlideLayoutSwitchError("invalid_relationship");
  }
  const ids = new Set<string>();
  for (const relationship of elements(document, PACKAGE_RELATIONSHIPS, "Relationship")) {
    const id = relationship.getAttribute("Id");
    if (!id || ids.has(id)) throw new SlideLayoutSwitchError("invalid_relationship");
    ids.add(id);
  }
  return document;
}

function resolveTarget(sourcePart: string, relationship: XmlElement, expectedPrefix: string): string {
  const targetMode = relationship.getAttribute("TargetMode");
  if (targetMode !== null && targetMode !== "Internal") {
    throw new SlideLayoutSwitchError("invalid_target");
  }
  const target = relationship.getAttribute("Target");
  if (!target || target.includes("\\") || target.includes("%") || target.includes("?") || target.includes("#")) {
    throw new SlideLayoutSwitchError("invalid_target");
  }
  const resolved = target.startsWith("/")
    ? path.posix.normalize(target.slice(1))
    : path.posix.normalize(path.posix.join(path.posix.dirname(sourcePart), target));
  if (resolved === "." || resolved.startsWith("../") || path.posix.isAbsolute(resolved) || !resolved.startsWith(expectedPrefix)) {
    throw new SlideLayoutSwitchError("invalid_target");
  }
  return resolved;
}

async function readXml(zip: JSZip, member: string, budget: ReturnType<typeof createZipBudget>): Promise<{ xml: string; document: XmlDocument }> {
  const entry = zip.file(member);
  if (!entry || entry.dir) throw new SlideLayoutSwitchError("invalid_package");
  const xml = (await readOfficeMember(entry, member, budget)).toString("utf8");
  return { xml, document: parseXml(xml) };
}

async function validateLayoutMaster(
  zip: JSZip,
  layoutPart: string,
  budget: ReturnType<typeof createZipBudget>
): Promise<void> {
  const relationshipsPart = layoutPart.replace(/^ppt\/slideLayouts\//, "ppt/slideLayouts/_rels/") + ".rels";
  const { xml } = await readXml(zip, relationshipsPart, budget);
  const relationships = relationshipDocument(xml);
  const masterRelations = elements(relationships, PACKAGE_RELATIONSHIPS, "Relationship")
    .filter((relationship) => relationship.getAttribute("Type") === MASTER_REL);
  if (masterRelations.length !== 1) throw new SlideLayoutSwitchError("invalid_relationship");
  const masterPart = resolveTarget(layoutPart, masterRelations[0], "ppt/slideMasters/");
  const { document: master } = await readXml(zip, masterPart, budget);
  requireRoot(master, "sldMaster");
}

function placeholders(document: XmlDocument): SlidePlaceholderRef[] {
  const found = elements(document, PRESENTATION_NS, "ph").map((node) => ({
    type: node.getAttribute("type") || "obj",
    index: node.getAttribute("idx") || "0",
  }));
  if (found.some((item) => !/^[A-Za-z][A-Za-z0-9]*$/.test(item.type) || !/^\d+$/.test(item.index))) {
    throw new SlideLayoutSwitchError("invalid_package");
  }
  const keys = found.map((item) => `${item.type}:${item.index}`);
  if (new Set(keys).size !== keys.length) throw new SlideLayoutSwitchError("invalid_package");
  return found.sort((left, right) => left.type.localeCompare(right.type) || Number(left.index) - Number(right.index));
}

function requireRoot(document: XmlDocument, localName: string): void {
  const root = document.documentElement;
  if (!root || root.namespaceURI !== PRESENTATION_NS || root.localName !== localName) {
    throw new SlideLayoutSwitchError("invalid_package");
  }
}

function placeholderKey(item: SlidePlaceholderRef): string {
  return `${item.type}:${item.index}`;
}

function assertCompatible(slideRefs: SlidePlaceholderRef[], layoutRefs: SlidePlaceholderRef[]): void {
  const available = new Set(layoutRefs.map(placeholderKey));
  if (slideRefs.some((item) => !available.has(placeholderKey(item)))) {
    throw new SlideLayoutSwitchError("placeholder_mismatch");
  }
}

function placeholderDiff(before: SlidePlaceholderRef[], after: SlidePlaceholderRef[]): { added: SlidePlaceholderRef[]; removed: SlidePlaceholderRef[] } {
  const beforeKeys = new Set(before.map(placeholderKey));
  const afterKeys = new Set(after.map(placeholderKey));
  return {
    added: after.filter((item) => !beforeKeys.has(placeholderKey(item))),
    removed: before.filter((item) => !afterKeys.has(placeholderKey(item))),
  };
}

/**
 * Switch one presentation-order slide to a different existing internal layout.
 * Only that slide's relationship part is serialized; this proves structural
 * placeholder compatibility and deliberately makes no visual-rendering claim.
 */
export async function switchSlideLayout(
  bytes: Buffer,
  slideNumber: number,
  targetLayoutMember: string
): Promise<SlideLayoutSwitchResult> {
  try {
    if (!Number.isInteger(slideNumber) || slideNumber < 1 || !/^ppt\/slideLayouts\/[^/]+\.xml$/.test(targetLayoutMember)) {
      throw new SlideLayoutSwitchError("invalid_slide");
    }
    const slideList = await inventorySlides(bytes);
    const selected = slideList[slideNumber - 1];
    if (!selected) throw new SlideLayoutSwitchError("invalid_slide");

    const zip = await JSZip.loadAsync(bytes);
    assertContainerWithinCaps(zip, "office-file");
    const budget = createZipBudget();
    const slideRelMember = selected.id.replace(/^ppt\/slides\//, "ppt/slides/_rels/") + ".rels";
    const { xml: slideRelsXml } = await readXml(zip, slideRelMember, budget);
    const slideRels = relationshipDocument(slideRelsXml);
    const layoutRelations = elements(slideRels, PACKAGE_RELATIONSHIPS, "Relationship")
      .filter((relationship) => relationship.getAttribute("Type") === LAYOUT_REL);
    if (layoutRelations.length !== 1) throw new SlideLayoutSwitchError("invalid_relationship");
    const layoutRelation = layoutRelations[0];
    const layoutPart = resolveTarget(selected.id, layoutRelation, "ppt/slideLayouts/");
    if (!zip.file(layoutPart) || zip.file(layoutPart)?.dir) throw new SlideLayoutSwitchError("layout_missing");
    if (layoutPart === targetLayoutMember) throw new SlideLayoutSwitchError("same_layout");

    if (!zip.file(targetLayoutMember) || zip.file(targetLayoutMember)?.dir) throw new SlideLayoutSwitchError("layout_missing");
    // The requested API names a package member. Convert it to a relationship-relative
    // target and run it through the same safety checks as the existing relationship.
    const relativeTarget = path.posix.relative(path.posix.dirname(selected.id), targetLayoutMember);
    const candidate = slideRels.createElementNS(PACKAGE_RELATIONSHIPS, "Relationship");
    candidate.setAttribute("TargetMode", "Internal");
    candidate.setAttribute("Type", LAYOUT_REL);
    candidate.setAttribute("Target", relativeTarget);
    const resolvedTarget = resolveTarget(selected.id, candidate, "ppt/slideLayouts/");
    if (resolvedTarget !== targetLayoutMember) throw new SlideLayoutSwitchError("invalid_target");

    const { document: slideDocument } = await readXml(zip, selected.id, budget);
    const { document: beforeLayoutDocument } = await readXml(zip, layoutPart, budget);
    const { document: afterLayoutDocument } = await readXml(zip, targetLayoutMember, budget);
    requireRoot(slideDocument, "sld");
    requireRoot(beforeLayoutDocument, "sldLayout");
    requireRoot(afterLayoutDocument, "sldLayout");
    await validateLayoutMaster(zip, layoutPart, budget);
    await validateLayoutMaster(zip, targetLayoutMember, budget);
    const slideRefs = placeholders(slideDocument);
    const beforeRefs = placeholders(beforeLayoutDocument);
    const afterRefs = placeholders(afterLayoutDocument);
    assertCompatible(slideRefs, beforeRefs);
    assertCompatible(slideRefs, afterRefs);

    layoutRelation.setAttribute("Target", relativeTarget);
    const serializer = new XMLSerializer();
    zip.file(slideRelMember, serializer.serializeToString(slideRels));
    const output = Buffer.from(await zip.generateAsync({ type: "nodebuffer" }));
    const diff = placeholderDiff(beforeRefs, afterRefs);
    return {
      bytes: output,
      slideNumber,
      relationship: { id: layoutRelation.getAttribute("Id") ?? "", before: layoutPart, after: targetLayoutMember },
      placeholders: { slide: slideRefs, beforeLayout: beforeRefs, afterLayout: afterRefs, ...diff },
    };
  } catch (error) {
    if (error instanceof SlideLayoutSwitchError) throw error;
    if (error instanceof ZipCapError) throw new SlideLayoutSwitchError("invalid_package");
    throw new SlideLayoutSwitchError("invalid_package");
  }
}
