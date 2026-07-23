import { describe, it, expect } from "vitest";
import {
  decideRosterChanged,
  decideCartridgeDrops,
} from "@/lib/workflow-triggers";

describe("decideRosterChanged", () => {
  it("first eval records a baseline (sig + count) and does not fire", () => {
    const d = decideRosterChanged(null, ["a", "b"]);
    expect(d.fired).toBe(false);
    expect(d.cursor).toEqual({ sig: "a\nb", count: 2 });
  });

  it("is order-independent - the same ids in a different order do not fire", () => {
    const base = decideRosterChanged(null, ["a", "b", "c"]);
    const d = decideRosterChanged(base.cursor, ["c", "a", "b"]);
    expect(d.fired).toBe(false);
    expect(d.cursor).toEqual({ sig: "a\nb\nc", count: 3 });
  });

  it("fires when an id is added", () => {
    const base = decideRosterChanged(null, ["a", "b"]);
    const d = decideRosterChanged(base.cursor, ["a", "b", "c"]);
    expect(d.fired).toBe(true);
    expect(d.cursor).toEqual({ sig: "a\nb\nc", count: 3 });
  });

  it("fires when an id is removed", () => {
    const base = decideRosterChanged(null, ["a", "b", "c"]);
    const d = decideRosterChanged(base.cursor, ["a", "c"]);
    expect(d.fired).toBe(true);
    expect(d.cursor).toEqual({ sig: "a\nc", count: 2 });
  });
});

describe("decideCartridgeDrops", () => {
  it("fires when there are new drops", () => {
    const d = decideCartridgeDrops(null, ["drop-1", "drop-2"]);
    expect(d.fired).toBe(true);
    expect(d.cursor).toEqual({ ids: "drop-1\ndrop-2", count: 2 });
    expect(d.detail).toContain("2 new drop(s) to grade.");
  });

  it("does not fire when the drop list is empty", () => {
    const d = decideCartridgeDrops(null, []);
    expect(d.fired).toBe(false);
    expect(d.cursor).toEqual({ ids: "", count: 0 });
    expect(d.detail).toContain("No new drops.");
  });

  it("has the correct cursor shape with ids and count", () => {
    const d = decideCartridgeDrops(null, ["a", "b", "c"]);
    expect(d.cursor).toEqual({ ids: "a\nb\nc", count: 3 });
  });

  it("sorts ids consistently in the cursor for observability", () => {
    const d1 = decideCartridgeDrops(null, ["z", "a", "m"]);
    const d2 = decideCartridgeDrops(null, ["a", "m", "z"]);
    expect(d1.cursor).toEqual(d2.cursor);
  });
});
