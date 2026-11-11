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
