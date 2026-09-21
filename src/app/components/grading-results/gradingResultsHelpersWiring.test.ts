// Wiring/guard oracle for gradingResultsHelpers.ts and the files it is used
// from - split out of gradingResultsHelpers.test.ts (which was approaching
// the project's 1000-line-per-file cap, docs/DEV_LOOP.md) into its own
// cohesive file: everything here reads OTHER SOURCE FILES as text (this
// directory's own client-bundle-safety sweep and its banned-import guard,
// plus the two GradingResults.tsx wiring checks) rather than calling a pure
// function and asserting on its return value. This is a pure move - no
// assertion here was changed, weakened, or retyped, and every relative path
// below is unchanged because this file lives in the exact same directory as
// the file it was moved out of (import.meta.url resolves identically here).

import { readdirSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { composeOverallCommentLocal } from "./gradingResultsHelpers";
// Safe ONLY here: this is a test file, never bundled to the client. See
// composeOverallCommentLocal's own doc comment in gradingResultsHelpers.ts
// for why the file under test does NOT import this itself.
import { composeOverallComment } from "@/lib/grade";

describe("composeOverallCommentLocal stays byte-identical to composeOverallComment", () => {
  // gradingResultsHelpers.ts deliberately does NOT import composeOverallComment
  // from "@/lib/grade" (see composeOverallCommentLocal's own doc comment for
  // why: that barrel transitively imports server-only code, which breaks
  // `next build` for this "use client" file's bundle even though tsc/eslint/
  // vitest all stay green). This test is the other half of that promise: it
  // imports the REAL composeOverallComment here, where doing so is safe (a
  // test file is never bundled to the client), and proves the local
  // duplicate produces identical output across a representative input table
  // - so a future edit to either implementation that drifts from the other
  // fails loudly instead of silently diverging.
  const cases: [name: string, strengths: string, improvements: string, resubmitNotice: string][] = [
    ["all three present", "Clear logic.", "Add tests.", "You may resubmit."],
    ["resubmitNotice empty (full credit)", "Clear logic.", "Add tests.", ""],
    ["improvements empty", "Clear logic.", "", "You may resubmit."],
    ["only strengths", "Clear logic.", "", ""],
    ["all empty", "", "", ""],
    ["whitespace-only parts treated as empty", "   ", "Add tests.", "  "],
  ];

  it.each(cases)("%s", (_name, strengths, improvements, resubmitNotice) => {
    expect(composeOverallCommentLocal(strengths, improvements, resubmitNotice)).toBe(
      composeOverallComment(strengths, improvements, resubmitNotice)
    );
  });
});

describe("grading-results client files stay client-bundle-safe", () => {
  // Regression guard for the exact bug this feature shipped once: this
  // directory's gradingResultsHelpers.ts imported composeOverallComment from
  // "@/lib/grade" as a VALUE import. That barrel transitively imports
  // server-only code (grade.ts -> grade/rubric.ts -> research/rubric-bank.ts
  // -> research/db.ts -> src/lib/supabase/server.ts, which imports
  // next/headers) - `next build` failed to compile any Pages Router entry
  // point reachable from GradingResults.tsx, while `npx tsc --noEmit`,
  // `npx eslint`, and `npx vitest run` all stayed green on the break. Modeled
  // on src/lib/workflows/course-schedule-docx.test.ts:28-50 and
  // src/lib/workflows/registry/steps.weekly-announcement-schedule.test.ts:57-70,
  // both of which record the identical lesson: only `next build` catches
  // this class of defect, so a source-reading guard test is the only thing
  // that keeps it caught on every routine run.
  const CLIENT_FILES = [
    "./gradingResultsHelpers.ts",
    "./RowFeedbackBoxes.tsx",
    "./SubmittedFilesPanel.tsx",
    // The four files added by GradingResults.tsx's line-budget extraction
    // (icons, the sort hook + its header row, and the feedback expand modal)
    // - none of them import gradingResultsHelpers.ts's banned modules
    // themselves, but each is a new file under this folder the same class of
    // regression could reach just as easily as it reached the original one.
    "./icons.tsx",
    "./useResultsSort.ts",
    "./ResultsTableHeaderRow.tsx",
    "./FeedbackExpandModal.tsx",
    "./FilesCell.tsx", // A16-1: the Files-column cell moved out to its own file.
    "./ungradedDisclosure.ts", // A12/A13 (docs/a12-a13-scope.md) - Ruling R part 1.
    "./ungradedRowLabel.ts", // RES-5 (docs/a12-a13-scope.md, Ruling U1) - the visible-label leaf.
    "./classTrendsEntry.ts", // A22: the ClassTrendsPanel adapter, narrowed off the barrel onto @/lib/grade/types.
    "../GradingResults.tsx",
  ];

  // A22: this scan reads RAW SOURCE - comments included, nothing stripped.
  // A banned specifier appearing only in a comment reds the file. The
  // accepted mitigation is prose discipline in the scanned files, not
  // comment stripping (RES-A22-1, docs/a22-scope.md section 3.4).

  // Ruling R part 2: narrowed to exempt "@/lib/grade/types" only - a
  // near-miss like "@/lib/grade/typesFoo" is still banned.
  const BANNED_IMPORT_PATTERNS: RegExp[] = [
    /from ["']@\/lib\/grade["']/,
    /from ["']@\/lib\/grade\/(?!types["'])/,
    /from ["']@\/lib\/supabase\/server["']/,
    /from ["']next\/headers["']/,
  ];

  it("canary: the ban patterns fire on known-bad imports, spare the react import, and spare Ruling R's exemption (both quote styles)", () => {
    const knownBad = [
      'import { composeOverallComment } from "@/lib/grade";',
      "import { composeOverallComment } from '@/lib/grade';",
      'import { generateRubric } from "@/lib/grade/rubric";',
      "import { generateRubric } from '@/lib/grade/rubric';",
      'import { createServiceClient } from "@/lib/supabase/server";',
      'import { headers } from "next/headers";',
    ];
    const fires = (fixture: string) => BANNED_IMPORT_PATTERNS.some((pattern) => pattern.test(fixture));
    for (const fixture of knownBad) expect(fires(fixture)).toBe(true);
    expect(fires('import { useState } from "react";')).toBe(false);
    expect(fires('import type { X } from "@/lib/grade/types";')).toBe(false);
    expect(fires("import type { X } from '@/lib/grade/types';")).toBe(false);
  });

  it.each(CLIENT_FILES)("%s never imports the banned modules", (relativePath) => {
    const source = readFileSync(fileURLToPath(new URL(relativePath, import.meta.url)), "utf8");
    for (const pattern of BANNED_IMPORT_PATTERNS) {
      expect(source).not.toMatch(pattern);
    }
  });

  // Ruling U3: VALUE_IMPORT_PATTERN was withdrawn (misses re-exports/require/
  // dynamic import). Replaced by a walled-set count: types.ts must carry
  // exactly one `from "` occurrence, and it must be the known type-only
  // import. types.ts is read-only here (S14's precedent).
  it('types.ts carries exactly one `from "` occurrence, and it is the known type-only import (Ruling U3)', () => {
    const source = readFileSync(
      fileURLToPath(new URL("../../../lib/grade/types.ts", import.meta.url)),
      "utf8"
    );
    const fromLines = source
      .split(/\r?\n/)
      .filter((line) => line.includes(' from "') && !/^\s*(\*|\/\/)/.test(line.trim()));
    expect(fromLines).toEqual(['import type { CodeRunResult } from "../code-runner";']);
  });

  // Ruling R part 4: a completeness sweep so a future file cannot escape
  // CLIENT_FILES by omission - the gap FilesCell.tsx/ungradedDisclosure.ts left.
  it("CLIENT_FILES lists EXACTLY this directory's non-test .ts/.tsx files, plus exactly its parent's non-local consumers (Ruling R part 4; A22)", () => {
    const dir = fileURLToPath(new URL(".", import.meta.url));
    const localFiles = readdirSync(dir)
      .filter(
        (n) => /\.(ts|tsx)$/.test(n) && !n.endsWith(".test.ts") && !n.endsWith(".test.tsx") && !n.endsWith(".d.ts")
      )
      .map((n) => `./${n}`);
    expect(localFiles.slice().sort()).toEqual(
      CLIENT_FILES.filter((p) => p.startsWith("./")).slice().sort()
    );
    // A22 (B1, then Ruling R1 in the round-3 disposal): the non-local
    // entries have no directory of their own to enumerate, but "which files
    // elsewhere import from this directory" IS a computable question.
    // Re-derive it from the parent directory rather than freezing it by
    // hand, so a deleted or unregistered consumer cannot be edited into
    // agreement with CLIENT_FILES without also deleting the consumer file
    // itself - see docs/a22-scope.md section 4(c).
    const parentDir = fileURLToPath(new URL("..", import.meta.url));
    const nonLocalConsumers = readdirSync(parentDir)
      .filter(
        (n) => /\.(ts|tsx)$/.test(n) && !n.endsWith(".test.ts") && !n.endsWith(".test.tsx") && !n.endsWith(".d.ts")
      )
      .filter((n) =>
        /from ["']\.\/grading-results\/|from ["']@\/app\/components\/grading-results\//.test(
          readFileSync(fileURLToPath(new URL(`../${n}`, import.meta.url)), "utf8")
        )
      )
      .map((n) => `../${n}`);
    expect(CLIENT_FILES.filter((p) => !p.startsWith("./")).slice().sort()).toEqual(
      nonLocalConsumers.slice().sort()
    );
  });
});

describe("GradingResults.tsx's empty Files cell stays wired to filesColumnEmptyLabel", () => {
  // F4: the Files column used to hardcode "-" for an empty submittedFiles
  // array, which cannot distinguish a restored run's stripped files from a
  // genuinely file-less submission. A future edit that reverts to a bare
  // "-" literal (or otherwise stops calling the helper) would silently
  // regress that distinction, and nothing renders in this suite to catch it
  // - so this is a source-reading guard, the same idiom this file's own
  // "client files stay client-bundle-safe" block above uses, paired with a
  // canary proving the detector actually discriminates.
  const CALL_PATTERN = /filesColumnEmptyLabel\(filesRetained\)/;
  const BARE_DASH_TERNARY_PATTERN = /:\s*\(\s*"-"\s*\)/;

  function readStrippedSource(relativeToThisFile: string): string {
    return readFileSync(fileURLToPath(new URL(relativeToThisFile, import.meta.url)), "utf8")
      .replace(/\/\*[\s\S]*?\*\//g, "")
      .replace(/\/\/.*$/gm, "");
  }

  it("canary: the real call is detected", () => {
    expect(CALL_PATTERN.test("filesColumnEmptyLabel(filesRetained)")).toBe(true);
  });

  it("canary: the pre-F4 bare-dash ternary shape is detected by its own pattern", () => {
    expect(BARE_DASH_TERNARY_PATTERN.test('result.submittedFiles.length > 0 ? (\n  <ul />\n) : (\n  "-"\n)}')).toBe(
      true
    );
  });

  it("canary: an unrelated ternary is NOT flagged by either pattern", () => {
    expect(CALL_PATTERN.test('cond ? "a" : "b"')).toBe(false);
    expect(BARE_DASH_TERNARY_PATTERN.test('cond ? "a" : "b"')).toBe(false);
  });

  it("A16-1 re-extraction: GradingResults.tsx renders FilesCell (filesRetained threaded through), which itself calls filesColumnEmptyLabel(filesRetained)", () => {
    const source = readStrippedSource("../GradingResults.tsx");
    expect(source).toMatch(/<FilesCell\b/);
    expect(source).toMatch(/filesRetained=\{filesRetained\}/);
    expect(readStrippedSource("./FilesCell.tsx")).toMatch(CALL_PATTERN);
  });
});

describe("GradingResults.tsx wires its Browse-all-files button to SubmittedFilesPanel", () => {
  // Task 2: the per-row "Browse all files" button must actually open
  // SubmittedFilesPanel with that row's own files, not a stale/wrong
  // student's - a mis-wired opener (e.g. always opening the first result, or
  // a button that sets state nothing renders) would be invisible to every
  // other gate here, since nothing in this suite renders a component.
  const OPEN_PATTERN = /onClick=\{\(\) => setBrowseFilesFor\(result\)\}/;
  const RENDER_PATTERN = /<SubmittedFilesPanel/;

  function readStrippedSource(relativeToThisFile: string): string {
    return readFileSync(fileURLToPath(new URL(relativeToThisFile, import.meta.url)), "utf8")
      .replace(/\/\*[\s\S]*?\*\//g, "")
      .replace(/\/\/.*$/gm, "");
  }

  it("canary: the real open handler is detected", () => {
    expect(OPEN_PATTERN.test("onClick={() => setBrowseFilesFor(result)}")).toBe(true);
  });

  it("canary: opening a fixed/stale value does NOT satisfy the pattern", () => {
    expect(OPEN_PATTERN.test("onClick={() => setBrowseFilesFor(sortedResults[0])}")).toBe(false);
  });

  it("A16-1 re-extraction: GradingResults.tsx wires FilesCell's onBrowseAll to setBrowseFilesFor and renders the panel; FilesCell opens the CURRENT row", () => {
    const source = readStrippedSource("../GradingResults.tsx");
    expect(source).toMatch(/<FilesCell\b/);
    expect(source).toMatch(/onBrowseAll=\{setBrowseFilesFor\}/);
    expect(source).toMatch(RENDER_PATTERN);
    expect(readStrippedSource("./FilesCell.tsx")).toMatch(/onClick=\{\(\) => onBrowseAll\(result\)\}/);
  });
});
