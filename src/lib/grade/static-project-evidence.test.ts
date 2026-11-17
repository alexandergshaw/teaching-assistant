import { describe, expect, it } from "vitest";
import { stripUnneededRawBase64 } from "@/app/components/grading/incrementalRunPlan";
import { restoreStaticTextEvidence } from "./static-project-evidence";
const csv = "name,value\nSynthetic,$&\n", rawBase64 = Buffer.from(csv).toString("base64");
const file = { name: "data.csv", extension: "csv", mimeType: "text/csv", previewContent: csv, previewTruncated: false, rawBase64 };
const entry = { student: "Synthetic", content: `header\n${csv}\nfooter`, mergedFileCount: 1, submittedFiles: [file], staticOnly: true as const };
describe("static CSV evidence", () => {
  it("restores the complete original text and preserves the original file bytes", () => {
    const compact = stripUnneededRawBase64(entry); expect(compact.content).not.toContain(csv); expect(compact.submittedFiles[0].rawBase64).toBe(rawBase64);
    expect(restoreStaticTextEvidence(compact)?.content).toBe(entry.content); expect(entry.content).toContain(csv);
  });
  it("restores identical files independently without losing or duplicating their content", () => {
    const duplicate = { ...entry, content: `first\n${csv}\nsecond\n${csv}\nthird\n${csv}`, submittedFiles: [file, { ...file, name: "copy/data.csv" }, { ...file, name: "debug/data.csv" }] };
    const compact = stripUnneededRawBase64(duplicate);
    expect(new Set(compact.submittedFiles.map(item => item.staticTextMarker)).size).toBe(3);
    expect(restoreStaticTextEvidence(compact)?.content).toBe(duplicate.content);
    expect(compact.submittedFiles.map(item => item.rawBase64)).toEqual([rawBase64, rawBase64, rawBase64]);
  });
  it("refuses ambiguous extra occurrences instead of changing evidence", () => {
    const ambiguous = { ...entry, content: `${csv}\n${csv}` };
    expect(restoreStaticTextEvidence(stripUnneededRawBase64(ambiguous))).toBeNull();
  });
  it("restores legacy source bytes with an explicit encoding assumption", () => {
    const raw = Buffer.from([47, 47, 32, 0xa9]).toString("base64");
    const preview = new TextDecoder().decode(Buffer.from(raw, "base64"));
    const legacy = { ...entry, content: `header\n${preview}`, submittedFiles: [{ ...file, name: "source.cpp", extension: "cpp", rawBase64: raw, previewContent: preview }] };
    const compact = stripUnneededRawBase64(legacy);
    const restored = restoreStaticTextEvidence(compact);
    expect(restored?.content).toContain("Source encoding assumed Windows-1252");
    expect(restored?.assumedEncodingFiles).toEqual(["source.cpp"]);
    expect(restored?.content).toContain("// \u00a9");
    expect(restored?.submittedFiles[0].rawBase64).toBe(raw);
  });
  it("refuses missing, invalid, mismatched and repeated source markers", () => {
    const compact = stripUnneededRawBase64(entry), marker = compact.submittedFiles[0].staticTextMarker!;
    for (const modified of [
      { ...compact, submittedFiles: [{ ...compact.submittedFiles[0], rawBase64: undefined }] },
      { ...compact, submittedFiles: [{ ...compact.submittedFiles[0], rawBase64: "/w==" }] },
      { ...compact, submittedFiles: [{ ...compact.submittedFiles[0], staticTextMarker: undefined }] },
      { ...compact, content: "no marker" },
      { ...compact, content: compact.content + marker },
      { ...entry, content: "does not include CSV" },
    ]) expect(restoreStaticTextEvidence(modified)).toBeNull();
  });
});

it.each(["cpp", "h", "txt", "py", "json", "csv", "html", "user", "recipe", "log", "command"])("holds invalid UTF-8 in static %s evidence", (extension) => {
  const file = { name: `work.${extension}`, extension, previewContent: "replacement", previewTruncated: false, rawBase64: "/w==" };
  const entry = { student: "Synthetic", content: "replacement", mergedFileCount: 1, submittedFiles: [file], staticOnly: true as const };
  expect(restoreStaticTextEvidence(stripUnneededRawBase64(entry))).toBeNull();
});

it("holds NUL bytes in guarded static text evidence", () => {
  const text = "a\0b", file = { name: "work.log", extension: "log", previewContent: text, previewTruncated: false, rawBase64: Buffer.from(text).toString("base64") };
  const input = { student: "Synthetic", content: text, mergedFileCount: 1, submittedFiles: [file], staticOnly: true as const };
  expect(restoreStaticTextEvidence(stripUnneededRawBase64(input))).toBeNull();
});

it("restores guarded text with its original UTF-8 BOM exactly once", () => {
  const text = "\ufeffconfiguration", file = { name: "settings.user", extension: "user", previewContent: text, previewTruncated: false, rawBase64: Buffer.from(text).toString("base64") };
  const input = { student: "Synthetic", content: `header\n${text}`, mergedFileCount: 1, submittedFiles: [file], staticOnly: true as const };
  expect(restoreStaticTextEvidence(stripUnneededRawBase64(input))?.content).toBe(input.content);
});

it("does not decode an oversized source file when compacting", () => {
  const rawBase64 = "A".repeat(4_000_004), entry = { student: "Synthetic", content: "text", mergedFileCount: 1, staticOnly: true as const, submittedFiles: [{ name: "main.cpp", extension: "cpp", previewContent: "text", previewTruncated: true, rawBase64 }] };
  const compact = stripUnneededRawBase64(entry); expect(compact.submittedFiles[0].rawBase64).toBe(rawBase64); expect(compact.submittedFiles[0].staticTextMarker).toBeUndefined();
  expect(restoreStaticTextEvidence(compact)).toBeNull();
});
