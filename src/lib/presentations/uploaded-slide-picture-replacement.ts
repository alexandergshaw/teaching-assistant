import { createHash } from "node:crypto";
import path from "node:path";
import { DOMParser, XMLSerializer, type Document as XmlDocument, type Element as XmlElement } from "@xmldom/xmldom";
import JSZip from "jszip";
import sharp from "sharp";
import { inspectSlideObjects } from "@/lib/presentations/uploaded-slide-objects";
import { inventorySlides } from "@/lib/powerpoint-template-library/inventory";
import { assertContainerWithinCaps, createZipBudget, readOfficeMember, ZipCapError } from "@/lib/zip-caps";

const P = "http://schemas.openxmlformats.org/presentationml/2006/main";
const A = "http://schemas.openxmlformats.org/drawingml/2006/main";
const R = "http://schemas.openxmlformats.org/officeDocument/2006/relationships";
const REL = "http://schemas.openxmlformats.org/package/2006/relationships";
const CT = "http://schemas.openxmlformats.org/package/2006/content-types";
const IMAGE_MAX_BYTES = 2 * 1024 * 1024;
const IMAGE_MAX_PIXELS = 40_000_000;

export class SlidePictureReplacementError extends Error {
  constructor(readonly code: "invalid_package" | "invalid_slide" | "invalid_picture" | "invalid_image" | "image_too_large" | "content_type_conflict") {
    super(code);
    this.name = "SlidePictureReplacementError";
  }
}

function parseXml(xml: string): XmlDocument {
  if (/<!DOCTYPE|<!ENTITY/i.test(xml)) throw new SlidePictureReplacementError("invalid_package");
  let failed = false;
  const doc = new DOMParser({ onError: () => { failed = true; } }).parseFromString(xml, "application/xml");
  if (failed || !doc.documentElement || doc.getElementsByTagName("parsererror").length) throw new SlidePictureReplacementError("invalid_package");
  return doc;
}
function all(root: XmlDocument | XmlElement, ns: string, local: string): XmlElement[] { return Array.from(root.getElementsByTagNameNS(ns, local)); }
function relMemberForSlide(slide: string): string { return slide.replace(/^ppt\/slides\//, "ppt/slides/_rels/") + ".rels"; }
const CRC_TABLE = (() => {
  const table = new Uint32Array(256);
  for (let n = 0; n < 256; n += 1) {
    let value = n;
    for (let bit = 0; bit < 8; bit += 1) value = (value & 1) ? (0xedb88320 ^ (value >>> 1)) : (value >>> 1);
    table[n] = value >>> 0;
  }
  return table;
})();

function validPng(bytes: Buffer): boolean {
  if (bytes.length < 45 || !bytes.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))) return false;
  let offset = 8, sawHeader = false, sawData = false, sawEnd = false;
  while (offset + 12 <= bytes.length) {
    const length = bytes.readUInt32BE(offset);
    if (length > IMAGE_MAX_BYTES || offset + 12 + length > bytes.length) return false;
    const type = bytes.toString("ascii", offset + 4, offset + 8);
    if (!/^[A-Za-z]{4}$/.test(type)) return false;
    let crc = 0xffffffff;
    for (const octet of bytes.subarray(offset + 4, offset + 8 + length)) crc = CRC_TABLE[(crc ^ octet) & 0xff]! ^ (crc >>> 8);
    if (((crc ^ 0xffffffff) >>> 0) !== bytes.readUInt32BE(offset + 8 + length)) return false;
    if (!sawHeader) {
      if (type !== "IHDR" || length !== 13) return false;
      const width = bytes.readUInt32BE(offset + 8), height = bytes.readUInt32BE(offset + 12);
      if (!width || !height || width * height > IMAGE_MAX_PIXELS) return false;
      sawHeader = true;
    } else if (type === "IHDR") return false;
    if (type === "IDAT") sawData = true;
    if (type === "IEND") {
      if (length !== 0 || !sawData) return false;
      sawEnd = true; offset += 12; break;
    }
    offset += 12 + length;
  }
  return sawHeader && sawData && sawEnd && offset === bytes.length;
}

function validJpeg(bytes: Buffer): boolean {
  if (bytes.length < 16 || bytes[0] !== 0xff || bytes[1] !== 0xd8) return false;
  const standalone = new Set([0x01, 0xd8, 0xd9, 0xd0, 0xd1, 0xd2, 0xd3, 0xd4, 0xd5, 0xd6, 0xd7]);
  const startOfFrame = new Set([0xc0, 0xc1, 0xc2, 0xc3, 0xc5, 0xc6, 0xc7, 0xc9, 0xca, 0xcb, 0xcd, 0xce, 0xcf]);
  let offset = 2, sawFrame = false, sawScan = false;
  while (offset < bytes.length) {
    if (bytes[offset] !== 0xff) return false;
    while (bytes[offset] === 0xff) offset += 1;
    if (offset >= bytes.length) return false;
    const marker = bytes[offset++]!;
    if (standalone.has(marker)) {
      if (marker === 0xd9) return sawFrame && sawScan && offset === bytes.length;
      continue;
    }
    if (offset + 2 > bytes.length) return false;
    const length = bytes.readUInt16BE(offset);
    if (length < 2 || offset + length > bytes.length) return false;
    if (startOfFrame.has(marker)) {
      if (length < 8) return false;
      const height = bytes.readUInt16BE(offset + 3), width = bytes.readUInt16BE(offset + 5), components = bytes[offset + 7]!;
      if (!width || !height || width * height > IMAGE_MAX_PIXELS || components < 1 || components > 4 || length !== 8 + 3 * components) return false;
      sawFrame = true;
    }
    if (marker === 0xda) {
      if (!sawFrame || length < 6) return false;
      sawScan = true;
      offset += length;
      while (offset + 1 < bytes.length) {
        if (bytes[offset] !== 0xff) { offset += 1; continue; }
        const next = bytes[offset + 1]!;
        if (next === 0x00 || (next >= 0xd0 && next <= 0xd7)) { offset += 2; continue; }
        break;
      }
      continue;
    }
    offset += length;
  }
  return false;
}

async function decodeImage(mimeType: unknown, base64: unknown): Promise<{ bytes: Buffer; extension: "png" | "jpg"; mimeType: "image/png" | "image/jpeg" }> {
  if (typeof base64 !== "string" || !base64 || base64.length > Math.ceil(IMAGE_MAX_BYTES / 3) * 4 || base64.length % 4 !== 0 || !/^[A-Za-z0-9+/]+={0,2}$/.test(base64)) throw new SlidePictureReplacementError("invalid_image");
  const bytes = Buffer.from(base64, "base64");
  if (bytes.toString("base64") !== base64) throw new SlidePictureReplacementError("invalid_image");
  if (bytes.length > IMAGE_MAX_BYTES) throw new SlidePictureReplacementError("image_too_large");
  const isPng = mimeType === "image/png" && validPng(bytes);
  const isJpeg = mimeType === "image/jpeg" && validJpeg(bytes);
  if (!isPng && !isJpeg) throw new SlidePictureReplacementError("invalid_image");
  try {
    const decoded = await sharp(bytes, { limitInputPixels: IMAGE_MAX_PIXELS }).metadata();
    if (!decoded.width || !decoded.height || decoded.width * decoded.height > IMAGE_MAX_PIXELS || (isPng && decoded.format !== "png") || (isJpeg && decoded.format !== "jpeg")) throw new Error("invalid image structure");
    await sharp(bytes, { limitInputPixels: IMAGE_MAX_PIXELS }).raw().toBuffer();
  } catch {
    throw new SlidePictureReplacementError("invalid_image");
  }
  return { bytes, extension: isPng ? "png" : "jpg", mimeType: isPng ? "image/png" : "image/jpeg" };
}
function resolveMediaTarget(slide: string, target: string): string {
  if (!target || target.includes("\\") || target.includes("%") || target.includes("?") || target.includes("#")) throw new SlidePictureReplacementError("invalid_package");
  const member = target.startsWith("/") ? path.posix.normalize(target.slice(1)) : path.posix.normalize(path.posix.join(path.posix.dirname(slide), target));
  if (!member.startsWith("ppt/media/") || member.startsWith("../") || path.posix.isAbsolute(member)) throw new SlidePictureReplacementError("invalid_package");
  return member;
}
async function readXml(zip: JSZip, member: string, budget: ReturnType<typeof createZipBudget>): Promise<XmlDocument> {
  const entry = zip.file(member);
  if (!entry || entry.dir) throw new SlidePictureReplacementError("invalid_package");
  return parseXml((await readOfficeMember(entry, member, budget)).toString("utf8"));
}

export async function replaceUploadedSlidePicture(
  packageBytes: Buffer,
  slideNumber: number,
  objectId: string,
  mimeType: unknown,
  base64: unknown
): Promise<{ bytes: Buffer; changedMembers: string[] }> {
  try {
    const image = await decodeImage(mimeType, base64);
    const slides = await inventorySlides(packageBytes);
    const slide = slides[slideNumber - 1];
    if (!slide) throw new SlidePictureReplacementError("invalid_slide");
    const context = await inspectSlideObjects(packageBytes, slideNumber);
    const target = context.objects.find((object) => object.id === objectId && object.kind === "picture" && object.editable);
    if (!target) throw new SlidePictureReplacementError("invalid_picture");

    const zip = await JSZip.loadAsync(packageBytes);
    assertContainerWithinCaps(zip, "office-file");
    const budget = createZipBudget();
    const slideRelMember = relMemberForSlide(slide.id);
    const slideRelDoc = await readXml(zip, slideRelMember, budget);
    const relationships = all(slideRelDoc, REL, "Relationship");
    const ids = relationships.map((item) => item.getAttribute("Id") ?? "");
    if (new Set(ids).size !== ids.length || ids.some((id) => !id)) throw new SlidePictureReplacementError("invalid_package");

    const slideXml = await readXml(zip, slide.id, budget);
    const slideTree = all(slideXml, P, "spTree")[0];
    if (!slideTree) throw new SlidePictureReplacementError("invalid_package");
    const digest = createHash("sha256").update(packageBytes).digest("hex").slice(0, 20);
    let picture: XmlElement | undefined;
    for (const candidate of all(slideTree, P, "pic")) {
      const nonVisual = all(candidate, P, "cNvPr")[0];
      if (!nonVisual) continue;
      const id = nonVisual.getAttribute("id") ?? "";
      if (`${digest}:s${slideNumber}:o${id}:picture` === objectId) { picture = candidate; break; }
    }
    if (!picture) throw new SlidePictureReplacementError("invalid_picture");
    const blip = all(picture, A, "blip")[0];
    const oldRelId = blip?.getAttributeNS(R, "embed") ?? "";
    const oldRel = relationships.find((item) => item.getAttribute("Id") === oldRelId);
    if (!blip || !oldRel || (oldRel.getAttribute("TargetMode") ?? "").toLowerCase() === "external" || !(oldRel.getAttribute("Type") ?? "").endsWith("/image")) throw new SlidePictureReplacementError("invalid_picture");
    resolveMediaTarget(slide.id, oldRel.getAttribute("Target") ?? "");

    const assetHash = createHash("sha256").update(image.bytes).digest("hex");
    let member = `ppt/media/slide-editor-${assetHash.slice(0, 24)}.${image.extension}`;
    let suffix = 0;
    while (zip.file(member)) {
      const existing = await zip.file(member)!.async("nodebuffer");
      if (existing.equals(image.bytes)) break;
      suffix += 1;
      member = `ppt/media/slide-editor-${assetHash.slice(0, 24)}-${suffix}.${image.extension}`;
    }
    const contentTypesMember = "[Content_Types].xml";
    const contentTypes = await readXml(zip, contentTypesMember, budget);
    const contentTypesRoot = contentTypes.documentElement;
    if (!contentTypesRoot || contentTypesRoot.namespaceURI !== CT || contentTypesRoot.localName !== "Types") throw new SlidePictureReplacementError("invalid_package");
    const extension = image.extension;
    const defaults = all(contentTypes, CT, "Default").filter((item) => (item.getAttribute("Extension") ?? "").toLowerCase() === extension);
    if (defaults.some((item) => item.getAttribute("ContentType") !== image.mimeType)) throw new SlidePictureReplacementError("content_type_conflict");
    if (defaults.length === 0) {
      const defaultNode = contentTypes.createElementNS(CT, "Default");
      defaultNode.setAttribute("Extension", extension);
      defaultNode.setAttribute("ContentType", image.mimeType);
      contentTypesRoot.appendChild(defaultNode);
    }

    let newRelId = "rIdSlideEditor1";
    let idIndex = 1;
    while (ids.includes(newRelId)) { idIndex += 1; newRelId = `rIdSlideEditor${idIndex}`; }
    const newRel = slideRelDoc.createElementNS(REL, "Relationship");
    newRel.setAttribute("Id", newRelId);
    newRel.setAttribute("Type", oldRel.getAttribute("Type") ?? "");
    newRel.setAttribute("Target", path.posix.relative(path.posix.dirname(slide.id), member));
    const relationshipsRoot = slideRelDoc.documentElement;
    if (!relationshipsRoot || relationshipsRoot.namespaceURI !== REL || relationshipsRoot.localName !== "Relationships") throw new SlidePictureReplacementError("invalid_package");
    relationshipsRoot.appendChild(newRel);
    blip.setAttributeNS(R, "r:embed", newRelId);

    zip.file(member, image.bytes);
    zip.file(slide.id, new XMLSerializer().serializeToString(slideXml));
    zip.file(slideRelMember, new XMLSerializer().serializeToString(slideRelDoc));
    zip.file(contentTypesMember, new XMLSerializer().serializeToString(contentTypes));
    const output = Buffer.from(await zip.generateAsync({ type: "nodebuffer" }));
    return { bytes: output, changedMembers: [slide.id, slideRelMember, contentTypesMember, member] };
  } catch (error) {
    if (error instanceof SlidePictureReplacementError) throw error;
    if (error instanceof ZipCapError) throw new SlidePictureReplacementError("invalid_package");
    throw new SlidePictureReplacementError("invalid_package");
  }
}
