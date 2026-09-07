// Migration suite: file-preview.ts's getFilePreview now dials both its
// bearer-carrying GETs (file metadata, then the guarded file-bytes download)
// through canvasFetch (src/lib/canvas-fetch.ts) via canvasGet
// (src/lib/canvas-fetch-response.ts), instead of the platform fetch with a
// hand-built `Authorization: Bearer ...` header. Mocked at the canvasFetch
// module boundary, exactly like the sibling suites for files.ts/office.ts/
// office-accessibility.ts.
//
// meta.url is a Canvas-supplied field - assertCanvasSuppliedUrlIsSameOrigin
// must still run on it BEFORE the bytes GET, and the value actually dialled
// must be the guard's own return value (a relative candidate resolves
// against ctx.baseUrl inside the guard), never the raw candidate untouched.
//
// office-extract.ts's own text extraction is out of this migration's scope
// and mocked out so this suite is entirely about the transport and the
// existing early-return / size-cap behaviour, none of which changed.

vi.mock("../supabase/effective-identity", () => ({
  getEffectiveIdentity: vi.fn().mockResolvedValue({
    id: "owner-1",
    email: "owner@example.edu",
    role: "owner",
    status: "active",
  }),
}));
vi.mock("../lms-credentials", () => ({
  getLmsCredentialSecret: vi.fn().mockResolvedValue(null),
  recordLmsCredentialFailure: vi.fn().mockResolvedValue(undefined),
}));
vi.mock("../canvas-fetch", () => ({ canvasFetch: vi.fn() }));
vi.mock("../office-extract", () => ({
  extractTextFromBuffer: vi.fn().mockResolvedValue("extracted text"),
}));

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { canvasFetch, type CanvasFetchResult } from "../canvas-fetch";
import { getFilePreview } from "./file-preview";

const mockCanvasFetch = vi.mocked(canvasFetch);

const COURSE_URL = "https://canvas.mccneb.edu/courses/123";
const BASE_URL = "https://canvas.mccneb.edu";

function okJson(body: unknown, status = 200): CanvasFetchResult {
  return { ok: true, status, headers: {}, body: Buffer.from(JSON.stringify(body)) };
}
function okBytes(bytes: string, status = 200): CanvasFetchResult {
  return { ok: true, status, headers: {}, body: Buffer.from(bytes) };
}

const HOST_NOT_ALLOWED: CanvasFetchResult = {
  ok: false,
  kind: "host-not-allowed",
  reason: "That host resolved to a private or reserved address and cannot be used.",
};
const UNREACHABLE: CanvasFetchResult = { ok: false, kind: "unreachable" };

const FILE_META = {
  display_name: "Notes.txt",
  filename: "Notes.txt",
  url: "/files/99/download",
  "content-type": "text/plain",
  size: 20,
};

beforeEach(() => {
  vi.stubEnv("MCC_CANVAS_API_TOKEN", "test-token");
  mockCanvasFetch.mockReset();
});

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("getFilePreview - both GETs go through canvasFetch, guard runs before the bytes GET", () => {
  it("GETs metadata then the guard's resolved absolute bytes URL, never the raw relative candidate", async () => {
    mockCanvasFetch.mockResolvedValueOnce(okJson(FILE_META)).mockResolvedValueOnce(okBytes("hello world"));

    const preview = await getFilePreview(COURSE_URL, 99);

    expect(preview.name).toBe("Notes.txt");
    expect(preview.text).toBe("extracted text");
    expect(mockCanvasFetch).toHaveBeenCalledTimes(2);

    const [metaUrl, , metaCredential] = mockCanvasFetch.mock.calls[0];
    expect(metaUrl).toBe(`${BASE_URL}/api/v1/files/99`);
    expect(metaCredential).toEqual({ token: "test-token" });
    expect(Object.keys(mockCanvasFetch.mock.calls[0][1].headers ?? {})).not.toContain("Authorization");

    const [bytesUrl] = mockCanvasFetch.mock.calls[1];
    expect(bytesUrl).toBe(`${BASE_URL}/files/99/download`);
    expect(bytesUrl).not.toBe(FILE_META.url);
  });

  it("refuses a cross-origin file url and never dials it - the guard runs before the second canvasFetch call", async () => {
    mockCanvasFetch.mockResolvedValueOnce(okJson({ ...FILE_META, url: "https://evil.example.com/steal" }));

    await expect(getFilePreview(COURSE_URL, 99)).rejects.toThrow(/different origin/);
    expect(mockCanvasFetch).toHaveBeenCalledTimes(1);
  });

  it("throws canvasError's unchanged message when the metadata GET completes with a non-ok status", async () => {
    mockCanvasFetch.mockResolvedValueOnce(okJson({}, 401));

    await expect(getFilePreview(COURSE_URL, 99)).rejects.toThrow(
      "Canvas rejected the request: the API token is missing, invalid, or lacks access to this course (MCC_CANVAS_API_TOKEN)."
    );
  });

  it("throws the canvasFetch-composed refusal message for host-not-allowed on the bytes GET", async () => {
    mockCanvasFetch.mockResolvedValueOnce(okJson(FILE_META)).mockResolvedValueOnce(HOST_NOT_ALLOWED);

    await expect(getFilePreview(COURSE_URL, 99)).rejects.toThrow(
      "Canvas request refused: That host resolved to a private or reserved address and cannot be used."
    );
  });

  it("throws a fixed literal for unreachable on the metadata GET - nothing derived from the network failure", async () => {
    mockCanvasFetch.mockResolvedValueOnce(UNREACHABLE);

    await expect(getFilePreview(COURSE_URL, 99)).rejects.toThrow("Canvas did not respond.");
  });

  it("still returns the early-return message when Canvas's metadata carries no url, without ever GETting bytes", async () => {
    mockCanvasFetch.mockResolvedValueOnce(okJson({ ...FILE_META, url: undefined }));

    const preview = await getFilePreview(COURSE_URL, 99);

    expect(preview.text).toBe("Canvas did not return a download URL for this file.");
    expect(mockCanvasFetch).toHaveBeenCalledTimes(1);
  });

  it("still returns the size-cap message when metadata reports an oversized file, without ever GETting bytes", async () => {
    mockCanvasFetch.mockResolvedValueOnce(okJson({ ...FILE_META, size: 16 * 1024 * 1024 }));

    const preview = await getFilePreview(COURSE_URL, 99);

    expect(preview.text).toBe("This file is too large to preview here. Open it in Canvas.");
    expect(mockCanvasFetch).toHaveBeenCalledTimes(1);
  });
});
