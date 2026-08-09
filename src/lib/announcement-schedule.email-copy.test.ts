// TDD contract for resolveAnnouncementEmailCopy -
// docs/weekly-announcement-package-io-acceptance-criteria.md, AC4 items
// 24-29 (in particular item 26: for a Canvas target the choice is never
// honored, verified against Canvas's own discussion-topic create endpoint,
// which accepts no notification parameter at all).
//
// The expectation table below is a FROZEN LITERAL - every expected object is
// typed out by hand, never computed from resolveAnnouncementEmailCopy
// itself, so a change to the implementation that quietly changes behavior
// shows up as a failing assertion rather than being invisible because both
// sides moved together.
import { describe, it, expect } from "vitest";
import { resolveAnnouncementEmailCopy } from "@/lib/announcement-schedule";

const CANVAS_NOTE =
  "Canvas has no per-announcement email setting - students are notified by their own Canvas notification preferences when each week posts.";

type Expected = { value: boolean | null; honored: boolean; note: string };

// lms x choice -> expected result. Every non-Canvas lms (including "" and an
// unrecognized string) shares the same three choice outcomes; Canvas always
// returns the same fixed result regardless of choice.
const NON_CANVAS_BY_CHOICE: Record<"" | "1" | "0", Expected> = {
  "": {
    value: null,
    honored: true,
    note: "Recorded: students are notified by their own LMS notification settings.",
  },
  "1": {
    value: true,
    honored: true,
    note: "Recorded: students will be emailed a copy of each announcement.",
  },
  "0": {
    value: false,
    honored: true,
    note: "Recorded: students will not be emailed a copy of each announcement.",
  },
};

const CANVAS_RESULT: Expected = {
  value: null,
  honored: false,
  note: CANVAS_NOTE,
};

// The full LMS x choice matrix, spelled out as a frozen literal table -
// no loops over NON_CANVAS_BY_CHOICE to build it, so nothing here is
// "computed from the implementation" even indirectly.
const MATRIX: Array<{ lms: string; choice: "" | "1" | "0"; expected: Expected }> = [
  // canvas - honored: false, value: null, fixed note, for every choice
  { lms: "canvas", choice: "", expected: CANVAS_RESULT },
  { lms: "canvas", choice: "1", expected: CANVAS_RESULT },
  { lms: "canvas", choice: "0", expected: CANVAS_RESULT },

  // blackboard - honored: true, value reflects choice
  {
    lms: "blackboard",
    choice: "",
    expected: {
      value: null,
      honored: true,
      note: "Recorded: students are notified by their own LMS notification settings.",
    },
  },
  {
    lms: "blackboard",
    choice: "1",
    expected: {
      value: true,
      honored: true,
      note: "Recorded: students will be emailed a copy of each announcement.",
    },
  },
  {
    lms: "blackboard",
    choice: "0",
    expected: {
      value: false,
      honored: true,
      note: "Recorded: students will not be emailed a copy of each announcement.",
    },
  },

  // brightspace - honored: true, value reflects choice
  {
    lms: "brightspace",
    choice: "",
    expected: {
      value: null,
      honored: true,
      note: "Recorded: students are notified by their own LMS notification settings.",
    },
  },
  {
    lms: "brightspace",
    choice: "1",
    expected: {
      value: true,
      honored: true,
      note: "Recorded: students will be emailed a copy of each announcement.",
    },
  },
  {
    lms: "brightspace",
    choice: "0",
    expected: {
      value: false,
      honored: true,
      note: "Recorded: students will not be emailed a copy of each announcement.",
    },
  },

  // "" (unknown/unresolved lms) - honored: true, value reflects choice
  {
    lms: "",
    choice: "",
    expected: {
      value: null,
      honored: true,
      note: "Recorded: students are notified by their own LMS notification settings.",
    },
  },
  {
    lms: "",
    choice: "1",
    expected: {
      value: true,
      honored: true,
      note: "Recorded: students will be emailed a copy of each announcement.",
    },
  },
  {
    lms: "",
    choice: "0",
    expected: {
      value: false,
      honored: true,
      note: "Recorded: students will not be emailed a copy of each announcement.",
    },
  },

  // "unknown-lms" - an unrecognized lms string is treated the same as any
  // other non-Canvas target - honored: true, value reflects choice
  {
    lms: "unknown-lms",
    choice: "",
    expected: {
      value: null,
      honored: true,
      note: "Recorded: students are notified by their own LMS notification settings.",
    },
  },
  {
    lms: "unknown-lms",
    choice: "1",
    expected: {
      value: true,
      honored: true,
      note: "Recorded: students will be emailed a copy of each announcement.",
    },
  },
  {
    lms: "unknown-lms",
    choice: "0",
    expected: {
      value: false,
      honored: true,
      note: "Recorded: students will not be emailed a copy of each announcement.",
    },
  },
];

describe("resolveAnnouncementEmailCopy", () => {
  describe("the full lms x choice matrix (frozen literal expectations)", () => {
    for (const { lms, choice, expected } of MATRIX) {
      it(`lms=${JSON.stringify(lms)} choice=${JSON.stringify(choice)}`, () => {
        expect(resolveAnnouncementEmailCopy(lms, choice)).toEqual(expected);
      });
    }
  });

  describe("NON_CANVAS_BY_CHOICE is consistent with the matrix above", () => {
    // Sanity check that the two hand-written literal tables in this file
    // agree with each other, so a typo in one is caught by the other.
    it("matches the matrix's blackboard row for every choice", () => {
      expect(NON_CANVAS_BY_CHOICE[""]).toEqual(MATRIX.find((m) => m.lms === "blackboard" && m.choice === "")!.expected);
      expect(NON_CANVAS_BY_CHOICE["1"]).toEqual(MATRIX.find((m) => m.lms === "blackboard" && m.choice === "1")!.expected);
      expect(NON_CANVAS_BY_CHOICE["0"]).toEqual(MATRIX.find((m) => m.lms === "blackboard" && m.choice === "0")!.expected);
    });
  });

  describe("whitespace and case tolerance", () => {
    it("trims and lowercases lms, and trims choice - '  Canvas  ' / ' 1 ' still resolves as Canvas", () => {
      expect(resolveAnnouncementEmailCopy("  Canvas  ", " 1 ")).toEqual(CANVAS_RESULT);
    });

    it("trims and lowercases lms, and trims choice - '  Blackboard  ' / ' 1 ' still honors the choice", () => {
      expect(resolveAnnouncementEmailCopy("  Blackboard  ", " 1 ")).toEqual({
        value: true,
        honored: true,
        note: "Recorded: students will be emailed a copy of each announcement.",
      });
    });

    it("trims choice '  0  ' against a non-Canvas lms", () => {
      expect(resolveAnnouncementEmailCopy("brightspace", "  0  ")).toEqual({
        value: false,
        honored: true,
        note: "Recorded: students will not be emailed a copy of each announcement.",
      });
    });
  });

  describe("unrecognized choice falls back to \"\"", () => {
    it("an arbitrary unrecognized string is treated the same as choice=''", () => {
      expect(resolveAnnouncementEmailCopy("blackboard", "yes")).toEqual({
        value: null,
        honored: true,
        note: "Recorded: students are notified by their own LMS notification settings.",
      });
    });

    it("an unrecognized choice against Canvas still returns the fixed Canvas result", () => {
      expect(resolveAnnouncementEmailCopy("canvas", "maybe")).toEqual(CANVAS_RESULT);
    });
  });

  describe("the Canvas note is asserted as an exact string literal", () => {
    it("matches AC4 item 26's exact wording", () => {
      expect(resolveAnnouncementEmailCopy("canvas", "1").note).toBe(
        "Canvas has no per-announcement email setting - students are notified by their own Canvas notification preferences when each week posts."
      );
    });
  });
});
