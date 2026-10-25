import { describe, expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";
import ts from "typescript";
import { stripComments } from "./components/ui/modalAdoptionSourceScan";
import { initializeManualView } from "./components/home/navigation-initial-state";
import { toolsStateFromRailItem } from "./components/tabs/tab-rails";
import { buildTabHref, isPlainLeftClick } from "./components/tabs/tab-link";
import { VC_SUB_TABS, VC_ORG_VIEWS, isVcSubTab, isVcOrgView, VC_SUB_TAB_CHANGE_EVENT, VC_ORG_VIEW_CHANGE_EVENT } from "./components/vc-views";
import { buildUrlSearch, parseUrlState, normalizeVcSubTab, normalizeVcOrgView, resolveVcSubTabFromUrl, resolveVcOrgViewFromUrl, isVersionControlUrl } from "./url-state";
const base = { ...parseUrlState("?tab=manual&manualView=version-control") };
const read = (path: string) => stripComments(readFileSync(path, "utf8")).replace(/\r\n/g, "\n");
const nav = read("src/app/components/home/useAppNavigation.ts");
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

const cases = [
  { file: "VersionControlTab", field: "vcSubTab", state: "subTab", setter: "setSubTab", key: "ta-vc-subtab", fallback: "orgs", values: ["orgs", "repos", "bulk"], resolve: resolveVcSubTabFromUrl },
  { file: "OrgManagementPanel", field: "vcOrgView", state: "orgView", setter: "setOrgView", key: "ta-vc-org-view", fallback: "students", values: ["students", "management"], resolve: resolveVcOrgViewFromUrl },
] as const;
describe("Version Control native links", () => {
  it("freezes navigation membership", () => {
    expect(VC_SUB_TABS).toEqual([["orgs", "Orgs"], ["repos", "Repos"], ["bulk", "Bulk actions"]]);
    expect(VC_ORG_VIEWS).toEqual([["students", "Student management"], ["management", "Org management"]]);
    for (const [key] of VC_SUB_TABS) { expect(isVcSubTab(key)).toBe(true); expect(normalizeVcSubTab(key)).toBe(key); }
    for (const [key] of VC_ORG_VIEWS) { expect(isVcOrgView(key)).toBe(true); expect(normalizeVcOrgView(key)).toBe(key); }
    for (const invalid of [undefined, null, "", "bad", "Orgs", "Management"]) {
      expect(isVcSubTab(invalid)).toBe(false); expect(normalizeVcSubTab(invalid)).toBe("orgs");
      expect(isVcOrgView(invalid)).toBe(false); expect(normalizeVcOrgView(invalid)).toBe("students");
    }

  });
  it("cold-load parent remains Version Control despite retired persisted pointers", () => {
    const storedCases: Record<string, string>[] = [
      { "ta-content-view": "grading" },
      { "ta-manual-view": "ppt-design" },
      { "ta-tools-section": "workflows", "ta-workflows-view": "drafts", "ta-drafts-view": "grades" },
    ];
    for (const search of ["?tab=manual&manualView=version-control", "?tab=manual&manualView=version-control&vcSubTab=repos", "?tab=manual&manualView=version-control&vcSubTab=bulk", "?tab=manual&manualView=version-control&vcOrgView=management"]) {
      for (const stored of storedCases) {
        const storage = { getItem: (key: string) => stored[key] ?? null, setItem: vi.fn() };
        expect(initializeManualView(search, storage, "manual", () => "workflows")).toBe("version-control");
      }
    }
  });
  it("builds canonical addresses with parent gates", () => {
    for (const subTab of ["orgs", "repos", "bulk"] as const) for (const orgView of ["students", "management"] as const) {
      const search = buildUrlSearch({ ...base, vcSubTab: subTab, vcOrgView: orgView });
      expect(search).toBe("?tab=manual&manualView=version-control" + (subTab === "orgs" ? (orgView === "management" ? "&vcOrgView=management" : "") : `&vcSubTab=${subTab}`));
      expect(normalizeVcSubTab(parseUrlState(search).vcSubTab)).toBe(subTab);
      expect(normalizeVcOrgView(parseUrlState(search).vcOrgView)).toBe(subTab === "orgs" ? orgView : "students");
      for (const parent of [{ tab: "courses" as const }, { manualView: "content" as const }]) expect(buildUrlSearch({ ...base, ...parent, vcSubTab: subTab, vcOrgView: orgView })).not.toMatch(/vcSubTab|vcOrgView/);
    }
  });
  for (const c of cases) {
    const component = read(`src/app/components/${c.file}.tsx`);
    it(`${c.field} URL wins in both actual initializers`, () => {
      for (const view of c.values) for (const stored of c.values) {
        const search = buildUrlSearch({ ...base, [c.field]: view });
        expect(c.resolve(search, stored)).toBe(view);
        for (const [subject, name] of [[component, `[${c.state}, setViewState]`], [nav, `[${c.field}, set${c.field[0].toUpperCase() + c.field.slice(1)}]`]]) {
          const init = variableArrow(subject, name, { window: { location: { search } }, localStorage: { getItem: (key: string) => { expect(key).toBe(c.key); return stored; } }, resolveVcSubTabFromUrl, resolveVcOrgViewFromUrl });
          expect(init()).toBe(view);
        }
      }
      for (const [subject, name] of [[component, `[${c.state}, setViewState]`], [nav, `[${c.field}, set${c.field[0].toUpperCase() + c.field.slice(1)}]`]]) {
        expect(variableArrow(subject, name, { window: undefined })()).toBe(c.fallback);
      }
      for (const suffix of ["", `&${c.field}=bad`]) expect(c.resolve("?tab=manual&manualView=version-control" + suffix, c.values[1])).toBe(c.fallback);
      for (const search of ["", "?tab=courses", "?tab=manual&manualView=content"]) expect(c.resolve(search, c.values[1])).toBe(c.values[1]);
    });
    it(`${c.field} href owns the clicked key despite unrelated outer URL`, () => {
      const href = variableArrow(component, "viewHref", { window: { location: { search: "?tab=courses" } }, localStorage: { getItem: () => "management" }, parseUrlState, buildTabHref, resolveVcOrgViewFromUrl, vcOrgView: "management" });
      for (const view of c.values) {
        const parsed = parseUrlState(href(view).slice(1));
        expect(parsed.manualView).toBe("version-control");
        expect(c.field === "vcSubTab" ? normalizeVcSubTab(parsed.vcSubTab) : normalizeVcOrgView(parsed.vcOrgView)).toBe(view);
      }
    });
    it(`${c.field} anchors guard native clicks and preserve Space activation`, () => {
      expect(component).toContain('<a key={key} href={viewHref(key)} role="tab"');
      expect(component).toContain(`aria-selected={${c.state} === key}`);
      expect(component).toContain('event.key === " "');
      expect(component).toContain('event.currentTarget.click();');
      const start = component.indexOf('onClick={(event) => {');
      const end = component.indexOf('}}>', start);
      const expr = component.slice(start + 'onClick={'.length, end + 1);
      const set = vi.fn(); const handler = execute(expr, { isPlainLeftClick, [c.setter]: set, key: c.values[1] });
      const plain = { button: 0, metaKey: false, ctrlKey: false, shiftKey: false, altKey: false, defaultPrevented: false };
      for (const patch of [{ metaKey: true }, { ctrlKey: true }, { shiftKey: true }, { altKey: true }, { button: 1 }, { defaultPrevented: true }]) {
        const preventDefault = vi.fn(); handler({ ...plain, ...patch, preventDefault }); expect(preventDefault).not.toHaveBeenCalled(); expect(set).not.toHaveBeenCalled();
      }
      const preventDefault = vi.fn(); handler({ ...plain, preventDefault }); expect(preventDefault).toHaveBeenCalledOnce(); expect(set).toHaveBeenCalledWith(c.values[1]);
      const keyStart = component.indexOf('onKeyDown={(event) => { if (event.key === " ")');
      const keyEnd = component.indexOf(' }}', keyStart);
      const keyboard = execute(component.slice(keyStart + 'onKeyDown={'.length, keyEnd + 2), {});
      const preventScroll = vi.fn(), click = vi.fn();
      keyboard({ key: " ", preventDefault: preventScroll, currentTarget: { click } });
      expect(preventScroll).toHaveBeenCalledOnce(); expect(click).toHaveBeenCalledOnce();
      for (const key of ["Enter", "Tab", "Escape"]) {
        preventScroll.mockClear(); click.mockClear(); keyboard({ key, preventDefault: preventScroll, currentTarget: { click } });
        expect(preventScroll).not.toHaveBeenCalled(); expect(click).not.toHaveBeenCalled();
      }

    });
    it(`${c.field} actual component popstate restores only its parent`, () => {
      const setViewState = vi.fn(); const setItem = vi.fn(); const window = { location: { search: "" } };
      const restore = variableArrow(component, "onPopState", { window, isVersionControlUrl, parseUrlState, normalizeVcSubTab, normalizeVcOrgView, setViewState, localStorage: { setItem } });
      for (const view of c.values) {
        window.location.search = buildUrlSearch({ ...base, [c.field]: view }); restore(); expect(setViewState).toHaveBeenLastCalledWith(view); expect(setItem).toHaveBeenLastCalledWith(c.key, view);
      }
      setViewState.mockClear(); window.location.search = "?tab=courses&vcSubTab=bulk&vcOrgView=management"; restore(); expect(setViewState).not.toHaveBeenCalled();
      if (c.field === "vcOrgView") {
        for (const sub of ["repos", "bulk"]) {
          setViewState.mockClear(); window.location.search = `?tab=manual&manualView=version-control&vcSubTab=${sub}&vcOrgView=students`;
          restore(); expect(setViewState).not.toHaveBeenCalled();
        }
      }

      expect(component).toContain('window.removeEventListener("popstate", onPopState)');
    });
  }
  it("executes persisted component events through validated nav mirrors and outer rail hrefs", () => {
    const storage = new Map<string, string>();
    const mirror = { vcSubTab: "orgs", vcOrgView: "students" };
    const receiveSub = variableArrow(nav, "onVcSubTabChange", { isVcSubTab, setVcSubTab: (value: string) => { mirror.vcSubTab = value; } });
    const receiveOrg = variableArrow(nav, "onVcOrgViewChange", { isVcOrgView, setVcOrgView: (value: string) => { mirror.vcOrgView = value; } });
    class EventLike { constructor(public type: string, public options: { detail: unknown }) {} get detail() { return this.options.detail; } }
    for (const c of cases) {
      const local = vi.fn();
      const setter = variableArrow(read(`src/app/components/${c.file}.tsx`), c.setter, {
        setViewState: local, localStorage: { setItem: (key: string, value: string) => storage.set(key, value) }, CustomEvent: EventLike,
        VC_SUB_TAB_CHANGE_EVENT, VC_ORG_VIEW_CHANGE_EVENT,
        window: { dispatchEvent: (event: EventLike) => { (event.type === VC_SUB_TAB_CHANGE_EVENT ? receiveSub : receiveOrg)(event); } },
      });
      for (const view of c.values) {
        setter(view); expect(local).toHaveBeenLastCalledWith(view); expect(storage.get(c.key)).toBe(view); expect(mirror[c.field]).toBe(view);
        const page = read("src/app/page.tsx");
        const state = variableArrow(page, "navState", { ...base, activeTab: "manual", nav: { ...mirror, recView: "record", kbInstitution: null, kbPageId: null } });
        const parsed = parseUrlState(buildTabHref(state, toolsStateFromRailItem("manual:version-control", "manual", "version-control")).slice(1));
        expect(c.field === "vcSubTab" ? normalizeVcSubTab(parsed.vcSubTab) : normalizeVcOrgView(parsed.vcOrgView)).toBe(c.field === "vcOrgView" && mirror.vcSubTab !== "orgs" ? "students" : view);
      }
    }
    const before = { ...mirror };
    for (const detail of ["bad", null, {}, "students", "management"]) receiveSub({ detail });
    for (const detail of ["bad", null, {}, "repos", "bulk"]) receiveOrg({ detail });
    expect(mirror).toEqual(before);
    expect(nav).toContain("window.removeEventListener(VC_SUB_TAB_CHANGE_EVENT, onVcSubTabChange)");
    expect(nav).toContain("window.removeEventListener(VC_ORG_VIEW_CHANGE_EVENT, onVcOrgViewChange)");
  });
  it("executes actual nav history and sync without pushing after restores", () => {
    const state = { ...base, recView: "record", filesView: "library", vcSubTab: "orgs", vcOrgView: "management" };
    const lastKnownSearchRef = { current: "" };
    const win = { location: { search: "" }, history: { pushState: vi.fn(), replaceState: vi.fn() } };
    const setters: Record<string, unknown> = {};
    for (const name of ["ActiveTab", "CoursesSection", "ToolsSection", "LibrarySection", "ManualView", "BuildView", "ContentView", "GradingView", "PresentationsView", "AnnouncementsView", "AutomateView", "TasksView", "FilesView", "KbInstitution", "KbPageId", "RecView", "VcSubTab", "VcOrgView"]) {
      setters[`set${name}`] = (value: unknown) => {
        expect(lastKnownSearchRef.current).toBe(buildUrlSearch(parseUrlState(win.location.search)));
        Object.assign(state, { [name === "ActiveTab" ? "tab" : name[0].toLowerCase() + name.slice(1)]: value });
      };
    }
    const restore = variableArrow(nav, "onPopState", { window: win, parseUrlState, parseFilesView: (search: string) => parseUrlState(search).filesView ?? "library", normalizeRecView: (view: unknown) => view ?? "record", normalizeVcSubTab, normalizeVcOrgView, buildUrlSearch, lastKnownSearchRef, activeTabRef: { current: "manual" }, librarySectionRef: { current: "files" }, ...setters });
    const syncStart = nav.lastIndexOf("useEffect(() => {", nav.indexOf("const target = buildUrlSearch({"));
    const syncEnd = nav.indexOf("}, [", syncStart);
    const expr = nav.slice(syncStart + "useEffect(".length, syncEnd) + "}";
    const first = { current: false };
    const sync = () => execute(expr, { ...state, activeTab: state.tab, window: win, buildUrlSearch, lastKnownSearchRef, isFirstUrlSyncRef: first })();
    for (const [suffix, sub, org] of [["&vcOrgView=management", "orgs", "management"], ["&vcSubTab=repos&vcOrgView=students", "repos", "management"], ["&vcSubTab=bulk", "bulk", "management"], ["", "orgs", "students"], ["&vcOrgView=management", "orgs", "management"]]) {
      win.location.search = "?tab=manual&manualView=version-control" + suffix; restore(); expect(state.vcSubTab).toBe(sub); expect(state.vcOrgView).toBe(org); sync(); expect(win.history.pushState).not.toHaveBeenCalled();
    }
    Object.assign(state, { vcSubTab: "bulk" }); sync(); expect(win.history.pushState).toHaveBeenLastCalledWith(null, "", "?tab=manual&manualView=version-control&vcSubTab=bulk");
    first.current = true; win.location.search = ""; sync(); expect(win.history.replaceState).toHaveBeenLastCalledWith(null, "", "?tab=manual&manualView=version-control&vcSubTab=bulk");
    const deps = nav.slice(syncEnd, nav.indexOf("]);", syncEnd)); expect(deps).toContain("vcSubTab,"); expect(deps).toContain("vcOrgView,");
  });
  it("top Orgs link uses the current mirrored child even before URL synchronization", () => {
    const component = read("src/app/components/VersionControlTab.tsx");
    const href = variableArrow(component, "viewHref", {
      window: { location: { search: "?tab=manual&manualView=version-control" } },
      parseUrlState, buildTabHref, vcOrgView: "management",
    });
    expect(href("orgs")).toBe("/?tab=manual&manualView=version-control&vcOrgView=management");
    expect(read("src/app/page.tsx")).toContain('<VersionControlTab vcOrgView={nav.vcOrgView} />');
  });
  it("outer sync mirrors both views and parent-gates history restores", () => {
    for (const field of ["vcSubTab", "vcOrgView"]) {
      expect(nav.slice(nav.indexOf("const target = buildUrlSearch({"))).toContain(field + ",");
      expect(read("src/app/page.tsx")).toContain(`${field}: nav.${field}`);
    }
    expect(nav).toContain('if (parsed.manualView === "version-control")');
    expect(nav).toContain('if (normalizeVcSubTab(parsed.vcSubTab) === "orgs") setVcOrgView(normalizeVcOrgView(parsed.vcOrgView));');
  });
});
