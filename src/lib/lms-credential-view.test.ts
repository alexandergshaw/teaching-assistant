import { describe, expect, it } from "vitest";
import { maskToken } from "./lms-credential-rules";
import {
  NO_SUFFIX_MASK_LABEL,
  buildLmsCredentialRows,
  formatLiveCredentialMask,
  formatStoredCredentialMask,
  type LmsCredentialEnvironmentInput,
  type LmsCredentialStoredInput,
} from "./lms-credential-view";

/**
 * Contract tests for E5's settings-list row view-model (docs/lms-credentials-
 * acceptance-criteria.md E5, E10, DAT3, SEC12, E-UX5, E-UX6).
 */

function storedInput(overrides: Partial<LmsCredentialStoredInput> = {}): LmsCredentialStoredInput {
  return {
    source: "stored",
    institution: "MCC",
    baseUrl: "https://canvas.mccneb.edu",
    tokenLastFour: "1a2b",
    canvasUserId: "4210",
    canvasUserName: "Dana Instructor",
    createdAt: "2026-01-01T00:00:00.000Z",
    lastUsedAt: null,
    lastFailureKind: null,
    ...overrides,
  };
}

function envInput(overrides: Partial<LmsCredentialEnvironmentInput> = {}): LmsCredentialEnvironmentInput {
  return {
    source: "environment",
    institution: "MCC",
    baseUrl: "https://canvas.mccneb.edu",
    ...overrides,
  };
}

describe("E-UX5 - the row's identity is the Canvas account, not the mask", () => {
  it("leads with the Canvas display name when present", () => {
    const [row] = buildLmsCredentialRows([storedInput({ canvasUserName: "Dana Instructor" })]);
    expect(row.source).toBe("stored");
    expect(row.source === "stored" && row.identityLabel).toBe("Dana Instructor");
  });

  it("falls back to the numeric Canvas id when no name was recorded", () => {
    const [row] = buildLmsCredentialRows([storedInput({ canvasUserName: null, canvasUserId: "9001" })]);
    expect(row.source === "stored" && row.identityLabel).toBe("Canvas user 9001");
  });

  it("treats a blank name the same as a missing one", () => {
    const [row] = buildLmsCredentialRows([storedInput({ canvasUserName: "   ", canvasUserId: "9001" })]);
    expect(row.source === "stored" && row.identityLabel).toBe("Canvas user 9001");
  });

  it("falls back to an explicit phrase, never a blank, when neither is present", () => {
    const [row] = buildLmsCredentialRows([storedInput({ canvasUserName: null, canvasUserId: null })]);
    expect(row.source === "stored" && row.identityLabel).toBe("Canvas account not recorded");
  });
});

describe("E-UX6 - the mask renders as words, and the two producers agree", () => {
  it("formatStoredCredentialMask renders 'Ends in <suffix>' for a real four-character value", () => {
    expect(formatStoredCredentialMask("1a2b")).toBe("Ends in 1a2b");
  });

  it("formatLiveCredentialMask renders the identical shape for a long-enough live secret", () => {
    const secret = "0".repeat(60) + "1a2b";
    expect(formatLiveCredentialMask(secret)).toBe("Ends in 1a2b");
  });

  it("never renders asterisks", () => {
    expect(formatStoredCredentialMask("1a2b")).not.toMatch(/\*/);
    expect(formatLiveCredentialMask("0".repeat(60) + "1a2b")).not.toMatch(/\*/);
  });

  it("the no-suffix case is the same calm phrase for both producers, not a visually distinct placeholder", () => {
    expect(formatStoredCredentialMask("")).toBe(NO_SUFFIX_MASK_LABEL);
    expect(formatLiveCredentialMask("short")).toBe(NO_SUFFIX_MASK_LABEL);
    expect(NO_SUFFIX_MASK_LABEL).not.toMatch(/[-*]/);
  });

  it("formatLiveCredentialMask agrees with maskToken's own reveal decision for a too-short secret", () => {
    // maskToken("short") reveals nothing (below MIN_LENGTH_TO_REVEAL_SUFFIX) -
    // this pins that formatLiveCredentialMask's words form and maskToken's
    // own gate never disagree about WHETHER to reveal, only about HOW.
    expect(maskToken("short")).not.toContain("short".slice(-4));
    expect(formatLiveCredentialMask("short")).toBe(NO_SUFFIX_MASK_LABEL);
  });

  it("formatStoredCredentialMask never fabricates characters when given fewer than four real ones", () => {
    // Defensive-only: a corrupted row's token_last_four shorter than four
    // characters. The synthetic padding used internally must never leak
    // into the rendered output.
    const result = formatStoredCredentialMask("a");
    expect(result === NO_SUFFIX_MASK_LABEL || result === "Ends in a").toBe(true);
    expect(result).not.toContain("0");
  });

  it("handles non-string input defensively for both producers", () => {
    expect(formatStoredCredentialMask(undefined)).toBe(NO_SUFFIX_MASK_LABEL);
    expect(formatStoredCredentialMask(null)).toBe(NO_SUFFIX_MASK_LABEL);
    expect(formatLiveCredentialMask(undefined)).toBe(NO_SUFFIX_MASK_LABEL);
    expect(formatLiveCredentialMask(42)).toBe(NO_SUFFIX_MASK_LABEL);
  });
});

describe("SEC12 - the host is shown in its parsed, punycode form", () => {
  it("shows the host exactly as URL parsed it, including a homograph's xn-- form", () => {
    const [row] = buildLmsCredentialRows([storedInput({ baseUrl: "https://xn--pple-43d.com" })]);
    expect(row.host).toBe("xn--pple-43d.com");
  });

  it("keeps a non-default port as part of the shown host", () => {
    const [row] = buildLmsCredentialRows([storedInput({ baseUrl: "https://canvas.example.edu:8443" })]);
    expect(row.host).toBe("canvas.example.edu:8443");
  });

  it("drops the default https port, matching normalizeLmsBaseUrl's own canonical form", () => {
    const [row] = buildLmsCredentialRows([storedInput({ baseUrl: "https://canvas.example.edu:443" })]);
    expect(row.host).toBe("canvas.example.edu");
  });
});

describe("DAT3 - 'Never used' is an explicit state, and needsReentry excludes host_unreachable", () => {
  it("reports lastUsed as never when last_used_at is null", () => {
    const [row] = buildLmsCredentialRows([storedInput({ lastUsedAt: null })]);
    expect(row.source === "stored" && row.lastUsed).toEqual({ kind: "never" });
  });

  it("reports the timestamp when the credential has been used successfully", () => {
    const [row] = buildLmsCredentialRows([storedInput({ lastUsedAt: "2026-03-01T12:00:00.000Z" })]);
    expect(row.source === "stored" && row.lastUsed).toEqual({ kind: "at", at: "2026-03-01T12:00:00.000Z" });
  });

  it("does not invent a third lastUsed state for any input", () => {
    const [row] = buildLmsCredentialRows([storedInput({ lastUsedAt: null, lastFailureKind: "rejected" })]);
    expect(row.source === "stored" && ["never", "at"]).toContain(row.source === "stored" && row.lastUsed.kind);
  });

  it("flags needsReentry for a rejected token", () => {
    const [row] = buildLmsCredentialRows([storedInput({ lastFailureKind: "rejected" })]);
    expect(row.source === "stored" && row.needsReentry).toBe(true);
  });

  it("flags needsReentry for an unreadable (undecryptable) row", () => {
    const [row] = buildLmsCredentialRows([storedInput({ lastFailureKind: "unreadable" })]);
    expect(row.source === "stored" && row.needsReentry).toBe(true);
  });

  it("does NOT flag needsReentry for host_unreachable - a fresh token would not fix a network problem", () => {
    const [row] = buildLmsCredentialRows([storedInput({ lastFailureKind: "host_unreachable" })]);
    expect(row.source === "stored" && row.needsReentry).toBe(false);
  });

  it("does not flag needsReentry when nothing has failed", () => {
    const [row] = buildLmsCredentialRows([storedInput({ lastFailureKind: null })]);
    expect(row.source === "stored" && row.needsReentry).toBe(false);
  });
});

describe("E10 - an environment-backed row is a distinct, control-free shape", () => {
  it("carries no mask, no identity, and no usage history at all", () => {
    const [row] = buildLmsCredentialRows([envInput()]);
    expect(row.source).toBe("environment");
    expect(row.hasControls).toBe(false);
    expect(Object.keys(row)).not.toContain("maskLabel");
    expect(Object.keys(row)).not.toContain("identityLabel");
    expect(Object.keys(row)).not.toContain("lastUsed");
  });

  it("still shows the punycode host, same as a stored row", () => {
    const [row] = buildLmsCredentialRows([envInput({ baseUrl: "https://xn--pple-43d.com" })]);
    expect(row.host).toBe("xn--pple-43d.com");
  });

  it("a stored row for the same institution has hasControls true", () => {
    const [row] = buildLmsCredentialRows([storedInput()]);
    expect(row.hasControls).toBe(true);
  });
});

describe("buildLmsCredentialRows - sorting", () => {
  it("sorts institutions ascending, case-insensitively", () => {
    const rows = buildLmsCredentialRows([
      storedInput({ institution: "ZCC" }),
      storedInput({ institution: "acc" }),
      storedInput({ institution: "MCC" }),
    ]);
    expect(rows.map((r) => r.institution)).toEqual(["acc", "MCC", "ZCC"]);
  });

  it("puts a stored row ahead of an environment row for the same institution", () => {
    const rows = buildLmsCredentialRows([envInput({ institution: "MCC" }), storedInput({ institution: "MCC" })]);
    expect(rows.map((r) => r.source)).toEqual(["stored", "environment"]);
  });

  it("does not mutate the input array's order", () => {
    const inputs = [storedInput({ institution: "ZCC" }), storedInput({ institution: "AAA" })];
    const originalOrder = inputs.map((i) => i.institution);
    buildLmsCredentialRows(inputs);
    expect(inputs.map((i) => i.institution)).toEqual(originalOrder);
  });
});

// ============================================================================
// Sabotage check performed during implementation (reported in Definition of
// Done): temporarily changed needsReentryFor to also return true for
// "host_unreachable". "does NOT flag needsReentry for host_unreachable" went
// red immediately (expected false, got true). Reverted, and the suite is
// green again.
