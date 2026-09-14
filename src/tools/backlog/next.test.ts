import { describe, it, expect } from "vitest";
import { selectNext } from "./next";
import type { BacklogItem } from "./types";

function item(overrides: Partial<BacklogItem> = {}): BacklogItem {
  return {
    id: "X1",
    state: "actionable",
    title: "t",
    owns: [],
    verify: null,
    blocked_by: [],
    instrument: "",
    from: "",
    note: "",
    ...overrides,
  };
}

describe("selectNext", () => {
  it("returns the lowest-id scoped, unblocked actionable item", () => {
    const items = [
      item({ id: "A2", owns: ["src/b.ts"], verify: "npx vitest run src/b.test.ts" }),
      item({ id: "A1", owns: ["src/a.ts"], verify: "npx vitest run src/a.test.ts" }),
    ];
    const result = selectNext(items);
    expect(result).toEqual({ type: "actionable", item: items[1] });
  });

  it("skips a blocked item and returns the next unblocked one", () => {
    const blocker = item({ id: "V1", state: "verification" });
    const blocked = item({ id: "A1", owns: ["src/a.ts"], verify: "cmd", blocked_by: ["V1"] });
    const ready = item({ id: "A2", owns: ["src/b.ts"], verify: "cmd" });
    const result = selectNext([blocker, blocked, ready]);
    expect(result).toEqual({ type: "actionable", item: ready });
  });

  it("treats a blocker id that no longer appears in the list as resolved (closing deletes, per Ruling BA-8)", () => {
    const nowReady = item({ id: "A1", owns: ["src/a.ts"], verify: "cmd", blocked_by: ["V1"] });
    const result = selectNext([nowReady]);
    expect(result).toEqual({ type: "actionable", item: nowReady });
  });

  // Blocker B2 / Ruling BA-3: a selector that drops what it cannot classify
  // must never report the same "empty" shape as "there is truly nothing
  // owed." This is the direct regression test for that failure mode: a
  // queue full of real, unscoped work must come back distinguishable from a
  // genuinely empty queue.
  it("returns an explicit unscoped result naming the count, never a bare empty, when nothing is scoped", () => {
    const items = [
      item({ id: "N1", state: "unscoped", owns: [], verify: null }),
      item({ id: "N2", state: "unscoped", owns: [], verify: null }),
      item({ id: "V1", state: "verification" }),
      item({ id: "D1", state: "owner" }),
    ];
    const result = selectNext(items);
    expect(result).toEqual({ type: "unscoped", count: 2 });
  });

  it("counts an actionable-state item missing owns/verify toward the unscoped count too", () => {
    const items = [item({ id: "A1", state: "actionable", owns: [], verify: null })];
    expect(selectNext(items)).toEqual({ type: "unscoped", count: 1 });
  });

  it("returns an explicit empty result naming which items are blocked, when everything scoped is blocked", () => {
    const blocker = item({ id: "V1", state: "verification" });
    const blocked = item({ id: "A1", owns: ["src/a.ts"], verify: "cmd", blocked_by: ["V1"] });
    const result = selectNext([blocker, blocked]);
    expect(result.type).toBe("empty");
    if (result.type === "empty") {
      expect(result.reason).toMatch(/A1/);
      expect(result.reason).toMatch(/blocked/);
    }
  });

  it("returns an explicit empty result with owner/verification counts when the queue is genuinely drained of agent work", () => {
    const items = [item({ id: "V1", state: "verification" }), item({ id: "D1", state: "owner" })];
    const result = selectNext(items);
    expect(result.type).toBe("empty");
    if (result.type === "empty") {
      expect(result.reason).toMatch(/1 owner-gated/);
      expect(result.reason).toMatch(/1 verification-gated/);
    }
  });

  it("returns an empty result (not a crash) for a genuinely empty backlog", () => {
    const result = selectNext([]);
    expect(result.type).toBe("empty");
  });

  it("is deterministic across repeated calls on the same input", () => {
    const items = [
      item({ id: "A2", owns: ["src/b.ts"], verify: "cmd" }),
      item({ id: "A1", owns: ["src/a.ts"], verify: "cmd" }),
    ];
    expect(selectNext(items)).toEqual(selectNext(items));
  });
});
