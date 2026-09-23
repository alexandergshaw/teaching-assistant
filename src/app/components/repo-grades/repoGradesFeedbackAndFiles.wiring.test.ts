// Wiring guards for the two features this task brings to the Repo Grades
// surface after each shipped on GradingResults.tsx first: three independently
// -copyable feedback boxes (docs/grading-results-feedback-boxes-acceptance-
// criteria.md, REGRESSION entry 355) and browsing a graded cell's own files
// (docs/grading-results-file-viewer-acceptance-criteria.md, REGRESSION
// entries 356/357/359).
//
// THE DEFECT THIS FILE EXISTS TO CATCH: both features were built once
// already, correctly, entirely on GradingResults.tsx - and were unreachable
// from Repo Grades, the surface the instructor actually uses, because nobody
// wired them there. vitest here is node-env and collects only
// src/**/*.test.ts, and never renders a component - so the only thing that
// can catch "a capability exists but nothing on THIS surface reaches it" is a
// source-reading guard, each paired with a canary proving it can actually
// fail against a plausible unreachable-but-compiling version. Modeled on
// rubricBreakdownPercent.wiring.test.ts's readsRubricAreas/
// usesFormatScorePercent pattern and repoGrades.wiring.test.ts's
// callSitesGatedByClick pattern.
import { describe, it, expect, vi } from "vitest";

import { readFileSync } from "fs";
import { join } from "path";
import { createRequire } from "node:module";
import { directoryRoots, scanRuntimeEdges, walkRuntimeGraph } from "@/lib/module-graph/runtime-import-graph";
import {
  ALLOWED_ASSET_EXTENSIONS,
  ALLOWED_BARE_SPECIFIERS,
  BROWSER_SAFE_MODULES,
  FORBIDDEN_BARE_SPECIFIERS,
  FORBIDDEN_PATH_PREFIXES,
} from "@/lib/module-graph/client-boundary-policy";

// L15: this file walks a real directory tree / reads many real files.
// vitest's 5000ms default testTimeout treats that as slow-but-fine when
// run alone, and as a false timeout under concurrent `npm test` load from
// sibling agents (measured: the slowest single top-level it() here runs
// well under 1s alone). Raised to the repo's existing slow-test
// convention of 30_000, already used by canvas-client-boundary.
// transitive.test.ts and runtime-import-graph.test.ts - this changes
// nothing about what any test asserts.
vi.setConfig({ testTimeout: 30_000 });

function read(relativePath: string): string {
  return readFileSync(join(process.cwd(), relativePath), "utf8");
}

// R-5e(ii): parses this file's OWN source with the compiler's real parser -
// never a regex over raw text, which can only count calls it matches (a
// second argument that is an object literal, or a first argument containing
// a comma, is invisible to a pattern).
const ts = createRequire(import.meta.url)("typescript") as typeof import("typescript");

const SRC = join(process.cwd(), "src");
const REPO_GRADES_DIR = join(SRC, "app", "components", "repo-grades");

const CELL_CONTROL_SOURCE = read("src/app/components/repo-grades/RepoGradeCellControl.tsx");
const GRID_SOURCE = read("src/app/components/repo-grades/RepoGradesGrid.tsx");
const INDEX_SOURCE = read("src/app/components/repo-grades/index.tsx");
const HOOK_SOURCE = read("src/app/components/repo-grades/useRepoGradesGradingActions.ts");
const BULK_HOOK_SOURCE = read("src/app/components/repo-grades/useRepoGradesBulkGrade.ts");
const CELL_EDITS_SOURCE = read("src/app/components/repo-grades/repoGradesCellEdits.ts");

/** Line comments and block comments stripped, so a doc comment naming a
 * retired identifier for context (this codebase's own established habit -
 * see repoGrades.wiring.test.ts's stripComments) cannot trip a "must not
 * contain" check the same way REGRESSION entry 357's F1 guard once tripped on
 * its own header comment quoting a banned literal. */
function stripComments(text: string): string {
  return text.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/.*$/gm, "");
}

// ---------------------------------------------------------------------------
// THE GUARD THAT MATTERS MOST (per this feature's own brief): a source-
// reading test proving RepoGradeCellControl.tsx actually RENDERS the three
// feedback boxes and the file-browsing control - not merely that a helper
// module implementing either exists and is unit-tested in isolation, which is
// exactly the shape both features shipped in the first time (on
// GradingResults.tsx) while remaining completely unreachable from this
// surface.
// ---------------------------------------------------------------------------

/** True when `source` both imports RowFeedbackBoxes from the shared
 * grading-results module AND actually renders it wired to this cell's own
 * `edit`/`onFeedbackFieldChange` - importing without rendering, or rendering
 * a same-named local stand-in, both report false. */
function rendersFeedbackBoxes(source: string): boolean {
  const stripped = stripComments(source);
  const imports = /import\s*\{[^}]*\bRowFeedbackBoxes\b[^}]*\}\s*from\s*["']\.\.\/grading-results\/RowFeedbackBoxes["']/.test(
    stripped
  );
  const renders = /<RowFeedbackBoxes\b/.test(stripped);
  const wiredToEdit = /edit=\{feedbackEdit\}/.test(stripped) || /edit=\{edit\}/.test(stripped);
  const wiredToChange = /onChangeField=\{onFeedbackFieldChange\}/.test(stripped);
  return imports && renders && wiredToEdit && wiredToChange;
}

/** True when `source` both imports SubmittedFilesPanel from the
 * grading-results module AND actually renders it wired to THIS cell's own
 * graded files (`edit.submittedFiles`) - never a live-fetched list. */
function rendersFileBrowsingControl(source: string): boolean {
  const stripped = stripComments(source);
  const imports = /import\s+SubmittedFilesPanel\s+from\s+["']\.\.\/grading-results\/SubmittedFilesPanel["']/.test(
    stripped
  );
  const renders = /<SubmittedFilesPanel\b/.test(stripped);
  const wiredToFiles = /files=\{edit\.submittedFiles\}/.test(stripped);
  return imports && renders && wiredToFiles;
}

describe("rendersFeedbackBoxes (canary: proves the reachability check actually discriminates)", () => {
  it("reports true for the real, fully-wired render", () => {
    const fixture = [
      'import { RowFeedbackBoxes } from "../grading-results/RowFeedbackBoxes";',
      "<RowFeedbackBoxes edit={feedbackEdit} onChangeField={onFeedbackFieldChange} />",
    ].join("\n");
    expect(rendersFeedbackBoxes(fixture)).toBe(true);
  });

  it("reports false for a component that receives `edit` but never renders any feedback-box control at all - the literal shape this feature replaces (the single free-text comment textarea)", () => {
    const fixture =
      'export default function RepoGradeCellControl({ edit, onCommentChange }) { return <textarea value={edit.comment} onChange={(e) => onCommentChange(e.target.value)} />; }';
    expect(rendersFeedbackBoxes(fixture)).toBe(false);
  });

  it("reports false when the component is imported but never rendered (dead import)", () => {
    const fixture = 'import { RowFeedbackBoxes } from "../grading-results/RowFeedbackBoxes";';
    expect(rendersFeedbackBoxes(fixture)).toBe(false);
  });

  it("reports false when a same-named LOCAL component is rendered instead of the shared, tested one (a silent fork)", () => {
    const fixture = [
      "function RowFeedbackBoxes() { return null; }",
      "<RowFeedbackBoxes edit={feedbackEdit} onChangeField={onFeedbackFieldChange} />",
    ].join("\n");
    expect(rendersFeedbackBoxes(fixture)).toBe(false);
  });

  it("does not count a mention inside a comment as a real render", () => {
    const fixture = "// TODO: render <RowFeedbackBoxes edit={feedbackEdit} onChangeField={onFeedbackFieldChange} /> here\nreturn <div />;";
    expect(rendersFeedbackBoxes(fixture)).toBe(false);
  });
});

describe("rendersFileBrowsingControl (canary: proves the reachability check actually discriminates)", () => {
  it("reports true for the real, fully-wired render", () => {
    const fixture = [
      'import SubmittedFilesPanel from "../grading-results/SubmittedFilesPanel";',
      "<SubmittedFilesPanel files={edit.submittedFiles} />",
    ].join("\n");
    expect(rendersFileBrowsingControl(fixture)).toBe(true);
  });

  it("reports false for a component with no file-browsing control at all - the literal pre-fix state of this file", () => {
    const fixture = "export default function RepoGradeCellControl({ edit }) { return <input value={edit.score} />; }";
    expect(rendersFileBrowsingControl(fixture)).toBe(false);
  });

  it("reports false when the panel is rendered but wired to something OTHER than this cell's own graded files (e.g. a live-fetched list) - showing the instructor something other than what was graded is the exact failure this feature exists to prevent", () => {
    const fixture = [
      'import SubmittedFilesPanel from "../grading-results/SubmittedFilesPanel";',
      "<SubmittedFilesPanel files={liveRepoFiles} />",
    ].join("\n");
    expect(rendersFileBrowsingControl(fixture)).toBe(false);
  });

  it("reports false when imported but never rendered (dead import)", () => {
    const fixture = 'import SubmittedFilesPanel from "../grading-results/SubmittedFilesPanel";';
    expect(rendersFileBrowsingControl(fixture)).toBe(false);
  });
});

describe("THE GUARD THAT MATTERS MOST: RepoGradeCellControl.tsx actually renders both new controls, wired to this cell's own edit state", () => {
  it("renders the three feedback boxes via the shared RowFeedbackBoxes component", () => {
    expect(rendersFeedbackBoxes(CELL_CONTROL_SOURCE)).toBe(true);
  });

  it("renders the file-browsing control via SubmittedFilesPanel, wired to edit.submittedFiles - never a live fetch", () => {
    expect(rendersFileBrowsingControl(CELL_CONTROL_SOURCE)).toBe(true);
  });

  it("never imports the live org-scan action (loadOrgRepoTreesAction) or any GitHub-fetch action - the files shown are the ones a grading call already read, nothing is fetched to show them", () => {
    expect(CELL_CONTROL_SOURCE).not.toContain("loadOrgRepoTreesAction");
    expect(CELL_CONTROL_SOURCE).not.toContain("fetchGradableRepoContent");
    expect(CELL_CONTROL_SOURCE).not.toContain("octokit");
  });
});

// ---------------------------------------------------------------------------
// Single-writer invariant: `edit.comment` (still the field
// repoGradesPosting.ts posts to Canvas, unchanged by this feature) must have
// exactly ONE writer once a cell has feedback boxes -
// applyRepoGradeFeedbackFieldEdit (repoGradesCellEdits.ts). A box edit must
// reach it through handleFeedbackFieldChange; nothing else may write
// `comment` from a box edit.
// ---------------------------------------------------------------------------

describe("applyRepoGradeFeedbackFieldEdit is the ONE place a feedback-box edit reaches `comment`", () => {
  it("repoGradesCellEdits.ts defines applyRepoGradeFeedbackFieldEdit as the only assignment to `next.comment` in the module", () => {
    const stripped = stripComments(CELL_EDITS_SOURCE);
    const assignments = stripped.match(/\bnext\.comment\s*=/g) ?? [];
    expect(assignments).toHaveLength(1);
    expect(stripped).toContain("export function applyRepoGradeFeedbackFieldEdit(");
  });

  it("useRepoGradesGradingActions.ts's handleFeedbackFieldChange is the ONE call site of applyRepoGradeFeedbackFieldEdit, and it reads the CURRENT cell before patching (never a stale closure)", () => {
    const defIdx = HOOK_SOURCE.indexOf("const handleFeedbackFieldChange = ");
    expect(defIdx).toBeGreaterThan(-1);
    const nextFnIdx = HOOK_SOURCE.indexOf("// AC5 items 27-32", defIdx);
    const body = HOOK_SOURCE.slice(defIdx, nextFnIdx > -1 ? nextFnIdx : defIdx + 800);
    expect(body).toContain("const current = getRepoGradeCellEdit(prev, repo, folder)");
    expect(body).toContain("applyRepoGradeFeedbackFieldEdit(current, field, value)");
    // Exactly one call site of applyRepoGradeFeedbackFieldEdit in the WHOLE
    // hook file - a second, hand-rolled call site anywhere else would be a
    // second writer.
    const allCalls = stripComments(HOOK_SOURCE).match(/applyRepoGradeFeedbackFieldEdit\(/g) ?? [];
    expect(allCalls).toHaveLength(1);
  });

  it("RepoGradeCellControl.tsx never itself computes `comment` - it only forwards a box edit to onFeedbackFieldChange", () => {
    const stripped = stripComments(CELL_CONTROL_SOURCE);
    expect(stripped).not.toContain("applyRepoGradeFeedbackFieldEdit");
    expect(stripped).not.toContain(".comment =");
  });

  it("RepoGradesGrid.tsx forwards onFeedbackFieldChange straight through to the cell control, never intercepting or transforming a box edit itself", () => {
    expect(GRID_SOURCE).toContain(
      "onFeedbackFieldChange={(field, value) => onFeedbackFieldChange(row.repo, column.folder, field, value)}"
    );
  });

  it("index.tsx wires handleFeedbackFieldChange straight through to RepoGradesGrid's onFeedbackFieldChange prop", () => {
    expect(INDEX_SOURCE).toContain("onFeedbackFieldChange={handleFeedbackFieldChange}");
  });
});

// ---------------------------------------------------------------------------
// Both grading paths must set strengths/improvements/resubmitNotice/
// submittedFiles/submissionTruncated at the SAME time as score/comment/
// rubricAreas/generatedScore - a bulk-graded cell and a one-off-graded cell
// must stay indistinguishable to every downstream consumer (the standing rule
// both handlers' own header comments already state for rubricAreas/
// generatedScore; this extends the same guarantee to the five new fields).
// ---------------------------------------------------------------------------

describe("both grading paths set the new feedback/file fields alongside the existing ones, in the same patch", () => {
  it("useRepoGradesGradingActions.ts's handleGradeCell sets all five new fields in the same setRepoGradeCellEdit call that sets rubricAreas/generatedScore", () => {
    const defIdx = HOOK_SOURCE.indexOf("const handleGradeCell = async");
    expect(defIdx).toBeGreaterThan(-1);
    const nextFnIdx = HOOK_SOURCE.indexOf("// AC5 items 27-32", defIdx);
    const body = HOOK_SOURCE.slice(defIdx, nextFnIdx > -1 ? nextFnIdx : defIdx + 3000);
    expect(body).toContain('strengths: first?.strengths ?? ""');
    expect(body).toContain('improvements: first?.improvements ?? ""');
    expect(body).toContain('resubmitNotice: first?.resubmitNotice ?? ""');
    expect(body).toContain("submittedFiles: first?.submittedFiles ?? []");
    expect(body).toContain("submissionTruncated: first?.submissionTruncated ?? false");
    // Same patch object as rubricAreas/generatedScore, not a second write.
    expect(body).toContain("rubricAreas: first?.rubricAreas ?? []");
    expect(body).toContain("generatedScore: first?.totalScore ?? null");
  });

  it("useRepoGradesBulkGrade.ts's gradeOneTarget sets the same five fields in the same onCellUpdate call that sets rubricAreas/generatedScore", () => {
    const defIdx = BULK_HOOK_SOURCE.indexOf("const gradeOneTarget = async");
    expect(defIdx).toBeGreaterThan(-1);
    const nextIdx = BULK_HOOK_SOURCE.indexOf("// U12.50", defIdx);
    const body = BULK_HOOK_SOURCE.slice(defIdx, nextIdx > -1 ? nextIdx : defIdx + 2000);
    expect(body).toContain('strengths: first?.strengths ?? ""');
    expect(body).toContain('improvements: first?.improvements ?? ""');
    expect(body).toContain('resubmitNotice: first?.resubmitNotice ?? ""');
    expect(body).toContain("submittedFiles: first?.submittedFiles ?? []");
    expect(body).toContain("submissionTruncated: first?.submissionTruncated ?? false");
    expect(body).toContain("generatedScore: first?.totalScore ?? null");
  });
});

// ---------------------------------------------------------------------------
// Client-bundle safety - A23. The exact class of defect REGRESSION entry 355
// shipped with once already (a client module value-importing @/lib/grade,
// caught by nothing but next build's compile stage) is now caught by a
// TRANSITIVE RUNTIME-IMPORT-GRAPH WALK from this directory's own root set,
// under a capability predicate on the RESOLVED path - never by a text
// pattern inferring import intent from a line's spelling. A module is
// banned because it REACHES a server-only capability, not because its name
// matched a list (docs/a23-architecture.md, docs/a23-test-notes.md).
//
// ONE shared options object (Ruling W3/R-5e): every walkRuntimeGraph call in
// this file takes this SAME identifier, so a real walk that quietly drops a
// field cannot diverge from the canary that proves the walk discriminates.
// ---------------------------------------------------------------------------

const OPTIONS = {
  srcRoot: SRC,
  forbiddenPathPrefixes: FORBIDDEN_PATH_PREFIXES,
  browserSafeModules: BROWSER_SAFE_MODULES,
  forbiddenBareSpecifiers: FORBIDDEN_BARE_SPECIFIERS,
  allowedBareSpecifiers: ALLOWED_BARE_SPECIFIERS,
  allowedAssetExtensions: ALLOWED_ASSET_EXTENSIONS,
  treatUseServerAsWall: true,
};

// R-2: the derived root set against a HAND-FROZEN literal, never a second
// readdirSync - a directoryRoots-vs-readdirSync comparison is circular and
// discharges nothing (both go to zero together). 33 non-test, non-.d.ts
// .ts/.tsx basenames of this directory.
const FROZEN_REPO_GRADES_ROOTS = [
  "LinkUsernamesPanel.tsx",
  "LinkUsernamesRosterSection.tsx",
  "RepoBindingControl.tsx",
  "RepoGradeCellControl.tsx",
  "RepoGradesControls.tsx",
  "RepoGradesGrid.tsx",
  "RepoGradesLogPanel.tsx",
  "RepoGradesStatusBanners.tsx",
  // A16 wave 3 (docs/a16-wave3-scope.md WS-7): a new non-test .ts file in
  // this directory, so this frozen root set gains it in the same edit.
  "classTrendsFolderEntry.ts",
  "index.tsx",
  "linkRepoUsernames.ts",
  "repoGradePostScore.ts",
  "repoGradeScoreDisplay.ts",
  "repoGradeStudentName.ts",
  "repoGradeTreeLink.ts",
  "repoGradesAssignmentMapping.ts",
  "repoGradesAssignmentSources.ts",
  "repoGradesBindingConfirm.ts",
  "repoGradesBulkGrade.ts",
  "repoGradesCellEdits.ts",
  "repoGradesCoursePicker.ts",
  "repoGradesFolderSelection.ts",
  "repoGradesLog.ts",
  "repoGradesPosting.ts",
  "repoGradesRows.ts",
  "repoGradesRubricCache.ts",
  "repoGradesRubricSource.ts",
  "repoGradesUiState.ts",
  "rosterUsernameOverlay.ts",
  "useRepoGradesBulkGrade.ts",
  "useRepoGradesData.ts",
  "useRepoGradesGradingActions.ts",
  "useRepoGradesRubricSource.ts",
].sort();

describe("R-2: the derived repo-grades root set matches the hand-frozen list", () => {
  it("directoryRoots(repo-grades) names exactly the 33 frozen basenames", () => {
    const derived = directoryRoots(REPO_GRADES_DIR)
      .map((abs) => abs.slice(REPO_GRADES_DIR.length + 1))
      .sort();
    expect(derived).toEqual(FROZEN_REPO_GRADES_ROOTS);
  });
});

describe("R-1/R-3/R-4: the repo-grades closure carries zero violations, zero unallowed, zero unresolvable specifiers", () => {
  const roots = directoryRoots(REPO_GRADES_DIR);
  const result = walkRuntimeGraph(roots, OPTIONS);

  it("zero violations - no file reaches a server-only leaf", () => {
    expect(result.violations).toEqual([]);
  });
  it("zero unallowed - every literal bare specifier reached is a walked module, an allowed asset, or on the allow list", () => {
    expect(result.unallowed).toEqual([]);
  });
  it("zero unresolvable - no computed (non-literal) specifier is silently dropped", () => {
    expect(result.unresolvable).toEqual([]);
  });
});

describe("R-5: a PLANTED POSITIVE proves this walk actually discriminates", () => {
  const grade = join(SRC, "lib", "grade.ts");
  const canary = walkRuntimeGraph([grade], OPTIONS);

  it("R-5a: violations.length > 0 on the barrel this row exists to ban", () => {
    expect(canary.violations.length).toBeGreaterThan(0);
  });
  it("R-5b: unallowed.length > 0 - the pre-Z1 hole this design closes", () => {
    expect(canary.unallowed.length).toBeGreaterThan(0);
  });
  it("R-5c: the trail names the hazard (contains lib/supabase/server, not a pinned path form)", () => {
    expect(canary.violations.some((v) => v.resolved?.includes("lib/supabase/server"))).toBe(true);
  });
});

describe("R-5d: the second canary - node:async_hooks via owner-context.ts", () => {
  it("violations contains exactly the node:async_hooks entry, and unallowed contains it too", () => {
    const ownerContext = join(SRC, "lib", "supabase", "owner-context.ts");
    const canary = walkRuntimeGraph([ownerContext], OPTIONS);
    // Pinned to the SPECIFIC entry the forbiddenBareSpecifiers branch pushes
    // (resolved: null), not merely `violations.length > 0` - this closure
    // also reaches a forbidden MODULE (a different violations.push site,
    // resolved: a path) so a bare length check would stay green even if the
    // bare-specifier branch this canary exists to prove were deleted.
    expect(canary.violations.some((v) => v.specifier === "node:async_hooks" && v.resolved === null)).toBe(true);
    expect(canary.unallowed.some((u) => u.specifier === "node:async_hooks")).toBe(true);
  });
});

describe("R-5e: both walkRuntimeGraph calls in this file take the SAME shared options identifier", () => {
  it("at least two calls, EVERY second argument is a bare Identifier (never an object literal), all the same name", () => {
    // Parsed with ts.createSourceFile, not a regex: a regex over raw text can
    // only count calls it matches, so a second argument that is an object
    // literal - or a first argument containing a comma - is invisible to it.
    // See the fixed version's PASSING-BUT-WRONG predecessor in
    // docs/a23-test-notes.md's R-5e disposition for exactly this hole.
    const source = read("src/app/components/repo-grades/repoGradesFeedbackAndFiles.wiring.test.ts");
    const sourceFile = ts.createSourceFile("guard.ts", source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TS);
    const names: string[] = [];
    function visit(node: import("typescript").Node): void {
      if (ts.isCallExpression(node) && ts.isIdentifier(node.expression) && node.expression.text === "walkRuntimeGraph") {
        const arg = node.arguments[1];
        expect(Boolean(arg && ts.isIdentifier(arg))).toBe(true);
        if (arg && ts.isIdentifier(arg)) names.push(arg.text);
      }
      ts.forEachChild(node, visit);
    }
    ts.forEachChild(sourceFile, visit);
    expect(names.length).toBeGreaterThanOrEqual(2);
    expect(new Set(names).size).toBe(1);
    expect(names[0]).toBe("OPTIONS");
  });
  it("OPTIONS' every field is the named import from client-boundary-policy.ts", () => {
    expect(OPTIONS.forbiddenPathPrefixes).toEqual(FORBIDDEN_PATH_PREFIXES);
    expect(OPTIONS.browserSafeModules).toEqual(BROWSER_SAFE_MODULES);
    expect(OPTIONS.forbiddenBareSpecifiers).toEqual(FORBIDDEN_BARE_SPECIFIERS);
    expect(OPTIONS.allowedBareSpecifiers).toEqual(ALLOWED_BARE_SPECIFIERS);
    expect(OPTIONS.allowedAssetExtensions).toEqual(ALLOWED_ASSET_EXTENSIONS);
  });
});

describe("Fix 4: no root in the repo-grades closure is itself a `use server` file", () => {
  it("none of directoryRoots(repo-grades)'s own directive prologues include use server", () => {
    // R-9's oracle proves removing the wall EXPLODES the closure (149 -> 454
    // nodes); nothing proved the wall was not instead SWALLOWING a root -
    // treatUseServerAsWall would silently skip an entire root file's own
    // edges, and R-2 (root-set identity) and R-1/R-3/R-4 (v=0 is the pass
    // condition) both stay green regardless.
    const roots = directoryRoots(REPO_GRADES_DIR);
    for (const root of roots) {
      const scan = scanRuntimeEdges(readFileSync(root, "utf8"), root);
      expect(scan.directives).not.toContain("use server");
    }
  });
});

describe("canary: scanRuntimeEdges actually discriminates a value import from a type-only one", () => {
  it("finds a real edge for each known-bad value import, by its own specifier", () => {
    const knownBad: Array<[string, string]> = [
      ['import { composeOverallComment } from "@/lib/grade";', "@/lib/grade"],
      ['import { generateRubric } from "@/lib/grade/rubric";', "@/lib/grade/rubric"],
      ['import { createServiceClient } from "@/lib/supabase/server";', "@/lib/supabase/server"],
      ['import { headers } from "next/headers";', "next/headers"],
    ];
    for (const [fixture, specifier] of knownBad) {
      expect(scanRuntimeEdges(fixture, "fixture.ts").edges.map((e) => e.specifier)).toContain(specifier);
    }
    expect(scanRuntimeEdges('import type { X } from "@/lib/grade";', "fixture.ts").edges).toEqual([]);
  });
});
