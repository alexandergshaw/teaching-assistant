// TDD suite for AC11 (docs/modules-cartridge-import-upload-acceptance-criteria.md)
// - createCartridgeMigration, the lib call that starts a
// common_cartridge_importer migration and gets back the upload ticket in the
// same response. Only globalThis.fetch is stubbed - resolveCourse/canvas-core
// run for real, matching migrations.test.ts's pattern, so these tests also
// pin the real request shape (URL, params) and not just a mock's idea of it.
//
// AC11's load-bearing behaviour is the pre_attachment.message passthrough:
// when Canvas cannot start the upload it explains why in pre_attachment.message,
// and that message must reach the caller VERBATIM rather than being flattened
// into a generic failure sentence. Several tests below exist only to pin that.

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { createCartridgeMigration } from "./cartridge-migration";

const COURSE_URL = "https://canvas.mccneb.edu/courses/123";
const BASE = "https://canvas.mccneb.edu";
const MIGRATIONS_URL = `${BASE}/api/v1/courses/123/content_migrations`;

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

/** Decode a writeJson request body back into its param map, so assertions
 * check facts (which keys/values were sent) rather than the exact encoded
 * string - URLSearchParams percent-encodes "[" and "]", and pinning that
 * encoding would make the test about URLSearchParams, not this function. */
function bodyParams(init: RequestInit | undefined): URLSearchParams {
  return new URLSearchParams(String(init?.body ?? ""));
}

beforeEach(() => {
  vi.stubEnv("MCC_CANVAS_API_TOKEN", "test-token");
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

describe("createCartridgeMigration (AC11) - request shape", () => {
  it("POSTs migration_type=common_cartridge_importer with pre_attachment[name]/[size], and omits both option params when both are off", async () => {
    const fetchMock = vi.fn(async () =>
      jsonResponse({
        id: 1,
        workflow_state: "pre_processing",
        pre_attachment: {
          upload_url: "https://upload.example.com/ticket",
          upload_params: { key: "abc" },
        },
      })
    );
    vi.stubGlobal("fetch", fetchMock);

    await createCartridgeMigration(
      COURSE_URL,
      { name: "course-export.imscc", size: 12345 },
      { selective: false, overwriteQuizzes: false }
    );

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0] as unknown as [string | URL, RequestInit | undefined];
    expect(String(url)).toBe(MIGRATIONS_URL);
    expect(init?.method).toBe("POST");
    expect(init?.headers).toMatchObject({ Authorization: "Bearer test-token" });

    const params = bodyParams(init);
    expect(params.get("migration_type")).toBe("common_cartridge_importer");
    expect(params.get("pre_attachment[name]")).toBe("course-export.imscc");
    expect(params.get("pre_attachment[size]")).toBe("12345");
    expect(params.has("selective_import")).toBe(false);
    expect(params.has("settings[overwrite_quizzes]")).toBe(false);
  });

  it("sends selective_import=true and settings[overwrite_quizzes]=true when both options are on", async () => {
    const fetchMock = vi.fn(async () =>
      jsonResponse({
        id: 2,
        workflow_state: "pre_processing",
        pre_attachment: {
          upload_url: "https://upload.example.com/ticket",
          upload_params: { key: "abc" },
        },
      })
    );
    vi.stubGlobal("fetch", fetchMock);

    await createCartridgeMigration(
      COURSE_URL,
      { name: "course-export.imscc", size: 999 },
      { selective: true, overwriteQuizzes: true }
    );

    const [, init] = fetchMock.mock.calls[0] as unknown as [string | URL, RequestInit | undefined];
    const params = bodyParams(init);
    expect(params.get("selective_import")).toBe("true");
    expect(params.get("settings[overwrite_quizzes]")).toBe("true");
  });
});

describe("createCartridgeMigration (AC11) - success", () => {
  it("returns migrationId, courseId, state, and the FileUploadTicket built from pre_attachment", async () => {
    const fetchMock = vi.fn(async () =>
      jsonResponse({
        id: 42,
        workflow_state: "pre_processing",
        pre_attachment: {
          upload_url: "https://upload.example.com/ticket",
          upload_params: { key: "abc", policy: "def" },
        },
      })
    );
    vi.stubGlobal("fetch", fetchMock);

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
    const fetchMock = vi.fn(async () => jsonResponse({ workflow_state: "pre_processing" }));
    vi.stubGlobal("fetch", fetchMock);

    await expect(
      createCartridgeMigration(
        COURSE_URL,
        { name: "course-export.imscc", size: 500 },
        { selective: false, overwriteQuizzes: false }
      )
    ).rejects.toThrow("Canvas did not start the cartridge import.");
  });

  it("throws a generic sentence when upload_url is absent and pre_attachment carries no message", async () => {
    const fetchMock = vi.fn(async () =>
      jsonResponse({ id: 7, workflow_state: "pre_processing", pre_attachment: {} })
    );
    vi.stubGlobal("fetch", fetchMock);

    await expect(
      createCartridgeMigration(
        COURSE_URL,
        { name: "course-export.imscc", size: 500 },
        { selective: false, overwriteQuizzes: false }
      )
    ).rejects.toThrow("Canvas did not return an upload URL for the cartridge.");
  });

  it("throws a generic sentence when pre_attachment itself is entirely absent", async () => {
    const fetchMock = vi.fn(async () => jsonResponse({ id: 7, workflow_state: "pre_processing" }));
    vi.stubGlobal("fetch", fetchMock);

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
    const fetchMock = vi.fn(async () =>
      jsonResponse({
        id: 9,
        workflow_state: "pre_processing",
        pre_attachment: { message: "File size exceeds the allowed maximum." },
      })
    );
    vi.stubGlobal("fetch", fetchMock);

    await expect(
      createCartridgeMigration(
        COURSE_URL,
        { name: "course-export.imscc", size: 500 },
        { selective: false, overwriteQuizzes: false }
      )
    ).rejects.toThrow("File size exceeds the allowed maximum.");
  });

  it("prefers pre_attachment.message over the generic sentence even when upload_params is also missing", async () => {
    const fetchMock = vi.fn(async () =>
      jsonResponse({
        id: 10,
        workflow_state: "pre_processing",
        pre_attachment: {
          upload_url: "https://upload.example.com/ticket",
          message: "Some other pre-processing failure.",
        },
      })
    );
    vi.stubGlobal("fetch", fetchMock);

    await expect(
      createCartridgeMigration(
        COURSE_URL,
        { name: "course-export.imscc", size: 500 },
        { selective: false, overwriteQuizzes: false }
      )
    ).rejects.toThrow("Some other pre-processing failure.");
  });
});
