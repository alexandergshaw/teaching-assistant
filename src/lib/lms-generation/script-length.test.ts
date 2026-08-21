import { describe, expect, it } from "vitest";
import { DEFAULT_SCRIPT_MINUTES, SCRIPT_LENGTH_OPTIONS, resolveScriptMinutes } from "./script-length";

describe("SCRIPT_LENGTH_OPTIONS", () => {
  // THE POINT OF THIS TEST: generateLectureScriptAction REFUSES a length
  // outside the range lecture-script-bounds.ts defines. If an option here
  // ever drifted outside that window, this select would offer a length that
  // fails every time it is picked, through no fault of the instructor.
  it("offers only lengths generateLectureScriptAction actually accepts", () => {
    for (const minutes of SCRIPT_LENGTH_OPTIONS) {
      expect(minutes, `${minutes} minutes`).toBeGreaterThanOrEqual(1);
      expect(minutes, `${minutes} minutes`).toBeLessThanOrEqual(30);
      expect(Number.isInteger(minutes), `${minutes} minutes`).toBe(true);
    }
  });

  it("is ascending and free of duplicates", () => {
    expect([...SCRIPT_LENGTH_OPTIONS]).toEqual([...new Set(SCRIPT_LENGTH_OPTIONS)]);
    expect([...SCRIPT_LENGTH_OPTIONS]).toEqual([...SCRIPT_LENGTH_OPTIONS].sort((a, b) => a - b));
  });

  it("contains the default, so the default is always selectable", () => {
    expect(SCRIPT_LENGTH_OPTIONS).toContain(DEFAULT_SCRIPT_MINUTES);
  });
});

describe("resolveScriptMinutes", () => {
  it("passes through every offered option unchanged", () => {
    for (const minutes of SCRIPT_LENGTH_OPTIONS) {
      expect(resolveScriptMinutes(minutes), `${minutes} as a number`).toBe(minutes);
      expect(resolveScriptMinutes(String(minutes)), `${minutes} as a string`).toBe(minutes);
    }
  });

  it("reads a localStorage-shaped string, including surrounding whitespace", () => {
    expect(resolveScriptMinutes(" 3 ")).toBe(3);
  });

  it("defaults an absent value", () => {
    expect(resolveScriptMinutes(null)).toBe(DEFAULT_SCRIPT_MINUTES);
    expect(resolveScriptMinutes(undefined)).toBe(DEFAULT_SCRIPT_MINUTES);
    expect(resolveScriptMinutes("")).toBe(DEFAULT_SCRIPT_MINUTES);
  });

  it("defaults a value that is IN RANGE but was never an offered option", () => {
    // Membership, not range - the distinction this function exists to make.
    // 7 would sail through the generator's own 1-30 check, so a range test
    // here would pass it through and the select would then render with
    // nothing selected.
    expect(resolveScriptMinutes(7)).toBe(DEFAULT_SCRIPT_MINUTES);
    expect(resolveScriptMinutes("7")).toBe(DEFAULT_SCRIPT_MINUTES);
  });

  it("SELF-HEAL: a value left over from the lecture-length era resolves to the new default", () => {
    // 15 used to be DEFAULT_SCRIPT_MINUTES itself, and 10/15/20/30 used to be
    // offered options, back when this select offered full lecture lengths.
    // None of them survive the re-gear to intro-video lengths, so an
    // instructor's already-stored value must land on the new default rather
    // than rendering an unselectable option - this is the whole reason
    // resolveScriptMinutes is a membership test and not a range test.
    expect(resolveScriptMinutes(15)).toBe(DEFAULT_SCRIPT_MINUTES);
    expect(resolveScriptMinutes("15")).toBe(DEFAULT_SCRIPT_MINUTES);
    expect(resolveScriptMinutes(10)).toBe(DEFAULT_SCRIPT_MINUTES);
    expect(resolveScriptMinutes(20)).toBe(DEFAULT_SCRIPT_MINUTES);
    expect(resolveScriptMinutes(30)).toBe(DEFAULT_SCRIPT_MINUTES);
  });

  it("defaults a value outside the accepted range, rather than sending a doomed request", () => {
    // 50 is the value steps.media.ts used to pass - the one that silently
    // became 5 before the action was fixed to refuse it. This feature
    // resolves it to the default, so the number shown and the number
    // generated always agree and no refusal ever reaches the instructor.
    expect(resolveScriptMinutes(50)).toBe(DEFAULT_SCRIPT_MINUTES);
    expect(resolveScriptMinutes(0)).toBe(DEFAULT_SCRIPT_MINUTES);
    expect(resolveScriptMinutes(-5)).toBe(DEFAULT_SCRIPT_MINUTES);
  });

  it("defaults non-numeric junk instead of propagating NaN", () => {
    expect(resolveScriptMinutes("fifteen")).toBe(DEFAULT_SCRIPT_MINUTES);
    expect(resolveScriptMinutes(Number.NaN)).toBe(DEFAULT_SCRIPT_MINUTES);
    expect(resolveScriptMinutes(Number.POSITIVE_INFINITY)).toBe(DEFAULT_SCRIPT_MINUTES);
    expect(resolveScriptMinutes({})).toBe(DEFAULT_SCRIPT_MINUTES);
    expect(resolveScriptMinutes(true)).toBe(DEFAULT_SCRIPT_MINUTES);
  });

  it("never returns a value the select cannot display", () => {
    const probes: unknown[] = [1, 5, 7, 15, 29, 30, 31, "10", "abc", null, undefined, {}, []];
    for (const probe of probes) {
      expect(SCRIPT_LENGTH_OPTIONS, String(probe)).toContain(resolveScriptMinutes(probe));
    }
  });
});
