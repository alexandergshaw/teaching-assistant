import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
const read = (name: string) => readFileSync(new URL(name, import.meta.url), "utf8");
describe("recording announcement safeguards", () => {
  it("guards both posted and unposted Back buttons", () => {
    const source = read("./TakeAnnouncementPanel.tsx");
    expect(source.match(/if \(confirmLeave\(\)\) onClose\(\)/g)).toHaveLength(2);
    expect(source).not.toContain("onClick={onClose}");
  });
  it("acquires the synchronous save guard before dispatch and blocks leaving during save", () => {
    const hook = read("./useTakeAnnouncement.ts");
    const save = hook.slice(hook.indexOf("  function saveDraft()"), hook.indexOf("  function getAnnouncementLog()"));
    expect(save.indexOf("acquireExclusive(saveLock, postLock)")).toBeLessThan(save.indexOf("runTakeDraftSave("));
    expect(save).toContain("!acquireExclusive(saveLock, postLock)");
    expect(hook).toContain("!acquireExclusive(postLock, saveLock)");
    const guard = read("./useRecordingDraftGuard.ts");
    expect(guard).toContain("posting || isPostingNow()");
    expect(guard).toContain("if (savingDraft)");
    expect(guard).toContain("return false;");
  });
});
