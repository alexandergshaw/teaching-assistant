import { expect, it, vi } from "vitest";
import type { NextRequest } from "next/server";
const llm = vi.hoisted(() => vi.fn()); const runner = vi.hoisted(() => vi.fn(async () => null));
vi.mock("@/lib/supabase/auth", () => ({ requireAppOwner: vi.fn(async () => ({ id: "owner" })) }));
vi.mock("@/lib/grade/extraction", () => ({ resolveEntryLinks: vi.fn(async (entry: unknown) => entry) }));
vi.mock("@/lib/code-runner", () => ({ runSubmittedCode: runner }));
vi.mock("@/lib/llm", async (original) => ({ ...await original<object>(), callLlm: llm }));
import { POST } from "./route";
const body = { sourceIndex: 0, entry: { student: "Synthetic", content: "int main() { return 0; }", mergedFileCount: 1, submittedFiles: [{ name: "main.cpp", extension: "cpp", previewContent: "int main() { return 0; }", previewTruncated: false }] }, assignmentInstructions: "Review code.", rubric: "Correctness (10 pts): Behavior", provider: "gemini", pointsPossible: 10 };
const request = (value: unknown) => ({ headers: new Headers({ "content-type": "application/json" }), json: async () => value } as NextRequest);
it("never runs reviewed nested code but leaves ordinary grading behavior unchanged", async () => {
  llm.mockResolvedValue({ ok: true, text: JSON.stringify({ overallComment: "Reviewed", rubricResults: [{ area: "Correctness", score: "10/10" }] }) });
  const staticResponse = await POST(request({ ...body, entry: { ...body.entry, staticOnly: true } })); expect(staticResponse.status).toBe(200); expect((await staticResponse.json()).result.staticOnly).toBe(true); expect(runner).not.toHaveBeenCalled(); expect(JSON.stringify(llm.mock.calls)).toMatch(/runtime behavior is unverified/i);
  const ordinaryResponse = await POST(request(body)); expect(ordinaryResponse.status).toBe(200); expect(runner).toHaveBeenCalledOnce();
});
