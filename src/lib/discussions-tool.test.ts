import { describe, expect, it } from "vitest";
import { defaultDiscussionPrompt, parseDiscussionRoster, personalizeDiscussionReply } from "./discussions-tool";

describe("generic discussions", () => {
  it("keeps roster lines intact, including commas and repeated names", () => {
    expect(parseDiscussionRoster(" Lee, Alex \nMorgan Park\nLee, Alex\n\n")).toEqual(["Lee, Alex", "Morgan Park", "Lee, Alex"]);
  });
  it("uses only the provided name and template for each reply", () => {
    expect(personalizeDiscussionReply("Hello {{name}}! Thanks for sharing.", "Ava $&")).toBe("Hello Ava $&! Thanks for sharing.");
    expect(personalizeDiscussionReply("Thanks for sharing.", "Ava")).toBe("Hi Ava,\n\nThanks for sharing.");
  });
  it("requests a generic response without claiming to have read individual posts", () => {
    const prompt = defaultDiscussionPrompt("Discuss recursion");
    expect(prompt).toContain("Discuss recursion");
    expect(prompt).toContain("without claiming to have read");
    expect(prompt).toContain("{{name}}");
  });
});
