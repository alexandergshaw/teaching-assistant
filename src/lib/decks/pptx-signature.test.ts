import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import path from "node:path";
import {
  CONTENT_TYPES_MAX_BYTES,
  PPTX_HEAD_BYTES,
  PPTX_MAIN_CONTENT_TYPES,
  classifyContentTypes,
  isPptxContentTypes,
  sniffZipHead,
} from "./pptx-signature";

const PPTX_MAIN = "application/vnd.openxmlformats-officedocument.presentationml.presentation.main+xml";
const DOCX_MAIN = "application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml";
const XLSX_MAIN = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml";
const PPTM_MAIN = "application/vnd.ms-powerpoint.presentation.macroEnabled.main+xml";

function types(overrides: string): string {
  return (
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>` +
    `<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">` +
    `<Default Extension="xml" ContentType="application/xml"/>${overrides}</Types>`
  );
}

function override(part: string, type: string): string {
  return `<Override PartName="${part}" ContentType="${type}"/>`;
}

describe("sniffZipHead", () => {
  it("accepts the zip local-file-header magic", () => {
    expect(sniffZipHead(new Uint8Array([0x50, 0x4b, 0x03, 0x04, 0, 0]))).toBe(true);
  });
  it("rejects an OLE compound (.ppt) head", () => {
    expect(sniffZipHead(new Uint8Array([0xd0, 0xcf, 0x11, 0xe0]))).toBe(false);
  });
  it("rejects the empty-archive and spanned markers", () => {
    expect(sniffZipHead(new Uint8Array([0x50, 0x4b, 0x05, 0x06]))).toBe(false);
    expect(sniffZipHead(new Uint8Array([0x50, 0x4b, 0x07, 0x08]))).toBe(false);
  });
  it("rejects text, a short head and an empty head", () => {
    expect(sniffZipHead(new TextEncoder().encode("%PDF-1.7"))).toBe(false);
    expect(sniffZipHead(new Uint8Array([0x50, 0x4b, 0x03]))).toBe(false);
    expect(sniffZipHead(new Uint8Array(0))).toBe(false);
  });
  it("reads only the head size it declares", () => {
    expect(PPTX_HEAD_BYTES).toBe(4);
  });
});

describe("isPptxContentTypes / classifyContentTypes", () => {
  it("accepts the presentation main part and nothing else in a closed set", () => {
    expect(PPTX_MAIN_CONTENT_TYPES).toEqual([PPTX_MAIN]);
    const xml = types(override("/ppt/presentation.xml", PPTX_MAIN));
    expect(isPptxContentTypes(xml)).toBe(true);
    expect(classifyContentTypes(xml)).toBe("pptx");
  });

  it("accepts either attribute order and single-quoted attributes", () => {
    const reversed = types(`<Override ContentType="${PPTX_MAIN}" PartName="/ppt/presentation.xml"/>`);
    expect(isPptxContentTypes(reversed)).toBe(true);
    const single = types(`<Override PartName='/ppt/presentation.xml' ContentType='${PPTX_MAIN}'/>`);
    expect(isPptxContentTypes(single)).toBe(true);
  });

  it("rejects a docx main part as a different Office file", () => {
    const xml = types(override("/word/document.xml", DOCX_MAIN));
    expect(isPptxContentTypes(xml)).toBe(false);
    expect(classifyContentTypes(xml)).toBe("other-office");
  });

  it("rejects an xlsx main part as a different Office file", () => {
    const xml = types(override("/xl/workbook.xml", XLSX_MAIN));
    expect(classifyContentTypes(xml)).toBe("other-office");
  });

  it("rejects a macro-enabled main part with its own class", () => {
    const xml = types(override("/ppt/presentation.xml", PPTM_MAIN));
    expect(isPptxContentTypes(xml)).toBe(false);
    expect(classifyContentTypes(xml)).toBe("macro-enabled");
  });

  it("rejects text with no declaration at all", () => {
    expect(classifyContentTypes("hello")).toBe("not-pptx");
    expect(classifyContentTypes("")).toBe("not-pptx");
  });

  it("compares by equality, never by substring", () => {
    expect(isPptxContentTypes(types(override("/ppt/presentation.xml", `${PPTX_MAIN}.evil`)))).toBe(false);
    expect(isPptxContentTypes(types(override("/ppt/presentation.xml", `x${PPTX_MAIN}`)))).toBe(false);
    expect(isPptxContentTypes(types(override("/ppt/presentation.xml", PPTX_MAIN.toUpperCase())))).toBe(false);
  });

  it("ignores the pptx type when it sits inside an XML comment", () => {
    const xml = types(`<!-- ${override("/ppt/presentation.xml", PPTX_MAIN)} -->${override("/word/document.xml", DOCX_MAIN)}`);
    expect(isPptxContentTypes(xml)).toBe(false);
    expect(classifyContentTypes(xml)).toBe("other-office");
  });

  it("ignores the pptx type on an Override whose part is not the presentation", () => {
    const xml = types(override("/ppt/other.xml", PPTX_MAIN));
    expect(isPptxContentTypes(xml)).toBe(false);
  });

  it("refuses an ambiguous double declaration of the main part", () => {
    const xml = types(override("/ppt/presentation.xml", PPTX_MAIN) + override("/ppt/presentation.xml", PPTX_MAIN));
    expect(isPptxContentTypes(xml)).toBe(false);
  });

  it("refuses any DOCTYPE or ENTITY declaration", () => {
    const body = types(override("/ppt/presentation.xml", PPTX_MAIN));
    expect(isPptxContentTypes(`<!DOCTYPE Types [<!ENTITY x "y">]>${body}`)).toBe(false);
    expect(isPptxContentTypes(`<!ENTITY x "y">${body}`)).toBe(false);
    expect(classifyContentTypes(`<!DOCTYPE Types>${body}`)).toBe("not-pptx");
  });

  it("declares a 256KB member cap", () => {
    expect(CONTENT_TYPES_MAX_BYTES).toBe(262144);
  });
});

describe("pptx-signature.ts source shape", () => {
  const source = readFileSync(path.join(process.cwd(), "src", "lib", "decks", "pptx-signature.ts"), "utf8");
  it("imports nothing (pure, client-safe, no XML parser)", () => {
    expect(source).not.toMatch(/^\s*import\s/m);
    expect(source).not.toMatch(/xml2js|fast-xml|xmldom|DOMParser/);
  });
});
