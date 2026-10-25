import { stripComments as sourceCode } from "@/app/components/ui/modalAdoptionSourceScan";
// Source-text wiring for the Tier-1 tab anchors (tabs-ctrl-click scope, AC1-AC3).
// Nothing renders under vitest here, so the anchor + guard contract and the
// URL-wins-over-localStorage cold-load ordering are asserted by reading source.
// The real new-tab behaviour is an owner walk (scope residual R2).

import { describe, expect, it } from "vitest";
import { readFileSync } from "fs";
import { join } from "path";
import ts from "typescript";
import { parseUrlState, resolveRecViewFromUrl } from "../../url-state";
import { buildTabHref } from "./tab-link";
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

describe("AC1/AC2: TabRail renders an anchor with a guarded click when given an href", () => {
  it("renders an <a> carrying href and role=tab", () => {
    expect(TAB_RAIL).toContain("<a");
    expect(TAB_RAIL).toContain("href={option.href}");
    expect(TAB_RAIL.split('role="tab"').length - 1).toBe(2); // anchor + button fallback
  });

  it("only switches in-app, and only prevents the native navigation, on a plain left click", () => {
    const anchor = between(TAB_RAIL, "<a", "</a>");
    const guard = anchor.indexOf("isPlainLeftClick(");
    expect(guard, "anchor onClick does not consult isPlainLeftClick").toBeGreaterThan(-1);
    expect(anchor.indexOf("preventDefault()")).toBeGreaterThan(guard);
    expect(anchor.indexOf("onChange(option.id)")).toBeGreaterThan(guard);
  });

  it("keeps the keyboard handler on the anchor", () => {
    expect(between(TAB_RAIL, "<a", "</a>")).toContain("onKeyDown={handleKeyDown}");
  });
});

describe("AC1/AC2: ManualRail renders an anchor per destination when the parent supplies hrefFor", () => {
  it("renders an <a> carrying the parent's href, guarded", () => {
    expect(MANUAL_RAIL).toContain("hrefFor?.(dest.id)");
    const anchor = between(MANUAL_RAIL, "<a", "</a>");
    expect(anchor).toContain("href={href}");
    expect(anchor).toContain('role="tab"');
    const guard = anchor.indexOf("isPlainLeftClick(");
    expect(guard).toBeGreaterThan(-1);
    expect(anchor.indexOf("preventDefault()")).toBeGreaterThan(guard);
    expect(anchor.indexOf("onDestinationClick(dest.id)")).toBeGreaterThan(guard);
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

  it("carries the stored Recording mirror through the hook return and page into outer hrefs, while inner links select their own view", () => {
    const saved = "captions";
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
    const navState = evaluate(initializer(PAGE, "navState").getText(), { ...defaults, activeTab: "courses", nav });
    const recording = toolsStateFromRailItem("manual:recording", navState.toolsSection, navState.manualView);
    const expected = "/?tab=manual&manualView=recording&recView=captions";
    expect(buildTabHref(navState, { tab: "manual", ...recording })).toBe(expected);
    expect(buildTabHref({ ...navState, ...recording }, { tab: "manual" })).toBe(expected);
    const component = read("src", "app", "components", "RecordingTab.tsx");
    const innerHref = evaluate(initializer(component, "recViewHref").getText(), {
      window: { location: { search: expected.slice(1) } }, parseUrlState, buildTabHref,
    });
    expect(innerHref("speed")).toBe("/?tab=manual&manualView=recording&recView=speed");
    expect(innerHref("record")).toBe("/?tab=manual&manualView=recording");
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
