// Tests for uploadAnnouncementImage - the Canvas file-upload handshake this
// wave introduces so an announcement's companion image can actually post
// (previously download-only).
//
// resolveCourse now delegates to resolveCanvasCredential
// (src/lib/canvas-credentials.ts), which resolves the CALLING USER's own
// identity via getEffectiveIdentity() before ever looking at env vars - see
// docs/lms-credentials-acceptance-criteria.md E-ARCH6. Per that section's own
// instruction to every wave touching one of the 22 existing Canvas test
// files: mock the identity/credential-store boundary to `role: "owner"` with
// no stored row, which keeps the ENV branch alive and every assertion below
// testing what it always tested.
//
// Group E wave 4b: Step 1 (the presign POST) is the only bearer-carrying
// request in this file, and now goes through canvasRequest
// (src/lib/canvas-fetch-response.ts -> src/lib/canvas-fetch.ts, real
// node:https with a real DNS lookup - a global.fetch stub does not intercept
// it). Step 2 (POSTing the file bytes to the pre-signed upload_url) carries
// NO Authorization header at all - the pre-signed upload_params ARE its
// credential - so it deliberately stays on the platform's bare fetch (see
// announcement-image-upload.ts's own comment on why). Every test below
// therefore mocks canvasFetch for step 1 and globalThis.fetch for step 2 -
// two different boundaries for two calls with two different trust shapes,
// not one mock standing in for both.
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

vi.mock("../supabase/effective-identity", () => ({
  getEffectiveIdentity: vi.fn(),
}));
vi.mock("../lms-credentials", () => ({
  getLmsCredentialSecret: vi.fn(),
  recordLmsCredentialFailure: vi.fn(),
}));
vi.mock("../canvas-fetch", () => ({ canvasFetch: vi.fn() }));

import { uploadAnnouncementImage, resolveAnnouncementImage } from "./announcement-image-upload";
import { getEffectiveIdentity } from "../supabase/effective-identity";
import { getLmsCredentialSecret, recordLmsCredentialFailure } from "../lms-credentials";
import { canvasFetch, type CanvasFetchResult } from "../canvas-fetch";

const mockGetEffectiveIdentity = vi.mocked(getEffectiveIdentity);
const mockGetLmsCredentialSecret = vi.mocked(getLmsCredentialSecret);
const mockRecordLmsCredentialFailure = vi.mocked(recordLmsCredentialFailure);
const mockCanvasFetch = vi.mocked(canvasFetch);

const OWNER_IDENTITY = { id: "owner-1", email: "owner@example.edu", role: "owner" as const, status: "active" as const };

const COURSE_URL = "https://canvas.mccneb.edu/courses/123";
const BASE64_PNG = Buffer.from("fake-image-bytes").toString("base64");

/** Builds an `ok: true` CanvasFetchResult carrying a JSON body - Step 1 (the
 * presign POST), the only bearer-carrying call in this file, reads its
 * response this way. */
function okPresignResult(body: unknown, status = 200): CanvasFetchResult {
  return { ok: true, status, headers: {}, body: Buffer.from(JSON.stringify(body)) };
}

/** Builds a bare-`fetch` Response - used ONLY for Step 2 (POSTing the file
 * bytes to the pre-signed upload_url), which carries no bearer token and
 * deliberately stays on the platform's fetch (see this file's own header). */
function fakeUploadResponse(opts: { ok: boolean; status?: number; body?: unknown; jsonThrows?: boolean }): Response {
  return {
    ok: opts.ok,
    status: opts.status ?? (opts.ok ? 200 : 500),
    json: async () => {
      if (opts.jsonThrows) throw new Error("not json");
      return opts.body ?? {};
    },
  } as unknown as Response;
}

describe("uploadAnnouncementImage", () => {
  beforeEach(() => {
    vi.stubEnv("MCC_CANVAS_API_TOKEN", "test-token");
    vi.stubGlobal("fetch", vi.fn());
    mockCanvasFetch.mockReset();
    mockGetEffectiveIdentity.mockResolvedValue(OWNER_IDENTITY);
    mockGetLmsCredentialSecret.mockResolvedValue(null);
    mockRecordLmsCredentialFailure.mockResolvedValue(undefined);
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
    vi.clearAllMocks();
  });

  it("Step 1: POSTs name/size/content_type/parent_folder_path=uploads/on_duplicate=rename to the course files endpoint", async () => {
    mockCanvasFetch.mockResolvedValueOnce(
      okPresignResult({ upload_url: "https://canvas-upload.example.com/put", upload_params: { key: "uploads/abc", Policy: "p", Signature: "s" } })
    );
    const fetchMock = vi.mocked(fetch);
    fetchMock.mockResolvedValueOnce(
      fakeUploadResponse({ ok: true, body: { id: 555, url: "https://canvas.mccneb.edu/files/555/download" } })
    );

    await uploadAnnouncementImage(COURSE_URL, BASE64_PNG, "announcement-image.png", "image/png", "MCC");

    expect(mockCanvasFetch).toHaveBeenCalledTimes(1);
    const [presignUrl, presignInit, presignCredential] = mockCanvasFetch.mock.calls[0];
    expect(String(presignUrl)).toBe("https://canvas.mccneb.edu/api/v1/courses/123/files");
    expect(presignInit.method).toBe("POST");
    // canvasFetch attaches the bearer itself from the credential argument -
    // canvasRequest never builds an Authorization header of its own.
    expect(presignCredential).toEqual({ token: "test-token" });
    expect(Object.keys(presignInit.headers ?? {})).not.toContain("Authorization");
    const body = String(presignInit.body);
    const buffer = Buffer.from(BASE64_PNG, "base64");
    expect(body).toContain("name=announcement-image.png");
    expect(body).toContain(`size=${buffer.byteLength}`);
    expect(body).toContain("content_type=image%2Fpng");
    expect(body).toContain("parent_folder_path=uploads");
    expect(body).toContain("on_duplicate=rename");
  });

  it("Step 2: POSTs the file bytes as multipart form data to upload_url, carrying every upload_param through unmodified", async () => {
    mockCanvasFetch.mockResolvedValueOnce(
      okPresignResult({
        upload_url: "https://canvas-upload.example.com/put",
        upload_params: { key: "uploads/abc", Policy: "policy-value", "x-amz-signature": "sig-value" },
      })
    );
    const fetchMock = vi.mocked(fetch);
    fetchMock.mockResolvedValueOnce(
      fakeUploadResponse({ ok: true, body: { id: 555, url: "https://canvas.mccneb.edu/files/555/download" } })
    );

    await uploadAnnouncementImage(COURSE_URL, BASE64_PNG, "announcement-image.png", "image/png", "MCC");

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [uploadUrl, uploadInit] = fetchMock.mock.calls[0];
    expect(String(uploadUrl)).toBe("https://canvas-upload.example.com/put");
    expect(uploadInit?.method).toBe("POST");
    const form = uploadInit?.body as FormData;
    expect(form).toBeInstanceOf(FormData);
    expect(form.get("key")).toBe("uploads/abc");
    expect(form.get("Policy")).toBe("policy-value");
    expect(form.get("x-amz-signature")).toBe("sig-value");
    const file = form.get("file") as File;
    expect(file).toBeTruthy();
    expect(file.type).toBe("image/png");
    expect(file.name).toBe("announcement-image.png");
  });

  it("returns the uploaded file's id and url on success", async () => {
    mockCanvasFetch.mockResolvedValueOnce(
      okPresignResult({ upload_url: "https://u.example.com", upload_params: { a: "b" } })
    );
    const fetchMock = vi.mocked(fetch);
    fetchMock.mockResolvedValueOnce(
      fakeUploadResponse({ ok: true, body: { id: 777, url: "https://canvas.mccneb.edu/files/777/download" } })
    );

    const result = await uploadAnnouncementImage(COURSE_URL, BASE64_PNG, "img.png", "image/png", "MCC");
    expect(result).toEqual({ fileId: 777, url: "https://canvas.mccneb.edu/files/777/download" });
  });

  it("throws the standard canvasError mapping when the presign request fails", async () => {
    mockCanvasFetch.mockResolvedValueOnce(okPresignResult({}, 401));

    await expect(uploadAnnouncementImage(COURSE_URL, BASE64_PNG, "img.png", "image/png", "MCC")).rejects.toThrow(
      /the API token is missing, invalid, or lacks access/
    );
  });

  it('throws "Canvas did not return an upload URL for the image." when the presign response is missing upload_url/upload_params', async () => {
    mockCanvasFetch.mockResolvedValueOnce(okPresignResult({}));

    await expect(uploadAnnouncementImage(COURSE_URL, BASE64_PNG, "img.png", "image/png", "MCC")).rejects.toThrow(
      "Canvas did not return an upload URL for the image."
    );
  });

  it("throws a specific HTTP-status message when the upload-bytes POST itself fails", async () => {
    mockCanvasFetch.mockResolvedValueOnce(
      okPresignResult({ upload_url: "https://u.example.com", upload_params: { a: "b" } })
    );
    const fetchMock = vi.mocked(fetch);
    fetchMock.mockResolvedValueOnce(fakeUploadResponse({ ok: false, status: 502 }));

    await expect(uploadAnnouncementImage(COURSE_URL, BASE64_PNG, "img.png", "image/png", "MCC")).rejects.toThrow(
      "Uploading the image to Canvas failed (HTTP 502)."
    );
  });

  it('throws "Canvas did not return the uploaded image\'s file id." when the upload confirmation has no numeric id (including when the body is not valid JSON)', async () => {
    mockCanvasFetch.mockResolvedValueOnce(
      okPresignResult({ upload_url: "https://u.example.com", upload_params: { a: "b" } })
    );
    const fetchMock = vi.mocked(fetch);
    fetchMock.mockResolvedValueOnce(fakeUploadResponse({ ok: true, jsonThrows: true }));

    await expect(uploadAnnouncementImage(COURSE_URL, BASE64_PNG, "img.png", "image/png", "MCC")).rejects.toThrow(
      "Canvas did not return the uploaded image's file id."
    );
  });

  it('throws "Canvas did not return a URL for the uploaded image." when id is present but url is missing', async () => {
    mockCanvasFetch.mockResolvedValueOnce(
      okPresignResult({ upload_url: "https://u.example.com", upload_params: { a: "b" } })
    );
    const fetchMock = vi.mocked(fetch);
    fetchMock.mockResolvedValueOnce(fakeUploadResponse({ ok: true, body: { id: 1 } }));

    await expect(uploadAnnouncementImage(COURSE_URL, BASE64_PNG, "img.png", "image/png", "MCC")).rejects.toThrow(
      "Canvas did not return a URL for the uploaded image."
    );
  });
});

describe("resolveAnnouncementImage", () => {
  beforeEach(() => {
    vi.stubEnv("MCC_CANVAS_API_TOKEN", "test-token");
    vi.stubGlobal("fetch", vi.fn());
    mockCanvasFetch.mockReset();
    mockGetEffectiveIdentity.mockResolvedValue(OWNER_IDENTITY);
    mockGetLmsCredentialSecret.mockResolvedValue(null);
    mockRecordLmsCredentialFailure.mockResolvedValue(undefined);
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
    vi.clearAllMocks();
  });

  it("resolves to the course-scoped download URL (frozen literal), never Canvas's raw per-upload url - that url needs this app's own bearer token and would 401 for a student's browser", async () => {
    mockCanvasFetch.mockResolvedValueOnce(
      okPresignResult({ upload_url: "https://u.example.com", upload_params: { a: "b" } })
    );
    const fetchMock = vi.mocked(fetch);
    // Canvas's raw upload response url deliberately differs in host/path
    // shape from the course-scoped reference, so this test cannot pass by
    // accident if the implementation quietly falls back to it.
    fetchMock.mockResolvedValueOnce(
      fakeUploadResponse({ ok: true, body: { id: 999, url: "https://canvas.mccneb.edu/files/999/download?verifier=abc" } })
    );

    const result = await resolveAnnouncementImage(
      COURSE_URL,
      { base64: BASE64_PNG, mimeType: "image/png", altText: "An illustration" },
      "MCC"
    );

    expect(result).toEqual({
      image: {
        url: "https://canvas.mccneb.edu/courses/123/files/999/download",
        altText: "An illustration",
      },
    });
  });

  it("sabotage check: fails if the src ever regresses to Canvas's raw upload url", async () => {
    mockCanvasFetch.mockResolvedValueOnce(
      okPresignResult({ upload_url: "https://u.example.com", upload_params: { a: "b" } })
    );
    const fetchMock = vi.mocked(fetch);
    fetchMock.mockResolvedValueOnce(
      fakeUploadResponse({ ok: true, body: { id: 999, url: "https://canvas.mccneb.edu/files/999/download" } })
    );

    const result = await resolveAnnouncementImage(
      COURSE_URL,
      { base64: BASE64_PNG, mimeType: "image/png", altText: "An illustration" },
      "MCC"
    );

    if (!result.image) throw new Error("expected a resolved image");
    expect(result.image.url).not.toBe("https://canvas.mccneb.edu/files/999/download");
    expect(result.image.url).toBe("https://canvas.mccneb.edu/courses/123/files/999/download");
  });

  it("defaults the uploaded file's name to 'announcement-image' when fileName is omitted or blank", async () => {
    mockCanvasFetch.mockResolvedValueOnce(
      okPresignResult({ upload_url: "https://u.example.com", upload_params: { a: "b" } })
    );
    const fetchMock = vi.mocked(fetch);
    fetchMock.mockResolvedValueOnce(
      fakeUploadResponse({ ok: true, body: { id: 1, url: "https://canvas.mccneb.edu/files/1/download" } })
    );

    await resolveAnnouncementImage(COURSE_URL, { base64: BASE64_PNG, mimeType: "image/png", altText: "alt", fileName: "   " }, "MCC");

    const [presignUrl, presignInit] = mockCanvasFetch.mock.calls[0];
    expect(String(presignUrl)).toBe("https://canvas.mccneb.edu/api/v1/courses/123/files");
    expect(String(presignInit.body)).toContain("name=announcement-image");
  });

  it("never throws: an upload failure resolves to imageError instead, naming the underlying Error message", async () => {
    mockCanvasFetch.mockResolvedValueOnce(okPresignResult({}));

    const result = await resolveAnnouncementImage(
      COURSE_URL,
      { base64: BASE64_PNG, mimeType: "image/png", altText: "alt" },
      "MCC"
    );

    expect(result).toEqual({
      imageError: "Could not attach the image - Canvas did not return an upload URL for the image.. The announcement posted as text only.",
    });
  });

  it("a non-Error upload rejection still yields a specific, honest imageError message (not a crash, not a silent swallow)", async () => {
    mockCanvasFetch.mockImplementationOnce(() => {
      throw "boom";
    });

    const result = await resolveAnnouncementImage(
      COURSE_URL,
      { base64: BASE64_PNG, mimeType: "image/png", altText: "alt" },
      "MCC"
    );

    expect(result).toEqual({
      imageError: "Could not attach the image - the upload to Canvas failed. The announcement posted as text only.",
    });
  });
});
