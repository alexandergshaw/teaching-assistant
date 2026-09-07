// Migration suite: office.ts's two bearer-carrying Canvas requests -
// fetchCanvasFile (metadata GET, then the guarded file-bytes GET) and
// overwriteCanvasFile (the pre-sign POST) - now go through canvasFetch
// (src/lib/canvas-fetch.ts) via canvasGet/canvasRequest
// (src/lib/canvas-fetch-response.ts). Mocked at the canvasFetch module
// boundary, exactly like fetch-helpers.canvas-fetch.test.ts and
// files.canvas-fetch.test.ts.
//
// The file-bytes GET dials `raw.url`, a field Canvas's own /files/:id
// response supplied - assertCanvasSuppliedUrlIsSameOrigin must still run on
// it BEFORE that GET, and the value actually dialled must be the guard's own
// return value, never the raw candidate untouched (a relative candidate
// resolves against ctx.baseUrl inside the guard). Both are asserted below.
//
// overwriteCanvasFile's second leg (POSTing bytes to the pre-signed
// ticket.upload_url) carries no Authorization header and does not target
// ctx.baseUrl, so it deliberately stays on the platform fetch - asserted
// here to never reach the canvasFetch mock.
//
// office-edit.ts's own parsing/editing (parseOfficeParagraphs,
// applyOfficeSections) is out of this migration's scope and mocked out so
// this suite is entirely about the transport.

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
vi.mock("../office-edit", async () => {
  const actual = await vi.importActual<typeof import("../office-edit")>("../office-edit");
  return {
    ...actual,
    parseOfficeParagraphs: vi.fn().mockResolvedValue([]),
    applyOfficeSections: vi.fn().mockResolvedValue(Buffer.from("edited-bytes")),
  };
});

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { canvasFetch, type CanvasFetchResult } from "../canvas-fetch";
import { getOfficeEditable, saveOfficeEdits } from "./office";

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

const FILE_META = {
  display_name: "Syllabus.docx",
  filename: "Syllabus.docx",
  url: "/files/77/download",
  "content-type": "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  folder_id: 4,
  size: 100,
};

beforeEach(() => {
  vi.stubEnv("MCC_CANVAS_API_TOKEN", "test-token");
  mockCanvasFetch.mockReset();
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

describe("getOfficeEditable - fetchCanvasFile's two GETs go through canvasFetch, guard runs first", () => {
  it("GETs the file metadata, then dials the GUARD'S resolved absolute URL for the bytes - never the raw relative candidate", async () => {
    mockCanvasFetch
      .mockResolvedValueOnce(okJson(FILE_META))
      .mockResolvedValueOnce(okBytes("docx-bytes"));

    const result = await getOfficeEditable(COURSE_URL, 77);

    expect(result.name).toBe("Syllabus.docx");
    expect(mockCanvasFetch).toHaveBeenCalledTimes(2);

    const [metaUrl, , metaCredential] = mockCanvasFetch.mock.calls[0];
    expect(metaUrl).toBe(`${BASE_URL}/api/v1/files/77`);
    expect(metaCredential).toEqual({ token: "test-token" });

    // raw.url ("/files/77/download") is relative - the guard resolves it
    // against ctx.baseUrl, and THAT resolved string is what must be dialled,
    // never the untouched raw candidate.
    const [bytesUrl] = mockCanvasFetch.mock.calls[1];
    expect(bytesUrl).toBe(`${BASE_URL}/files/77/download`);
    expect(bytesUrl).not.toBe(FILE_META.url);
  });

  it("refuses a cross-origin file url and never dials it - the guard runs before the second canvasFetch call", async () => {
    mockCanvasFetch.mockResolvedValueOnce(
      okJson({ ...FILE_META, url: "https://evil.example.com/steal" })
    );

    await expect(getOfficeEditable(COURSE_URL, 77)).rejects.toThrow(/different origin/);
    // Only the metadata GET happened - the guard refused before a second dial.
    expect(mockCanvasFetch).toHaveBeenCalledTimes(1);
  });

  it("throws canvasError's unchanged message when the metadata GET completes with a non-ok status", async () => {
    mockCanvasFetch.mockResolvedValueOnce(okJson({}, 401));

    await expect(getOfficeEditable(COURSE_URL, 77)).rejects.toThrow(
      "Canvas rejected the request: the API token is missing, invalid, or lacks access to this course (MCC_CANVAS_API_TOKEN)."
    );
  });

  it("throws the canvasFetch-composed refusal message for host-not-allowed on the metadata GET", async () => {
    mockCanvasFetch.mockResolvedValueOnce(HOST_NOT_ALLOWED);

    await expect(getOfficeEditable(COURSE_URL, 77)).rejects.toThrow(
      "Canvas request refused: That host resolved to a private or reserved address and cannot be used."
    );
  });
});

describe("saveOfficeEdits - overwriteCanvasFile's pre-sign goes through canvasFetch, the byte upload does not", () => {
  it("pre-signs through canvasFetch, then POSTs the edited bytes to ticket.upload_url via the platform fetch only", async () => {
    mockCanvasFetch
      .mockResolvedValueOnce(okJson(FILE_META)) // metadata GET
      .mockResolvedValueOnce(okBytes("docx-bytes")) // file bytes GET
      .mockResolvedValueOnce(
        okJson({ upload_url: "https://s3.example.com/upload", upload_params: { key: "abc" } })
      ); // pre-sign POST
    const fetchMock = vi.fn().mockResolvedValue(new Response(null, { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);

    await saveOfficeEdits(COURSE_URL, 77, [{ sourceId: "p1", spans: [{ text: "hi" }] }]);

    expect(mockCanvasFetch).toHaveBeenCalledTimes(3);
    const [presignUrl, presignInit, presignCredential] = mockCanvasFetch.mock.calls[2];
    expect(presignUrl).toBe(`${BASE_URL}/api/v1/courses/123/files`);
    expect(presignInit.method).toBe("POST");
    expect(presignCredential).toEqual({ token: "test-token" });

    // The actual byte upload never touches canvasFetch - it targets Canvas's
    // separate pre-signed storage host and carries its own credential.
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock.mock.calls[0][0]).toBe("https://s3.example.com/upload");
  });

  it("throws canvasError on a failing pre-sign, without ever attempting the byte upload", async () => {
    mockCanvasFetch
      .mockResolvedValueOnce(okJson(FILE_META))
      .mockResolvedValueOnce(okBytes("docx-bytes"))
      .mockResolvedValueOnce(okJson({}, 500));
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);

    await expect(saveOfficeEdits(COURSE_URL, 77, [])).rejects.toThrow("Canvas request failed (HTTP 500).");
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
