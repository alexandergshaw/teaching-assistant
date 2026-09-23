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
// Owner ruling O (commit d4c32cc, OWNER ANSWER 2026-09-20): an unconfirmed
// ("unknown") row gets a NEUTRAL LABEL AND A HEDGED PROMPT, not the
// "Submission" bytes A8-R's first pass shipped - labelling an unrecognized
// contribution "Submission" reads as marking it an original post, which is
// the exact defect backlog row A8 complains about. So "unknown" must NOT map
// to "Submission" in EITHER Record, same as every other member - G-R0 is
// re-aimed at the neutral default, not frozen on the old literal. These
// tests pin the FACT (not "Submission", the prompt header hedges rather
// than asserting a submission) rather than the exact wording, per this
// repo's "source-text tests over-specify" note.
// ---------------------------------------------------------------------------

describe("SUBMISSION_KIND_LABELS / SUBMISSION_KIND_PROMPT_LABELS", () => {
  it("both Records map every member of SUBMISSION_KINDS to a string, with no gaps", () => {
    for (const kind of SUBMISSION_KINDS) {
      expect(typeof SUBMISSION_KIND_LABELS[kind]).toBe("string");
      expect(typeof SUBMISSION_KIND_PROMPT_LABELS[kind]).toBe("string");
    }
  });

  it('every member, INCLUDING "unknown", does NOT map to "Submission" in either Record (ruling O: an unconfirmed row is never labelled as an original post)', () => {
    for (const kind of SUBMISSION_KINDS) {
      expect(SUBMISSION_KIND_LABELS[kind]).not.toBe("Submission");
      expect(SUBMISSION_KIND_PROMPT_LABELS[kind]).not.toBe("Submission");
    }
  });

  it('"unknown" does not claim to be an original post: the label is not "Initial post" and the prompt header does not equal any other member\'s header', () => {
    expect(SUBMISSION_KIND_LABELS.unknown).not.toBe("Initial post");
    expect(SUBMISSION_KIND_PROMPT_LABELS.unknown).not.toBe("Initial post");
    for (const kind of SUBMISSION_KINDS) {
      if (kind === "unknown") continue;
      expect(SUBMISSION_KIND_PROMPT_LABELS.unknown).not.toBe(SUBMISSION_KIND_PROMPT_LABELS[kind]);
    }
  });

  it('the "unknown" prompt header hedges - it says the kind is not known, rather than asserting a kind', () => {
    expect(SUBMISSION_KIND_PROMPT_LABELS.unknown.toLowerCase()).toMatch(/unknown|not identified/);
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
