import { describe, it, expect } from "vitest";
import {
  SUBMISSION_KINDS,
  coerceSubmissionKind,
  SUBMISSION_KIND_LABELS,
  SUBMISSION_KIND_PROMPT_LABELS,
  submissionKindLabel,
  type GradingSubmissionKind,
} from "./submission-kind";

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

// ---------------------------------------------------------------------------
// docs/a8r-scope.md (A8-R) section 3: "unknown" must map to today's literal
// pre-A8-R string everywhere, in BOTH Records - the fact G-R0/G-R1/G-R2
// depend on. Every other member must map to something that is NOT that
// literal string, or a confirmed row could still render/compose "Submission".
// ---------------------------------------------------------------------------

describe("SUBMISSION_KIND_LABELS / SUBMISSION_KIND_PROMPT_LABELS", () => {
  it("both Records map every member of SUBMISSION_KINDS to a string, with no gaps", () => {
    for (const kind of SUBMISSION_KINDS) {
      expect(typeof SUBMISSION_KIND_LABELS[kind]).toBe("string");
      expect(typeof SUBMISSION_KIND_PROMPT_LABELS[kind]).toBe("string");
    }
  });

  it('"unknown" maps to the literal pre-A8-R string "Submission" in both Records', () => {
    expect(SUBMISSION_KIND_LABELS.unknown).toBe("Submission");
    expect(SUBMISSION_KIND_PROMPT_LABELS.unknown).toBe("Submission");
  });

  it('every OTHER member does NOT map to "Submission" in either Record (G-R1/G-R2\'s whole point)', () => {
    for (const kind of SUBMISSION_KINDS) {
      if (kind === "unknown") continue;
      expect(SUBMISSION_KIND_LABELS[kind]).not.toBe("Submission");
      expect(SUBMISSION_KIND_PROMPT_LABELS[kind]).not.toBe("Submission");
    }
  });

  it("reply and initial-post map to distinct, real words - not just each other's placeholder", () => {
    expect(SUBMISSION_KIND_LABELS.reply).toBe("Reply");
    expect(SUBMISSION_KIND_LABELS["initial-post"]).toBe("Initial post");
    expect(SUBMISSION_KIND_PROMPT_LABELS.reply).toBe("Reply");
    expect(SUBMISSION_KIND_PROMPT_LABELS["initial-post"]).toBe("Initial post");
  });
});

describe("submissionKindLabel", () => {
  it("is a thin lookup into SUBMISSION_KIND_LABELS, for every member", () => {
    for (const kind of SUBMISSION_KINDS) {
      expect(submissionKindLabel(kind)).toBe(SUBMISSION_KIND_LABELS[kind]);
    }
  });
});
