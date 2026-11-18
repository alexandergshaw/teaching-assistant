import { expect, it, vi } from "vitest";
const m = vi.hoisted(() => ({ load: vi.fn() }));
vi.mock("server-only", () => ({}));
vi.mock("./notebook-attempt-store", () => ({ loadNotebookAttempt: m.load }));
import { notebookGradeBinding } from "./notebook-grade-binding";
import { notebookGradeHandoff } from "./notebook-grade-handoff";
const session = { accountId: "a", sessionId: "s" }, source = "https://github.com/o/r", commit = "a".repeat(40);
it("only hands off observations for the exact request, URL and commit", async () => {
  const request = { entry: { student: "A", submissionUrl: source }, rubric: "Score (10)", notebookAttempt: "attempt" };
  const row = { status: "succeeded", expires_at: "2999-01-01T00:00:00Z", source_url: source, commit_sha: commit, notebook_path: "work.ipynb", grade_binding_sha256: await notebookGradeBinding(request), expected_cells: [0], result: { ok: true, expected: [0], observed: [0], errors: [], outputs: [], images: [] } };
  m.load.mockResolvedValue(row);
  expect(await notebookGradeHandoff(session, "attempt", request, source, commit)).toMatchObject({ codeRun: { notebookExecutionObserved: true, entryPoint: "work.ipynb" }, images: [] });
  expect(await notebookGradeHandoff(session, "attempt", { ...request, rubric: "Changed" }, source, commit)).toBeNull();
  expect(await notebookGradeHandoff(session, "attempt", request, `${source}/other`, commit)).toBeNull();
  expect(await notebookGradeHandoff(session, "attempt", request, source, "b".repeat(40))).toBeNull();
});
it("attaches validated observed PNGs and never embeds their base64 in text", async () => {
  const png = "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=";
  const request = { entry: { student: "A", submissionUrl: source }, rubric: "Score (10)", notebookAttempt: "attempt" };
  m.load.mockResolvedValue({ status: "succeeded", expires_at: "2999-01-01T00:00:00Z", source_url: source, commit_sha: commit, notebook_path: "work.ipynb", grade_binding_sha256: await notebookGradeBinding(request), expected_cells: [0], result: { ok: true, expected: [0], observed: [0], errors: [], outputs: [], images: [{ cell: 0, base64: png }] } });
  const handoff = await notebookGradeHandoff(session, "attempt", request, source, commit);
  expect(handoff?.images).toEqual([{ name: "Observed cell 1 output", mimeType: "image/png", base64: png }]);
  expect(handoff?.codeRun.stdout).not.toContain(png);
});
