import { describe, expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";
import ts from "typescript";
import { stripComments as sourceCode } from "@/app/components/ui/modalAdoptionSourceScan";
import { REC_VIEWS, isRecView } from "./components/recording/rec-views";
import { buildTabHref, isPlainLeftClick } from "./components/tabs/tab-link";
import { parseRecordingLaunch } from "@/lib/recording-launch";
import { legacyRecViewRedirect } from "@/lib/rec-view-migration";
import {
  buildUrlSearch, parseUrlState, normalizeRecView, resolveRecViewFromUrl,
  parseFilesView, REC_VIEW_CHANGE_EVENT, type UrlNavState,
} from "./url-state";

const expected = [["record", "Record"], ["discussions", "Discussion replies"], ["messages", "Message replies"], ["moduledeck", "Module walkthrough deck"], ["speed", "Change speed"], ["captions", "Caption a video"], ["slides", "Narrate a deck"], ["avatar", "Avatar"]] as const;
const base: UrlNavState = {
  tab: "manual", coursesSection: "courses", toolsSection: "manual", librarySection: "files",
  manualView: "recording", automateView: "templates", buildView: "prebuilt", contentView: "modules",
  gradingView: "chat", presentationsView: "slide-deck", announcementsView: "post", tasksView: "term",
  kbInstitution: null, kbPageId: null,
};
const read = (path: string) => sourceCode(readFileSync(path, "utf8")).replace(/\r\n/g, "\n");
const component = read("src/app/components/RecordingTab.tsx");
const nav = read("src/app/components/home/useAppNavigation.ts");
const page = read("src/app/page.tsx");
function between(source: string, start: string, end: string) {
  const a = source.indexOf(start);
  expect(a, start).toBeGreaterThanOrEqual(0);
  const b = source.indexOf(end, a + start.length);
  expect(b, end).toBeGreaterThan(a);
  return source.slice(a, b);
}
// Execute actual production arrows after TypeScript erasure. No React render is implied.
function execute(expression: string, bindings: Record<string, unknown>) {
  const js = ts.transpileModule(`const candidate = (${expression});`, {
    compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.None, jsx: ts.JsxEmit.Preserve },
  }).outputText;
  return new Function(...Object.keys(bindings), `${js}\nreturn candidate;`)(...Object.values(bindings));
}
function variableArrow(source: string, name: string, bindings: Record<string, unknown>) {
  const ast = ts.createSourceFile("subject.tsx", source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  let expression: ts.Expression | undefined;
  const visit = (node: ts.Node) => {
    if (ts.isVariableDeclaration(node) && node.name.getText(ast) === name && node.initializer) {
      expression = ts.isCallExpression(node.initializer) ? node.initializer.arguments[0] : node.initializer;
    }
    ts.forEachChild(node, visit);
  };
  visit(ast);
  expect(expression, name).toBeDefined();
  return execute(expression!.getText(ast), bindings);
}
const key = "ta-rec-view";
class TestCustomEvent {
  constructor(public type: string, public options: { detail: unknown }) {}
  get detail() { return this.options.detail; }
}

describe("Recording URL contract", () => {
  it("freezes the complete ordered destinations and validates every member", () => {
    expect(REC_VIEWS).toEqual(expected);
    for (const [view] of [...REC_VIEWS, ...expected]) {
      expect(isRecView(view)).toBe(true);
      expect(normalizeRecView(view)).toBe(view);
    }
    for (const value of [null, "", "unknown", "Record", "announcement", "walkannounce", "grading", "snapgrade", "remembered"]) {
      expect(isRecView(value)).toBe(false);
      expect(normalizeRecView(value)).toBe("record");
    }
  });
  it("round trips each requested view with exact canonical addresses", () => {
    for (const [view] of REC_VIEWS) {
      const query = buildUrlSearch({ ...base, recView: view });
      expect(query).toBe("?tab=manual&manualView=recording" + (view === "record" ? "" : `&recView=${view}`));
      expect(normalizeRecView(parseUrlState(query).recView)).toBe(view);
    }
    expect(buildUrlSearch(base)).toBe("?tab=manual&manualView=recording");
    for (const patch of [{ tab: "courses" as const }, { manualView: "content" as const }]) {
      expect(buildUrlSearch({ ...base, ...patch, recView: "avatar" })).not.toContain("recView");
    }
  });
  it("prefers every explicit requested view over every conflicting stored view", () => {
    for (const [view] of expected) for (const [saved] of expected) {
      expect(resolveRecViewFromUrl(buildUrlSearch({ ...base, recView: view }), saved)).toBe(view);
    }
    for (const suffix of ["", "&recView=invalid", "&recView=announcement"]) {
      expect(resolveRecViewFromUrl("?tab=manual&manualView=recording" + suffix, "messages")).toBe("record");
    }
    expect(resolveRecViewFromUrl("?tab=recording&manualView=recording&recView=avatar", "messages")).toBe("avatar");
    for (const search of ["", "?recView=avatar", "?tab=courses&recView=avatar", "?tab=manual&manualView=content&recView=avatar"]) {
      expect(resolveRecViewFromUrl(search, "messages")).toBe("messages");
      expect(resolveRecViewFromUrl(search, "announcement")).toBe("record");
    }
  });
  it("executes both actual cold-load initializers and pins URL and persisted-key delegation", () => {
    for (const [subject, name] of [[component, "[storedRecView, setRecViewState]"], [nav, "[recView, setRecView]"]]) {
      const init = between(subject, `const ${name}`, "});");
      expect(init).toContain('if (typeof window === "undefined") return "record";');
      expect(init).toContain('return resolveRecViewFromUrl(window.location.search, localStorage.getItem("ta-rec-view"));');
      for (const [view] of expected) {
        const callback = variableArrow(subject, name, { window: { location: { search: buildUrlSearch({ ...base, recView: view }) } }, localStorage: { getItem: () => "messages" }, resolveRecViewFromUrl });
        expect(callback()).toBe(view);
      }
      expect(variableArrow(subject, name, { window: undefined, resolveRecViewFromUrl })()).toBe("record");
    }
  });
  it("page initialization and effect honor explicit URLs before legacy announcement navigation", () => {
    const mount = between(page, "  useEffect(() => {\n    if (legacyRecRedirect)", "}, []);");
    expect(mount).toContain('if (legacyRecRedirect) navigateToRecordingTool("announcement");');
    for (const search of ["", ...expected.map(([view]) => buildUrlSearch({ ...base, recView: view })), "?tab=manual&manualView=recording&recView=bad"]) {
      const initializer = variableArrow(page, "[legacyRecRedirect]", { window: { location: { search } }, localStorage: { getItem: () => "announcement" }, manualView: "recording", legacyRecViewRedirect });
      const redirect = initializer();
      const navigate = vi.fn();
      execute("() => {" + mount.slice(mount.indexOf("if (legacyRecRedirect)")) + "}", { legacyRecRedirect: redirect, navigateToRecordingTool: navigate })();
      expect(navigate.mock.calls).toEqual(search === "" ? [["announcement"]] : []);
    }
  });
});

describe("Recording anchor and synchronization source contracts", () => {
  const strip = between(component, '<div className={styles.lessonInnerTabs} role="tablist"', "        ))}");
  it("renders the mapped key's anchor and preserves tab semantics and keyboard activation", () => {
    expect(strip).toContain('aria-label="Recording tools"');
    expect(strip).toContain("REC_VIEWS.map(([key, label])");
    expect(strip).toContain('<a key={key} href={recViewHref(key)} role="tab"');
    for (const token of ['aria-selected={recView === key}', 'id={`rec-tab-${key}`}', 'aria-controls={`rec-panel-${key}`}', 'tabIndex={recView === key ? 0 : -1}', 'querySelectorAll<HTMLAnchorElement>', 'e.key === "ArrowRight"', 'e.key === "ArrowLeft"', 'e.key === "Home"', 'e.key === "End"', 'tabs[nextIdx].focus();', 'tabs[nextIdx].click();', 'className={`${styles.lessonInnerTab}']) expect(strip).toContain(token);
    expect(strip).toContain('</a>');
    expect(component).toContain('announcementsActive ? "announcement" : storedRecView');
  });
  it("builds each mapped key's destination from an unrelated current parent", () => {
    const href = variableArrow(component, "recViewHref", { window: { location: { search: "?tab=courses" } }, parseUrlState, buildTabHref, storedRecView: "messages" });
    for (const [view] of expected) {
      expect(href(view)).toBe("/?tab=manual&manualView=recording" + (view === "record" ? "" : `&recView=${view}`));
    }
  });
  it("guards before preventDefault and setter and executes the modifier matrix", () => {
    const click = between(strip, "onClick={(event) => {", "            }}>");
    expect(click).toMatch(/onClick=\{\(event\) => \{\s*if \(!isPlainLeftClick\(event\)\) return;\s*event.preventDefault\(\);\s*setRecView\(key\);/);
    const select = vi.fn();
    const handler = execute(click.slice("onClick={".length), { isPlainLeftClick, setRecView: select, key: "messages" });
    const plain = { button: 0, metaKey: false, ctrlKey: false, shiftKey: false, altKey: false, defaultPrevented: false };
    for (const patch of [{ metaKey: true }, { ctrlKey: true }, { shiftKey: true }, { altKey: true }, { button: 1 }, { button: 2 }, { defaultPrevented: true }]) {
      const preventDefault = vi.fn(); handler({ ...plain, ...patch, preventDefault });
      expect(preventDefault).not.toHaveBeenCalled(); expect(select).not.toHaveBeenCalled();
    }
    const preventDefault = vi.fn(); handler({ ...plain, preventDefault });
    expect(preventDefault).toHaveBeenCalledOnce(); expect(select).toHaveBeenCalledWith("messages");
  });
  it("plain selection and launch use the same persisted, dispatched, validated mirror path", () => {
    const listener = between(nav, "const onRecViewChange =", "}, []);");
    expect(listener).toContain("window.addEventListener(REC_VIEW_CHANGE_EVENT, onRecViewChange);");
    expect(listener).toContain("return () => window.removeEventListener(REC_VIEW_CHANGE_EVENT, onRecViewChange);");
    expect(nav).toMatch(/localStorage.setItem\("ta-rec-view", recView\);\s*\}, \[recView\]\)/);
    const receive = vi.fn();
    const receiver = variableArrow(nav, "onRecViewChange", { isRecView, setRecView: receive });
    const setLocal = vi.fn(), persist = vi.fn();
    const setter = variableArrow(component, "setRecView", {
      setRecViewState: setLocal, localStorage: { setItem: persist }, CustomEvent: TestCustomEvent,
      window: { dispatchEvent: receiver }, REC_VIEW_CHANGE_EVENT,
    });
    for (const [view] of expected) {
      setter(view); expect(setLocal).toHaveBeenLastCalledWith(view);
      expect(persist).toHaveBeenLastCalledWith(key, view); expect(receive).toHaveBeenLastCalledWith(view);
    }
    receive.mockClear();
    for (const view of ["announcement", "walkannounce", "remembered", "bad", null, {}]) receiver({ detail: view });
    expect(receive).not.toHaveBeenCalled();
    const launch = variableArrow(component, "handler", { CustomEvent: TestCustomEvent, parseRecordingLaunch, setRecView: setter, setRecViewState: setLocal });
    for (const [view] of expected) {
      launch(new TestCustomEvent("launch", { detail: { view } }));
      expect(receive).toHaveBeenLastCalledWith(view);
    }
    receive.mockClear();
    for (const detail of [{ view: "remembered" }, { view: "announcement" }, { view: "walkannounce" }, { view: "bad" }, null]) launch(new TestCustomEvent("launch", { detail }));
    expect(receive).not.toHaveBeenCalled();
    const registration = between(component, "const handler =", "const [error");
    expect(registration).toContain("window.addEventListener(RECORDING_LAUNCH_EVENT, handler);");
    expect(registration).toContain("window.removeEventListener(RECORDING_LAUNCH_EVENT, handler)");
  });
});

describe("Recording history restores", () => {
  it("sync includes recView in its input and dependencies and retains replace then push", () => {
    const sync = between(nav, "const target = buildUrlSearch({", "useEffect(() => {\n    const onPopState");
    expect(sync.slice(0, sync.indexOf("});"))).toMatch(/\brecView,/);
    expect(sync.slice(sync.lastIndexOf("}, ["))).toMatch(/\brecView,/);
    expect(sync).toContain('window.history.replaceState(null, "", target);');
    expect(sync).toContain('window.history.pushState(null, "", target);');
  });
  it("executes both actual popstate callbacks with parent scope and canonicalizes before setters", () => {
    const lastKnownSearchRef = { current: "" };
    const win = { location: { search: "" }, history: { pushState: vi.fn(), replaceState: vi.fn() } };
    const mirror = { nav: "record", component: "record" };
    const state = { ...base, filesView: "library" as const, recView: "record" as const };
    const beforeSetter = () => expect(lastKnownSearchRef.current).toBe(buildUrlSearch({ ...parseUrlState(win.location.search), filesView: parseFilesView(win.location.search), recView: normalizeRecView(parseUrlState(win.location.search).recView) }));
    const setters: Record<string, unknown> = {};
    for (const name of ["ActiveTab", "CoursesSection", "ToolsSection", "LibrarySection", "ManualView", "BuildView", "ContentView", "GradingView", "PresentationsView", "AnnouncementsView", "AutomateView", "TasksView", "FilesView", "KbInstitution", "KbPageId"]) {
      setters[`set${name}`] = (value: never) => { beforeSetter(); Object.assign(state, { [name === "ActiveTab" ? "tab" : name[0].toLowerCase() + name.slice(1)]: value }); };
    }
    const restore = variableArrow(nav, "onPopState", {
      window: win, parseUrlState, parseFilesView, normalizeRecView, buildUrlSearch, lastKnownSearchRef,
      activeTabRef: { current: "manual" }, librarySectionRef: { current: "files" }, ...setters,
      setRecView: (view: string) => { beforeSetter(); mirror.nav = view; state.recView = view as "record"; },
    });
    const componentRestore = variableArrow(component, "onPopState", { window: win, parseUrlState, normalizeRecView, setRecViewState: (view: string) => { mirror.component = view; } });
    const syncStart = nav.lastIndexOf("useEffect(() => {", nav.indexOf("const target = buildUrlSearch({"));
    const sync = between(nav.slice(syncStart), "useEffect(", "}, [") + "}";
    const syncExpression = sync.slice("useEffect(".length);
    const isFirstUrlSyncRef = { current: false };
    const runSync = () => execute(syncExpression, { vcSubTab: "orgs", vcOrgView: "students", ...state, activeTab: state.tab, window: win, buildUrlSearch, lastKnownSearchRef, isFirstUrlSyncRef })();
    for (const [search, view] of [["?tab=manual&manualView=recording&recView=messages", "messages"], ["?tab=manual&manualView=recording", "record"], ["?tab=courses&recView=avatar", "record"], ["?tab=manual&manualView=recording&recView=moduledeck", "moduledeck"], ["?tab=files&filesView=submissions", "moduledeck"]]) {
      win.location.search = search; restore(); componentRestore();
      expect(mirror).toEqual({ nav: view, component: view });
      runSync(); expect(win.history.pushState).not.toHaveBeenCalled();
    }
    Object.assign(state, { ...base, recView: "messages" }); runSync();
    expect(win.history.pushState).toHaveBeenCalledWith(null, "", "?tab=manual&manualView=recording&recView=messages");
    isFirstUrlSyncRef.current = true; win.location.search = ""; runSync();
    expect(win.history.replaceState).toHaveBeenCalledWith(null, "", "?tab=manual&manualView=recording&recView=messages");
    for (const subject of [component, nav]) {
      const pop = between(subject, "const onPopState =", "return () => window.removeEventListener(\"popstate\", onPopState);");
      expect(pop).toContain('window.addEventListener("popstate", onPopState);');
    }
  });
});
