// Green on arrival: nothing unattended calls sendBulkCourseMessageAction today.
// It only fires on a FUTURE unattended caller (workflow step or API route) or a
// namespace import of the actions barrel that would hide the call from this scan.
import { describe, it, expect, vi } from "vitest";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, resolve } from "node:path";

vi.setConfig({ testTimeout: 30_000 });

function walk(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) walk(p, out);
    else if (/\.tsx?$/.test(name) && !/\.test\.tsx?$/.test(name)) out.push(p);
  }
  return out;
}

const root = resolve(process.cwd(), "src");
const workflows = walk(join(root, "lib", "workflows"));
const api = walk(join(root, "app", "api"));

describe("W2-8 no unattended caller", () => {
  it("scans enough files to be non-vacuous", () => {
    expect(workflows.length).toBeGreaterThan(50);
    expect(api.length).toBeGreaterThan(10);
  });
  it("no workflow or api file names the action", () => {
    const hits = [...workflows, ...api].filter((f) =>
      readFileSync(f, "utf8").includes("sendBulkCourseMessageAction")
    );
    expect(hits).toEqual([]);
  });
  it("no file namespace-imports the actions barrel", () => {
    const hits = walk(root).filter((f) =>
      /import\s+\*\s+as\s+\w+\s+from\s+["']@\/app\/actions/.test(readFileSync(f, "utf8"))
    );
    expect(hits).toEqual([]);
  });
});
