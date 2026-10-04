// Exact-set canary for every persistence key this view owns (A7 W2). The
// top-level componentStorageKeys.structure.test.ts is non-recursive and never
// sees this directory, and repoGradesUiState.test.ts round-trips keys one at a
// time without asserting the set, so a key added, renamed or dropped here was
// caught by nothing. repoGradesUiState.ts is the single home of every key for
// this view and holds each as a quoted literal, so a one-file scan is exact.
import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";
import { join } from "path";

const source = readFileSync(join(__dirname, "repoGradesUiState.ts"), "utf8");

function collectKeys(text: string): string[] {
  const keys = new Set<string>();
  for (const match of text.matchAll(/"(ta-[a-z0-9-]*)"/g)) keys.add(match[1]);
  return Array.from(keys).sort();
}

const FROZEN_KEYS = [
  "ta-repo-grades-assignment-map",
  "ta-repo-grades-bulk-selection-only",
  "ta-repo-grades-course",
  "ta-repo-grades-folder",
  "ta-repo-grades-instructions",
  "ta-repo-grades-link-assignment",
  "ta-repo-grades-link-open",
  "ta-repo-grades-link-source",
  "ta-repo-grades-log",
  "ta-repo-grades-org-prefix",
  "ta-repo-grades-readme-instructions",
  "ta-repo-grades-rubric",
  "ta-repo-grades-rubric-manual-text",
  "ta-repo-grades-rubric-source",
  "ta-repo-grades-run-code-scoring",
  "ta-repo-grades-selected",
  "ta-repo-grades-settings-open",
  "ta-repo-grades-sort",
];

describe("repo-grades persistence keys (exact set)", () => {
  it("K1: the keys in repoGradesUiState.ts are exactly the frozen 18", () => {
    expect(collectKeys(source)).toEqual(FROZEN_KEYS);
  });

  it("K2: the scan is not vacuous", () => {
    expect(collectKeys(source).length).toBeGreaterThan(10);
  });

  it("K3: an added key reddens the canary", () => {
    expect(collectKeys(source + '\nconst x = "ta-repo-grades-new-canary";\n')).not.toEqual(FROZEN_KEYS);
  });

  it("K4: a renamed or dropped key reddens the canary", () => {
    const mutated = source.split('"ta-repo-grades-link-open"').join('"ta-removed"');
    expect(collectKeys(mutated)).not.toEqual(FROZEN_KEYS);
  });

  it("RW4d: both new keys are read on load and written on persist", () => {
    for (const name of ["SETTINGS_OPEN_KEY", "LINK_OPEN_KEY"]) {
      expect(source).toContain(`localStorage.getItem(${name})`);
      expect(source).toContain(`writeCollapseOverride(${name},`);
    }
    expect(source).toContain("localStorage.removeItem(key)");
    expect(source).toContain("localStorage.setItem(key,");
  });
});
