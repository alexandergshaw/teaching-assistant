import { describe, it, expect } from "vitest";
import { applyTextRevision, applySlidesRevision, applyHtmlRevision } from "./revise";

const DOC = [
  "# Intro to Loops",
  "",
  "## Overview",
  "",
  "Loops repeat work so you do not have to.",
  "",
  "## Grading",
  "",
  "- Attendance counts",
  "",
  "## Resources",
  "",
  "- The textbook",
].join("\n");

describe("applyTextRevision", () => {
  it('applies replace "A" with "B"', () => {
    const r = applyTextRevision(DOC, 'Replace "textbook" with "course reader"');
    expect(r.applied).toBe(true);
    expect(r.text).toContain("course reader");
    expect(r.text).not.toContain("textbook");
  });

  it("removes a section by heading", () => {
    const r = applyTextRevision(DOC, 'Remove the section "Grading"');
    expect(r.applied).toBe(true);
    expect(r.text).not.toContain("## Grading");
    expect(r.text).not.toContain("Attendance counts");
    expect(r.text).toContain("## Resources");
  });

  it("renames the title", () => {
    const r = applyTextRevision(DOC, 'Change the title to "Loops in Python"');
    expect(r.applied).toBe(true);
    expect(r.text).toContain("# Loops in Python");
    expect(r.text).not.toContain("# Intro to Loops");
  });

  it("adds a section and a bullet to a named section", () => {
    const withSection = applyTextRevision(DOC, 'Add a section "Office Hours"');
    expect(withSection.text).toContain("## Office Hours");

    const withBullet = applyTextRevision(DOC, 'Add a bullet "Videos" to the "Resources" section');
    expect(withBullet.applied).toBe(true);
    const resourcesIndex = withBullet.text.indexOf("## Resources");
    expect(withBullet.text.indexOf("- Videos")).toBeGreaterThan(resourcesIndex);
  });

  it("removes lines containing a phrase", () => {
    const r = applyTextRevision(DOC, 'Delete the bullet containing "Attendance"');
    expect(r.applied).toBe(true);
    expect(r.text).not.toContain("Attendance counts");
  });

  it("shortens wordy prose paragraphs", () => {
    const doc = "# T\n\nIn order to pass you really must very carefully test.";
    const r = applyTextRevision(doc, "Shorten this");
    expect(r.applied).toBe(true);
    expect(r.text).toContain("To pass you must carefully test.");
  });

  it("leaves the document unchanged for an unparseable instruction", () => {
    const r = applyTextRevision(DOC, "Make it feel more inspiring and poetic");
    expect(r.applied).toBe(false);
    expect(r.text).toBe(DOC);
  });
});

describe("applySlidesRevision", () => {
  const slides = [
    { title: "Overview", bullets: ["a", "b"] },
    { title: "Loops in Depth", bullets: ["c", "old term here"] },
  ];

  it("removes a slide by title", () => {
    const r = applySlidesRevision(slides, 'Remove the slide "Loops in Depth"');
    expect(r.applied).toBe(true);
    expect(r.slides.map((s) => s.title)).toEqual(["Overview"]);
  });

  it("adds and renames slides", () => {
    const added = applySlidesRevision(slides, 'Add a slide "Recursion"');
    expect(added.slides.map((s) => s.title)).toContain("Recursion");

    const renamed = applySlidesRevision(slides, 'Rename the slide "Overview" to "Agenda"');
    expect(renamed.slides[0].title).toBe("Agenda");
  });

  it("removes bullets containing a phrase and replaces text", () => {
    const removed = applySlidesRevision(slides, 'Remove the bullet containing "old term"');
    expect(removed.slides[1].bullets).toEqual(["c"]);

    const replaced = applySlidesRevision(slides, 'Replace "old term" with "new term"');
    expect(replaced.slides[1].bullets[1]).toContain("new term");
  });

  it("leaves the deck unchanged for an unparseable instruction", () => {
    const r = applySlidesRevision(slides, "Give it more energy");
    expect(r.applied).toBe(false);
    expect(r.slides).toEqual(slides);
  });
});

describe("applyHtmlRevision", () => {
  const html = "<h2>Rules</h2><p>No late work accepted.</p><p>Be kind.</p>";

  it("replaces quoted text", () => {
    const r = applyHtmlRevision(html, 'Replace "No late work accepted" with "Late work loses 10% per day"');
    expect(r.applied).toBe(true);
    expect(r.html).toContain("Late work loses 10% per day");
  });

  it("removes an element containing a quoted phrase", () => {
    const r = applyHtmlRevision(html, 'Remove the paragraph about "late work"');
    expect(r.applied).toBe(true);
    expect(r.html).not.toContain("No late work");
    expect(r.html).toContain("Be kind.");
  });

  it("leaves the page unchanged otherwise", () => {
    const r = applyHtmlRevision(html, "Restructure the whole page");
    expect(r.applied).toBe(false);
    expect(r.html).toBe(html);
  });
});
