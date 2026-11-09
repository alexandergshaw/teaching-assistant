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
    const reloadStart = source.lastIndexOf("<Button", reloadText);
    const reloadEnd = source.indexOf("</Button>", reloadText) + "</Button>".length;
    const openStart = source.indexOf('<Button variant="text" fullWidth');
    const openEnd = source.indexOf("</Button>", openStart) + "</Button>".length;
    expect(reloadText).toBeGreaterThanOrEqual(0);
    expect(openStart).toBeGreaterThanOrEqual(0);
    const controls = [
      source.match(/<TextField label=\{savedId \? "Library name"[\s\S]*?\/>/)?.[0],
      source.match(/<Button component="label"[\s\S]*?Choose PowerPoint source/)?.[0],
      source.slice(reloadStart, reloadEnd),
      source.slice(openStart, openEnd),
    ];
    expect(controls).toHaveLength(4);
    for (const control of controls) {
      expect(control).toContain('"ppt-template-status"');
    }
    expect(source).toContain('<p id="ppt-template-status" className={styles.status} role="status" aria-live="polite">{busy ? "Working..." : status}</p>');
  });
  it("refreshes on entry, distinguishes loading/empty/error, and pages source slides", () => {
    expect(source).toContain('if (active) queueMicrotask');
    expect(source).toContain('if (!cancelled) void refreshLibraries()');
    expect(source).toContain('ticket !== listGeneration.current');
    expect(source).toContain('Loading saved libraries...');
    expect(source).toContain('librariesLoaded && !libraries.length');
    expect(source).toContain('librariesError && <Alert');
    expect(source).toContain('sourceSlidePage(definition.slides, slidePage)');
    expect(source).toContain('aria-label="Source slide pages"');
    expect(source).toContain('choose Match slides by role in Slide Deck Creation to use your classifications');
    expect(source).toContain('Slides need editable text');
  });
  it("offers manual classification and states textless fill limits", () => {
    expect(source).toContain('Classify manually');
    expect(source).toContain('analyzePowerPointTemplateAction(id, mode)');
    expect(source).toContain('Automatic classification was unavailable.');
    expect(source).toContain('You may assign a role, but this slide cannot be filled');
    expect(source).not.toContain('disabled={busy || !slide.text.trim()}');
  });
  it("gates account-owned state and protects unsaved edits before replacement", () => {
    expect(source).toContain('if (loading) return');
    expect(source).toContain('if (!user) return');
    expect(source).toContain('<PowerPointTemplatesSession key={user.id}');
    expect(source).toContain('if (dirty && (file || sourceId || definition)) setPending({ kind: "file"');
    expect(source).toContain('const preserveName = !file && !sourceId && !definition && name.trim()');
    expect(source).toContain('if (!preserveName) setName(next.name');
    expect(source).toContain('if (dirty) setPending({ kind: "open"');
    expect(source).toContain('if (definition && dirty) setPending({ kind: "analyze"');
    expect(source).toContain('disabled={busy || dirty || !onUseInSlideDeckCreation}');
    expect(source).toContain('window.addEventListener("beforeunload", warn)');
  });
  it("keeps the editor mounted after first visit while presentation and other tabs change", () => {
    const page = stripComments(readFileSync("src/app/page.tsx", "utf8"));
    expect(page).toContain('pptTemplatesVisited && (');
    expect(page).toContain('display: pptTemplatesVisible ? undefined : "none"');
    expect(page).toContain('manualView === "presentations" && presentationsView !== "ppt-templates"');
    expect(page.match(/<PowerPointTemplates\b/g)).toHaveLength(1);
  });
  it("removes comment-only JSX attribute decoys before checking wiring", () => {
    const commentOnlyDecoy = '<input disabled={busy} {' + '/* aria-describedby={busy ? "ppt-template-status" : undefined} */' + '} />';
    expect(stripComments(commentOnlyDecoy)).not.toContain("aria-describedby");
  });
});
