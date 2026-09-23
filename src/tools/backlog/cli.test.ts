import { describe, it, expect } from "vitest";
import { dispatch } from "./cli";
import { serializeBacklogYaml } from "./yaml-codec";
import { renderBacklogMarkdown } from "./render";
import type { BacklogItem } from "./types";

const scopedItem: BacklogItem = {
  id: "A1",
  state: "actionable",
  kind: "chore",
  area: "loop-and-docs-maintenance",
  title: "Do the thing",
  owns: ["src/a.ts"],
  verify: "npx vitest run src/a.test.ts",
  blocked_by: [],
  instrument: "",
  from: "",
  note: "",
};
const unscopedItem: BacklogItem = { ...scopedItem, id: "N1", state: "unscoped", owns: [], verify: null };

function deps(items: BacklogItem[], markdownOverride?: string) {
  const yamlText = serializeBacklogYaml(items);
  return {
    readYaml: () => yamlText,
    readMarkdown: () => markdownOverride ?? renderBacklogMarkdown(items),
  };
}

describe("cli dispatch", () => {
  it("render exits 0 and prints the fresh markdown", () => {
    const result = dispatch(["render"], deps([scopedItem]));
    expect(result.exitCode).toBe(0);
    expect(result.output).toBe(renderBacklogMarkdown([scopedItem]));
  });

  it("check-generated exits 0 when the markdown is current", () => {
    const result = dispatch(["check-generated"], deps([scopedItem]));
    expect(result.exitCode).toBe(0);
  });

  it("check-generated exits non-zero when the markdown is stale", () => {
    const result = dispatch(["check-generated"], deps([scopedItem], "# stale\n"));
    expect(result.exitCode).not.toBe(0);
  });

  it("next exits 0 and names the item when one is ready", () => {
    const result = dispatch(["next"], deps([scopedItem]));
    expect(result.exitCode).toBe(0);
    expect(result.output).toContain("A1");
  });

  it("next exits a distinct non-zero code for the unscoped result, never silently empty", () => {
    const result = dispatch(["next"], deps([unscopedItem]));
    expect(result.exitCode).toBe(2);
    expect(result.output).toMatch(/unscoped: 1/);
  });

  it("next exits a distinct non-zero code for the empty-drained result", () => {
    const result = dispatch(["next"], deps([]));
    expect(result.exitCode).toBe(3);
    expect(result.output).toMatch(/empty:/);
  });

  it("wave exits 0 and lists items when a wave is available", () => {
    const b1 = { ...scopedItem, id: "A2", owns: ["src/b.ts"] };
    const result = dispatch(["wave"], deps([scopedItem, b1]));
    expect(result.exitCode).toBe(0);
    expect(result.output).toContain("A1");
    expect(result.output).toContain("A2");
  });

  it("wave exits non-zero and explains itself when no wave can be formed", () => {
    const result = dispatch(["wave"], deps([scopedItem]));
    expect(result.exitCode).toBe(3);
    expect(result.output).toMatch(/insufficient:/);
  });

  it("an unknown command exits a distinct non-zero code naming the valid commands", () => {
    const result = dispatch(["bogus"], deps([]));
    expect(result.exitCode).toBe(64);
    expect(result.output).toMatch(/render, check-generated, next, wave/);
  });

  // Duplicate ids (Ruling BA-4) must block every selector, not just be a
  // theoretical property of ids.ts - this proves the CLI actually checks
  // before render/next/wave trust the parsed list.
  it("render refuses to proceed when the yaml has duplicate ids", () => {
    const dup = { ...scopedItem, id: "A1" };
    const result = dispatch(["render"], deps([scopedItem, dup]));
    expect(result.exitCode).not.toBe(0);
    expect(result.output).toMatch(/duplicate/);
  });

  it("next refuses to proceed when the yaml has duplicate ids", () => {
    const dup = { ...scopedItem, id: "A1" };
    const result = dispatch(["next"], deps([scopedItem, dup]));
    expect(result.exitCode).not.toBe(0);
    expect(result.output).toMatch(/duplicate/);
  });

  it("is deterministic across repeated calls on the same input", () => {
    const d = deps([scopedItem]);
    expect(dispatch(["next"], d)).toEqual(dispatch(["next"], d));
  });

  describe("stop-guard shipped-but-uncited check", () => {
    const uncitedItem: BacklogItem = { ...scopedItem, id: "A30", state: "unscoped", owns: [], verify: null };
    const workCommit = {
      hash: "832e9d3",
      subject: "fix(a30): route the per-cell path",
      files: ["src/lib/grade/x.ts"],
    };

    function depsWithCommits(items: BacklogItem[], commits: (typeof workCommit)[]) {
      return { ...deps(items), readWorkCommits: () => ({ commits, warning: null }) };
    }

    // MUTANT: drop this branch entirely (or drop shippedButUncited's call).
    // This is the row this whole guard exists for.
    it("blocks when a code commit names an uncited row", () => {
      const result = dispatch(["stop-guard"], depsWithCommits([uncitedItem], [workCommit]));
      expect(result.exitCode).toBe(2);
      expect(result.output).toContain("A30");
      expect(result.output).toContain("832e9d3");
    });

    it("does not block once the row cites the hash", () => {
      const cited = { ...uncitedItem, note: "Shipped at 832e9d3." };
      const result = dispatch(["stop-guard"], depsWithCommits([cited], [workCommit]));
      expect(result.exitCode).toBe(0);
    });

    // MUTANT: ignore stopHookActive/overrideRequested for this check. Both
    // escapes must be honoured exactly like the existing actionable check.
    it("does not block a second time in the same turn (--stop-hook-active)", () => {
      const result = dispatch(["stop-guard", "--stop-hook-active"], depsWithCommits([uncitedItem], [workCommit]));
      expect(result.exitCode).toBe(0);
    });

    it("does not block on an explicit override", () => {
      const result = dispatch(["stop-guard", "--override"], depsWithCommits([uncitedItem], [workCommit]));
      expect(result.exitCode).toBe(0);
    });

    // Fail-open: when the dep is not wired at all (mirrors a caller that
    // never reaches for git), the check must be silently skipped and the
    // command must fall through to its unchanged existing behaviour.
    it("falls through to the existing unscoped message when readWorkCommits is not provided", () => {
      const result = dispatch(["stop-guard"], deps([uncitedItem]));
      expect(result.exitCode).toBe(0);
      expect(result.output).toMatch(/unscoped/);
    });

    // Existing behaviour, unchanged: no flags and an actionable item still
    // blocks via decideStopGuard exactly as before this guard was added.
    it("still blocks on the existing actionable-item guard when there is nothing to flag", () => {
      const result = dispatch(["stop-guard"], depsWithCommits([scopedItem], []));
      expect(result.exitCode).toBe(2);
      expect(result.output).toContain("A1");
    });

    it("still exits 0 with the documented unscoped message when nothing is actionable or flagged", () => {
      const result = dispatch(["stop-guard"], depsWithCommits([uncitedItem], []));
      expect(result.exitCode).toBe(0);
      expect(result.output).toContain("no actionable item; 1 item(s) are unscoped");
    });
  });
});
