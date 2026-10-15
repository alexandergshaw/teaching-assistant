import JSZip from "jszip";
import { SaxesParser } from "saxes";
import { createHash } from "node:crypto";
import { parseOfficeParagraphs } from "@/lib/office-edit";
import { extractTextFromBuffer } from "@/lib/office-extract";
import { buildDocxFromPlainText } from "@/lib/docx";
import { assertContainerWithinCaps, createZipBudget, readOfficeMember } from "@/lib/zip-caps";
import { checkWireBudget } from "@/lib/upload-budget";
import { MAX_TEXT, boundedName, isXmlText, refuse, type DocumentUpload, type DocumentSourceKind } from "./types";

/** Strict syntax/namespace validation; DTDs and external entities are never accepted. */
export function assertDocumentXml(xml: string, wordDocument = false): void {
  try {
    const parser = new SaxesParser({ xmlns: true, defaultXMLVersion: "1.0", forceXMLVersion: true });
    let depth = 0;
    let bodyCount = 0;
    parser.on("error", () => { throw new Error("invalid_xml"); });
    parser.on("doctype", () => { throw new Error("unsupported_dtd"); });
    parser.on("xmldecl", (declaration) => { if (declaration.version !== "1.0") throw new Error("unsupported_xml_version"); });
    parser.on("opentag", (tag) => {
      if (wordDocument && depth === 0 && (tag.name !== "w:document" || tag.uri !== "http://schemas.openxmlformats.org/wordprocessingml/2006/main")) throw new Error("invalid_word_root");
      if (wordDocument && depth === 1 && tag.name === "w:body" && tag.uri === "http://schemas.openxmlformats.org/wordprocessingml/2006/main") bodyCount += 1;
      depth += 1;
    });
    parser.on("closetag", () => { depth -= 1; });
    parser.write(xml).close();
    if (wordDocument && bodyCount !== 1) throw new Error("invalid_word_body");
  } catch { refuse("invalid_file", "That Word document contains invalid XML and cannot be opened. Save a valid DOCX and upload it again."); }
}
async function readDocumentXml(entry: JSZip.JSZipObject, budget: ReturnType<typeof createZipBudget>): Promise<string> {
  const bytes = await readOfficeMember(entry, entry.name, budget);
  try { return new TextDecoder("utf-8", { fatal: true }).decode(bytes); }
  catch { refuse("invalid_file", "That Word document contains unreadable XML text. Save a valid DOCX and upload it again."); }
}
export function decodeDocumentBase64(base64: unknown): Buffer {
  if (typeof base64 !== "string" || !base64 || !checkWireBudget(base64.length, "That document").ok) refuse("file_size", "Choose a smaller document (under 2.6 MB).");
  if (base64.length % 4 !== 0 || !/^[A-Za-z0-9+/]+={0,2}$/.test(base64)) refuse("invalid_file", "The document encoding is invalid. Upload the file again.");
  const bytes = Buffer.from(base64, "base64");
  if (bytes.toString("base64") !== base64) refuse("invalid_file", "The document encoding is invalid. Upload the file again.");
  return bytes;
}
export function outputBase64(bytes: Buffer): string {
  const base64 = bytes.toString("base64");
  if (!checkWireBudget(base64.length, "That document").ok) refuse("output_size", "The resulting document is too large. Use a smaller source or shorter field values.");
  return base64;
}
export async function extractDocument(upload: DocumentUpload) {
  const fileName = boundedName(upload?.fileName, "file name");
  const source = decodeDocumentBase64(upload?.base64);
  const sourceKind: DocumentSourceKind = /\.docx$/i.test(fileName) ? "docx" : /\.pdf$/i.test(fileName) ? "pdf" : refuse("file_type", "Upload a Word .docx or text-based .pdf file.");
  let docx: Buffer;
  if (sourceKind === "docx") {
    if (source.length < 4 || source.readUInt32LE(0) !== 0x04034b50) refuse("invalid_file", "That file is not a Word DOCX package.");
    let zip: JSZip;
    try { zip = await JSZip.loadAsync(source); } catch { refuse("invalid_file", "That Word document is damaged or unreadable."); }
    assertContainerWithinCaps(zip, "office-file");
    const member = zip.file("[Content_Types].xml");
    if (!member || !zip.file("word/document.xml")) refuse("invalid_file", "That file is not a Word DOCX package.");
    const contentTypes = await readDocumentXml(member, createZipBudget({ maxMemberDeclaredBytes: 262144 }));
    assertDocumentXml(contentTypes);
    if (/macroEnabled|vbaProject/i.test(contentTypes) || Object.keys(zip.files).some((p) => /vbaProject/i.test(p))) refuse("file_type", "Macro-enabled documents are not supported. Save a plain DOCX first.");
    if (!/<Override\b(?=[^>]*PartName=["']\/word\/document\.xml["'])(?=[^>]*ContentType=["']application\/vnd\.openxmlformats-officedocument\.wordprocessingml\.document\.main\+xml["'])[^>]*\/?\s*>/.test(contentTypes)) refuse("invalid_file", "That file is not a plain Word DOCX package.");
    const main = zip.file("word/document.xml")!;
    const xml = await readDocumentXml(main, createZipBudget());
    assertDocumentXml(xml, true);
    const xmlBudget = createZipBudget();
    for (const entry of Object.values(zip.files)) {
      if (!entry.dir && /(?:\.xml|\.rels)$/i.test(entry.name) && entry.name !== main.name && entry.name !== member.name) {
        const text = await readDocumentXml(entry, xmlBudget);
        assertDocumentXml(text);
      }
    }
    if (/<w:(?:altChunk|ins|del|sdt|fldSimple)\b|<w:fldChar\b/.test(xml)) refuse("unsupported_source", "This document contains unsupported fields, content controls or tracked changes. Accept changes and use plain paragraphs first.");
    docx = source;
  } else {
    if (source.subarray(0, 5).toString("ascii") !== "%PDF-") refuse("invalid_file", "That file is not a readable PDF.");
    let text: string | null;
    try { text = await extractTextFromBuffer("source.pdf", source); } catch { refuse("unreadable_pdf", "That PDF is encrypted or unreadable. Upload an unlocked text-based PDF or DOCX."); }
    if (!text?.trim()) refuse("unreadable_pdf", "No readable text was found. Scanned or image-only PDFs need OCR before upload.");
    if (!isXmlText(text)) refuse("invalid_file", "That PDF contains text that cannot be represented in a Word document.");
    if (text.length > MAX_TEXT) refuse("text_size", "Choose a smaller document with at most 24,000 text characters.");
    docx = Buffer.from(await buildDocxFromPlainText(text));
  }
  const paragraphs = await parseOfficeParagraphs("docx", docx);
  if (!paragraphs.length) refuse("no_text", "No readable document paragraphs were found.");
  if (paragraphs.length > 1000 || JSON.stringify(paragraphs.map(({ id, text }) => ({ id, text }))).length > MAX_TEXT) refuse("text_size", "Choose a smaller document with at most 24,000 extracted text characters.");
  outputBase64(docx);
  return { fileName, sourceKind, source, docx, paragraphs, sourceSha256: createHash("sha256").update(source).digest("hex") };
}


