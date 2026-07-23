import { describe, it, expect } from "vitest";
import {
  encodeSourcePolicy,
  decodeSourcePolicy,
  resolveSourcePolicy,
  isDefaultSourcePolicy,
  runSourcePolicy,
  DEFAULT_SOURCE_POLICY,
  ALL_SOURCE_KINDS,
  SOURCE_KIND_LABELS,
  type SourcePolicy,
  type SourceGatherOutcome,
  type SourceKind,
} from "./source-policy";

describe("encodeSourcePolicy / decodeSourcePolicy", () => {
  it("round-trips a policy", () => {
    const policy: SourcePolicy = { order: ["repo", "live-lms"], strategy: "merge-all" };
    const decoded = decodeSourcePolicy(encodeSourcePolicy(policy));
    expect(decoded).toEqual(policy);
  });

  it("dedupes and preserves order on encode", () => {
    const encoded = encodeSourcePolicy({
      order: ["live-lms", "course-export", "live-lms"],
      strategy: "first-success",
    });
    expect(JSON.parse(encoded).order).toEqual(["live-lms", "course-export"]);
  });

  it("decode is tolerant of junk JSON", () => {
    expect(decodeSourcePolicy("not json")).toBeNull();
    expect(decodeSourcePolicy("")).toBeNull();
    expect(decodeSourcePolicy(null)).toBeNull();
    expect(decodeSourcePolicy(undefined)).toBeNull();
    expect(decodeSourcePolicy("42")).toBeNull();
    expect(decodeSourcePolicy("null")).toBeNull();
  });

  it("drops unknown source kinds, keeping the known ones", () => {
    const decoded = decodeSourcePolicy(
      JSON.stringify({ order: ["live-lms", "carrier-pigeon", "repo"], strategy: "first-success" })
    );
    expect(decoded).toEqual({ order: ["live-lms", "repo"], strategy: "first-success" });
  });

  it("returns null when the order is empty after dropping unknown kinds", () => {
    expect(decodeSourcePolicy(JSON.stringify({ order: ["carrier-pigeon"], strategy: "first-success" }))).toBeNull();
    expect(decodeSourcePolicy(JSON.stringify({ order: [], strategy: "first-success" }))).toBeNull();
  });

  it("falls back to first-success for an unknown/missing strategy", () => {
    expect(decodeSourcePolicy(JSON.stringify({ order: ["repo"], strategy: "yolo" }))).toEqual({
      order: ["repo"],
      strategy: "first-success",
    });
    expect(decodeSourcePolicy(JSON.stringify({ order: ["repo"] }))).toEqual({
      order: ["repo"],
      strategy: "first-success",
    });
  });
});

describe("source-url kind", () => {
  it("ALL_SOURCE_KINDS includes source-url, placed after course-export", () => {
    expect(ALL_SOURCE_KINDS).toContain("source-url");
    expect(ALL_SOURCE_KINDS.indexOf("source-url")).toBe(ALL_SOURCE_KINDS.indexOf("course-export") + 1);
  });

  it("every ALL_SOURCE_KINDS entry has a label, including source-url", () => {
    for (const kind of ALL_SOURCE_KINDS) {
      expect(SOURCE_KIND_LABELS[kind], `${kind} has a label`).toBeTruthy();
    }
    expect(SOURCE_KIND_LABELS["source-url"]).toBe("Source platform URL");
  });

  it("round-trips source-url through encode/decode instead of dropping it", () => {
    const policy: SourcePolicy = { order: ["source-url", "tile-meta"], strategy: "first-success" };
    const decoded = decodeSourcePolicy(encodeSourcePolicy(policy));
    expect(decoded).toEqual(policy);
  });
});

describe("resolveSourcePolicy / DEFAULT_SOURCE_POLICY", () => {
  it("resolves an unset/empty value to the default policy", () => {
    expect(resolveSourcePolicy(null)).toEqual(DEFAULT_SOURCE_POLICY);
    expect(resolveSourcePolicy(undefined)).toEqual(DEFAULT_SOURCE_POLICY);
    expect(resolveSourcePolicy("")).toEqual(DEFAULT_SOURCE_POLICY);
  });

  it("resolves an unparseable/legacy value to the default policy", () => {
    expect(resolveSourcePolicy("garbage")).toEqual(DEFAULT_SOURCE_POLICY);
  });

  it("DEFAULT_SOURCE_POLICY is exactly today's chain: live LMS, course export, tile meta, first-success", () => {
    expect(DEFAULT_SOURCE_POLICY).toEqual({
      order: ["live-lms", "course-export", "tile-meta"],
      strategy: "first-success",
    });
  });

  it("isDefaultSourcePolicy recognizes the default and rejects reorderings/variants", () => {
    expect(isDefaultSourcePolicy(DEFAULT_SOURCE_POLICY)).toBe(true);
    expect(isDefaultSourcePolicy({ order: ["course-export", "live-lms", "tile-meta"], strategy: "first-success" })).toBe(
      false
    );
    expect(isDefaultSourcePolicy({ order: ["live-lms", "course-export", "tile-meta"], strategy: "merge-all" })).toBe(
      false
    );
    expect(isDefaultSourcePolicy({ order: ["live-lms", "course-export"], strategy: "first-success" })).toBe(false);
  });
});

// Fake gatherers for the pure strategy-loop tests below.
function fakeGatherer(
  outcomes: Partial<Record<SourceKind, SourceGatherOutcome>>
): (kind: SourceKind) => Promise<SourceGatherOutcome> {
  return async (kind) => outcomes[kind] ?? { text: "", notes: [`${kind}: not configured`], ok: false };
}

describe("runSourcePolicy", () => {
  it("first-success stops at the first source that succeeds", async () => {
    const calls: SourceKind[] = [];
    const gather = async (kind: SourceKind): Promise<SourceGatherOutcome> => {
      calls.push(kind);
      if (kind === "live-lms") return { text: "", notes: ["live-lms: nothing"], ok: false };
      if (kind === "course-export") return { text: "export text", notes: ["course-export: found it"], ok: true };
      return { text: "unreachable", notes: [], ok: true };
    };
    const result = await runSourcePolicy(DEFAULT_SOURCE_POLICY, gather, 20000);
    expect(calls).toEqual(["live-lms", "course-export"]);
    expect(result.text).toBe("export text");
    expect(result.notes).toEqual(["live-lms: nothing", "course-export: found it"]);
    expect(result.usedKinds).toEqual(["course-export"]);
  });

  it("merge-all concatenates every success and caps the total", async () => {
    const policy: SourcePolicy = { order: ["repo", "materials-zip", "tile-meta"], strategy: "merge-all" };
    const gather = fakeGatherer({
      repo: { text: "A".repeat(10), notes: ["repo: 10 chars"], ok: true },
      "materials-zip": { text: "B".repeat(10), notes: ["materials-zip: 10 chars"], ok: true },
      "tile-meta": { text: "C".repeat(10), notes: ["tile-meta: 10 chars"], ok: true },
    });
    const result = await runSourcePolicy(policy, gather, 25);
    expect(result.text).toBe("A".repeat(10) + "B".repeat(10) + "C".repeat(5));
    expect(result.truncated).toBe(true);
    expect(result.usedKinds).toEqual(["repo", "materials-zip", "tile-meta"]);
    expect(result.notes).toEqual(["repo: 10 chars", "materials-zip: 10 chars", "tile-meta: 10 chars"]);
  });

  it("until-failure accumulates successes and stops at the first error, keeping prior text", async () => {
    const policy: SourcePolicy = { order: ["repo", "live-lms", "tile-meta"], strategy: "until-failure" };
    const gather = fakeGatherer({
      repo: { text: "repo text", notes: ["repo: ok"], ok: true },
      "live-lms": { text: "", notes: ["live-lms: network error"], ok: false, error: true },
      "tile-meta": { text: "unreachable", notes: ["tile-meta: should not run"], ok: true },
    });
    const result = await runSourcePolicy(policy, gather, 20000);
    expect(result.text).toBe("repo text");
    expect(result.usedKinds).toEqual(["repo"]);
    expect(result.notes).toEqual(["repo: ok", "live-lms: network error"]);
  });

  it("until-failure does NOT stop on a non-error empty outcome", async () => {
    const policy: SourcePolicy = { order: ["repo", "live-lms"], strategy: "until-failure" };
    const gather = fakeGatherer({
      repo: { text: "", notes: ["repo: nothing configured"], ok: false },
      "live-lms": { text: "live text", notes: ["live-lms: ok"], ok: true },
    });
    const result = await runSourcePolicy(policy, gather, 20000);
    expect(result.text).toBe("live text");
    expect(result.usedKinds).toEqual(["live-lms"]);
  });

  it("default policy order matches today's legacy chain with a fake gatherer", async () => {
    const gather = fakeGatherer({
      "live-lms": { text: "", notes: [], ok: false },
      "course-export": { text: "", notes: [], ok: false },
      "tile-meta": { text: "fallback text", notes: ["tile-meta: fallback"], ok: true },
    });
    const result = await runSourcePolicy(DEFAULT_SOURCE_POLICY, gather, 20000);
    expect(result.text).toBe("fallback text");
    expect(result.usedKinds).toEqual(["tile-meta"]);
  });

  it("an empty policy order yields empty text and no notes", async () => {
    const policy: SourcePolicy = { order: [], strategy: "first-success" };
    const result = await runSourcePolicy(policy, fakeGatherer({}), 20000);
    expect(result.text).toBe("");
    expect(result.notes).toEqual([]);
    expect(result.usedKinds).toEqual([]);
  });
});
