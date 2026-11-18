import { beforeEach, expect, it, vi } from "vitest";
const { runner, llm } = vi.hoisted(() => ({ runner: vi.fn(), llm: vi.fn() }));
vi.mock("../code-runner", () => ({ runSubmittedCode: runner }));
vi.mock("../llm", () => ({ callLlm: llm }));
import { gradeEntries } from "./engine";
const entry = { student: "Student", content: "print(1)", mergedFileCount: 1, submittedFiles: [{ name: "main.py", extension: "py", previewContent: "print(1)", previewTruncated: false }] };
const rubric = "Algorithm (10 pts): logic";
beforeEach(() => { vi.clearAllMocks(); runner.mockResolvedValue(null); llm.mockResolvedValue({ ok: true, text: '{"overallComment":"Clear logic.","improvements":"","rubricResults":[{"area":"Algorithm","score":{"earned":10,"possible":10},"comment":"The branch is implemented. [evidence:main.py]"}]}' }); });
it("branches before runner and precomputed execution and preserves strict comments without reconciliation", async () => {
  const run = await gradeEntries([{ ...entry, codeRun: { language: "python", files: ["main.py"], ran: true, exitCode: 0, stdout: "PRECOMPUTED_EXECUTION_SENTINEL", stderr: "" } }], "instructions", rubric, "gemini", 10, { executionPolicy: "evidence-only", evidenceContext: { criteria: [{ name: "Algorithm", points: 10 }], allowedEvidenceIds: ["main.py"], provenance: "No execution claim." } });
  expect(runner).not.toHaveBeenCalled(); expect(run.results[0].codeExecution).toBeUndefined(); expect(run.results[0].rubricAreas[0].comment).toBe("The branch is implemented. [evidence:main.py]"); expect(JSON.stringify(llm.mock.calls)).not.toContain("PRECOMPUTED_EXECUTION_SENTINEL");
});
it("retains the legacy runner behavior when execution policy is absent", async () => {
  llm.mockResolvedValue({ ok: true, text: '{"overallComment":"Clear logic.","improvements":"","rubricResults":[{"area":"Algorithm","score":"10/10"}]}' });
  await gradeEntries([entry], "instructions", rubric); expect(runner).toHaveBeenCalledOnce();
});
it("holds a strict rubric comment claiming an unobserved notebook run", async () => {
  const file = { name: "work.ipynb", extension: "ipynb", previewContent: JSON.stringify({ nbformat: 4, nbformat_minor: 5, cells: [{ cell_type: "code", source: "print(1)", outputs: [] }] }), previewTruncated: false };
  llm.mockResolvedValue({ ok: true, text: JSON.stringify({ overallComment: "Clear logic.", improvements: "", rubricResults: [{ area: "Algorithm", score: { earned: 10, possible: 10 }, comment: "The notebook ran successfully. [evidence:work.ipynb]" }] }) });
  const run = await gradeEntries([{ ...entry, submittedFiles: [file] }], "instructions", rubric, "gemini", 10, { executionPolicy: "evidence-only", evidenceContext: { criteria: [{ name: "Algorithm", points: 10 }], allowedEvidenceIds: ["work.ipynb"], provenance: "Source only." } });
  expect(run.results[0]).toMatchObject({ totalScore: "", ungraded: { kind: "grading-failed" } });
});
