// P4 and P12 (docs/l14-scope.md section 9), moved here from paths-gate.test.ts
// (m4) because they are about `dispatch` deciding WHETHER TO SPAWN vitest at
// all, not about the pure attribution logic. Every dependency is a spy or a
// stub - no fs, no child_process - so this file needs no timeout beyond
// vitest's default. `cli.e2e.test.ts` is the file that spawns a real
// subprocess (P1-P3).

import { describe, expect, it, vi } from "vitest";
import { dispatch, type PathsCliDeps } from "./cli";
import type { PathKind } from "./paths-gate";

function baseDeps(overrides: Partial<PathsCliDeps> = {}): PathsCliDeps {
  return {
    root: "C:/repo",
    probe: () => "file" as PathKind,
    runVitest: () => 0,
    newReportPath: () => "C:/temp/report.json",
    readReport: () => ({ testResults: [] }),
    removeReport: () => undefined,
    ...overrides,
  };
}

describe("P4: an argument starting with '-' never reaches vitest", () => {
  it("does not call runVitest, and the decision is never exit 0", () => {
    const runVitest = vi.fn(() => 0);
    const decision = dispatch(["-t", "src/a.test.ts"], baseDeps({ runVitest, probe: () => "file" }));
    expect(runVitest).not.toHaveBeenCalled();
    expect(decision.exitCode).not.toBe(0);
  });

  it("a bare flag with no other argument also never spawns vitest", () => {
    const runVitest = vi.fn(() => 0);
    const decision = dispatch(["--json"], baseDeps({ runVitest }));
    expect(runVitest).not.toHaveBeenCalled();
    expect(decision.exitCode).not.toBe(0);
  });
});

describe("P12: a signal-killed vitest child (null exit) is never exit 0", () => {
  it("is exit non-zero even when the report looks fully covered", () => {
    const decision = dispatch(
      ["src/a.test.ts"],
      baseDeps({
        probe: () => "file",
        runVitest: () => null,
        readReport: () => ({
          testResults: [{ name: "C:/repo/src/a.test.ts", assertionResults: [{ status: "passed" }] }],
        }),
      })
    );
    expect(decision.exitCode).not.toBe(0);
  });
});

describe("dispatch: the report is always removed, even when reading it throws", () => {
  it("calls removeReport exactly once whether the report read succeeds or fails", () => {
    const removeReport = vi.fn();
    expect(() =>
      dispatch(
        ["src/a.test.ts"],
        baseDeps({
          probe: () => "file",
          readReport: () => {
            throw new Error("boom");
          },
          removeReport,
        })
      )
    ).toThrow("boom");
    expect(removeReport).toHaveBeenCalledTimes(1);
  });
});

describe("dispatch: a clean pass reaches vitest exactly once with the given paths", () => {
  it("calls runVitest with the paths appended to vitest's argv", () => {
    // Typed with the real runVitest signature, so .mock.calls is a typed
    // tuple array (`[string[]][]`) rather than the untyped `() => number`
    // inference vitest falls back to - that inference makes each call an
    // empty tuple `[]`, which is what made `.mock.calls[0][0]` a type error
    // in the first place, not just a runtime risk.
    const runVitest = vi.fn<(argv: string[]) => number | null>(() => 0);
    dispatch(
      ["src/a.test.ts", "src/b.test.ts"],
      baseDeps({
        probe: () => "file",
        runVitest,
        readReport: () => ({
          testResults: [
            { name: "C:/repo/src/a.test.ts", assertionResults: [{ status: "passed" }] },
            { name: "C:/repo/src/b.test.ts", assertionResults: [{ status: "passed" }] },
          ],
        }),
      })
    );
    expect(runVitest).toHaveBeenCalledTimes(1);
    // Destructure rather than index-and-cast: if the call never happened,
    // `firstCall` is `undefined` and `argv` falls back to `[]`, which then
    // fails the assertion below loudly instead of throwing on a cast or a
    // non-null assertion.
    const [firstCall] = runVitest.mock.calls;
    const argv = firstCall?.[0] ?? [];
    expect(argv.slice(-2)).toEqual(["src/a.test.ts", "src/b.test.ts"]);
  });
});
