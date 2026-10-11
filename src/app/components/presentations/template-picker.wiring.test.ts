// PPT-TEMPLATE-UPLOAD-PLACE wave 2: reachability pins. The surface is a layer -
// the picker AND the download branch must both be reachable from the creation
// view. Source-text only; no component renders under vitest.

import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const dir = join(process.cwd(), "src/app/components/presentations");
const read = (name: string) => readFileSync(join(dir, name), "utf8");

const picker = read("DeckTemplatePicker.tsx");
const index = read("index.tsx");
const card = read("ArtifactCard.tsx");
const hooks = readFileSync(join(process.cwd(), "src/app/components/ppt-design/hooks.ts"), "utf8");

describe("DeckTemplatePicker wiring", () => {
  it("uploads and lists through the shipped actions and never the sources path", () => {
    expect(picker).toContain("uploadDeckTemplateFileAction");
    expect(picker).toContain("listDeckTemplateFilesAction");
    expect(picker).not.toContain("extractDeckSourceFileAction");
  });

  it("runs the client wire-budget pre-check before the file is read", () => {
    const check = picker.indexOf("checkFileWireBudget(file.size");
    const read = picker.indexOf("await readFileAsBase64(file)");
    expect(check).toBeGreaterThan(-1);
    expect(read).toBeGreaterThan(check);
  });

  it("clears a stored id that is absent from the loaded list", () => {
    expect(picker).toContain("keepTemplateIdIfPresent");
  });
});

describe("creation view reachability", () => {
  it("mounts the picker in the creation view", () => {
    expect(index).toContain("<DeckTemplatePicker");
  });

  it("holds the selection under the shared ta-ppt-template-file-id key", () => {
    expect(index).toContain("useSelectedDeckTemplateFileId");
    expect(hooks).toContain('useLocalStorageState<string>("ta-ppt-template-file-id"');
    expect(picker).not.toMatch(/ta-ppt-template-file-id|localStorage/);
    expect(index).not.toMatch(/["']ta-[a-z-]*template[a-z-]*["']/);
  });

  it("passes the selection down to the deck artifact", () => {
    expect(index).toContain("templateFileId={templateFileId}");
  });

  it("routes the download by plan: template through the fill action, own through serializeDeckToPptx", () => {
    const plan = card.indexOf('chooseDeckDownloadPlan(templateFileId) === "template"');
    const fill = card.indexOf("fillDeckTemplateFileAction(templateFileId");
    const own = card.indexOf("serializeDeckToPptx(deck)");
    expect(plan).toBeGreaterThan(-1);
    expect(fill).toBeGreaterThan(plan);
    expect(own).toBeGreaterThan(fill);
  });

  it("surfaces a fill refusal (slide-count fit report) as a worded error, not a throw", () => {
    expect(card).toMatch(/"error" in result\)\s*\{\s*setDownloadError\(result\.error\)/);
  });
});
