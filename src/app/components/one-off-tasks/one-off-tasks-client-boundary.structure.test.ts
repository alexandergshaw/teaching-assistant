// The One-Off Tasks component directory reaches the database only through the
// server actions. No file here may import src/lib/supabase/* or the supabase
// client package, or construct a client.
import { describe, it, expect } from "vitest";
import fs from "node:fs";
import path from "node:path";

const DIR = path.join(process.cwd(), "src", "app", "components", "one-off-tasks");

const BAD_IMPORT = /^\s*(?:import|export)\b[^;]*?from\s*["'](?:@\/lib\/supabase\/|@supabase\/supabase-js|(?:\.\.?\/)+lib\/supabase\/)/;
const BAD_CLIENT_CALL = /\b(?:createClient|createBrowserClient|createServiceClient)\s*\(/;

function listSources(): string[] {
  return fs
    .readdirSync(DIR)
    .filter((n) => /\.tsx?$/.test(n) && !n.includes(".test."))
    .map((n) => path.join(DIR, n));
}

function violations(source: string): string[] {
  const out: string[] = [];
  for (const line of source.split(/\r?\n/)) {
    if (BAD_IMPORT.test(line)) out.push(line.trim());
    if (BAD_CLIENT_CALL.test(line)) out.push(line.trim());
  }
  return out;
}

describe("one-off-tasks client/DB boundary", () => {
  it("scans a non-empty set of files", () => {
    expect(listSources().length).toBeGreaterThan(0);
  });

  it("the matcher fires on a known-bad fixture (dead-scan canary)", () => {
    expect(violations('import { x } from "@/lib/supabase/one-off-tasks";').length).toBe(1);
    expect(violations("const c = createClient(url, key);").length).toBe(1);
  });

  it("no component-dir file imports supabase or builds a client", () => {
    const found: Record<string, string[]> = {};
    for (const file of listSources()) {
      const v = violations(fs.readFileSync(file, "utf8"));
      if (v.length > 0) found[path.basename(file)] = v;
    }
    expect(found).toEqual({});
  });
});
