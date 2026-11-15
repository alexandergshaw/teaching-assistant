import { expect, it } from "vitest";
import { hasCaptureProcessReference } from "./announcement-review";

it("flags likely references without changing the draft", () => {
  expect(hasCaptureProcessReference("Week 2", "During the walkthrough, I showed the quiz.")).toBe(true);
  expect(hasCaptureProcessReference("From this recording", "Review the assignment.")).toBe(true);
  expect(hasCaptureProcessReference("Week 2", "Read the chapter and complete the quiz.")).toBe(false);
});
