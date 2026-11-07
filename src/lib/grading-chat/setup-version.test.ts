import { describe, expect, it } from "vitest";
import { canActivateChatSetupVersion, createChatSetupVersion, type ChatSetup } from "./setup-version";

const first = "10000000-0000-0000-0000-000000000001";
const second = "10000000-0000-0000-0000-000000000002";
const third = "10000000-0000-0000-0000-000000000003";
const setup: ChatSetup = {
  instructions: "Explain the reasoning.", rubric: "Correctness: 10 points", provider: "gemini", harshness: "balanced",
  feedbackWordTarget: null, applyNamingDeduction: true, applyLengthDeduction: false, lengthDeductionThresholdWords: null,
};

describe("immutable grading-chat setup versions", () => {
  it("copies and freezes the setup used to identify a version", () => {
    const input = { ...setup };
    const version = createChatSetupVersion(first, null, input)!;
    input.instructions = "Changed after admission";
    expect(version.setup.instructions).toBe("Explain the reasoning.");
    expect(Object.isFrozen(version)).toBe(true);
    expect(Object.isFrozen(version.setup)).toBe(true);
  });

  it("fingerprints all resolved setup fields rather than the caller's object order", () => {
    const a = createChatSetupVersion(first, null, setup)!;
    const b = createChatSetupVersion(second, null, { ...setup })!;
    const c = createChatSetupVersion(third, null, { ...setup, harshness: "strict" })!;
    expect(a.fingerprint).toMatch(/^[0-9a-f]{64}$/);
    expect(a.fingerprint).toBe(b.fingerprint);
    expect(c.fingerprint).not.toBe(a.fingerprint);
  });

  it("rejects stale activation and incorrect parent, including first creation", () => {
    const initial = createChatSetupVersion(first, null, setup)!;
    const replacement = createChatSetupVersion(second, first, { ...setup, rubric: "Revised" })!;
    expect(canActivateChatSetupVersion(null, null, initial)).toBe(true);
    expect(canActivateChatSetupVersion(first, first, replacement)).toBe(true);
    expect(canActivateChatSetupVersion(second, first, replacement)).toBe(false);
    expect(canActivateChatSetupVersion(third, third, replacement)).toBe(false);
    expect(canActivateChatSetupVersion(first, first, initial)).toBe(false);
  });

  it("rejects malformed identifiers and inconsistent deduction settings", () => {
    expect(createChatSetupVersion("invalid", null, setup)).toBeNull();
    expect(createChatSetupVersion(first, "invalid", setup)).toBeNull();
    expect(createChatSetupVersion(first, null, { ...setup, rubric: "" })).toBeNull();
    expect(createChatSetupVersion(first, null, { ...setup, rubric: " \n " })).toBeNull();
    expect(createChatSetupVersion(first, null, { ...setup, applyLengthDeduction: true })).toBeNull();
    expect(createChatSetupVersion(first, null, { ...setup, lengthDeductionThresholdWords: 5 })).toBeNull();
    expect(createChatSetupVersion(first, null, { ...setup, feedbackWordTarget: 19 })).toBeNull();
    expect(createChatSetupVersion(first, null, { ...setup, feedbackWordTarget: 501 })).toBeNull();
    expect(createChatSetupVersion(first, null, { ...setup, feedbackWordTarget: 20 })).not.toBeNull();
    expect(createChatSetupVersion(first, null, { ...setup, feedbackWordTarget: 500 })).not.toBeNull();
    expect(createChatSetupVersion(first, null, { ...setup, applyLengthDeduction: true, lengthDeductionThresholdWords: 1_000_001 })).toBeNull();
    expect(createChatSetupVersion(first, null, { ...setup, applyLengthDeduction: true, lengthDeductionThresholdWords: 1_000_000 })).not.toBeNull();
  });

  it("enforces the combined UTF-8 JSON byte bound used by the durable ledger", () => {
    const base = { ...setup, instructions: "" };
    const available = 200_000 - 15 - Buffer.byteLength(JSON.stringify(base), "utf8");
    expect(createChatSetupVersion(first, null, { ...base, instructions: "a".repeat(available) })).not.toBeNull();
    expect(createChatSetupVersion(first, null, { ...base, instructions: "a".repeat(available + 1) })).toBeNull();
    expect(createChatSetupVersion(first, null, { ...base, instructions: "é".repeat(Math.floor(available / 2) + 1) })).toBeNull();
  });

  it("rejects PostgreSQL-incompatible text while allowing valid surrogate pairs", () => {
    const invalid = ["prefix\u0000suffix", "\ud800", "\udfff", "\ud800a", "\udc00\ud800", "\ud800\ud800\udc00"];
    for (const value of invalid) {
      expect(createChatSetupVersion(first, null, { ...setup, instructions: value })).toBeNull();
      expect(createChatSetupVersion(first, null, { ...setup, rubric: value })).toBeNull();
    }
    expect(createChatSetupVersion(first, null, { ...setup, instructions: "𐐷 漢字", rubric: "𐐷 rubric" })).not.toBeNull();
  });
});
