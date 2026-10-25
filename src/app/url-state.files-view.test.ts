import { stripComments as sourceCode } from "@/app/components/ui/modalAdoptionSourceScan";
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import {
  normalizeFilesView,
  parseFilesView,
  buildUrlSearch,
  parseUrlState,
  resolveFilesViewFromUrl,
  type UrlNavState,
} from "./url-state";

const filesTab = sourceCode(readFileSync("src/app/components/FilesTab.tsx", "utf8")).replace(/\r\n/g, "\n");
const navigation = sourceCode(readFileSync("src/app/components/home/useAppNavigation.ts", "utf8")).replace(/\r\n/g, "\n");

// Source contracts only: this suite does not render components or a browser.
function between(source: string, start: string, end: string): string {
  const from = source.indexOf(start);
  expect(from, start).toBeGreaterThanOrEqual(0);
  const to = source.indexOf(end, from + start.length);
  expect(to, end).toBeGreaterThan(from);
  return source.slice(from, to);
}

const baseState: UrlNavState = {
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

describe("Files view deep links", () => {
  it("normalizes supported view values and defaults invalid values to Library", () => {
    expect(normalizeFilesView("library")).toBe("library");
    expect(normalizeFilesView("submissions")).toBe("submissions");
    expect(normalizeFilesView("other")).toBe("library");
    expect(normalizeFilesView(null)).toBe("library");
    expect(parseFilesView("?tab=files&filesView=submissions")).toBe("submissions");
    expect(parseFilesView("?tab=files")).toBe("library");
    expect(parseFilesView("?tab=files&filesView=other")).toBe("library");
  });

  it("round trips the Files view without changing existing URL state", () => {
    const href = buildUrlSearch({ ...baseState, filesView: "submissions" });
    expect(href).toBe("?tab=files&filesView=submissions");
    const parsed = parseUrlState(href);
    expect(parsed.tab).toBe("files");
    expect(parsed.filesView).toBe("submissions");
    expect(buildUrlSearch(parsed)).toBe(href);
    expect(parseFilesView(href)).toBe("submissions");
    expect(buildUrlSearch({ ...baseState, filesView: "library" })).toBe("?tab=files");
    expect(buildUrlSearch({ ...baseState, librarySection: "knowledge", filesView: "submissions" })).not.toContain("filesView");
    expect(buildUrlSearch({ ...baseState, tab: "courses", filesView: "submissions" })).not.toContain("filesView");
  });

  it("uses an explicit Files URL view before the persisted view", () => {
    expect(resolveFilesViewFromUrl("?tab=files&filesView=submissions", "library")).toBe("submissions");
    expect(resolveFilesViewFromUrl("?tab=files", "submissions")).toBe("library");
    expect(resolveFilesViewFromUrl("?tab=files&librarySection=knowledge&filesView=submissions", "library")).toBe("library");
    expect(resolveFilesViewFromUrl("", "submissions")).toBe("submissions");
    expect(resolveFilesViewFromUrl("?tab=files&filesView=other", "submissions")).toBe("library");
    expect(resolveFilesViewFromUrl("?tab=courses&filesView=library", "submissions")).toBe("submissions");
    expect(resolveFilesViewFromUrl("?filesView=library", "submissions")).toBe("submissions");
    expect(resolveFilesViewFromUrl("", "other")).toBe("library");
  });

  it.each(["library", "submissions"])("pins the %s anchor's own destination and guarded setter", (view) => {
    const anchor = filesTab.match(new RegExp(`<a\\s+href=\\{filesViewHref\\("${view}"\\)\\}[\\s\\S]*?<\\/a>`))?.[0];
    expect(anchor).toBeDefined();
    expect(anchor).toContain('role="tab"');
    expect(anchor).toContain(`aria-selected={filesView === "${view}"}`);
    expect(anchor).toMatch(new RegExp(`onClick=\\{\\(event: ReactMouseEvent<HTMLAnchorElement>\\) => \\{\\s*if \\(!isPlainLeftClick\\(event\\)\\) return;\\s*event\\.preventDefault\\(\\);\\s*setFilesView\\("${view}"\\);\\s*\\}\\}`));
  });

  it("builds each href with the Files parent and the requested view", () => {
    const href = between(filesTab, "const filesViewHref =", "useEffect(() => {");
    expect(href).toMatch(/"\/"\s*\+\s*buildUrlSearch\(/);
    expect(href).toContain('...parseUrlState(typeof window === "undefined" ? "" : window.location.search)');
    expect(href).toMatch(/tab: "files",\s*librarySection: "files",\s*filesView: view/);
  });

  it("initializes both component and navigation from the URL before the same persisted key", () => {
    const componentInit = between(filesTab, "const [filesView, setFilesViewState]", "const setFilesView =");
    expect(componentInit).toContain('return resolveFilesViewFromUrl(window.location.search, localStorage.getItem("ta-files-view"));');
    const navInit = between(navigation, "const [filesView, setFilesView]", "const [manualView");
    expect(navInit).toContain("return resolveFilesViewFromUrl(window.location.search, localStorage.getItem(FILES_VIEW_KEY));");
    expect(navigation).toContain('const FILES_VIEW_KEY = "ta-files-view";');
    expect(navigation).toMatch(/useEffect\(\(\) => \{\s*localStorage\.setItem\(FILES_VIEW_KEY, filesView\);\s*\}, \[filesView\]\)/);
  });

  it("dispatches the changed view and connects its validated event to navigation state", () => {
    const setter = between(filesTab, "const setFilesView =", "const filesViewHref =");
    expect(setter).toContain("setFilesViewState(v);");
    expect(setter).toContain('localStorage.setItem("ta-files-view", v);');
    expect(setter).toContain("window.dispatchEvent(new CustomEvent(FILES_VIEW_CHANGE_EVENT, { detail: v }));");
    const listener = between(navigation, "const onFilesViewChange =", "}, []);");
    expect(listener).toContain("const view = (event as CustomEvent<unknown>).detail;");
    expect(listener).toContain('if (view === "library" || view === "submissions") setFilesView(view);');
    expect(listener).toContain("window.addEventListener(FILES_VIEW_CHANGE_EVENT, onFilesViewChange);");
    expect(listener).toContain("return () => window.removeEventListener(FILES_VIEW_CHANGE_EVENT, onFilesViewChange);");
  });

  it("includes Files view in the URL sync input and effect dependencies", () => {
    const sync = between(navigation, "const target = buildUrlSearch({", "useEffect(() => {\n    const onPopState");
    const input = sync.slice(0, sync.indexOf("});"));
    expect(input).toMatch(/\bfilesView,/);
    const dependencies = sync.slice(sync.lastIndexOf("}, ["));
    expect(dependencies).toMatch(/\bfilesView,/);
    expect(sync).toContain('window.history.pushState(null, "", target);');
  });

  it("restores both component and navigation on Back/Forward without pushing another entry", () => {
    const componentPop = between(filesTab, "const onPopState =", "}, []);");
    expect(componentPop).toMatch(/if \(location\.tab === "files" && location\.librarySection === "files"\) \{\s*setFilesViewState\(parseFilesView\(window\.location\.search\)\);\s*\}/);
    const navPop = between(navigation, "const onPopState =", "}, [setKbInstitution]);");
    expect(navPop).toMatch(/const restoredFilesView = parseFilesView\(window\.location\.search\);\s*lastKnownSearchRef\.current = buildUrlSearch\(\{ \.\.\.parsed, filesView: restoredFilesView, recView: normalizeRecView\(parsed\.recView\) \}\);\s*setActiveTab\(parsed\.tab\);/);
    expect(navPop).toMatch(/if \(parsed\.tab === "files"\) \{\s*setLibrarySection\(parsed\.librarySection\);\s*if \(parsed\.librarySection === "files"\) setFilesView\(restoredFilesView\);/);
    for (const pop of [componentPop, navPop]) {
      expect(pop).toContain('window.addEventListener("popstate", onPopState);');
      expect(pop).toContain('return () => window.removeEventListener("popstate", onPopState);');
    }
  });

  it.each([
    ["selectActiveTab", "tab", "setActiveTab"],
    ["selectLibrarySection", "section", "setLibrarySection"],
  ])("%s refreshes the Files mirror before re-entry after another window changes storage", (name, argument, setter) => {
    // Execute the production selection callback body, without rendering a hook.
    const callback = between(navigation, `const ${name} = useCallback(`, "}, []);");
    const body = callback.slice(callback.indexOf("=> {") + 4);
    const select = new Function(argument, "window", "localStorage", "FILES_VIEW_KEY", "resolveFilesViewFromUrl", "setFilesView", setter, body);
    expect(navigation).toContain(`${setter}: ${name},`);
    for (const search of ["?tab=courses", "?tab=files&librarySection=knowledge", "?tab=files&filesView=submissions", "?tab=files"]) {
      // Window A previously selected Submissions. Window B has now saved Library.
      let mirror = "submissions";
      let selectedMirror: string | undefined;
      const storage = { getItem: (key: string) => key === "ta-files-view" ? "library" : null };
      select("files", { location: { search } }, storage, "ta-files-view", resolveFilesViewFromUrl,
        (view: string) => { mirror = view; }, () => { selectedMirror = mirror; });
      const mountedView = resolveFilesViewFromUrl(search, storage.getItem("ta-files-view"));
      expect(selectedMirror).toBe(mountedView);
      const target = buildUrlSearch({ ...baseState, filesView: mirror as "library" | "submissions" });
      expect(resolveFilesViewFromUrl(target, "submissions")).toBe(mountedView);
      expect(mirror).toBe(search.includes("filesView=submissions") ? "submissions" : "library");
    }
  });
});
