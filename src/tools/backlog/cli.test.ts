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

  describe("touch-dispatch", () => {
    it("exits 0 and calls the injected touch function", () => {
      let touched = false;
      const result = dispatch(["touch-dispatch"], { ...deps([]), touchDispatchMarker: () => { touched = true; } });
      expect(result.exitCode).toBe(0);
      expect(touched).toBe(true);
    });

    it("exits 0 even when no touch function is wired (best-effort, never throws)", () => {
      const result = dispatch(["touch-dispatch"], deps([]));
      expect(result.exitCode).toBe(0);
    });

    it("does not touch the backlog yaml/markdown at all - runs even with a duplicate-id backlog", () => {
      const dup = { ...scopedItem, id: "A1" };
      const d = deps([scopedItem, dup]);
      // Sabotage the reader so a call to it would fail the test loudly.
      const brokenDeps = { ...d, readYaml: () => { throw new Error("touch-dispatch must not read the backlog"); } };
      const result = dispatch(["touch-dispatch"], brokenDeps);
      expect(result.exitCode).toBe(0);
    });
  });

  describe("round-bump / round-status", () => {
    function ledgerDeps(data: Record<string, { round: number; lastIncrementIso: string }> | null, now = "2026-09-23T12:00:00.000Z") {
      let written: typeof data = null;
      const readRoundLedgerState = () =>
        data === null ? ({ kind: "absent" } as const) : ({ kind: "present" as const, data });
      return {
        ...deps([]),
        readRoundLedgerState,
        writeRoundLedgerState: (d: NonNullable<typeof data>) => {
          written = d;
        },
        nowIso: () => now,
        getWritten: () => written,
      };
    }

    it("round-bump exits 0 and reports round 1 from an absent ledger", () => {
      const d = ledgerDeps(null);
      const result = dispatch(["round-bump", "a29-architecture-small"], d);
      expect(result.exitCode).toBe(0);
      expect(result.output).toContain("a29-architecture-small");
      expect(result.output).toContain("1");
    });

    it("round-bump writes the incremented ledger back", () => {
      const d = ledgerDeps(null);
      dispatch(["round-bump", "a1"], d);
      expect(d.getWritten()).toEqual({ a1: { round: 1, lastIncrementIso: "2026-09-23T12:00:00.000Z" } });
    });

    it("round-bump allows round 2", () => {
      const d = ledgerDeps({ a1: { round: 1, lastIncrementIso: "2026-09-22T00:00:00.000Z" } });
      const result = dispatch(["round-bump", "a1"], d);
      expect(result.exitCode).toBe(0);
      expect(result.output).toContain("2");
    });

    it("round-bump BLOCKS (non-zero exit) when the increment would reach round 3", () => {
      const d = ledgerDeps({ a1: { round: 2, lastIncrementIso: "2026-09-22T00:00:00.000Z" } });
      const result = dispatch(["round-bump", "a1"], d);
      expect(result.exitCode).not.toBe(0);
      expect(result.output).toContain("a1");
    });

    it("round-bump does not write the ledger when it blocks", () => {
      const d = ledgerDeps({ a1: { round: 2, lastIncrementIso: "2026-09-22T00:00:00.000Z" } });
      dispatch(["round-bump", "a1"], d);
      expect(d.getWritten()).toBeNull();
    });

    it("round-bump requires an artifact id", () => {
      const result = dispatch(["round-bump"], ledgerDeps(null));
      expect(result.exitCode).not.toBe(0);
    });

    it("round-status reports round 0 for an unrecorded artifact without mutating the ledger", () => {
      const d = ledgerDeps(null);
      const result = dispatch(["round-status", "a1"], d);
      expect(result.exitCode).toBe(0);
      expect(result.output).toContain("a1");
      expect(result.output).toContain("0");
      expect(d.getWritten()).toBeNull();
    });

    it("round-status does not mutate an existing ledger either", () => {
      const d = ledgerDeps({ a1: { round: 2, lastIncrementIso: "2026-09-22T00:00:00.000Z" } });
      dispatch(["round-status", "a1"], d);
      expect(d.getWritten()).toBeNull();
    });

    it("round-status with no artifact id lists every recorded artifact", () => {
      const d = ledgerDeps({
        a1: { round: 1, lastIncrementIso: "2026-09-22T00:00:00.000Z" },
        a2: { round: 2, lastIncrementIso: "2026-09-22T00:00:00.000Z" },
      });
      const result = dispatch(["round-status"], d);
      expect(result.exitCode).toBe(0);
      expect(result.output).toContain("a1");
      expect(result.output).toContain("a2");
    });

    it("round-bump surfaces a warning line when the ledger is unreadable", () => {
      const d = { ...deps([]), readRoundLedgerState: () => ({ kind: "unreadable" as const }), nowIso: () => "2026-09-23T12:00:00.000Z" };
      const result = dispatch(["round-bump", "a1"], d);
      expect(result.exitCode).toBe(0);
      expect(result.output.toLowerCase()).toContain("warning");
    });

    it("an unknown command's message now lists round-bump and round-status too", () => {
      const result = dispatch(["bogus"], deps([]));
      expect(result.output).toMatch(/round-bump, round-status/);
    });
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

  describe("stop-guard dispatch check", () => {
    const noItems = () => deps([]);
    const ABSENT = { kind: "absent" as const };
    const present = (mtimeMs: number) => ({ kind: "present" as const, mtimeMs });

    function depsWithMarkers(dispatch_: typeof ABSENT | ReturnType<typeof present>, lastStop: typeof ABSENT | ReturnType<typeof present>) {
      return {
        ...noItems(),
        readDispatchMarkerState: () => ({ dispatch: dispatch_, lastStop, warning: null }),
        touchStopMarker: () => {},
      };
    }

    // MUTANT: drop the dispatch-guard call (or its block branch) from the
    // stop-guard command entirely. This is the row this whole check exists
    // for - a stop with nothing dispatched since the previous stop.
    it("blocks when no dispatch was recorded since the previous stop (dispatch older than stop)", () => {
      const result = dispatch(["stop-guard"], depsWithMarkers(present(1000), present(2000)));
      expect(result.exitCode).toBe(2);
      expect(result.output).toContain("NO SUBAGENT WAS DISPATCHED");
      expect(result.output).toContain("npm run backlog:touch-dispatch");
    });

    // THE REGRESSION: a stop marker exists (a stop has happened before) and
    // the dispatch marker was never written at all. The bug this replaces
    // treated an absent dispatch marker as "first run" regardless of the
    // stop marker's own state, so this never blocked.
    it("blocks when the stop marker is present and the dispatch marker was never recorded", () => {
      const result = dispatch(["stop-guard"], depsWithMarkers(ABSENT, present(2000)));
      expect(result.exitCode).toBe(2);
      expect(result.output).toContain("NO SUBAGENT WAS DISPATCHED");
    });

    it("does not block when a dispatch was recorded after the previous stop", () => {
      const result = dispatch(["stop-guard"], depsWithMarkers(present(3000), present(2000)));
      expect(result.exitCode).toBe(0);
    });

    it("does not block on first run when neither marker exists", () => {
      const result = dispatch(["stop-guard"], depsWithMarkers(ABSENT, ABSENT));
      expect(result.exitCode).toBe(0);
    });

    // MUTANT: ignore stopHookActive for this check specifically.
    it("does not block a second time in the same turn (--stop-hook-active)", () => {
      const result = dispatch(["stop-guard", "--stop-hook-active"], depsWithMarkers(ABSENT, present(2000)));
      expect(result.exitCode).toBe(0);
    });

    // MUTANT: ignore --override for this check specifically.
    it("does not block on an explicit override", () => {
      const result = dispatch(["stop-guard", "--override"], depsWithMarkers(ABSENT, present(2000)));
      expect(result.exitCode).toBe(0);
    });

    // MUTANT: never call touchStopMarker (or only call it on the allow path).
    // The stop marker must be written every time this command runs.
    it("touches the stop marker even when the dispatch check blocks", () => {
      let touched = false;
      const result = dispatch(["stop-guard"], {
        ...noItems(),
        readDispatchMarkerState: () => ({ dispatch: ABSENT, lastStop: present(2000), warning: null }),
        touchStopMarker: () => { touched = true; },
      });
      expect(result.exitCode).toBe(2);
      expect(touched).toBe(true);
    });

    it("touches the stop marker on an override even though the dispatch check would otherwise block", () => {
      let touched = false;
      const result = dispatch(["stop-guard", "--override"], {
        ...noItems(),
        readDispatchMarkerState: () => ({ dispatch: ABSENT, lastStop: present(2000), warning: null }),
        touchStopMarker: () => { touched = true; },
      });
      expect(result.exitCode).toBe(0);
      expect(touched).toBe(true);
    });

    // MUTANT: touch the stop marker on a --dry-run too (i.e. drop the guard
    // on the call). This is the defect the flag was added for: a diagnostic
    // run that advances the marker makes the NEXT real stop see a stale
    // dispatch marker, so the instrument blocks a turn on state its own
    // observation created.
    it("does NOT touch the stop marker on a --dry-run, while still reporting the same decision", () => {
      let touched = false;
      const result = dispatch(["stop-guard", "--dry-run"], {
        ...noItems(),
        readDispatchMarkerState: () => ({ dispatch: ABSENT, lastStop: present(2000), warning: null }),
        touchStopMarker: () => { touched = true; },
      });
      expect(touched).toBe(false);
      // The DECISION must be unchanged - a dry run that also decided
      // differently would be a second instrument, not a view of this one.
      expect(result.exitCode).toBe(2);
    });

    // Fail-open: when the dep is not wired at all, the check must be
    // silently skipped and the command must fall through unchanged.
    it("falls through to the existing empty-queue message when readDispatchMarkerState is not provided", () => {
      const result = dispatch(["stop-guard"], noItems());
      expect(result.exitCode).toBe(0);
    });
  });
});
