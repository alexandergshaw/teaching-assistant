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


describe("explicit Recording URL precedence", () => {
  it("suppresses the legacy redirect for valid, omitted and invalid requested views", () => {
    for (const query of ["?tab=manual&manualView=recording", "?tab=manual&manualView=recording&recView=messages", "?tab=manual&manualView=recording&recView=bad"]) {
      expect(legacyRecViewRedirect("announcement", "recording", query)).toBeNull();
    }
  });
  it("retains the bare-entry redirect object and ordinary no-redirect cases", () => {
    expect(legacyRecViewRedirect("announcement", "recording", "")).toEqual({ manualView: "announcements", announcementsView: "recording" });
    for (const saved of [null, "record", "messages", "moduledeck"]) expect(legacyRecViewRedirect(saved, "recording", "")).toBeNull();
  });
});
