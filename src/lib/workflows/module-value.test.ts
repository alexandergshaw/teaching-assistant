import { describe, it, expect } from "vitest";
import { parseLmsModuleValue, liveModuleValue, exportModuleValue, nameModuleValue } from "./module-value";

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
