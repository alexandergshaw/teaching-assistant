import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
describe("template tool page wiring (source, not rendering)", () => {
  it("mounts both panels and supplies PowerPoint navigation to existing creation", () => {
    const page = readFileSync("src/app/page.tsx", "utf8");
    expect(page).toContain('import PowerPointTemplates from "./components/powerpoint-templates"');
    expect(page).toContain('import DocumentTemplates from "./components/document-templates"');
    expect(page).toMatch(/presentationsView === "ppt-templates"[\s\S]*?<PowerPointTemplates onUseInSlideDeckCreation=\{\(\) => setPresentationsView\("slide-deck"\)\}/);
    expect(page).toMatch(/presentationsView === "document-templates"[\s\S]*?<DocumentTemplates/);
    expect(page).toContain("<PresentationsTab />");
  });
  it("shared navigation still writes and restores URL/history and persisted presentations view", () => {
    const source = readFileSync("src/app/components/home/useAppNavigation.ts", "utf8");
    expect(source).toContain("normalizePresentationsView");
    expect(source).toContain("popstate");
    expect(source).toContain("buildUrlSearch");
    expect(source).toContain("ta-presentations-view");
  });
});
