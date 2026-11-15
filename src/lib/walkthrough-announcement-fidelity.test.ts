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

it("groups the reported interspersed closing into three paragraphs without losing or reordering facts", () => {
  const outline = { ...deriveAnnouncementOutline("Welcome to class!"), closingParagraphs: 3, opensWithWelcome: false };
  const input = [
    "As you finalize your project, remember that clear communication is as important as technical accuracy. Focus on providing actionable insights.",
    "I look forward to seeing your analysis. Please reach out with questions.",
    "Finalizing your submission requires careful documentation. Ensure that your reasoning is clear.",
    "This week is a great opportunity to apply the concepts. Your ability to distinguish threats matters.",
    "I encourage you to use the provided questions. They are not graded.",
    "Good luck. I am available if you need help.",
  ].join("\n\n");
  const result = applyWalkthroughFidelity(input, outline);
  expect(result.split("\n\n")).toHaveLength(3);
  expect(result.replace(/\s+/g, " ")).toBe(input.replace(/\s+/g, " "));
  expect(result).toContain("They are not graded.");
  expect(applyWalkthroughFidelity(result, outline)).toBe(result);
});
it("never regroups code, list steps or unanchored endings", () => {
  const outline = { ...deriveAnnouncementOutline("Welcome!"), opensWithWelcome: false, closingParagraphs: 1 };
  const examples = [
    "Example:\n\n```\nI look forward to testing.\n\nGood luck.\n```",
    "I look forward to the results.\n\n1. Complete the assignment.\n2. Submit the file.\n\nGood luck.",
    "I look forward to your analysis.\n\nFactual paragraph.\n\nA final unrecognized statement.",
  ];
  for (const input of examples) expect(applyWalkthroughFidelity(input, outline)).toBe(input);
});

it("does not add a second welcome when an emoji precedes the generated welcome", () => {
  const icon = String.fromCodePoint(0x1f44b);
  const input = `${icon} Welcome to the course!\n\nCurrent details.`;
  expect(applyWalkthroughFidelity(input, { ...deriveAnnouncementOutline("Welcome!"), opensWithWelcome: true })).toBe(input);
});

it("moves a self-contained early help offer after later instructional sections without changing its wording", () => {
  const outline = { ...deriveAnnouncementOutline("If you have questions, reach out."), opensWithWelcome: false, closingParagraphs: 1 };
  const help = "If you have questions, please reach out. I am available during office hours.";
  const input = ["Current introduction.", help, "## Career considerations\n\n- Explore security roles", "Keep focusing on your progress."].join("\n\n");
  const result = applyWalkthroughFidelity(input, outline);
  expect(result.indexOf("Career considerations")).toBeLessThan(result.indexOf(help));
  expect(result).toContain("- Explore security roles");
  expect(result.match(/office hours/g)).toHaveLength(1);
  expect(applyWalkthroughFidelity(result, outline)).toBe(result);
});

it("does not move a mixed-content or explicitly headed support block", () => {
  const outline = { ...deriveAnnouncementOutline("Welcome!"), opensWithWelcome: false, closingParagraphs: 1 };
  const examples = [
    "If you have questions, reach out. Submit your report by Sunday.\n\n## Next\n\n- Work",
    "## Help\n\nIf you have questions, reach out.\n\n## Next\n\n- Work",
    "If you have questions, reach out at https://example.edu/help.\n\n## Next\n\n- Work",
  ];
  for (const input of examples) expect(applyWalkthroughFidelity(input, outline)).toBe(input);
});

it("keeps a sign-off and signature last when moving an earlier help offer", () => {
  const outline = { ...deriveAnnouncementOutline("Welcome!"), opensWithWelcome: false, closingParagraphs: 1 };
  const input = "Current course content.\n\nIf you have questions, please reach out.\n\n## Careers\n\n- Explore security roles\n\nBest,\nProfessor Lee";
  const output = applyWalkthroughFidelity(input, outline);
  expect(output.endsWith("If you have questions, please reach out.\n\nBest,\nProfessor Lee")).toBe(true);
  expect(output.indexOf("Careers")).toBeLessThan(output.indexOf("If you have questions"));
});
it("keeps a separate sign-off and signature at the end", () => {
  const outline = { ...deriveAnnouncementOutline("Welcome!"), opensWithWelcome: false, closingParagraphs: 1 };
  const input = "If you have questions, please reach out.\n\n## Careers\n\n- Explore roles\n\nBest,\n\nProfessor Lee";
  expect(applyWalkthroughFidelity(input, outline).endsWith("If you have questions, please reach out.\n\nBest,\n\nProfessor Lee")).toBe(true);
});
it("does not move content after an unrecognized possible signature", () => {
  const outline = { ...deriveAnnouncementOutline("Welcome!"), opensWithWelcome: false, closingParagraphs: 1 };
  const input = "If you have questions, please reach out.\n\n## Careers\n\n- Explore roles\n\nProfessor Lee";
  expect(applyWalkthroughFidelity(input, outline)).toBe(input);
});