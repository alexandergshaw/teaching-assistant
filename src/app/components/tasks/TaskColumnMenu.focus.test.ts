// Additional coverage for the TaskColumnMenu roving-tabindex fix (Note 2 on
// the tasks-column-reorder review): moveFocus/focusEdge used to assume a
// disabled `[data-menuitem]` is always the LAST item in its section, so a
// focused element's position in the (disabled-filtered) DOM query list
// always equalled its true flat index. The new AC3 Reorder section breaks
// that assumption - any of its four items can be the disabled one, in any
// position - so the fix reads each item's real flat index off its own
// `data-index` attribute instead.
//
// Only the PARSING half of that fix (parseFlatIndex) is reachable from a
// pure module: this repo's vitest runs `environment: "node"`, so there is
// no DOM to query, no real `document.activeElement`, and no way to render
// TaskColumnMenu's `role="menu"` and press arrow keys against it. The
// import below pulls in a .tsx file, which this repo's own gridFocus.test.ts
// already establishes works fine under vitest's node environment (MUI and
// .tsx imports transform cleanly there - only RENDERING fails), so this is
// a genuine unit test of `parseFlatIndex`, not a workaround.
//
// NOT reachable here, and therefore not tested by this file: the actual
// `el.getAttribute("data-index")` DOM read, moveFocus/focusEdge's DOM
// traversal (`querySelectorAll`, `document.activeElement`), and the
// resulting roving-tabindex behavior of the Reorder section in context
// (whether Down-arrowing past a disabled "Move left" correctly lands the
// roving slot on "Move right" rather than drifting). Those remain verified
// by reading, the same treatment this feature's other pointer/DOM-only
// pieces get (docs/tasks-column-reorder-acceptance-criteria.md AC6 item 27,
// REGRESSION entry 234 check 9).
import { describe, it, expect } from "vitest";
import { parseFlatIndex } from "./TaskColumnMenu";

describe("parseFlatIndex", () => {
  it("parses a numeric data-index string", () => {
    expect(parseFlatIndex("0", -1)).toBe(0);
    expect(parseFlatIndex("7", -1)).toBe(7);
  });

  it("falls back when the attribute is absent (null or undefined)", () => {
    expect(parseFlatIndex(null, 3)).toBe(3);
    expect(parseFlatIndex(undefined, 3)).toBe(3);
  });

  it("falls back on a non-numeric value rather than returning NaN", () => {
    expect(parseFlatIndex("not-a-number", 2)).toBe(2);
  });

  it("accepts 0 as a real index, not a falsy fallback trigger", () => {
    // The bug this guards: a naive `Number(raw) || fallback` would treat
    // the parsed 0 as falsy and silently substitute the fallback instead,
    // which is exactly wrong for the FIRST item in a menu (flat index 0).
    expect(parseFlatIndex("0", 99)).toBe(0);
  });

  it("never throws on a malformed value", () => {
    expect(() => parseFlatIndex("Infinity", 0)).not.toThrow();
    expect(parseFlatIndex("Infinity", 0)).toBe(0); // Infinity is not finite
  });
});
