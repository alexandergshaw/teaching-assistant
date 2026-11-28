import { stripComments as sourceCode } from "@/app/components/ui/modalAdoptionSourceScan";
// Source-text wiring for the Tier-1 tab anchors (tabs-ctrl-click scope, AC1-AC3).
// Nothing renders under vitest here, so the anchor + guard contract and the
// URL-wins-over-localStorage cold-load ordering are asserted by reading source.
// The real new-tab behaviour is an owner walk (scope residual R2).

import { describe, expect, it, vi } from "vitest";
import { readFileSync } from "fs";
import { join } from "path";
import ts from "typescript";
import { normalizeRecordingEntry, parseUrlState, resolveRecViewFromUrl } from "../../url-state";
import { buildTabHref, isPlainLeftClick } from "./tab-link";
import { toolsStateFromRailItem } from "./tab-rails";

const root = process.cwd();
const read = (...p: string[]) => sourceCode(readFileSync(join(root, ...p), "utf8")).replace(/\r\n/g, "\n");

const TAB_RAIL = read("src", "app", "components", "tabs", "TabRail.tsx");
const MANUAL_RAIL = read("src", "app", "components", "manual", "ManualRail.tsx");
const PAGE = read("src", "app", "page.tsx");
const NAV = read("src", "app", "components", "home", "useAppNavigation.ts");

function between(source: string, from: string, to: string): string {
  const a = source.indexOf(from);
  expect(a, `could not find ${from}`).toBeGreaterThan(-1);
  const b = source.indexOf(to, a);
  expect(b, `could not find ${to} after ${from}`).toBeGreaterThan(a);
  return source.slice(a, b);
}

function evaluate(expression: string, bindings: Record<string, unknown>) {
  const js = ts.transpileModule(`const candidate = (${expression});`, {
    compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.None },
  }).outputText;
  return new Function(...Object.keys(bindings), `${js}\nreturn candidate;`)(...Object.values(bindings));
}

function initializer(source: string, name: string): ts.Expression {
  const ast = ts.createSourceFile("subject.tsx", source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  let found: ts.Expression | undefined;
  const visit = (node: ts.Node) => {
    if (ts.isVariableDeclaration(node) && node.name.getText(ast) === name) found = node.initializer;
    ts.forEachChild(node, visit);
  };
  visit(ast);
  expect(found, name).toBeDefined();
  return found!;
}

function jsxHandler(source: string, tag: string, attribute: string, anchorOnly = false) {
  const ast = ts.createSourceFile("subject.tsx", source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  const found: ts.Expression[] = [];
  const visit = (node: ts.Node) => {
    if ((ts.isJsxOpeningElement(node) || ts.isJsxSelfClosingElement(node)) && node.tagName.getText() === tag) {
      const attributes = node.attributes.properties.filter(ts.isJsxAttribute);
      if (!anchorOnly || attributes.some((prop) => prop.name.getText() === "href")) {
        const prop = attributes.find((item) => item.name.getText() === attribute);
        if (prop?.initializer && ts.isJsxExpression(prop.initializer) && prop.initializer.expression) found.push(prop.initializer.expression);
      }
    }
    ts.forEachChild(node, visit);
  };
  visit(ast);
  expect(found).toHaveLength(1);
  return found[0].getText();
}

describe("AC1/AC2: TabRail renders an anchor with a guarded click when given an href", () => {
  it("renders a controlled MUI tablist with linked tabs and a button fallback", () => {
    expect(TAB_RAIL).toContain("<Tabs");
    expect(TAB_RAIL).toContain('aria-label={ariaLabel}');
    expect(TAB_RAIL).toContain('data-rail-tab={option.id}');
    expect(TAB_RAIL).toMatch(/<Tab\b[^>]*component="a"\s+href=\{option.href\}/);
    expect(TAB_RAIL).toMatch(/option.href === undefined[\s\S]*?<Tab key=\{option.id\}/);
  });

  it("only switches in-app, and only prevents the native navigation, on a plain left click", () => {
    const onChange = vi.fn();
    const handler = evaluate(jsxHandler(TAB_RAIL, "Tab", "onClick", true), { isPlainLeftClick, onChange, option: { id: "tools" } });
    const defaults = { button: 0, ctrlKey: false, metaKey: false, shiftKey: false, altKey: false, defaultPrevented: false };
    const preventDefault = vi.fn();
    for (const patch of [{ ctrlKey: true }, { metaKey: true }, { shiftKey: true }, { altKey: true }, { button: 1 }, { defaultPrevented: true }]) {
      handler({ ...defaults, ...patch, preventDefault });
    }
    expect(preventDefault).not.toHaveBeenCalled();
    expect(onChange).not.toHaveBeenCalled();
    handler({ ...defaults, preventDefault });
    expect(preventDefault).toHaveBeenCalledOnce();
    expect(onChange).toHaveBeenCalledExactlyOnceWith("tools");
  });

  it("selects the tab focused by MUI after an arrow, Home or End", () => {
    const onChange = vi.fn();
    const selectionKeys = evaluate(initializer(TAB_RAIL, "selectionKeys").getText(), {});
    expect([...selectionKeys]).toEqual(["ArrowLeft", "ArrowRight", "Home", "End"]);
    const options = [{ id: "courses" }, { id: "recording" }];
    const slots = evaluate(jsxHandler(TAB_RAIL, "Tabs", "slotProps"), { selectionKeys, options, value: "courses", onChange });
    const focused = (id: string, contained = true) => ({ ownerDocument: { activeElement: { getAttribute: () => id } }, contains: () => contained });
    const select = slots.list.onKeyDown;
    select({ key: "ArrowRight", defaultPrevented: false, currentTarget: focused("recording") });
    select({ key: "ArrowRight", defaultPrevented: true, ctrlKey: true, currentTarget: focused("recording") });
    select({ key: " ", defaultPrevented: true, currentTarget: focused("recording") });
    select({ key: "Home", defaultPrevented: true, currentTarget: focused("recording", false) });
    select({ key: "Home", defaultPrevented: true, currentTarget: focused("courses") });
    expect(onChange).not.toHaveBeenCalled();
    select({ key: "ArrowRight", defaultPrevented: true, currentTarget: focused("recording") });
    expect(onChange).toHaveBeenCalledExactlyOnceWith("recording");
  });

  it("activates a focused linked tab with Space while leaving modified keys alone", () => {
    const handler = evaluate(jsxHandler(TAB_RAIL, "Tab", "onKeyDown", true), {});
    const preventDefault = vi.fn();
    const click = vi.fn();
    const event = { key: " ", preventDefault, currentTarget: { click } };
    handler({ ...event, ctrlKey: true });
    expect(click).not.toHaveBeenCalled();
    handler(event);
    expect(preventDefault).toHaveBeenCalledOnce();
    expect(click).toHaveBeenCalledOnce();
  });
});

describe("AC1/AC2: ManualRail renders an anchor per destination when the parent supplies hrefFor", () => {
  it("passes the parent's hrefs and destination handler into the shared linked tablist", () => {
    expect(MANUAL_RAIL).toContain("<TabRail");
    expect(MANUAL_RAIL).toContain("hrefFor?.(dest.id)");
    expect(MANUAL_RAIL).toContain("onChange={onDestinationClick}");
  });
});

describe("AC1/AC2: page.tsx wires hrefs into the top strip, all three rails and ManualRail", () => {
  it("guards the MUI <Tabs> onChange so a modified click does not also switch this tab", () => {
    const head = between(PAGE, "<Tabs", "sx={{");
    const guard = head.indexOf("isPlainLeftClick(");
    expect(guard, "Tabs onChange is not guarded by isPlainLeftClick").toBeGreaterThan(-1);
    const setter = head.indexOf("setActiveTab(v)");
    expect(setter).toBeGreaterThan(guard);
  });

  it("renders each top-strip Tab as an anchor with a built href and a guarded preventDefault", () => {
    const strip = between(PAGE, "TAB_ORDER.map(", "</Tabs>");
    expect(strip).toContain('component="a"');
    expect(strip).toContain("href={buildTabHref(navState, { tab })}");
    const guard = strip.indexOf("isPlainLeftClick(");
    expect(guard).toBeGreaterThan(-1);
    expect(strip.indexOf("preventDefault()")).toBeGreaterThan(guard);
  });

  it("gives every rail option an href built from the same state its onChange handler writes", () => {
    expect(between(PAGE, "const coursesRailOptions", "const toolsRailOptions")).toContain(
      "href: buildTabHref(navState, coursesStateFromRailItem("
    );
    expect(between(PAGE, "const toolsRailOptions", "const libraryRailOptions")).toContain(
      "href: buildTabHref(navState, toolsStateFromRailItem("
    );
    expect(between(PAGE, "const libraryRailOptions", "const handleCoursesRailChange")).toContain(
      "href: buildTabHref(navState, { librarySection: id })"
    );
  });

  it("passes ManualRail an hrefFor that resolves the destination through resolveStateFromDestinationId", () => {
    const rail = between(PAGE, "<ManualRail", "onDestinationClick=");
    expect(rail).toContain("hrefFor=");
    expect(rail).toContain("buildTabHref(");
    expect(rail).toContain("resolveStateFromDestinationId(");
  });

  it("builds navState from every UrlNavState field", () => {
    const literal = between(PAGE, "const navState: UrlNavState = {", "};");
    for (const key of Object.keys(parseUrlState("?tab=manual"))) {
      expect(literal, `navState is missing ${key}`).toMatch(new RegExp(`\\b${key}\\b`));
    }
  });

  it("carries a visible stored Recording view into outer hrefs and leaves legacy views directly addressable", () => {
    const saved = "moduledeck";
    const stateCall = initializer(NAV, "[recView, setRecView]") as ts.CallExpression;
    const recView = evaluate(stateCall.arguments[0].getText(), {
      window: { location: { search: "?tab=courses" } },
      localStorage: { getItem: () => saved }, resolveRecViewFromUrl,
    })();
    expect(recView).toBe(saved);
    const returned = NAV.slice(NAV.lastIndexOf("  return {") + "  return ".length).split(";")[0];
    const defaults = parseUrlState("?tab=courses");
    const bindings = Object.fromEntries(returned.match(/\b\w+\b/g)!.map((name) => [name, "unused"]));
    const nav = evaluate(returned, { ...bindings, ...defaults, activeTab: "courses", recView });
    expect(nav.recView).toBe(saved);
    const navBindings = { ...defaults, activeTab: "courses", normalizeRecordingEntry };
    const navState = evaluate(initializer(PAGE, "navState").getText(), { ...navBindings, nav });
    const recording = toolsStateFromRailItem("manual:recording", navState.toolsSection, navState.manualView);
    const expected = "/?tab=manual&manualView=recording&recView=moduledeck";
    expect(buildTabHref(navState, { tab: "manual", ...recording })).toBe(expected);
    expect(buildTabHref({ ...navState, ...recording }, { tab: "manual" })).toBe(expected);
    const afterLegacy = evaluate(initializer(PAGE, "navState").getText(), { ...navBindings, nav: { ...nav, recView: "captions" } });
    expect(buildTabHref(afterLegacy, { tab: "manual", ...recording })).toBe("/?tab=manual&manualView=recording");
    const component = read("src", "app", "components", "RecordingTab.tsx");
    const innerHref = evaluate(initializer(component, "recViewHref").getText(), {
      window: { location: { search: expected.slice(1) } }, parseUrlState, buildTabHref,
    });
    expect(innerHref("speed")).toBe("/?tab=manual&manualView=recording&recView=speed");
    expect(innerHref("record")).toBe("/?tab=manual&manualView=recording&recView=record");
    expect(innerHref("lecturevideos")).toBe("/?tab=manual&manualView=recording");
  });
});

// AC3, enumerated per Tier-1 field: the URL-named value is read before the
// persisted ta-* key is consulted, so a cold-loaded href renders the clicked
// view even when localStorage holds a different one. The behavioural half (the
// URL value survives buildUrlSearch -> parseUrlState) is in tab-link.test.ts.
describe("AC3: every Tier-1 field's initializer reads the URL before its persisted key", () => {
  const fields: { field: string; param: string; key: string }[] = [
    { field: "coursesSection", param: "coursesSection", key: "COURSES_SECTION_KEY" },
    { field: "toolsSection", param: "toolsSection", key: "TOOLS_SECTION_KEY" },
    { field: "librarySection", param: "librarySection", key: "LIBRARY_SECTION_KEY" },
    { field: "manualView", param: "manualView", key: '"ta-manual-view"' },
    { field: "buildView", param: "buildView", key: "BUILD_VIEW_KEY" },
    { field: "contentView", param: "contentView", key: "VIEW_KEY" },
    { field: "automateView", param: "automateView", key: "AUTOMATE_VIEW_KEY" },
    { field: "tasksView", param: "tasksView", key: "TASKS_VIEW_KEY" },
    { field: "gradingView", param: "gradingView", key: "GRADING_VIEW_KEY" },
    { field: "presentationsView", param: "presentationsView", key: "PRESENTATIONS_VIEW_KEY" },
    { field: "announcementsView", param: "announcementsView", key: "ANNOUNCEMENTS_VIEW_KEY" },
  ];

  function initializer(field: string): string {
    const start = NAV.indexOf(`const [${field}, `);
    expect(start, `no useState for ${field}`).toBeGreaterThan(-1);
    const next = NAV.indexOf("\n  const [", start + 1);
    const block = NAV.slice(start, next > start ? next : undefined);
    if (field === "manualView") {
      expect(block).toContain("return initializeManualView(window.location.search, localStorage, toolsSection, readLegacyAutomateView);");
      return read("src", "app", "components", "home", "navigation-initial-state.ts");
    }
    return block;
  }

  it("tab: readNavSource lets the URL tab win over ta-active-tab", () => {
    expect(NAV).toContain('urlTab !== null ? urlTab : localStorage.getItem("ta-active-tab")');
  });

  for (const { field, param, key } of fields) {
    it(`${field}: URL branch (gated on urlHasTab, reading "${param}") precedes the persisted ${key} read`, () => {
      const body = initializer(field);
      const gate = body.indexOf("if (urlHasTab");
      expect(gate, `${field} has no urlHasTab-gated URL branch`).toBeGreaterThan(-1);
      const urlRead = body.indexOf(`.get("${param}")`, gate);
      expect(urlRead, `${field}'s URL branch never reads "${param}"`).toBeGreaterThan(gate);
      const stored = body.indexOf(`localStorage.getItem(${key})`);
      expect(stored, `${field} never reads ${key}`).toBeGreaterThan(-1);
      expect(stored, `${field} reads ${key} before the URL`).toBeGreaterThan(urlRead);
    });
  }
});
