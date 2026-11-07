import { describe, it, expect, vi, beforeEach } from "vitest";
vi.mock("@/lib/supabase/auth", () => ({ requireAppOwner: vi.fn(async () => ({ id: "owner" })), requireUser: vi.fn() }));
vi.mock("@/lib/canvas", async (original) => ({ ...(await original<typeof import("@/lib/canvas")>()), fetchCanvasWork: vi.fn(), fetchSubmissionDetail: vi.fn() }));
vi.mock("@/lib/grade", async (original) => ({ ...(await original<typeof import("@/lib/grade")>()), gradeEntries: vi.fn(), gradeCanvasUrl: vi.fn(), synthesizeFullCreditChecklist: vi.fn(), generateSampleAnswer: vi.fn() }));
vi.mock("@/lib/embedded-grader", async (original) => ({ ...(await original<typeof import("@/lib/embedded-grader")>()), gradeEntriesEmbedded: vi.fn() }));
import { fetchCanvasWork, fetchSubmissionDetail } from "@/lib/canvas";
import { gradeEntries, gradeCanvasUrl, synthesizeFullCreditChecklist, generateSampleAnswer } from "@/lib/grade";
import { gradeEntriesEmbedded } from "@/lib/embedded-grader";
import { gradeAction, gradeOneSubmissionAction } from "./grading";
const work = { student: "Student", userId: 1, text: "written answer", files: [], contributionCount: 1, omittedVideos: [{ name: "demo.mp4", reason: "download failed" }] };
beforeEach(() => vi.clearAllMocks());
describe("Canvas action video safety", () => {
  it("refuses individual grading before grading or rubric generation", async () => {
    vi.mocked(fetchSubmissionDetail).mockResolvedValue(work as never);
    const result = await gradeOneSubmissionAction("TEST", "1", "1", 1);
    expect("error" in result && result.error).toContain("demo.mp4");
    expect(gradeEntries).not.toHaveBeenCalled();
    expect(gradeEntriesEmbedded).not.toHaveBeenCalled();
  });
  it("reuses the exact checked Canvas snapshot for Gemini grading", async () => {
    const students = [work];
    vi.mocked(fetchCanvasWork).mockResolvedValue({ students, kind: "assignment", dueAt: null });
    vi.mocked(gradeCanvasUrl).mockResolvedValue({ results: [], rubricAreaNames: [], fullCreditChecklist: [] } as never);
    vi.mocked(synthesizeFullCreditChecklist).mockResolvedValue([]);
    vi.mocked(generateSampleAnswer).mockResolvedValue("");
    const form = new FormData();
    form.set("canvasUrl", "https://test.instructure.com/courses/1/assignments/1");
    form.set("provider", "gemini");
    form.set("assignmentInstructions", "Answer the question.");
    form.set("rubric", "Correctness");
    await gradeAction({} as never, form);
    expect(fetchCanvasWork).toHaveBeenCalledTimes(1);
    expect(vi.mocked(gradeCanvasUrl).mock.calls[0]?.[5]).toBe(students);
  });
  it.each(["embedded", "other"])("refuses a mixed %s whole-run before model fan-out", async (provider) => {
    vi.mocked(fetchCanvasWork).mockResolvedValue({ students: [work], kind: "assignment", dueAt: null });
    const form = new FormData();
    form.set("canvasUrl", "https://test.instructure.com/courses/1/assignments/1");
    form.set("provider", provider);
    const result = await gradeAction({} as never, form);
    expect(result.error).toContain("demo.mp4");
    expect(gradeCanvasUrl).not.toHaveBeenCalled();
    expect(gradeEntriesEmbedded).not.toHaveBeenCalled();
    expect(synthesizeFullCreditChecklist).not.toHaveBeenCalled();
    expect(generateSampleAnswer).not.toHaveBeenCalled();
  });
});
