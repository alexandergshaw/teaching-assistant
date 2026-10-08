// ZIP-BOMB-CAPS W1 (docs/zip-bomb-caps-scope.md), instrument I11: no
// unbounded per-entry read survives in extraction.ts. office-extract.ts is
// W2's file and is pinned there. Source-text test: pins the fact (no raw
// read, the shared guards are wired), never the spelling.
import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";
import { join } from "path";

function withoutLineComments(src: string): string {
  return src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/.*$/gm, "");
}

const EXTRACTION = withoutLineComments(
  readFileSync(join(process.cwd(), "src/lib/grade/extraction.ts"), "utf8")
);

describe("extraction.ts - no unbounded zip read survives (I11)", () => {
  it("has no per-entry .async( read (case-sensitive: JSZip.loadAsync( is retained and must not match)", () => {
    expect(EXTRACTION.match(/\.async\(/g)).toBeNull();
  });

  it("has no nodeStream( read", () => {
    expect(EXTRACTION.match(/nodeStream\(/g)).toBeNull();
  });

  it("positive control: the scan can see a real call (JSZip.loadAsync( is still used)", () => {
    expect(EXTRACTION.match(/JSZip\.loadAsync\(/g)?.length ?? 0).toBeGreaterThanOrEqual(2);
  });

  it("reads members only through the bounded reader and charges each level through the plan pass", () => {
    expect(EXTRACTION).toMatch(/readMemberBounded\(/);
    expect(EXTRACTION).toMatch(/chargeArchiveLevel\(/);
    expect(EXTRACTION).toMatch(/runBounded\(/);
    expect(EXTRACTION).toMatch(/createZipBudget\(/);
  });

  it("rethrows a cap error at BOTH catch sites instead of swallowing it", () => {
    expect(EXTRACTION.match(/instanceof ZipCapError/g)?.length ?? 0).toBeGreaterThanOrEqual(2);
  });

  it("imports zip-caps AFTER the ../canvas import (a frozen runtime-import-graph trail depends on the order)", () => {
    const canvas = EXTRACTION.indexOf('from "../canvas"');
    const caps = EXTRACTION.indexOf('from "../zip-caps"');
    expect(canvas).toBeGreaterThan(-1);
    expect(caps).toBeGreaterThan(canvas);
  });
});
