// PPT-TEMPLATE-UPLOAD-PLACE W1: the accept/reject matrix for assertPptxContainer
// (docs/ppt-template-upload-security.md section 1.1, rows 1-13), real in-memory
// jszip fixtures, plus the zip-cap pins (S-CAP-1..3): the capped open, a
// lying-central-directory bomb, and a source-text pin that no member is
// decompressed outside the bounded reader.
import { describe, it, expect } from "vitest";
import JSZip from "jszip";
import { readFileSync } from "node:fs";
import path from "node:path";
import { ZipCapError } from "@/lib/zip-caps";
import {
  MACRO_ENABLED_MESSAGE,
  NOT_PPTX_MESSAGE,
  OTHER_OFFICE_MESSAGE,
  PptxValidationError,
  UNREADABLE_PPTX_MESSAGE,
  assertPptxContainer,
} from "./pptx-validate";

const PPTX_MAIN = "application/vnd.openxmlformats-officedocument.presentationml.presentation.main+xml";
const DOCX_MAIN = "application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml";
const XLSX_MAIN = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml";
const PPTM_MAIN = "application/vnd.ms-powerpoint.presentation.macroEnabled.main+xml";

const SLIDE_XML =
  '<p:sld><p:cSld><p:spTree><p:sp><p:txBody><a:p><a:r><a:t>Hello title</a:t></a:r></a:p></p:txBody></p:sp></p:spTree></p:cSld></p:sld>';

function contentTypes(overrides: string, prefix = ""): string {
  return (
    `${prefix}<?xml version="1.0" encoding="UTF-8" standalone="yes"?>` +
    `<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">` +
    `<Default Extension="xml" ContentType="application/xml"/>${overrides}</Types>`
  );
}

function override(part: string, type: string): string {
  return `<Override PartName="${part}" ContentType="${type}"/>`;
}

const PPTX_TYPES = contentTypes(override("/ppt/presentation.xml", PPTX_MAIN) + override("/ppt/slides/slide1.xml", "application/x"));

async function zipOf(members: Record<string, string>): Promise<Uint8Array> {
  const zip = new JSZip();
  for (const [name, data] of Object.entries(members)) zip.file(name, data, { createFolders: false });
  return zip.generateAsync({ type: "uint8array", compression: "DEFLATE" });
}

function realPptx(overrides: Record<string, string> = {}): Promise<Uint8Array> {
  return zipOf({
    "[Content_Types].xml": PPTX_TYPES,
    "ppt/presentation.xml": "<p:presentation/>",
    "ppt/slides/slide1.xml": SLIDE_XML,
    ...overrides,
  });
}

/** Overwrite the declared uncompressed size of one CENTRAL-directory record. */
function patchDeclaredSize(archive: Uint8Array, entryName: string, uncompressed: number): void {
  const view = new DataView(archive.buffer, archive.byteOffset, archive.byteLength);
  let eocd = -1;
  for (let i = archive.length - 22; i >= 0; i -= 1) {
    if (view.getUint32(i, true) === 0x06054b50) {
      eocd = i;
      break;
    }
  }
  if (eocd < 0) throw new Error("no end-of-central-directory record");
  let cursor = view.getUint32(eocd + 16, true);
  const count = view.getUint16(eocd + 10, true);
  const decoder = new TextDecoder();
  for (let n = 0; n < count; n += 1) {
    const nameLength = view.getUint16(cursor + 28, true);
    const extraLength = view.getUint16(cursor + 30, true);
    const commentLength = view.getUint16(cursor + 32, true);
    const name = decoder.decode(archive.subarray(cursor + 46, cursor + 46 + nameLength));
    if (name === entryName) {
      view.setUint32(cursor + 24, uncompressed, true);
      return;
    }
    cursor += 46 + nameLength + extraLength + commentLength;
  }
  throw new Error(`entry ${entryName} not found`);
}

async function rejectionOf(archive: Uint8Array | Buffer): Promise<unknown> {
  try {
    await assertPptxContainer(Buffer.from(archive));
  } catch (err) {
    return err;
  }
  return null;
}

async function expectRefused(archive: Uint8Array | Buffer, message: string): Promise<void> {
  const err = await rejectionOf(archive);
  expect(err).toBeInstanceOf(PptxValidationError);
  expect((err as Error).message).toBe(message);
}

describe("assertPptxContainer accept/reject matrix", () => {
  it("row 1: accepts a genuine .pptx", async () => {
    await expect(assertPptxContainer(Buffer.from(await realPptx()))).resolves.toBeUndefined();
  });

  it("row 2: rejects a .docx renamed .pptx as a different Office file", async () => {
    const docx = await zipOf({
      "[Content_Types].xml": contentTypes(override("/word/document.xml", DOCX_MAIN)),
      "word/document.xml": "<w:document/>",
    });
    await expectRefused(docx, OTHER_OFFICE_MESSAGE);
    expect(OTHER_OFFICE_MESSAGE).toBe("That is a different Office file, not a PowerPoint.");
  });

  it("row 3: rejects an .xlsx renamed .pptx as a different Office file", async () => {
    const xlsx = await zipOf({
      "[Content_Types].xml": contentTypes(override("/xl/workbook.xml", XLSX_MAIN)),
      "xl/workbook.xml": "<workbook/>",
    });
    await expectRefused(xlsx, OTHER_OFFICE_MESSAGE);
  });

  it("row 4: rejects a legacy .ppt OLE compound file", async () => {
    const ole = Buffer.concat([Buffer.from([0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1]), Buffer.alloc(512)]);
    await expectRefused(ole, NOT_PPTX_MESSAGE);
  });

  it("row 5: rejects a non-Office zip (no content types)", async () => {
    await expectRefused(await zipOf({ "readme.txt": "hello" }), NOT_PPTX_MESSAGE);
  });

  it("row 6: rejects non-zip bytes (text, PDF, exe) without opening a zip", async () => {
    await expectRefused(Buffer.from("just some text"), NOT_PPTX_MESSAGE);
    await expectRefused(Buffer.from("%PDF-1.7 ..."), NOT_PPTX_MESSAGE);
    await expectRefused(Buffer.from([0x4d, 0x5a, 0x90, 0x00, 0x03]), NOT_PPTX_MESSAGE);
    await expectRefused(Buffer.alloc(0), NOT_PPTX_MESSAGE);
  });

  it("row 7: rejects a truncated or corrupt zip with worded text, not the library message", async () => {
    const corrupt = Buffer.concat([Buffer.from([0x50, 0x4b, 0x03, 0x04]), Buffer.from("garbage that is not a zip at all")]);
    await expectRefused(corrupt, UNREADABLE_PPTX_MESSAGE);
    const whole = Buffer.from(await realPptx());
    const truncated = whole.subarray(0, Math.floor(whole.length / 2));
    const err = await rejectionOf(truncated);
    expect(err).toBeInstanceOf(PptxValidationError);
    expect((err as Error).message).not.toMatch(/central directory/i);
  });

  it("row 8: rejects a macro-enabled presentation", async () => {
    const pptm = await zipOf({
      "[Content_Types].xml": contentTypes(override("/ppt/presentation.xml", PPTM_MAIN)),
      "ppt/presentation.xml": "<p:presentation/>",
    });
    await expectRefused(pptm, MACRO_ENABLED_MESSAGE);
    expect(MACRO_ENABLED_MESSAGE).toMatch(/macro-enabled/i);
    expect(MACRO_ENABLED_MESSAGE).toMatch(/not accepted/i);
  });

  it("row 9: refuses a lying-central-directory bomb with a ZipCapError", async () => {
    const archive = await realPptx();
    patchDeclaredSize(archive, "ppt/slides/slide1.xml", 0x7fffffff);
    const err = await rejectionOf(archive);
    expect(err).toBeInstanceOf(ZipCapError);
  });

  it("row 10: rejects a DOCTYPE or ENTITY in the content types", async () => {
    const withDoctype = await realPptx({
      "[Content_Types].xml": contentTypes(
        override("/ppt/presentation.xml", PPTX_MAIN),
        '<!DOCTYPE Types [<!ENTITY xxe SYSTEM "file:///etc/passwd">]>'
      ),
    });
    await expectRefused(withDoctype, NOT_PPTX_MESSAGE);
    const withEntity = await realPptx({
      "[Content_Types].xml": contentTypes(override("/ppt/presentation.xml", PPTX_MAIN), '<!ENTITY a "b">'),
    });
    await expectRefused(withEntity, NOT_PPTX_MESSAGE);
  });

  it("row 11: rejects decoys (pptx type in a comment, or on a different part)", async () => {
    const commentDecoy = await zipOf({
      "[Content_Types].xml": contentTypes(
        `<!-- ${override("/ppt/presentation.xml", PPTX_MAIN)} -->${override("/word/document.xml", DOCX_MAIN)}`
      ),
      "word/document.xml": "<w:document/>",
      "ppt/presentation.xml": "<p:presentation/>",
    });
    await expectRefused(commentDecoy, OTHER_OFFICE_MESSAGE);

    const partDecoy = await realPptx({
      "[Content_Types].xml": contentTypes(override("/ppt/other.xml", PPTX_MAIN)),
    });
    await expectRefused(partDecoy, NOT_PPTX_MESSAGE);

    const substringDecoy = await realPptx({
      "[Content_Types].xml": contentTypes(override("/ppt/presentation.xml", `${PPTX_MAIN}.evil`)),
    });
    await expectRefused(substringDecoy, NOT_PPTX_MESSAGE);
  });

  it("row 12: rejects a package whose declared presentation part is missing", async () => {
    const missing = await zipOf({
      "[Content_Types].xml": PPTX_TYPES,
      "ppt/slides/slide1.xml": SLIDE_XML,
    });
    await expectRefused(missing, NOT_PPTX_MESSAGE);
  });

  it("row 13: refuses an oversize [Content_Types].xml member with a ZipCapError", async () => {
    const padded = await realPptx({
      "[Content_Types].xml": contentTypes(
        override("/ppt/presentation.xml", PPTX_MAIN) + `<!-- ${"x".repeat(300 * 1024)} -->`
      ),
    });
    const err = await rejectionOf(padded);
    expect(err).toBeInstanceOf(ZipCapError);
    expect((err as ZipCapError).code).toBe("member-bytes");
  });

  it("accepts a content-types member just under the 256KB cap", async () => {
    const ok = await realPptx({
      "[Content_Types].xml": contentTypes(
        override("/ppt/presentation.xml", PPTX_MAIN) + `<!-- ${"x".repeat(200 * 1024)} -->`
      ),
    });
    await expect(assertPptxContainer(Buffer.from(ok))).resolves.toBeUndefined();
  });
});

describe("pptx-validate.ts source pins (S-CAP-1, S-CAP-2, XXE-safe)", () => {
  const source = readFileSync(path.join(process.cwd(), "src", "lib", "decks", "pptx-validate.ts"), "utf8");
  const lines = source.split("\n");

  it("opens the zip exactly once and runs the container pre-flight right after it", () => {
    const loadIdx = lines.map((l, i) => (l.includes("JSZip.loadAsync(") ? i : -1)).filter((i) => i >= 0);
    expect(loadIdx).toHaveLength(1);
    const after = lines.slice(loadIdx[0], loadIdx[0] + 8).join("\n");
    expect(after).toContain("assertContainerWithinCaps(");
  });

  it("decompresses no member directly (every read goes through the bounded reader)", () => {
    expect(source).not.toContain(".async(");
    expect(source).toContain("readOfficeMember(");
  });

  it("imports no XML parser", () => {
    expect(source).not.toMatch(/xml2js|fast-xml|xmldom|DOMParser/);
  });
});
