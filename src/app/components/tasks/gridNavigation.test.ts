// Coverage for the Tasks grid's pure arrow-key/Home/End/Page navigation
// arithmetic (AC15 item 95) - pulled out of TasksGrid.tsx into
// gridNavigation.ts purely for line budget (see that file's header
// comment), not because of a behavior change; this suite pins the existing
// contract the extraction must not disturb.
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { nextGridFocus, type GridNavigationBounds } from "./gridNavigation";

const BOUNDS: GridNavigationBounds = { maxRow: 4, maxCol: 6, visibleRows: 3 };

describe("nextGridFocus", () => {
  it("moves one cell per arrow key and clamps at the low edge", () => {
    expect(nextGridFocus(2, 2, "ArrowLeft", false, BOUNDS)).toEqual({ row: 2, col: 1 });
    expect(nextGridFocus(2, 0, "ArrowLeft", false, BOUNDS)).toEqual({ row: 2, col: 0 });
    expect(nextGridFocus(2, 2, "ArrowRight", false, BOUNDS)).toEqual({ row: 2, col: 3 });
    expect(nextGridFocus(2, BOUNDS.maxCol, "ArrowRight", false, BOUNDS)).toEqual({ row: 2, col: BOUNDS.maxCol });
  });

  it("moves ArrowUp past body row 0 into the header rows, stopping at row -2 (B1)", () => {
    expect(nextGridFocus(0, 2, "ArrowUp", false, BOUNDS)).toEqual({ row: -1, col: 2 });
    expect(nextGridFocus(-1, 2, "ArrowUp", false, BOUNDS)).toEqual({ row: -2, col: 2 });
    expect(nextGridFocus(-2, 2, "ArrowUp", false, BOUNDS)).toEqual({ row: -2, col: 2 });
  });

  it("moves ArrowDown back down through the header rows and clamps at the last body row", () => {
    expect(nextGridFocus(-2, 2, "ArrowDown", false, BOUNDS)).toEqual({ row: -1, col: 2 });
    expect(nextGridFocus(-1, 2, "ArrowDown", false, BOUNDS)).toEqual({ row: 0, col: 2 });
    expect(nextGridFocus(BOUNDS.maxRow, 2, "ArrowDown", false, BOUNDS)).toEqual({ row: BOUNDS.maxRow, col: 2 });
  });

  it("Home/End move to the row's edges; Ctrl+Home/End move to the grid's very first/last cell", () => {
    expect(nextGridFocus(2, 4, "Home", false, BOUNDS)).toEqual({ row: 2, col: 0 });
    expect(nextGridFocus(2, 4, "End", false, BOUNDS)).toEqual({ row: 2, col: BOUNDS.maxCol });
    expect(nextGridFocus(2, 4, "Home", true, BOUNDS)).toEqual({ row: 0, col: 0 });
    expect(nextGridFocus(2, 4, "End", true, BOUNDS)).toEqual({ row: BOUNDS.maxRow, col: BOUNDS.maxCol });
  });

  it("PageUp/PageDown move by the caller-supplied visible-row count, clamped to the body", () => {
    expect(nextGridFocus(2, 3, "PageUp", false, BOUNDS)).toEqual({ row: 0, col: 3 }); // 2 - 3 clamps to 0
    expect(nextGridFocus(1, 3, "PageDown", false, BOUNDS)).toEqual({ row: BOUNDS.maxRow, col: 3 }); // 1 + 3 clamps to maxRow
  });

  it("returns null for a key it does not recognize, so the caller moves nothing", () => {
    expect(nextGridFocus(2, 2, "Tab", false, BOUNDS)).toBeNull();
    expect(nextGridFocus(2, 2, "a", false, BOUNDS)).toBeNull();
  });

  it("stays a pure module - no component, MUI or CSS import", () => {
    const source = readFileSync(new URL("./gridNavigation.ts", import.meta.url), "utf8");
    expect(source).not.toMatch(/from\s+["'](\.\/[A-Z]|@mui|[^"']*\.module\.css)/);
  });
});
