// Migration suite: office-accessibility.ts's own (duplicated) fetchCanvasFile
// / overwriteCanvasFile pair now goes through canvasFetch
// (src/lib/canvas-fetch.ts) via canvasGet/canvasRequest
// (src/lib/canvas-fetch-response.ts), exactly like office.ts's copy - see
// office.canvas-fetch.test.ts for the sibling suite covering that file. This
// file is its own module with its own copy of the two helpers, so it gets
// its own suite rather than relying on office.ts's coverage.
//
// Covers: getCanvasFileBuffer (the metadata GET + guarded bytes GET) and
// savePdfFixes (the pre-sign POST leg of overwriteCanvasFile). The guard
// (assertCanvasSuppliedUrlIsSameOrigin) must still run before the bytes GET,
// dialling its OWN return value, never the raw candidate. The pre-signed
// upload_url leg carries no bearer and does not target ctx.baseUrl, so it
// must stay on the platform fetch, never canvasFetch.
//
// accessibility/pdf.ts's own PDF parsing/fixing is out of this migration's
// scope and mocked out so this suite is entirely about the transport.

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
vi.mock("../accessibility/pdf", () => ({
  scanPdf: vi.fn().mockResolvedValue([]),
  readPdfMeta: vi.fn().mockResolvedValue({ lang: "en", title: "Doc" }),
  setPdfAccessibility: vi.fn().mockResolvedValue(Buffer.from("fixed-pdf-bytes")),
}));

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { canvasFetch, type CanvasFetchResult } from "../canvas-fetch";
import { getCanvasFileBuffer, savePdfFixes } from "./office-accessibility";

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

const PDF_META = {
  display_name: "Handout.pdf",
  filename: "Handout.pdf",
  url: "/files/88/download",
  "content-type": "application/pdf",
  folder_id: null,
  size: 200,
};

beforeEach(() => {
  vi.stubEnv("MCC_CANVAS_API_TOKEN", "test-token");
  mockCanvasFetch.mockReset();
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

describe("getCanvasFileBuffer - fetchCanvasFile's two GETs go through canvasFetch, guard runs first", () => {
  it("GETs metadata then the guard's resolved bytes URL, never the raw relative candidate", async () => {
    mockCanvasFetch.mockResolvedValueOnce(okJson(PDF_META)).mockResolvedValueOnce(okBytes("pdf-bytes"));

    const buffer = await getCanvasFileBuffer(COURSE_URL, 88);

    expect(buffer.toString()).toBe("pdf-bytes");
    expect(mockCanvasFetch).toHaveBeenCalledTimes(2);
    expect(mockCanvasFetch.mock.calls[0][0]).toBe(`${BASE_URL}/api/v1/files/88`);
    expect(mockCanvasFetch.mock.calls[0][2]).toEqual({ token: "test-token" });
    expect(mockCanvasFetch.mock.calls[1][0]).toBe(`${BASE_URL}/files/88/download`);
    expect(mockCanvasFetch.mock.calls[1][0]).not.toBe(PDF_META.url);
  });

  it("refuses a cross-origin file url and never dials it", async () => {
    mockCanvasFetch.mockResolvedValueOnce(okJson({ ...PDF_META, url: "https://evil.example.com/steal" }));

    await expect(getCanvasFileBuffer(COURSE_URL, 88)).rejects.toThrow(/different origin/);
    expect(mockCanvasFetch).toHaveBeenCalledTimes(1);
  });

  it("throws canvasError's unchanged message on a completed non-ok metadata response", async () => {
    mockCanvasFetch.mockResolvedValueOnce(okJson({}, 404));

    await expect(getCanvasFileBuffer(COURSE_URL, 88)).rejects.toThrow(
      "Canvas could not find that resource. Check the URL and that the token's account can see it."
    );
  });

  it("throws a fixed literal for unreachable on the bytes GET - nothing derived from the network failure", async () => {
    mockCanvasFetch.mockResolvedValueOnce(okJson(PDF_META)).mockResolvedValueOnce(UNREACHABLE);

    await expect(getCanvasFileBuffer(COURSE_URL, 88)).rejects.toThrow("Canvas did not respond.");
  });
});

describe("savePdfFixes - overwriteCanvasFile's pre-sign goes through canvasFetch, the byte upload does not", () => {
  it("pre-signs through canvasFetch then POSTs the fixed bytes to ticket.upload_url via the platform fetch only", async () => {
    mockCanvasFetch
      .mockResolvedValueOnce(okJson(PDF_META))
      .mockResolvedValueOnce(okBytes("pdf-bytes"))
      .mockResolvedValueOnce(
        okJson({ upload_url: "https://s3.example.com/upload", upload_params: { key: "abc" } })
      );
    const fetchMock = vi.fn().mockResolvedValue(new Response(null, { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);

    await savePdfFixes(COURSE_URL, 88, { lang: "en" });

    expect(mockCanvasFetch).toHaveBeenCalledTimes(3);
    const [presignUrl, presignInit, presignCredential] = mockCanvasFetch.mock.calls[2];
    expect(presignUrl).toBe(`${BASE_URL}/api/v1/courses/123/files`);
    expect(presignInit.method).toBe("POST");
    expect(Object.keys(presignInit.headers ?? {})).not.toContain("Authorization");
    expect(presignCredential).toEqual({ token: "test-token" });

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock.mock.calls[0][0]).toBe("https://s3.example.com/upload");
  });

  it("throws the canvasFetch-composed refusal message for host-not-allowed on the pre-sign, without ever uploading bytes", async () => {
    mockCanvasFetch
      .mockResolvedValueOnce(okJson(PDF_META))
      .mockResolvedValueOnce(okBytes("pdf-bytes"))
      .mockResolvedValueOnce(HOST_NOT_ALLOWED);
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);

    await expect(savePdfFixes(COURSE_URL, 88, { lang: "en" })).rejects.toThrow(
      "Canvas request refused: That host resolved to a private or reserved address and cannot be used."
    );
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
