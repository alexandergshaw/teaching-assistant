// Refresh / reload in-flight indicator wiring (docs/lms-modules-loading-indicator-scope.md).
//
// No component renders under vitest (node-env), so this reads the sources as
// TEXT and proves WIRING, not paint. Comments are stripped first: both files
// carry long comments that contain the words these pins look for.
//
// Pins facts and ordering, not spelling.
import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";
import { join } from "path";

function stripped(rel: string): string {
  return readFileSync(join(process.cwd(), rel), "utf8")
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/^[ \t]*\/\/.*$/gm, "");
}

const tab = stripped("src/app/components/ContentTab.tsx");
const header = stripped("src/app/components/content-tab/modules/ModulesHeaderBar.tsx");

/** Source from `start` to the first `end` after it, asserting both exist. */
function between(src: string, start: string, end: string): string {
  const a = src.indexOf(start);
  expect(a, `anchor not found: ${start}`).toBeGreaterThan(-1);
  const b = src.indexOf(end, a + start.length);
  expect(b, `end anchor not found after: ${start}`).toBeGreaterThan(a);
  return src.slice(a, b);
}

/** The body of `const reload = () => { ... };` */
function reloadBody(): string {
  return between(tab, "const reload = () =>", "const toggleExpand");
}

describe("ContentTab reload in-flight counter", () => {
  it("P1: reload increments and decrements a counter, decrement in .finally, both under hasTarget", () => {
    const body = reloadBody();
    expect(body).toMatch(/if \(hasTarget\) \{/);
    const guarded = body.slice(body.indexOf("if (hasTarget)"));
    expect(guarded).toMatch(/setReloadsInFlight\(\(n\) => n \+ 1\)/);
    expect(guarded).toMatch(/\.finally\(\(\) => setReloadsInFlight\(\(n\) => n - 1\)\)/);
    expect(guarded.indexOf("n + 1")).toBeLessThan(guarded.indexOf(".finally("));
  });

  it("P3: reload stays silent (second argument literally true)", () => {
    expect(reloadBody()).toMatch(/loadContent\(selection, true\)/);
  });

  it("P2: ModulesView refreshing is fed by the counter, not loadState alone", () => {
    const view = between(tab, "<ModulesView", "canCopy={");
    const m = view.match(/refreshing=\{([^}]*)\}/);
    expect(m, "ModulesView no longer receives refreshing").not.toBeNull();
    expect(m![1].trim()).toBe("refreshing");
    expect(tab).toMatch(/const refreshing = reloadsInFlight > 0;/);
  });

  it("P4b: the non-modules results-header Refresh uses the counter, not loadState", () => {
    const btn = between(tab, "onClick={reload}", "</Button>");
    expect(btn).toMatch(/disabled=\{busy \|\| refreshing\}/);
    expect(btn).toMatch(/refreshing \?/);
    expect(btn).toMatch(/styles\.spinner/);
    expect(btn).not.toMatch(/loadState\.status === "loading"/);
  });
});

describe("ModulesHeaderBar Refresh button", () => {
  it("P4: the button owning onClick={reload} renders a spinner guarded by refreshing", () => {
    const anchor = header.indexOf("onClick={reload}");
    expect(anchor).toBeGreaterThan(-1);
    const start = header.lastIndexOf("<Button", anchor);
    const end = header.indexOf("</Button>", anchor);
    const btn = header.slice(start, end);
    expect(btn).toMatch(/refreshing && <span className=\{styles\.spinner\}/);
    expect(btn).toMatch(/disabled=\{busy \|\| refreshing\}/);
  });
});

describe("loadContent bad-link exit", () => {
  it("P5: the unparseable-course-id exit records a diagnostic and ends in an error, not a bare return", () => {
    const fn = between(tab, "const loadContent = async", "const reload = () =>");
    const at = fn.indexOf("parseCanvasCourseId(sel.courseUrl)");
    expect(at).toBeGreaterThan(-1);
    const exit = between(fn.slice(at), "if (!id) {", "const result = await listCourseContentAction");
    expect(exit).toMatch(/recordDiag\(/);
    expect(exit).toMatch(/setLoadState\(\{ status: "error"/);
    expect(exit).not.toMatch(/if \(!id\) return;/);
    expect(fn).not.toMatch(/if \(!id\) return;/);
  });
});

describe("select/restore indicator is untouched", () => {
  it("P6: the canonical loading block survives and the not-loaded gate precedes the modules branch", () => {
    const block = between(tab, 'courseTab && loadState.status === "loading" && (', ")}");
    expect(block).toMatch(/styles\.spinner/);
    expect(block).toMatch(/Loading course content/);
    const gate = tab.indexOf("!loaded ? null : view === \"modules\"");
    expect(gate).toBeGreaterThan(-1);
    expect(tab.indexOf("<ModulesView")).toBeGreaterThan(gate);
  });
});
