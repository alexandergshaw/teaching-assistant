import { describe, it, expect } from "vitest";
import { decideStopGuard } from "./stop-guard";
import type { BacklogItem } from "./types";

function item(over: Partial<BacklogItem> & { id: string }): BacklogItem {
  return {
    id: over.id,
    state: over.state ?? "actionable",
    kind: over.kind ?? "chore",
    area: over.area ?? "loop-and-docs-maintenance",
    title: over.title ?? "t",
    owns: over.owns ?? ["src/x.ts"],
    verify: over.verify ?? "npx vitest run src/x.test.ts",
    blocked_by: over.blocked_by ?? [],
    instrument: over.instrument ?? "",
    from: over.from ?? "",
    note: over.note ?? "",
  } as BacklogItem;
}

const base = { stopHookActive: false, overrideRequested: false };

describe("decideStopGuard", () => {
  // MUTANT: make the actionable branch return "allow". This is THE test - the
  // whole guard exists for this one case, and a guard that allows here is the
  // discipline it was built to replace.
  it("BLOCKS when an actionable item remains", () => {
    const d = decideStopGuard({ ...base, items: [item({ id: "A1" })] });
    expect(d.decision).toBe("block");
    expect(d.reason).toContain("A1");
  });

  // MUTANT: drop the verify from the reason. A block that does not tell the
  // agent what "done" means invites a guess.
  it("names the item's closure test in the block reason", () => {
    const d = decideStopGuard({
      ...base,
      items: [item({ id: "A1", verify: "npx vitest run src/thing.test.ts" })],
    });
    expect(d.reason).toContain("npx vitest run src/thing.test.ts");
  });

  // MUTANT: remove the stopHookActive escape. Without it the guard blocks
  // forever and the session cannot end - strictly worse than no guard.
  it("ALLOWS when it has already blocked once this turn, even with work left", () => {
    const d = decideStopGuard({
      ...base,
      stopHookActive: true,
      items: [item({ id: "A1" })],
    });
    expect(d.decision).toBe("allow");
    expect(d.reason).toContain("already blocked");
  });

  // MUTANT: remove the override escape. The owner must always be able to stop.
  it("ALLOWS on an explicit owner override, even with work left", () => {
    const d = decideStopGuard({
      ...base,
      overrideRequested: true,
      items: [item({ id: "A1" })],
    });
    expect(d.decision).toBe("allow");
  });

  // MUTANT: treat unscoped as actionable. Unscoped items cannot be started -
  // blocking on them would trap the session on work nobody can pick up, and
  // would pressure an agent into fabricating a verify command to escape.
  it("ALLOWS when every item is unscoped, and says how many", () => {
    const d = decideStopGuard({
      ...base,
      items: [item({ id: "U1", state: "unscoped", owns: [], verify: null })],
    });
    expect(d.decision).toBe("allow");
    expect(d.reason).toContain("1");
  });

  // MUTANT: ignore `state` and block on any item. Owner-gated items are
  // listed so they are not forgotten, NEVER so they are picked up - blocking
  // on them is the "reclassify a blocked item to keep moving" failure.
  it("ALLOWS when only owner-gated items remain", () => {
    const d = decideStopGuard({
      ...base,
      items: [
        item({ id: "V1", state: "verification", owns: [], verify: null }),
        item({ id: "D1", state: "owner", owns: [], verify: null }),
      ],
    });
    expect(d.decision).toBe("allow");
  });

  // MUTANT: ignore blocked_by. An item whose blocker is still present is not
  // startable, so blocking on it traps the session exactly as unscoped would.
  it("ALLOWS when the only actionable item is blocked by a present item", () => {
    const d = decideStopGuard({
      ...base,
      items: [
        item({ id: "A1", blocked_by: ["V1"] }),
        item({ id: "V1", state: "verification", owns: [], verify: null }),
      ],
    });
    expect(d.decision).toBe("allow");
  });

  it("ALLOWS on an empty queue", () => {
    const d = decideStopGuard({ ...base, items: [] });
    expect(d.decision).toBe("allow");
  });
});
