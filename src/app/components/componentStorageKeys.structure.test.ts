// RULING 109-111 (docs/ruling-109-111.md), correcting RULING 107. RULING 107
// required an exact-key-set canary scoped to CartridgeDropPanel.tsx alone.
// That narrowed DECISION 9 (docs/owner-decisions-2026-09-23.md), which reads:
// "when a SIXTH key lands in that directory, the exact-set canary is written
// then, covering all of them." Both files that carry DECISION 9's own
// deferral comment - CartridgeDropPanel.tsx and GradingTab.tsx - sit
// directly in src/app/components/, so "that directory" is this one, and the
// canary below scans it, not one file inside it.
//
// SCOPE DECISION - non-recursive (this directory's own files only, not its
// subdirectories). Justification from DECISION 9's wording: the comment in
// both source files reads "lands in this directory, covering all of them" -
// written from each file's own vantage point, where "this directory" is the
// directory literally containing that file (src/app/components/), not the
// whole subtree under it. The existing precedent this file's shape is
// copied from - src/app/components/snapshot-grading/snapshot-grading.
// structure.test.ts:213-240 ("directory-wide ta-snap-* key exact-set
// canary... this directory has no canary anywhere else") - already treats
// each component subdirectory as owning its own directory-scoped canary,
// independent of its siblings and of the parent src/app/components/ itself.
// Going recursive here would duplicate that subdirectory's own canary (and
// module-deck-capture's, recording's, etc.) inside this one, and would also
// pull in files under active work by other agents in unrelated
// subdirectories. Non-recursive keeps this canary's population equal to the
// same population DECISION 9's own comment describes: exactly the files that
// sit directly in src/app/components/.
//
// SCAN CHANNEL (RULING 110). The precedent's own quoted-literal-only pattern
// (`/"(ta-[a-z0-9-]*)"/g`) misses a channel this repo actively uses: a ta-
// key assembled with a template literal, e.g.
// `ta-vc-copy-name:${repoRef}\`` (CopyRepoPanel.tsx) and
// `` `ta-workflow-values-${id}` `` (WorkflowsTab.tsx). A quoted-only scan of
// this directory finds 75 distinct keys (command and count below); that
// count is a FLOOR, not the real population. This file instead uses a
// quote-free pattern with a negative lookbehind, matching the technique
// snapshot-grading.structure.test.ts:225 already uses for its own directory
// (`/(?<![a-zA-Z])ta-snap-[a-z-]*[a-z]/g`), broadened to numerals and to the
// general `ta-` prefix rather than one component's own `ta-snap-` prefix:
//
//   /(?<![a-zA-Z0-9_])ta-[a-z0-9-]*[a-z0-9]/g
//
// WHAT THIS SCAN STILL CANNOT SEE. A key assembled entirely from a runtime
// variable with no literal `ta-...` prefix segment anywhere in source text
// (for example a key built as `` `${prefix}-tasks` `` where `prefix` is a
// variable holding "ta") is invisible to any source-text scan, by
// construction - no regex over static text can find a string that does not
// exist until the program runs. Where a template literal DOES carry a
// literal `ta-` prefix (every case measured in this directory today), the
// scan finds the literal prefix up to the first `${` interpolation, which is
// what the frozen list below records - not the full interpolated runtime
// key. This is why `ta-tasks` (the shared prefix of
// `` `ta-tasks-${view}-columns` `` in TasksTab.tsx) appears as its own
// distinct entry in the frozen list, separate from the fully-literal
// `ta-tasks-term-columns` / `ta-tasks-recurring-columns` keys the same file
// also writes directly.
//
// WHAT ELSE IS IN THE FROZEN LIST. Per this same precedent's own stated
// intent ("inventorying every key mention, including documentation, not
// asserting liveness" - snapshot-grading.structure.test.ts:243-247), this
// scan runs over raw, comment-INCLUDED source, exactly like the precedent's
// own directory-wide key scan does. That means it also freezes non-key
// prose that happens to match the pattern - measured in this directory:
// InSessionBanner.tsx's own comment describes "the ta--prefixed localStorage
// convention" (a stylistic double-hyphen, not a storage key), which the
// pattern matches as `ta--prefixed`. This is not filtered out: doing so
// would be hand-tuning the regex to the current source rather than freezing
// what is actually measured, and the whole point of an exact-set canary is
// that ANY change to what the pattern matches - including a comment being
// reworded - is visible. If that comment's wording ever changes, this test
// will go red for that reason, and correcting EXPECTED_TA_KEYS at that point
// is the intended response, not evidence the canary is wrong.
//
// MEASURED WITH (paste of the actual command and its output, from this
// directory, non-recursive, non-test .ts/.tsx files only):
//
//   node -e '
//   const fs = require("fs"); const path = require("path");
//   const dir = "src/app/components";
//   const files = fs.readdirSync(dir).filter(f =>
//     /\.(ts|tsx)$/.test(f) && !f.endsWith(".test.ts") &&
//     fs.statSync(path.join(dir,f)).isFile());
//   const combined = files.map(f =>
//     fs.readFileSync(path.join(dir,f),"utf8")).join("\n");
//   const re = /(?<![a-zA-Z0-9_])ta-[a-z0-9-]*[a-z0-9]/g;
//   const found = new Set(); let m;
//   while((m = re.exec(combined))) found.add(m[0]);
//   console.log(files.length, found.size);
//   '
//
// Output: 83 non-test files, 82 distinct keys. (The quoted-only baseline
// over the same 83 files gives 75 - confirming RULING 110's "floor" claim by
// direct comparison; the 6-key difference is ta-vc-copy-name, ta-vc-copy-msg,
// ta-workflow-values, ta-tasks (all four real template-literal prefixes) plus
// ta-spin (a CSS animation name, not a storage key, matched incidentally -
// also left in per the comment-inclusion policy above) plus ta--prefixed
// (the prose false positive described above).
import { describe, it, expect } from "vitest";
import fs from "fs";
import path from "path";

const COMPONENTS_DIR = path.join(process.cwd(), "src/app/components");

function nonTestTopLevelFiles(): string[] {
  return fs
    .readdirSync(COMPONENTS_DIR)
    .filter((f) => /\.(ts|tsx)$/.test(f) && !f.endsWith(".test.ts"))
    .filter((f) => fs.statSync(path.join(COMPONENTS_DIR, f)).isFile());
}

function combinedSource(files: string[]): string {
  return files.map((f) => fs.readFileSync(path.join(COMPONENTS_DIR, f), "utf8")).join("\n");
}

// Quote-free, numerals included, matches a template-literal key's own
// literal prefix up to its first interpolation.
const TA_KEY_PATTERN = /(?<![a-zA-Z0-9_])ta-[a-z0-9-]*[a-z0-9]/g;

function collectTaKeys(source: string): string[] {
  const found = new Set<string>();
  let match: RegExpExecArray | null;
  const re = new RegExp(TA_KEY_PATTERN);
  while ((match = re.exec(source)) !== null) {
    found.add(match[0]);
  }
  return Array.from(found).sort();
}

// Frozen at 82 keys, measured by the command in the header comment above.
// Sorted; do not reorder by hand - EXPECTED_TA_KEYS.sort() below is the
// actual comparison basis, this literal ordering is only for a readable
// diff when this test goes red.
const EXPECTED_TA_KEYS = [
  "ta--prefixed",
  "ta-canvas-saved-courses",
  "ta-cartridge-assignment",
  "ta-cartridge-course",
  "ta-cartridge-description",
  "ta-cartridge-lms",
  "ta-cartridge-lms-chosen",
  "ta-cartridge-points",
  "ta-cartridge-rubric",
  "ta-content-course-url",
  "ta-content-saved",
  "ta-course-changed",
  "ta-drafts-collapsed",
  "ta-drafts-course",
  "ta-drafts-search",
  "ta-drafts-sort",
  "ta-files-course-url",
  "ta-files-group",
  "ta-files-kind",
  "ta-files-last-seen",
  "ta-files-module-id",
  "ta-files-search",
  "ta-files-sort",
  "ta-files-view",
  "ta-files-workflow",
  "ta-github-grading-queue",
  "ta-grading-rubric-memory",
  "ta-grading-source",
  "ta-in-session-banner-open",
  "ta-livefeed-autorefresh",
  "ta-problems-draft",
  "ta-problems-draft-detail",
  "ta-problems-filter",
  "ta-rec-ann-course",
  "ta-rec-bg",
  "ta-rec-echo",
  "ta-rec-gain",
  "ta-rec-noise",
  "ta-rec-pen-color",
  "ta-rec-pen-size",
  "ta-rec-pip",
  "ta-rec-pip-corner",
  "ta-rec-pip-shape",
  "ta-rec-pip-size",
  "ta-rec-prompter",
  "ta-rec-prompter-size",
  "ta-rec-screen-audio",
  "ta-rec-source",
  "ta-rec-use-countdown",
  "ta-rec-view",
  "ta-rec-walk-keep-source-audio",
  "ta-rec-walk-mode",
  "ta-spin",
  "ta-tasks",
  "ta-tasks-density",
  "ta-tasks-highlight",
  "ta-tasks-recurring-columns",
  "ta-tasks-term-columns",
  "ta-vc-copy-dest-mode",
  "ta-vc-copy-dest-repo",
  "ta-vc-copy-labels",
  "ta-vc-copy-msg",
  "ta-vc-copy-name",
  "ta-vc-copy-owner",
  "ta-vc-copy-prefix",
  "ta-vc-copy-template",
  "ta-vc-copy-topics",
  "ta-vc-copy-visibility",
  "ta-vc-copy-workflows",
  "ta-vc-org",
  "ta-vc-org-view",
  "ta-vc-repo",
  "ta-vc-subtab",
  "ta-workflow-values",
  "ta-workflows",
  "ta-workflows-automation-open",
  "ta-workflows-panel",
  "ta-workflows-recent",
  "ta-workflows-run-history-open",
  "ta-workflows-search",
  "ta-workflows-selected",
  "ta-workflows-steps-open",
].sort();

describe("directory-wide ta- key exact-set canary for src/app/components/ (non-recursive; RULING 109)", () => {
  const files = nonTestTopLevelFiles();

  // Population controls (the snapshot-grading precedent's own two-control
  // idiom, snapshot-grading.structure.test.ts:213-230): a scan whose
  // population silently empties - directory renamed, every file moved into
  // subdirectories - would otherwise pass vacuously.
  it("finds more than 50 non-test top-level files in this directory - a scan over a near-empty or renamed directory proves nothing", () => {
    expect(files.length).toBeGreaterThan(50);
  });

  const source = combinedSource(files);
  const keys = collectTaKeys(source);

  it("finds at least one ta- key across this directory's non-test top-level files - a check over nothing proves nothing", () => {
    expect(keys.length).toBeGreaterThan(0);
  });

  it("has exactly the frozen key set measured above - no more, no fewer", () => {
    expect(keys).toEqual(EXPECTED_TA_KEYS);
  });

  it("would fail if a new ta- key (quoted or template-literal) were added without updating this list", () => {
    const sourceWithNewKey = `${source}\nconst x = "ta-new-canary-field";\n`;
    expect(collectTaKeys(sourceWithNewKey)).not.toEqual(EXPECTED_TA_KEYS);
  });

  it("would fail if a new ta- key built with a template literal were added without updating this list", () => {
    const sourceWithNewTemplateKey = `${source}\nconst x = \`ta-new-template-field-\${id}\`;\n`;
    expect(collectTaKeys(sourceWithNewTemplateKey)).not.toEqual(EXPECTED_TA_KEYS);
  });

  it("would fail if a key were silently removed without updating this list", () => {
    const sourceMissingAKey = source.split('"ta-cartridge-lms-chosen"').join('"REMOVED"');
    expect(collectTaKeys(sourceMissingAKey)).not.toEqual(EXPECTED_TA_KEYS);
  });

  it("the quoted-literal-only pattern RULING 110 found insufficient would UNDER-count this same source (regression guard on the fix itself)", () => {
    const quotedOnlyPattern = /"(ta-[a-z0-9-]*)"/g;
    const quotedOnlyFound = new Set<string>();
    let m: RegExpExecArray | null;
    while ((m = quotedOnlyPattern.exec(source)) !== null) quotedOnlyFound.add(m[1]);
    expect(quotedOnlyFound.size).toBeLessThan(keys.length);
  });
});
