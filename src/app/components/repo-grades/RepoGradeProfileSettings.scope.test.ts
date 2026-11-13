import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { expect, it, vi } from "vitest";
vi.mock("./repoGradesProfileClient", async (original) => ({ ...await original<typeof import("./repoGradesProfileClient")>() }));
import { ProfileForm } from "./RepoGradeProfileSettings";

it("only exposes targeted execution for the intended organization and exact folder", () => {
  const render = (organization: string, folder: string) => renderToStaticMarkup(createElement(ProfileForm, {
    courseId: "course", organization, folder, initialProfile: null, reload: () => {},
  }));
  const targeted = render("intro-to-computer-science-fall-2026", "assignments/module_12");
  expect(targeted).toContain("Run source tests for targeted regrades (review only)");
  expect(targeted).toContain("automatic checks for this folder do not run");
  expect(render("another-org", "assignments/module_12")).not.toContain("Run source tests for targeted regrades");
  expect(render("intro-to-computer-science-fall-2026", "assignments/module_11")).not.toContain("Run source tests for targeted regrades");
});

it("preserves an existing opt-in but prevents saving it with the Embedded provider", () => {
  const html = renderToStaticMarkup(createElement(ProfileForm, {
    courseId: "course", organization: "intro-to-computer-science-fall-2026", folder: "assignments/module_12", reload: () => {},
    initialProfile: { provider: "embedded", runCode: true, instructions: "instructions", rubric: "rubric" } as never,
  }));
  expect(html).toContain("Choose Gemini or clear source test execution before saving.");
  expect(html).toMatch(/disabled=""[^>]*>Save folder profile/);
  expect(html).toMatch(/type="checkbox"[^>]*checked=""/);
});
