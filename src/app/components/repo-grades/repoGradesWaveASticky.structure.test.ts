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
const TYPEAHEAD = withoutLineComments(read("RepoGradesGradeSetTypeahead.tsx"));

// Slice one element by its own anchors; both ends must resolve or the test
// fails here rather than silently widening to the whole file. Duplicated on
// purpose (importing from another test file would re-run its describe blocks).
function sliceBetween(src: string, start: string, end: string): string {
  const a = src.indexOf(start);
  expect(a, `start anchor ${start}`).toBeGreaterThan(-1);
  const b = src.indexOf(end, a);
  expect(b, `end anchor ${end} after ${start}`).toBeGreaterThan(a);
  return src.slice(a, b);
}

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

describe("REPO-HEADER-VISUAL VH-10 pins", () => {
  it("VH-10(a): .stickyWorkingHeader never clips (no overflow => popup escapes)", () => {
    const block = ruleBlock(CSS, ".stickyWorkingHeader");
    expect(block).not.toMatch(/overflow(?:-x|-y)?\s*:/);
  });

  it("VH-10(b): both header inputs carry the shared .headerInput class", () => {
    const searchInput = sliceBetween(HEADER, "<input", "/>");
    expect(searchInput, "search input (StickyHeader) must carry styles.headerInput").toMatch(/styles\.headerInput\b/);
    const typeaheadInput = sliceBetween(TYPEAHEAD, "<input", "/>");
    expect(typeaheadInput, "typeahead input must carry styles.headerInput").toMatch(/styles\.headerInput\b/);
  });

  it("VH-10(c): .gradeSetList hangs below the header, above the thead, and is bounded", () => {
    const block = ruleBlock(CSS, ".gradeSetList");
    expect(block).toMatch(/position\s*:\s*absolute/);
    expect(block).toMatch(/top\s*:\s*100%/);
    expect(block).toMatch(/z-index\s*:\s*5\b/);
    expect(block).toMatch(/(^|[\s;{])max-height\s*:/);
  });

  it("VH-10(d): the chip remove button keeps its grade-set remove aria-label", () => {
    const removeBtn = sliceBetween(TYPEAHEAD, "<button", "</button>");
    expect(removeBtn).toContain("aria-label");
    expect(removeBtn).toContain("from the grade set");
  });
});

// REPO-GRADES-STATUS-PROMINENCE: the grading banner is bound to VIEW-LEVEL
// state (so it renders for both the run-bar start and the all-folders column
// start) and is visual-only (no role, no aria-live).
describe("REPO-GRADES-STATUS-PROMINENCE: sticky grading banner", () => {
  const PIN_INDEX = withoutLineComments(read("index.tsx"));
  const PIN_HEADER = withoutLineComments(read("RepoGradesStickyHeader.tsx"));
  const bannerProp = (): string => {
    const start = PIN_INDEX.indexOf("statusBanner={");
    expect(start, "statusBanner prop in index.tsx").toBeGreaterThan(-1);
    const end = PIN_INDEX.indexOf("gradeSetControl={", start);
    expect(end).toBeGreaterThan(start);
    return PIN_INDEX.slice(start, end);
  };

  it("AC-2: bound to bulkRunningFolder/bulkProgress, independent of folder scope, rendered in the sticky header", () => {
    const banner = bannerProp();
    expect(banner).toContain("bulkRunningFolder ?");
    expect(banner).toContain("bulkProgress");
    expect(banner).not.toContain("ALL_FOLDERS");
    expect(banner).not.toContain("currentSelectedFolder");
    expect(PIN_HEADER).toMatch(/\{statusBanner\}/);
    const hdr = sliceBetween(PIN_HEADER, "styles.stickyWorkingHeader", "{children}");
    expect(hdr).toContain("{statusBanner}");
  });

  it("AC-3: exactly one aria-live attribute in index.tsx, and the banner carries no role or aria-live", () => {
    expect((PIN_INDEX.match(/aria-live/g) ?? []).length).toBe(1);
    const banner = bannerProp();
    expect(banner).not.toContain("aria-live");
    expect(banner).not.toMatch(/\brole=/);
  });
});

// REPO-PAGE-OVERHAUL W3 (re-scan in the sticky header) and W4 (one persisted
// "Run setup" disclosure wrapping BOTH the controls and the link panel).
describe("REPO-PAGE-OVERHAUL W3: re-scan control in the sticky header", () => {
  const W_INDEX = withoutLineComments(read("index.tsx"));
  const W_HEADER = withoutLineComments(read("RepoGradesStickyHeader.tsx"));
  const W_CONTROLS = withoutLineComments(read("RepoGradesControls.tsx"));
  const rescanProp = (): string => sliceBetween(W_INDEX, "rescanControl={", "folderControl={");

  it("AC-W3-1: the header accepts and renders rescanControl inside .stickyWorkingHeader; index passes it", () => {
    expect(W_HEADER).toMatch(/rescanControl\?: ReactNode/);
    expect(sliceBetween(W_HEADER, "styles.stickyWorkingHeader", "{children}")).toContain("{rescanControl}");
    expect(W_INDEX).toContain("<RepoGradesStickyHeader");
    expect(rescanProp()).toContain("<button");
  });

  it("AC-W3-2: the node is wired to reloadScan and disabled on scanLoading (not dead)", () => {
    const node = rescanProp();
    expect(node).toContain("disabled={scanLoading}");
    expect(node).toMatch(/onClick=\{\(\) => reloadScan\(\)\}/);
  });

  it("AC-W3-3: the Refresh button and its props are gone from RepoGradesControls and its call", () => {
    expect(W_CONTROLS).not.toContain("onRefreshScan");
    expect(W_CONTROLS).not.toContain("scanLoading");
    expect(W_CONTROLS).not.toContain("Refresh");
    expect(W_INDEX).not.toContain("onRefreshScan");
  });
});

describe("REPO-PAGE-OVERHAUL W4: Run setup disclosure", () => {
  const W_INDEX = withoutLineComments(read("index.tsx"));

  it("AC-W4-1/3: the parent details is persisted via setupOpen and defaults open while !allBound", () => {
    expect(W_INDEX).toContain("effectiveOpen(uiState.setupOpen, !allBound)");
    expect(W_INDEX).toMatch(/setupOpen: value/);
  });

  it("AC-W4-7: the parent <details> contains BOTH RepoGradesControls and LinkUsernamesPanel", () => {
    const open = W_INDEX.indexOf("<details");
    const controls = W_INDEX.indexOf("<RepoGradesControls");
    const link = W_INDEX.indexOf("<LinkUsernamesPanel");
    const close = W_INDEX.indexOf("</details>");
    expect(open).toBeGreaterThan(-1);
    expect(W_INDEX.slice(open, open + 120)).toContain("setupRegion");
    expect(controls).toBeGreaterThan(open);
    expect(link).toBeGreaterThan(controls);
    expect(close).toBeGreaterThan(link);
    // The status banners stay outside (visible when collapsed).
    expect(W_INDEX.indexOf("<RepoGradesStatusBanners")).toBeGreaterThan(close);
  });

  it("AC-W4-4: still exactly one aria-live in comment-stripped index.tsx", () => {
    expect((W_INDEX.match(/aria-live/g) ?? []).length).toBe(1);
  });
});
