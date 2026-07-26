// Regression coverage for parseDayTime's day tokenizer.
//
// Bug: the tokenizer matched at most ONE day code per whitespace-separated
// token, so concatenated forms like "MW", "MWF", "TTh", "TR" - the app's own
// dayTime placeholder is "MW 10:00-11:15" - silently kept only the first day.
//
// Fix: try a full spelled-out day-name match (first three letters) before
// falling back to scanning the token for concatenated codes two-then-one
// characters at a time. The full-name check must run FIRST: a naive scan
// alone breaks "FRI", whose R would otherwise be read as Thursday.
import { describe, it, expect, vi } from "vitest";

vi.mock("@/app/actions", () => ({
  listCourseContentAction: vi.fn(),
  listCourseHubAction: vi.fn(),
  getDeckTemplateAction: vi.fn(),
}));

import { parseDayTime } from "./registry-helpers";

// Every case below appends a fixed, unambiguous time so parseDayTime's
// require-both-day-and-time short-circuit does not return null before the
// days Set can be inspected. The time itself is verified separately below.
const TIME_SUFFIX = " 9:00am";

describe("parseDayTime - day tokenizer", () => {
  describe("concatenated forms (the bug: used to keep only the first day per token)", () => {
    it("MW -> Monday, Wednesday", () => {
      expect(parseDayTime(`MW${TIME_SUFFIX}`)?.days).toEqual(new Set([1, 3]));
    });

    it("MWF -> Monday, Wednesday, Friday", () => {
      expect(parseDayTime(`MWF${TIME_SUFFIX}`)?.days).toEqual(new Set([1, 3, 5]));
    });

    it("TTh -> Tuesday, Thursday", () => {
      expect(parseDayTime(`TTh${TIME_SUFFIX}`)?.days).toEqual(new Set([2, 4]));
    });

    it("TR -> Tuesday, Thursday (registrar shorthand)", () => {
      expect(parseDayTime(`TR${TIME_SUFFIX}`)?.days).toEqual(new Set([2, 4]));
    });

    it("MTWRF -> Monday through Friday", () => {
      expect(parseDayTime(`MTWRF${TIME_SUFFIX}`)?.days).toEqual(new Set([1, 2, 3, 4, 5]));
    });

    it("SU -> Sunday", () => {
      expect(parseDayTime(`SU${TIME_SUFFIX}`)?.days).toEqual(new Set([0]));
    });

    it("SA -> Saturday", () => {
      expect(parseDayTime(`SA${TIME_SUFFIX}`)?.days).toEqual(new Set([6]));
    });

    it("TuTh -> Tuesday, Thursday", () => {
      expect(parseDayTime(`TuTh${TIME_SUFFIX}`)?.days).toEqual(new Set([2, 4]));
    });

    it("the app's own dayTime placeholder ('MW 10:00-11:15') parses both days", () => {
      expect(parseDayTime("MW 10:00-11:15")?.days).toEqual(new Set([1, 3]));
    });
  });

  describe("spelled-out forms (the trap: FRI must not pick up Thursday from its R)", () => {
    it("Mon Wed Fri -> Monday, Wednesday, Friday", () => {
      expect(parseDayTime(`Mon Wed Fri${TIME_SUFFIX}`)?.days).toEqual(new Set([1, 3, 5]));
    });

    it("FRI -> Friday only, NOT Thursday", () => {
      const result = parseDayTime(`FRI${TIME_SUFFIX}`);
      expect(result?.days).toEqual(new Set([5]));
      expect(result?.days.has(4)).toBe(false);
    });

    it("Tuesday Thursday -> Tuesday, Thursday", () => {
      expect(parseDayTime(`Tuesday Thursday${TIME_SUFFIX}`)?.days).toEqual(new Set([2, 4]));
    });

    it("Thursday -> Thursday only, NOT Tuesday+Thursday", () => {
      const result = parseDayTime(`Thursday${TIME_SUFFIX}`);
      expect(result?.days).toEqual(new Set([4]));
      expect(result?.days).not.toEqual(new Set([2, 4]));
    });
  });

  describe("separator forms (already worked - must still work)", () => {
    it("M/W/F -> Monday, Wednesday, Friday", () => {
      expect(parseDayTime(`M/W/F${TIME_SUFFIX}`)?.days).toEqual(new Set([1, 3, 5]));
    });

    it("M, W, F -> Monday, Wednesday, Friday", () => {
      expect(parseDayTime(`M, W, F${TIME_SUFFIX}`)?.days).toEqual(new Set([1, 3, 5]));
    });
  });
});

describe("parseDayTime - time parsing (unchanged)", () => {
  it("MW 10:00-11:15 still yields hour 10, minute 0", () => {
    const result = parseDayTime("MW 10:00-11:15");
    expect(result?.hour).toBe(10);
    expect(result?.minute).toBe(0);
  });

  it("applies the documented hour <= 7 with no meridiem -> PM rule", () => {
    const result = parseDayTime("MW 2:00");
    expect(result?.hour).toBe(14);
    expect(result?.minute).toBe(0);
  });

  it("leaves hour unchanged when > 7 with no meridiem", () => {
    expect(parseDayTime("MW 9:00")?.hour).toBe(9);
  });

  it("returns null when no day token matches", () => {
    expect(parseDayTime("10:00am")).toBeNull();
  });

  it("returns null for an out-of-range time", () => {
    expect(parseDayTime("MW 25:00")).toBeNull();
  });
});
