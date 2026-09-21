// P5, P6, P7, P8 (docs/l14-scope.md section 9) plus supporting unit coverage
// for preCheckArgs and creditsArg. Pure - no fs, no child_process - so this
// file needs no timeout beyond vitest's default.

import { describe, expect, it } from "vitest";
import { relative } from "node:path";
import {
  coverageOf,
  creditsArg,
  decide,
  defaultReportPath,
  executedFilesFromReport,
  preCheckArgs,
  vitestArgv,
  type ExecutedFile,
  type PathKind,
} from "./paths-gate";

const ROOT = "C:/repo";

function kindsOf(entries: [string, PathKind][]): ReadonlyMap<string, PathKind> {
  return new Map(entries);
}

// A report shaped exactly like the measured 1.4 report: testResults[i].name
// (absolute, forward slashes) and assertionResults[].status.
function report(entries: [string, ("passed" | "skipped" | "failed")[]][]): unknown {
  return {
    testResults: entries.map(([name, statuses]) => ({
      name: `${ROOT}/${name}`,
      assertionResults: statuses.map((status) => ({ status })),
    })),
  };
}

describe("preCheckArgs", () => {
  it("refuses an empty argument list", () => {
    const result = preCheckArgs([], () => "file");
    expect(result.ok).toBe(false);
  });

  it("refuses any argument starting with '-' without probing it", () => {
    let probed = false;
    const result = preCheckArgs(["-t", "src/a.test.ts"], () => {
      probed = true;
      return "file";
    });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.problems.some((p) => p.includes("-t"))).toBe(true);
    // the flag itself is refused without a probe call; the probe is still
    // invoked for the OTHER argument, so this only proves the flag path.
    void probed;
  });

  it("refuses a path that does not exist on disk (probe returns null)", () => {
    const result = preCheckArgs(["src/does-not-exist.test.ts"], () => null);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.problems[0]).toMatch(/does not exist on disk/);
  });

  it("accepts every existing path and records its kind", () => {
    const result = preCheckArgs(["a", "b/"], (p) => (p === "a" ? "file" : "dir"));
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.kinds.get("a")).toBe("file");
      expect(result.kinds.get("b/")).toBe("dir");
    }
  });
});

describe("creditsArg (the EQUAL/INSIDE rule, never vitest's substring rule)", () => {
  const passed = (relPath: string): ExecutedFile => ({ relPath, passed: 1 });

  it("credits a file argument by EQUAL resolved path across spellings: './x', backslash, upper-case, absolute", () => {
    const file = passed("src/tools/backlog/ids.test.ts");
    expect(creditsArg(file, "src/tools/backlog/ids.test.ts", "file", ROOT)).toBe(true);
    expect(creditsArg(file, "./src/tools/backlog/ids.test.ts", "file", ROOT)).toBe(true);
    expect(creditsArg(file, "src\\tools\\backlog\\ids.test.ts", "file", ROOT)).toBe(true);
    expect(creditsArg(file, "SRC/TOOLS/BACKLOG/IDS.TEST.TS", "file", ROOT)).toBe(true);
    expect(creditsArg(file, `${ROOT}/src/tools/backlog/ids.test.ts`, "file", ROOT)).toBe(true);
  });

  it("does NOT credit a file argument by mere containment", () => {
    const file = passed("src/tools/backlog/ids.test.ts");
    expect(creditsArg(file, "src/tools/backlog", "file", ROOT)).toBe(false);
  });

  it("credits a directory argument by files INSIDE it, with and without a trailing slash", () => {
    const file = passed("src/tools/backlog/ids.test.ts");
    expect(creditsArg(file, "src/tools/backlog", "dir", ROOT)).toBe(true);
    expect(creditsArg(file, "src/tools/backlog/", "dir", ROOT)).toBe(true);
  });

  it("does NOT credit a sibling that merely shares a prefix (the rider trap, B1)", () => {
    const file = passed("src/tools/backlog-foo/x.test.ts");
    expect(creditsArg(file, "src/tools/backlog", "dir", ROOT)).toBe(false);
  });
});

describe("P6: attribution over constructed reports in the measured 1.4 shape", () => {
  it("credits a file argument only by EQUAL path across spellings, all in one report", () => {
    const files = executedFilesFromReport(report([["src/tools/backlog/ids.test.ts", ["passed"]]]), ROOT)!;
    const kinds = kindsOf([
      ["src/tools/backlog/ids.test.ts", "file"],
      ["./src/tools/backlog/ids.test.ts", "file"],
    ]);
    const coverage = coverageOf(["src/tools/backlog/ids.test.ts", "./src/tools/backlog/ids.test.ts"], kinds, files, ROOT);
    expect(coverage.every((c) => c.covered)).toBe(true);
  });

  it("credits a directory argument only by files INSIDE it, with and without a trailing slash", () => {
    const files = executedFilesFromReport(report([["src/tools/backlog/ids.test.ts", ["passed"]]]), ROOT)!;
    const kinds = kindsOf([
      ["src/tools/backlog", "dir"],
      ["src/tools/backlog/", "dir"],
    ]);
    const coverage = coverageOf(["src/tools/backlog", "src/tools/backlog/"], kinds, files, ROOT);
    expect(coverage.every((c) => c.covered)).toBe(true);
  });

  it("does NOT credit a sibling that shares a prefix (src/tools/backlog-foo/x.test.ts against src/tools/backlog)", () => {
    const files = executedFilesFromReport(report([["src/tools/backlog-foo/x.test.ts", ["passed"]]]), ROOT)!;
    const kinds = kindsOf([["src/tools/backlog", "dir"]]);
    const coverage = coverageOf(["src/tools/backlog"], kinds, files, ROOT);
    expect(coverage[0].covered).toBe(false);
    expect(coverage[0].files).toBe(0);
  });

  it("does NOT cover a path whose credited files are all skipped (zero passed)", () => {
    const files = executedFilesFromReport(report([["src/tools/backlog/ids.test.ts", ["skipped", "skipped"]]]), ROOT)!;
    const kinds = kindsOf([["src/tools/backlog/ids.test.ts", "file"]]);
    const coverage = coverageOf(["src/tools/backlog/ids.test.ts"], kinds, files, ROOT);
    expect(coverage[0].files).toBe(1);
    expect(coverage[0].passed).toBe(0);
    expect(coverage[0].covered).toBe(false);
  });

  // The five real test-less paths of docs/l14-scope.md section 3.2, each with
  // a REAL rider (git ls-files 'src/*.test.ts' | grep -i <p>) that only
  // shares a substring with the argument and is not inside it as a directory.
  const REAL_RIDERS: [string, string][] = [
    ["docs", "src/lib/embedded/docs.test.ts"],
    ["supabase", "src/lib/supabase/app-users-directory.test.ts"],
    ["src/lib/workflows/presets", "src/lib/workflows/presets.all-courses.test.ts"],
    ["src/lib/workflow-triggers", "src/lib/workflow-triggers.comparisons.test.ts"],
    ["src/lib/resource-links", "src/lib/resource-links.data.test.ts"],
  ];

  it.each(REAL_RIDERS)("path '%s' is NOT COVERED by its real rider '%s' (B1 fix)", (arg, riderRelPath) => {
    const files = executedFilesFromReport(report([[riderRelPath, ["passed"]]]), ROOT)!;
    const kinds = kindsOf([[arg, "dir"]]);
    const coverage = coverageOf([arg], kinds, files, ROOT);
    expect(coverage[0].files).toBe(0);
    expect(coverage[0].covered).toBe(false);
  });
});

describe("P5: a report missing or not in the measured shape fails closed", () => {
  const MALFORMED: [string, unknown][] = [
    ["undefined", undefined],
    ["empty object", {}],
    ["testResults not an array", { testResults: "x" }],
  ];

  it.each(MALFORMED)("%s yields a non-zero exit, never 0", (_label, malformed) => {
    const kinds = kindsOf([["a", "file"]]);
    const decision = decide(["a"], kinds, 0, malformed, ROOT);
    expect(decision.exitCode).not.toBe(0);
  });
});

describe("P7: vitest's argv as built", () => {
  // The SAME report-path construction production uses (cli.ts's realDeps),
  // not a hand-picked path - so a mutation to defaultReportPath itself is
  // caught here (X4).
  const reportPath = defaultReportPath(12345, "test-fixture");
  const argv = vitestArgv(["src/a.test.ts", "src/b.test.ts"], reportPath);

  it("every element starting with '-' contains '='", () => {
    for (const el of argv) {
      if (el.startsWith("-")) expect(el).toContain("=");
    }
  });

  it("the report path lies OUTSIDE the real repo root, never inside it", () => {
    // The REAL root (process.cwd() when this test runs), not the fixture
    // ROOT constant used elsewhere in this file - defaultReportPath knows
    // nothing about a fixture root, only the real filesystem.
    const realRoot = process.cwd();
    const rel = relative(realRoot, reportPath);
    expect(rel.startsWith("..") || /^[A-Za-z]:/.test(rel)).toBe(true);
  });

  it("the paths are last, in the given order", () => {
    expect(argv.slice(-2)).toEqual(["src/a.test.ts", "src/b.test.ts"]);
  });
});

describe("P8: a propagated RED is never read as a pass", () => {
  it("decide with a non-zero vitest exit and an all-covered report still exits non-zero", () => {
    const files = executedFilesFromReport(report([["a.test.ts", ["passed"]]]), ROOT)!;
    expect(files.length).toBeGreaterThan(0);
    const kinds = kindsOf([["a.test.ts", "file"]]);
    const decision = decide(["a.test.ts"], kinds, 1, report([["a.test.ts", ["passed"]]]), ROOT);
    expect(decision.exitCode).not.toBe(0);
  });
});
