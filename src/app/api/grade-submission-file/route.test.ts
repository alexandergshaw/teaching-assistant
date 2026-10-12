import { describe, it, expect, vi, beforeEach } from "vitest";
import { readFileSync } from "fs";
import { join } from "path";
import JSZip from "jszip";

// LARGE-SINGLE-FILE W1: the Route Handler's own guard. action-guard-coverage
// cannot see a Route Handler, so these tests are the only thing behind
// /api/grade-submission-file. Auth, Storage and the supabase server client are
// mocked (network is blocked in vitest); the extractor and the entry builder
// are REAL so the returned entry shape is the shipped one.
const ROUTE_PATH = join(process.cwd(), "src/app/api/grade-submission-file/route.ts");
const routeSource = readFileSync(ROUTE_PATH, "utf8");

const requireAppOwnerMock = vi.fn();
vi.mock("@/lib/supabase/auth", () => ({
  requireAppOwner: (...args: unknown[]) => requireAppOwnerMock(...args),
}));

const listMock = vi.fn();
vi.mock("@/lib/supabase/server", () => ({
  createClient: async () => ({ storage: { from: () => ({ list: (...args: unknown[]) => listMock(...args) }) } }),
}));

const downloadFileMock = vi.fn();
const removeFilesMock = vi.fn();
vi.mock("@/lib/supabase/storage", () => ({
  downloadFile: (...args: unknown[]) => downloadFileMock(...args),
  removeFiles: (...args: unknown[]) => removeFilesMock(...args),
}));

import { POST } from "./route";
import {
  SINGLE_FILE_MAX_BYTES,
  SINGLE_FILE_STORAGE_EXTENSIONS,
} from "@/lib/grade/grading-zip-transport";
import { ITEM_REQUEST_BYTE_BUDGET, estimateNeededWireBytes } from "@/app/components/grading/incrementalRunPlan";
import { TEXT_EXTENSIONS, DOCUMENT_EXTENSIONS } from "@/lib/office-extract";
import type { StudentSubmissionEntry } from "@/lib/grade/types";
import type { NextRequest } from "next/server";

const USER = "user-1";
const GOOD_PATH = `${USER}/grading-uploads/abc.docx`;

function jsonRequest(body: unknown, contentType = "application/json"): NextRequest {
  const json = vi.fn(async () => body);
  return { headers: { get: (k: string) => (k.toLowerCase() === "content-type" ? contentType : null) }, json } as unknown as NextRequest;
}

async function docxBlob(text: string): Promise<Blob> {
  const zip = new JSZip();
  zip.file("word/document.xml", `<w:document><w:body><w:p><w:t>${text}</w:t></w:p></w:body></w:document>`);
  const bytes = await zip.generateAsync({ type: "arraybuffer" });
  return new Blob([bytes]);
}

beforeEach(() => {
  vi.clearAllMocks();
  requireAppOwnerMock.mockResolvedValue({ id: USER, email: "o@example.com" });
  listMock.mockResolvedValue({ data: [{ name: "abc.docx", metadata: { size: 6 * 1024 * 1024 } }], error: null });
  removeFilesMock.mockResolvedValue({ error: null });
});

describe("source-text checks on the real route", () => {
  it("guard is first, content-type precedes the body read, soft budget is under the hard cap", () => {
    const post = routeSource.indexOf("export async function POST");
    const guard = routeSource.indexOf("requireAppOwner(", post);
    const stat = routeSource.indexOf("await statObjectSize(", post);
    expect(post).toBeGreaterThanOrEqual(0);
    expect(guard).toBeGreaterThan(post);
    expect(guard).toBeLessThan(stat);
    expect(routeSource.indexOf('req.headers.get("content-type")')).toBeLessThan(routeSource.indexOf("req.json("));
    const maxDuration = Number(routeSource.match(/export const maxDuration = (\d+)/)![1]);
    const budget = Number(routeSource.match(/TOTAL_BUDGET_MS = ([\d_]+)/)![1].replace(/_/g, ""));
    expect(budget).toBeLessThan(maxDuration * 1000);
  });

  it("uses requireAppOwner, not the weaker guards", () => {
    expect(routeSource).toContain("requireAppOwner(");
    expect(routeSource).not.toContain("requireUser(");
    expect(routeSource).not.toContain("requireOwner(");
  });

  it("the ceiling is the one imported constant, with no hand-written MiB literal", () => {
    expect(routeSource).not.toMatch(/\d+\s*\*\s*1024\s*\*\s*1024/);
    expect(routeSource).toContain("SINGLE_FILE_MAX_BYTES");
  });

  it("the client-safe extension allowlist is a subset of the server text/document sets, without pdf", () => {
    for (const ext of SINGLE_FILE_STORAGE_EXTENSIONS) {
      expect(TEXT_EXTENSIONS.has(ext) || DOCUMENT_EXTENSIONS.has(ext)).toBe(true);
    }
    expect(SINGLE_FILE_STORAGE_EXTENSIONS.has("pdf")).toBe(false);
  });
});

describe("POST /api/grade-submission-file", () => {
  it("guard first: a non-owner POST is 401, the body is never read, no Storage call", async () => {
    requireAppOwnerMock.mockRejectedValue(new Error("Not authorized"));
    const req = jsonRequest({ storagePath: GOOD_PATH });
    const res = await POST(req);
    expect(res.status).toBe(401);
    expect((req as unknown as { json: ReturnType<typeof vi.fn> }).json).not.toHaveBeenCalled();
    expect(listMock).not.toHaveBeenCalled();
    expect(downloadFileMock).not.toHaveBeenCalled();
    expect(removeFilesMock).not.toHaveBeenCalled();
  });

  it("a non-JSON content-type is 400 before the body is read", async () => {
    const req = jsonRequest({ storagePath: GOOD_PATH }, "text/plain");
    const res = await POST(req);
    expect(res.status).toBe(400);
    expect((req as unknown as { json: ReturnType<typeof vi.fn> }).json).not.toHaveBeenCalled();
    expect(downloadFileMock).not.toHaveBeenCalled();
  });

  it.each([
    [`${USER}/syllabus-uploads/abc.docx`],
    [`${USER}/grading-uploads/abc.zip`],
    [`${USER}/grading-uploads/abc.mp4`],
    [`${USER}/grading-uploads/abc.pdf`],
    [`${USER}/grading-uploads/abc.png`],
    [`other-user/grading-uploads/abc.docx`],
    [`${USER}/grading-uploads/../../x/abc.docx`],
    ["abc.docx"],
    [""],
  ])("the path bind refuses %s before any Storage call", async (storagePath) => {
    const res = await POST(jsonRequest({ storagePath }));
    expect(res.status).toBe(400);
    expect(listMock).not.toHaveBeenCalled();
    expect(downloadFileMock).not.toHaveBeenCalled();
    expect(removeFilesMock).not.toHaveBeenCalled();
  });

  it("an object reported over the ceiling is 413 before download", async () => {
    listMock.mockResolvedValue({ data: [{ name: "abc.docx", metadata: { size: SINGLE_FILE_MAX_BYTES + 1 } }], error: null });
    const res = await POST(jsonRequest({ storagePath: GOOD_PATH }));
    expect(res.status).toBe(413);
    expect(downloadFileMock).not.toHaveBeenCalled();
  });

  it("an unknown stat size with an over-ceiling blob is 413 after download, and the object is deleted", async () => {
    listMock.mockResolvedValue({ data: [], error: null });
    downloadFileMock.mockResolvedValue({ data: { size: SINGLE_FILE_MAX_BYTES + 1, arrayBuffer: vi.fn() }, error: null });
    const res = await POST(jsonRequest({ storagePath: GOOD_PATH }));
    expect(res.status).toBe(413);
    expect(removeFilesMock).toHaveBeenCalledWith("course-files", [GOOD_PATH]);
  });

  it("a stored docx becomes a TEXT-ONLY entry with no rawBase64 that fits the per-item budget; the object is deleted", async () => {
    downloadFileMock.mockResolvedValue({ data: await docxBlob("Dear grader, here is my large paper."), error: null });
    const res = await POST(jsonRequest({ storagePath: GOOD_PATH, name: "Jordan Lee - paper.docx" }));
    expect(res.status).toBe(200);
    const { entry } = (await res.json()) as { entry: StudentSubmissionEntry };
    expect(entry.student).toBe("Jordan Lee - paper");
    expect(entry.content).toContain("Dear grader");
    expect(entry.submittedFiles).toHaveLength(1);
    expect(entry.submittedFiles[0]).not.toHaveProperty("rawBase64");
    expect(entry.submittedFiles[0].name).toBe("Jordan Lee - paper.docx");
    expect(estimateNeededWireBytes(entry)).toBeLessThanOrEqual(ITEM_REQUEST_BYTE_BUDGET);
    expect(removeFilesMock).toHaveBeenCalledWith("course-files", [GOOD_PATH]);
  });

  it("a typed label wins as the student name", async () => {
    downloadFileMock.mockResolvedValue({ data: await docxBlob("Some text."), error: null });
    const res = await POST(jsonRequest({ storagePath: GOOD_PATH, name: "x.docx", label: "Sam Park" }));
    const { entry } = (await res.json()) as { entry: StudentSubmissionEntry };
    expect(entry.student).toBe("Sam Park");
  });

  it("a name whose extension disagrees with the stored object falls back to a neutral name", async () => {
    downloadFileMock.mockResolvedValue({ data: await docxBlob("Some text."), error: null });
    const res = await POST(jsonRequest({ storagePath: GOOD_PATH, name: "evil.exe" }));
    const { entry } = (await res.json()) as { entry: StudentSubmissionEntry };
    expect(entry.submittedFiles[0].extension).toBe("docx");
  });

  it("an unreadable document is 422 and the object is still deleted", async () => {
    downloadFileMock.mockResolvedValue({ data: new Blob([new Uint8Array(64)]), error: null });
    const res = await POST(jsonRequest({ storagePath: GOOD_PATH }));
    expect(res.status).toBe(422);
    expect(removeFilesMock).toHaveBeenCalledWith("course-files", [GOOD_PATH]);
  });

  it("extracted text over the per-item budget is 413 with a worded error", async () => {
    downloadFileMock.mockResolvedValue({ data: new Blob(["x".repeat(ITEM_REQUEST_BYTE_BUDGET + 10)]), error: null });
    const res = await POST(jsonRequest({ storagePath: `${USER}/grading-uploads/abc.txt` }));
    expect(res.status).toBe(413);
    expect(removeFilesMock).toHaveBeenCalledWith("course-files", [`${USER}/grading-uploads/abc.txt`]);
  });

  it("a download that reports an error still fires the delete bracket and returns an error status", async () => {
    downloadFileMock.mockResolvedValue({ data: null, error: { message: "not found" } });
    const res = await POST(jsonRequest({ storagePath: GOOD_PATH }));
    expect(res.status).toBeGreaterThanOrEqual(400);
    expect(removeFilesMock).toHaveBeenCalledWith("course-files", [GOOD_PATH]);
  });

  it("a read that throws after download still fires the delete bracket", async () => {
    downloadFileMock.mockResolvedValue({
      data: { size: 10, arrayBuffer: vi.fn(async () => { throw new Error("read failed"); }) },
      error: null,
    });
    const res = await POST(jsonRequest({ storagePath: GOOD_PATH }));
    expect(res.status).toBeGreaterThanOrEqual(400);
    expect(removeFilesMock).toHaveBeenCalledWith("course-files", [GOOD_PATH]);
  });
});
