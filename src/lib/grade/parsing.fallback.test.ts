import { describe, it, expect } from "vitest";
import { parseRubricResponse } from "./parsing";

// PROTECTIVE pin (not a TDD-red test): parseRubricResponse is shared with the
// recording path and must keep falling back to the raw text rather than
// signalling failure. The G5 bad-output guard lives in the engine's
// gradeSubmission; if someone moves it into this parser, these go red.
describe("parseRubricResponse - raw-text fallback is frozen", () => {
  it("falls back on prose with no JSON", () => {
    expect(parseRubricResponse("just prose, no json")).toEqual({
      overallComment: "just prose, no json",
      improvements: "",
      rubricAreas: [{ area: "Overall", score: "", comment: "just prose, no json" }],
      totalScore: "",
    });
  });

  it("falls back on malformed braces that JSON.parse rejects", () => {
    expect(parseRubricResponse("{ not valid json }")).toEqual({
      overallComment: "{ not valid json }",
      improvements: "",
      rubricAreas: [{ area: "Overall", score: "", comment: "{ not valid json }" }],
      totalScore: "",
    });
  });
});
