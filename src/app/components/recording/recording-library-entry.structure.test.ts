import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const source = readFileSync("src/app/components/RecordingTab.tsx", "utf8");
describe("recording library entry", () => {
  it("starts a single owner-scoped load whose busy state cannot cancel its own request", () => {
    const effect = source.slice(source.indexOf("  const [libraryRetry"), source.indexOf("  // Auto-picks the first library file"));
    expect(effect).toContain("await listRecordingMediaFiles(supabase, libraryOwnerId)");
    expect(effect).toContain("[supabase, libraryOwnerId, libraryRetry]");
    expect(effect).not.toMatch(/\[[^\]]*libraryBusy[^\]]*\]/);
    expect(effect).toContain("if (!cancelled && !settled)");
    expect(effect).toContain("Loading your recording library timed out. Please try again.");
    expect(effect).toContain("if (timer) clearTimeout(timer)");
  });
  it("offers retry and places the single picker ahead of recording controls for announcements", () => {
    expect(source).toContain("Retry loading recordings");
    expect(source).toContain("setLibraryRetry((value) => value + 1)");
    expect(source.match(/const savedRecordingPicker =/g)).toHaveLength(1);
    const top = source.indexOf("{announcementsActive && savedRecordingPicker}");
    expect(top).toBeGreaterThan(-1);
    expect(top).toBeLessThan(source.indexOf("<SourceDevicesPanel", top));
    expect(source).toContain("{!announcementsActive && savedRecordingPicker}");
  });
});
