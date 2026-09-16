import { describe, it, expect } from "vitest";
import { selectWave } from "./wave";
import type { BacklogItem } from "./types";

function item(overrides: Partial<BacklogItem> = {}): BacklogItem {
  return {
    id: "X1",
    state: "actionable",
    kind: "chore",
    area: "loop-and-docs-maintenance",
    title: "t",
    owns: ["src/x.ts"],
    verify: "cmd",
    blocked_by: [],
    instrument: "",
    from: "",
    note: "",
    ...overrides,
  };
}

describe("selectWave", () => {
  it("returns a wave of 2-3 items whose owns do not intersect", () => {
    const a = item({ id: "A1", owns: ["src/a/*"] });
    const b = item({ id: "A2", owns: ["src/b/*"] });
    const c = item({ id: "A3", owns: ["src/c/*"] });
    const result = selectWave([a, b, c]);
    expect(result.type).toBe("wave");
    if (result.type === "wave") {
      expect(result.items.map((i) => i.id)).toEqual(["A1", "A2", "A3"]);
    }
  });

  it("caps a wave at 3 even when more non-intersecting items are ready", () => {
    const items = ["A1", "A2", "A3", "A4"].map((id, i) => item({ id, owns: [`src/${String(i)}/*`] }));
    const result = selectWave(items);
    expect(result.type).toBe("wave");
    if (result.type === "wave") {
      expect(result.items).toHaveLength(3);
    }
  });

  // The mutant this test kills: two items whose globs DO intersect must
  // never both land in the same wave. Here A1 and A2 intersect (A2's glob is
  // a subdirectory of A1's), so the wave must be built from A1 + A3 instead
  // of A1 + A2 - or, since that then leaves only two, the wave must skip A2
  // entirely and never seat it alongside A1.
  it("excludes an item whose owns intersects an item already in the wave", () => {
    const a1 = item({ id: "A1", owns: ["src/shared/*"] });
    const a2 = item({ id: "A2", owns: ["src/shared/sub/*"] }); // intersects A1
    const a3 = item({ id: "A3", owns: ["src/other/*"] });
    const result = selectWave([a1, a2, a3]);
    expect(result.type).toBe("wave");
    if (result.type === "wave") {
      const ids = result.items.map((i) => i.id);
      expect(ids).toContain("A1");
      expect(ids).not.toContain("A2");
      expect(ids).toContain("A3");
    }
  });

  it("returns an explicit insufficient result, not a silent empty wave, when fewer than 2 items are ready", () => {
    const result = selectWave([item({ id: "A1" })]);
    expect(result).toEqual({ type: "insufficient", reason: expect.stringContaining("only 1"), readyCount: 1 });
  });

  it("returns an explicit insufficient result when every ready item intersects the first", () => {
    const a1 = item({ id: "A1", owns: ["src/shared/*"] });
    const a2 = item({ id: "A2", owns: ["src/shared/sub/*"] });
    const result = selectWave([a1, a2]);
    expect(result.type).toBe("insufficient");
    if (result.type === "insufficient") {
      expect(result.readyCount).toBe(2);
    }
  });

  it("excludes blocked and unscoped items from the pool", () => {
    const blocker = item({ id: "V1", state: "verification" });
    const blocked = item({ id: "A1", owns: ["src/a/*"], blocked_by: ["V1"] });
    const unscoped = item({ id: "A2", owns: [], verify: null });
    const ready = item({ id: "A3", owns: ["src/c/*"] });
    const result = selectWave([blocker, blocked, unscoped, ready]);
    expect(result.type).toBe("insufficient");
    if (result.type === "insufficient") {
      expect(result.readyCount).toBe(1);
    }
  });

  it("is deterministic across repeated calls on the same input", () => {
    const items = [item({ id: "A1", owns: ["src/a/*"] }), item({ id: "A2", owns: ["src/b/*"] })];
    expect(selectWave(items)).toEqual(selectWave(items));
  });
});
