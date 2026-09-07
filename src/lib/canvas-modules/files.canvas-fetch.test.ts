// Migration suite: files.ts's bearer-carrying Canvas requests (upload
// pre-sign, rename, delete, and the pre-sign leg of uploadFileToModule) now
// go through canvasFetch (src/lib/canvas-fetch.ts) via canvasRequest
// (src/lib/canvas-fetch-response.ts), instead of the platform fetch with a
// hand-built `Authorization: Bearer ...` header. Mocked at the canvasFetch
// module boundary - not the socket - exactly like
// fetch-helpers.canvas-fetch.test.ts: this suite's job is to prove files.ts
// dials the adapter with the right url/init/credential and still maps a
// completed response and both canvasFetch failure kinds exactly as before,
// not to re-verify canvasFetch's own DNS/redirect/SSRF behavior.
//
// uploadFileToModule's SECOND leg - the actual bytes POST to Canvas's
// pre-signed `ticket.upload_url` - carries no Authorization header at all
// (the credential lives in `ticket.upload_params`) and does not target
// ctx.baseUrl (Canvas hands back a separate object-storage host for this).
// It is deliberately EXCLUDED from this migration (see files.ts's own
// comment at that call site and canvas-fetch-response.ts's header), so it is
// asserted here to still go through the platform `fetch`, never canvasFetch.
//
// resolveCourse's credential chain (getEffectiveIdentity + the LMS credential
// store) is mocked exactly like gradables.test.ts / pages.test.ts mock it,
// with an owner identity and no stored row, so the MCC_CANVAS_API_TOKEN env
// fallback resolves a real institution/baseUrl/token triple without a real
// Supabase call.

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
// uploadFileToModule's final step (attaching the uploaded file to a module)
// is module-items.ts's own concern, entirely outside this migration's file
// set - mocked out so this suite tests only the upload sequence.
vi.mock("./module-items", () => ({ createModuleItem: vi.fn() }));

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { canvasFetch, type CanvasFetchResult } from "../canvas-fetch";
import { requestFileUpload, renameCourseFile, deleteCourseFile, uploadFileToModule } from "./files";
import { createModuleItem } from "./module-items";

const mockCanvasFetch = vi.mocked(canvasFetch);
const mockCreateModuleItem = vi.mocked(createModuleItem);

const COURSE_URL = "https://canvas.mccneb.edu/courses/123";
const BASE_URL = "https://canvas.mccneb.edu";

function okResult(body: unknown, status = 200): CanvasFetchResult {
  return { ok: true, status, headers: {}, body: Buffer.from(JSON.stringify(body)) };
}

const HOST_NOT_ALLOWED: CanvasFetchResult = {
  ok: false,
  kind: "host-not-allowed",
  reason: "That host resolved to a private or reserved address and cannot be used.",
};
const UNREACHABLE: CanvasFetchResult = { ok: false, kind: "unreachable" };

beforeEach(() => {
  vi.stubEnv("MCC_CANVAS_API_TOKEN", "test-token");
  mockCanvasFetch.mockReset();
  mockCreateModuleItem.mockReset();
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

describe("requestFileUpload - the pre-sign POST goes through canvasFetch", () => {
  it("dials the courses/:id/files endpoint with the form body and token, no Authorization header of its own", async () => {
    mockCanvasFetch.mockResolvedValueOnce(
      okResult({ upload_url: "https://s3.example.com/upload", upload_params: { key: "abc" } })
    );

    const ticket = await requestFileUpload(COURSE_URL, { name: "syllabus.docx", size: 42 });

    expect(ticket).toEqual({ uploadUrl: "https://s3.example.com/upload", uploadParams: { key: "abc" } });
    expect(mockCanvasFetch).toHaveBeenCalledTimes(1);
    const [url, init, credential] = mockCanvasFetch.mock.calls[0];
    expect(url).toBe(`${BASE_URL}/api/v1/courses/123/files`);
    expect(init.method).toBe("POST");
    expect(init.headers).toEqual({ "Content-Type": "application/x-www-form-urlencoded" });
    expect(Object.keys(init.headers ?? {})).not.toContain("Authorization");
    expect(credential).toEqual({ token: "test-token" });
  });

  it("throws canvasError's unchanged message on a completed non-ok response", async () => {
    mockCanvasFetch.mockResolvedValueOnce(okResult({}, 404));

    await expect(requestFileUpload(COURSE_URL, { name: "x.docx", size: 1 })).rejects.toThrow(
      "Canvas could not find that resource. Check the URL and that the token's account can see it."
    );
  });

  it("throws the canvasFetch-composed refusal message for host-not-allowed, never a raw provider string", async () => {
    mockCanvasFetch.mockResolvedValueOnce(HOST_NOT_ALLOWED);

    await expect(requestFileUpload(COURSE_URL, { name: "x.docx", size: 1 })).rejects.toThrow(
      "Canvas request refused: That host resolved to a private or reserved address and cannot be used."
    );
  });

  it("throws a fixed literal for unreachable - nothing derived from the underlying network failure", async () => {
    mockCanvasFetch.mockResolvedValueOnce(UNREACHABLE);

    await expect(requestFileUpload(COURSE_URL, { name: "x.docx", size: 1 })).rejects.toThrow(
      "Canvas did not respond."
    );
  });
});

describe("renameCourseFile - the PUT goes through canvasFetch", () => {
  it("dials files/:id with method PUT and the new name, credential passed separately from init", async () => {
    mockCanvasFetch.mockResolvedValueOnce(okResult({ id: 55 }));

    await renameCourseFile(COURSE_URL, 55, "New Name.pdf");

    expect(mockCanvasFetch).toHaveBeenCalledTimes(1);
    const [url, init, credential] = mockCanvasFetch.mock.calls[0];
    expect(url).toBe(`${BASE_URL}/api/v1/files/55`);
    expect(init.method).toBe("PUT");
    expect(init.body).toBe("name=New+Name.pdf");
    expect(credential).toEqual({ token: "test-token" });
  });

  it("still throws canvasError(status) on a non-ok completed response", async () => {
    mockCanvasFetch.mockResolvedValueOnce(okResult({}, 401));

    await expect(renameCourseFile(COURSE_URL, 55, "New Name.pdf")).rejects.toThrow(
      "Canvas rejected the request: the API token is missing, invalid, or lacks access to this course (MCC_CANVAS_API_TOKEN)."
    );
  });
});

describe("deleteCourseFile - the DELETE goes through canvasFetch", () => {
  it("dials files/:id with method DELETE and no body", async () => {
    mockCanvasFetch.mockResolvedValueOnce(okResult({ id: 55 }));

    await deleteCourseFile(COURSE_URL, 55);

    expect(mockCanvasFetch).toHaveBeenCalledTimes(1);
    const [url, init, credential] = mockCanvasFetch.mock.calls[0];
    expect(url).toBe(`${BASE_URL}/api/v1/files/55`);
    expect(init.method).toBe("DELETE");
    expect(init.body).toBeUndefined();
    expect(credential).toEqual({ token: "test-token" });
  });

  it("still throws canvasError(status) on a non-ok completed response", async () => {
    mockCanvasFetch.mockResolvedValueOnce(okResult({}, 404));

    await expect(deleteCourseFile(COURSE_URL, 55)).rejects.toThrow("Canvas could not find that resource");
  });
});

describe("uploadFileToModule - pre-sign through canvasFetch, byte upload stays on the platform fetch", () => {
  it("pre-signs through canvasFetch, then POSTs the bytes to ticket.upload_url via the platform fetch, never canvasFetch", async () => {
    mockCanvasFetch.mockResolvedValueOnce(
      okResult({ upload_url: "https://s3.example.com/upload", upload_params: { key: "abc" } })
    );
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({ id: 999 }), { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);
    mockCreateModuleItem.mockResolvedValueOnce({
      id: 1,
      moduleId: 10,
      type: "File",
      title: "syllabus.docx",
      contentId: 999,
      position: 1,
    } as never);

    await uploadFileToModule(COURSE_URL, Buffer.from("hello").toString("base64"), "syllabus.docx", "application/pdf", 10);

    // The pre-sign call went through the adapter, exactly once.
    expect(mockCanvasFetch).toHaveBeenCalledTimes(1);
    expect(mockCanvasFetch.mock.calls[0][0]).toBe(`${BASE_URL}/api/v1/courses/123/files`);

    // The byte upload is a SEPARATE leg, on the platform fetch, to the
    // pre-signed (non-Canvas) host - never routed through canvasFetch.
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock.mock.calls[0][0]).toBe("https://s3.example.com/upload");
    expect(mockCanvasFetch).toHaveBeenCalledTimes(1); // still only the pre-sign call
  });

  it("throws canvasError on a failing pre-sign, without ever attempting the byte upload", async () => {
    mockCanvasFetch.mockResolvedValueOnce(okResult({}, 403));
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);

    await expect(
      uploadFileToModule(COURSE_URL, Buffer.from("hello").toString("base64"), "syllabus.docx", "application/pdf", 10)
    ).rejects.toThrow("Canvas rejected the request");
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
