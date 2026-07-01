import { describe, it, expect } from "vitest";
import { scaffoldModuleIntro, scaffoldAssignment } from "./content";
import { deriveTopic, toBullets, keyPhrases, summarizeObjectives } from "./scaffold";

describe("scaffold utilities", () => {
  it("splits objectives into discrete bullets", () => {
    const bullets = toBullets("- Understand loops\n- Use functions\n- Debug errors");
    expect(bullets).toEqual(["Understand loops", "Use functions", "Debug errors"]);
  });

  it("strips learning-objective scaffolding to derive a topic", () => {
    const topic = deriveTopic("Students will be able to understand binary search trees.");
    expect(topic).toBe("binary search trees");
  });

  it("pulls key phrases including capitalized terms", () => {
    const phrases = keyPhrases("This module covers Machine Learning and gradient descent.");
    expect(phrases.map((p) => p.toLowerCase())).toContain("machine learning");
  });

  it("summarizes objectives into one sentence", () => {
    const s = summarizeObjectives("- write a loop\n- call a function");
    expect(s).toMatch(/^You will work with .*\.$/);
    expect(s).toContain("and call a function");
  });
});

describe("scaffoldModuleIntro", () => {
  it("produces an overview and key-terms intro grounded in the objectives", () => {
    const intro = scaffoldModuleIntro(
      "Students will understand recursion and the call stack.",
      "Prerequisite: functions."
    );
    expect(intro.overview).toContain("recursion");
    expect(intro.overview.length).toBeGreaterThan(0);
    expect(intro.keyTerms.length).toBeGreaterThan(0);
  });

  it("still returns usable text when inputs are sparse", () => {
    const intro = scaffoldModuleIntro("", "");
    expect(intro.overview.trim().length).toBeGreaterThan(0);
    expect(intro.keyTerms.trim().length).toBeGreaterThan(0);
  });
});

describe("scaffoldAssignment", () => {
  it("builds a titled assignment with at least four steps", () => {
    const a = scaffoldAssignment("- Build a REST API\n- Add authentication\n- Write tests");
    expect(a.title).toMatch(/Applied Assignment/);
    expect(a.steps.length).toBeGreaterThanOrEqual(4);
    expect(a.deliverables.length).toBeGreaterThan(0);
    expect(a.tools.length).toBeGreaterThan(0);
  });

  it("suggests language-appropriate free tools", () => {
    const a = scaffoldAssignment("Analyze a dataset with Python and pandas.");
    expect(a.tools).toContain("Python");
    expect(a.tools).toContain("Google Colab");
  });

  it("caps steps at eight", () => {
    const objectives = Array.from({ length: 12 }, (_, i) => `- Objective number ${i + 1}`).join("\n");
    const a = scaffoldAssignment(objectives);
    expect(a.steps.length).toBeLessThanOrEqual(8);
  });
});
