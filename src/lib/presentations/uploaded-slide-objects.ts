import { createHash } from "node:crypto";
import path from "node:path";
import { DOMParser, XMLSerializer, type Document as XmlDocument, type Element as XmlElement } from "@xmldom/xmldom";
import JSZip from "jszip";
import { inventorySlides } from "@/lib/powerpoint-template-library/inventory";
import { assertContainerWithinCaps, createZipBudget, readOfficeMember, ZipCapError } from "@/lib/zip-caps";
import { applyUploadedSlideChartOperation, inspectUploadedSlideChart, type ChartOperation, type UploadedSlideChartData } from "@/lib/presentations/uploaded-slide-charts";
import { applyUploadedSlideSmartArtOperations, inspectUploadedSlideSmartArt, type SmartArtNodeTextOperation, type UploadedSlideSmartArtNode } from "@/lib/presentations/uploaded-slide-smartart";

const P = "http://schemas.openxmlformats.org/presentationml/2006/main";
const A = "http://schemas.openxmlformats.org/drawingml/2006/main";
const R = "http://schemas.openxmlformats.org/officeDocument/2006/relationships";
const REL = "http://schemas.openxmlformats.org/package/2006/relationships";
const C = "http://schemas.openxmlformats.org/drawingml/2006/chart";
const DGM = "http://schemas.openxmlformats.org/drawingml/2006/diagram";

export type SlideObjectKind = "shape" | "picture" | "chart" | "smartart" | "group" | "connector" | "unknown";
export interface SlideGeometry { x: number; y: number; width: number; height: number; rotation: number }
export interface UploadedSlideObject {
  id: string;
  kind: SlideObjectKind;
  name: string;
  editable: boolean;
  reason?: string;
  text: string;
  geometry?: SlideGeometry;
  fill?: { color: string; transparency: number };
  altText?: string;
  chartData?: UploadedSlideChartData;
  smartArtNodes?: UploadedSlideSmartArtNode[];
}
export interface SlidePackageContext {
  slideNumber: number;
  layout: { member: string; name: string } | null;
  notes: { member: string; text: string } | null;
  objects: UploadedSlideObject[];
}
export type SlideObjectOperation =
  | { objectId: string; kind: "shape"; action: "setGeometry"; geometry: SlideGeometry }
  | { objectId: string; kind: "shape"; action: "setFill"; fill: { color: string; transparency: number } }
  | { objectId: string; kind: "picture"; action: "setGeometry"; geometry: SlideGeometry }
  | { objectId: string; kind: "picture"; action: "setAltText"; altText: string }
  | ChartOperation
  | SmartArtNodeTextOperation;

export class SlideObjectError extends Error {
  constructor(readonly code: "invalid_package" | "invalid_slide" | "invalid_operation" | "unsupported_object" | "invalid_relationship") {
    super(code);
    this.name = "SlideObjectError";
  }
}

function parseXml(xml: string): XmlDocument {
  if (/<!DOCTYPE|<!ENTITY/i.test(xml)) throw new SlideObjectError("invalid_package");
  let failed = false;
  const document = new DOMParser({ onError: () => { failed = true; } }).parseFromString(xml, "application/xml");
  if (failed || !document.documentElement || document.getElementsByTagName("parsererror").length) throw new SlideObjectError("invalid_package");
  return document;
}
function elements(root: XmlDocument | XmlElement, ns: string, local: string): XmlElement[] {
  return Array.from(root.getElementsByTagNameNS(ns, local));
}
function direct(parent: XmlElement, ns: string, local: string): XmlElement[] {
  const result: XmlElement[] = [];
  for (let child = parent.firstChild; child; child = child.nextSibling) {
    if (child.nodeType === 1 && (child as XmlElement).namespaceURI === ns && (child as XmlElement).localName === local) result.push(child as XmlElement);
  }
  return result;
}
function first(root: XmlDocument | XmlElement, ns: string, local: string): XmlElement | undefined { return elements(root, ns, local)[0]; }
function relationshipMember(source: string, target: string, prefix: string): string {
  if (!target || target.includes("\\") || target.includes("%") || target.includes("?") || target.includes("#")) throw new SlideObjectError("invalid_relationship");
  const member = target.startsWith("/") ? path.posix.normalize(target.slice(1)) : path.posix.normalize(path.posix.join(path.posix.dirname(source), target));
  if (!member.startsWith(prefix) || member.startsWith("../") || path.posix.isAbsolute(member)) throw new SlideObjectError("invalid_relationship");
  return member;
}
async function readXml(zip: JSZip, member: string, budget: ReturnType<typeof createZipBudget>): Promise<{ xml: string; doc: XmlDocument }> {
  const entry = zip.file(member);
  if (!entry || entry.dir) throw new SlideObjectError("invalid_package");
  const xml = (await readOfficeMember(entry, member, budget)).toString("utf8");
  return { xml, doc: parseXml(xml) };
}
function content(node: XmlElement | undefined): string {
  return node ? elements(node, A, "t").map((text) => text.textContent ?? "").join("") : "";
}
function geometry(node: XmlElement): SlideGeometry | undefined {
  const transform = first(node, A, "xfrm");
  if (!transform) return undefined;
  const off = first(transform, A, "off"), ext = first(transform, A, "ext");
  if (!off || !ext) return undefined;
  const vals = [off.getAttribute("x"), off.getAttribute("y"), ext.getAttribute("cx"), ext.getAttribute("cy")].map(Number);
  if (vals.some((n) => !Number.isSafeInteger(n) || n < 0)) return undefined;
  const rot = Number(transform.getAttribute("rot") || "0");
  if (!Number.isSafeInteger(rot)) return undefined;
  return { x: vals[0], y: vals[1], width: vals[2], height: vals[3], rotation: rot / 60000 };
}
function objectKind(node: XmlElement): SlideObjectKind {
  if (node.namespaceURI !== P) return "unknown";
  if (node.localName === "sp") return "shape";
  if (node.localName === "pic") return "picture";
  if (node.localName === "cxnSp") return "connector";
  if (node.localName === "grpSp") return "group";
  if (node.localName === "graphicFrame") {
    if (first(node, C, "chart")) return "chart";
    if (first(node, DGM, "relIds")) return "smartart";
  }
  return "unknown";
}
function readFill(node: XmlElement): UploadedSlideObject["fill"] {
  const properties = first(node, P, "spPr");
  const solid = properties && direct(properties, A, "solidFill")[0];
  const colorNode = solid?.firstChild;
  if (!solid || !colorNode || colorNode.nodeType !== 1) return undefined;
  const color = colorNode as XmlElement;
  const hex = color.getAttribute("val") ?? "";
  if (color.namespaceURI !== A || color.localName !== "srgbClr" || !/^[0-9A-Fa-f]{6}$/.test(hex)) return undefined;
  const alpha = first(solid, A, "alpha");
  const transparency = alpha ? 100 - Number(alpha.getAttribute("val")) / 1000 : 0;
  if (!Number.isFinite(transparency) || transparency < 0 || transparency > 100) return undefined;
  return { color: `#${hex.toUpperCase()}`, transparency };
}
function shapeProps(node: XmlElement): { id: string; name: string; altText: string; text: string } | undefined {
  const nonVisual = node.localName === "sp" ? first(node, P, "cNvPr") : first(node, P, "cNvPr");
  if (!nonVisual) return undefined;
  return { id: nonVisual.getAttribute("id") ?? "", name: nonVisual.getAttribute("name") || `${node.localName}`, altText: nonVisual.getAttribute("descr") ?? "", text: content(node) };
}
function layoutName(doc: XmlDocument): string { return first(doc, P, "cSld")?.getAttribute("name") ?? "Unnamed layout"; }

export async function inspectSlideObjects(bytes: Buffer, slideNumber: number, knownSlides?: Array<{ id: string }>): Promise<SlidePackageContext> {
  try {
    const slides = knownSlides ?? await inventorySlides(bytes);
    const slide = slides[slideNumber - 1];
    if (!slide) throw new SlideObjectError("invalid_slide");
    const zip = await JSZip.loadAsync(bytes);
    assertContainerWithinCaps(zip, "office-file");
    const budget = createZipBudget();
    const { doc } = await readXml(zip, slide.id, budget);
    const relMember = slide.id.replace(/^ppt\/slides\//, "ppt/slides/_rels/") + ".rels";
    const relationships = zip.file(relMember) ? (await readXml(zip, relMember, budget)).doc : parseXml(`<Relationships xmlns="${REL}"/>`);
    const rels = new Map<string, { type: string; target: string; external: boolean }>();
    for (const relationship of elements(relationships, REL, "Relationship")) {
      const id = relationship.getAttribute("Id");
      if (!id || rels.has(id)) throw new SlideObjectError("invalid_relationship");
      rels.set(id, { type: relationship.getAttribute("Type") ?? "", target: relationship.getAttribute("Target") ?? "", external: (relationship.getAttribute("TargetMode") ?? "").toLowerCase() === "external" });
    }
    const packageKey = createHash("sha256").update(bytes).digest("hex").slice(0, 20);
    const tree = first(doc, P, "spTree");
    if (!tree) throw new SlideObjectError("invalid_package");
    const objects: UploadedSlideObject[] = [];
    const nonVisualIds = elements(tree, P, "cNvPr").map((node) => node.getAttribute("id") ?? "");
    if (nonVisualIds.some((id) => !/^\d+$/.test(id)) || new Set(nonVisualIds).size !== nonVisualIds.length) throw new SlideObjectError("invalid_package");
    for (let child = tree.firstChild; child; child = child.nextSibling) {
      if (child.nodeType !== 1) continue;
      const node = child as XmlElement;
      if (node.localName === "nvGrpSpPr" || node.localName === "grpSpPr") continue;
      const kind = objectKind(node);
      const props = shapeProps(node);
      if (!props) continue;
      if (!/^\d+$/.test(props.id)) throw new SlideObjectError("invalid_package");
      const objectId = `${packageKey}:s${slideNumber}:o${props.id}:${kind}`;
      let editable = false;
      let reason: string | undefined;
      let chartData: UploadedSlideChartData | undefined;
      let smartArtNodes: UploadedSlideSmartArtNode[] | undefined;
      if (kind === "shape") {
        const properties = first(node, P, "spPr");
        const safeGeometry = Boolean(properties && first(properties, A, "xfrm") && first(properties, A, "prstGeom") && !first(properties, A, "custGeom") && !first(properties, A, "effectLst") && !first(properties, A, "effectDag"));
        editable = safeGeometry;
        if (!editable) reason = "This shape uses custom geometry, effects, or a transform the editor cannot safely rewrite.";
      } else if (kind === "picture") {
        const blip = first(node, A, "blip");
        const embed = blip?.getAttributeNS(R, "embed") ?? "";
        const imageRelationship = rels.get(embed);
        editable = Boolean(first(node, P, "spPr") && first(node, A, "xfrm") && imageRelationship && !imageRelationship.external && imageRelationship.type.endsWith("/image") && zip.file(relationshipMember(slide.id, imageRelationship.target, "ppt/media/")));
        if (!editable) reason = "The picture has an external, unresolved, or unsupported image relationship and is read-only.";
      }
      else if (kind === "group") { reason = "Grouped objects are kept together and are read-only."; }
      else if (kind === "chart") {
        const chartRef = first(node, C, "chart");
        const chartRelId = chartRef?.getAttributeNS(R, "id") ?? "";
        const inspected = await inspectUploadedSlideChart(bytes, slide.id, chartRelId);
        editable = Boolean(inspected.data);
        reason = inspected.reason;
        chartData = inspected.data;
      }
      else if (kind === "smartart") {
        const inspected = await inspectUploadedSlideSmartArt(bytes, slide.id, props.id);
        smartArtNodes = inspected?.nodes;
        editable = Boolean(smartArtNodes?.length);
        if (!editable) reason = "SmartArt is retained; its diagram relationships or hierarchy are outside the supported simple leaf-text edit set.";
      }
      else if (kind === "connector" || kind === "unknown") { editable = false; reason = "This PowerPoint object is retained but its structure is outside the supported edit set."; }
      const transformNode = kind === "shape" || kind === "picture" ? node : undefined;
      const name = props.name.slice(0, 120);
      objects.push({
        id: objectId, kind, name, editable, ...(reason ? { reason } : {}), text: props.text.slice(0, 4000),
        ...(transformNode && geometry(transformNode) ? { geometry: geometry(transformNode) } : {}),
        ...(kind === "shape" ? { fill: readFill(node) } : {}),
        ...(kind === "picture" ? { altText: props.altText.slice(0, 500) } : {}),
        ...(chartData ? { chartData } : {}),
        ...(smartArtNodes ? { smartArtNodes } : {}),
      });
    }
    let layout: SlidePackageContext["layout"] = null;
    let notes: SlidePackageContext["notes"] = null;
    for (const relationship of rels.values()) {
      if (relationship.external) continue;
      if (relationship.type.endsWith("/slideLayout")) {
        const member = relationshipMember(slide.id, relationship.target, "ppt/slideLayouts/");
        if (!zip.file(member)) throw new SlideObjectError("invalid_relationship");
        const layoutDoc = (await readXml(zip, member, budget)).doc;
        layout = { member, name: layoutName(layoutDoc).slice(0, 120) };
      } else if (relationship.type.endsWith("/notesSlide")) {
        const member = relationshipMember(slide.id, relationship.target, "ppt/notesSlides/");
        const noteDoc = (await readXml(zip, member, budget)).doc;
        const noteText = elements(noteDoc, A, "t").map((text) => text.textContent ?? "").join("\n").slice(0, 4000);
        notes = { member, text: noteText };
      }
    }
    return { slideNumber, layout, notes, objects };
  } catch (error) {
    if (error instanceof SlideObjectError) throw error;
    if (error instanceof ZipCapError) throw new SlideObjectError("invalid_package");
    throw new SlideObjectError("invalid_package");
  }
}

function boundedGeometry(value: unknown): SlideGeometry {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new SlideObjectError("invalid_operation");
  const record = value as Record<string, unknown>;
  if (Object.keys(record).sort().join(",") !== "height,rotation,width,x,y") throw new SlideObjectError("invalid_operation");
  const values = [record.x, record.y, record.width, record.height];
  if (values.some((item) => typeof item !== "number" || !Number.isSafeInteger(item)) || typeof record.rotation !== "number" || !Number.isFinite(record.rotation) || !Number.isSafeInteger(record.rotation * 60000) ||
      (record.x as number) < 0 || (record.y as number) < 0 || (record.width as number) < 1 || (record.height as number) < 1 ||
      (record.x as number) > 200_000_000 || (record.y as number) > 200_000_000 || (record.width as number) > 200_000_000 || (record.height as number) > 200_000_000 ||
      Math.abs(record.rotation as number) > 360) throw new SlideObjectError("invalid_operation");
  return record as unknown as SlideGeometry;
}
function targetObject(doc: XmlDocument, slideNumber: number, packageKey: string, id: unknown, expectedKind: "shape" | "picture"): XmlElement {
  if (typeof id !== "string" || !id.startsWith(`${packageKey}:s${slideNumber}:o`)) throw new SlideObjectError("invalid_operation");
  const tree = first(doc, P, "spTree");
  if (!tree) throw new SlideObjectError("invalid_package");
  for (let child = tree.firstChild; child; child = child.nextSibling) {
    if (child.nodeType !== 1) continue;
    const node = child as XmlElement;
    if (objectKind(node) !== expectedKind) continue;
    const props = shapeProps(node);
    if (props && `${packageKey}:s${slideNumber}:o${props.id}:${expectedKind}` === id) return node;
  }
  throw new SlideObjectError("invalid_operation");
}
function setGeometry(node: XmlElement, value: SlideGeometry): void {
  const transform = first(node, A, "xfrm"), off = transform && first(transform, A, "off"), ext = transform && first(transform, A, "ext");
  if (!transform || !off || !ext) throw new SlideObjectError("unsupported_object");
  off.setAttribute("x", String(value.x)); off.setAttribute("y", String(value.y));
  ext.setAttribute("cx", String(value.width)); ext.setAttribute("cy", String(value.height));
  transform.setAttribute("rot", String(value.rotation * 60000));
}
function setFill(doc: XmlDocument, node: XmlElement, fill: unknown): void {
  if (!fill || typeof fill !== "object" || Array.isArray(fill)) throw new SlideObjectError("invalid_operation");
  const value = fill as Record<string, unknown>;
  if (Object.keys(value).sort().join(",") !== "color,transparency") throw new SlideObjectError("invalid_operation");
  if (typeof value.color !== "string" || !/^#[0-9A-Fa-f]{6}$/.test(value.color) || typeof value.transparency !== "number" || !Number.isFinite(value.transparency) || value.transparency < 0 || value.transparency > 100) throw new SlideObjectError("invalid_operation");
  const spPr = first(node, P, "spPr");
  if (!spPr || first(spPr, A, "gradFill") || first(spPr, A, "pattFill") || first(spPr, A, "blipFill") || first(spPr, A, "grpFill")) throw new SlideObjectError("unsupported_object");
  const fillNames = new Set(["solidFill", "noFill", "gradFill", "blipFill", "pattFill", "grpFill"]);
  for (const child of direct(spPr, A, "solidFill")) spPr.removeChild(child);
  for (const child of Array.from(spPr.childNodes)) {
    const element = child.nodeType === 1 ? child as XmlElement : undefined;
    if (element && element.localName && fillNames.has(element.localName) && element.namespaceURI === A) spPr.removeChild(child);
  }
  const solid = doc.createElementNS(A, "a:solidFill");
  for (let child = solid.firstChild; child;) { const next = child.nextSibling; solid.removeChild(child); child = next; }
  const color = doc.createElementNS(A, "a:srgbClr"); color.setAttribute("val", value.color.slice(1).toUpperCase());
  if (value.transparency > 0) { const alpha = doc.createElementNS(A, "a:alpha"); alpha.setAttribute("val", String(Math.round((100 - value.transparency) * 1000))); color.appendChild(alpha); }
  solid.appendChild(color);
  const line = direct(spPr, P, "ln")[0] ?? direct(spPr, A, "ln")[0];
  if (line) spPr.insertBefore(solid, line);
  else spPr.appendChild(solid);
}

export async function applySlideObjectOperations(bytes: Buffer, slideNumber: number, input: unknown, identityPackageKey?: string, sourceContext?: SlidePackageContext): Promise<{ bytes: Buffer; context: SlidePackageContext; changedMembers: string[] }> {
  try {
    if (!Array.isArray(input) || input.length === 0 || input.length > 40) throw new SlideObjectError("invalid_operation");
    const slides = await inventorySlides(bytes);
    const slide = slides[slideNumber - 1];
    if (!slide) throw new SlideObjectError("invalid_slide");
    const originalContext = sourceContext ?? await inspectSlideObjects(bytes, slideNumber);
    const allowedObjects = new Map(originalContext.objects.filter((object) => object.editable).map((object) => [object.id, object]));
    const packageKey = identityPackageKey ?? createHash("sha256").update(bytes).digest("hex").slice(0, 20);
    const chartOperations: ChartOperation[] = [];
    const smartArtOperations: SmartArtNodeTextOperation[] = [];
    const nativeOperations: unknown[] = [];
    for (const raw of input) {
      if (!raw || typeof raw !== "object" || Array.isArray(raw)) throw new SlideObjectError("invalid_operation");
      const operation = raw as Record<string, unknown>;
      if (typeof operation.objectId !== "string" || typeof operation.kind !== "string" || typeof operation.action !== "string") throw new SlideObjectError("invalid_operation");
      const authorized = allowedObjects.get(operation.objectId);
      if (!authorized || authorized.kind !== operation.kind) throw new SlideObjectError("invalid_operation");
      if (operation.kind === "chart" && operation.action === "setData" && Object.keys(operation).sort().join(",") === "action,data,kind,objectId") chartOperations.push(operation as unknown as ChartOperation);
      else if (operation.kind === "smartart" && operation.action === "setNodeText" && Object.keys(operation).sort().join(",") === "action,kind,nodeId,objectId,text") smartArtOperations.push(operation as unknown as SmartArtNodeTextOperation);
      else if (operation.kind !== "chart") nativeOperations.push(raw);
      else throw new SlideObjectError("invalid_operation");
    }
    let workingBytes = bytes;
    const changedMembers = new Set<string>();
    if (nativeOperations.length > 0) {
      const nativeResult = await applyNativeSlideObjectOperations(workingBytes, slideNumber, nativeOperations, originalContext, packageKey);
      workingBytes = nativeResult.bytes;
      nativeResult.changedMembers.forEach((member) => changedMembers.add(member));
    }
    const currentSlides = await inventorySlides(workingBytes);
    const currentSlide = currentSlides[slideNumber - 1];
    if (!currentSlide) throw new SlideObjectError("invalid_slide");
    for (const operation of chartOperations) {
      const chartResult = await applyUploadedSlideChartOperation(workingBytes, currentSlide.id, slideNumber, packageKey, operation);
      workingBytes = chartResult.bytes;
      chartResult.changedMembers.forEach((member) => changedMembers.add(member));
    }
    if (smartArtOperations.length > 0) {
      const smartArtResult = await applyUploadedSlideSmartArtOperations(workingBytes, currentSlide.id, slideNumber, packageKey, smartArtOperations);
      workingBytes = smartArtResult.bytes;
      smartArtResult.changedMembers.forEach((member) => changedMembers.add(member));
    }
    return { bytes: workingBytes, context: await inspectSlideObjects(workingBytes, slideNumber), changedMembers: [...changedMembers] };
  } catch (error) {
    if (error instanceof SlideObjectError) throw error;
    if (error instanceof ZipCapError) throw new SlideObjectError("invalid_package");
    throw new SlideObjectError("invalid_package");
  }
}

async function applyNativeSlideObjectOperations(bytes: Buffer, slideNumber: number, input: unknown[], originalContext: SlidePackageContext, packageKey: string): Promise<{ bytes: Buffer; context: SlidePackageContext; changedMembers: string[] }> {
  try {
    const allowedObjects = new Map(originalContext.objects.filter((object) => object.editable).map((object) => [object.id, object]));
    const slide = (await inventorySlides(bytes))[slideNumber - 1];
    if (!slide) throw new SlideObjectError("invalid_slide");
    const zip = await JSZip.loadAsync(bytes);
    assertContainerWithinCaps(zip, "office-file");
    const budget = createZipBudget();
    const { doc } = await readXml(zip, slide.id, budget);
    const seen = new Set<string>();
    for (const raw of input) {
      if (!raw || typeof raw !== "object" || Array.isArray(raw)) throw new SlideObjectError("invalid_operation");
      const op = raw as Record<string, unknown>;
      if (typeof op.objectId !== "string" || typeof op.kind !== "string" || typeof op.action !== "string") throw new SlideObjectError("invalid_operation");
      const operationKey = `${op.objectId}:${op.kind}:${op.action}`;
      if (seen.has(operationKey)) throw new SlideObjectError("invalid_operation");
      seen.add(operationKey);
      const authorized = allowedObjects.get(op.objectId);
      if (!authorized || authorized.kind !== op.kind) throw new SlideObjectError("invalid_operation");
      if (op.kind === "shape" && op.action === "setGeometry" && Object.keys(op).sort().join(",") === "action,geometry,kind,objectId") setGeometry(targetObject(doc, slideNumber, packageKey, op.objectId, "shape"), boundedGeometry(op.geometry));
      else if (op.kind === "shape" && op.action === "setFill" && Object.keys(op).sort().join(",") === "action,fill,kind,objectId") setFill(doc, targetObject(doc, slideNumber, packageKey, op.objectId, "shape"), op.fill);
      else if (op.kind === "picture" && op.action === "setGeometry" && Object.keys(op).sort().join(",") === "action,geometry,kind,objectId") setGeometry(targetObject(doc, slideNumber, packageKey, op.objectId, "picture"), boundedGeometry(op.geometry));
      else if (op.kind === "picture" && op.action === "setAltText") {
        if (Object.keys(op).sort().join(",") !== "action,altText,kind,objectId") throw new SlideObjectError("invalid_operation");
        if (typeof op.altText !== "string" || op.altText.length > 500) throw new SlideObjectError("invalid_operation");
        const picture = targetObject(doc, slideNumber, packageKey, op.objectId, "picture");
        const nonVisual = first(picture, P, "cNvPr");
        if (!nonVisual) throw new SlideObjectError("unsupported_object");
        nonVisual.setAttribute("descr", op.altText);
      } else throw new SlideObjectError("invalid_operation");
    }
    const slideEntry = zip.file(slide.id);
    if (!slideEntry) throw new SlideObjectError("invalid_package");
    zip.file(slide.id, new XMLSerializer().serializeToString(doc));
    const output = Buffer.from(await zip.generateAsync({ type: "nodebuffer" }));
    return { bytes: output, context: await inspectSlideObjects(output, slideNumber), changedMembers: [slide.id] };
  } catch (error) {
    if (error instanceof SlideObjectError) throw error;
    if (error instanceof ZipCapError) throw new SlideObjectError("invalid_package");
    throw new SlideObjectError("invalid_package");
  }
}
