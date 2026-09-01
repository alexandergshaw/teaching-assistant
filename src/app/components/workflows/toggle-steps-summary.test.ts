import { describe, it, expect } from "vitest";
import { describeStepsToggle } from "./toggle-steps-summary";

describe("describeStepsToggle", () => {
  it("reads 'Steps (none)' for a workflow with zero steps", () => {
    expect(describeStepsToggle([])).toBe("Steps (none)");
  });

  it("names every enabled step when there are 3 or fewer", () => {
    expect(
      describeStepsToggle([
        { name: "Fetch grades", enabled: true },
        { name: "Draft feedback", enabled: true },
      ])
    ).toBe("Steps (2/2 enabled: Fetch grades, Draft feedback)");
  });

  it("never names a disabled step - it will not run", () => {
    expect(
      describeStepsToggle([
        { name: "Fetch grades", enabled: true },
        { name: "Post to Canvas", enabled: false },
      ])
    ).toBe("Steps (1/2 enabled: Fetch grades)");
  });

  it("caps named steps at 3 and counts the remainder", () => {
    expect(
      describeStepsToggle([
        { name: "A", enabled: true },
        { name: "B", enabled: true },
        { name: "C", enabled: true },
        { name: "D", enabled: true },
        { name: "E", enabled: true },
      ])
    ).toBe("Steps (5/5 enabled: A, B, C, +2 more)");
  });

  it("reads '0/N enabled' with no names when every step is disabled", () => {
    expect(
      describeStepsToggle([
        { name: "Fetch grades", enabled: false },
        { name: "Post to Canvas", enabled: false },
      ])
    ).toBe("Steps (0/2 enabled)");
  });
});
