// RG-SEARCH-STICKY Wave B (docs/repo-grades-wave-b-search-test-notes.md sections
// 4-5): source pins for the display-only contract and the search input wiring.
// Nothing renders under vitest, so these prove the STRUCTURE (the query reaches
// only the tbody via bodyRows; every plan surface keeps the query-free rows),
// not the on-screen counts - that is the owner walk AC-F1-3.
import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";
import { join } from "path";

const read = (name: string): string => readFileSync(join(__dirname, name), "utf8");

function withoutLineComments(src: string): string {
  return src
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .split(/\r?\n/)
    .map((l) => l.replace(/\/\/.*$/, ""))
    .join("\n");
}

/** The text from `start` to the first `end` after it; both anchors must resolve. */
function slice(src: string, start: string, end: string): string {
  const a = src.indexOf(start);
  expect(a, `anchor ${start}`).toBeGreaterThan(-1);
  const b = src.indexOf(end, a);
  expect(b, `end anchor ${end} after ${start}`).toBeGreaterThan(a);
  return src.slice(a, b);
}

const GRID = withoutLineComments(read("RepoGradesGrid.tsx"));
const INDEX = withoutLineComments(read("index.tsx"));
const HEADER = withoutLineComments(read("RepoGradesStickyHeader.tsx"));

describe("Wave B display-only: grid-internal split", () => {
  it("the grid takes BOTH rows and bodyRows", () => {
    const props = slice(GRID, "export default function RepoGradesGrid({", "}: RepoGradesGridProps");
    expect(props).toMatch(/\brows,/);
    expect(props).toMatch(/\bbodyRows,/);
  });

  it("the tbody maps bodyRows (the query reaches the body)", () => {
    expect(GRID).toMatch(/<tbody[^>]*>\s*\{\s*bodyRows\.map\(/);
  });

  it("the column header keeps the query-free rows and never reads bodyRows", () => {
    const header = slice(GRID, "<ColumnHeaderControls", "/>");
    expect(header).toMatch(/rows=\{rows\}/);
    expect(header).not.toMatch(/rows=\{bodyRows\}/);
  });
});

describe("Wave B display-only: index wiring keeps plan inputs query-free", () => {
  it("the grid gets rows={displayedRows} (plan) and a bodyRows prop, never rows={bodyRows}", () => {
    const grid = slice(INDEX, "<RepoGradesGrid", "/>");
    expect(grid).toMatch(/rows=\{displayedRows\}/);
    expect(grid).toMatch(/bodyRows=\{bodyRows\}/);
    expect(grid).not.toMatch(/\brows=\{bodyRows\}/);
  });

  it("the run bar keeps rows: displayedRows and never rows: bodyRows", () => {
    expect(INDEX).toMatch(/rows:\s*displayedRows/);
    expect(INDEX).not.toMatch(/rows:\s*bodyRows/);
  });

  it("displayedRows is query-free by construction", () => {
    const def = slice(INDEX, "const displayedRows =", ";");
    expect(def).not.toContain("rowMatchesQuery");
    expect(def).not.toContain("searchQuery");
  });

  it("bodyRows is the folder-scoped set narrowed by the query", () => {
    const def = slice(INDEX, "const bodyRows =", ";");
    expect(def).toContain("rowMatchesQuery");
    expect(def).toContain("displayedRows");
    expect(def).toContain("searchQuery");
  });

  it("rowMatchesQuery is imported from ./repoGradesSearch", () => {
    expect(INDEX).toMatch(/import\s*\{[^}]*rowMatchesQuery[^}]*\}\s*from\s*["']\.\/repoGradesSearch["']/);
  });
});

describe("Wave B search input: placement and wiring", () => {
  it("the input sits inside the working-header tier, before the children", () => {
    const tier = HEADER.indexOf("styles.stickyWorkingHeader");
    const input = HEADER.indexOf("<input");
    const kids = HEADER.indexOf("{children}");
    expect(tier).toBeGreaterThan(-1);
    expect(input).toBeGreaterThan(tier);
    expect(kids).toBeGreaterThan(input);
  });

  it("the input is bound to the searchQuery prop, reports changes, and has an accessible name", () => {
    expect(HEADER).toMatch(/value=\{\s*searchQuery\s*\}/);
    expect(HEADER).toMatch(/onSearchChange\(/);
    expect(HEADER).toMatch(/aria-label=["'][^"']*search[^"']*["']/i);
  });

  it("the working-header tier is not gated solely on the run bar", () => {
    const gate = slice(HEADER, "const hasHeader =", ";");
    expect(gate).toContain("onSearchChange");
    expect(HEADER).toMatch(/\{hasHeader && \(\s*<div className=\{styles\.stickyWorkingHeader\}/);
  });

  it("index passes the persisted query and a setter that writes searchQuery", () => {
    const el = slice(INDEX, "<RepoGradesStickyHeader", "runBar={");
    expect(el).toMatch(/searchQuery=\{\s*uiState\.searchQuery\s*\}/);
    expect(el).toMatch(/onSearchChange=\{[^}]*searchQuery:/);
  });
});
