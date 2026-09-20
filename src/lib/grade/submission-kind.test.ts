import { describe, it, expect } from "vitest";
import { SUBMISSION_KINDS, coerceSubmissionKind, type GradingSubmissionKind } from "./submission-kind";

describe("SUBMISSION_KINDS", () => {
  it("is the closed four-member union, in a fixed order", () => {
    expect(SUBMISSION_KINDS).toEqual(["initial-post", "reply", "other", "unknown"]);
  });
});

describe("coerceSubmissionKind", () => {
  it("passes through every real member unchanged", () => {
    for (const kind of SUBMISSION_KINDS) {
      expect(coerceSubmissionKind(kind)).toBe(kind);
    }
  });

  it("defaults an unrecognized string to unknown", () => {
    expect(coerceSubmissionKind("submission")).toBe("unknown");
    expect(coerceSubmissionKind("Reply")).toBe("unknown"); // case-sensitive, no fuzzy match
  });

  it("defaults undefined, null, and non-string values to unknown (a legacy stored row with none of these keys)", () => {
    expect(coerceSubmissionKind(undefined)).toBe("unknown");
    expect(coerceSubmissionKind(null)).toBe("unknown");
    expect(coerceSubmissionKind(42)).toBe("unknown");
    expect(coerceSubmissionKind({})).toBe("unknown");
  });

  it("the return type still satisfies GradingSubmissionKind (compile-time canary)", () => {
    const kind: GradingSubmissionKind = coerceSubmissionKind("reply");
    expect(kind).toBe("reply");
  });
});
