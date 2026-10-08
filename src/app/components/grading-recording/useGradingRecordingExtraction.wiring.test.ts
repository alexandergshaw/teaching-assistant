import { describe, it, expect } from "vitest";
import fs from "fs";
import path from "path";

// DET-Wave 1: the hook is never rendered under vitest, so the ledger wiring
// (the error branch and the success path both fold into the ledger, and the
// ledger is returned) is pinned by anchor-sliced source text.

const source = fs.readFileSync(
  path.join(process.cwd(), "src/app/components/grading-recording/useGradingRecordingExtraction.ts"),
  "utf8"
);

function withoutLineComments(text: string): string {
  return text
    .split("\n")
    .filter((l) => !l.trim().startsWith("//"))
    .join("\n");
}

describe("useGradingRecordingExtraction.ts - per-batch failure ledger wiring", () => {
  const code = withoutLineComments(source);
  const errStart = code.indexOf('if ("error" in result) {');
  const errEnd = code.indexOf("return;", errStart);

  it("anchors resolve", () => {
    expect(errStart).toBeGreaterThan(-1);
    expect(errEnd).toBeGreaterThan(errStart);
  });

  it("the error branch folds a failed outcome into the ledger before returning", () => {
    const slice = code.slice(errStart, errEnd);
    expect(slice).toContain("foldBatchOutcome");
    expect(slice).toContain("ok: false");
  });

  it("the success path folds an ok outcome", () => {
    const after = code.slice(errEnd);
    expect(after).toContain("foldBatchOutcome");
    expect(after).toContain("ok: true");
  });

  it("returns the ledger from the hook", () => {
    expect(code).toMatch(/return \{ extracting, ledger, coverage \}/);
  });
});
