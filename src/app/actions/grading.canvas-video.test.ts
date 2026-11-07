import { describe, it, expect, vi, beforeEach } from "vitest";
vi.mock("@/lib/supabase/auth", () => ({ requireAppOwner: vi.fn(async () => ({ id: "owner" })), requireUser: vi.fn() }));
vi.mock("@/lib/canvas", async (original) => ({ ...(await original<typeof import("@/lib/canvas")>()), fetchCanvasWork: vi.fn(), fetchSubmissionDetail: vi.fn(), canvasWorkToZipBase64: vi.fn(), fetchAssignmentPointsPossible: vi.fn(async () => 10), getSpeedGraderUrl: vi.fn(async () => null) }));
vi.mock("@/lib/grade", async (original) => ({ ...(await original<typeof import("@/lib/grade")>()), gradeEntries: vi.fn(), gradeCanvasUrl: vi.fn(), synthesizeFullCreditChecklist: vi.fn(), generateSampleAnswer: vi.fn() }));
vi.mock("@/lib/grading-engine", async (original) => ({ ...(await original<typeof import("@/lib/grading-engine")>()), gradeViaGradingEngine: vi.fn() }));
vi.mock("@/lib/code-runner", async (original) => ({ ...(await original<typeof import("@/lib/code-runner")>()), attachCodeRuns: vi.fn(async () => undefined) }));
vi.mock("@/lib/embedded-grader", async (original) => ({ ...(await original<typeof import("@/lib/embedded-grader")>()), gradeEntriesEmbedded: vi.fn() }));
import { fetchCanvasWork, fetchSubmissionDetail, canvasWorkToZipBase64 } from "@/lib/canvas";
import { gradeEntries, gradeCanvasUrl, synthesizeFullCreditChecklist, generateSampleAnswer } from "@/lib/grade";
import { gradeViaGradingEngine } from "@/lib/grading-engine";
import { gradeEntriesEmbedded } from "@/lib/embedded-grader";
import { attachCodeRuns } from "@/lib/code-runner";
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
  it("isolates omitted video by Canvas ID in embedded grading", async () => {
    const actual = await vi.importActual<typeof import("@/lib/embedded-grader")>("@/lib/embedded-grader");
    vi.mocked(gradeEntriesEmbedded).mockImplementation(actual.gradeEntriesEmbedded);
    const healthy = { student: "Student", userId: 2, text: "written answer", files: [], contributionCount: 1 };
    vi.mocked(fetchCanvasWork).mockResolvedValue({ students: [work, healthy], kind: "assignment", dueAt: null });
    const form = new FormData();
    form.set("canvasUrl", "https://test.instructure.com/courses/1/assignments/1");
    form.set("provider", "embedded");
    form.set("assignmentInstructions", "Write a short answer.");

    const result = await gradeAction({} as never, form);
    expect(result.error).toBeFalsy();
    const rows = result.run!.results;
    expect(rows[0].ungraded?.canvasUserId).toBe(1);
    expect(rows[0].ungraded?.kind).toBe("grading-failed");
    expect(rows[1].userId).toBe(2);
    expect(rows[1].ungraded).toBeUndefined();
    expect(rows[0].student).not.toBe(rows[1].student);
    expect(vi.mocked(attachCodeRuns).mock.calls[0][0]).toEqual([expect.objectContaining({ userId: 2 })]);
  });
  it.each([
    ["omitted video-only", { ...work, text: "" }],
    ["downloaded video", { ...work, omittedVideos: [], files: [{ name: "demo.mp4", mimeType: "video/mp4", base64: "AAAA" }] }],
  ])("leaves %s ungraded when there are no healthy students", async (_label, student) => {
    const actual = await vi.importActual<typeof import("@/lib/embedded-grader")>("@/lib/embedded-grader");
    vi.mocked(gradeEntriesEmbedded).mockImplementation(actual.gradeEntriesEmbedded);
    vi.mocked(fetchCanvasWork).mockResolvedValue({ students: [student], kind: "assignment", dueAt: null });
    const form = new FormData();
    form.set("canvasUrl", "https://test.instructure.com/courses/1/assignments/1");
    form.set("provider", "embedded");
    form.set("assignmentInstructions", "Write a short answer.");
    const result = await gradeAction({} as never, form);
    expect(result.run?.results[0].ungraded?.canvasUserId).toBe(1);
    expect(result.run?.results[0].ungraded?.kind).toBe("grading-failed");
    expect(vi.mocked(attachCodeRuns).mock.calls[0][0]).toEqual([]);
  });
  it("isolates omitted PDF evidence in embedded grading", async () => {
    const actual = await vi.importActual<typeof import("@/lib/embedded-grader")>("@/lib/embedded-grader");
    vi.mocked(gradeEntriesEmbedded).mockImplementation(actual.gradeEntriesEmbedded);
    const blocked = { ...work, omittedVideos: [], omittedAttachments: [{ name: "paper.pdf", reason: "download failed" }] };
    const healthy = { student: "Student", userId: 2, text: "answer", files: [], contributionCount: 1 };
    vi.mocked(fetchCanvasWork).mockResolvedValue({ students: [blocked, healthy], kind: "assignment", dueAt: null });
    const form = new FormData();
    form.set("canvasUrl", "https://test.instructure.com/courses/1/assignments/1");
    form.set("provider", "embedded");
    form.set("assignmentInstructions", "Write a short answer.");
    const result = await gradeAction({} as never, form);
    expect(result.run?.results[0].ungraded?.message).toContain("paper.pdf");
    expect(result.run?.results[1].userId).toBe(2);
    expect(vi.mocked(attachCodeRuns).mock.calls[0][0]).toEqual([expect.objectContaining({ userId: 2 })]);
  });
  it("refuses an individual omitted document before any grading", async () => {
    vi.mocked(fetchSubmissionDetail).mockResolvedValue({ ...work, omittedVideos: [], omittedAttachments: [{ name: "paper.pdf", reason: "download failed" }] } as never);
    const result = await gradeOneSubmissionAction("TEST", "1", "1", 1);
    expect("error" in result && result.error).toContain("paper.pdf");
    expect(gradeEntries).not.toHaveBeenCalled();
    expect(gradeEntriesEmbedded).not.toHaveBeenCalled();
  });
  it("refuses an external mixed cohort with omitted document before ZIP packaging", async () => {
    const blocked = { ...work, omittedVideos: [], omittedAttachments: [{ name: "paper.pdf", reason: "download failed" }] };
    const healthy = { student: "Student", userId: 2, text: "answer", files: [], contributionCount: 1 };
    vi.mocked(fetchCanvasWork).mockResolvedValue({ students: [healthy, blocked], kind: "assignment", dueAt: null });
    const form = new FormData();
    form.set("canvasUrl", "https://test.instructure.com/courses/1/assignments/1");
    form.set("provider", "other");
    const result = await gradeAction({} as never, form);
    expect(result.error).toContain("paper.pdf");
    expect(canvasWorkToZipBase64).not.toHaveBeenCalled();
    expect(gradeViaGradingEngine).not.toHaveBeenCalled();
  });
  it.each(["gemini", "embedded"])("refuses duplicate Canvas IDs with omitted evidence for %s", async (provider) => {
    const blocked = { ...work, omittedVideos: [], omittedAttachments: [{ name: "paper.pdf", reason: "download failed" }] };
    const duplicate = { student: "Other", userId: 1, text: "answer", files: [], contributionCount: 1 };
    vi.mocked(fetchCanvasWork).mockResolvedValue({ students: [blocked, duplicate], kind: "assignment", dueAt: null });
    const form = new FormData();
    form.set("canvasUrl", "https://test.instructure.com/courses/1/assignments/1");
    form.set("provider", provider);
    const result = await gradeAction({} as never, form);
    expect(result.error).toContain("identities");
    expect(gradeCanvasUrl).not.toHaveBeenCalled();
    expect(gradeEntriesEmbedded).not.toHaveBeenCalled();
    expect(attachCodeRuns).not.toHaveBeenCalled();
  });
  it.each(["other"])("refuses a mixed %s whole-run before model fan-out", async (provider) => {
    const healthy = { student: "Student", userId: 2, text: "written answer", files: [], contributionCount: 1 };
    vi.mocked(fetchCanvasWork).mockResolvedValue({ students: [healthy, work], kind: "assignment", dueAt: null });
    const form = new FormData();
    form.set("canvasUrl", "https://test.instructure.com/courses/1/assignments/1");
    form.set("provider", provider);
    const result = await gradeAction({} as never, form);
    expect(result.error).toContain("demo.mp4");
    expect(canvasWorkToZipBase64).not.toHaveBeenCalled();
    expect(gradeViaGradingEngine).not.toHaveBeenCalled();
    expect(gradeCanvasUrl).not.toHaveBeenCalled();
    expect(gradeEntriesEmbedded).not.toHaveBeenCalled();
    expect(synthesizeFullCreditChecklist).not.toHaveBeenCalled();
    expect(generateSampleAnswer).not.toHaveBeenCalled();
  });
});
