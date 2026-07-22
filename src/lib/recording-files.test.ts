import { describe, it, expect } from "vitest";
import { stripMatchingExt } from "./recording-files";

describe("stripMatchingExt", () => {
  it('removes matching extension: "a.docx" + "docx" -> "a"', () => {
    expect(stripMatchingExt("a.docx", "docx")).toBe("a");
  });

  it('removes matching extension case-insensitively: "a.DOCX" + "docx" -> "a"', () => {
    expect(stripMatchingExt("a.DOCX", "docx")).toBe("a");
  });

  it('does not remove when extension is absent: "a" + "docx" -> "a"', () => {
    expect(stripMatchingExt("a", "docx")).toBe("a");
  });

  it('removes only one layer: "a.md.md" + "md" -> "a.md"', () => {
    expect(stripMatchingExt("a.md.md", "md")).toBe("a.md");
  });

  it('removes outer extension: "a.tar.gz" + "gz" -> "a.tar"', () => {
    expect(stripMatchingExt("a.tar.gz", "gz")).toBe("a.tar");
  });

  it('returns unchanged when ext is empty', () => {
    expect(stripMatchingExt("a.docx", "")).toBe("a.docx");
  });

  it("returns unchanged when name is empty", () => {
    expect(stripMatchingExt("", "docx")).toBe("");
  });
});
