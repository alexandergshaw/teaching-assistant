import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { DEFAULT_REC_VIEW, buildUrlSearch, normalizeRecView, parseUrlState, resolveRecView } from "./url-state";
import type { UrlNavState } from "./url-state";
import { REC_VIEW_ORDER } from "./components/recording/rec-views";
import { buildTabHref } from "./components/tabs/tab-link";

const DEFAULT_STATE: UrlNavState = {
  tab: "manual",
  coursesSection: "courses",
  toolsSection: "manual",
  librarySection: "files",
  manualView: "recording",
  automateView: "templates",
  buildView: "prebuilt",
  contentView: "modules",
  gradingView: "chat",
  presentationsView: "slide-deck",
  announcementsView: "post",
  tasksView: "term",
  kbInstitution: null,
  kbPageId: null,
};

const NAV_SOURCE = readFileSync(new URL("./components/home/useAppNavigation.ts", import.meta.url), "utf8");
const PAGE_SOURCE = readFileSync(new URL("./page.tsx", import.meta.url), "utf8");
const RECORDING_SOURCE = readFileSync(new URL("./components/RecordingTab.tsx", import.meta.url), "utf8");

describe("Recording view URL state", () => {
  it("round-trips every Recording view, omits the default, and builds a cold-loadable href", () => {
    for (const recView of REC_VIEW_ORDER) {
      const search = buildUrlSearch({ ...DEFAULT_STATE, recView });
      expect(parseUrlState(search).recView ?? DEFAULT_REC_VIEW).toBe(recView);
      expect(buildTabHref(DEFAULT_STATE, { recView })).toBe(`/${search}`);
    }
    expect(buildUrlSearch({ ...DEFAULT_STATE, recView: DEFAULT_REC_VIEW })).toBe("?tab=manual&manualView=recording");
  });

  it("keeps Recording view scoped to Manual > Recording and normalizes invalid values", () => {
    expect(buildUrlSearch({ ...DEFAULT_STATE, manualView: "grading", recView: "messages" })).toBe(
      "?tab=manual&manualView=grading"
    );
    expect(normalizeRecView("unknown")).toBe("record");
    expect(normalizeRecView(null)).toBe("record");
  });

  it("uses an explicit deep-link view over ta-rec-view and otherwise restores the persisted choice", () => {
    expect(resolveRecView("messages", true, "record")).toBe("messages");
    expect(resolveRecView(null, true, "messages")).toBe("record");
    expect(resolveRecView(null, false, "messages")).toBe("messages");
    expect(resolveRecView(null, false, "invalid")).toBe("record");
  });

  it("wires the shared state through URL sync, popstate, persistence, and native modified-click links", () => {
    expect(NAV_SOURCE).toContain('const REC_VIEW_KEY = "ta-rec-view";');
    expect(NAV_SOURCE).toContain('import type { RecView } from "../recording/rec-views";');
    expect(NAV_SOURCE).toContain("resolveRecView(");
    expect(NAV_SOURCE).toContain("localStorage.setItem(REC_VIEW_KEY, recView)");
    expect(NAV_SOURCE).toContain('if (parsed.manualView === "recording") setRecView(parsed.recView ?? DEFAULT_REC_VIEW);');
    expect(PAGE_SOURCE).toContain("recView={nav.recView}");
    expect(PAGE_SOURCE).toContain("setRecView={nav.setRecView}");
    expect(RECORDING_SOURCE).toContain('import { buildTabHref, isPlainLeftClick } from "./tabs/tab-link";');
    expect(RECORDING_SOURCE).toMatch(/<a\s+key=\{key\}\s+href=\{buildTabHref\([\s\S]*?isPlainLeftClick\(event\)[\s\S]*?event\.preventDefault\(\)/);
    expect(RECORDING_SOURCE).toMatch(/removeEventListener\(RECORDING_LAUNCH_EVENT, handler\);\s*\}, \[setRecView\]\);/);
  });
});
