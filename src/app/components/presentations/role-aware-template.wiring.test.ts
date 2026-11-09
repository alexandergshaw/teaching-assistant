import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const source = readFileSync("src/app/components/presentations/RoleAwareTemplateFill.tsx", "utf8");
const handoff = readFileSync("src/app/components/powerpoint-templates/panel-logic.ts", "utf8");
const card = readFileSync("src/app/components/presentations/ArtifactCard.tsx", "utf8");
const library = readFileSync("src/app/components/powerpoint-templates/index.tsx", "utf8");
describe("role-aware selection safety wiring", () => {
  it("revalidates same-source library changes and invalidates stale async downloads", () => {
    expect(source).toContain("useSyncExternalStore(subscribeSelection, selectionSnapshot");
    expect(source).toContain("library.selected !== selected");
    expect(source).toContain("selectionSnapshot() !== selection");
    expect(source).toContain("useLayoutEffect(() => { alive.current = true");
    expect(handoff).toContain("window.dispatchEvent(new Event(ROLE_LIBRARY_CHANGED))");
  });
  it("explains retained source content and requires explicit roles", () => {
    expect(source).toContain("Original template graphics, notes and other non-text content remain");
    expect(source).toContain('roles.some((role) => !role)');
    expect(source).toContain("fillRoleAwarePowerPointAction(libraryId, sourceFileId");
  });
  it("connects the saved-library handoff to a real deck download surface", () => {
    expect(library).toContain("handoffTemplate(result.sourceFileId, window.localStorage, onUseInSlideDeckCreation, savedId)");
    expect(card).toContain('<RoleAwareTemplateFill sourceFileId={templateFileId}');
    expect(card).toContain('slides={deck.slides}');
    expect(source).toContain("getPowerPointTemplateLibraryAction(saved.libraryId)");
  });
});
