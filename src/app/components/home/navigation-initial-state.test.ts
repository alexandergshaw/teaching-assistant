import { describe, expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";
import { stripComments as sourceCode } from "@/app/components/ui/modalAdoptionSourceScan";
import { initializeManualView } from "./navigation-initial-state";
import { buildUrlSearch, parseUrlState, resolveRecViewFromUrl } from "../../url-state";
import { legacyRecViewRedirect } from "@/lib/rec-view-migration";
const views = ["record", "discussions", "messages", "moduledeck", "speed", "captions", "slides", "avatar"] as const;
const nav = sourceCode(readFileSync("src/app/components/home/useAppNavigation.ts", "utf8"));
function storageFor(values: Record<string, string>) {
  return { getItem: (key: string) => values[key] ?? null, setItem: vi.fn((key: string, value: string) => { values[key] = value; }) };
}
describe("production parent initializer URL precedence", () => {
  it("actual hook delegates with real URL and storage before any retired storage early return", () => {
    const start = nav.indexOf("const [manualView, setManualView]");
    const end = nav.indexOf("const [buildView", start);
    expect(start).toBeGreaterThan(-1); expect(end).toBeGreaterThan(start);
    expect(nav.slice(start, end)).toContain("return initializeManualView(window.location.search, localStorage, toolsSection, readLegacyAutomateView);");
  });
  it("explicit Recording parents beat the full retired rec/content storage product", () => {
    for (const raw of [...views, undefined, "invalid"]) {
      const search = raw === undefined || raw === "invalid" ? "?tab=manual&manualView=recording" + (raw ? "&recView=invalid" : "") : buildUrlSearch({ ...parseUrlState("?tab=manual&manualView=recording"), recView: raw as typeof views[number] });
      for (const savedRec of ["announcement", "messages", null]) for (const savedContent of ["version-control", "grading", "modules"]) {
        const storage = storageFor({ "ta-content-view": savedContent, "ta-active-tab": "manual", "ta-manual-view": "recording", ...(savedRec ? { "ta-rec-view": savedRec } : {}) });
        const parent = initializeManualView(search, storage, "manual", () => null);
        expect({ ...parseUrlState(search), manualView: parent }).toMatchObject({ tab: "manual", toolsSection: "manual", manualView: "recording" });
        expect(resolveRecViewFromUrl(search, savedRec)).toBe(views.includes(raw as typeof views[number]) ? raw : "record");
        expect(legacyRecViewRedirect(savedRec, parent, search)).toBeNull();
        expect(storage.setItem).not.toHaveBeenCalled();
      }
    }
  });
  it("bare URLs preserve individual legacy content migrations and cleanup", () => {
    for (const saved of ["version-control", "grading"]) {
      const storage = storageFor({ "ta-content-view": saved, "ta-active-tab": "manual", "ta-manual-view": "recording" });
      expect(initializeManualView("", storage, "manual", () => null)).toBe(saved);
      expect(storage.setItem).toHaveBeenCalledWith("ta-content-view", "modules");
    }
    const storage = storageFor({ "ta-content-view": "modules", "ta-active-tab": "manual", "ta-manual-view": "recording" });
    expect(initializeManualView("", storage, "manual", () => null)).toBe("recording");
    expect(legacyRecViewRedirect("announcement", "recording", "")).toEqual({ manualView: "announcements", announcementsView: "recording" });
  });
  it("retains unrelated manual and legacy migration choices", () => {
    for (const [saved, view] of [["repo-grades", "grading"], ["ppt-design", "presentations"], ["content", "content"], ["bogus", "course-planning"]]) {
      expect(initializeManualView("", storageFor({ "ta-manual-view": saved }), "manual", () => null)).toBe(view);
    }
    expect(initializeManualView("", storageFor({ "ta-tools-section": "workflows", "ta-workflows-view": "drafts", "ta-drafts-view": "grades" }), "manual", () => null)).toBe("grading");
    expect(initializeManualView("?tab=manual&manualView=content&contentView=grading", storageFor({}), "manual", () => null)).toBe("grading");
    expect(initializeManualView("", storageFor({}), "manual", () => "workflows")).toBe("artifact-design");
  });
});
