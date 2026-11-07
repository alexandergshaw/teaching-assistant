import { beforeEach, describe, expect, it, vi } from "vitest";
vi.mock("../llm", () => ({ callLlm: vi.fn() }));
vi.mock("../canvas", () => ({ fetchCanvasWork: vi.fn(), fetchAssignmentPointsPossible: vi.fn() }));
import { callLlm } from "../llm";
import { fetchCanvasWork, fetchAssignmentPointsPossible } from "../canvas";
import { gradeCanvasUrl } from "./engine";
import { extractCanvasEntries } from "./extraction";

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(fetchAssignmentPointsPossible).mockResolvedValue(10);
});

describe("legacy Canvas grading video safety", () => {
  it("does not grade a mixed submission with an unsupported downloaded file", async () => {
    vi.mocked(fetchCanvasWork).mockResolvedValue({ kind: "assignment", dueAt: null, students: [{ student: "Blocked", userId: 1, text: "written work", files: [{ name: "drawing.psd", mimeType: "application/octet-stream", base64: "AAAA" }], contributionCount: 1 }] });
    const run = await gradeCanvasUrl("https://test.instructure.com/courses/1/assignments/1", "instructions", "rubric", "gemini");
    expect(run.results[0].ungraded?.message).toContain("drawing.psd");
    expect(callLlm).not.toHaveBeenCalled();
  });
  it("refuses ambiguous Canvas IDs in chat intake before producing entries", async () => {
    vi.mocked(fetchCanvasWork).mockResolvedValue({ kind: "assignment", dueAt: null, students: [
      { student: "A", userId: 1, text: "answer", files: [], contributionCount: 1, omittedAttachments: [{ name: "paper.pdf", reason: "download failed" }] },
      { student: "B", userId: 1, text: "answer", files: [], contributionCount: 1 },
    ] });
    await expect(extractCanvasEntries("https://test.instructure.com/courses/1/assignments/1")).rejects.toThrow("identities");
    expect(callLlm).not.toHaveBeenCalled();
  });
  it("isolates an omitted PDF while grading a healthy peer", async () => {
    vi.mocked(fetchCanvasWork).mockResolvedValue({ kind: "assignment", dueAt: null, students: [
      { student: "Same Name", userId: 1, text: "written work", files: [], contributionCount: 1, omittedAttachments: [{ name: "paper.pdf", reason: "download failed" }] },
      { student: "Same Name", userId: 2, text: "answer", files: [], contributionCount: 1 },
    ] });
    vi.mocked(callLlm).mockResolvedValue({ ok: true, text: JSON.stringify({ overallComment: "Good", rubricResults: [{ area: "Overall", score: "8/10" }], totalScore: "8/10" }) } as never);
    const run = await gradeCanvasUrl("https://test.instructure.com/courses/1/assignments/1", "instructions", "rubric", "gemini");
    expect(run.results[0].ungraded?.canvasUserId).toBe(1);
    expect(run.results[0].ungraded?.message).toContain("paper.pdf");
    expect(run.results[1].userId).toBe(2);
    expect(callLlm).toHaveBeenCalledTimes(1);
    expect(JSON.stringify(vi.mocked(callLlm).mock.calls)).not.toContain("written work");
  });
  it("does not grade a downloaded video carrying a misleading image filename", async () => {
    vi.mocked(fetchCanvasWork).mockResolvedValue({ kind: "assignment", dueAt: null, students: [{ student: "Blocked", userId: 1, text: "answer", files: [{ name: "upload.png", mimeType: "video/unknown", base64: "AAAA" }], contributionCount: 1 }] });
    const run = await gradeCanvasUrl("https://test.instructure.com/courses/1/assignments/1", "instructions", "rubric", "gemini");
    expect(run.results[0].ungraded?.kind).toBe("grading-failed");
    expect(callLlm).not.toHaveBeenCalled();
  });
  it("keeps unaffected students gradeable without sending the omitted video student to the model", async () => {
    vi.mocked(fetchCanvasWork).mockResolvedValue({ kind: "assignment", dueAt: null, students: [
      { student: "Same Name", userId: 1, text: "written work", files: [], contributionCount: 1, omittedVideos: [{ name: "demo.mp4", reason: "download failed" }] },
      { student: "Same Name", userId: 2, text: "answer", files: [], contributionCount: 1 },
    ] });
    vi.mocked(callLlm).mockResolvedValue({ ok: true, text: JSON.stringify({ overallComment: "Good", rubricResults: [{ area: "Overall", score: "8/10" }], totalScore: "8/10" }) } as never);
    const run = await gradeCanvasUrl("https://test.instructure.com/courses/1/assignments/1", "instructions", "rubric", "gemini");
    const blocked = run.results.find((result) => result.ungraded?.canvasUserId === 1);
    const healthy = run.results.find((result) => result.userId === 2);
    expect(blocked?.ungraded?.kind).toBe("grading-failed");
    expect(healthy?.ungraded).toBeUndefined();
    expect(blocked?.student).not.toBe(healthy?.student);
    expect(callLlm).toHaveBeenCalledTimes(1);
    expect(JSON.stringify(vi.mocked(callLlm).mock.calls)).not.toContain("written work");
  });
});