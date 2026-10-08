import JSZip from "jszip";
import { describe, expect, it } from "vitest";
import {
  OFFICE_MAX_ENTRIES,
  ZipCapError,
  assertContainerWithinCaps,
  createZipBudget,
  readOfficeMember,
} from "./zip-caps";

async function zipOf(files: Record<string, string>): Promise<JSZip> {
  const zip = new JSZip();
  for (const [name, body] of Object.entries(files)) zip.file(name, body);
  const bytes = await zip.generateAsync({ type: "nodebuffer", compression: "DEFLATE" });
  return JSZip.loadAsync(bytes);
}

describe("assertContainerWithinCaps", () => {
  it("accepts an ordinary container", async () => {
    const zip = await zipOf({ "word/document.xml": "<w:p>hi</w:p>", "word/styles.xml": "<s/>" });
    expect(() => assertContainerWithinCaps(zip, "a.docx")).not.toThrow();
  });

  it("refuses a member whose declared size is over the member cap", async () => {
    const zip = await zipOf({ "word/document.xml": "x".repeat(2048) });
    const limits = { ...createZipBudget().limits, maxMemberDeclaredBytes: 1024 };
    expect(() => assertContainerWithinCaps(zip, "a.docx", [], limits)).toThrow(ZipCapError);
    try {
      assertContainerWithinCaps(zip, "a.docx", [], limits);
    } catch (error) {
      expect((error as ZipCapError).code).toBe("member-bytes");
      expect((error as Error).message.startsWith("Refused: ")).toBe(true);
    }
  });

  it("refuses when the container total passes its cap", async () => {
    const zip = await zipOf({ "a.xml": "x".repeat(600), "b.xml": "y".repeat(600) });
    expect(() =>
      assertContainerWithinCaps(zip, "a.docx", [], undefined, { maxEntries: 10, maxDeclaredBytes: 1000 })
    ).toThrow(/Refused: /);
  });

  it("refuses too many entries", async () => {
    const zip = await zipOf({ "a.xml": "1", "b.xml": "2", "c.xml": "3" });
    expect(OFFICE_MAX_ENTRIES).toBeGreaterThan(3);
    expect(() =>
      assertContainerWithinCaps(zip, "a.docx", [], undefined, { maxEntries: 2, maxDeclaredBytes: 1e9 })
    ).toThrow(ZipCapError);
  });

  it("fails closed on a member with no declared size", async () => {
    const zip = await zipOf({ "word/document.xml": "hi" });
    const entry = zip.files["word/document.xml"] as unknown as { _data?: unknown };
    entry._data = undefined;
    expect(() => assertContainerWithinCaps(zip, "a.docx")).toThrow(/no readable size/);
  });
});

describe("readOfficeMember", () => {
  it("reads an honest member and charges the shared budget", async () => {
    const zip = await zipOf({ "word/document.xml": "hello" });
    const budget = createZipBudget();
    const bytes = await readOfficeMember(zip.files["word/document.xml"], "a.docx/word/document.xml", budget);
    expect(bytes.toString("utf-8")).toBe("hello");
    expect(budget.declaredBytes).toBe(5);
  });

  it("refuses when the shared budget is exhausted", async () => {
    const zip = await zipOf({ "word/document.xml": "hello" });
    const budget = createZipBudget({ cumulativeBytes: 3 });
    await expect(
      readOfficeMember(zip.files["word/document.xml"], "a.docx/word/document.xml", budget)
    ).rejects.toBeInstanceOf(ZipCapError);
  });
});
