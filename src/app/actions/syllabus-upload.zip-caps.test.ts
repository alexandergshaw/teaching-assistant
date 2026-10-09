// DECOMPRESS-CAP-HARDENING W3, ruling B2: extractTextFromFile is private and
// swallows parse failures into a placeholder, so the oversize cap is pinned by
// source structure: it must sit INSIDE the try, BEFORE the parse.
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";

describe("syllabus-upload pdf byte cap (DECOMPRESS-CAP-HARDENING W3)", () => {
  it("census: the cap precedes OfficeParser.parseOffice inside the pdf try block", () => {
    const src = readFileSync(new URL("./syllabus-upload.ts", import.meta.url), "utf-8");
    const fn = src.indexOf("async function extractTextFromFile(");
    const tryAt = src.indexOf("try {", fn);
    const guard = src.indexOf("assertBytesWithinMemberCap(buffer.byteLength", fn);
    const parse = src.indexOf("OfficeParser.parseOffice(", fn);
    const catchAt = src.indexOf("} catch", fn);
    expect(fn).toBeGreaterThan(-1);
    expect(guard).toBeGreaterThan(tryAt);
    expect(parse).toBeGreaterThan(guard);
    expect(catchAt).toBeGreaterThan(parse);
  });
});
