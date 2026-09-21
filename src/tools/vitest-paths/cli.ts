// The `test:paths` wrapper's command-line entry point. Run via the
// `npm run test:paths <p1> <p2> ...` script in package.json, or directly:
//   node --experimental-strip-types --experimental-default-type=module \
//     --experimental-loader ./src/tools/backlog/resolve-ts-hook.ts \
//     src/tools/vitest-paths/cli.ts <paths...>
// (the loader is reused unchanged from src/tools/backlog/resolve-ts-hook.ts -
// it is directory-agnostic and resolves any extensionless relative import
// under Node's type-stripping, not just its own directory's).
//
// `dispatch` is the pure, testable core: it takes argv plus injected
// dependencies and returns a {exitCode, lines} decision rather than touching
// process.exit/console/fs/child_process directly, so cli.test.ts can drive
// every branch - including a signal-killed child (P12) and the flag-refusal
// path (P4) - with a spy, never a real subprocess. `main` is the thin,
// untested-by-design shell that wires it to the real world; cli.e2e.test.ts
// exercises that real wiring end to end (P1-P3).

import { existsSync, readFileSync, rmSync, statSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { decide, defaultReportPath, preCheckArgs, vitestArgv, type GateDecision, type PathKind } from "./paths-gate";

export interface PathsCliDeps {
  root: string;
  probe: (p: string) => PathKind | null;
  runVitest: (argv: string[]) => number | null;
  newReportPath: () => string;
  readReport: (p: string) => unknown;
  removeReport: (p: string) => void;
}

export function dispatch(argv: readonly string[], deps: PathsCliDeps): GateDecision {
  const pre = preCheckArgs(argv, deps.probe);
  if (!pre.ok) {
    return { exitCode: 1, lines: ["PRE-CHECK FAILED", ...pre.problems] };
  }
  const args = Array.from(argv);
  const reportPath = deps.newReportPath();
  let exit: number | null;
  let report: unknown;
  try {
    exit = deps.runVitest(vitestArgv(args, reportPath));
    report = deps.readReport(reportPath);
  } finally {
    deps.removeReport(reportPath);
  }
  return decide(args, pre.kinds, exit, report, deps.root);
}

function realDeps(): PathsCliDeps {
  const root = process.cwd();
  const vitestBin = resolve(root, "node_modules/vitest/vitest.mjs");
  return {
    root,
    probe: (p) => {
      const abs = resolve(root, p);
      if (!existsSync(abs)) return null;
      return statSync(abs).isDirectory() ? "dir" : "file";
    },
    runVitest: (argv) => spawnSync(process.execPath, [vitestBin, ...argv], { stdio: "inherit", cwd: root }).status,
    newReportPath: () => defaultReportPath(process.pid, String(Date.now())),
    readReport: (p) => {
      try {
        return JSON.parse(readFileSync(p, "utf-8")) as unknown;
      } catch {
        return undefined;
      }
    },
    removeReport: (p) => rmSync(p, { force: true }),
  };
}

function main(): void {
  const argv = process.argv.slice(2);
  const result = dispatch(argv, realDeps());
  for (const line of result.lines) process.stdout.write(`${line}\n`);
  process.exitCode = result.exitCode;
}

// Only run as a side-effecting CLI when this file is the process entry point
// - importing it (from cli.test.ts or cli.e2e.test.ts) must never run main()
// or touch the real filesystem. Mirrors src/tools/backlog/cli.ts's own guard.
const isEntryPoint = process.argv[1] !== undefined && import.meta.url === pathToFileURL(process.argv[1]).href;
if (isEntryPoint) {
  main();
}
