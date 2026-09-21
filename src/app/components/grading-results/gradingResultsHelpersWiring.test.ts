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
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { composeOverallCommentLocal } from "./gradingResultsHelpers";
// Safe ONLY here: this is a test file, never bundled to the client. See
// composeOverallCommentLocal's own doc comment in gradingResultsHelpers.ts
// for why the file under test does NOT import this itself.
import { composeOverallComment } from "@/lib/grade";
import { directoryRoots, scanRuntimeEdges, walkRuntimeGraph } from "@/lib/module-graph/runtime-import-graph";
import {
  ALLOWED_ASSET_EXTENSIONS,
  ALLOWED_BARE_SPECIFIERS,
  BROWSER_SAFE_MODULES,
  FORBIDDEN_BARE_SPECIFIERS,
  FORBIDDEN_PATH_PREFIXES,
} from "@/lib/module-graph/client-boundary-policy";

const SRC = join(process.cwd(), "src");
const GRADING_RESULTS_DIR = join(SRC, "app", "components", "grading-results");

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

describe("grading-results client files stay client-bundle-safe (A23: transitive runtime-import-graph walk)", () => {
  // A23 replaces the walled-set line count and the raw-source
  // BANNED_IMPORT_PATTERNS sweep with a TRANSITIVE RUNTIME-IMPORT-GRAPH WALK
  // from this directory's own tree-derived root set, under a capability
  // predicate on the RESOLVED path - never a text pattern inferring import
  // intent from a line's spelling. types.ts is a NAMED ROOT of this walk
  // (Ruling Z3): it is judged by its own reachability, not by a name-based
  // exemption, closing the exact hole a type-only narrowing of its two real
  // runtime edges would otherwise have left invisible to every other gate.
  //
  // ONE shared options object (Ruling W3/R-5e): every walkRuntimeGraph call
  // in this file takes this SAME identifier.
  const OPTIONS = {
    srcRoot: SRC,
    forbiddenPathPrefixes: FORBIDDEN_PATH_PREFIXES,
    browserSafeModules: BROWSER_SAFE_MODULES,
    forbiddenBareSpecifiers: FORBIDDEN_BARE_SPECIFIERS,
    allowedBareSpecifiers: ALLOWED_BARE_SPECIFIERS,
    allowedAssetExtensions: ALLOWED_ASSET_EXTENSIONS,
    treatUseServerAsWall: true,
  };

  // CLIENT_FILES is the COMPARISON ONLY (O-C) - never the walk's roots. The
  // walk's real roots are directoryRoots(dir) plus GradingResults.tsx and
  // types.ts (Ruling Z3), below.
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

  it("R-2: directoryRoots(dir)'s ./ half matches the CLIENT_FILES literal's ./ half", () => {
    const derived = directoryRoots(GRADING_RESULTS_DIR)
      .map((abs) => `./${abs.slice(GRADING_RESULTS_DIR.length + 1)}`)
      .sort();
    const literal = CLIENT_FILES.filter((p) => p.startsWith("./")).slice().sort();
    expect(derived).toEqual(literal);
  });

  it("R-2: the walk's full root array contains ../GradingResults.tsx and src/lib/grade/types.ts by name (Ruling Z3)", () => {
    const roots = [
      ...directoryRoots(GRADING_RESULTS_DIR),
      join(GRADING_RESULTS_DIR, "..", "GradingResults.tsx"),
      join(SRC, "lib", "grade", "types.ts"),
    ];
    expect(roots).toContain(join(GRADING_RESULTS_DIR, "..", "GradingResults.tsx"));
    expect(roots).toContain(join(SRC, "lib", "grade", "types.ts"));
  });

  it("R-1/R-3/R-4: the grading-results closure carries zero violations, zero unallowed, zero unresolvable specifiers", () => {
    const roots = [
      ...directoryRoots(GRADING_RESULTS_DIR),
      join(GRADING_RESULTS_DIR, "..", "GradingResults.tsx"),
      join(SRC, "lib", "grade", "types.ts"),
    ];
    const result = walkRuntimeGraph(roots, OPTIONS);
    expect(result.violations).toEqual([]);
    expect(result.unallowed).toEqual([]);
    expect(result.unresolvable).toEqual([]);
  });

  it("R-5: a PLANTED POSITIVE proves this walk actually discriminates (the barrel this row exists to ban)", () => {
    const grade = join(SRC, "lib", "grade.ts");
    const canary = walkRuntimeGraph([grade], OPTIONS);
    expect(canary.violations.length).toBeGreaterThan(0); // R-5a
    expect(canary.unallowed.length).toBeGreaterThan(0); // R-5b
    expect(canary.violations.some((v) => v.resolved?.includes("lib/supabase/server"))).toBe(true); // R-5c
  });

  it("R-5e: both walkRuntimeGraph calls above take the SAME shared options identifier", () => {
    const source = readFileSync(fileURLToPath(import.meta.url), "utf8");
    const calls = [...source.matchAll(/walkRuntimeGraph\(\s*[^,]+,\s*([A-Za-z_$][\w$]*)\s*\)/g)];
    expect(calls.length).toBeGreaterThanOrEqual(2);
    const names = new Set(calls.map((m) => m[1]));
    expect(names.size).toBe(1);
    expect(names.has("OPTIONS")).toBe(true);
  });

  it("canary: scanRuntimeEdges finds a real edge for a known-bad value import, and none for a type-only one", () => {
    const knownBad: Array<[string, string]> = [
      ['import { composeOverallComment } from "@/lib/grade";', "@/lib/grade"],
      ["import { composeOverallComment } from '@/lib/grade';", "@/lib/grade"],
      ['import { generateRubric } from "@/lib/grade/rubric";', "@/lib/grade/rubric"],
      ['import { createServiceClient } from "@/lib/supabase/server";', "@/lib/supabase/server"],
      ['import { headers } from "next/headers";', "next/headers"],
    ];
    for (const [fixture, specifier] of knownBad) {
      expect(scanRuntimeEdges(fixture, "fixture.ts").edges.map((e) => e.specifier)).toContain(specifier);
    }
    expect(scanRuntimeEdges('import type { X } from "@/lib/grade/types";', "fixture.ts").edges).toEqual([]);
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
