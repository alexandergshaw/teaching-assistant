import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import ts from "typescript";
function source(file: string) {
  const text = readFileSync(join(__dirname, file), "utf8");
  return ts.createPrinter({ removeComments: true }).printFile(ts.createSourceFile(file, text, ts.ScriptTarget.Latest, true, file.endsWith("tsx") ? ts.ScriptKind.TSX : ts.ScriptKind.TS));
}
describe("announcement library production wiring", () => {
  it("keeps action calls in the panel and injects every persistence adapter", () => {
    const panel = source("WalkthroughAnnouncementPanel.tsx");
    for (const call of ["listAnnouncementLibraryAction(id)", "saveAnnouncementLibraryEntryAction(input)", "deleteAnnouncementLibraryEntryAction(id, entryId)", "useAnnouncementLibrary(courseId, libraryAdapters)"]) expect(panel).toContain(call);
    for (const file of ["useAnnouncementLibrary.ts", "announcement-library-controller.ts", "AnnouncementLibrary.tsx"]) expect(source(file)).not.toContain("@/app/actions/");
  });
  it("always renders library outside collapsed setup and includes dirty edits in unload and course-switch guards", () => {
    const panel = source("WalkthroughAnnouncementPanel.tsx");
    expect(panel).toContain("<AnnouncementLibrary key={library.scopeKey}");
    const tree = ts.createSourceFile("panel.tsx", panel, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
    const mounts: ts.JsxSelfClosingElement[] = [];
    function visit(node: ts.Node) {
      if (ts.isJsxSelfClosingElement(node) && node.tagName.getText(tree) === "AnnouncementLibrary") mounts.push(node);
      ts.forEachChild(node, visit);
    }
    visit(tree);
    expect(mounts).toHaveLength(1);
    for (let parent = mounts[0].parent; parent; parent = parent.parent) {
      if (ts.isJsxElement(parent)) expect(["details", "AnnouncementCourseFieldset"]).not.toContain(parent.openingElement.tagName.getText(tree));
    }
    expect(panel).toContain("collapsed={setupCollapsed}");
    expect(panel).toContain("!library.controller.dirty() && !shouldWarnBeforeUnload");
    expect(panel).toContain("library.controller.dirty() && !window.confirm");
  });
  it("scopes controllers to Supabase identity and course and disposes queued callbacks", () => {
    const hook = source("useAnnouncementLibrary.ts");
    expect(hook).toContain("useSupabase()"); expect(hook).toContain("[courseId, adapters, owner]");
    expect(hook).toContain("controller.dispose()");
    expect(hook).toContain('addEventListener("click", navigation.click, true)');
    expect(hook).toContain('addEventListener("popstate", navigation.popstate, true)');
    expect(hook).toContain('removeEventListener("click", navigation.click, true)');
  });
  it("wires live saved outlines and dirty guards into the actual generation dispatch", () => {
    const panel = source("WalkthroughAnnouncementPanel.tsx"), draft = source("pair-dispatch.ts");
    expect(panel).toContain("saved: optionSource.saved, savedState: savedFormatsState, blocked: library.controller.blocked");
    expect(draft).toContain("dispatchResolvedAnnouncementDraft({ ...ctx, timing: slot.timing, researchOutcome, revision }, resolved, api.draftOne)");
    expect(draft).toContain("if (resolved.error)");
  });
  it("keeps accessible row controls, explicit deletion confirmation, import and add/remove focus paths", () => {
    const ui = source("AnnouncementLibrary.tsx");
    for (const token of ['aria-live="polite"', 'type="file"', "multiple", "Confirm remove announcement", "bodyInputs.current.get(id)?.focus()", "addButton.current?.focus()", 'label={`Template ${index + 1} text`}']) expect(ui).toContain(token);
    expect(ui).toContain("useAnnouncementLibraryDeparture(controller)");
    expect(ui).toContain("open={departure.confirming}");
    expect(ui).toContain('aria-label={`Add a draft from this announcement ${index + 1}`}' );
    expect(ui).toContain('card.status !== "Saved"'); expect(ui).toContain("importAnnouncementLibraryFiles(controller");
  });
  it("names directly editable template slots while retaining the card map and autosave edits", () => {
    const ui = source("AnnouncementLibrary.tsx");
    for (const token of ["Announcement templates", "Add template slot", 'label={`Template ${index + 1} label`}',
      "Paste a previous announcement into each template slot. Each slot saves automatically. Choose its label under Format to match in the drafts below.",
      'state.load === "loaded" && state.cards.length === 0 && "No templates saved yet. Add a template slot to get started."',
      "state.cards.map((card, index)", "key={card.id}", "const id = controller.add()", "onClick={add}",
      'controller.edit(card.id, "label", e.target.value)', 'controller.edit(card.id, "exemplarText", e.target.value)',
      "value={card.label}", "value={card.exemplarText}", "multiline minRows={6}"]) expect(ui).toContain(token);
  });
});
