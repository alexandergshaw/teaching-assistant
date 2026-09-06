// TDD suite for AC11 (docs/modules-cartridge-import-upload-acceptance-criteria.md)
// - createCartridgeMigration, the lib call that starts a
// common_cartridge_importer migration and gets back the upload ticket in the
// same response.
//
// AC11's load-bearing behaviour is the pre_attachment.message passthrough:
// when Canvas cannot start the upload it explains why in pre_attachment.message,
// and that message must reach the caller VERBATIM rather than being flattened
// into a generic failure sentence. Several tests below exist only to pin that.

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

// canvas-core's resolvers now delegate to resolveCanvasCredential
// (docs/lms-credentials-acceptance-criteria.md E-ARCH6), which reads the
// caller's identity and any stored row before falling back to the owner's
// env vars. Mocked at the same two-module boundary canvas-credentials.test.ts
// already uses, with the identity fixed to role: "owner" and no stored row,
// so the env-var-driven vi.stubEnv below keeps exercising the exact path
// these assertions were written against.
vi.mock("../supabase/effective-identity", () => ({
  getEffectiveIdentity: vi.fn(),
}));
vi.mock("../lms-credentials", () => ({
  getLmsCredentialSecret: vi.fn(),
  recordLmsCredentialFailure: vi.fn(),
}));

// fetch-helpers.ts's writeJson now dials Canvas through canvasFetch
// (src/lib/canvas-fetch.ts, real DNS resolution + connection pinning) instead
// of the platform fetch, so stubbing globalThis.fetch no longer intercepts
// anything createCartridgeMigration does - every prior test in this file hung
// until timeout for exactly that reason.
//
// Mocked here at the fetch-helpers boundary (writeJson itself), not at
// canvasFetch the way fetch-helpers.canvas-fetch.test.ts/
// fetch-helpers.throttle.test.ts do: this suite is entirely about the request
// PARAMS createCartridgeMigration itself builds (migration_type,
// pre_attachment[name]/[size], selective_import, settings[overwrite_quizzes])
// and about how it interprets Canvas's JSON response (the
// pre_attachment.message passthrough) - none of which lives inside
// fetch-helpers.ts. No test here exercises pagination or a 429 retry; both are
// already covered by fetch-helpers.canvas-fetch.test.ts and
// fetch-helpers.throttle.test.ts, so re-proving the transport at the lower
// boundary here would add nothing but a tautology risk.
vi.mock("./fetch-helpers", () => ({ writeJson: vi.fn() }));

import { createCartridgeMigration } from "./cartridge-migration";
import { writeJson } from "./fetch-helpers";
import { getEffectiveIdentity } from "../supabase/effective-identity";
import { getLmsCredentialSecret, recordLmsCredentialFailure } from "../lms-credentials";

const mockGetEffectiveIdentity = vi.mocked(getEffectiveIdentity);
const mockGetLmsCredentialSecret = vi.mocked(getLmsCredentialSecret);
const mockRecordLmsCredentialFailure = vi.mocked(recordLmsCredentialFailure);
const mockWriteJson = vi.mocked(writeJson);

const COURSE_URL = "https://canvas.mccneb.edu/courses/123";
const BASE = "https://canvas.mccneb.edu";
const MIGRATIONS_URL = `${BASE}/api/v1/courses/123/content_migrations`;

/** writeJson's real signature is (url, method, ctx, params) - params is the
 * live URLSearchParams instance createCartridgeMigration built, captured
 * as-is by the mock (never re-encoded to a string and back), so assertions
 * below read it directly. */
function writeJsonCall(index = 0): [string, string, { token: string }, URLSearchParams | undefined] {
  return mockWriteJson.mock.calls[index] as unknown as [string, string, { token: string }, URLSearchParams | undefined];
}

beforeEach(() => {
  vi.stubEnv("MCC_CANVAS_API_TOKEN", "test-token");
  mockGetEffectiveIdentity.mockResolvedValue({
    id: "owner-1",
    email: "owner@example.edu",
    role: "owner",
    status: "active",
  });
  mockGetLmsCredentialSecret.mockResolvedValue(null);
  mockRecordLmsCredentialFailure.mockResolvedValue(undefined);
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
  mockWriteJson.mockReset();
  vi.clearAllMocks();
});

describe("createCartridgeMigration (AC11) - request shape", () => {
  it("POSTs migration_type=common_cartridge_importer with pre_attachment[name]/[size], and omits both option params when both are off", async () => {
    mockWriteJson.mockResolvedValueOnce({
      id: 1,
      workflow_state: "pre_processing",
      pre_attachment: {
        upload_url: "https://upload.example.com/ticket",
        upload_params: { key: "abc" },
      },
    });

    await createCartridgeMigration(
      COURSE_URL,
      { name: "course-export.imscc", size: 12345 },
      { selective: false, overwriteQuizzes: false }
    );

    expect(mockWriteJson).toHaveBeenCalledTimes(1);
    const [url, method, ctx, params] = writeJsonCall();
    expect(url).toBe(MIGRATIONS_URL);
    expect(method).toBe("POST");
    // The bearer credential resolved by resolveCourse really did reach
    // writeJson - canvasFetch (not this test) owns turning it into an
    // Authorization header, and that plumbing is fully covered by
    // fetch-helpers.canvas-fetch.test.ts.
    expect(ctx.token).toBe("test-token");

    expect(params?.get("migration_type")).toBe("common_cartridge_importer");
    expect(params?.get("pre_attachment[name]")).toBe("course-export.imscc");
    expect(params?.get("pre_attachment[size]")).toBe("12345");
    expect(params?.has("selective_import")).toBe(false);
    expect(params?.has("settings[overwrite_quizzes]")).toBe(false);
  });

  it("sends selective_import=true and settings[overwrite_quizzes]=true when both options are on", async () => {
    mockWriteJson.mockResolvedValueOnce({
      id: 2,
      workflow_state: "pre_processing",
      pre_attachment: {
        upload_url: "https://upload.example.com/ticket",
        upload_params: { key: "abc" },
      },
    });

    await createCartridgeMigration(
      COURSE_URL,
      { name: "course-export.imscc", size: 999 },
      { selective: true, overwriteQuizzes: true }
    );

    const [, , , params] = writeJsonCall();
    expect(params?.get("selective_import")).toBe("true");
    expect(params?.get("settings[overwrite_quizzes]")).toBe("true");
  });
});

describe("createCartridgeMigration (AC11) - success", () => {
  it("returns migrationId, courseId, state, and the FileUploadTicket built from pre_attachment", async () => {
    mockWriteJson.mockResolvedValueOnce({
      id: 42,
      workflow_state: "pre_processing",
      pre_attachment: {
        upload_url: "https://upload.example.com/ticket",
        upload_params: { key: "abc", policy: "def" },
      },
    });

    const result = await createCartridgeMigration(
      COURSE_URL,
      { name: "course-export.imscc", size: 500 },
      { selective: false, overwriteQuizzes: false }
    );

    expect(result).toEqual({
      migrationId: 42,
      courseId: "123",
      state: "pre_processing",
      ticket: {
        uploadUrl: "https://upload.example.com/ticket",
        uploadParams: { key: "abc", policy: "def" },
      },
    });
  });
});

describe("createCartridgeMigration (AC11) - the two 'Canvas did not return...' failure shapes", () => {
  it("throws when Canvas returns no numeric id", async () => {
    mockWriteJson.mockResolvedValueOnce({ workflow_state: "pre_processing" });

    await expect(
      createCartridgeMigration(
        COURSE_URL,
        { name: "course-export.imscc", size: 500 },
        { selective: false, overwriteQuizzes: false }
      )
    ).rejects.toThrow("Canvas did not start the cartridge import.");
  });

  it("throws a generic sentence when upload_url is absent and pre_attachment carries no message", async () => {
    mockWriteJson.mockResolvedValueOnce({ id: 7, workflow_state: "pre_processing", pre_attachment: {} });

    await expect(
      createCartridgeMigration(
        COURSE_URL,
        { name: "course-export.imscc", size: 500 },
        { selective: false, overwriteQuizzes: false }
      )
    ).rejects.toThrow("Canvas did not return an upload URL for the cartridge.");
  });

  it("throws a generic sentence when pre_attachment itself is entirely absent", async () => {
    mockWriteJson.mockResolvedValueOnce({ id: 7, workflow_state: "pre_processing" });

    await expect(
      createCartridgeMigration(
        COURSE_URL,
        { name: "course-export.imscc", size: 500 },
        { selective: false, overwriteQuizzes: false }
      )
    ).rejects.toThrow("Canvas did not return an upload URL for the cartridge.");
  });
});

describe("createCartridgeMigration (AC11) - pre_attachment.message passthrough (the load-bearing path)", () => {
  it("throws Canvas's own pre_attachment.message VERBATIM when upload_url is absent but a message was given", async () => {
    mockWriteJson.mockResolvedValueOnce({
      id: 9,
      workflow_state: "pre_processing",
      pre_attachment: { message: "File size exceeds the allowed maximum." },
    });

    await expect(
      createCartridgeMigration(
        COURSE_URL,
        { name: "course-export.imscc", size: 500 },
        { selective: false, overwriteQuizzes: false }
      )
    ).rejects.toThrow("File size exceeds the allowed maximum.");
  });

  it("prefers pre_attachment.message over the generic sentence even when upload_params is also missing", async () => {
    mockWriteJson.mockResolvedValueOnce({
      id: 10,
      workflow_state: "pre_processing",
      pre_attachment: {
        upload_url: "https://upload.example.com/ticket",
        message: "Some other pre-processing failure.",
      },
    });

    await expect(
      createCartridgeMigration(
        COURSE_URL,
        { name: "course-export.imscc", size: 500 },
        { selective: false, overwriteQuizzes: false }
      )
    ).rejects.toThrow("Some other pre-processing failure.");
  });
});
