import { describe, expect, it } from "vitest";
import { EMPTY_ANNOUNCEMENT_OUTLINE } from "./announcement-outline-types";
import { buildWalkthroughAnnouncementPrompt, type WalkthroughAnnouncementPromptArgs } from "./walkthrough-announcement-prompt";

const base: WalkthroughAnnouncementPromptArgs = {
  courseLabel: "History 101",
  moduleLabel: "Week 4",
  materialsText: "Read chapter 3 and watch the assigned video on primary sources.",
  outline: EMPTY_ANNOUNCEMENT_OUTLINE,
  coverageBlock: "Chapter 3; one unread page",
  notes: "",
  styleBlock: "",
  emojiPolicy: "forbidden",
  researchedResources: [],
  timing: "beginning-of-week",
};

describe("student-facing walkthrough announcements", () => {
  it.each([
    { ...base },
    { ...base, timing: "midweek" as const, revision: { editedDraft: { title: "Week 4", message: "The walkthrough showed chapter 3." }, revisionNote: "Make it concise." } },
  ])("instructs direct announcements on initial and revised drafts", (args) => {
    const prompt = buildWalkthroughAnnouncementPrompt(args);
    expect(prompt).toContain("Write the title and body as a direct instructor-to-student announcement.");
    expect(prompt).toContain("Do not mention the walkthrough, screen sharing, capture, recording, or how the information was gathered");
    expect(prompt).toContain("A real course video or walkthrough that students are assigned may be mentioned as course content when the materials support it");
    expect(prompt).toContain("do not invent missing content or claim comprehensive coverage");
    expect(prompt).toContain("Read chapter 3 and watch the assigned video on primary sources.");
    expect(prompt).not.toContain("Name, plainly, which captured pages the announcement covers.");
  });
});
