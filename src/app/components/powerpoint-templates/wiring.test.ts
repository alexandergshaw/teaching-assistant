import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { stripComments } from "@/app/components/ui/modalAdoptionSourceScan";
describe("PowerPoint template UI wiring (source, not rendering)", () => {
  const source = stripComments(readFileSync("src/app/components/powerpoint-templates/index.tsx", "utf8"));
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
  it("associates every processing-disabled name, source, reload and saved-open control with the visible busy status", () => {
    const reloadText = source.indexOf("Reload saved libraries");
    const reloadStart = source.lastIndexOf("<button", reloadText);
    const reloadEnd = source.indexOf("</button>", reloadText) + "</button>".length;
    const openStart = source.indexOf('<button className={styles.libraryButton}');
    const openEnd = source.indexOf("</button>", openStart) + "</button>".length;
    expect(reloadText).toBeGreaterThanOrEqual(0);
    expect(openStart).toBeGreaterThanOrEqual(0);
    const controls = [
      source.match(/Template name(<input[\s\S]*?\/>)/)?.[1],
      source.match(/PowerPoint source \(\.pptx\)(<input[\s\S]*?\/>)/)?.[1],
      source.slice(reloadStart, reloadEnd),
      source.slice(openStart, openEnd),
    ];
    expect(controls).toHaveLength(4);
    for (const control of controls) {
      expect(control).toContain('aria-describedby={busy ? "ppt-template-status"');
    }
    expect(source).toContain('<p id="ppt-template-status" className={styles.status} role="status" aria-live="polite">{busy ? "Working..." : status}</p>');
  });
  it("removes comment-only JSX attribute decoys before checking wiring", () => {
    const commentOnlyDecoy = '<input disabled={busy} {' + '/* aria-describedby={busy ? "ppt-template-status" : undefined} */' + '} />';
    expect(stripComments(commentOnlyDecoy)).not.toContain("aria-describedby");
  });
});
