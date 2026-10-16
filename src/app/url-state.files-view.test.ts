import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { buildUrlSearch, parseUrlState, resolveFilesView } from "./url-state";
import type { UrlNavState } from "./url-state";
import { buildTabHref } from "./components/tabs/tab-link";

const DEFAULT_STATE: UrlNavState = {
  tab: "files",
  coursesSection: "courses",
  toolsSection: "manual",
  librarySection: "files",
  manualView: "course-planning",
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
const FILES_TAB_SOURCE = readFileSync(new URL("./components/FilesTab.tsx", import.meta.url), "utf8");

describe("Files view URL state", () => {
  it("round-trips the non-default Files view and omits its default", () => {
    expect(buildUrlSearch({ ...DEFAULT_STATE, filesView: "submissions" })).toBe(
      "?tab=files&filesView=submissions"
    );
    expect(parseUrlState("?tab=files&filesView=submissions").filesView).toBe("submissions");
    expect(buildTabHref(DEFAULT_STATE, { librarySection: "files", filesView: "submissions" })).toBe(
      "/?tab=files&filesView=submissions"
    );
    expect(buildUrlSearch({ ...DEFAULT_STATE, filesView: "library" })).toBe("?tab=files");
  });

  it("keeps the Files view scoped to Library > Files", () => {
    expect(
      buildUrlSearch({ ...DEFAULT_STATE, librarySection: "knowledge", filesView: "submissions" })
    ).toBe("?tab=files&librarySection=knowledge");
    expect(parseUrlState("?tab=files&filesView=unknown").filesView).toBe("library");
  });

  it("prefers the URL value for a Files deep link over a conflicting stored value", () => {
    expect(resolveFilesView("submissions", true, "library")).toBe("submissions");
    expect(resolveFilesView("library", true, "submissions")).toBe("library");
  });

  it("uses the persisted Files choice when the current URL names another branch", () => {
    expect(resolveFilesView(null, false, "submissions")).toBe("submissions");
    expect(resolveFilesView(null, false, "invalid")).toBe("library");
  });

  it("restores the omitted Library default when history returns from Submissions", () => {
    const restored = parseUrlState("?tab=files");
    expect(restored.filesView).toBeUndefined();
    expect(restored.filesView ?? "library").toBe("library");
    expect(NAV_SOURCE).toContain(
      'if (parsed.librarySection === "files") setFilesView(parsed.filesView ?? "library");'
    );
  });

  it("wires the confirmed ta-files-view key through navigation and the Files selector", () => {
    expect(NAV_SOURCE).toContain('const FILES_VIEW_KEY = "ta-files-view";');
    expect(NAV_SOURCE).toContain("resolveFilesView(");
    expect(NAV_SOURCE).toContain("localStorage.getItem(FILES_VIEW_KEY)");
    expect(NAV_SOURCE).toContain("localStorage.setItem(FILES_VIEW_KEY, filesView)");
    expect(PAGE_SOURCE).toContain("filesView={filesView}");
    expect(PAGE_SOURCE).toContain("setFilesView={setFilesView}");
    expect(FILES_TAB_SOURCE).toContain("filesView: FilesView;");
    expect(FILES_TAB_SOURCE).toContain("setFilesView: (view: FilesView) => void;");
    expect(FILES_TAB_SOURCE).toContain('import { isPlainLeftClick } from "./tabs/tab-link";');
    expect(FILES_TAB_SOURCE).toMatch(/<a\s+href=\{filesViewHrefs\.library\}[\s\S]*?isPlainLeftClick\(event\)[\s\S]*?event\.preventDefault\(\)/);
    expect(FILES_TAB_SOURCE).toMatch(/<a\s+href=\{filesViewHrefs\.submissions\}[\s\S]*?isPlainLeftClick\(event\)[\s\S]*?event\.preventDefault\(\)/);
    expect(PAGE_SOURCE).toContain("library: buildTabHref(navState, { librarySection: \"files\", filesView: \"library\" })");
    expect(PAGE_SOURCE).toContain("submissions: buildTabHref(navState, { librarySection: \"files\", filesView: \"submissions\" })");
  });
});
