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
    expect(panel).toMatch(/<AnnouncementCourseFieldset[\s\S]*?collapsed=\{setupCollapsed\}[\s\S]*?\/>;?\s*<AnnouncementLibrary/);
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
    const panel = source("WalkthroughAnnouncementPanel.tsx"), draft = source("useAnnouncementDraftSlots.ts");
    expect(panel).toContain("saved: optionSource.saved, blocked: library.controller.blocked");
    expect(draft).toContain("dispatchResolvedAnnouncementDraft(ctx, resolved, argsRef.current.draftOne)");
    expect(draft).toContain("if (resolved.error)");
  });
  it("keeps accessible row controls, explicit deletion confirmation, import and add/remove focus paths", () => {
    const ui = source("AnnouncementLibrary.tsx");
    for (const token of ['aria-live="polite"', 'type="file"', "multiple", "Confirm remove announcement", "bodyInputs.current.get(id)?.focus()", "addButton.current?.focus()", 'label={`Announcement ${index + 1} text`}']) expect(ui).toContain(token);
    expect(ui).toContain("useAnnouncementLibraryDeparture(controller)");
    expect(ui).toContain("open={departure.confirming}");
    expect(ui).toContain('aria-label={`Add a draft from this announcement ${index + 1}`}' );
    expect(ui).toContain('card.status !== "Saved"'); expect(ui).toContain("importAnnouncementLibraryFiles(controller");
  });
});
