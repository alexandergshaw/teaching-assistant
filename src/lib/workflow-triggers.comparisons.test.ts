import { describe, it, expect } from "vitest";
import {
  decideCountRise,
  decideThresholdEdge,
  decideBrokenLinks,
} from "@/lib/workflow-triggers";
import type { Json } from "./supabase/types";

describe("decideCountRise", () => {
  it("first eval sets the baseline and does not fire", () => {
    const d = decideCountRise(null, 5);
    expect(d.fired).toBe(false);
    expect(d.cursor).toEqual({ count: 5 });
  });

  it("fires when the current count is higher than last seen", () => {
    const d = decideCountRise({ count: 5 } as unknown as Json, 8);
    expect(d.fired).toBe(true);
    expect(d.cursor).toEqual({ count: 8 });
  });

  it("does not fire when the count is equal", () => {
    const d = decideCountRise({ count: 5 } as unknown as Json, 5);
    expect(d.fired).toBe(false);
    expect(d.cursor).toEqual({ count: 5 });
  });

  it("does not fire when the count is lower", () => {
    const d = decideCountRise({ count: 5 } as unknown as Json, 3);
    expect(d.fired).toBe(false);
    expect(d.cursor).toEqual({ count: 3 });
  });

  it("fires again after a drop and then a rise", () => {
    const dropped = decideCountRise({ count: 5 } as unknown as Json, 2);
    expect(dropped.fired).toBe(false);
    const risen = decideCountRise(dropped.cursor, 4);
    expect(risen.fired).toBe(true);
    expect(risen.cursor).toEqual({ count: 4 });
  });
});

describe("decideThresholdEdge", () => {
  it("first eval never fires and records the above flag", () => {
    const d = decideThresholdEdge(null, 3, 5);
    expect(d.fired).toBe(false);
    expect(d.cursor).toEqual({ above: false });
  });

  it("fires on the rising edge across the threshold", () => {
    const base = decideThresholdEdge(null, 3, 5);
    const d = decideThresholdEdge(base.cursor, 6, 5);
    expect(d.fired).toBe(true);
    expect(d.cursor).toEqual({ above: true });
  });

  it("does not fire again while staying above", () => {
    const d = decideThresholdEdge({ above: true } as unknown as Json, 9, 5);
    expect(d.fired).toBe(false);
    expect(d.cursor).toEqual({ above: true });
  });

  it("fires again after dropping below and rising again", () => {
    const droppedBelow = decideThresholdEdge({ above: true } as unknown as Json, 2, 5);
    expect(droppedBelow.fired).toBe(false);
    expect(droppedBelow.cursor).toEqual({ above: false });
    const risen = decideThresholdEdge(droppedBelow.cursor, 7, 5);
    expect(risen.fired).toBe(true);
    expect(risen.cursor).toEqual({ above: true });
  });

  it("treats an exactly-equal value as at-or-above", () => {
    const d = decideThresholdEdge({ above: false } as unknown as Json, 5, 5);
    expect(d.fired).toBe(true);
    expect(d.cursor).toEqual({ above: true });
  });
});

describe("decideBrokenLinks", () => {
  it("first eval records a baseline and does not fire", () => {
    const d = decideBrokenLinks(null, 3);
    expect(d.fired).toBe(false);
    expect(d.cursor).toEqual({ broken: 3 });
  });

  it("fires when the broken count rises", () => {
    const d = decideBrokenLinks({ broken: 3 } as unknown as Json, 5);
    expect(d.fired).toBe(true);
    expect(d.cursor).toEqual({ broken: 5 });
  });

  it("does not fire when the count is equal or lower", () => {
    const equal = decideBrokenLinks({ broken: 5 } as unknown as Json, 5);
    expect(equal.fired).toBe(false);
    const lower = decideBrokenLinks({ broken: 5 } as unknown as Json, 2);
    expect(lower.fired).toBe(false);
  });
});
