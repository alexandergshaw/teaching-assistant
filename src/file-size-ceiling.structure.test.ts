import { describe, it, expect } from "vitest";
import fs from "fs";
import path from "path";

// docs/DEV_LOOP.md: "The 1000-line ceiling on every touched file... audited,
// not assumed... A file over 1000 lines does not get a follow-up ticket; the
// wave is not verified until it is split." That rule has exactly one
// mechanical gate today: src/app/components/recording/recording-split.structure.test.ts,
// which scans one directory (src/app/components/recording/) plus two named
// files (RecordingTab.tsx, TabShell.tsx), non-recursively. Everywhere else
// in src/ the ceiling is honour-system - this file is the repo-wide gate.
//
// Placed directly under src/ (rather than beside any one feature) because
// its subject is the whole tree, not a directory the way the other
// *.structure.test.ts files are (recording/, caption-studio/, supabase/,
// workflows/registry) - a reader auditing "why did my file fail the size
// gate" who does not already know which feature owns the check will find it
// at the root of the thing it scans. Named *.test.ts (not *.test.tsx) to
// match vitest.config.ts's `include: ["src/**/*.test.ts"]`.
const LIMIT = 1000;

// The recording-split check above already fails on these paths if they
// exceed 1000 lines - re-failing them here would be a duplicate report of a
// violation the other test already names and already points at. Only two
// facts are hard-coded: the two individually-named files that check covers,
// and the fact that it reads src/app/components/recording/ with
// fs.readdirSync (non-recursive - only DIRECT children, so a file nested one
// level deeper under recording/ would NOT be covered there and must still be
// caught here).
const COVERED_BY_RECORDING_SPLIT_CHECK = new Set<string>([
  "src/app/components/RecordingTab.tsx",
  "src/app/components/TabShell.tsx",
]);

function isCoveredByRecordingSplitCheck(relPath: string): boolean {
  if (COVERED_BY_RECORDING_SPLIT_CHECK.has(relPath)) return true;
  const recordingDirPrefix = "src/app/components/recording/";
  if (!relPath.startsWith(recordingDirPrefix)) return false;
  const rest = relPath.slice(recordingDirPrefix.length);
  return !rest.includes("/");
}

// Files already over the 1000-line ceiling, measured 2026-09-01 with
// `@(Get-Content <file>).Count` (never Measure-Object -Line, which undercounts
// files with no trailing newline). None of these are files this change
// touches. Each entry is a hard RATCHET, not an exemption: maxLines is
// pinned to the file's count AT THE TIME this list was written, so the file
// may shrink freely but fails the gate the moment it grows past where it
// already was. A pattern-based allowance (e.g. "any *.test.ts over 1000") is
// deliberately not used here - that would silently swallow every future file
// matching the pattern instead of naming today's five violations. Delete a
// file's entry once it is back at or under 1000 lines; do not raise a
// maxLines value to fit a file that grew.
const ALLOWED_OVERAGE: Record<string, { maxLines: number; reason: string }> = {
  "src/app/actions/lms-generation.test.ts": {
    maxLines: 1124,
    reason: "already over the ceiling before this gate existed; not touched by this change",
  },
  "src/app/actions/lms-generation-refine.test.ts": {
    maxLines: 1069,
    reason: "already over the ceiling before this gate existed; not touched by this change",
  },
  "src/lib/workflows/registry-helpers.assembleLectureFiles.test.ts": {
    maxLines: 1058,
    reason: "already over the ceiling before this gate existed; not touched by this change",
  },
  "src/app/components/content-tab/modules/bulkBarGroups.test.ts": {
    maxLines: 1026,
    reason: "already over the ceiling before this gate existed; not touched by this change",
  },
};

// Matches PowerShell's `@(Get-Content <file>).Count` - the method this
// project's own measurement convention (docs/DEV_LOOP.md, the assignment
// brief for this gate) mandates, and NOT plain `content.split("\n").length`.
// The two disagree by exactly one for any file ending in a trailing newline
// (almost every file in this repo): split("\n") counts the empty string
// after the final newline as an extra "line", Get-Content does not. Proven
// while building this gate: with split("\n").length, src/app/actions/canvas-inbox.ts
// - measured at exactly 1000 by Get-Content and described as "at the wall,
// with zero headroom" - came out to 1001 and failed the gate it is not
// actually over. Counting the Get-Content way keeps this gate's numbers
// consistent with the numbers a human (or another agent) gets by running the
// mandated measurement command directly.
function countLines(content: string): number {
  const lines = content.split(/\r\n|\r|\n/);
  if (lines.length > 0 && lines[lines.length - 1] === "") {
    lines.pop();
  }
  return lines.length;
}

function listSourceFiles(dir: string, out: string[] = []): string[] {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      listSourceFiles(full, out);
    } else if (/\.(ts|tsx)$/.test(entry.name) && !entry.name.endsWith(".d.ts")) {
      out.push(full);
    }
  }
  return out;
}

describe("repo-wide file size ceiling (honours DEV_LOOP.md's 1000-line rule)", () => {
  const repoRoot = process.cwd();
  const srcRoot = path.resolve(repoRoot, "src");
  const allFiles = listSourceFiles(srcRoot).map((f) =>
    path.relative(repoRoot, f).split(path.sep).join("/")
  );
  const checkedFiles = allFiles.filter((f) => !isCoveredByRecordingSplitCheck(f));

  it("finds source files to check - a check over nothing proves nothing", () => {
    expect(allFiles.length).toBeGreaterThan(0);
    expect(checkedFiles.length).toBeGreaterThan(0);
  });

  it("excludes at least one file that recording-split.structure.test.ts already covers, proving the exclusion is live and not a no-op", () => {
    const excluded = allFiles.filter((f) => isCoveredByRecordingSplitCheck(f));
    expect(excluded.length).toBeGreaterThan(0);
  });

  it("keeps every checked .ts/.tsx file in src/ within its line ceiling", () => {
    const violations: string[] = [];

    for (const relPath of checkedFiles) {
      const content = fs.readFileSync(path.resolve(repoRoot, relPath), "utf-8");
      const lineCount = countLines(content);
      const override = ALLOWED_OVERAGE[relPath];
      const limit = override ? override.maxLines : LIMIT;

      if (lineCount > limit) {
        violations.push(
          override
            ? `${relPath}: ${lineCount} lines (allow-listed ratchet ceiling ${limit} - ${override.reason}). It must not grow further. Extract a cohesive piece into its own leaf module to shrink it back toward the repo-wide ${LIMIT}-line limit; see discussion-serialization.ts, takeAnnouncementTranscription.ts, or useDiscussionNotices.ts for shipped examples of this split.`
            : `${relPath}: ${lineCount} lines, exceeding the repo-wide ${LIMIT}-line ceiling (docs/DEV_LOOP.md, "The 1000-line ceiling on every touched file"). Extract a cohesive piece into its own leaf module rather than growing this file further; see discussion-serialization.ts, takeAnnouncementTranscription.ts, or useDiscussionNotices.ts for shipped examples of this split.`
        );
      }
    }

    expect(violations, `\n${violations.join("\n")}`).toEqual([]);
  });
});
