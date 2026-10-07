import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

function withoutLineComments(src: string): string {
  return src
    .split("\n")
    .filter((l) => !l.trim().startsWith("//"))
    .join("\n");
}

const hook = withoutLineComments(
  readFileSync(join(__dirname, "useGradingRecordingExtraction.ts"), "utf8")
);
const capture = withoutLineComments(
  readFileSync(join(__dirname, "..", "recording", "useDiscussionCapture.ts"), "utf8")
);

describe("DET-W2 coverage wiring", () => {
  it("the extraction hook feeds kept-frame signatures to detectCoverageGap", () => {
    expect(hook).toMatch(/detectCoverageGap\(sigs\)/);
    expect(hook).toMatch(/f\.signature/);
  });

  it("the extraction hook exposes coverage in its return", () => {
    expect(hook).toMatch(/return \{ extracting, ledger, coverage \}/);
    expect(hook).toMatch(/coverage: \{ pairsCompared: number; gapCount: number \}/);
  });

  it("the capture hook attaches the already-computed signature to kept frames", () => {
    expect(capture).toMatch(/pendingQueueRef\.current\.push\(\{[^}]*\bsignature \}\)/);
  });
});
