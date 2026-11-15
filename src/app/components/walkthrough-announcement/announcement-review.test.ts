import { expect, it } from "vitest";
import { hasCaptureProcessReference, reviewTemplateStructure } from "./announcement-review";

it("flags likely references without changing the draft", () => {
  expect(hasCaptureProcessReference("Week 2", "During the walkthrough, I showed the quiz.")).toBe(true);
  expect(hasCaptureProcessReference("From this recording", "Review the assignment.")).toBe(true);
  expect(hasCaptureProcessReference("Week 2", "Read the chapter and complete the quiz.")).toBe(false);
});

it("flags reordered named sections but permits unsupported sections to be omitted", () => {
  const base = { break: "heading" as const, listKind: "unordered" as const, sentenceRange: [1, 3] as const };
  const outline = { sections: [{ ...base, index: 1, heading: "Complete" }, { ...base, index: 2, heading: "Also Review" }, { ...base, index: 3, heading: "Quiz Details" }], hasGreeting: false, hasSignOff: false, hasLinks: false, dueDateSectionIndex: null, todoSectionIndex: null };
  expect(reviewTemplateStructure("## Also Review\n- B\n\n## Complete\n- A", outline).orderChanged).toBe(true);
  expect(reviewTemplateStructure("## Complete\n- A\n\n## Quiz Details\n- C", outline).orderChanged).toBe(false);
});
it("flags a large section-count difference without changing content", () => {
  const sections = Array.from({ length: 8 }, (_, index) => ({ index: index + 1, heading: null, break: "paragraph-break" as const, listKind: null, sentenceRange: [1, 3] as const }));
  const outline = { sections, hasGreeting: false, hasSignOff: false, hasLinks: false, dueDateSectionIndex: null, todoSectionIndex: null };
  expect(reviewTemplateStructure("Review the material.", outline).muchShorter).toBe(true);
});

it("flags a fragmented closing with factual paragraphs interspersed without altering the text", () => {
  const outline = { sections: [], hasGreeting: false, hasSignOff: false, hasLinks: false, dueDateSectionIndex: null, todoSectionIndex: null, closingParagraphs: 3 };
  const message = [
    "As you finalize the project, remember that clear communication matters.",
    "I look forward to seeing your analysis. Please reach out for help.",
    "Finalizing your submission requires careful documentation. Keep your evidence clear.",
    "This week is a great opportunity to apply the concepts.",
    "I encourage you to use the provided questions. They are not graded.",
    "Good luck. I am available if you need help.",
  ].join("\n\n");
  expect(reviewTemplateStructure(message, outline).fragmentedClosing).toBe(true);
  expect(message).toContain("They are not graded.");
  expect(reviewTemplateStructure("## Instructions\n1. Open the editor.\n2. Submit.\n\nGood luck.", outline).fragmentedClosing).toBe(false);
});
