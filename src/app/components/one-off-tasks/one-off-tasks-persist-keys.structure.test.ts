// Persisted-control keys for the One-Off Tasks component directory: the known
// ta- keys are each read AND written, and the key set is frozen so a rename or
// an unrecorded new key fails here. A source scan cannot prove every control
// has a key (an unpersisted control is the absence of a literal); that half is
// a review/browser-walk residual.
import { describe, it, expect } from "vitest";
import fs from "node:fs";
import path from "node:path";

const DIR = path.join(process.cwd(), "src", "app", "components", "one-off-tasks");

const KEY_RE = /ta-one-off-[a-z-]+/g;
const FROZEN_KEYS = new Set([
  "ta-one-off-college-filter",
  "ta-one-off-draft",
  "ta-one-off-status-filter",
]);

function dirSource(): string {
  return fs
    .readdirSync(DIR)
    .filter((n) => /\.tsx?$/.test(n) && !n.includes(".test."))
    .map((n) => fs.readFileSync(path.join(DIR, n), "utf8"))
    .join("\n");
}

function distinctKeys(source: string): Set<string> {
  return new Set(source.match(KEY_RE) ?? []);
}

/** The constant that holds `key`, e.g. COLLEGE_FILTER_KEY for the college key. */
function constantFor(source: string, key: string): string | null {
  const m = new RegExp(`const\\s+([A-Z_]+)\\s*=\\s*"${key}"`).exec(source);
  return m ? m[1] : null;
}

function isReadAndWritten(source: string, key: string): { read: boolean; write: boolean } {
  const name = constantFor(source, key);
  if (!name) return { read: false, write: false };
  return {
    read: new RegExp(`(?:readKey|getItem)\\s*\\(\\s*${name}\\b`).test(source),
    write: new RegExp(`(?:writeKey|setItem)\\s*\\(\\s*${name}\\b`).test(source),
  };
}

describe("one-off-tasks persisted-control keys", () => {
  const source = dirSource();

  it("scans a non-empty source and the extractor fires on a fixture (dead-scan canary)", () => {
    expect(distinctKeys(source).size).toBeGreaterThan(0);
    expect([...distinctKeys('const K = "ta-one-off-x-y";')]).toEqual(["ta-one-off-x-y"]);
    expect(constantFor('const K_KEY = "ta-one-off-x";', "ta-one-off-x")).toBe("K_KEY");
  });

  it("college filter key is read and written", () => {
    expect(isReadAndWritten(source, "ta-one-off-college-filter")).toEqual({
      read: true,
      write: true,
    });
  });

  it("status filter key is read and written", () => {
    expect(isReadAndWritten(source, "ta-one-off-status-filter")).toEqual({
      read: true,
      write: true,
    });
  });

  it("composer draft key is read and written", () => {
    expect(isReadAndWritten(source, "ta-one-off-draft")).toEqual({ read: true, write: true });
  });

  it("the key set is frozen", () => {
    expect(distinctKeys(source)).toEqual(FROZEN_KEYS);
  });
});
