import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const read = (path: string) => readFileSync(path, "utf8");
describe("recording pathname guard wiring", () => {
  it("registers and removes the active guard while the draft component is mounted", () => {
    const source = read("src/app/components/recording/useRecordingDraftGuard.ts");
    expect(source).toContain("useLayoutEffect(() => registerRecordingRouteGuard");
    expect(source).toContain("posting || isPostingNow()");
    expect(source).toContain("savingDraft");
    expect(source).toContain("!dirty || window.confirm");
  });
  it("includes direction and selected format in the active draft guard", () => {
    const hook = read("src/app/components/recording/useTakeAnnouncement.ts");
    const panel = read("src/app/components/recording/TakeAnnouncementPanel.tsx");
    expect(hook).toContain("hasUnsavedSetup: instructorContext.length > 0 || hasSelectedFormat");
    expect(panel).toContain("hasSelectedFormat: selectedFormat !== null");
    expect(panel).toContain("useState<{ scope: string; id: string } | null>(null)");
  });
  it("guards every main TopBar pathname link and the chat settings links", () => {
    const top = read("src/app/components/TopBar.tsx");
    for (const path of ["/", "/knowledge", "/account/integrations", "/account/security", "/account/voice-style", "/account/diagnostics", "/account/people"]) {
      expect(top).toContain(`guardRecordingRouteNavigation("${path}", event)`);
    }
    for (const file of ["src/app/components/AiChatWindow.tsx", "src/app/components/chat/ResponseModeStrip.tsx"]) {
      expect(read(file)).toContain('guardRecordingRouteNavigation("/account/voice-style", event)');
    }
  });
});
