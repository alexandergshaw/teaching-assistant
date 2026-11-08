import { describe, it, expect, vi, beforeEach } from "vitest";
import JSZip from "jszip";
vi.mock("@/lib/supabase/auth", () => ({ requireAppOwner: vi.fn(async () => ({ id: "owner" })), requireUser: vi.fn() }));
vi.mock("@/lib/canvas", async (original) => ({ ...(await original<typeof import("@/lib/canvas")>()), fetchCanvasWork: vi.fn(), fetchSubmissionDetail: vi.fn(), fetchCanvasMeta: vi.fn(async () => ({ description: "instructions", rubricText: "rubric", linkedFileIds: [] })), canvasWorkToZipBase64: vi.fn(), fetchAssignmentPointsPossible: vi.fn(async () => 10), getSpeedGraderUrl: vi.fn(async () => null) }));
vi.mock("@/lib/grade", async (original) => ({ ...(await original<typeof import("@/lib/grade")>()), gradeEntries: vi.fn(), gradeCanvasUrl: vi.fn(), synthesizeFullCreditChecklist: vi.fn(), generateSampleAnswer: vi.fn() }));
vi.mock("@/lib/grading-engine", async (original) => ({ ...(await original<typeof import("@/lib/grading-engine")>()), gradeViaGradingEngine: vi.fn() }));
vi.mock("@/lib/code-runner", async (original) => ({ ...(await original<typeof import("@/lib/code-runner")>()), attachCodeRuns: vi.fn(async () => undefined) }));
vi.mock("@/lib/embedded-grader", async (original) => ({ ...(await original<typeof import("@/lib/embedded-grader")>()), gradeEntriesEmbedded: vi.fn() }));
import { fetchCanvasWork, fetchSubmissionDetail, fetchCanvasMeta, canvasWorkToZipBase64 } from "@/lib/canvas";
import { gradeEntries, gradeCanvasUrl, synthesizeFullCreditChecklist, generateSampleAnswer } from "@/lib/grade";
import { gradeViaGradingEngine } from "@/lib/grading-engine";
import { gradeEntriesEmbedded } from "@/lib/embedded-grader";
import { attachCodeRuns } from "@/lib/code-runner";
import { gradeAction, gradeOneSubmissionAction } from "./grading";
const work = { student: "Student", userId: 1, text: "written answer", files: [], contributionCount: 1, omittedVideos: [{ name: "demo.mp4", reason: "download failed" }] };
beforeEach(() => vi.clearAllMocks());
async function office(kind: "docx" | "pptx", picture: boolean, text = true): Promise<string> {
  const zip = new JSZip();
  const image = picture ? kind === "docx" ? '<w:drawing><a:blip r:embed="img"/></w:drawing>' : '<p:pic><a:blip r:embed="img"/></p:pic>' : "";
  if (kind === "docx") zip.file("word/document.xml", `<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main" xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><w:body><w:p><w:r><w:t>${text ? "answer" : ""}</w:t>${image}</w:r></w:p></w:body></w:document>`);
  else zip.file("ppt/slides/slide1.xml", `<p:sld xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main" xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><p:cSld><p:spTree>${text ? "<a:t>answer</a:t>" : ""}${image}</p:spTree></p:cSld></p:sld>`);
  const folder = kind === "docx" ? "word" : "ppt/slides", part = kind === "docx" ? "document" : "slide1";
  if (picture) { zip.file(`${folder}/_rels/${part}.xml.rels`, `<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="img" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/image" Target="${kind === "docx" ? "" : "../"}media/image.png"/></Relationships>`); zip.file(kind === "docx" ? "word/media/image.png" : "ppt/media/image.png", Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9Wl6l1sAAAAASUVORK5CYII=", "base64")); }
  return (await zip.generateAsync({ type: "nodebuffer" })).toString("base64");
}
describe("Canvas action video safety", () => {
  it("keeps text-only Office gradeable and leaves visually incomplete Canvas students ungraded in the embedded path", async () => {
    const actual = await vi.importActual<typeof import("@/lib/embedded-grader")>("@/lib/embedded-grader");
    vi.mocked(gradeEntriesEmbedded).mockImplementation(actual.gradeEntriesEmbedded);
    const student = (id: number, name: string, base64: string, text = "answer") => ({ student: `Student ${id}`, userId: id, text, files: [{ name, mimeType: name.endsWith("pptx") ? "application/vnd.openxmlformats-officedocument.presentationml.presentation" : "application/vnd.openxmlformats-officedocument.wordprocessingml.document", base64 }], contributionCount: 2 });
    const students = [student(1, "drawing.docx", await office("docx", true)), student(2, "slides.pptx", await office("pptx", true)), student(3, "text.docx", await office("docx", false)), student(4, "bad.docx", Buffer.from("not an archive").toString("base64")), student(5, "image-only.docx", await office("docx", true, false), ""), student(6, "image-only.pptx", await office("pptx", true, false), "")];
    vi.mocked(fetchCanvasWork).mockResolvedValue({ students, kind: "assignment", dueAt: null });
    const form = new FormData(); form.set("canvasUrl", "https://test.instructure.com/courses/1/assignments/1"); form.set("provider", "embedded"); form.set("assignmentInstructions", "Write a short answer.");
    const result = await gradeAction({} as never, form);
    expect(result.error).toBeFalsy();
    expect(result.run?.results.map((row) => row.ungraded?.kind ?? "graded")).toEqual(["grading-failed", "grading-failed", "graded", "grading-failed", "grading-failed", "grading-failed"]);
    expect(result.run?.results[0].ungraded?.message).toContain("drawing.docx");
    expect(result.run?.results[1].ungraded?.message).toContain("slides.pptx");
    expect(vi.mocked(attachCodeRuns).mock.calls[0][0]).toEqual([expect.objectContaining({ userId: 3 })]);
  });
  it("does not score a single Canvas DOCX picture with the deterministic grader", async () => {
    const actual = await vi.importActual<typeof import("@/lib/embedded-grader")>("@/lib/embedded-grader");
    vi.mocked(gradeEntriesEmbedded).mockImplementation(actual.gradeEntriesEmbedded);
    vi.mocked(fetchCanvasMeta).mockResolvedValueOnce({ description: "Write a short answer.", rubricText: "", linkedFileIds: [] } as never);
    vi.mocked(fetchSubmissionDetail).mockResolvedValue({ student: "Ada", userId: 7, text: "answer", files: [{ name: "picture.docx", mimeType: "application/vnd.openxmlformats-officedocument.wordprocessingml.document", base64: await office("docx", true) }], canvasUrl: "https://test.instructure.com/courses/1/assignments/1", assignmentName: "A", pointsPossible: 10 } as never);
    const result = await gradeOneSubmissionAction("TEST", "1", "1", 7, "embedded");
    expect("run" in result && result.run.results[0].ungraded?.message).toContain("picture.docx");
    expect(vi.mocked(attachCodeRuns).mock.calls[0][0]).toEqual([]);
  });
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
  it("refuses a downloaded unsupported file before individual grading", async () => {
    const detail = { ...work, omittedVideos: [], files: [{ name: "drawing.psd", mimeType: "application/octet-stream", base64: "AAAA" }], canvasUrl: "https://test.instructure.com/courses/1/assignments/1", assignmentName: "A", pointsPossible: 10 };
    vi.mocked(fetchSubmissionDetail).mockResolvedValue(detail as never);
    const result = await gradeOneSubmissionAction("TEST", "1", "1", 1);
    expect("error" in result && result.error).toContain("drawing.psd");
    expect(gradeEntries).not.toHaveBeenCalled();
    expect(gradeEntriesEmbedded).not.toHaveBeenCalled();
  });
  it("refuses an unsupported Canvas file before external ZIP or service invocation", async () => {
    const student = { ...work, omittedVideos: [], submissionUrl: "https://github.com/example/student", files: [{ name: "drawing.psd", mimeType: "application/octet-stream", base64: "AAAA" }] };
    vi.mocked(fetchCanvasWork).mockResolvedValue({ students: [student], kind: "assignment", dueAt: null });
    const form = new FormData();
    form.set("canvasUrl", "https://test.instructure.com/courses/1/assignments/1");
    form.set("provider", "other");
    const result = await gradeAction({} as never, form);
    expect(result.error).toContain("drawing.psd");
    expect(canvasWorkToZipBase64).not.toHaveBeenCalled();
    expect(gradeViaGradingEngine).not.toHaveBeenCalled();
  });
  it("still submits a normal external Canvas assignment to the ZIP service", async () => {
    const healthy = { student: "Student", userId: 2, text: "answer", files: [], contributionCount: 1 };
    vi.mocked(fetchCanvasWork).mockResolvedValue({ students: [healthy], kind: "assignment", dueAt: null });
    vi.mocked(canvasWorkToZipBase64).mockResolvedValue("ZIP");
    vi.mocked(gradeViaGradingEngine).mockResolvedValue({ result_id: "result", criteria: [], students: [], warnings: [], csv: "" });
    const form = new FormData();
    form.set("canvasUrl", "https://test.instructure.com/courses/1/assignments/1");
    form.set("provider", "other");
    form.set("rubric", "Correctness");
    const result = await gradeAction({} as never, form);
    expect(result.error).toBeNull();
    expect(canvasWorkToZipBase64).toHaveBeenCalledWith([healthy]);
    expect(gradeViaGradingEngine).toHaveBeenCalledTimes(1);
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
