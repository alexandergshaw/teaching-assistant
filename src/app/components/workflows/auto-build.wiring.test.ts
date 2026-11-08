import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const read = (path: string) => readFileSync(join(process.cwd(), "src", "app", path), "utf8");

describe("Auto Build wiring", () => {
  it("keeps one runner mounted and hides it when another destination is active", () => {
    const page = read("page.tsx");
    expect(page.match(/<WorkflowsTab autoBuild\s*\/>/g)).toHaveLength(1);
    expect(page).toContain('const autoBuildVisible = activeTab === "manual" && toolsSection === "manual" && manualView === "course-planning" && buildView === "auto"');
    expect(page).toContain('if (autoBuildVisible && !autoBuildVisited) setAutoBuildVisited(true)');
    expect(page).toMatch(/autoBuildVisited\s*&&\s*\([\s\S]*?display: autoBuildVisible \? undefined : "none"[\s\S]*?<WorkflowsTab autoBuild\s*\/>/);
    expect(page).not.toMatch(/buildView === "auto"\s*&&\s*\(\s*<WorkflowsTab autoBuild/);
  });

  it("restores the stored build view through the same normalizer used by URLs", () => {
    const nav = read("components/home/useAppNavigation.ts");
    expect(nav).toContain("normalizeBuildView(localStorage.getItem(BUILD_VIEW_KEY))");
    expect(nav).toContain("localStorage.setItem(BUILD_VIEW_KEY, v)");
  });

  it("opens Course Build with the description source and isolated form storage", () => {
    const workflow = read("components/WorkflowsTab.tsx");
    expect(workflow).toContain('if (autoBuild) return "course-build"');
    expect(workflow).toContain('source: "course-description"');
    expect(workflow).toContain('autoBuild ? "ta-auto-build-values"');
    expect(workflow).toContain('autoBuild ? "auto-build" : selectedDef.id');
    expect(workflow).toContain('if (autoBuild && fieldKey === "source") return');
    expect(workflow).toContain('runtimeFields.filter((field) => field.fieldKey !== "source")');
    expect(workflow).toContain('{!autoBuild && <WorkflowListSidebar');
    expect(workflow).toMatch(/if \(autoBuild\)\s*\{\s*setCustom\(dbRows\);\s*\}\s*else if \(dbRows\.length === 0\)/);
  });
});
