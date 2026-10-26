import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
const read = (name: string) => readFileSync(`src/app/components/grading-chat/${name}`, "utf8");
describe("repository collection production caller wiring (source only; no rendered component)", () => {
  it("connects panel, confirmed mapping, real endpoint and closed collection diagnostics", () => {
    const panel = read("GradingChatPanel.tsx"), mappings = read("ChatRepositoryMappings.tsx"), hook = read("useChatRepositoryProposals.ts");
    expect(panel).toContain("useChatRepositoryProposals({ sessionEpoch: driver.runKey");
    expect(panel).toContain("onSettled: recordRepositoryCollection");
    expect(panel).toContain("<ChatRepositoryMappings");
    expect(mappings).toContain("proposals.confirm(selected)");
    expect(mappings).toContain("proposals.collect(id)");
    expect(hook).toContain('fetch("/api/grading-chat-repository"');
    expect(panel.indexOf("repositoryProposals.reset()")).toBeGreaterThan(panel.indexOf("!window.confirm("));
    expect(read("useContinuousGradingRun.ts")).toContain("listRepositoryStudents(\"grading-chat-\" + sessionIdRef.current, retainedBodiesRef.current)");
  });
  it("exposes honest packet-one collection controls without enabled proposal/review stubs", () => {
    const source = read("ChatRepositoryMappings.tsx");
    expect(source).toContain("Targeted grade proposals and independent review are not available yet.");
    expect(source).toContain("Original submission:");
    expect(source).toContain("Submission timing unknown.");
    expect(source).toContain("manifest.collectedAt");
    expect(source).toContain("manifest.files.map");
    expect(source).toContain("file.path");
    expect(source).toContain("file.bytes");
    expect(source).toContain("file.truncated");
    expect(source).toContain("proposals.exhausted.has(id)");
    expect(source).toContain("Start new evidence revision and fetch");
    expect(source).toContain('proposals.confirm([{ id, studentId: "" }])');
    expect(source).not.toMatch(/onClick=.*(?:propose|review|regrade|postGrades)/);
  });
});
