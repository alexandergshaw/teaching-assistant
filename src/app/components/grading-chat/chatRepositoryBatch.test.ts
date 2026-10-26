import { describe, expect, it } from "vitest";
import { emptyRepositoryEvidence, stageRepositoryBatch, stageRepositoryBatchResult, REPOSITORY_BATCH_TEXT_LENGTH, REPOSITORY_RETAINED_LINES, REPOSITORY_RETAINED_TEXT_LENGTH } from "./chatRepositoryBatch";

const stage = (raw: string) => stageRepositoryBatch(raw, emptyRepositoryEvidence());
describe("repository evidence admission", () => {
  it("reports the current attempt independently of retained invalid history", () => {
    const previous = stage("Alice: https://github.com/a/b");
    const result = stageRepositoryBatchResult("https://github.com/c/d", previous);
    expect(result.outcome).toBe("staged");
    expect(result.state.lines.map((line) => line.status)).toEqual(["unresolved", "accepted"]);
  });
  it("bounds retained outcomes at 80 including repeated invalid and duplicate inputs, with atomic retry after removal", () => {
    expect(REPOSITORY_RETAINED_LINES).toBe(80);
    for (const batch of [Array(40).fill("invalid"), Array(40).fill("https://github.com/a/b"), Array.from({ length: 40 }, (_, i) => i % 2 ? "invalid annotation" : "https://github.com/a/b")]) {
      const once = stage(batch.join("\n"));
      const full = stageRepositoryBatch(batch.join("\n"), once);
      expect(full.lines).toHaveLength(80);
      expect(full.error).toBeNull();
      const refused = stageRepositoryBatchResult("https://github.com/c/d\ninvalid", full);
      expect(refused.outcome).toBe("refused");
      expect(refused.state.lines).toBe(full.lines);
      expect(refused.state.error).toBe("Repository evidence storage is full. Remove inputs or clear repository evidence before staging this batch again.");
      const removed = { ...refused.state, lines: refused.state.lines.slice(2) };
      expect(stageRepositoryBatch("https://github.com/c/d\ninvalid", removed).lines).toHaveLength(80);
      expect(stageRepositoryBatch(batch.join("\n"), emptyRepositoryEvidence()).error).toBeNull();
    }
  });
  it("bounds retained original characters independently of outcome count and permits remove then retry", () => {
    expect(REPOSITORY_RETAINED_TEXT_LENGTH).toBe(2 * REPOSITORY_BATCH_TEXT_LENGTH);
    const raw = "x".repeat(REPOSITORY_BATCH_TEXT_LENGTH);
    const full = stageRepositoryBatch(raw, stage(raw));
    expect(full.lines).toHaveLength(2);
    expect(full.error).toBeNull();
    const refused = stageRepositoryBatch("invalid", full);
    expect(refused.lines).toBe(full.lines);
    expect(refused.error).toContain("storage is full");
    const removed = { ...refused, lines: refused.lines.slice(1) };
    expect(stageRepositoryBatch("invalid", removed).error).toBeNull();
  });
  it("accounts for the frozen reference-shaped mixed batch in order", () => {
    const inputs = ["https://github.com/alpha/project", "", "Additional link: https://github.com/alpha/project/tree/main/src", "Additional link: https://github.com/beta/project/blob/v1/app.ts", "https://github.com/gamma/project.git", "https://github.com/ALPHA/PROJECT", "https://example.com/alpha/project", "Alice: https://github.com/alice/work", "https://github.com/a/b https://github.com/c/d"];
    const result = stage(inputs.join("\n"));
    expect(result.error).toBeNull();
    expect(result.lines.map((line) => line.original)).toEqual(inputs.filter(Boolean));
    expect(result.lines.map((line) => line.status)).toEqual(["accepted", "accepted", "accepted", "accepted", "duplicate", "rejected", "unresolved", "unresolved"]);
    expect(result.lines[1].requested).toEqual({ owner: "alpha", repo: "project", ref: "main", subpath: "src" });
    expect(result.lines[2].requested).toEqual({ owner: "beta", repo: "project", ref: "v1", subpath: "app.ts" });
    expect(result.lines[3].requested).toEqual({ owner: "gamma", repo: "project" });
  });
  it.each(["https://github.com/a/b/../c", "https://github.com/a/b/tree/main/%2e%2e/x", "https://github.com/a/b/tree/feature%2Fx", "https://github.com/a/b/tree/main/x%2fy", "https://github.com/a/b/tree/main/%zz", "https://github.com/a/b/issues", "https://github.com/a/b/tree", "https://github.com/a/b/blob/main", "https://evil.com/a/b", "https://github.com@evil.com/a/b", "ftp://github.com/a/b", "https://github.com/a/b?x=1", "https://github.com/a/b#x", "https://github.com/a/b//tree/main"])("rejects unsafe or unsupported scope %s", (input) => {
    expect(stage(input).lines[0].status).toBe("rejected");
  });
  it("retains distinct revisions, paths and tree/blob scope", () => {
    expect(stage(["https://github.com/a/b", "https://github.com/a/b/tree/main", "https://github.com/a/b/tree/dev", "https://github.com/a/b/tree/main/x", "https://github.com/a/b/blob/main/x"].join("\n")).lines.map((line) => line.status)).toEqual(Array(5).fill("accepted"));
  });
  it("rejects over-cap batches atomically, including duplicates and invalid lines", () => {
    const previous = stage("https://github.com/a/b");
    for (const raw of [Array(41).fill("invalid").join("\n"), "x".repeat(REPOSITORY_BATCH_TEXT_LENGTH + 1), Array.from({ length: 40 }, (_, i) => `https://github.com/a/r${i}`).join("\n")]) {
      const next = stageRepositoryBatch(raw, previous);
      expect(next.error).toBeTruthy();
      expect(next.lines).toBe(previous.lines);
    }
  });
  it("admits exactly 40 prefixed lines with 2048-character URLs, rejects longer URLs", () => {
    const prefix = "https://github.com/a/b/tree/main/";
    const url = prefix + "x".repeat(2048 - prefix.length);
    expect(stage(Array(40).fill(`Additional link: ${url}`).join("\r\n")).error).toBeNull();
    expect(stage(url).lines[0].status).toBe("accepted");
    expect(stage(url + "x").lines[0].status).toBe("rejected");
    expect(stage(" \n\t\r\n").lines).toEqual([]);
  });
  it("deduplicates retained links across batches without losing invalid input accounting", () => {
    const previous = stage("https://github.com/a/b.git\nnot-a-link");
    const result = stageRepositoryBatch("Additional link: https://github.com/A/B/", previous);
    expect(result.lines.map((line) => line.status)).toEqual(["accepted", "rejected", "duplicate"]);
  });
});
