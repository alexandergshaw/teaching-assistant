import { describe, expect, it, vi } from "vitest";
vi.mock("@/lib/supabase/auth", () => ({ requireAppOwner: vi.fn(async () => ({ id: "owner" })) }));
vi.mock("@/lib/grade/repo-content", () => ({ fetchGradableRepoContent: vi.fn() }));
vi.mock("@/lib/code-runner", () => ({ runSubmittedCode: vi.fn(async () => null) }));
vi.mock("@/lib/llm", async (original) => ({ ...await original<object>(), callLlm: vi.fn() }));
import { fetchGradableRepoContent } from "@/lib/grade/repo-content";
import { callLlm } from "@/lib/llm";
import { gradeEntries } from "@/lib/grade/engine";
import { prepareCompositeSubmissionAction } from "./grading-chat-intake";
import { POST } from "@/app/api/grade-run-item/route";
import { readFileSync } from "node:fs";
const input = () => { const data = new FormData(); data.set("student", "Justin"); data.set("partCount", "1"); data.set("part.0.kind", "text"); data.set("part.0.content", "https://github.com/owner/repo"); return data; };
describe("pasted repository through composite intake and engine", () => {
  it("keeps the active text entry wired to composite intake", () => {
    expect(readFileSync("src/app/components/grading-chat/ChatComposer.tsx", "utf8")).toContain('onText={(name, content) => onSubmitComposite(name, [{ kind: "text", content }])}');
  });
  it("sends resolved source evidence to the model", async () => {
    vi.mocked(fetchGradableRepoContent).mockResolvedValueOnce({ repo: "owner/repo", ref: "sha", content: "FIVE STRATEGIES ARE PRESENT", fileCount: 1, truncated: false, files: [{ path: "README.md", text: "FIVE STRATEGIES ARE PRESENT", truncated: false }] });
    vi.mocked(callLlm).mockResolvedValueOnce({ ok: true, text: JSON.stringify({ overallComment: "Reviewed.", rubricResults: [{ area: "Correctness", score: "10/10" }] }) } as never);
    const prepared = await prepareCompositeSubmissionAction(input()); expect(prepared.kind).toBe("entries"); if (prepared.kind !== "entries") return;
    const body = { sourceIndex: 0, entry: prepared.entries[0], assignmentInstructions: "Review", rubric: "Correctness (10 points)", provider: "gemini", pointsPossible: 10, autoRunCode: false };
    const response = await POST({ headers: new Headers({ "content-type": "application/json" }), json: async () => body } as never);
    expect(response.status).toBe(200);
    expect(JSON.stringify(vi.mocked(callLlm).mock.calls)).toContain("FIVE STRATEGIES ARE PRESENT");
  });
  it("holds an incomplete notebook without asking the model to score", async () => {
    vi.mocked(callLlm).mockClear();
    vi.mocked(fetchGradableRepoContent).mockResolvedValueOnce({ repo: "owner/repo", ref: "sha", content: "readme", fileCount: 1, truncated: true, files: [{ path: "README.md", text: "readme", truncated: false }], inventory: { source: "owner/repo @ sha", scope: { kind: "repository", path: null }, enumerationComplete: true, files: [{ path: "work.ipynb", content: "budget" }] } });
    const prepared = await prepareCompositeSubmissionAction(input()); expect(prepared.kind).toBe("entries"); if (prepared.kind !== "entries") return;
    const result = await gradeEntries(prepared.entries, "Review", "Correctness (10 points)", "gemini", 10, { autoRunCode: false });
    expect(result.results[0]).toMatchObject({ totalScore: "", ungraded: { kind: "grading-failed" } }); expect(callLlm).not.toHaveBeenCalled();
  });
});
