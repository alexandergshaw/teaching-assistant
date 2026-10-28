import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import ts from "typescript";

function source(file: string) {
  return ts.createPrinter({ removeComments: true }).printFile(ts.createSourceFile(file,
    readFileSync(join(__dirname, file), "utf8"), ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX));
}

function assertDirectLibrary(text: string) {
  const tree = ts.createSourceFile("panel.tsx", text, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  const mounts: ts.JsxSelfClosingElement[] = [];
  let setup: ts.JsxSelfClosingElement | undefined;
  let upload: ts.JsxElement | undefined;
  function visit(node: ts.Node) {
    if (ts.isJsxSelfClosingElement(node)) {
      if (node.tagName.getText(tree) === "AnnouncementLibrary") mounts.push(node);
      if (node.tagName.getText(tree) === "AnnouncementCourseFieldset") setup = node;
    }
    if (ts.isJsxElement(node) && node.openingElement.tagName.getText(tree) === "fieldset" &&
      node.children.some(child => ts.isJsxElement(child) && child.openingElement.tagName.getText(tree) === "legend" && child.getText(tree).includes("Upload a walkthrough video"))) upload = node;
    ts.forEachChild(node, visit);
  }
  visit(tree);
  expect(mounts).toHaveLength(1);
  const mount = mounts[0];
  for (let parent = mount.parent; parent; parent = parent.parent) {
    if (ts.isJsxElement(parent)) expect(["details", "AnnouncementCourseFieldset"]).not.toContain(parent.openingElement.tagName.getText(tree));
  }
  expect(setup).toBeDefined();
  expect(upload).toBeDefined();
  expect(mount.parent).toBe(setup?.parent);
  expect(mount.parent).toBe(upload?.parent);
  expect(mount.getStart(tree)).toBeGreaterThan(setup!.end);
  expect(mount.end).toBeLessThan(upload!.getStart(tree));
}

// Source wiring only: these tests do not render components or prove focus behavior.
describe("one autosaved walkthrough announcement collection", () => {
  const panel = source("WalkthroughAnnouncementPanel.tsx");
  const setup = source("AnnouncementCourseFieldset.tsx");

  it("has exactly one library mount outside the collapsible setup", () => {
    assertDirectLibrary(panel);
    expect(panel).toContain("collapsed={setupCollapsed}");
    expect(setup).not.toContain("AnnouncementLibrary");
  });

  it("rejects a disclosure hiding the existing library mount", () => {
    const hidden = panel.replace(/(<AnnouncementLibrary\b[\s\S]*?\/>)/, "<details>$1</details>");
    expect(hidden).not.toBe(panel);
    expect(() => assertDirectLibrary(hidden)).toThrow();
  });

  it("removes the competing paste, manual save and saved-browser controls and state", () => {
    for (const code of [panel, setup]) {
      expect(code).not.toMatch(/exemplarText|exemplarLabel|savingExemplar|exemplarSaved|exemplarError|showExemplarPicker|handleSaveExemplar|handleRemoveExemplar|onSaveExemplar/);
      expect(code).not.toMatch(/Save for reuse|Browse saved exemplars|Paste a previous announcement/);
    }
  });

  it("takes picker labels and outlines from acknowledged library entries without a pasted default override", () => {
    expect(panel).toContain("card.acknowledged ? [card.acknowledged] : []");
    expect(panel).toContain("hasPastedText: false");
    expect(panel).toContain("pastedOutline: null");
    expect(panel).toContain("saved: optionSource.saved, savedState: savedFormatsState, blocked: library.controller.blocked");
    expect(panel).toContain("outline: e.outline");
    expect(panel).toContain("label: e.label || new Date(e.createdAt).toLocaleDateString()");
    expect(panel).toContain("optionSource={optionSource}");
    expect(panel).toContain('useAnnouncementDraftSlots({ scopeKey: library.scopeKey, buildRequest, resolveLive, draftOne, postDraft, fetchResources, researchFingerprint, mayGenerate: () => !capturing && !extracting && pendingFrames === 0 && !batchInFlightRef.current && !upload.busy && hasMaterial && upload.result?.status !== "needs-visible-only" })');
  });

  it("keeps capture, manual generation, and draft posting controls connected", () => {
    expect(panel).toContain("onClick={handleStartStop}");
    expect(panel).toContain("await start({ saveVideo: false })");
    expect(panel).toContain("onClick={() => void generate()}");
    expect(panel).toContain("onClick={() => void handleGenerateScript()}");
    expect(panel).toContain("onRegenerateConfirm={regenerate}");
    expect(panel).toContain("onPostArm={armPost}");
    expect(panel).toContain("onPostCancel={cancelPost}");
    for (const prop of ["onCourseIdChange", "onModuleLabelChange", "onNotesTextChange", "onEmojiOnChange", "onResearchOnChange", "onAutoDraftOnChange"]) {
      expect(panel).toContain(prop + "={");
      expect(setup).toContain(prop);
    }
  });
});
