import { describe, it, expect } from "vitest";
import { legacyRecViewRedirect } from "./rec-view-migration";
import { isAnnouncementsView, isManualViewType } from "../app/components/manual/manual-rail";

describe("legacyRecViewRedirect (TOOLS-IA-REORG W2, R-b1)", () => {
  it("redirects a persisted ta-rec-view=announcement on the Recording chip to Announcements", () => {
    const r = legacyRecViewRedirect("announcement", "recording");
    expect(r).toEqual({ manualView: "announcements", announcementsView: "recording" });
    expect(isManualViewType(r!.manualView)).toBe(true);
    expect(isAnnouncementsView(r!.announcementsView)).toBe(true);
  });

  it("does not redirect other stored values or users who are not on Recording", () => {
    expect(legacyRecViewRedirect("record", "recording")).toBeNull();
    expect(legacyRecViewRedirect("discussions", "recording")).toBeNull();
    expect(legacyRecViewRedirect(null, "recording")).toBeNull();
    expect(legacyRecViewRedirect("announcement", "grading")).toBeNull();
  });
});
