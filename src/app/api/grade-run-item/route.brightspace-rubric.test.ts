import { expect, it, vi } from "vitest";
import type { NextRequest } from "next/server";
const llm = vi.hoisted(() => vi.fn());
vi.mock("@/lib/supabase/auth", () => ({ requireAppOwner: vi.fn(async () => ({ id: "owner" })) }));
vi.mock("@/lib/grade/extraction", () => ({ resolveEntryLinks: vi.fn(async (entry: unknown) => entry) }));
vi.mock("@/lib/code-runner", () => ({ runSubmittedCode: vi.fn(async () => null) }));
vi.mock("@/lib/llm", async (original) => ({ ...await original<object>(), callLlm: llm }));
import { POST } from "./route";
const names = ["Code Reflection", "Pseudocode or Flowchart", "Specifications and Correctness: Algorithm", "Specifications and Correctness: Data Structure", "Annotation and Documentation", "Modular and Reusable", "Readability"];
const weights = [25, 10, 20, 20, 10, 10, 5];
const rubric = ["Criteria", "Meets Expectations (100%)", "Partially Meets Expectations (70%)", "Does Not Meet Expectations (0%)", "Value", ...names.flatMap((name, i) => [name, "Complete work", "Partial work", "Missing work", String(weights[i])]), "Total:", "100%"].join("\n");
it("grades using the actual criteria and not the flattened table rating labels", async () => {
  llm.mockResolvedValue({ ok: true, text: JSON.stringify({ overallComment: "Reviewed", rubricResults: names.map((area, i) => ({ area, score: `${weights[i]}/${weights[i]}` })) }) });
  const request = { sourceIndex: 0, entry: { student: "Synthetic", content: "Synthetic work", mergedFileCount: 0, submittedFiles: [] }, assignmentInstructions: "Review this synthetic work.", rubric, provider: "gemini", pointsPossible: 100 };
  const response = await POST({ headers: new Headers({ "content-type": "application/json" }), json: async () => request } as NextRequest);
  const body = await response.json(); expect(response.status).toBe(200);
  expect(body.result.rubricAreas.map((area: { area: string }) => area.area)).toEqual(names);
  expect(body.result.totalScore).toBe("100/100");
  expect(JSON.stringify(llm.mock.calls[0][0])).toContain("Specifications and Correctness: Data Structure");
});
it.each([rubric.replace("\n25\n", "\nmissing\n"), rubric.replace("Criteria\n", "").replace("Partially Meets Expectations (70%)\n", ""), rubric.replace("Partially Meets Expectations (70%)\n", "").replace("Does Not Meet Expectations (0%)\n", "").replace("Meets Expectations (100%)", "Heading\nExtra\nMore\nText\nMeets Expectations (100%)"), rubric.replace("Code Reflection", "Code-Style").replace("Pseudocode or Flowchart", "Code Style"), `${rubric}\n${rubric}`])("does not invoke the model for a malformed recognized table", async (bad) => {
  llm.mockClear();
  const request = { sourceIndex: 0, entry: { student: "Synthetic", content: "Synthetic work", mergedFileCount: 0, submittedFiles: [] }, assignmentInstructions: "Review this synthetic work.", rubric: bad, provider: "gemini", pointsPossible: 100 };
  const response = await POST({ headers: new Headers({ "content-type": "application/json" }), json: async () => request } as NextRequest);
  expect(response.status).not.toBe(200); expect(llm).not.toHaveBeenCalled();
});
