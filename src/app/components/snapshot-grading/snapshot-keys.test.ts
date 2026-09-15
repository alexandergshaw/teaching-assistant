// N14 WAVE 0: the keyboard layer's first assertions (Ruling N14-4 - the
// adoption set was empty; nothing in this suite previously pinned the
// bare-key bindings, the guard order, or the modifier defect). Covers the
// pure matcher and the pure eligibility guard from snapshot-keys.ts.

import { describe, expect, it } from "vitest";
import {
  ROLE_BY_DIGIT,
  isSnapshotShortcutEligible,
  matchSnapshotKeyEvent,
  type SnapshotKeyLike,
} from "./snapshot-keys";

function key(overrides: Partial<SnapshotKeyLike> & { key: string }): SnapshotKeyLike {
  return {
    ctrlKey: false,
    altKey: false,
    metaKey: false,
    shiftKey: false,
    repeat: false,
    ...overrides,
  };
}

describe("matchSnapshotKeyEvent - bare bindings", () => {
  it("bare s snaps", () => {
    expect(matchSnapshotKeyEvent(key({ key: "s" }))).toEqual({ type: "snap" });
  });

  it("bare n arms next student", () => {
    expect(matchSnapshotKeyEvent(key({ key: "n" }))).toEqual({ type: "arm-next-student" });
  });

  it("every digit in ROLE_BY_DIGIT maps to its recorded role (entry 424a)", () => {
    expect(ROLE_BY_DIGIT).toEqual({
      "1": "assignment",
      "2": "rubric",
      "3": "post",
      "4": "replies",
      "5": "submission",
      "6": "other",
    });
    for (const [digit, role] of Object.entries(ROLE_BY_DIGIT)) {
      expect(matchSnapshotKeyEvent(key({ key: digit }))).toEqual({ type: "arm-role", role });
    }
  });

  it("a digit outside the map matches nothing", () => {
    expect(matchSnapshotKeyEvent(key({ key: "7" }))).toEqual({ type: "none" });
    expect(matchSnapshotKeyEvent(key({ key: "0" }))).toEqual({ type: "none" });
  });

  it("bare g (no modifier) matches nothing - see the alt+g case below for the bound chord", () => {
    expect(matchSnapshotKeyEvent(key({ key: "g" }))).toEqual({ type: "none" });
  });
});

describe("matchSnapshotKeyEvent - the Alt+G chord (Ruling N14-8, N14 WAVE 1)", () => {
  it("alt+g arms next student, the same match type bare n produces", () => {
    expect(matchSnapshotKeyEvent(key({ key: "g", altKey: true }))).toEqual({ type: "arm-next-student" });
  });

  it("ctrl+alt+g (AltGr on a non-US layout) matches nothing - exclusive Alt only", () => {
    expect(matchSnapshotKeyEvent(key({ key: "g", altKey: true, ctrlKey: true }))).toEqual({ type: "none" });
  });

  it("meta+alt+g matches nothing - exclusive Alt only", () => {
    expect(matchSnapshotKeyEvent(key({ key: "g", altKey: true, metaKey: true }))).toEqual({ type: "none" });
  });

  it("a repeating alt+g matches nothing (Ruling N14-7 still applies to chords)", () => {
    expect(matchSnapshotKeyEvent(key({ key: "g", altKey: true, repeat: true }))).toEqual({ type: "none" });
  });
});

describe("matchSnapshotKeyEvent - the Alt+R chord (Ruling N14-8, N14 WAVE 2)", () => {
  it("alt+r captures the rubric", () => {
    expect(matchSnapshotKeyEvent(key({ key: "r", altKey: true }))).toEqual({ type: "capture-rubric" });
  });

  it("ctrl+alt+r (AltGr on a non-US layout) matches nothing - exclusive Alt only", () => {
    expect(matchSnapshotKeyEvent(key({ key: "r", altKey: true, ctrlKey: true }))).toEqual({ type: "none" });
  });

  it("meta+alt+r matches nothing - exclusive Alt only", () => {
    expect(matchSnapshotKeyEvent(key({ key: "r", altKey: true, metaKey: true }))).toEqual({ type: "none" });
  });

  it("a repeating alt+r matches nothing (Ruling N14-7 still applies to chords)", () => {
    expect(matchSnapshotKeyEvent(key({ key: "r", altKey: true, repeat: true }))).toEqual({ type: "none" });
  });

  it("bare r (no modifier) matches nothing - r is never a bare binding, only the Alt+R chord", () => {
    expect(matchSnapshotKeyEvent(key({ key: "r" }))).toEqual({ type: "none" });
  });
});

describe("matchSnapshotKeyEvent - the modifier defect fix", () => {
  it("ctrl+s matches nothing", () => {
    expect(matchSnapshotKeyEvent(key({ key: "s", ctrlKey: true }))).toEqual({ type: "none" });
  });

  it("alt+s matches nothing", () => {
    expect(matchSnapshotKeyEvent(key({ key: "s", altKey: true }))).toEqual({ type: "none" });
  });

  it("meta+s matches nothing", () => {
    expect(matchSnapshotKeyEvent(key({ key: "s", metaKey: true }))).toEqual({ type: "none" });
  });

  it("ctrl+1 matches nothing", () => {
    expect(matchSnapshotKeyEvent(key({ key: "1", ctrlKey: true }))).toEqual({ type: "none" });
  });

  it("alt+n matches nothing", () => {
    expect(matchSnapshotKeyEvent(key({ key: "n", altKey: true }))).toEqual({ type: "none" });
  });

  it("alt+s matches nothing - Alt+S was struck (scratchpad/n14-architecture.md section 0); bare s stays the only snap binding", () => {
    expect(matchSnapshotKeyEvent(key({ key: "s", altKey: true }))).toEqual({ type: "none" });
  });

  it("shift alone does not block a bare binding (deliberate, see snapshot-keys.ts comment)", () => {
    expect(matchSnapshotKeyEvent(key({ key: "s", shiftKey: true }))).toEqual({ type: "snap" });
    expect(matchSnapshotKeyEvent(key({ key: "S", shiftKey: true }))).toEqual({ type: "snap" });
  });

  // Verifier residual (n14-wave0-verify.md section 4): only ctrl+1 was
  // covered among the modifier-by-digit combinations. Cover the full
  // product of (ctrl, alt, meta) x a representative digit set so a future
  // regression that special-cased only one modifier or one digit cannot
  // slip through undetected.
  it.each([
    { name: "ctrl+1", digit: "1", ctrlKey: true },
    { name: "ctrl+6", digit: "6", ctrlKey: true },
    { name: "alt+1", digit: "1", altKey: true },
    { name: "alt+6", digit: "6", altKey: true },
    { name: "meta+1", digit: "1", metaKey: true },
    { name: "meta+6", digit: "6", metaKey: true },
  ])("$name matches nothing", ({ digit, ctrlKey, altKey, metaKey }) => {
    expect(
      matchSnapshotKeyEvent(
        key({ key: digit, ctrlKey: !!ctrlKey, altKey: !!altKey, metaKey: !!metaKey }),
      ),
    ).toEqual({ type: "none" });
  });
});

describe("matchSnapshotKeyEvent - the key-repeat guard (Ruling N14-7)", () => {
  it("a repeating s matches nothing", () => {
    expect(matchSnapshotKeyEvent(key({ key: "s", repeat: true }))).toEqual({ type: "none" });
  });

  it("a repeating n matches nothing", () => {
    expect(matchSnapshotKeyEvent(key({ key: "n", repeat: true }))).toEqual({ type: "none" });
  });

  it("a repeating digit matches nothing", () => {
    expect(matchSnapshotKeyEvent(key({ key: "1", repeat: true }))).toEqual({ type: "none" });
  });

  it("a non-repeating keystroke is unaffected by the repeat guard", () => {
    expect(matchSnapshotKeyEvent(key({ key: "s", repeat: false }))).toEqual({ type: "snap" });
  });
});

describe("isSnapshotShortcutEligible", () => {
  const allClear = { isActive: true, isInsideEditableTarget: false, isModalOpen: false };

  it("is eligible when active, not in an editable target, and no modal is open", () => {
    expect(isSnapshotShortcutEligible(allClear)).toBe(true);
  });

  it("is not eligible when inactive", () => {
    expect(isSnapshotShortcutEligible({ ...allClear, isActive: false })).toBe(false);
  });

  it("is not eligible inside an editable target", () => {
    expect(isSnapshotShortcutEligible({ ...allClear, isInsideEditableTarget: true })).toBe(false);
  });

  it("is not eligible while a modal is open", () => {
    expect(isSnapshotShortcutEligible({ ...allClear, isModalOpen: true })).toBe(false);
  });
});
