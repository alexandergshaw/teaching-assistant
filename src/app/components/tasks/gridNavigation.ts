// Pure arrow-key/Home/End/PageUp/PageDown navigation arithmetic for the
// Tasks grid's roving-tabindex model (AC15 item 95) - pulled out of
// TasksGrid.tsx (which sits at a 1000-line hard cap) so that file has real
// headroom rather than a squeeze, the same reason useColumnDrag.ts
// (useColumnDrag.ts:3-11) and gridFocus.ts were split out before it. Unlike
// useColumnDrag.ts's own untestable pointer mechanics, this is PURE
// arithmetic - no DOM, no React - so, like gridFocus.ts (gridFocus.ts:1-9),
// it belongs in a plain `.ts` module a real vitest test can exercise (this
// repo's suite runs `environment: "node"` and collects only
// `src/**/*.test.ts`); see gridNavigation.test.ts.
export interface GridNavigationBounds {
  maxRow: number;
  maxCol: number;
  visibleRows: number;
}

export interface GridFocusPosition {
  row: number;
  col: number;
}

/**
 * The full APG arrow-key contract (AC15 item 95): Left/Right/Up/Down move
 * one cell and stop at the edges; Home/End move to the row's edges;
 * Ctrl+Home/End move to the very first/last cell of the grid; PageUp/
 * PageDown move by a visible page of rows, sized by the caller from the
 * scroll container's own rendered height rather than a guessed constant. B1:
 * ArrowUp from body row 0 moves into the header (row -1, and from there row
 * -2 for an expanded group's own collapse toggle); ArrowDown returns the
 * same way - the header rows are not a dead end.
 *
 * Returns the next `{row, col}`, or `null` for an unrecognized key - the
 * caller should do nothing in that case (never move focus).
 */
export function nextGridFocus(
  row: number,
  col: number,
  key: string,
  ctrlKey: boolean,
  bounds: GridNavigationBounds
): GridFocusPosition | null {
  const { maxRow, maxCol, visibleRows } = bounds;
  let nextRow = row;
  let nextCol = col;

  switch (key) {
    case "ArrowLeft":
      nextCol = Math.max(0, col - 1);
      break;
    case "ArrowRight":
      nextCol = Math.min(maxCol, col + 1);
      break;
    case "ArrowUp":
      nextRow = Math.max(-2, row - 1);
      break;
    case "ArrowDown":
      nextRow = Math.min(maxRow, row + 1);
      break;
    case "Home":
      if (ctrlKey) {
        nextRow = 0;
        nextCol = 0;
      } else {
        nextCol = 0;
      }
      break;
    case "End":
      if (ctrlKey) {
        nextRow = maxRow;
        nextCol = maxCol;
      } else {
        nextCol = maxCol;
      }
      break;
    case "PageUp":
      nextRow = Math.max(0, row - visibleRows);
      break;
    case "PageDown":
      nextRow = Math.min(maxRow, row + visibleRows);
      break;
    default:
      return null;
  }
  return { row: nextRow, col: nextCol };
}
