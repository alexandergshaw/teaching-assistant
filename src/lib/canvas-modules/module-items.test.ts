// TDD suite for the "open in a new tab" write path
// (docs/bulk-open-in-new-tab-acceptance-criteria.md).
//
// canvas.mccneb.edu is the hardcoded host for the "MCC" institution code in
// src/lib/canvas-core.ts.
//
// resolveCourse (via resolveInstitutionByCode) delegates credential
// resolution to canvas-credentials.ts, which resolves the calling identity
// server-side before ever reading an env var. Mocking the identity to
// role: "owner" (this repo's uniform convention across its Canvas test
// files, e.g. pages.test.ts, gradables.test.ts) keeps the env-var branch
// this suite's vi.stubEnv call relies on reachable, without a real Supabase
// call - the stored-credential branch is mocked to "no row" (null) so it
// falls through to that owner env branch instead of attempting a real DB
// read.
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

// fetch-helpers.ts's writeJson now dials Canvas through canvasFetch (real DNS
// resolution + connection pinning), not the platform fetch - stubbing
// globalThis.fetch does not intercept anything updateModuleItem does.
//
// Mocked at the fetch-helpers boundary (writeJson itself) rather than at
// canvasFetch: this suite is entirely about the request PARAMS
// updateModuleItem builds, which does not live inside fetch-helpers.ts, and
// no test here exercises pagination or a 429 retry (both already covered by
// fetch-helpers.canvas-fetch.test.ts / fetch-helpers.throttle.test.ts).
vi.mock("./fetch-helpers", () => ({ writeJson: vi.fn() }));

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { updateModuleItem, canSetNewTab } from "./module-items";
import { writeJson } from "./fetch-helpers";

const mockWriteJson = vi.mocked(writeJson);

const COURSE_URL = "https://canvas.mccneb.edu/courses/123";

/** writeJson's real signature is (url, method, ctx, params) - params is the
 * live URLSearchParams instance updateModuleItem built, captured as-is by
 * the mock (never re-encoded to a string and back), so assertions below
 * read it directly instead of re-parsing a recorded body string. */
function writeJsonCall(index = 0): [string, string, unknown, URLSearchParams | undefined] {
  return mockWriteJson.mock.calls[index] as unknown as [string, string, unknown, URLSearchParams | undefined];
}

beforeEach(() => {
  vi.stubEnv("MCC_CANVAS_API_TOKEN", "test-token");
  mockWriteJson.mockReset();
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

describe("updateModuleItem: new_tab write", () => {
  it("sends module_item[new_tab] as the literal string \"true\" when newTab: true", async () => {
    mockWriteJson.mockResolvedValueOnce({});

    await updateModuleItem(COURSE_URL, 10, 20, { newTab: true }, "MCC");

    expect(mockWriteJson).toHaveBeenCalledTimes(1);
    const [, , , params] = writeJsonCall();
    expect(params?.get("module_item[new_tab]")).toBe("true");
  });

  it("sends module_item[new_tab] as the literal string \"false\" when newTab: false (a real, applied value - not an absent one)", async () => {
    mockWriteJson.mockResolvedValueOnce({});

    await updateModuleItem(COURSE_URL, 10, 20, { newTab: false }, "MCC");

    const [, , , params] = writeJsonCall();
    expect(params?.get("module_item[new_tab]")).toBe("false");
  });

  it("omits module_item[new_tab] entirely when newTab is not given, rather than sending an empty value", async () => {
    mockWriteJson.mockResolvedValueOnce({});

    await updateModuleItem(COURSE_URL, 10, 20, { title: "Renamed" }, "MCC");

    const [, , , params] = writeJsonCall();
    expect(params?.has("module_item[new_tab]")).toBe(false);
  });

  it("NEVER sends module_item[external_url] on a new-tab write, even though the field would be truthy-safe on the Ruby side - resending it defensively would blank the url on every item whose externalUrl this app holds as null", async () => {
    mockWriteJson.mockResolvedValueOnce({});

    await updateModuleItem(COURSE_URL, 10, 20, { newTab: true }, "MCC");

    const [, , , params] = writeJsonCall();
    expect(params?.has("module_item[external_url]")).toBe(false);
    expect([...(params?.keys() ?? [])]).toEqual(["module_item[new_tab]"]);
  });
});

describe("canSetNewTab: the only guard, since Canvas applies new_tab with no content-type check server-side", () => {
  it("is eligible for ExternalUrl", () => {
    expect(canSetNewTab({ type: "ExternalUrl" })).toBe(true);
  });

  it("is eligible for ExternalTool (the API's own spelling, not Canvas's internal ContextExternalTool)", () => {
    expect(canSetNewTab({ type: "ExternalTool" })).toBe(true);
  });

  it.each(["Page", "Assignment", "Quiz", "Discussion", "File", "SubHeader"])(
    "is NOT eligible for %s",
    (type) => {
      expect(canSetNewTab({ type })).toBe(false);
    }
  );

  it("is not eligible for Canvas's internal content_type spelling, if ever passed by mistake", () => {
    expect(canSetNewTab({ type: "ContextExternalTool" })).toBe(false);
  });
});
