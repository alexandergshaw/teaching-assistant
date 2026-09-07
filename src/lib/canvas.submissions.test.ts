// Group E / canvasFetch migration wave: fetchAssignment's two bearer-carrying
// fetches (the submissions-list pagination GET, and the per-attachment
// download GET) now go through canvasGet (src/lib/canvas-fetch-response.ts),
// which calls canvasFetch (src/lib/canvas-fetch.ts) - real node:https with a
// real DNS lookup, which a global.fetch stub does not intercept. So this file
// mocks canvasFetch AT THE MODULE BOUNDARY (`vi.mock("./canvas-fetch", ...)`),
// the same boundary src/lib/canvas/announcements.test.ts and
// src/lib/canvas-modules/fetch-helpers.canvas-fetch.test.ts already
// established for their own migrations, rather than stubbing global.fetch.
//
// No identity/credential-store mock is needed here (unlike
// canvas.pullback.test.ts / announcements.test.ts): fetchAssignment takes
// baseUrl/token/institution as direct parameters - it never calls
// resolveCourse or resolveInstitution itself, so no credential resolution
// runs during these tests at all.
//
// fetchAssignment's attachment download stays a SINGLE canvasGet call, guarded
// by assertCanvasSuppliedUrlIsSameOrigin, that always carries the bearer -
// unlike announcements.ts's exportCourseCartridge, there is no preceding
// unauthenticated (assertCanvasSuppliedUrlIsPublic) attempt in this file to
// keep on bare fetch (see submissions.ts's own migration note). So every
// fetch in this file - list pagination and attachment download alike - is
// mocked at the canvasFetch boundary; there is no remaining bare-fetch call
// site that would need a separate global.fetch stub.
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";

vi.mock("./canvas-fetch", () => ({ canvasFetch: vi.fn() }));

import { fetchAssignment } from "./canvas/submissions";
import type { CanvasInstitution } from "./canvas-core";
import { canvasFetch, type CanvasFetchResult } from "./canvas-fetch";

const mockCanvasFetch = vi.mocked(canvasFetch);

const INSTITUTION: CanvasInstitution = { code: "TEST", name: "Test School", host: "test.instructure.com" };
const BASE_URL = "https://test.instructure.com";
const TOKEN = "test-token";

/** Builds an `ok: true` CanvasFetchResult carrying a JSON body - the
 * submissions-list pagination GET reads its response this way. */
function okResult(body: unknown, status = 200, headers: Record<string, string> = {}): CanvasFetchResult {
  return { ok: true, status, headers, body: Buffer.from(JSON.stringify(body)) };
}

/** Builds an `ok: true` CanvasFetchResult carrying raw bytes, not JSON - an
 * attachment download calls `.arrayBuffer()`, never `.json()`. */
function okBytesResult(text: string, status = 200, headers: Record<string, string> = {}): CanvasFetchResult {
  return { ok: true, status, headers, body: Buffer.from(text) };
}

beforeEach(() => {
  mockCanvasFetch.mockReset();
});

afterEach(() => {
  vi.clearAllMocks();
});

describe("fetchAssignment - URL-only submissions", () => {
  it("keeps a submission that has only a submitted URL (no body, no attachments)", async () => {
    mockCanvasFetch.mockResolvedValueOnce(
      okResult([
        {
          user_id: 1,
          workflow_state: "submitted",
          body: null,
          attachments: [],
          url: "https://github.com/student/hw1",
          submission_type: "online_url",
          user: { name: "Ada Lovelace" },
        },
      ])
    );

    const students = await fetchAssignment(BASE_URL, TOKEN, INSTITUTION, "1", "1");

    expect(students).toHaveLength(1);
    expect(students[0].student).toBe("Ada Lovelace");
    expect(students[0].text).toBe("");
    expect(students[0].files).toHaveLength(0);
    expect(students[0].submissionUrl).toBe("https://github.com/student/hw1");
  });

  it("still drops a submission with nothing at all (no text, no files, no url)", async () => {
    mockCanvasFetch.mockResolvedValueOnce(
      okResult([
        {
          user_id: 2,
          workflow_state: "submitted",
          body: null,
          attachments: [],
          url: null,
          user: { name: "Bo Nothing" },
        },
      ])
    );

    const students = await fetchAssignment(BASE_URL, TOKEN, INSTITUTION, "1", "1");

    expect(students).toHaveLength(0);
  });

  it("leaves an existing text submission unaffected (submissionUrl is null)", async () => {
    mockCanvasFetch.mockResolvedValueOnce(
      okResult([
        {
          user_id: 3,
          workflow_state: "submitted",
          body: "<p>My essay.</p>",
          attachments: [],
          url: null,
          user: { name: "Cy Text" },
        },
      ])
    );

    const students = await fetchAssignment(BASE_URL, TOKEN, INSTITUTION, "1", "1");

    expect(students).toHaveLength(1);
    expect(students[0].text).toBe("My essay.");
    expect(students[0].submissionUrl).toBeNull();
  });

  it("does not treat an on_paper submission's stray url as a real submission", async () => {
    mockCanvasFetch.mockResolvedValueOnce(
      okResult([
        {
          user_id: 4,
          workflow_state: "submitted",
          body: null,
          attachments: [],
          url: "https://example.com/irrelevant",
          submission_type: "on_paper",
          user: { name: "Di Paper" },
        },
      ])
    );

    const students = await fetchAssignment(BASE_URL, TOKEN, INSTITUTION, "1", "1");

    expect(students).toHaveLength(0);
  });
});

describe("fetchAssignment - canvasFetch transport (the canvasFetch migration)", () => {
  it("threads the bearer through canvasFetch's credential argument, never as a manually built Authorization header", async () => {
    mockCanvasFetch.mockResolvedValueOnce(okResult([]));

    await fetchAssignment(BASE_URL, TOKEN, INSTITUTION, "1", "1");

    expect(mockCanvasFetch).toHaveBeenCalledTimes(1);
    const [url, init, credential] = mockCanvasFetch.mock.calls[0];
    expect(String(url)).toBe(
      "https://test.instructure.com/api/v1/courses/1/assignments/1/submissions?per_page=100&include[]=user"
    );
    expect(credential).toEqual({ token: TOKEN });
    expect(Object.keys(init.headers ?? {})).not.toContain("Authorization");
  });

  it("a non-OK status produces the same canvasError callers already handle", async () => {
    mockCanvasFetch.mockResolvedValueOnce(okResult({}, 401));

    await expect(fetchAssignment(BASE_URL, TOKEN, INSTITUTION, "1", "1")).rejects.toThrow(
      /Canvas rejected the request/
    );
  });

  it("an unreachable canvasFetch result propagates as a throw and is never retried", async () => {
    mockCanvasFetch.mockResolvedValueOnce({ ok: false, kind: "unreachable" });

    await expect(fetchAssignment(BASE_URL, TOKEN, INSTITUTION, "1", "1")).rejects.toThrow(
      "Canvas did not respond."
    );
    expect(mockCanvasFetch).toHaveBeenCalledTimes(1);
  });
});

describe("fetchAssignment - attachment downloads (E-CRIT1, the same-origin guard)", () => {
  it("downloads a same-origin attachment via canvasGet, threading the bearer through the credential argument", async () => {
    mockCanvasFetch
      .mockResolvedValueOnce(
        okResult([
          {
            user_id: 5,
            workflow_state: "submitted",
            body: null,
            attachments: [
              { id: 9, filename: "essay.txt", url: "https://test.instructure.com/files/9/download", size: 5 },
            ],
            user: { name: "Eve Files" },
          },
        ])
      )
      .mockResolvedValueOnce(okBytesResult("hello"));

    const students = await fetchAssignment(BASE_URL, TOKEN, INSTITUTION, "1", "1");

    expect(students).toHaveLength(1);
    expect(students[0].files).toHaveLength(1);
    expect(students[0].files[0].name).toBe("essay.txt");
    expect(students[0].files[0].base64).toBe(Buffer.from("hello").toString("base64"));

    expect(mockCanvasFetch).toHaveBeenCalledTimes(2);
    const [attachmentUrl, attachmentInit, attachmentCredential] = mockCanvasFetch.mock.calls[1];
    expect(attachmentUrl).toBe("https://test.instructure.com/files/9/download");
    expect(attachmentCredential).toEqual({ token: TOKEN });
    expect(Object.keys(attachmentInit.headers ?? {})).not.toContain("Authorization");
  });

  it("refuses to dial a cross-origin attachment URL, skipping just that attachment rather than sending the bearer off-origin", async () => {
    mockCanvasFetch.mockResolvedValueOnce(
      okResult([
        {
          user_id: 6,
          workflow_state: "submitted",
          body: "<p>Text still counts.</p>",
          attachments: [{ id: 10, filename: "evil.txt", url: "https://collector.evil/steal", size: 5 }],
          user: { name: "Frank Hostile" },
        },
      ])
    );

    const students = await fetchAssignment(BASE_URL, TOKEN, INSTITUTION, "1", "1");

    expect(students).toHaveLength(1);
    expect(students[0].text).toBe("Text still counts.");
    expect(students[0].files).toHaveLength(0);

    // Only the list page was dialed - the hostile attachment URL was refused
    // by assertCanvasSuppliedUrlIsSameOrigin before canvasGet/canvasFetch was
    // ever called with it, so the bearer token was never sent there.
    expect(mockCanvasFetch).toHaveBeenCalledTimes(1);
    for (const call of mockCanvasFetch.mock.calls) {
      expect(String(call[0])).not.toContain("collector.evil");
    }
  });
});
