import path from "node:path";
import { DOMParser, XMLSerializer, type Document as XmlDocument, type Element as XmlElement } from "@xmldom/xmldom";
import JSZip from "jszip";
import { assertContainerWithinCaps, createZipBudget, readOfficeMember, ZipCapError } from "@/lib/zip-caps";

const P = "http://schemas.openxmlformats.org/presentationml/2006/main";
const A = "http://schemas.openxmlformats.org/drawingml/2006/main";
const R = "http://schemas.openxmlformats.org/officeDocument/2006/relationships";
const REL = "http://schemas.openxmlformats.org/package/2006/relationships";
const DGM = "http://schemas.openxmlformats.org/drawingml/2006/diagram";
const DSP = "http://schemas.microsoft.com/office/drawing/2008/diagram";
const DATA_REL = `${R}/diagramData`;
const DRAWING_REL = "http://schemas.microsoft.com/office/2007/relationships/diagramDrawing";

export interface UploadedSlideSmartArtNode { id: string; text: string }
export interface UploadedSlideSmartArt { nodes: UploadedSlideSmartArtNode[] }
export interface SmartArtNodeTextOperation { objectId: string; kind: "smartart"; action: "setNodeText"; nodeId: string; text: string }
export class UploadedSlideSmartArtError extends Error {
  constructor(readonly code: "invalid_package" | "invalid_operation" | "unsupported_smartart" | "invalid_relationship") { super(code); this.name = "UploadedSlideSmartArtError"; }
}

function parse(xml: string): XmlDocument {
  if (/<!DOCTYPE|<!ENTITY/i.test(xml)) throw new UploadedSlideSmartArtError("invalid_package");
  let failed = false;
  const doc = new DOMParser({ onError: () => { failed = true; } }).parseFromString(xml, "application/xml");
  if (failed || !doc.documentElement || doc.getElementsByTagName("parsererror").length) throw new UploadedSlideSmartArtError("invalid_package");
  return doc;
}
function all(root: XmlDocument | XmlElement, ns: string, local: string): XmlElement[] { return Array.from(root.getElementsByTagNameNS(ns, local)); }
function direct(root: XmlElement, ns: string, local: string): XmlElement[] { return Array.from(root.childNodes).filter((node): node is XmlElement => node.nodeType === 1 && (node as XmlElement).namespaceURI === ns && (node as XmlElement).localName === local); }
function requiredAttribute(element: XmlElement, name: string): string {
  const value = element.getAttribute(name);
  if (!value) throw new UploadedSlideSmartArtError("unsupported_smartart");
  return value;
}
function one(root: XmlDocument | XmlElement, ns: string, local: string): XmlElement {
  const matches = all(root, ns, local);
  if (matches.length !== 1) throw new UploadedSlideSmartArtError("unsupported_smartart");
  return matches[0]!;
}
function relMember(source: string, target: string, prefix: string): string {
  if (!target || target.includes("\\") || target.includes("%") || target.includes("?") || target.includes("#")) throw new UploadedSlideSmartArtError("invalid_relationship");
  const member = target.startsWith("/") ? path.posix.normalize(target.slice(1)) : path.posix.normalize(path.posix.join(path.posix.dirname(source), target));
  if (!member.startsWith(prefix) || member.startsWith("../") || path.posix.isAbsolute(member)) throw new UploadedSlideSmartArtError("invalid_relationship");
  return member;
}
function relsMember(source: string): string { return source.replace(/([^/]+)$/, "_rels/$1.rels"); }
async function readXml(zip: JSZip, member: string, budget: ReturnType<typeof createZipBudget>): Promise<XmlDocument> {
  const entry = zip.file(member);
  if (!entry || entry.dir) throw new UploadedSlideSmartArtError("invalid_package");
  return parse((await readOfficeMember(entry, member, budget)).toString("utf8"));
}
async function countReferences(zip: JSZip, sourcePrefix: string, relsPrefix: string, relationshipType: string, targetMember: string, budget: ReturnType<typeof createZipBudget>): Promise<number> {
  let count = 0;
  for (const entry of Object.values(zip.files)) {
    if (entry.dir || !entry.name.startsWith(relsPrefix) || !entry.name.endsWith(".rels")) continue;
    const rels = relationshipMap(await readXml(zip, entry.name, budget));
    const source = `${sourcePrefix}${entry.name.slice(relsPrefix.length).replace(/\.rels$/, "")}`;
    for (const relation of rels.values()) {
      if (relation.type !== relationshipType || relation.external) continue;
      if (relMember(source, relation.target, sourcePrefix === "ppt/slides/" ? "ppt/diagrams/" : "ppt/diagrams/") === targetMember) count += 1;
    }
  }
  return count;
}
function relationshipMap(doc: XmlDocument): Map<string, { type: string; target: string; external: boolean }> {
  const map = new Map<string, { type: string; target: string; external: boolean }>();
  for (const relation of all(doc, REL, "Relationship")) {
    const id = relation.getAttribute("Id");
    if (!id || map.has(id)) throw new UploadedSlideSmartArtError("invalid_relationship");
    const targetMode = relation.getAttribute("TargetMode") ?? "";
    if (targetMode && !["internal", "external"].includes(targetMode.toLowerCase())) throw new UploadedSlideSmartArtError("invalid_relationship");
    const type = relation.getAttribute("Type"), target = relation.getAttribute("Target");
    if (!type || !target) throw new UploadedSlideSmartArtError("invalid_relationship");
    map.set(id, { type, target, external: targetMode.toLowerCase() === "external" });
  }
  return map;
}
function textBodyText(body: XmlElement): string {
  const paragraphs = direct(body, A, "p");
  if (paragraphs.length !== 1 || all(body, A, "p").length !== 1) throw new UploadedSlideSmartArtError("unsupported_smartart");
  const paragraph = paragraphs[0]!;
  if (all(paragraph, A, "fld").length || all(paragraph, A, "br").length || all(paragraph, A, "tab").length) throw new UploadedSlideSmartArtError("unsupported_smartart");
  const runs = direct(paragraph, A, "r");
  if (runs.length !== 1 || all(paragraph, A, "r").length !== 1 || direct(runs[0]!, A, "t").length !== 1) throw new UploadedSlideSmartArtError("unsupported_smartart");
  return direct(runs[0]!, A, "t")[0]!.textContent ?? "";
}
function setText(body: XmlElement, value: string): void {
  // Validation above limits supported bodies to one paragraph, run, and text
  // node. Replacing only textContent preserves all run and paragraph styling.
  const text = direct(direct(body, A, "p")[0]!, A, "r")[0] && direct(direct(direct(body, A, "p")[0]!, A, "r")[0]!, A, "t")[0];
  if (!text) throw new UploadedSlideSmartArtError("unsupported_smartart");
  text.textContent = value;
  if (/^\s|\s$/.test(value)) text.setAttributeNS("http://www.w3.org/XML/1998/namespace", "xml:space", "preserve");
  else text.removeAttributeNS("http://www.w3.org/XML/1998/namespace", "space");
}
interface ResolvedSmartArt { zip: JSZip; slideMember: string; dataMember: string; drawingMember: string; dataDoc: XmlDocument; drawingDoc: XmlDocument; nodes: UploadedSlideSmartArtNode[]; slideShapeId: string; }

async function resolveSmartArt(bytes: Buffer, slideMember: string, slideShapeId: string): Promise<ResolvedSmartArt> {
  const zip = await JSZip.loadAsync(bytes);
  assertContainerWithinCaps(zip, "office-file");
  const budget = createZipBudget();
  const slideDoc = await readXml(zip, slideMember, budget);
  const relEntry = zip.file(relsMember(slideMember));
  if (!relEntry) throw new UploadedSlideSmartArtError("invalid_relationship");
  const slideRels = relationshipMap(await readXml(zip, relsMember(slideMember), budget));
  const frames = all(slideDoc, P, "graphicFrame").filter(frame => all(frame, P, "cNvPr").some(nv => nv.getAttribute("id") === slideShapeId) && all(frame, DGM, "relIds").length === 1);
  if (frames.length !== 1) throw new UploadedSlideSmartArtError("unsupported_smartart");
  const frame = frames[0]!;
  if (all(frame, DGM, "relIds").length !== 1 || all(frame, A, "graphicData").length !== 1) throw new UploadedSlideSmartArtError("unsupported_smartart");
  const relIds = one(frame, DGM, "relIds");
  const dataId = relIds.getAttributeNS(R, "dm");
  if (!dataId || Array.from(relIds.attributes).some(attribute => attribute.namespaceURI === R && attribute.localName !== "dm")) throw new UploadedSlideSmartArtError("unsupported_smartart");
  const dataRel = slideRels.get(dataId);
  if (!dataRel || dataRel.external || dataRel.type !== DATA_REL) throw new UploadedSlideSmartArtError("invalid_relationship");
  const dataMember = relMember(slideMember, dataRel.target, "ppt/diagrams/");
  if (await countReferences(zip, "ppt/slides/", "ppt/slides/_rels/", DATA_REL, dataMember, budget) !== 1) throw new UploadedSlideSmartArtError("unsupported_smartart");
  const dataDoc = await readXml(zip, dataMember, budget);
  if (dataDoc.documentElement?.namespaceURI !== DGM || dataDoc.documentElement.localName !== "dataModel") throw new UploadedSlideSmartArtError("unsupported_smartart");
  const dataRelsDoc = await readXml(zip, relsMember(dataMember), budget);
  const dataRels = relationshipMap(dataRelsDoc);
  const extLists = all(dataDoc, DGM, "extLst");
  if (extLists.length !== 1) throw new UploadedSlideSmartArtError("unsupported_smartart");
  const extensions = all(extLists[0]!, A, "ext");
  const extensionElements = Array.from(extLists[0]!.childNodes).filter(node => node.nodeType === 1) as XmlElement[];
  if (extensions.length !== 1 || extensionElements.length !== 1 || extensionElements[0] !== extensions[0] || extensions[0]!.getAttribute("uri") !== "http://schemas.microsoft.com/office/drawing/2008/diagram" ||
      Array.from(extensions[0]!.attributes).some(attribute => attribute.namespaceURI !== "http://www.w3.org/2000/xmlns/" && attribute.localName !== "uri")) throw new UploadedSlideSmartArtError("unsupported_smartart");
  const drawingRefs = all(extensions[0]!, DSP, "dataModelExt");
  const extensionChildren = Array.from(extensions[0]!.childNodes).filter(node => node.nodeType === 1) as XmlElement[];
  const drawingRefChildren = drawingRefs[0] ? Array.from(drawingRefs[0]!.childNodes).filter(node => node.nodeType === 1) : [];
  if (drawingRefs.length !== 1 || extensionChildren.length !== 1 || extensionChildren[0] !== drawingRefs[0] || drawingRefChildren.length !== 0 ||
      Array.from(drawingRefs[0]!.attributes).some(attribute => attribute.namespaceURI !== "http://www.w3.org/2000/xmlns/" && attribute.localName !== "relId" && attribute.localName !== "minVer")) throw new UploadedSlideSmartArtError("unsupported_smartart");
  const drawingId = requiredAttribute(drawingRefs[0]!, "relId");
  const drawingRel = dataRels.get(drawingId);
  if (!drawingId || !drawingRel || drawingRel.external || drawingRel.type !== DRAWING_REL) throw new UploadedSlideSmartArtError("invalid_relationship");
  // The supported text-only hierarchy must not rely on linked images or other
  // relationships whose edit/preservation semantics are not defined here.
  if (dataRels.size !== 1 || all(dataDoc, DGM, "relIds").length || all(dataDoc, DGM, "catLst").length) throw new UploadedSlideSmartArtError("unsupported_smartart");
  const drawingMember = relMember(dataMember, drawingRel.target, "ppt/diagrams/");
  if (await countReferences(zip, "ppt/diagrams/", "ppt/diagrams/_rels/", DRAWING_REL, drawingMember, budget) !== 1) throw new UploadedSlideSmartArtError("unsupported_smartart");
  const drawingDoc = await readXml(zip, drawingMember, budget);
  if (drawingDoc.documentElement?.namespaceURI !== DSP || drawingDoc.documentElement.localName !== "drawing") throw new UploadedSlideSmartArtError("unsupported_smartart");
  const pointLists = all(dataDoc, DGM, "ptLst"), connectionLists = all(dataDoc, DGM, "cxnLst");
  if (pointLists.length !== 1 || connectionLists.length !== 1) throw new UploadedSlideSmartArtError("unsupported_smartart");
  const points = direct(pointLists[0]!, DGM, "pt");
  const docs = points.filter(point => point.getAttribute("type") === "doc");
  const nodes = points.filter(point => point.getAttribute("type") === "node");
  if (docs.length !== 1 || nodes.length < 1 || points.length !== docs.length + nodes.length) throw new UploadedSlideSmartArtError("unsupported_smartart");
  const modelIds = points.map(point => requiredAttribute(point, "modelId"));
  if (modelIds.some(id => id.length > 128) || new Set(modelIds).size !== modelIds.length) throw new UploadedSlideSmartArtError("unsupported_smartart");
  const pointById = new Map(points.map(point => [requiredAttribute(point, "modelId"), point]));
  const drawingShapes = all(drawingDoc, DSP, "sp");
  const drawingById = new Map<string, XmlElement>();
  for (const shape of drawingShapes) {
    const id = requiredAttribute(shape, "modelId");
    if (drawingById.has(id)) throw new UploadedSlideSmartArtError("unsupported_smartart");
    drawingById.set(id, shape);
  }
  if (drawingById.size !== points.length || points.some(point => !drawingById.has(requiredAttribute(point, "modelId")))) throw new UploadedSlideSmartArtError("unsupported_smartart");
  const pointText = new Map<string, string>();
  for (const point of points) {
    const textBodies = direct(point, DGM, "t");
    if (textBodies.length !== 1 || all(point, DGM, "t").length !== 1) throw new UploadedSlideSmartArtError("unsupported_smartart");
    const modelId = requiredAttribute(point, "modelId");
    const drawingShape = drawingById.get(modelId)!;
    const drawingBodies = direct(drawingShape, DSP, "txBody");
    if (drawingBodies.length !== 1 || all(drawingShape, DSP, "txBody").length !== 1) throw new UploadedSlideSmartArtError("unsupported_smartart");
    const sourceText = textBodyText(textBodies[0]!);
    if (textBodyText(drawingBodies[0]!) !== sourceText) throw new UploadedSlideSmartArtError("unsupported_smartart");
    pointText.set(modelId, sourceText);
  }
  const connections = direct(connectionLists[0]!, DGM, "cxn");
  if (all(connectionLists[0]!, DGM, "cxn").length !== connections.length) throw new UploadedSlideSmartArtError("unsupported_smartart");
  const childIds = new Set<string>();
  const parentByChild = new Map<string, string>();
  for (const connection of connections) {
    const type = connection.getAttribute("type"), source = connection.getAttribute("srcId"), destination = connection.getAttribute("destId");
    if ((type !== "parOf" && type !== "presOf") || !source || !destination || !pointById.has(source) || !pointById.has(destination)) throw new UploadedSlideSmartArtError("unsupported_smartart");
    if (type === "parOf") {
      // OOXML's directed parent-of edge names the parent at srcId and child at destId.
      if (destination === requiredAttribute(docs[0]!, "modelId") || source === destination || parentByChild.has(destination)) throw new UploadedSlideSmartArtError("unsupported_smartart");
      parentByChild.set(destination, source);
      childIds.add(source);
    }
  }
  const docId = requiredAttribute(docs[0]!, "modelId");
  if (!nodes.every(node => parentByChild.has(requiredAttribute(node, "modelId")))) throw new UploadedSlideSmartArtError("unsupported_smartart");
  // Every node must connect to the single document root; reject cycles and disconnected trees.
  for (const node of nodes) {
    let current = requiredAttribute(node, "modelId");
    const seen = new Set<string>();
    while (current !== docId) {
      if (seen.has(current)) throw new UploadedSlideSmartArtError("unsupported_smartart");
      seen.add(current);
      const parent = parentByChild.get(current);
      if (!parent) throw new UploadedSlideSmartArtError("unsupported_smartart");
      current = parent;
    }
  }
  const leafNodes = nodes.filter(node => !childIds.has(requiredAttribute(node, "modelId")));
  if (!leafNodes.length) throw new UploadedSlideSmartArtError("unsupported_smartart");
  const resolvedNodes = leafNodes.map(point => { const id = requiredAttribute(point, "modelId"); return { id, text: pointText.get(id) ?? "" }; });
  return { zip, slideMember, dataMember, drawingMember, dataDoc, drawingDoc, nodes: resolvedNodes, slideShapeId };
}

export async function inspectUploadedSlideSmartArt(bytes: Buffer, slideMember: string, slideShapeId: string): Promise<UploadedSlideSmartArt | null> {
  try {
    return { nodes: (await resolveSmartArt(bytes, slideMember, slideShapeId)).nodes };
  } catch (error) {
    if (error instanceof UploadedSlideSmartArtError || error instanceof ZipCapError) return null;
    return null;
  }
}

export async function applyUploadedSlideSmartArtOperations(bytes: Buffer, slideMember: string, slideNumber: number, packageKey: string, operations: SmartArtNodeTextOperation[]): Promise<{ bytes: Buffer; changedMembers: string[] }> {
  try {
    const targets = new Map<string, ResolvedSmartArt>();
    const seen = new Set<string>();
    for (const operation of operations) {
      if (Object.keys(operation).sort().join(",") !== "action,kind,nodeId,objectId,text" || operation.kind !== "smartart" || operation.action !== "setNodeText" || typeof operation.objectId !== "string" || typeof operation.nodeId !== "string" || typeof operation.text !== "string" || !operation.text.trim() || operation.text.length > 2_000 || operation.text.includes("\r")) throw new UploadedSlideSmartArtError("invalid_operation");
      const match = new RegExp(`^${packageKey}:s${slideNumber}:o(\\d+):smartart$`).exec(operation.objectId);
      if (!match) throw new UploadedSlideSmartArtError("invalid_operation");
      const key = `${operation.objectId}:${operation.nodeId}`;
      if (seen.has(key)) throw new UploadedSlideSmartArtError("invalid_operation");
      seen.add(key);
      let resolved = targets.get(operation.objectId);
      if (!resolved) {
        resolved = await resolveSmartArt(bytes, slideMember, match[1]!);
        targets.set(operation.objectId, resolved);
      }
      const point = direct(one(resolved.dataDoc, DGM, "ptLst"), DGM, "pt").find(item => item.getAttribute("modelId") === operation.nodeId && item.getAttribute("type") === "node");
      if (!point || !resolved.nodes.some(node => node.id === operation.nodeId)) throw new UploadedSlideSmartArtError("invalid_operation");
      const drawingShape = all(resolved.drawingDoc, DSP, "sp").find(item => item.getAttribute("modelId") === operation.nodeId);
      if (!drawingShape) throw new UploadedSlideSmartArtError("unsupported_smartart");
      const dataBody = one(point, DGM, "t"), drawingBody = one(drawingShape, DSP, "txBody");
      setText(dataBody, operation.text); setText(drawingBody, operation.text);
    }
    const changed = new Set<string>();
    const firstResolved = targets.values().next().value as ResolvedSmartArt | undefined;
    if (!firstResolved) throw new UploadedSlideSmartArtError("invalid_operation");
    for (const resolved of targets.values()) {
      resolved.zip.file(resolved.dataMember, new XMLSerializer().serializeToString(resolved.dataDoc));
      resolved.zip.file(resolved.drawingMember, new XMLSerializer().serializeToString(resolved.drawingDoc));
      changed.add(resolved.dataMember); changed.add(resolved.drawingMember);
    }
    for (const resolved of targets.values()) {
      firstResolved.zip.file(resolved.dataMember, new XMLSerializer().serializeToString(resolved.dataDoc));
      firstResolved.zip.file(resolved.drawingMember, new XMLSerializer().serializeToString(resolved.drawingDoc));
    }
    return { bytes: Buffer.from(await firstResolved.zip.generateAsync({ type: "nodebuffer" })), changedMembers: [...changed] };
  } catch (error) {
    if (error instanceof UploadedSlideSmartArtError) throw error;
    if (error instanceof ZipCapError) throw new UploadedSlideSmartArtError("invalid_package");
    throw new UploadedSlideSmartArtError("invalid_package");
  }
}
