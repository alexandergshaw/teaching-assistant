// TDD - written from the AC BEFORE implementation (avatar-likeness, F4 course +
// purpose extension). Currently FAILS: src/lib/avatar-video-purpose.ts does not
// exist. Make these pass without changing what they assert.
//
// The seam under test is the PURE brief composer. It exists so the thing we
// actually care about - that the course and the purpose genuinely reach the
// model rather than being decorative dropdowns - is testable in a node
// environment, since this project's vitest has no jsdom and cannot test the UI.
import { describe, it, expect } from "vitest";
import {
  AVATAR_VIDEO_PURPOSES,
  composeAvatarScriptBrief,
  type AvatarVideoPurpose,
} from "./avatar-video-purpose";

describe("the purpose catalogue", () => {
  const values = () => AVATAR_VIDEO_PURPOSES.map((p) => p.value);

  it("covers every purpose the user named", () => {
    // "welcoming video, midterm video, finals video, explaining etc"
    for (const v of ["welcome", "midterm", "finals", "explainer"]) {
      expect(values(), `${v} must be offered`).toContain(v);
    }
  });

  it("has unique values", () => {
    expect(new Set(values()).size).toBe(values().length);
  });

  it("gives every purpose a human label, never the raw enum value", () => {
    for (const p of AVATAR_VIDEO_PURPOSES) {
      expect(p.label.trim().length).toBeGreaterThan(0);
      expect(p.label).not.toBe(p.value);
    }
  });

  it("gives every purpose DISTINCT guidance", () => {
    // A shared generic line would make the dropdown decorative - every choice
    // would produce the same script.
    const guidance = AVATAR_VIDEO_PURPOSES.map((p) => p.guidance.trim());
    for (const g of guidance) expect(g.length).toBeGreaterThan(20);
    expect(new Set(guidance).size).toBe(guidance.length);
  });
});

describe("composeAvatarScriptBrief", () => {
  const prompt = "Keep it under two minutes and mention the group project.";
  const courseFacts = "Name: Intro to Databases\nCourse code: CS-220\nTerm: Fall 2026";

  it("always carries the user's own prompt through verbatim", () => {
    const brief = composeAvatarScriptBrief({ prompt, courseFacts: null, purpose: null });
    expect(brief).toContain(prompt);
  });

  it("carries the purpose's guidance, not just its label", () => {
    const welcome = AVATAR_VIDEO_PURPOSES.find((p) => p.value === "welcome")!;
    const brief = composeAvatarScriptBrief({ prompt, courseFacts: null, purpose: "welcome" });
    expect(brief).toContain(welcome.guidance);
  });

  it("carries the course facts when a course is selected", () => {
    const brief = composeAvatarScriptBrief({ prompt, courseFacts, purpose: "welcome" });
    expect(brief).toContain("Intro to Databases");
    expect(brief).toContain("CS-220");
  });

  it("produces a materially different brief per purpose", () => {
    const briefs = AVATAR_VIDEO_PURPOSES.map((p) =>
      composeAvatarScriptBrief({ prompt, courseFacts, purpose: p.value })
    );
    expect(new Set(briefs).size).toBe(briefs.length);
  });

  it("works with no course and no purpose", () => {
    const brief = composeAvatarScriptBrief({ prompt, courseFacts: null, purpose: null });
    expect(brief).toContain(prompt);
    expect(brief.trim().length).toBeGreaterThan(prompt.length);
  });

  it("emits no empty scaffolding when a field is absent", () => {
    // A dangling "Course:" or "Purpose:" header with nothing under it reads to
    // the model as recorded fact - the same trap renderCourseFacts avoids by
    // omitting empty fields rather than writing "(none)".
    const brief = composeAvatarScriptBrief({ prompt, courseFacts: null, purpose: null });
    expect(brief).not.toMatch(/course[^\n]*:\s*$/im);
    expect(brief).not.toMatch(/purpose[^\n]*:\s*$/im);
    expect(brief.toLowerCase()).not.toContain("(none)");
    expect(brief.toLowerCase()).not.toContain("undefined");
    expect(brief.toLowerCase()).not.toContain("null");
  });

  it("treats a blank course-facts string the same as no course", () => {
    const blank = composeAvatarScriptBrief({ prompt, courseFacts: "   ", purpose: null });
    const none = composeAvatarScriptBrief({ prompt, courseFacts: null, purpose: null });
    expect(blank).toBe(none);
  });

  it("ignores an unrecognised purpose rather than injecting a broken line", () => {
    const brief = composeAvatarScriptBrief({
      prompt,
      courseFacts: null,
      purpose: "not-a-real-purpose" as AvatarVideoPurpose,
    });
    expect(brief).toContain(prompt);
    expect(brief).not.toContain("not-a-real-purpose");
    expect(brief.toLowerCase()).not.toContain("undefined");
  });

  it("still asks for a spoken-word script, whatever the inputs", () => {
    for (const purpose of [null, "finals" as const]) {
      const brief = composeAvatarScriptBrief({ prompt, courseFacts, purpose });
      expect(brief.toLowerCase()).toMatch(/spoken|say|read aloud|camera|script/);
    }
  });
});
