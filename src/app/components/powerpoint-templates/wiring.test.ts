import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
describe("PowerPoint template UI wiring (source, not rendering)", () => {
  const source = readFileSync("src/app/components/powerpoint-templates/index.tsx", "utf8");
  it("exposes upload intent, analysis, editing, saving, reopening, reuse and both downloads", () => {
    for (const operation of ["uploadPowerPointTemplateAction", "analyzePowerPointTemplateAction", "savePowerPointTemplateLibraryAction",
      "getPowerPointTemplateLibraryAction", "listPowerPointTemplateLibrariesAction", "reusePowerPointTemplateLibraryAction", "downloadPowerPointTemplateLibraryAction"]) expect(source).toContain(operation);
    for (const copy of ["Use this upload as a template", "Save classifications", "Use in Slide Deck Creation", "Download original .pptx", "Download saved manifest", "Download reviewed manifest"]) expect(source).toContain(copy);
    expect(source).toContain("setDefinition(previous");
    expect(source).toContain("handoffTemplate(result.sourceFileId");
    expect(source).not.toContain("dangerouslySetInnerHTML");
    expect(source).toContain('role="status"');
    expect(source).toContain('role="alert"');
  });
  it("guards stale responses/unmounts and file wire budget before reading", () => {
    expect(source).toContain("generation.current === ticket");
    expect(source).toContain("alive.current = false");
    expect(source.indexOf("checkFileWireBudget(file.size")).toBeLessThan(source.indexOf("await readTemplateFile(file)"));
    expect(source).toContain("if (!current()) return;");
    expect(source).toContain("locked.current");
  });
});
