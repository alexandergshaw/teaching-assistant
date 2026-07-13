import { describe, it, expect } from "vitest";
import { parseLmsModuleValue, liveModuleValue, exportModuleValue } from "./module-value";

describe("parseLmsModuleValue", () => {
  it("parses live id|name values", () => {
    expect(parseLmsModuleValue(liveModuleValue(123, "Module 01: Intro"))).toEqual({
      liveId: "123",
      name: "Module 01: Intro",
      fromExport: false,
    });
  });

  it("parses export|name values", () => {
    expect(parseLmsModuleValue(exportModuleValue("Module 02: Data"))).toEqual({
      liveId: null,
      name: "Module 02: Data",
      fromExport: true,
    });
  });

  it("treats legacy bare ids as live ids without a name", () => {
    expect(parseLmsModuleValue("4567")).toEqual({ liveId: "4567", name: null, fromExport: false });
  });

  it("keeps pipes inside module names intact", () => {
    expect(parseLmsModuleValue("9|Week 3 | Loops").name).toBe("Week 3 | Loops");
  });

  it("handles empty input", () => {
    expect(parseLmsModuleValue("  ")).toEqual({ liveId: null, name: null, fromExport: false });
  });
});
