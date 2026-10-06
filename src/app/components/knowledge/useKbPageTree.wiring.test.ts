import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

// KNOWLEDGE-SWITCH-SPEED W2: pins the load ORDERING of useKbPageTree - the
// summaries read is issued before the full-body read, and the tree/idle state
// is reached from the summaries result without awaiting the body read.
const source = readFileSync(join(__dirname, "useKbPageTree.ts"), "utf8");

describe("useKbPageTree load ordering", () => {
  it("issues the summaries read before the first full-body read", () => {
    const summaries = source.indexOf("listInstitutionPageSummariesAction(active)");
    const bodies = source.indexOf("listInstitutionPagesAction(active)");
    expect(summaries).toBeGreaterThan(-1);
    expect(bodies).toBeGreaterThan(-1);
    expect(summaries).toBeLessThan(bodies);
  });

  it("builds placeholder pages from the summaries result and goes idle without awaiting bodies", () => {
    const block = source.slice(source.indexOf("await summariesRequest"));
    const placeholder = block.indexOf("pagesFromSummaries(");
    const idle = block.indexOf('setLoadState("idle")');
    const awaitBodies = block.indexOf("await bodiesRequest");
    expect(placeholder).toBeGreaterThan(-1);
    expect(idle).toBeGreaterThan(placeholder);
    expect(awaitBodies).toBeGreaterThan(idle);
  });

  it("exposes bodiesReady and flips it only from a full read", () => {
    expect(source).toContain("bodiesReady,");
    expect(source.match(/setBodiesReady\(true\)/g)?.length).toBe(2);
  });
});
