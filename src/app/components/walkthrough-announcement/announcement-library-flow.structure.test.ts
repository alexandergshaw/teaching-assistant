import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import ts from "typescript";

function source(file: string) {
  return ts.createPrinter({ removeComments: true }).printFile(ts.createSourceFile(file,
    readFileSync(join(__dirname, file), "utf8"), ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX));
}

// Source wiring only: these tests do not render components or prove focus behavior.
describe("one autosaved walkthrough announcement collection", () => {
  const panel = source("WalkthroughAnnouncementPanel.tsx");
  const setup = source("AnnouncementCourseFieldset.tsx");

  it("has exactly one library mount outside the collapsible setup", () => {
    expect((panel.match(/<AnnouncementLibrary\b/g) ?? []).length).toBe(1);
    expect(panel).toMatch(/<AnnouncementCourseFieldset[\s\S]*?collapsed=\{setupCollapsed\}[\s\S]*?\/>[\s\S]*?<details>[\s\S]*?<AnnouncementLibrary/);
    expect(setup).not.toContain("AnnouncementLibrary");
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
