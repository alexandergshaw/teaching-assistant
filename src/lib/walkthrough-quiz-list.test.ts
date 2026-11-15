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
