// Source/CSS-text pins for the repo-grading sticky working header's "controls in
// line" pass (docs/repo-grades-header-controls-inline-scope.md, AC-1..AC-12).
// Nothing renders under vitest, so these prove the MECHANISM is present (one
// control height, one flex recipe, non-controls on a trailing line), not how it
// looks: that is the owner walk (AC-OW). Helpers are duplicated on purpose
// (importing from another test file would re-run its describe blocks).
import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";
import { join } from "path";
import { countLines } from "../../../lib/count-lines";

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

// Body of the rule whose selector is EXACTLY `selector` (so `.headerInput` never
// resolves to `.headerInputLabel`), searching from `from`.
function ruleBlock(css: string, selector: string, from = 0): string {
  const escaped = selector.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const re = new RegExp(`(^|[}\\s,])${escaped}\\s*(?:,[^{}]*)?\\{`, "g");
  re.lastIndex = from;
  const m = re.exec(css);
  expect(m, `expected a ${selector} rule`).not.toBeNull();
  const open = css.indexOf("{", m!.index);
  const close = css.indexOf("}", open);
  expect(close, `close brace for ${selector}`).toBeGreaterThan(open);
  return css.slice(open + 1, close);
}

const RAW_CSS = read("repo-grades.module.css");
const CSS = withoutCssComments(RAW_CSS);
const HEADER = withoutLineComments(read("RepoGradesStickyHeader.tsx"));
const FOLDER = withoutLineComments(read("RepoGradesFolderPicker.tsx"));
const TYPEAHEAD = withoutLineComments(read("RepoGradesGradeSetTypeahead.tsx"));

describe("header inline: CSS", () => {
  it("AC-1: inputs and the Refresh band share the md control height token", () => {
    const input = ruleBlock(CSS, ".headerInput").match(/height:\s*(var\(--control-height-(?:sm|md|lg)\))/);
    const action = ruleBlock(CSS, ".headerAction").match(/height:\s*(var\(--control-height-(?:sm|md|lg)\))/);
    expect(input, ".headerInput needs a control-height token").not.toBeNull();
    expect(action, ".headerAction needs a control-height token").not.toBeNull();
    expect(input![1]).toBe(action![1]);
    expect(input![1]).toBe("var(--control-height-md)");
  });

  it("AC-2: .headerField and .gradeSet share one flex basis (<= 240px) and a 320px cap", () => {
    const bases: number[] = [];
    for (const sel of [".headerField", ".gradeSet"]) {
      const block = ruleBlock(CSS, sel);
      const m = block.match(/flex:\s*1 1 (\d+)px/);
      expect(m, `${sel} must use flex: 1 1 <n>px`).not.toBeNull();
      bases.push(Number(m![1]));
      expect(block, `${sel} max-width`).toMatch(/max-width:\s*320px/);
    }
    expect(bases[0]).toBe(bases[1]);
    expect(bases[0]).toBeLessThanOrEqual(240);
  });

  it("AC-3: the working header still wraps, bottom-aligns and never clips", () => {
    const block = ruleBlock(CSS, ".stickyWorkingHeader");
    expect(block).toMatch(/flex-wrap:\s*wrap/);
    expect(block).toMatch(/align-items:\s*flex-end/);
    expect(block).not.toMatch(/overflow/);
  });

  it("AC-4: .gradeSet is a plain popup anchor (no wrap, no centring)", () => {
    const block = ruleBlock(CSS, ".gradeSet");
    expect(block).toMatch(/position:\s*relative/);
    expect(block).not.toMatch(/flex-wrap/);
    expect(block).not.toMatch(/align-items/);
  });

  it("AC-5: the dead .headerField .headerInput override and the 320px input basis are gone", () => {
    expect(CSS).not.toMatch(/\.headerField\s+\.headerInput/);
    expect(ruleBlock(CSS, ".headerInput")).not.toContain("320px");
  });

  it("AC-6: .headerFullRow spans the full width and is ordered after the controls", () => {
    const block = ruleBlock(CSS, ".headerFullRow");
    expect(block).toMatch(/flex:\s*0 0 100%/);
    expect(block).toMatch(/order:\s*1/);
  });

  it("AC-10: the working header is un-stuck at narrow width", () => {
    const media = CSS.indexOf("@media (max-width: 700px)");
    expect(media).toBeGreaterThan(-1);
    expect(ruleBlock(CSS, ".stickyWorkingHeader", media)).toMatch(/position:\s*static/);
  });

  it("AC-12: the stylesheet stays at or under 1000 lines (no gate covers .css elsewhere)", () => {
    expect(countLines(RAW_CSS)).toBeLessThanOrEqual(1000);
  });
});

describe("header inline: markup", () => {
  it("AC-7: grade-set chips and status render on the trailing line, outside the popup anchor", () => {
    const row = TYPEAHEAD.indexOf("styles.headerFullRow");
    expect(row).toBeGreaterThan(-1);
    expect(TYPEAHEAD.indexOf("styles.gradeSetList")).toBeLessThan(row);
    expect(TYPEAHEAD.indexOf("styles.gradeSetChip")).toBeGreaterThan(row);
    expect(TYPEAHEAD.indexOf("summary.counterText")).toBeGreaterThan(row);
    expect(TYPEAHEAD).toMatch(/\{\(chips\.length > 0 \|\| summary\) && \(\s*<div className=\{styles\.headerFullRow\}>/);
  });

  it("AC-8: folder notices sit on the trailing line, not inside the select's field", () => {
    const start = FOLDER.indexOf("className={styles.headerField}");
    expect(start).toBeGreaterThan(-1);
    const end = FOLDER.indexOf("</div>", start);
    expect(end).toBeGreaterThan(start);
    const field = FOLDER.slice(start, end);
    expect(field).not.toContain("fieldHint");
    expect(field).not.toContain('role="alert"');
    const row = FOLDER.indexOf("styles.headerFullRow");
    expect(row).toBeGreaterThan(-1);
    expect(FOLDER.indexOf("fieldHint")).toBeGreaterThan(row);
    expect(FOLDER.indexOf('role="alert"')).toBeGreaterThan(row);
    expect(FOLDER).toContain("folderDropNotice");
  });

  it("AC-9: the banner and Refresh wrappers are conditional (no phantom flex item)", () => {
    expect(HEADER).toMatch(/\{statusBanner && \(\s*<div className=\{styles\.headerFullRow\}>\s*\{statusBanner\}/);
    expect(HEADER).toMatch(/\{rescanControl && \(\s*<div className=\{styles\.headerAction\}>\s*\{rescanControl\}/);
  });
});
