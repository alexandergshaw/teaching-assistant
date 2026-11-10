import { describe, expect, it } from "vitest";
import { appendChatSetupVersion, requestForChatSetup, type ChatGradingSetup } from "./chatVersionedSetup";

const original: ChatGradingSetup = { assignmentInstructions: "First instructions", rubric: "First rubric", provider: "gemini", pointsPossible: 10, applyNamingDeduction: true };
const entry = { student: "Student", content: "Work", mergedFileCount: 0, submittedFiles: [] };

describe("versioned chat setup foundation", () => {
  it("keeps a pending request on its admitted version after a setup change", () => {
    const first = appendChatSetupVersion({ current: 0, versions: [] }, 0, original)!;
    const pending = requestForChatSetup(first.versions[0], { sourceIndex: 0, entry });
    const second = appendChatSetupVersion(first, 1, { ...original, rubric: "Second rubric", applyNamingDeduction: false })!;
    expect(pending.rubric).toBe("First rubric");
    expect(pending.applyNamingDeduction).toBe(true);
    expect(requestForChatSetup(second.versions[1], { sourceIndex: 0, entry }).rubric).toBe("Second rubric");
    expect(first.versions).toHaveLength(1);
  });

  it("rejects stale asynchronous setup resolutions and copies caller-owned setup", () => {
    const input = { ...original };
    const first = appendChatSetupVersion({ current: 0, versions: [] }, 0, input)!;
    input.rubric = "mutated";
    expect(first.versions[0].setup.rubric).toBe("First rubric");
    expect(appendChatSetupVersion(first, 0, original)).toBeNull();
    expect(appendChatSetupVersion({ current: 2, versions: first.versions }, 2, original)).toBeNull();
  });
});

it("freezes disabled length policy for admitted requests", () => {
  const first = appendChatSetupVersion({ current: 0, versions: [] }, 0, { ...original, suppressLengthDeduction: true })!;
  const pending = requestForChatSetup(first.versions[0], { sourceIndex: 0, entry });
  const second = appendChatSetupVersion(first, 1, { ...original, applyLengthDeduction: true })!;
  expect(pending.suppressLengthDeduction).toBe(true);
  expect(requestForChatSetup(second.versions[1], { sourceIndex: 1, entry }).suppressLengthDeduction).toBeUndefined();
});
