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
import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";
import { join } from "path";

function read(relativePath: string): string {
  return readFileSync(join(process.cwd(), relativePath), "utf8");
}

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
// Client-bundle safety - the exact class of defect REGRESSION entry 355
// shipped with once already (a client module value-importing @/lib/grade,
// caught by nothing but next build's compile stage). The repo-grades files
// touched by this feature now also value-import a grading-results module
// (gradingResultsHelpers.ts / RowFeedbackBoxes.tsx / FeedbackExpandModal.tsx /
// SubmittedFilesPanel.tsx) - all four already proven safe by
// gradingResultsHelpers.test.ts's own "client files stay client-bundle-safe"
// guard, but THIS file's own imports of THEM must not reach the barrel
// either.
// ---------------------------------------------------------------------------

const BANNED_IMPORT_PATTERNS: RegExp[] = [
  /from ["']@\/lib\/grade["']/,
  /from ["']@\/lib\/grade\//,
  /from ["']@\/lib\/supabase\/server["']/,
  /from ["']next\/headers["']/,
];

const REPO_GRADES_CLIENT_FILES: Array<{ label: string; source: string }> = [
  { label: "RepoGradeCellControl.tsx", source: CELL_CONTROL_SOURCE },
  { label: "repoGradesCellEdits.ts", source: CELL_EDITS_SOURCE },
  { label: "useRepoGradesGradingActions.ts", source: HOOK_SOURCE },
  { label: "useRepoGradesBulkGrade.ts", source: BULK_HOOK_SOURCE },
];

describe("canary: the ban patterns actually fire on a known-bad import string", () => {
  it("fires on each banned specifier and not on an ordinary import", () => {
    const knownBad = [
      'import { composeOverallComment } from "@/lib/grade";',
      'import { generateRubric } from "@/lib/grade/rubric";',
      'import { createServiceClient } from "@/lib/supabase/server";',
      'import { headers } from "next/headers";',
    ];
    for (const fixture of knownBad) {
      expect(BANNED_IMPORT_PATTERNS.some((pattern) => pattern.test(fixture))).toBe(true);
    }
    expect(BANNED_IMPORT_PATTERNS.some((pattern) => pattern.test('import { useState } from "react";'))).toBe(false);
  });
});

describe("repo-grades files touched by this feature stay client-bundle-safe: only TYPE-ONLY imports of @/lib/grade, never a value import", () => {
  it.each(REPO_GRADES_CLIENT_FILES)(
    "$label never value-imports @/lib/grade (or a submodule), @/lib/supabase/server, or next/headers",
    ({ source }) => {
      // A `import type { ... } from "@/lib/grade"` line is safe (erased at
      // build) - this codebase's own established precedent for this exact
      // module (repoGradesCellEdits.ts's own header comment on RubricAreaResult/
      // SubmittedFileInfo). Only a VALUE import (no leading `type`) is banned.
      const valueImportLines = source
        .split("\n")
        .filter((line) => /^\s*import\b/.test(line) && !/^\s*import\s+type\b/.test(line));
      for (const line of valueImportLines) {
        for (const pattern of BANNED_IMPORT_PATTERNS) {
          expect(line).not.toMatch(pattern);
        }
      }
    }
  );
});
