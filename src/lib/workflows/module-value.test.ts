import { describe, it, expect } from "vitest";
import {
  parseLmsModuleValue,
  liveModuleValue,
  exportModuleValue,
  nameModuleValue,
  findModuleByNumber,
  extractModuleNumber,
} from "./module-value";

describe("parseLmsModuleValue", () => {
  it("parses live id|name values", () => {
    expect(parseLmsModuleValue(liveModuleValue(123, "Module 01: Intro"))).toEqual({
      liveId: "123",
      name: "Module 01: Intro",
      fromExport: false,
      byName: false,
    });
  });

  it("parses export|name values", () => {
    expect(parseLmsModuleValue(exportModuleValue("Module 02: Data"))).toEqual({
      liveId: null,
      name: "Module 02: Data",
      fromExport: true,
      byName: false,
    });
  });

  it("treats legacy bare ids as live ids without a name", () => {
    expect(parseLmsModuleValue("4567")).toEqual({ liveId: "4567", name: null, fromExport: false, byName: false });
  });

  it("keeps pipes inside module names intact", () => {
    expect(parseLmsModuleValue("9|Week 3 | Loops").name).toBe("Week 3 | Loops");
  });

  it("handles empty input", () => {
    expect(parseLmsModuleValue("  ")).toEqual({ liveId: null, name: null, fromExport: false, byName: false });
  });

  it("parses name|name values (source-agnostic name reference)", () => {
    expect(parseLmsModuleValue(nameModuleValue("Module 05: Loops"))).toEqual({
      liveId: null,
      name: "Module 05: Loops",
      fromExport: false,
      byName: true,
    });
  });

  it("keeps pipes inside a name-reference module name intact", () => {
    expect(parseLmsModuleValue(nameModuleValue("Week 3 | Loops"))).toEqual({
      liveId: null,
      name: "Week 3 | Loops",
      fromExport: false,
      byName: true,
    });
  });

});

describe("nameModuleValue", () => {
  it("builds a name| encoded value", () => {
    expect(nameModuleValue("Module 05: Loops")).toBe("name|Module 05: Loops");
  });
});

describe("extractModuleNumber", () => {
  it("extracts the number after a module/week token, case-insensitively", () => {
    expect(extractModuleNumber("Module 07: Algorithms")).toBe(7);
    expect(extractModuleNumber("week 3")).toBe(3);
    expect(extractModuleNumber("MODULE07")).toBe(7);
  });

  it("returns null when there is no module/week token", () => {
    expect(extractModuleNumber("Course Information")).toBeNull();
  });

  it("does not fold 'Module 17' down to 7", () => {
    expect(extractModuleNumber("Module 17")).toBe(17);
  });
});

// A realistic Canvas module list with a leading non-module entry ("Course
// Information") before Module 01 - exactly the shape that shifted every
// positional lookup by one in the reported bug (week 7 read the array's
// seventh element, "Module 06", instead of the module actually named
// "Module 07").
describe("findModuleByNumber", () => {
  const modules = [
    { id: "a", name: "Course Information" },
    { id: "b", name: "Module 01: Getting Started" },
    { id: "c", name: "Module 02" },
    { id: "d", name: "Module 03" },
    { id: "e", name: "Module 04" },
    { id: "f", name: "Module 05" },
    { id: "g", name: "Module 06" },
    { id: "h", name: "Module 07: Algorithms and Data Structures" },
  ];

  it("matches by NUMBER, not by array position - a leading non-module entry must not shift the lookup", () => {
    const found = findModuleByNumber(modules, 7);
    expect(found).toEqual({ id: "h", name: "Module 07: Algorithms and Data Structures" });
    // The bug this guards against: modules[7 - 1] is "Module 06", the
    // seventh array element - never the right answer once a "Course
    // Information" entry sits ahead of Module 01.
    expect(found).not.toEqual(modules[6]);
  });

  it("matches zero-padded numbers", () => {
    expect(findModuleByNumber(modules, 2)).toEqual({ id: "c", name: "Module 02" });
  });

  it("matches unpadded numbers", () => {
    expect(findModuleByNumber([{ id: "x", name: "Module 7" }], 7)).toEqual({ id: "x", name: "Module 7" });
  });

  it("matches a 'Week' prefix instead of 'Module'", () => {
    expect(findModuleByNumber([{ id: "x", name: "Week 7" }], 7)).toEqual({ id: "x", name: "Week 7" });
  });

  it("matches with no separator between the token and the number", () => {
    expect(findModuleByNumber([{ id: "x", name: "Module07" }], 7)).toEqual({ id: "x", name: "Module07" });
  });

  it("matches a name carrying trailing topic text", () => {
    expect(findModuleByNumber([{ id: "x", name: "Module 07: Algorithms and Data Structures" }], 7)).toEqual({
      id: "x",
      name: "Module 07: Algorithms and Data Structures",
    });
  });

  it("returns null when no module matches", () => {
    expect(findModuleByNumber([{ id: "x", name: "Course Information" }], 7)).toBeNull();
  });

  it("does NOT match 'Module 17' or 'Module 70' when the target is 7", () => {
    expect(findModuleByNumber([{ id: "x", name: "Module 17" }], 7)).toBeNull();
    expect(findModuleByNumber([{ id: "y", name: "Module 70" }], 7)).toBeNull();
  });
});
