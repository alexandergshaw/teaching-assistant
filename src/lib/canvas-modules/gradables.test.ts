// TDD suite for the gradable write layer's post-design corrections
// (docs/llm-command-interface-acceptance-criteria.md section 10, errata
// G4 and G6).
//
// @/lib/canvas-modules is left UNMOCKED and only globalThis.fetch is
// stubbed, so resolveCourse runs for real - the "stub fetch, let
// resolveCourse run for real" idiom this repo uses for Canvas write helpers
// (see module-content.test.ts's own header comment, and bulk.test.ts /
// graded-discussion.test.ts for the same pattern applied to sibling write
// helpers in this same directory).
//
// canvas.mccneb.edu is the hardcoded host for the "MCC" institution code in
// src/lib/canvas-core.ts.
//
// No gradables.test.ts existed before this change (checked via Glob before
// writing this file).
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { updateGradable } from "./gradables";

const COURSE_URL = "https://canvas.mccneb.edu/courses/123";

interface Recorded {
  url: string;
  method: string;
  body: string | undefined;
}

let recorded: Recorded[] = [];

function stubCanvas(responseBody: unknown = { id: 1 }) {
  recorded = [];
  const fetchMock = vi.fn(async (url: string | URL, init?: RequestInit) => {
    recorded.push({ url: String(url), method: init?.method ?? "GET", body: init?.body as string | undefined });
    return {
      ok: true,
      status: 200,
      json: async () => responseBody,
    } as unknown as Response;
  });
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

beforeEach(() => {
  vi.stubEnv("MCC_CANVAS_API_TOKEN", "test-token");
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

describe("updateGradable: G6 - quiz PUTs carry notify_of_update=false, no sibling kind does (asymmetry pin)", () => {
  it("a quiz description-only PUT includes quiz[notify_of_update]=false", async () => {
    const fetchMock = stubCanvas();

    await updateGradable(COURSE_URL, "Quiz", 901, { description: "New quiz description." }, "MCC");

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const params = new URLSearchParams(recorded[0].body);
    expect(params.get("quiz[notify_of_update]")).toBe("false");
    expect(params.get("quiz[description]")).toBe("New quiz description.");
  });

  it("a quiz title-only PUT also includes quiz[notify_of_update]=false", async () => {
    const fetchMock = stubCanvas();

    await updateGradable(COURSE_URL, "Quiz", 901, { title: "Renamed Quiz" }, "MCC");

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const params = new URLSearchParams(recorded[0].body);
    expect(params.get("quiz[notify_of_update]")).toBe("false");
  });

  // The paired positive above proves the parameter can appear at all; these
  // negatives prove it is quiz-only, not something the test would pass
  // vacuously without (a broken "always append" implementation would fail
  // BOTH of these).
  it("an assignment description-only PUT does NOT include notify_of_update", async () => {
    const fetchMock = stubCanvas();

    await updateGradable(COURSE_URL, "Assignment", 42, { description: "New assignment description." }, "MCC");

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const params = new URLSearchParams(recorded[0].body);
    expect(params.has("notify_of_update")).toBe(false);
    expect(params.has("assignment[notify_of_update]")).toBe(false);
    expect([...params.keys()].some((k) => k.includes("notify_of_update"))).toBe(false);
  });

  it("a discussion description-only PUT does NOT include notify_of_update", async () => {
    const fetchMock = stubCanvas();

    await updateGradable(COURSE_URL, "Discussion", 77, { description: "New discussion message." }, "MCC");

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const params = new URLSearchParams(recorded[0].body);
    expect([...params.keys()].some((k) => k.includes("notify_of_update"))).toBe(false);
  });

  it("does not send notify_of_update on a no-op quiz call (no fields supplied, no write at all)", async () => {
    const fetchMock = stubCanvas();

    await updateGradable(COURSE_URL, "Quiz", 901, {}, "MCC");

    expect(fetchMock).not.toHaveBeenCalled();
  });
});

describe("updateGradable: G4 - returns Canvas's parsed response (additive, callers may still discard it)", () => {
  it("returns the parsed JSON body for an assignment PUT", async () => {
    stubCanvas({ id: 42, name: "Essay 1", updated_at: "2026-08-24T00:00:00Z" });

    const result = await updateGradable(COURSE_URL, "Assignment", 42, { title: "Essay 1" }, "MCC");

    expect(result).toEqual({ id: 42, name: "Essay 1", updated_at: "2026-08-24T00:00:00Z" });
  });

  it("returns the parsed JSON body for a quiz PUT", async () => {
    stubCanvas({ id: 901, title: "Chapter 3 Quiz" });

    const result = await updateGradable(COURSE_URL, "Quiz", 901, { title: "Chapter 3 Quiz" }, "MCC");

    expect(result).toEqual({ id: 901, title: "Chapter 3 Quiz" });
  });

  it("returns the parsed JSON body for a discussion PUT", async () => {
    stubCanvas({ id: 77, title: "Week 3 Discussion" });

    const result = await updateGradable(COURSE_URL, "Discussion", 77, { title: "Week 3 Discussion" }, "MCC");

    expect(result).toEqual({ id: 77, title: "Week 3 Discussion" });
  });

  it("returns undefined (no write, nothing to read back) when no field is supplied", async () => {
    const fetchMock = stubCanvas();

    const result = await updateGradable(COURSE_URL, "Assignment", 42, {}, "MCC");

    expect(result).toBeUndefined();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("existing discard-the-return-value call shape still compiles and behaves identically (await, no assignment)", async () => {
    const fetchMock = stubCanvas({ id: 42 });

    await expect(updateGradable(COURSE_URL, "Assignment", 42, { title: "Essay 1" }, "MCC")).resolves.not.toThrow();
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});
