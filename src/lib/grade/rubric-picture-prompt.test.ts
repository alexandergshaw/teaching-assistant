import { describe, it, expect } from "vitest";
import { buildRubricPicturePrompt } from "./rubric-picture-prompt";

// N15-1 (docs/n15-waves-1-2-test-notes.md R1.1-R1.3). buildRubricPicturePrompt
// is a pure leaf, fully executable here - no React, no server-only imports.

describe("buildRubricPicturePrompt", () => {
  it("R1.1: the kind parameter is live - construction-based, fully discriminating", () => {
    const rubricOutput = buildRubricPicturePrompt("rubric");
    const assignmentOutput = buildRubricPicturePrompt("assignment description");

    // (a) the two outputs are not equal to each other.
    expect(rubricOutput).not.toEqual(assignmentOutput);
    // (b) the "rubric" output contains its own kind noun.
    expect(rubricOutput.toLowerCase()).toContain("rubric");
    // (c) the "assignment description" output contains its own kind noun.
    expect(assignmentOutput.toLowerCase()).toContain("assignment");
  });

  it("R1.2: the anti-injection clause is present in each kind's output", () => {
    const kinds: Array<"rubric" | "assignment description"> = ["rubric", "assignment description"];
    for (const kind of kinds) {
      const output = buildRubricPicturePrompt(kind).toLowerCase();
      expect(output).toContain("instruction");
      expect(output).toContain("even if");
    }
  });

  it("R1.3: the do-not-invent and plain-text-only instructions are present in each kind's output", () => {
    const doNotInventTokens = ["do not guess", "never guess", "do not invent", "without guessing"];
    const plainTextTokens = ["plain text", "no json", "not json", "transcription text only"];
    const kinds: Array<"rubric" | "assignment description"> = ["rubric", "assignment description"];

    for (const kind of kinds) {
      const output = buildRubricPicturePrompt(kind).toLowerCase();
      expect(doNotInventTokens.some((token) => output.includes(token))).toBe(true);
      expect(plainTextTokens.some((token) => output.includes(token))).toBe(true);
    }
  });
});
