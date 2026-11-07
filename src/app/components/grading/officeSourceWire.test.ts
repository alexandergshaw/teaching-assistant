import { describe, expect, it } from "vitest";
import { ITEM_REQUEST_BYTE_BUDGET, type GradeRunItemRequestBody } from "./incrementalRunPlan";
import { serializeGradeItemWithOfficeSource } from "./officeSourceWire";

function request(rawBase64: string, rubric = "r"): GradeRunItemRequestBody {
  return { sourceIndex: 0, assignmentInstructions: "i", rubric, provider: "gemini", pointsPossible: null, entry: { student: "Student", content: "answer", mergedFileCount: 1, submittedFiles: [{ name: "a.docx", extension: "docx", previewContent: "answer", previewTruncated: false, rawBase64, mimeType: "application/vnd.openxmlformats-officedocument.wordprocessingml.document", documentVisuals: { status: "complete", reason: "none", found: 0, omitted: 0, parts: [] } }] } };
}
describe("Office source wire selection", () => {
  it("preserves small Office bytes without mutating the entry", () => {
    const input = request("QUJDRA==");
    const result = JSON.parse(serializeGradeItemWithOfficeSource(input));
    expect(result.entry.submittedFiles[0].rawBase64).toBe("QUJDRA==");
    expect(input.entry.submittedFiles[0].rawBase64).toBe("QUJDRA==");
  });
  it("drops optional source when the complete request would exceed the existing budget", () => {
    const input = request("A".repeat(ITEM_REQUEST_BYTE_BUDGET - 100), "r".repeat(500));
    const wire = serializeGradeItemWithOfficeSource(input);
    expect(new TextEncoder().encode(wire).byteLength).toBeLessThanOrEqual(ITEM_REQUEST_BYTE_BUDGET);
    expect(JSON.parse(wire).entry.submittedFiles[0].rawBase64).toBeUndefined();
  });
  it("strips all optional Office source when multiple files exceed the limit together", () => {
    const input = request("A".repeat(Math.floor(ITEM_REQUEST_BYTE_BUDGET / 2)));
    input.entry.submittedFiles.push({ ...input.entry.submittedFiles[0], name: "b.docx" });
    const wire = serializeGradeItemWithOfficeSource(input);
    expect(new TextEncoder().encode(wire).byteLength).toBeLessThanOrEqual(ITEM_REQUEST_BYTE_BUDGET);
    expect(JSON.parse(wire).entry.submittedFiles.map((file: { rawBase64?: string }) => file.rawBase64)).toEqual([undefined, undefined]);
  });
  it("uses UTF-8 bytes, including Unicode rubric text, for the complete-body limit", () => {
    const input = request("A".repeat(ITEM_REQUEST_BYTE_BUDGET - 2000), "漢".repeat(1000));
    const wire = serializeGradeItemWithOfficeSource(input);
    expect(new TextEncoder().encode(wire).byteLength).toBeLessThanOrEqual(ITEM_REQUEST_BYTE_BUDGET);
    expect(JSON.parse(wire).entry.submittedFiles[0].rawBase64).toBeUndefined();
  });  it("does not invent source for a prepared-only entry", () => {
    const input = request("QUJDRA==");
    delete input.entry.submittedFiles[0].rawBase64;
    expect(JSON.parse(serializeGradeItemWithOfficeSource(input)).entry.submittedFiles[0].rawBase64).toBeUndefined();
  });
});
