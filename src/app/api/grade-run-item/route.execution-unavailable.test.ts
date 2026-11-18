import { beforeEach, expect, it, vi } from "vitest";
import type { NextRequest } from "next/server";
const { llm, runner } = vi.hoisted(() => ({ llm: vi.fn(), runner: vi.fn() }));
vi.mock("@/lib/supabase/auth", () => ({ requireAppOwner: vi.fn(async () => ({ id: "owner" })) }));
vi.mock("@/lib/grade/extraction", () => ({ resolveEntryLinks: vi.fn(async (entry: unknown) => entry) }));
vi.mock("@/lib/code-runner", () => ({ runSubmittedCode: runner }));
vi.mock("@/lib/llm", async (original) => ({ ...await original<object>(), callLlm: llm }));
import { POST } from "./route";
const code = { name: "main.py", extension: "py", previewContent: "import numpy", previewTruncated: false };
const body = { sourceIndex: 0, entry: { student: "Synthetic", content: "import numpy", mergedFileCount: 1, submittedFiles: [code] }, assignmentInstructions: "Review code.", rubric: "Correctness (10 pts): Behavior", provider: "gemini", pointsPossible: 10 };
const request = (value: unknown) => ({ headers: new Headers({ "content-type": "application/json" }), json: async () => value } as NextRequest);
beforeEach(() => { runner.mockReset(); llm.mockReset(); });
it.each([
  { language: "python", files: ["main.py"], ran: false, exitCode: 1, stdout: "", stderr: "ModuleNotFoundError: No module named 'numpy'" },
  { language: "python", files: ["main.py"], ran: false, exitCode: null, stdout: "", stderr: "", error: "Sandbox unavailable" },
])("holds when a code submission has no usable execution: %j", async (outcome) => {
  runner.mockResolvedValue(outcome);
  const response = await POST(request(body));
  expect(response.status).toBe(200);
  const { result } = await response.json();
  expect(result).toMatchObject({ totalScore: "", strengths: "Thank you for submitting your work.", ungraded: { kind: "grading-failed" } });
  expect(llm).not.toHaveBeenCalled();
});
it("still grades a non-code submission when no run exists", async () => {
  runner.mockResolvedValue(null);
  llm.mockResolvedValue({ ok: true, text: JSON.stringify({ overallComment: "Reviewed", rubricResults: [{ area: "Correctness", score: "10/10" }] }) });
  const response = await POST(request({ ...body, entry: { ...body.entry, content: "An essay.", submittedFiles: [] } }));
  expect(response.status).toBe(200); expect(llm).toHaveBeenCalledOnce();
});
