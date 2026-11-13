import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { expect, it, vi } from "vitest";
vi.mock("./repoGradesProfileClient", async (original) => ({ ...await original<typeof import("./repoGradesProfileClient")>() }));
import { ProfileForm } from "./RepoGradeProfileSettings";

it("only describes targeted execution for the intended organization and exact folder", () => {
  const render = (organization: string, folder: string) => renderToStaticMarkup(createElement(ProfileForm, {
    courseId: "course", organization, folder, initialProfile: null, reload: () => {},
  }));
  const targeted = render("intro-to-computer-science-fall-2026", "assignments/module_12");
  expect(targeted).toContain("explicit targeted regrades with Gemini run source tests");
  expect(targeted).toContain("Clear any saved code execution opt-in");
  expect(render("another-org", "assignments/module_12")).not.toContain("explicit targeted regrades with Gemini");
  expect(render("intro-to-computer-science-fall-2026", "assignments/module_11")).not.toContain("explicit targeted regrades with Gemini");
});

it("preserves an existing opt-in so it can be cleared", () => {
  const html = renderToStaticMarkup(createElement(ProfileForm, {
    courseId: "course", organization: "intro-to-computer-science-fall-2026", folder: "assignments/module_12", reload: () => {},
    initialProfile: { provider: "embedded", runCode: true, instructions: "instructions", rubric: "rubric" } as never,
  }));
  expect(html).toContain("Keep saved code execution opt-in. Clear it to use automatic grading.");
  expect(html).toMatch(/type="checkbox"[^>]*checked=""/);
});
