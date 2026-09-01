// Tests for uploadAnnouncementImage - the Canvas file-upload handshake this
// wave introduces so an announcement's companion image can actually post
// (previously download-only). globalThis.fetch is stubbed directly (not
// canvas-core mocked), matching announcements.test.ts's own pattern, so the
// real resolveCourse/canvasError run - these tests exercise the true request
// shapes this function builds, and no test here reaches the network.
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { uploadAnnouncementImage, resolveAnnouncementImage } from "./announcement-image-upload";

const COURSE_URL = "https://canvas.mccneb.edu/courses/123";
const BASE64_PNG = Buffer.from("fake-image-bytes").toString("base64");

function fakeResponse(opts: { ok: boolean; status?: number; body?: unknown; jsonThrows?: boolean }): Response {
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
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
  });

  it("Step 1: POSTs name/size/content_type/parent_folder_path=uploads/on_duplicate=rename to the course files endpoint", async () => {
    const fetchMock = vi.mocked(fetch);
    fetchMock
      .mockResolvedValueOnce(
        fakeResponse({
          ok: true,
          body: { upload_url: "https://canvas-upload.example.com/put", upload_params: { key: "uploads/abc", Policy: "p", Signature: "s" } },
        })
      )
      .mockResolvedValueOnce(fakeResponse({ ok: true, body: { id: 555, url: "https://canvas.mccneb.edu/files/555/download" } }));

    await uploadAnnouncementImage(COURSE_URL, BASE64_PNG, "announcement-image.png", "image/png", "MCC");

    expect(fetchMock).toHaveBeenCalledTimes(2);
    const [presignUrl, presignInit] = fetchMock.mock.calls[0];
    expect(String(presignUrl)).toBe("https://canvas.mccneb.edu/api/v1/courses/123/files");
    expect(presignInit?.method).toBe("POST");
    expect((presignInit?.headers as Record<string, string>).Authorization).toBe("Bearer test-token");
    const body = String(presignInit?.body);
    const buffer = Buffer.from(BASE64_PNG, "base64");
    expect(body).toContain("name=announcement-image.png");
    expect(body).toContain(`size=${buffer.byteLength}`);
    expect(body).toContain("content_type=image%2Fpng");
    expect(body).toContain("parent_folder_path=uploads");
    expect(body).toContain("on_duplicate=rename");
  });

  it("Step 2: POSTs the file bytes as multipart form data to upload_url, carrying every upload_param through unmodified", async () => {
    const fetchMock = vi.mocked(fetch);
    fetchMock
      .mockResolvedValueOnce(
        fakeResponse({
          ok: true,
          body: {
            upload_url: "https://canvas-upload.example.com/put",
            upload_params: { key: "uploads/abc", Policy: "policy-value", "x-amz-signature": "sig-value" },
          },
        })
      )
      .mockResolvedValueOnce(fakeResponse({ ok: true, body: { id: 555, url: "https://canvas.mccneb.edu/files/555/download" } }));

    await uploadAnnouncementImage(COURSE_URL, BASE64_PNG, "announcement-image.png", "image/png", "MCC");

    const [uploadUrl, uploadInit] = fetchMock.mock.calls[1];
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
    const fetchMock = vi.mocked(fetch);
    fetchMock
      .mockResolvedValueOnce(fakeResponse({ ok: true, body: { upload_url: "https://u.example.com", upload_params: { a: "b" } } }))
      .mockResolvedValueOnce(fakeResponse({ ok: true, body: { id: 777, url: "https://canvas.mccneb.edu/files/777/download" } }));

    const result = await uploadAnnouncementImage(COURSE_URL, BASE64_PNG, "img.png", "image/png", "MCC");
    expect(result).toEqual({ fileId: 777, url: "https://canvas.mccneb.edu/files/777/download" });
  });

  it("throws the standard canvasError mapping when the presign request fails", async () => {
    const fetchMock = vi.mocked(fetch);
    fetchMock.mockResolvedValueOnce(fakeResponse({ ok: false, status: 401 }));

    await expect(uploadAnnouncementImage(COURSE_URL, BASE64_PNG, "img.png", "image/png", "MCC")).rejects.toThrow(
      /the API token is missing, invalid, or lacks access/
    );
  });

  it('throws "Canvas did not return an upload URL for the image." when the presign response is missing upload_url/upload_params', async () => {
    const fetchMock = vi.mocked(fetch);
    fetchMock.mockResolvedValueOnce(fakeResponse({ ok: true, body: {} }));

    await expect(uploadAnnouncementImage(COURSE_URL, BASE64_PNG, "img.png", "image/png", "MCC")).rejects.toThrow(
      "Canvas did not return an upload URL for the image."
    );
  });

  it("throws a specific HTTP-status message when the upload-bytes POST itself fails", async () => {
    const fetchMock = vi.mocked(fetch);
    fetchMock
      .mockResolvedValueOnce(fakeResponse({ ok: true, body: { upload_url: "https://u.example.com", upload_params: { a: "b" } } }))
      .mockResolvedValueOnce(fakeResponse({ ok: false, status: 502 }));

    await expect(uploadAnnouncementImage(COURSE_URL, BASE64_PNG, "img.png", "image/png", "MCC")).rejects.toThrow(
      "Uploading the image to Canvas failed (HTTP 502)."
    );
  });

  it('throws "Canvas did not return the uploaded image\'s file id." when the upload confirmation has no numeric id (including when the body is not valid JSON)', async () => {
    const fetchMock = vi.mocked(fetch);
    fetchMock
      .mockResolvedValueOnce(fakeResponse({ ok: true, body: { upload_url: "https://u.example.com", upload_params: { a: "b" } } }))
      .mockResolvedValueOnce(fakeResponse({ ok: true, jsonThrows: true }));

    await expect(uploadAnnouncementImage(COURSE_URL, BASE64_PNG, "img.png", "image/png", "MCC")).rejects.toThrow(
      "Canvas did not return the uploaded image's file id."
    );
  });

  it('throws "Canvas did not return a URL for the uploaded image." when id is present but url is missing', async () => {
    const fetchMock = vi.mocked(fetch);
    fetchMock
      .mockResolvedValueOnce(fakeResponse({ ok: true, body: { upload_url: "https://u.example.com", upload_params: { a: "b" } } }))
      .mockResolvedValueOnce(fakeResponse({ ok: true, body: { id: 1 } }));

    await expect(uploadAnnouncementImage(COURSE_URL, BASE64_PNG, "img.png", "image/png", "MCC")).rejects.toThrow(
      "Canvas did not return a URL for the uploaded image."
    );
  });
});

describe("resolveAnnouncementImage", () => {
  beforeEach(() => {
    vi.stubEnv("MCC_CANVAS_API_TOKEN", "test-token");
    vi.stubGlobal("fetch", vi.fn());
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
  });

  it("resolves to the course-scoped download URL (frozen literal), never Canvas's raw per-upload url - that url needs this app's own bearer token and would 401 for a student's browser", async () => {
    const fetchMock = vi.mocked(fetch);
    fetchMock
      .mockResolvedValueOnce(fakeResponse({ ok: true, body: { upload_url: "https://u.example.com", upload_params: { a: "b" } } }))
      // Canvas's raw upload response url deliberately differs in host/path
      // shape from the course-scoped reference, so this test cannot pass by
      // accident if the implementation quietly falls back to it.
      .mockResolvedValueOnce(fakeResponse({ ok: true, body: { id: 999, url: "https://canvas.mccneb.edu/files/999/download?verifier=abc" } }));

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
    const fetchMock = vi.mocked(fetch);
    fetchMock
      .mockResolvedValueOnce(fakeResponse({ ok: true, body: { upload_url: "https://u.example.com", upload_params: { a: "b" } } }))
      .mockResolvedValueOnce(fakeResponse({ ok: true, body: { id: 999, url: "https://canvas.mccneb.edu/files/999/download" } }));

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
    const fetchMock = vi.mocked(fetch);
    fetchMock
      .mockResolvedValueOnce(fakeResponse({ ok: true, body: { upload_url: "https://u.example.com", upload_params: { a: "b" } } }))
      .mockResolvedValueOnce(fakeResponse({ ok: true, body: { id: 1, url: "https://canvas.mccneb.edu/files/1/download" } }));

    await resolveAnnouncementImage(COURSE_URL, { base64: BASE64_PNG, mimeType: "image/png", altText: "alt", fileName: "   " }, "MCC");

    const [presignUrl, presignInit] = fetchMock.mock.calls[0];
    expect(String(presignUrl)).toBe("https://canvas.mccneb.edu/api/v1/courses/123/files");
    expect(String(presignInit?.body)).toContain("name=announcement-image");
  });

  it("never throws: an upload failure resolves to imageError instead, naming the underlying Error message", async () => {
    const fetchMock = vi.mocked(fetch);
    fetchMock.mockResolvedValueOnce(fakeResponse({ ok: true, body: {} }));

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
    const fetchMock = vi.mocked(fetch);
    fetchMock.mockImplementationOnce(() => {
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
