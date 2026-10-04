// RG-SEARCH-STICKY Wave A (docs/repo-grades-wave-a-sticky-shell-test-notes.md):
// source/CSS-text pins for the sticky working-header shell. Nothing renders
// under vitest, so these prove the MECHANISM is present, not that it sticks on
// screen - that is the owner walk AC-F2-4 (offset under wrap, both themes,
// narrow width). Each CSS pin slices its OWN class rule block: the grid already
// had a sticky thead and the run bar already had a sticky rule, so a file-wide
// position:sticky match would pass vacuously.
import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";
import { join } from "path";

const read = (name: string): string => readFileSync(join(__dirname, name), "utf8");

function withoutCssComments(css: string): string {
  return css.replace(/\/\*[\s\S]*?\*\//g, "");
}

function withoutLineComments(src: string): string {
  return src
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .split(/\r?\n/)
    .map((l) => l.replace(/\/\/.*$/, ""))
    .join("\n");
}

function ruleBlock(css: string, selector: string, from = 0): string {
  const sel = css.indexOf(selector, from);
  expect(sel, `expected a ${selector} rule`).toBeGreaterThan(-1);
  const open = css.indexOf("{", sel);
  const close = css.indexOf("}", open);
  expect(open, `open brace for ${selector}`).toBeGreaterThan(-1);
  expect(close, `close brace for ${selector}`).toBeGreaterThan(open);
  return css.slice(open + 1, close);
}

const CSS = withoutCssComments(read("repo-grades.module.css"));
const INDEX = withoutLineComments(read("index.tsx"));
const HEADER = withoutLineComments(read("RepoGradesStickyHeader.tsx"));
const RUNBAR = withoutLineComments(read("RepoGradesRunBar.tsx"));

describe("Wave A CSS: the sticky shell", () => {
  it("W-A1: .stickyShell is bounded and scrolls", () => {
    const block = ruleBlock(CSS, ".stickyShell");
    expect(block).toMatch(/(^|[\s;{])max-height\s*:/);
    expect(block).toMatch(/overflow(-y)?\s*:\s*(auto|scroll)/);
  });

  it("W-A2: every scroll container in the sheet is height-bounded", () => {
    const re = /overflow(?:-x|-y)?\s*:\s*(?:auto|scroll)/g;
    const unbounded: string[] = [];
    let m: RegExpExecArray | null;
    while ((m = re.exec(CSS)) !== null) {
      const block = CSS.slice(CSS.lastIndexOf("{", m.index) + 1, CSS.indexOf("}", m.index));
      if (!/(^|[\s;{])max-height\s*:/.test(block)) unbounded.push(block.trim().slice(0, 60));
    }
    expect(unbounded).toEqual([]);
  });

  it("W-A2: .gridWrap is a plain wrapper, not a scroll container", () => {
    const block = ruleBlock(CSS, ".gridWrap");
    expect(block).not.toMatch(/overflow(-x|-y)?\s*:\s*(auto|scroll)/);
  });

  it("W-A3: .stickyWorkingHeader is a left/top-pinned opaque top tier", () => {
    const block = ruleBlock(CSS, ".stickyWorkingHeader");
    expect(block).toMatch(/position\s*:\s*sticky/);
    expect(block).toMatch(/(^|[\s;{])top\s*:\s*0\b/);
    expect(block).toMatch(/(^|[\s;{])left\s*:\s*0\b/);
    expect(block).toMatch(/z-index\s*:\s*3\b/);
    expect(block).toMatch(/background\s*:\s*var\(/);
  });

  it("W-A4: the thead offset references the header height and sits at z-index 2", () => {
    const block = ruleBlock(CSS, ".grid thead th");
    expect(block).toMatch(/position\s*:\s*sticky/);
    expect(block).toMatch(/top\s*:\s*var\(--rg-working-header-h/);
    expect(block).toMatch(/z-index\s*:\s*2\b/);
    expect(block).toMatch(/background\s*:\s*var\(/);
  });

  it("W-A5: the narrow-width thead un-stick survives", () => {
    const first = CSS.indexOf(".grid thead th");
    const block = ruleBlock(CSS, ".grid thead th", first + 1);
    expect(block).toMatch(/position\s*:\s*static/);
  });
});

describe("Wave A wiring", () => {
  it("W-A6: index.tsx imports AND mounts RepoGradesStickyHeader", () => {
    expect(INDEX).toMatch(/import\s+RepoGradesStickyHeader\s+from\s+["']\.\/RepoGradesStickyHeader["']/);
    expect(INDEX).toMatch(/<RepoGradesStickyHeader\b/);
  });

  it("W-A7: the run bar is relocated into the sticky header, not duplicated", () => {
    expect(HEADER).toMatch(/import\s+RepoGradesRunBar\b/);
    expect(HEADER).toMatch(/<RepoGradesRunBar\b/);
    expect(INDEX).not.toMatch(/<RepoGradesRunBar\b/);
  });

  it("W-A8: shell, then working header (holding the run bar), then children", () => {
    const shell = HEADER.indexOf("styles.stickyShell");
    const hdr = HEADER.indexOf("styles.stickyWorkingHeader");
    const bar = HEADER.indexOf("<RepoGradesRunBar");
    const kids = HEADER.indexOf("{children}");
    expect(shell).toBeGreaterThan(-1);
    expect(hdr).toBeGreaterThan(shell);
    expect(bar).toBeGreaterThan(hdr);
    expect(kids).toBeGreaterThan(bar);
  });

  it("W-A9: the header height var is published by the component", () => {
    expect(HEADER).toContain("--rg-working-header-h");
    expect(HEADER).toMatch(/setProperty\(\s*["']--rg-working-header-h["']/);
  });

  it("W-A10: Wave A leaves the run bar plan inputs and Wave C identifiers alone", () => {
    // Wave C (F3-c) reverses the pre-F3-c pins: the run bar now routes through
    // resolveGradeScope and no longer carries the bare bulkSelectionOnly forms.
    expect(RUNBAR).toContain("resolveGradeScope(selected, bulkSelectionOnly)");
    expect(RUNBAR).toContain("scopedToSelection: gradeScope.scopedToSelection");
    expect(RUNBAR).not.toContain("selectionOnly: bulkSelectionOnly");
    expect(RUNBAR).not.toContain("scopedToSelection: bulkSelectionOnly && selected.size > 0");
    expect(INDEX).toMatch(/rows:\s*displayedRows/);
    // Wave B retires the bodyRows ban for index.tsx ONLY (it legitimately feeds
    // the grid's bodyRows prop); the full ban stays on the header and run bar.
    for (const [name, src, banned] of [
      ["index.tsx", INDEX, ["planRows"]],
      ["RepoGradesStickyHeader.tsx", HEADER, ["visibleRepoRows", "bodyRows", "planRows"]],
      ["RepoGradesRunBar.tsx", RUNBAR, ["visibleRepoRows", "bodyRows", "planRows"]],
    ] as const) {
      for (const id of banned) {
        expect(src, `${name} must not contain ${id}`).not.toContain(id);
      }
    }
  });
});
