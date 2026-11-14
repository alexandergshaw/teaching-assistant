import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { expect, it, vi } from "vitest";
vi.mock("./repoGradesProfileClient", async (original) => ({ ...await original<typeof import("./repoGradesProfileClient")>() }));
import { ProfileForm } from "./RepoGradeProfileSettings";

it("offers execution opt-in for any course folder and defaults it off", () => {
  const render = (organization: string, folder: string) => renderToStaticMarkup(createElement(ProfileForm, {
    courseId: "course", organization, folder, initialProfile: null, reload: () => {},
  }));
  for (const html of [render("intro-to-computer-science-fall-2026", "assignments/module_12"), render("another-org", "lab")]) {
    expect(html).toContain("Run submitted code during automatic grading");
    expect(html).not.toContain("Automatic code execution is unavailable");
  }
});

it("preserves an existing opt-in so it can be cleared", () => {
  const html = renderToStaticMarkup(createElement(ProfileForm, {
    courseId: "course", organization: "intro-to-computer-science-fall-2026", folder: "assignments/module_12", reload: () => {},
    initialProfile: { provider: "embedded", runCode: true, instructions: "instructions", rubric: "rubric" } as never,
  }));
  expect(html).toContain("Run submitted code during automatic grading");
  expect(html).toContain("Choose Gemini or turn off code execution before saving.");
  expect(html).toMatch(/type="checkbox"[^>]*checked=""/);
});
