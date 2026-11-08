import { describe, it, expect, vi, beforeEach } from "vitest";
import type { NextRequest } from "next/server";

vi.mock("@/lib/canvas-fetch", () => ({ canvasFetch: vi.fn() }));
vi.mock("@/lib/supabase/auth", () => ({ requireAppOwner: vi.fn(async () => ({ id: "owner" })) }));
vi.mock("@/lib/llm", async original => ({ ...await original<typeof import("@/lib/llm")>(), callLlm: vi.fn() }));
vi.mock("@/lib/code-runner", () => ({ runSubmittedCode: vi.fn(async () => null) }));
import { canvasFetch } from "@/lib/canvas-fetch";
import { callLlm } from "@/lib/llm";
import { fetchAssignment } from "@/lib/canvas/submissions";
import { canvasVideoRefusal } from "@/lib/canvas/omitted-video";
import { canvasWorkToEntry } from "@/lib/grade/extraction";
import { POST } from "@/app/api/grade-run-item/route";
import { buildRunItemRequests, stripUnneededRawBase64 } from "@/app/components/grading/incrementalRunPlan";

const fetchMock = vi.mocked(canvasFetch);
const institution = { code: "TEST", name: "Test", host: "test.instructure.com" };
const success = (value: unknown) => ({ ok: true as const, status: 200, headers: {}, body: Buffer.from(JSON.stringify(value)) });

beforeEach(() => { fetchMock.mockReset(); vi.mocked(callLlm).mockReset(); });

describe("Canvas omitted video intake", () => {
  it("requests the bounded attachment allowance for an eligible video", async () => {
    fetchMock.mockResolvedValueOnce(success([{ user_id: 1, workflow_state: "submitted", user: { name: "Student" }, attachments: [{ filename: "demo.mp4", url: "https://test.instructure.com/file" }] }]));
    fetchMock.mockResolvedValueOnce({ ok: true, status: 200, headers: {}, body: Buffer.alloc(6 * 1024 * 1024) });
    const [student] = await fetchAssignment("https://test.instructure.com", "token", institution, "1", "1");
    expect(fetchMock.mock.calls[1][1]).toMatchObject({ responseByteLimit: 15 * 1024 * 1024 });
    expect(student.files[0].name).toBe("demo.mp4");
  });
  it.each(["gif", "bmp"])("marks unsupported %s image evidence even if Canvas labels it PNG", async (ext) => {
    const entry = await canvasWorkToEntry({ student: "Student", userId: 1, text: "answer", files: [{ name: `image.${ext}`, mimeType: "image/png", base64: "AAAA" }], contributionCount: 1 });
    expect(entry.submittedFiles).toContainEqual(expect.objectContaining({ name: `image.${ext}`, mimeType: "application/x-canvas-attachment-unreadable" }));
  });
  it("marks downloaded but unsupported Canvas attachments as unavailable evidence", async () => {
    const entry = await canvasWorkToEntry({ student: "Student", userId: 1, text: "answer", files: [{ name: "drawing.psd", mimeType: "application/octet-stream", base64: "AAAA" }], contributionCount: 1 });
    expect(entry.submittedFiles).toContainEqual(expect.objectContaining({ name: "drawing.psd", mimeType: "application/x-canvas-attachment-unreadable" }));
  });
  it("does not mark empty text as unavailable", async () => {
    const entry = await canvasWorkToEntry({ student: "Student", userId: 1, text: "", files: [
      { name: "empty.txt", mimeType: "text/plain", base64: "" },
    ], contributionCount: 1 });
    expect(entry.submittedFiles.some((file) => file.mimeType === "application/x-canvas-attachment-unavailable" || file.mimeType === "application/x-canvas-attachment-unreadable")).toBe(false);
  });
  it.each([
    ["missing URL", { filename: "paper.pdf" }, undefined],
    ["declared oversize", { filename: "paper.pdf", url: "https://test.instructure.com/file", size: 16 * 1024 * 1024 }, undefined],
    ["non-OK", { filename: "paper.pdf", url: "https://test.instructure.com/file" }, { ok: false, status: 404, headers: {}, body: Buffer.alloc(0) }],
    ["thrown download", { filename: "paper.pdf", url: "https://test.instructure.com/file" }, "throw"],
    ["oversize bytes", { filename: "paper.pdf", url: "https://test.instructure.com/file" }, { ok: true, status: 200, headers: {}, body: Buffer.alloc(16 * 1024 * 1024) }],
  ])("retains a nonvideo-only student after %s", async (_label, attachment, download) => {
    fetchMock.mockResolvedValueOnce(success([{ user_id: 1, workflow_state: "submitted", user: { name: "Student" }, attachments: [attachment] }]));
    if (download === "throw") fetchMock.mockRejectedValueOnce(new Error("private detail"));
    else if (download) fetchMock.mockResolvedValueOnce(download as never);
    const [student] = await fetchAssignment("https://test.instructure.com", "token", institution, "1", "1");
    expect(student.omittedAttachments?.[0].name).toBe("paper.pdf");
    expect(JSON.stringify(student.omittedAttachments)).not.toContain("private detail");
    const entry = await canvasWorkToEntry(student);
    expect(entry.submittedFiles).toContainEqual(expect.objectContaining({ name: "paper.pdf", mimeType: "application/x-canvas-attachment-unavailable" }));
  });

  it("bounds and sanitizes names before showing a refusal", () => {
    const refusal = canvasVideoRefusal([{ student: "Student\nhttps://example.com/private", files: [], omittedVideos: [{ name: "demo.mp4", reason: "download failed" }] }]);
    expect(refusal).not.toContain("https://");
    expect(refusal).not.toContain("\n");
    expect(refusal).toContain("demo.mp4");
  });
  it("keeps video classification when Canvas supplies a generic filename and video display name", async () => {
    fetchMock.mockResolvedValueOnce(success([{ user_id: 1, workflow_state: "submitted", user: { name: "Student" }, attachments: [{ filename: "upload.png", display_name: " Demo.MP4 ", url: "https://test.instructure.com/file", "content-type": "application/octet-stream" }] }]));
    fetchMock.mockResolvedValueOnce({ ok: true, status: 200, headers: {}, body: Buffer.from("video") });
    const [student] = await fetchAssignment("https://test.instructure.com", "token", institution, "1", "1");
    expect(student.files[0].mimeType).toBe("video/unknown");
    const entry = await canvasWorkToEntry(student);
    expect(entry.submittedFiles[0].mimeType).toBe("video/unknown");
  });

  it.each([
    ["missing URL", { filename: "demo.mp4" }, undefined],
    ["declared size", { filename: "demo.mp4", url: "https://test.instructure.com/file", size: 16 * 1024 * 1024 }, undefined],
    ["non-OK download", { filename: "demo.mp4", url: "https://test.instructure.com/file" }, { ok: false, status: 404, headers: {}, body: Buffer.alloc(0) }],
    ["download failure", { filename: "demo.mp4", url: "https://test.instructure.com/file" }, "throw"],
    ["downloaded size", { filename: "demo.mp4", url: "https://test.instructure.com/file" }, { ok: true, status: 200, headers: {}, body: Buffer.alloc(16 * 1024 * 1024) }],
  ])("retains a video-only student after %s", async (_label, attachment, download) => {
    fetchMock.mockResolvedValueOnce(success([{ user_id: 1, workflow_state: "submitted", user: { name: "Student" }, attachments: [attachment] }]));
    if (download === "throw") fetchMock.mockRejectedValueOnce(new Error("private detail"));
    else if (download) fetchMock.mockResolvedValueOnce(download as never);
    const students = await fetchAssignment("https://test.instructure.com", "token", institution, "1", "1");
    expect(students).toHaveLength(1);
    expect(students[0].omittedVideos?.[0].name).toBe("demo.mp4");
    expect(JSON.stringify(students[0].omittedVideos)).not.toContain("private detail");
    const entry = await canvasWorkToEntry(students[0]);
    expect(entry.submittedFiles).toContainEqual(expect.objectContaining({ name: "demo.mp4", mimeType: "video/mp4" }));
  });

  it.each([
    ["missing URL", { filename: "demo.mp4" }, undefined],
    ["declared size", { filename: "demo.mp4", url: "https://test.instructure.com/file", size: 16 * 1024 * 1024 }, undefined],
    ["non-OK download", { filename: "demo.mp4", url: "https://test.instructure.com/file" }, { ok: false, status: 404, headers: {}, body: Buffer.alloc(0) }],
    ["download failure", { filename: "demo.mp4", url: "https://test.instructure.com/file" }, "throw"],
    ["downloaded size", { filename: "demo.mp4", url: "https://test.instructure.com/file" }, { ok: true, status: 200, headers: {}, body: Buffer.alloc(16 * 1024 * 1024) }],
  ].flatMap(([label, attachment, download]) => ["", "written answer"].map(body => [label, attachment, download, body] as const)))("does not grade work with a video omitted after %s", async (_label, attachment, download, submittedText) => {
    fetchMock.mockResolvedValueOnce(success([{ user_id: 1, workflow_state: "submitted", user: { name: "Student" }, body: submittedText, attachments: [attachment] }]));
    if (download === "throw") fetchMock.mockRejectedValueOnce(new Error("private detail"));
    else if (download) fetchMock.mockResolvedValueOnce(download as never);
    const [student] = await fetchAssignment("https://test.instructure.com", "token", institution, "1", "1");
    const entry = await canvasWorkToEntry(student);
    const [body] = buildRunItemRequests({ tickets: [{ sourceIndex: 0, entry: stripUnneededRawBase64(entry) }], assignmentInstructions: "Read the answer.", rubric: "Correctness (10 pts)", provider: "gemini", pointsPossible: 10 });
    const request = { headers: { get: () => "application/json" }, json: async () => body } as unknown as NextRequest;
    const response = await POST(request);
    expect(response.status).toBe(422);
    expect(JSON.stringify(await response.json())).toContain("demo.mp4");
    expect(callLlm).not.toHaveBeenCalled();
  });
});
