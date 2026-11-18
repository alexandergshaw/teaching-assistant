import { afterEach, beforeEach, expect, it, vi } from "vitest";
const { kernel, llm } = vi.hoisted(() => ({ kernel: vi.fn(), llm: vi.fn() }));
vi.mock("./notebook-kernel-runner", () => ({ runNotebookKernel: kernel }));
vi.mock("../code-runner", () => ({ runSubmittedCode: vi.fn(async () => null) }));
vi.mock("../llm", () => ({ callLlm: llm }));
import { gradeEntries } from "./engine";
const notebook = { name: "src/work.ipynb", extension: "ipynb", previewContent: JSON.stringify({ nbformat: 4, nbformat_minor: 5, cells: [{ cell_type: "code", source: "print(1)", outputs: [] }] }), previewTruncated: false };
const entry = { student: "Student", content: "print(1)", mergedFileCount: 1, submittedFiles: [notebook, { name: "data/a.csv", extension: "csv", previewContent: "x", previewTruncated: false }], repositoryInventories: [{ source: "repo", scope: { kind: "repository" as const, path: null }, enumerationComplete: true, files: [{ path: "src/work.ipynb", content: "read" as const }, { path: "data/a.csv", content: "read" as const }] }] };
beforeEach(() => { vi.clearAllMocks(); vi.stubEnv("CODE_RUNNER_NOTEBOOK_ENABLED", "true"); vi.stubEnv("CODE_RUNNER_PYTHON_SNAPSHOT", "snap_Abc123"); vi.stubEnv("GRADE_NOTEBOOK_VISUALS", ""); llm.mockResolvedValue({ ok: true, text: JSON.stringify({ overallComment: "Clear code.", rubricResults: [{ area: "Correctness", score: "10/10" }], totalScore: "10/10" }) }); });
afterEach(() => vi.unstubAllEnvs());
it("passes actual project files and structured kernel evidence to grading", async () => {
  kernel.mockResolvedValueOnce({ ok: true, observations: { ok: true, expected: [0], observed: [0], errors: [], outputs: [{ cell: 0, kind: "stream", text: "1" }], images: [] }, caveat: "Kernel replies are untrusted." });
  const result = await gradeEntries([entry], "Grade.", "Correctness (10 points).", "gemini");
  expect(kernel.mock.calls[0][0]).toEqual(expect.arrayContaining([expect.objectContaining({ path: "src/work.ipynb", content: Buffer.from(notebook.previewContent) }), expect.objectContaining({ path: "data/a.csv" })]));
  expect(result.results[0].codeExecution?.stdout).toContain("Kernel replies are untrusted"); expect(llm).toHaveBeenCalledOnce();
  expect(JSON.stringify(llm.mock.calls)).toContain("Observed outputs were not compared with saved outputs");
  expect(JSON.stringify(llm.mock.calls)).not.toContain("Ran without errors: yes");
});
it("holds when inventory contains an unstaged project file", async () => {
  const incomplete = { ...entry, repositoryInventories: [{ source: "repo", scope: { kind: "repository" as const, path: null }, enumerationComplete: true, files: [{ path: "src/work.ipynb", content: "read" as const }, { path: "data/missing.csv", content: "read" as const }] }] };
  const result = await gradeEntries([incomplete], "Grade.", "Correctness (10 points).", "gemini");
  expect(result.results[0].ungraded).toBeTruthy(); expect(kernel).not.toHaveBeenCalled(); expect(llm).not.toHaveBeenCalled();
});
it("holds a failed kernel without calling the model", async () => {
  kernel.mockResolvedValueOnce({ ok: false, reason: "Notebook execution did not complete; review the submission." });
  const result = await gradeEntries([entry], "Grade.", "Correctness (10 points).", "gemini");
  expect(result.results[0]).toMatchObject({ totalScore: "", ungraded: { kind: "grading-failed" } }); expect(llm).not.toHaveBeenCalled();
});
it("does not call the model if the route aborts while the kernel is running", async () => {
  const controller = new AbortController();
  kernel.mockImplementationOnce(async () => { controller.abort(); return { ok: true, observations: { ok: true, expected: [0], observed: [0], errors: [], outputs: [], images: [] }, caveat: "Kernel replies are untrusted." }; });
  await expect(gradeEntries([entry], "Grade.", "Correctness (10 points).", "gemini", null, { abortSignal: controller.signal })).rejects.toThrow();
  expect(llm).not.toHaveBeenCalled();
});
it("does not start a kernel when disabled", async () => {
  vi.stubEnv("CODE_RUNNER_NOTEBOOK_ENABLED", "false");
  await gradeEntries([entry], "Grade.", "Correctness (10 points).", "gemini", null, { autoRunCode: false });
  expect(kernel).not.toHaveBeenCalled();
  expect(JSON.stringify(llm.mock.calls)).toContain("not observed execution");
});
it("grades an execution-required rubric only with a server-verified successful notebook receipt", async () => {
  vi.stubEnv("CODE_RUNNER_NOTEBOOK_ENABLED", "false");
  const codeRun = { language: "python", files: [notebook.name], ran: true, exitCode: 0, notebookExecutionObserved: true, stdout: "observed cells completed", stderr: "" };
  const submitted = { ...entry, codeRun };
  const held = await gradeEntries([submitted], "Run the notebook.", "Correctness (10 points).", "gemini", null, { autoRunCode: false });
  expect(held.results[0].ungraded).toBeTruthy(); expect(llm).not.toHaveBeenCalled();
  const graded = await gradeEntries([submitted], "Run the notebook.", "Correctness (10 points).", "gemini", null, { autoRunCode: false, verifiedNotebookReceipt: true });
  expect(graded.results[0].ungraded).toBeFalsy(); expect(llm).toHaveBeenCalledOnce();
});
it("holds a reproducibility requirement even after an observed run", async () => {
  vi.stubEnv("CODE_RUNNER_NOTEBOOK_ENABLED", "false");
  const submitted = { ...entry, codeRun: { language: "python", files: [notebook.name], ran: true, exitCode: 0, notebookExecutionObserved: true, stdout: "observed", stderr: "" } };
  const result = await gradeEntries([submitted], "Results must be reproducible.", "Correctness (10 points).", "gemini", null, { autoRunCode: false, verifiedNotebookReceipt: true });
  expect(result.results[0].ungraded).toBeTruthy(); expect(llm).not.toHaveBeenCalled();
});
