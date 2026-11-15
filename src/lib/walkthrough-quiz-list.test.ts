import { expect, it } from "vitest";
import { matchQuizDetailsBullets } from "./walkthrough-quiz-list";
import type { AnnouncementOutline } from "./announcement-outline-types";
const outline: AnnouncementOutline = { sections: [{ index: 1, heading: "Quiz Details", break: "heading", listKind: "unordered", sentenceRange: [1, 5] }], hasGreeting: false, hasSignOff: false, hasLinks: false, dueDateSectionIndex: null, todoSectionIndex: null };
it("changes only numbered quiz detail markers to bullets", () => {
  const input = "Intro\n\n## Quiz Details\n1. Due: Sunday\n2. Points: 20\n\n1. Preserve other list\n2. Keep order";
  expect(matchQuizDetailsBullets(input, outline)).toBe("Intro\n\n## Quiz Details\n- Due: Sunday\n- Points: 20\n\n1. Preserve other list\n2. Keep order");
});
it("leaves ambiguous or already correct structures untouched", () => {
  for (const message of ["Quiz Details\n1. One", "Quiz Details\n- One\n- Two", "Quiz Details\n1. One\n2. Two\n  continued", "Quiz Details\n1. A\n2. B\nQuiz Details\n1. C\n2. D"]) expect(matchQuizDetailsBullets(message, outline)).toBe(message);
  const ordered = { ...outline, sections: [{ ...outline.sections[0], listKind: "ordered" as const }] };
  expect(matchQuizDetailsBullets("Quiz Details\n1. A\n2. B", ordered)).toBe("Quiz Details\n1. A\n2. B");
});

it("matches renamed assessment metadata without changing procedural steps", () => {
  const details = "Assessment Details\n1. Due: Thursday\n2. Points: 10";
  expect(matchQuizDetailsBullets(details, outline)).toBe("Assessment Details\n- Due: Thursday\n- Points: 10");
  const steps = "Assessment Details\n1. Open the editor.\n2. Submit the project.";
  expect(matchQuizDetailsBullets(steps, outline)).toBe(steps);
  const multiple = details + "\n\nQuiz Information\n1. Due: Friday\n2. Points: 20";
  expect(matchQuizDetailsBullets(multiple, outline)).toBe(multiple);
});

it("does not change quoted, fenced, or indented code examples", () => {
  for (const input of [
    "```\nQuiz Details\n1. Due: Thursday\n2. Points: 10\n```",
    "~~~\nQuiz Details\n1. Due: Thursday\n2. Points: 10\n~~~",
    "> Quiz Details\n> 1. Due: Thursday\n> 2. Points: 10",
    "    Quiz Details\n    1. Due: Thursday\n    2. Points: 10",
    "Quiz Details\n    1. Due: Thursday\n    2. Points: 10",
  ]) expect(matchQuizDetailsBullets(input, outline)).toBe(input);
});

it("retains numbered assignment procedures from the reported draft", () => {
  const input = "Assignment Details and Requirements\n1. Complete the extra credit using the provided workspace.\n2. Submit a single file containing screenshots.\n3. Include a write-up explaining your work.";
  expect(matchQuizDetailsBullets(input, outline)).toBe(input);
});
