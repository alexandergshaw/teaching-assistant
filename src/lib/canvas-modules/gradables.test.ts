// TDD suite for the gradable write layer's post-design corrections
// (docs/llm-command-interface-acceptance-criteria.md section 10, errata
// G4 and G6).
//
// canvas.mccneb.edu is the hardcoded host for the "MCC" institution code in
// src/lib/canvas-core.ts.
//
// resolveCourse now calls resolveCanvasCredential (src/lib/canvas-credentials.ts),
// which asks getEffectiveIdentity() who the caller is and only falls back to
// the env-configured pair below for an identity whose role is literally
// "owner" (SEC13, docs/lms-credentials-acceptance-criteria.md). Mocked at the
// identity/credential-store boundary exactly like canvas-credentials.test.ts
// mocks it, with role "owner" and no stored row, so resolveCanvasCredential's
// real env-fallback logic still runs for real - only the ambient-identity
// lookup and the credential store are faked.
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

// fetch-helpers.ts's writeJson now dials Canvas through canvasFetch
// (src/lib/canvas-fetch.ts, real DNS resolution + connection pinning), not
// the platform fetch - stubbing globalThis.fetch (this file's previous
// approach) no longer intercepts anything updateGradable does, which is why
// every test below used to hang until timeout.
//
// Mocked at the fetch-helpers boundary (writeJson itself) rather than at
// canvasFetch: this suite is entirely about the request PARAMS updateGradable
// builds (the quiz[notify_of_update] asymmetry) and about returning Canvas's
// parsed response verbatim - neither lives inside fetch-helpers.ts, and no
// test here exercises pagination or a 429 retry (both already covered by
// fetch-helpers.canvas-fetch.test.ts / fetch-helpers.throttle.test.ts).
vi.mock("./fetch-helpers", () => ({ writeJson: vi.fn() }));

// getGradable, unlike updateGradable, never went through fetch-helpers.ts -
// it dialled the platform `fetch` directly. It now dials Canvas through
// canvasGet (src/lib/canvas-fetch-response.ts), which itself goes through
// canvasFetch - mocked at that module boundary, same as
// fetch-helpers.canvas-fetch.test.ts, so canvasGet's own
// result-to-Response/throw mapping still runs for real.
vi.mock("../canvas-fetch", () => ({ canvasFetch: vi.fn() }));

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { updateGradable, getGradable, descriptionToHtml } from "./gradables";
import { writeJson } from "./fetch-helpers";
import { canvasFetch, type CanvasFetchResult } from "../canvas-fetch";

const mockWriteJson = vi.mocked(writeJson);
const mockCanvasFetch = vi.mocked(canvasFetch);

/** Builds an `ok: true` CanvasFetchResult carrying a JSON body - the shape
 * canvasGet's underlying canvasFetch returns for a completed exchange. */
function okResult(body: unknown, status = 200): CanvasFetchResult {
  return { ok: true, status, headers: {}, body: Buffer.from(JSON.stringify(body)) };
}

const COURSE_URL = "https://canvas.mccneb.edu/courses/123";

/** writeJson's real signature is (url, method, ctx, params) - params is the
 * live URLSearchParams instance updateGradable built, captured as-is by the
 * mock (never re-encoded to a string and back), so assertions below read it
 * directly instead of re-parsing a recorded body string. */
function writeJsonCall(index = 0): [string, string, unknown, URLSearchParams | undefined] {
  return mockWriteJson.mock.calls[index] as unknown as [string, string, unknown, URLSearchParams | undefined];
}

beforeEach(() => {
  vi.stubEnv("MCC_CANVAS_API_TOKEN", "test-token");
  mockWriteJson.mockReset();
  mockCanvasFetch.mockReset();
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

describe("getGradable - migrated to canvasGet (the shared adapter), never platform fetch", () => {
  it("fetches an assignment and maps its title/description/rubric/submission types", async () => {
    mockCanvasFetch.mockResolvedValueOnce(
      okResult({
        name: "Essay 1",
        description: "<p>Write an essay.</p>",
        rubric_settings: { id: 77 },
        submission_types: ["online_text_entry"],
      })
    );

    const result = await getGradable(COURSE_URL, "Assignment", 42, "MCC");

    expect(mockCanvasFetch).toHaveBeenCalledTimes(1);
    expect(mockCanvasFetch.mock.calls[0][0]).toBe("https://canvas.mccneb.edu/api/v1/courses/123/assignments/42");
    // The credential is passed to canvasFetch itself, never as a
    // caller-built Authorization header.
    expect(mockCanvasFetch.mock.calls[0][2]).toEqual({ token: "test-token" });
    expect(result).toEqual({
      title: "Essay 1",
      description: "<p>Write an essay.</p>",
      rubricId: 77,
      submissionTypes: ["online_text_entry"],
    });
  });

  it("fetches a discussion's message as its description, from the discussion_topics endpoint", async () => {
    mockCanvasFetch.mockResolvedValueOnce(
      okResult({ title: "Week 3 Discussion", message: "<p>Discuss.</p>" })
    );

    const result = await getGradable(COURSE_URL, "Discussion", 77, "MCC");

    expect(mockCanvasFetch.mock.calls[0][0]).toBe(
      "https://canvas.mccneb.edu/api/v1/courses/123/discussion_topics/77"
    );
    expect(result.description).toBe("<p>Discuss.</p>");
  });

  it("throws canvasError's mapped message on a non-ok status, unchanged from before the migration", async () => {
    mockCanvasFetch.mockResolvedValueOnce(okResult({}, 404));

    await expect(getGradable(COURSE_URL, "Quiz", 901, "MCC")).rejects.toThrow(
      "Canvas could not find that resource. Check the URL and that the token's account can see it."
    );
  });

  it("throws a fixed literal - never anything derived from the underlying failure - when Canvas is unreachable", async () => {
    mockCanvasFetch.mockResolvedValueOnce({ ok: false, kind: "unreachable" });

    await expect(getGradable(COURSE_URL, "Assignment", 42, "MCC")).rejects.toThrow("Canvas did not respond.");
  });
});

describe("updateGradable: G6 - quiz PUTs carry notify_of_update=false, no sibling kind does (asymmetry pin)", () => {
  it("a quiz description-only PUT includes quiz[notify_of_update]=false", async () => {
    mockWriteJson.mockResolvedValueOnce({ id: 1 });

    await updateGradable(COURSE_URL, "Quiz", 901, { description: "New quiz description." }, "MCC");

    expect(mockWriteJson).toHaveBeenCalledTimes(1);
    const [, , , params] = writeJsonCall();
    expect(params?.get("quiz[notify_of_update]")).toBe("false");
    expect(params?.get("quiz[description]")).toBe("New quiz description.");
  });

  it("a quiz title-only PUT also includes quiz[notify_of_update]=false", async () => {
    mockWriteJson.mockResolvedValueOnce({ id: 1 });

    await updateGradable(COURSE_URL, "Quiz", 901, { title: "Renamed Quiz" }, "MCC");

    expect(mockWriteJson).toHaveBeenCalledTimes(1);
    const [, , , params] = writeJsonCall();
    expect(params?.get("quiz[notify_of_update]")).toBe("false");
  });

  // The paired positive above proves the parameter can appear at all; these
  // negatives prove it is quiz-only, not something the test would pass
  // vacuously without (a broken "always append" implementation would fail
  // BOTH of these).
  it("an assignment description-only PUT does NOT include notify_of_update", async () => {
    mockWriteJson.mockResolvedValueOnce({ id: 1 });

    await updateGradable(COURSE_URL, "Assignment", 42, { description: "New assignment description." }, "MCC");

    expect(mockWriteJson).toHaveBeenCalledTimes(1);
    const [, , , params] = writeJsonCall();
    expect(params?.has("notify_of_update")).toBe(false);
    expect(params?.has("assignment[notify_of_update]")).toBe(false);
    expect([...(params?.keys() ?? [])].some((k) => k.includes("notify_of_update"))).toBe(false);
  });

  it("a discussion description-only PUT does NOT include notify_of_update", async () => {
    mockWriteJson.mockResolvedValueOnce({ id: 1 });

    await updateGradable(COURSE_URL, "Discussion", 77, { description: "New discussion message." }, "MCC");

    expect(mockWriteJson).toHaveBeenCalledTimes(1);
    const [, , , params] = writeJsonCall();
    expect([...(params?.keys() ?? [])].some((k) => k.includes("notify_of_update"))).toBe(false);
  });

  it("does not send notify_of_update on a no-op quiz call (no fields supplied, no write at all)", async () => {
    await updateGradable(COURSE_URL, "Quiz", 901, {}, "MCC");

    expect(mockWriteJson).not.toHaveBeenCalled();
  });
});

describe("updateGradable: G4 - returns Canvas's parsed response (additive, callers may still discard it)", () => {
  it("returns the parsed JSON body for an assignment PUT", async () => {
    mockWriteJson.mockResolvedValueOnce({ id: 42, name: "Essay 1", updated_at: "2026-08-24T00:00:00Z" });

    const result = await updateGradable(COURSE_URL, "Assignment", 42, { title: "Essay 1" }, "MCC");

    expect(result).toEqual({ id: 42, name: "Essay 1", updated_at: "2026-08-24T00:00:00Z" });
  });

  it("returns the parsed JSON body for a quiz PUT", async () => {
    mockWriteJson.mockResolvedValueOnce({ id: 901, title: "Chapter 3 Quiz" });

    const result = await updateGradable(COURSE_URL, "Quiz", 901, { title: "Chapter 3 Quiz" }, "MCC");

    expect(result).toEqual({ id: 901, title: "Chapter 3 Quiz" });
  });

  it("returns the parsed JSON body for a discussion PUT", async () => {
    mockWriteJson.mockResolvedValueOnce({ id: 77, title: "Week 3 Discussion" });

    const result = await updateGradable(COURSE_URL, "Discussion", 77, { title: "Week 3 Discussion" }, "MCC");

    expect(result).toEqual({ id: 77, title: "Week 3 Discussion" });
  });

  it("returns undefined (no write, nothing to read back) when no field is supplied", async () => {
    const result = await updateGradable(COURSE_URL, "Assignment", 42, {}, "MCC");

    expect(result).toBeUndefined();
    expect(mockWriteJson).not.toHaveBeenCalled();
  });

  it("existing discard-the-return-value call shape still compiles and behaves identically (await, no assignment)", async () => {
    mockWriteJson.mockResolvedValueOnce({ id: 42 });

    await expect(updateGradable(COURSE_URL, "Assignment", 42, { title: "Essay 1" }, "MCC")).resolves.not.toThrow();
    expect(mockWriteJson).toHaveBeenCalledTimes(1);
  });
});

// DEFECT 9 fix (docs/llm-command-interface-acceptance-criteria.md section 10,
// G13): descriptionToHtml is now exported so command-apply-outcome.ts's
// plainTextToPageHtml can delegate to it instead of restating an
// independent, driftable copy. These are the direct unit tests on the
// exported function itself; command-apply-outcome.test.ts additionally
// asserts actual cross-file parity between the two names.
describe("descriptionToHtml - the one plain-text-to-HTML conversion updateGradable and the page-write path both rely on", () => {
  it("returns plain text unchanged when it has no special characters or newlines", () => {
    expect(descriptionToHtml("Read chapter 3 before class.")).toBe("Read chapter 3 before class.");
  });

  it("escapes HTML-special characters", () => {
    expect(descriptionToHtml("A < B & C > D")).toBe("A &lt; B &amp; C &gt; D");
  });

  it("converts LF newlines to <br> tags", () => {
    expect(descriptionToHtml("Line one\nLine two")).toBe("Line one<br>\nLine two");
  });

  it("converts CRLF newlines to <br> tags the same way as LF", () => {
    expect(descriptionToHtml("Line one\r\nLine two")).toBe(descriptionToHtml("Line one\nLine two"));
  });

  it("passes text that already looks like HTML through unchanged", () => {
    const html = "<p>Already HTML</p>";
    expect(descriptionToHtml(html)).toBe(html);
  });

  it("returns whitespace-only text unchanged", () => {
    expect(descriptionToHtml("   ")).toBe("   ");
  });

  it("returns empty text unchanged", () => {
    expect(descriptionToHtml("")).toBe("");
  });
});
