import { expect, it } from "vitest";
import { deriveAnnouncementOutline } from "./announcement-outline";
import { promptSafeAnnouncementOutline } from "./announcement-prompt-outline";
import { applyWalkthroughFidelity } from "./walkthrough-announcement-fidelity";

it("preserves only a count of recognizable sample closing paragraphs", () => {
  const sample = "Welcome to Week Twelve!\nCourse details.\nIf you are having difficulty, reach out.\nAs we continue through the course, remember your goals.\nKeep focusing on clear reasoning.";
  const outline = promptSafeAnnouncementOutline(deriveAnnouncementOutline(sample));
  expect(outline.opensWithWelcome).toBe(true);
  expect(outline.closingParagraphs).toBe(3);
  expect(JSON.stringify(outline)).not.toContain("Week Twelve");
});
it("adds a fact-free welcome and groups only recognized closing paragraphs", () => {
  const outline = { ...deriveAnnouncementOutline("Welcome to class!\nAs we continue, reflect.\nKeep focusing on clarity."), closingParagraphs: 2 };
  const input = "Current course content.\n\nIf you have questions, reach out.\n\nPlease reach out for help.\n\nAs we continue, keep practicing.\n\nKeep focusing on progress.";
  const output = applyWalkthroughFidelity(input, outline);
  expect(output).toBe("Welcome!\n\nCurrent course content.\n\nIf you have questions, reach out. Please reach out for help.\n\nAs we continue, keep practicing. Keep focusing on progress.");
  expect(applyWalkthroughFidelity(output, outline)).toBe(output);
});
it("does not group factual, list, or ambiguous closing content", () => {
  const outline = { ...deriveAnnouncementOutline("Welcome to class!"), closingParagraphs: 1 };
  const input = "Welcome!\n\nIf you have questions about the quiz, reach out.\n\n- Submit the work\n\nKeep focusing on progress.";
  expect(applyWalkthroughFidelity(input, outline)).toBe(input);
});
