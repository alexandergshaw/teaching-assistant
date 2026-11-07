import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
const read = (name: string) => readFileSync(`src/app/components/grading-chat/${name}`, "utf8");
describe("repository collection production caller wiring (source only; no rendered component)", () => {
  it("leaves repository collection disconnected from the grading chat panel", () => {
    const panel = read("GradingChatPanel.tsx"), mappings = read("ChatRepositoryMappings.tsx"), hook = read("useChatRepositoryProposals.ts");
    expect(panel).not.toContain("useChatRepositoryProposals(");
    expect(panel).not.toContain("<ChatRepositoryMappings");
    expect(mappings).toContain("proposals.confirm(selected)");
    expect(mappings).toContain("proposals.collect(id)");
    expect(hook).toContain('fetch("/api/grading-chat-repository"');
    expect(read("useContinuousGradingRun.ts")).toContain("listRepositoryStudents(\"grading-chat-\" + sessionIdRef.current, retainedBodiesRef.current)");
  });
  it("links collection to the optional live proposal/review/adoption row adapter", () => {
    const source = read("ChatRepositoryMappings.tsx");
    expect(source).toContain("Open Repository grade proposal in the matching result row");
    const panel = read("GradingChatPanel.tsx"), results = readFileSync("src/app/components/GradingResults.tsx", "utf8"), leaf = readFileSync("src/app/components/grading-results/RepositoryProposalReview.tsx", "utf8");
    expect(panel).not.toContain("repositoryProposals={repositoryProposals.workflow}");
    expect(panel).not.toContain("onWorkflowSettled: recordRepositoryWorkflow");
    expect(results).toContain("repositoryProposals?: RepositoryWorkflowAdapter");
    expect(results).toContain("<RepositoryProposalReview row={result} edit={edit}");
    expect(results).toContain("[result.student]: next"); expect(results).toContain("if (scoreChanged) clearPostStatus(result.student)");
    expect(leaf).toContain("adapter.propose(row.student, edit, acknowledge)");
    expect(leaf).toContain("adapter.review(row.student, edit)");
    expect(leaf).toContain("adapter.accept(row.student, edit, state.comparisonSignature, selection)");
    expect(leaf).toContain("window.confirm("); expect(leaf).not.toContain("handleRegradeRow");
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
