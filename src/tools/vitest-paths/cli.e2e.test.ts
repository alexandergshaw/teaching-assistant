// P1, P2, P3 (docs/l14-scope.md section 9): real end-to-end runs of the
// wrapper's SURFACE - the exact command string read from package.json's
// "test:paths" script, never a hand-typed duplicate of it (so a future edit
// to that script is exercised here without touching this file). Each spawns
// a real vitest subprocess over the LIGHT fixtures
// `src/tools/backlog/ids.test.ts` (4 tests) and `areas.test.ts` (8 tests) -
// never `src/lib/no-emojis.test.ts`, which walks the whole tree (L15 / P13,
// docs/l14-scope.md section 6).
//
// Every `it` here carries an explicit 30-second timeout: a real vitest
// subprocess under load is exactly the case vitest's own unconfigured
// 5-second default would false-RED (L15).

import { describe, expect, it } from "vitest";
import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const ROOT = process.cwd();

function testPathsCommandArgv(): string[] {
  const pkg = JSON.parse(readFileSync(resolve(ROOT, "package.json"), "utf-8")) as { scripts: Record<string, string> };
  const script = pkg.scripts["test:paths"];
  if (!script) throw new Error('package.json has no "test:paths" script');
  return script.split(/\s+/).filter(Boolean);
}

function runTestPaths(paths: readonly string[]): { status: number | null; combined: string } {
  const argv = testPathsCommandArgv();
  // argv[0] is "node" itself; spawn the rest under this process's own node
  // binary, exactly as `npm run test:paths <paths...>` would resolve it.
  const result = spawnSync(process.execPath, [...argv.slice(1), ...paths], { cwd: ROOT, encoding: "utf-8" });
  return { status: result.status, combined: `${result.stdout ?? ""}${result.stderr ?? ""}` };
}

describe("cli.e2e: the SURFACE, spawned exactly as package.json spells it", () => {
  it(
    "P1: a real file next to a missing one is exit non-zero, never 0 (the c1 repro's danger, closed)",
    () => {
      const { status } = runTestPaths(["src/tools/backlog/ids.test.ts", "src/does-not-exist.test.ts"]);
      expect(status).not.toBe(0);
    },
    30_000
  );

  it(
    "P2: two real, disjoint test files are both COVERED and the run exits 0",
    () => {
      const { status, combined } = runTestPaths(["src/tools/backlog/ids.test.ts", "src/tools/backlog/areas.test.ts"]);
      expect(status).toBe(0);
      expect(combined).toMatch(/COVERED src\/tools\/backlog\/ids\.test\.ts/);
      expect(combined).toMatch(/COVERED src\/tools\/backlog\/areas\.test\.ts/);
      expect(combined).not.toMatch(/NOT COVERED/);
    },
    30_000
  );

  it(
    "P3: a real test file next to an existing non-test file is exit non-zero (the c11 danger, closed)",
    () => {
      const { status, combined } = runTestPaths(["src/tools/backlog/ids.test.ts", "docs/DEV_LOOP.md"]);
      expect(status).not.toBe(0);
      expect(combined).toMatch(/NOT COVERED docs\/DEV_LOOP\.md/);
    },
    30_000
  );
});
