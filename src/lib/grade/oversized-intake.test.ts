import { describe, expect, it } from "vitest";
import { ITEM_REQUEST_BYTE_BUDGET } from "@/app/components/grading/incrementalRunPlan";
import { oversizedEntry, oversizedIntakeReason, partitionOversizedEntries } from "./oversized-intake";

describe("oversized intake refusal", () => {
  it("bounds names and reports the number omitted", () => {
    const entries = Array.from({ length: 12 }, (_, i) => ({ student: `Student ${i} ${"x".repeat(500)}`, content: "x".repeat(ITEM_REQUEST_BYTE_BUDGET + 1), mergedFileCount: 0, submittedFiles: [] }));
    const reason = oversizedIntakeReason(entries)!;
    expect(reason).toContain("Student 0");
    expect(reason).toContain("and 2 more");
    expect(reason.length).toBeLessThan(1100);
  });
});

describe("oversized intake partition", () => {
  const entry = (student: string, content: string) => ({ student, content, mergedFileCount: 0, submittedFiles: [] });

  it("preserves source order and distinguishes omitted students with duplicate names", () => {
    const first = entry("Same name", "ok");
    const tooLarge = entry("Same name", "x".repeat(200));
    const last = entry("Other", "1234");
    const budget = new TextEncoder().encode(JSON.stringify({ entry: first })).byteLength + 10;
    expect(partitionOversizedEntries([first, tooLarge, last], budget)).toEqual({
      admitted: [first, last], omitted: [{ index: 1, student: "Same name" }],
    });
  });

  it("handles all-admitted, all-omitted and empty inputs without mutating the batch", () => {
    const input = [entry("A", "123"), entry("B", "456")];
    const budget = new TextEncoder().encode(JSON.stringify({ entry: input[0] })).byteLength;
    expect(partitionOversizedEntries(input, budget)).toEqual({ admitted: input, omitted: [] });
    expect(partitionOversizedEntries(input, budget - 1)).toEqual({ admitted: [], omitted: [{ index: 0, student: "A" }, { index: 1, student: "B" }] });
    expect(partitionOversizedEntries([], 2)).toEqual({ admitted: [], omitted: [] });
    expect(input.map((item) => item.content)).toEqual(["123", "456"]);
  });

  it("counts UTF-8 and JSON escaping in addition to text length", () => {
    const input = entry("A", '漢"');
    const bytes = new TextEncoder().encode(JSON.stringify({ entry: input })).byteLength;
    expect(oversizedEntry(input, bytes)).toBe(false);
    expect(oversizedEntry(input, bytes - 1)).toBe(true);
  });
});

it("strips only a verified redundant CSV in static review while retaining source bytes", () => {
  const text = "id,value\n" + "x".repeat(2_040_000), rawBase64 = Buffer.from(text).toString("base64");
  const file = { name: "data.csv", extension: "csv", mimeType: "text/csv", previewContent: "id,value", previewTruncated: true, rawBase64 };
  const original = { student: "Synthetic", content: `source\n${text}\nend`, mergedFileCount: 1, submittedFiles: [file] };
  expect(oversizedEntry(original)).toBe(true);
  const reviewed = { ...original, staticOnly: true as const };
  expect(oversizedEntry(reviewed)).toBe(false);
  expect(file.rawBase64).toBe(rawBase64);
  expect(oversizedEntry({ ...reviewed, content: text.slice(0, -1) })).toBe(true);
  expect(oversizedEntry({ ...original, submittedFiles: [{ ...file, extension: "cpp" }] })).toBe(true);
});
