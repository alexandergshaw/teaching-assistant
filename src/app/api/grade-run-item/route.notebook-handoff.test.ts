import { afterEach, beforeEach, expect, it, vi } from "vitest";
import type { NextRequest } from "next/server";
const m = vi.hoisted(() => ({ resolve: vi.fn(), handoff: vi.fn(), grade: vi.fn(), verify: vi.fn(), exact: vi.fn() }));
vi.mock("@/lib/supabase/auth", () => ({ requireAppOwner: vi.fn(async () => ({ id: "11111111-1111-4111-8111-111111111111" })) }));
vi.mock("@/lib/supabase/single-zip-owner-session", () => ({ verifySingleZipOwnerSession: m.verify }));
vi.mock("@/lib/grade/extraction", () => ({ resolveEntryLinks: m.resolve }));
vi.mock("@/lib/grade/notebook-grade-handoff", () => ({ notebookGradeHandoff: m.handoff }));
vi.mock("@/lib/grade/notebook-single-source", () => ({ isExactNotebookRepositoryEntry: m.exact }));
vi.mock("@/lib/grade/engine", () => ({ gradeEntries: m.grade }));
import { POST } from "./route";
const session = { accountId: "11111111-1111-4111-8111-111111111111", sessionId: "22222222-2222-4222-8222-222222222222" };
const url = "https://github.com/owner/repo", sha = "a".repeat(40);
const body = { sourceIndex: 0, expectedOwnerSession: session, notebookAttempt: "33333333-3333-4333-8333-333333333333", entry: { student: "Synthetic", content: "Part 1 - old source", submissionUrl: url, gradedRepo: "owner/repo", gradedRef: sha, mergedFileCount: 1, submittedFiles: [{ name: "fake.py", extension: "py", previewContent: "forged", previewTruncated: false }] }, assignmentInstructions: "Grade.", rubric: "Correctness (10 points)", provider: "gemini", pointsPossible: 10 };
const request = () => ({ headers: new Headers({ "content-type": "application/json" }), json: async () => body } as NextRequest);
beforeEach(() => {
  vi.clearAllMocks(); vi.stubEnv("CODE_RUNNER_NOTEBOOK_DURABLE_ENABLED", "true"); m.verify.mockResolvedValue(true); m.exact.mockResolvedValue(true);
  m.resolve.mockImplementation(async (entry: Record<string, unknown>) => ({ ...entry, content: "fresh source", gradedRepo: "owner/repo", gradedRef: sha, submittedFiles: [{ name: "work.ipynb", extension: "ipynb", previewContent: "fresh", previewTruncated: false }], linkFetch: "ok" }));
  m.handoff.mockResolvedValue({ codeRun: { language: "python", files: ["work.ipynb"], ran: true, exitCode: 0, stdout: "observed", stderr: "", notebookExecutionObserved: true }, images: [] });
  m.grade.mockResolvedValue({ results: [{ student: "Synthetic", totalScore: "10/10", rubricAreas: [], strengths: "ok", improvements: "", overallComment: "ok", feedback: "ok" }] });
});
afterEach(() => vi.unstubAllEnvs());
it("rebuilds the source and attaches only server-verified observations", async () => {
  const response = await POST(request()); expect(response.status).toBe(200);
  expect(m.resolve.mock.calls[0][0]).toMatchObject({ content: `Submitted link: ${url}`, submittedFiles: [] });
  expect(m.handoff).toHaveBeenCalledWith(session, body.notebookAttempt, body, url, sha);
  expect(m.grade.mock.calls[0][0][0]).toMatchObject({ content: "fresh source", codeRun: { notebookExecutionObserved: true } });
});
it("refuses mismatched or unavailable stored evidence", async () => {
  m.handoff.mockResolvedValue(null); expect((await POST(request())).status).toBe(422); expect(m.grade).not.toHaveBeenCalled();
});
it("does not grade when reconstructed source excludes companion evidence", async () => {
  m.exact.mockResolvedValue(false); expect((await POST(request())).status).toBe(422); expect(m.handoff).not.toHaveBeenCalled(); expect(m.grade).not.toHaveBeenCalled();
});
it("cannot bypass notebook execution by omitting the receipt", async () => {
  const { notebookAttempt: _omitted, ...withoutReceipt } = body;
  const response = await POST({ headers: new Headers({ "content-type": "application/json" }), json: async () => withoutReceipt } as NextRequest);
  expect(response.status).toBe(422); expect(m.grade).not.toHaveBeenCalled();
});
