import { describe, expect, it } from "vitest";
import { claimIntake, releaseIntake, resetIntake } from "./intakeFence";

describe("shared submission fence", () => {
  it("invalidates a hung operation on reset without letting its late completion unlock newer work", () => {
    const fence = { busy: false, generation: 0 };
    const old = claimIntake(fence)!;
    expect(claimIntake(fence)).toBeNull();
    resetIntake(fence);
    const current = claimIntake(fence)!;
    expect(releaseIntake(fence, old)).toBe(false);
    expect(fence.busy).toBe(true);
    expect(releaseIntake(fence, current)).toBe(true);
    expect(fence.busy).toBe(false);
  });
});
