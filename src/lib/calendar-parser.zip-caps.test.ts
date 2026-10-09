// DECOMPRESS-CAP-HARDENING W3: extractPdfText must refuse an oversize buffer
// before OfficeParser ever sees it.
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { extractPdfText } from "./calendar-parser";
import { ZIP_MAX_MEMBER_DECLARED_BYTES, ZipCapError } from "./zip-caps";

describe("calendar-parser pdf byte cap (DECOMPRESS-CAP-HARDENING W3)", () => {
  it("rejects an oversize buffer with a ZipCapError before parsing", async () => {
    const big = Buffer.alloc(ZIP_MAX_MEMBER_DECLARED_BYTES + 1);
    await expect(extractPdfText(big)).rejects.toBeInstanceOf(ZipCapError);
    await expect(extractPdfText(big)).rejects.toThrow(/^Refused: /);
  });

  it("census: the byte cap precedes the parse inside extractPdfText", () => {
    const src = readFileSync(new URL("./calendar-parser.ts", import.meta.url), "utf-8");
    const fn = src.indexOf("export async function extractPdfText(");
    const guard = src.indexOf("assertBytesWithinMemberCap(buffer.byteLength", fn);
    const parse = src.indexOf("OfficeParser.parseOffice(", fn);
    expect(fn).toBeGreaterThan(-1);
    expect(guard).toBeGreaterThan(fn);
    expect(parse).toBeGreaterThan(guard);
  });
});
