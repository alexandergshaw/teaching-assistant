// VIDEO-GRADING W1, O-3 reachability pin (source text, because no component or
// action is rendered here): EVERY call site of classifyGradingUpload has a
// defined "video" handler and ends in the exhaustive assertNeverUploadKind, so
// a video can never fall into a "single, else zip" else-branch. Pins the fact
// and the count, not the spelling.
import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";

const SRC = join(process.cwd(), "src");

/** The five dispatch sites (ops O-3): file -> number of classifyGradingUpload calls in it. */
const SITES: Record<string, number> = {
  "app/actions/grading-chat-intake.ts": 2,
  "app/actions/grading-incremental.ts": 1,
  "app/actions/grading.ts": 1,
  "lib/grade/extraction.ts": 1,
};

function walk(dir: string, out: string[]): void {
  for (const name of readdirSync(dir)) {
    const full = join(dir, name);
    if (statSync(full).isDirectory()) walk(full, out);
    else if (/\.(ts|tsx)$/.test(name) && !/\.test\.tsx?$/.test(name)) out.push(full);
  }
}

function countMatches(text: string, pattern: RegExp): number {
  return (text.match(pattern) ?? []).length;
}

describe("classifyGradingUpload dispatch sites (video)", () => {
  it("no call site exists outside the five known ones (a sixth would be unhandled)", () => {
    const files: string[] = [];
    walk(SRC, files);
    const callers = files
      .filter((file) => !file.endsWith(join("lib", "grade", "single-file-entry.ts")))
      .filter((file) => countMatches(readFileSync(file, "utf8"), /classifyGradingUpload\(/g) > 0)
      .map((file) => file.slice(SRC.length + 1).split("\\").join("/"))
      .sort();
    expect(callers).toEqual(Object.keys(SITES).sort());
  });

  for (const [relative, calls] of Object.entries(SITES)) {
    it(`${relative}: every one of its ${calls} call site(s) handles "video" and ends in assertNeverUploadKind`, () => {
      const text = readFileSync(join(SRC, relative), "utf8");
      expect(countMatches(text, /classifyGradingUpload\(/g)).toBe(calls);
      // One explicit video branch per call site.
      expect(countMatches(text, /Kind === "video"|kind === "video"/g)).toBeGreaterThanOrEqual(calls);
      // And one exhaustiveness assertion per call site (the file's grading.ts
      // form is a negated narrowing guard that calls it once).
      expect(countMatches(text, /assertNeverUploadKind\(/g)).toBeGreaterThanOrEqual(calls);
    });
  }
});
