import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/lib/canvas-fetch", () => ({ canvasFetch: vi.fn() }));
import { canvasFetch } from "@/lib/canvas-fetch";
import { fetchAssignment } from "@/lib/canvas/submissions";
import { canvasVideoRefusal } from "@/lib/canvas/omitted-video";
import { canvasWorkToEntry } from "@/lib/grade/extraction";

const fetchMock = vi.mocked(canvasFetch);
const institution = { code: "TEST", name: "Test", host: "test.instructure.com" };
const success = (value: unknown) => ({ ok: true as const, status: 200, headers: {}, body: Buffer.from(JSON.stringify(value)) });

beforeEach(() => fetchMock.mockReset());

describe("Canvas omitted video intake", () => {
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
});
