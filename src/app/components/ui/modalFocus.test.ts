// The pure core of the shared modal dismissal/focus mechanism.
//
// Written before the implementation; currently failing. Contract from
// docs/modal-dismissal-focus-acceptance-criteria.md.
//
// vitest here is node-env and collects only src/**/*.test.ts, so no component
// renders and nothing can assert a real tab order, a real .focus() call, or
// whether a portalled listbox is truly reachable. What CAN be pinned is every
// DECISION the mechanism makes, pushed out of the effects and into values -
// the move gridFocus.ts and confirmArming.ts already establish in this repo.
// The DOM query and the focus call stay outside and are verified by reading.
//
// Each group below is a decision that would otherwise be invisible, and each
// carries the reason it is a decision at all rather than an implementation
// detail.
import { readFileSync } from "node:fs";
import { describe, it, expect } from "vitest";
import {
  modalKeyAction,
  orderTabbables,
  isInsideModalOrItsPopup,
  restoreTarget,
  createModalStack,
  type TabbableDescriptor,
} from "./modalFocus";

describe("modalKeyAction", () => {
  it("closes on Escape, including the legacy spelling", () => {
    // Older browsers report "Esc". Cheap to accept, invisible to miss.
    expect(modalKeyAction({ key: "Escape" })).toBe("close");
    expect(modalKeyAction({ key: "Esc" })).toBe("close");
  });

  it("ignores a key another handler has already dealt with", () => {
    // Several inline editors in this app handle Escape first and stop there.
    // A shared handler that overrode them would cancel an edit AND close the
    // dialog on one press.
    expect(modalKeyAction({ key: "Escape", defaultPrevented: true })).toBeNull();
    expect(modalKeyAction({ key: "Tab", defaultPrevented: true })).toBeNull();
  });

  it("reports which way Tab is moving", () => {
    expect(modalKeyAction({ key: "Tab" })).toBe("trap-forward");
    expect(modalKeyAction({ key: "Tab", shiftKey: true })).toBe("trap-back");
  });

  it("has nothing to say about any other key", () => {
    for (const key of ["Enter", " ", "a", "ArrowDown", "Home", "F5"]) {
      expect(modalKeyAction({ key }), `${key} must not be intercepted`).toBeNull();
    }
  });
});

describe("orderTabbables", () => {
  const at = (index: number, over: Partial<TabbableDescriptor> = {}): TabbableDescriptor => ({
    index,
    tabIndex: 0,
    disabled: false,
    hidden: false,
    ...over,
  });

  it("keeps document order among the ordinary tabbables", () => {
    expect(orderTabbables([at(0), at(1), at(2)])).toEqual([0, 1, 2]);
  });

  it("puts positive tabIndex ahead of everything, in ascending order", () => {
    // The rule browsers actually implement, and the one hand-rolled traps most
    // often get wrong.
    const order = orderTabbables([at(0), at(1, { tabIndex: 2 }), at(2, { tabIndex: 1 })]);
    expect(order).toEqual([2, 1, 0]);
  });

  it("breaks a positive-tabIndex tie by document order", () => {
    expect(orderTabbables([at(0, { tabIndex: 1 }), at(1, { tabIndex: 1 })])).toEqual([0, 1]);
  });

  it("excludes what cannot take focus", () => {
    const order = orderTabbables([
      at(0),
      at(1, { disabled: true }),
      at(2, { hidden: true }),
      at(3, { tabIndex: -1 }),
      at(4),
    ]);
    expect(order).toEqual([0, 4]);
  });

  it("returns nothing for a modal with no tabbable control at all", () => {
    // Real case: a preview modal whose only control is its Close button, hidden
    // while a save is in flight. The caller falls back to the container.
    expect(orderTabbables([])).toEqual([]);
    expect(orderTabbables([at(0, { disabled: true })])).toEqual([]);
  });
});

describe("isInsideModalOrItsPopup", () => {
  // The chain is the focused element's ancestors, nearest first.
  it("accepts focus inside the modal itself", () => {
    expect(isInsideModalOrItsPopup([{}, { isModalRoot: true }])).toBe(true);
  });

  it("rejects focus that escaped behind the backdrop", () => {
    expect(isInsideModalOrItsPopup([{}, {}])).toBe(false);
    expect(isInsideModalOrItsPopup([])).toBe(false);
  });

  it("accepts a portalled MUI listbox, which lives at document.body", () => {
    // THE reason this predicate exists. Every MUI Select in this app portals
    // its listbox out of the modal; a trap that treated it as outside would
    // yank focus back and close the dropdown, breaking five modals that work
    // today in the name of accessibility.
    expect(isInsideModalOrItsPopup([{ role: "option" }, { role: "listbox" }])).toBe(true);
    expect(isInsideModalOrItsPopup([{ role: "menuitem" }, { role: "menu" }])).toBe(true);
    expect(isInsideModalOrItsPopup([{ classNames: ["MuiPopover-root"] }])).toBe(true);
    expect(isInsideModalOrItsPopup([{ classNames: ["MuiModal-root"] }])).toBe(true);
  });

  it("does not accept any element merely because it carries some MUI class", () => {
    // The escape hatch must be narrow, or it stops being a trap at all.
    expect(isInsideModalOrItsPopup([{ classNames: ["MuiButton-root", "MuiBox-root"] }])).toBe(false);
  });
});

describe("restoreTarget", () => {
  it("prefers the first still-connected candidate", () => {
    expect(restoreTarget([{ value: "opener", connected: true }, { value: "fallback", connected: true }])).toBe(
      "opener"
    );
  });

  it("skips a candidate that has since left the document", () => {
    // React reconciliation can unmount the opener while the dialog is open;
    // restoring focus to a detached node silently drops it on the body.
    expect(restoreTarget([{ value: "opener", connected: false }, { value: "fallback", connected: true }])).toBe(
      "fallback"
    );
  });

  it("returns null rather than a detached node when nothing survives", () => {
    expect(restoreTarget([{ value: "opener", connected: false }])).toBeNull();
    expect(restoreTarget([])).toBeNull();
  });
});

describe("createModalStack", () => {
  it("treats the most recently opened modal as the top", () => {
    const stack = createModalStack();
    stack.open("outer");
    expect(stack.isTopmost("outer")).toBe(true);
    stack.open("inner");
    expect(stack.isTopmost("inner")).toBe(true);
    expect(stack.isTopmost("outer"), "only one modal may trap focus at a time").toBe(false);
  });

  it("hands the top back when the inner one closes", () => {
    // OfficeEditorModal mounts two overlays at once and AccessibilityCenter is
    // the always-mounted parent of four more. Without this, both trap.
    const stack = createModalStack();
    stack.open("outer");
    stack.open("inner");
    stack.close("inner");
    expect(stack.isTopmost("outer")).toBe(true);
  });

  it("survives a modal closing out of order", () => {
    const stack = createModalStack();
    stack.open("a");
    stack.open("b");
    stack.close("a");
    expect(stack.isTopmost("b")).toBe(true);
    expect(stack.isTopmost("a")).toBe(false);
  });

  it("says nothing is topmost when nothing is open", () => {
    const stack = createModalStack();
    expect(stack.isTopmost("a")).toBe(false);
    stack.open("a");
    stack.close("a");
    expect(stack.isTopmost("a")).toBe(false);
  });

  it("ignores a double open and a double close rather than corrupting the order", () => {
    // Strict mode double-invokes effects; a stack that counted naively would
    // leave a ghost entry and permanently disable the outer modal's trap.
    const stack = createModalStack();
    stack.open("a");
    stack.open("a");
    stack.close("a");
    expect(stack.isTopmost("a")).toBe(false);
    stack.close("a");
    expect(stack.isTopmost("a")).toBe(false);
  });

  it("keeps two stacks independent", () => {
    const one = createModalStack();
    const two = createModalStack();
    one.open("a");
    expect(two.isTopmost("a")).toBe(false);
  });
});

describe("modalFocus.ts stays a pure module", () => {
  // AC1: "No DOM, no React, no MUI, no CSS-module import." Importing the
  // module cannot check this - vitest transforms .tsx and MUI imports quite
  // happily under environment "node", and only rendering fails - so this
  // reads the file as TEXT instead, the same idiom gridFocus.test.ts:134-140
  // already uses for gridFocus.ts. Extended past that file's own check with
  // a "react"/"react-dom" alternative, because unlike gridFocus.ts (which
  // legitimately imports a type from a project module) modalFocus.ts has no
  // legitimate import at all beyond its own file - it is data-in, data-out.
  it("imports nothing from React, MUI, a CSS module, or a component", () => {
    const source = readFileSync(new URL("./modalFocus.ts", import.meta.url), "utf8");
    expect(source).not.toMatch(/from\s+["'](\.\/[A-Z]|@mui|react|[^"']*\.module\.css)/);
  });
});
