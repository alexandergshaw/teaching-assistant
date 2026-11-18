import { afterEach, expect, it, vi } from "vitest";
import { notebookGradeBinding } from "@/lib/grade/notebook-grade-binding";
import { cancelNotebookJob, confirmNotebookRecovery, discoverNotebookJob, listNotebookJobs, matchNotebookJob, pollNotebookJob, startNotebookJob, restoreNotebookRequest } from "./notebookJobClient";
import type { GradeRunItemRequestBody } from "@/app/components/grading/incrementalRunPlan";

const session = { accountId: "owner", sessionId: "session" };
const request = { expectedOwnerSession: session, sourceIndex: 2, entry: { student: "Student", content: "work", mergedFileCount: 0, submittedFiles: [] }, assignmentInstructions: "Instructions", rubric: "Rubric", provider: "gemini", pointsPossible: 10 } as GradeRunItemRequestBody;
const source = { owner: "owner", repo: "repo", commit: "a".repeat(40), path: "work.ipynb", sourceUrl: "https://github.com/owner/repo" };
const canonical = "11111111-1111-4111-8111-111111111111";
afterEach(() => vi.unstubAllGlobals());

it("binds the exact wire request and discards server observations", async () => {
  const fetcher = vi.fn(async (_url: string, _init: RequestInit) => new Response(JSON.stringify({ status: "succeeded", attempt: canonical, result: { arbitrary: "not evidence" } }), { status: 200 }));
  vi.stubGlobal("fetch", fetcher);
  expect(await startNotebookJob(request, source, "attempt")).toEqual({ status: "succeeded", attempt: canonical });
  const sent = JSON.parse(fetcher.mock.calls[0][1]!.body as string);
  expect(sent).toMatchObject({ operation: "start", session, attempt: "attempt", ...source, gradeRequest: request });
});

it("restores only an exact owner, source and request binding", async () => {
  const original = { ...request, entry: { ...request.entry, submissionUrl: source.sourceUrl } };
  const row = { attempt_id: "attempt", grade_binding_sha256: await notebookGradeBinding(original), source_url: source.sourceUrl, notebook_path: source.path, commit_sha: source.commit, status: "succeeded" as const, expires_at: "2026-11-18T00:00:00Z" };
  const fetcher = vi.fn().mockResolvedValue(new Response(JSON.stringify({ gradeRequest: original })));
  vi.stubGlobal("fetch", fetcher);
  expect(await restoreNotebookRequest(session, row)).toEqual(original);
  fetcher.mockResolvedValue(new Response(JSON.stringify({ gradeRequest: { ...original, rubric: "changed" } })));
  await expect(restoreNotebookRequest(session, row)).rejects.toThrow("could not be verified");
});

it("polls and cancels with owner session, rejecting unknown responses", async () => {
  const fetcher = vi.fn().mockResolvedValueOnce(new Response(JSON.stringify({ status: "running" }))).mockResolvedValueOnce(new Response(JSON.stringify({ status: "cancelled" }))).mockResolvedValueOnce(new Response(JSON.stringify({ status: "unexpected" })));
  vi.stubGlobal("fetch", fetcher);
  expect(await pollNotebookJob(session, "attempt")).toBe("running");
  expect(await cancelNotebookJob(session, "attempt")).toBe("cancelled");
  await expect(pollNotebookJob(session, "attempt")).rejects.toThrow("status is unavailable");
  expect(JSON.parse(fetcher.mock.calls[0][1].body)).toEqual({ operation: "poll", session, attempt: "attempt" });
});

it("does not start without a resolved immutable commit", async () => {
  const fetcher = vi.fn(); vi.stubGlobal("fetch", fetcher);
  await expect(startNotebookJob(request, { ...source, commit: "main" }, "attempt")).rejects.toThrow("repository revision");
  expect(fetcher).not.toHaveBeenCalled();
});

it("never sends a prior receipt in a newly started grading request", async () => {
  const fetcher = vi.fn(async (_url: string, _init: RequestInit) => new Response(JSON.stringify({ status: "running", attempt: canonical })));
  vi.stubGlobal("fetch", fetcher);
  await startNotebookJob({ ...request, rubric: "Updated", notebookAttempt: "old-attempt" }, source, "new-attempt");
  const sent = JSON.parse(fetcher.mock.calls[0][1]!.body as string);
  expect(sent.gradeRequest.rubric).toBe("Updated");
  expect(sent.gradeRequest).not.toHaveProperty("notebookAttempt");
});
it("rejects a missing or malformed canonical attempt", async () => {
  vi.stubGlobal("fetch", vi.fn().mockResolvedValueOnce(new Response(JSON.stringify({ status: "running" }))).mockResolvedValueOnce(new Response(JSON.stringify({ status: "succeeded", attempt: "not-a-uuid" }))));
  await expect(startNotebookJob(request, source, "attempt")).rejects.toThrow("status is unavailable");
  await expect(startNotebookJob(request, source, "attempt")).rejects.toThrow("status is unavailable");
});

it("discovers only an immutable notebook and lists server-owned attempts", async () => {
  const row = { attempt_id: canonical, grade_binding_sha256: "b".repeat(64), source_url: source.sourceUrl, notebook_path: source.path, commit_sha: source.commit, status: "running", expires_at: "2026-11-18T00:00:00Z" };
  const fetcher = vi.fn().mockResolvedValueOnce(new Response(JSON.stringify({ notebook: { ...source, kind: "notebook" } }))).mockResolvedValueOnce(new Response(JSON.stringify({ attempts: [row] })));
  vi.stubGlobal("fetch", fetcher);
  expect(await discoverNotebookJob(session, source.sourceUrl)).toEqual(source);
  expect(await listNotebookJobs(session)).toEqual([row]);
});
it("accepts a recovering ledger row without losing the list", async () => {
  const row = { attempt_id: canonical, grade_binding_sha256: "b".repeat(64), source_url: source.sourceUrl, notebook_path: source.path, commit_sha: source.commit, status: "recovering", expires_at: "2026-11-18T00:00:00Z" };
  vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(JSON.stringify({ attempts: [row] }))));
  expect(await listNotebookJobs(session)).toEqual([row]);
});
it("requires server-confirmed cancellation before recovering failed work", async () => {
  const row = { attempt_id: canonical, grade_binding_sha256: "b".repeat(64), source_url: source.sourceUrl, notebook_path: source.path, commit_sha: source.commit, status: "failed" as const, expires_at: "2026-11-18T00:00:00Z" };
  const fetcher = vi.fn().mockResolvedValueOnce(new Response(JSON.stringify({ status: "unknown" }))).mockResolvedValueOnce(new Response(JSON.stringify({ status: "cancelled" })));
  vi.stubGlobal("fetch", fetcher);
  expect(await confirmNotebookRecovery(session, row)).toBe(false);
  expect(await confirmNotebookRecovery(session, row)).toBe(true);
  expect(await confirmNotebookRecovery(session, { ...row, status: "cancelled" })).toBe(true);
  expect(fetcher).toHaveBeenCalledTimes(2);
});

it("only recovers a unique attempt matching the exact grading request and source", async () => {
  const row = { attempt_id: "attempt", grade_binding_sha256: await notebookGradeBinding(request), source_url: source.sourceUrl, notebook_path: source.path, commit_sha: source.commit, status: "succeeded" as const, expires_at: "2026-11-18T00:00:00Z" };
  expect(await matchNotebookJob(request, source.sourceUrl, [row])).toEqual(row);
  expect(await matchNotebookJob(request, source.sourceUrl, [{ ...row, status: "cancelling" }])).toMatchObject({ status: "cancelling" });
  expect(await matchNotebookJob(request, source.sourceUrl, [{ ...row, status: "recovering" }])).toMatchObject({ status: "recovering" });
  expect(await matchNotebookJob(request, source.sourceUrl, [{ ...row, status: "retryable" }])).toMatchObject({ status: "retryable" });
  expect(await matchNotebookJob(request, source.sourceUrl, [{ ...row, status: "retryable" }, { ...row, status: "running" }])).toMatchObject({ status: "running" });
  expect(await matchNotebookJob({ ...request, rubric: "Changed" }, source.sourceUrl, [row])).toBeNull();
  expect(await matchNotebookJob(request, "https://github.com/other/repo", [row])).toBeNull();
  await expect(matchNotebookJob(request, source.sourceUrl, [row, row])).rejects.toThrow("Multiple notebook attempts");
});
