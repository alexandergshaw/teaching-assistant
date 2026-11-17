import { describe, expect, it } from "vitest";
import { prioritizeModelContent } from "./large-data-model-content";

describe("large datasets in model context", () => {
  it("preserves source and reports a dataset omitted from model review", () => {
    const csv = "id,value\n" + "x,123\n".repeat(10000);
    const file = { name: "data.csv", extension: "csv", previewContent: "", previewTruncated: true, rawBase64: Buffer.from(csv).toString("base64") };
    const result = prioritizeModelContent(`DATA\n${csv}\nSOURCE\nint main(){}`, [file], 1000);
    expect(result.datasetOmitted).toBe(true);
    expect(result.content).toContain("full contents were not included in the model review");
    expect(result.content).not.toMatch(/execution|executed|run/i);
    expect(result.content).toContain("int main(){}");
    expect(file.rawBase64).toBe(Buffer.from(csv).toString("base64"));
  });
  it("does not remove ambiguous repeated text", () => {
    const csv = "x".repeat(21000);
    const file = { name: "data.csv", extension: "csv", previewContent: "", previewTruncated: true, rawBase64: Buffer.from(csv).toString("base64") };
    expect(prioritizeModelContent(csv + csv, [file], 1000).datasetOmitted).toBe(false);
  });
});
