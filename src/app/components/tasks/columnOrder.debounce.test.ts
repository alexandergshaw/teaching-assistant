// Additional coverage beyond the TDD suite (columnOrder.test.ts), for the
// items docs/tasks-column-reorder-acceptance-criteria.md's "Tests still
// owed" section calls out as node-testable but not yet covered.
//
// Item 19: the AC5 100ms announcement debounce, extracted as debounceElapsed
// specifically so it CAN be tested here - the AC document is explicit that
// inlining this logic into the component would make it unverifiable.
import { describe, it, expect } from "vitest";
import { debounceElapsed } from "./columnOrder";

describe("debounceElapsed", () => {
  it("allows the very first announcement immediately (no prior flush)", () => {
    expect(debounceElapsed(null, 1000)).toBe(true);
  });

  it("blocks an announcement inside the 100ms window", () => {
    expect(debounceElapsed(1000, 1050)).toBe(false);
    expect(debounceElapsed(1000, 1099)).toBe(false);
  });

  it("allows an announcement exactly at the 100ms boundary and beyond", () => {
    expect(debounceElapsed(1000, 1100)).toBe(true);
    expect(debounceElapsed(1000, 1500)).toBe(true);
  });

  it("respects a custom interval", () => {
    expect(debounceElapsed(1000, 1010, 20)).toBe(false);
    expect(debounceElapsed(1000, 1020, 20)).toBe(true);
  });

  it("never throws for a nowMs earlier than lastFlushMs (clock skew)", () => {
    expect(() => debounceElapsed(2000, 1000)).not.toThrow();
    expect(debounceElapsed(2000, 1000)).toBe(false);
  });
});
