import { describe, it, expect } from "vitest";
import { parseModuleSelection, narrowScheduleToSelection } from "./module-selection";

describe("parseModuleSelection", () => {
  it("blank spec means no narrowing (empty numbers list)", () => {
    expect(parseModuleSelection("")).toEqual({ numbers: [] });
    expect(parseModuleSelection("   ")).toEqual({ numbers: [] });
  });

  it("parses a single module number", () => {
    expect(parseModuleSelection("3")).toEqual({ numbers: [3] });
  });

  it("parses a comma-separated list", () => {
    expect(parseModuleSelection("1,3,5")).toEqual({ numbers: [1, 3, 5] });
  });

  it("parses a range", () => {
    expect(parseModuleSelection("2-4")).toEqual({ numbers: [2, 3, 4] });
  });

  it("parses a mix of numbers and ranges", () => {
    expect(parseModuleSelection("1,3-5,8")).toEqual({ numbers: [1, 3, 4, 5, 8] });
  });

  it("de-duplicates overlapping numbers and ranges", () => {
    expect(parseModuleSelection("1,2-4,3-5")).toEqual({ numbers: [1, 2, 3, 4, 5] });
    expect(parseModuleSelection("3,3,3")).toEqual({ numbers: [3] });
  });

  it("tolerates whitespace around commas, numbers, and dashes", () => {
    expect(parseModuleSelection(" 1 , 3 - 5 , 8 ")).toEqual({ numbers: [1, 3, 4, 5, 8] });
    expect(parseModuleSelection("2 - 4")).toEqual({ numbers: [2, 3, 4] });
  });

  it("always returns numbers sorted ascending regardless of input order", () => {
    expect(parseModuleSelection("5,1,3")).toEqual({ numbers: [1, 3, 5] });
  });

  it("ignores stray blank tokens from trailing/doubled commas", () => {
    expect(parseModuleSelection("1,,3,")).toEqual({ numbers: [1, 3] });
  });

  it("throws on a non-numeric token", () => {
    expect(() => parseModuleSelection("abc")).toThrow(/not a valid module number or range/);
    expect(() => parseModuleSelection("1,abc,3")).toThrow(/"abc"/);
  });

  it("throws on a module number below 1", () => {
    expect(() => parseModuleSelection("0")).toThrow(/module numbers start at 1/);
  });

  it("throws on a descending range", () => {
    expect(() => parseModuleSelection("5-2")).toThrow(/5 comes after 2/);
  });

  it("throws on a range whose bound is below 1", () => {
    expect(() => parseModuleSelection("0-3")).toThrow(/module numbers start at 1/);
  });

  it("throws on a malformed range (non-numeric bound)", () => {
    expect(() => parseModuleSelection("2-x")).toThrow(/not a valid module number or range/);
  });
});

describe("narrowScheduleToSelection", () => {
  const schedule = [
    { week: 1, topic: "Intro" },
    { week: 2, topic: "Basics" },
    { week: 3, topic: "Intermediate" },
    { week: 4, topic: "Advanced" },
  ];

  it("blank selection (empty numbers) returns the schedule unchanged", () => {
    expect(narrowScheduleToSelection(schedule, { numbers: [] })).toBe(schedule);
  });

  it("narrows to a single selected week", () => {
    expect(narrowScheduleToSelection(schedule, { numbers: [3] })).toEqual([
      { week: 3, topic: "Intermediate" },
    ]);
  });

  it("narrows to several selected weeks, preserving schedule order", () => {
    expect(narrowScheduleToSelection(schedule, { numbers: [1, 4] })).toEqual([
      { week: 1, topic: "Intro" },
      { week: 4, topic: "Advanced" },
    ]);
  });

  it("narrows to a contiguous range of weeks", () => {
    expect(narrowScheduleToSelection(schedule, { numbers: [2, 3] })).toEqual([
      { week: 2, topic: "Basics" },
      { week: 3, topic: "Intermediate" },
    ]);
  });

  it("throws, naming the missing module, when a selected week does not exist", () => {
    expect(() => narrowScheduleToSelection(schedule, { numbers: [9] })).toThrow(
      /Module 9 does not exist.*available modules: 1, 2, 3, 4/
    );
  });

  it("throws naming every missing module when several are out of range", () => {
    expect(() => narrowScheduleToSelection(schedule, { numbers: [2, 9, 10] })).toThrow(
      /Modules 9, 10 do not exist/
    );
  });

  it("throws with an empty available-modules list against an empty schedule", () => {
    expect(() => narrowScheduleToSelection([], { numbers: [1] })).toThrow(/available modules: none/);
  });
});
