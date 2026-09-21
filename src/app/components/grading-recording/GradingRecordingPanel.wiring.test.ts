import { describe, it, expect } from "vitest";
import * as fs from "fs";
import * as path from "path";
import { accumulateDroppedFrames } from "../recording/discussion-capture";

// GradingRecordingPanel.tsx is a React component and nothing renders under
// this repo's vitest (node-env, collects only src/**/*.test.ts - see this
// repo's own AGENTS.md note). The assertions below are therefore either (a)
// a source-text check against the panel's own file - the sanctioned
// fallback for wiring a component can never otherwise prove - or (b) a
// direct re-exercise of the sibling pure function using the exact call
// shape the panel performs, so a real regression in either the panel's
// usage or the sibling's contract would show up here.
//
// docs/REGRESSION.md entry 383's Limits, verified real in this file before
// this fix: `droppedFrames: droppedFrames,` at the old GradingRecordingPanel.
// tsx:479 (feeding buildGradingRecordingRunLog) and `{droppedFrames > 0 &&`
// at the old line 661 (the persistent notice) both read
// useDiscussionCapture's live counter directly - a value that resets to 0 on
// every start() while `logStartedAt` spans the whole panel session. A
// session made of two Start/Stop cycles with drops in the first therefore
// under-reported: the log and notice only ever reflected the most recent
// cycle. Fixed by folding the live value through accumulateDroppedFrames
// (recording/discussion-capture.ts) into a session-total `droppedFramesTotal`
// - the same pattern module-deck-capture/ModuleDeckCapturePanel.tsx already
// uses (see that file's own AM-G comment, which named this file as the
// pre-existing bug it was written not to repeat).
//
// Every assertion in this file was sabotage-checked while this file was
// written: the guarded line was reverted to read the live `droppedFrames`
// value directly in GradingRecordingPanel.tsx, the specific `it` was
// confirmed red, the file was restored, and the suite was confirmed green
// again. See this task's own report for the exact sabotages run.

const PANEL_PATH = path.resolve(process.cwd(), "src/app/components/grading-recording/GradingRecordingPanel.tsx");
const source = fs.readFileSync(PANEL_PATH, "utf-8");

// stripComments is DUPLICATED from submission-kind-callsites.structure.test.ts
// rather than imported - this repo forbids importing a helper from another
// *.test.ts file (it re-runs that file's describe blocks as a side effect).
// Hoisted to the top of the file (docs/a16-wave2-verify.md RES-V-2 /
// section 6.1): wave 1's caller guard below used raw `source`, so wrapping
// the live element in a JSX comment left every one of its tests green and
// `tsc` clean - the guard must run over the SAME comment-stripped source
// the wave-2 pins already use.
function stripComments(source: string): string {
  return source
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .split("\n")
    .map((line) => line.replace(/\/\/.*$/, ""))
    .join("\n");
}

const STRIPPED_SOURCE = stripComments(source);

describe("dropped-frame accumulator (REGRESSION 383 fix)", () => {
  it("calls accumulateDroppedFrames with the live value and a ref-tracked previous value, never the live value alone", () => {
    expect(source).toMatch(/accumulateDroppedFrames\(\s*prevLiveDroppedRef\.current\s*,\s*droppedFrames\s*,/);
  });

  it("never reads the hook's live droppedFrames directly into the run log's droppedFrames field", () => {
    // The only acceptable appearance of the bare identifier `droppedFrames`
    // immediately after `droppedFrames:` is as part of `droppedFramesTotal`
    // (this regex requires the character right after `droppedFrames` to be
    // a comma or whitespace, which `droppedFramesTotal` never satisfies) -
    // the run log's field must read droppedFramesTotal instead.
    expect(source).not.toMatch(/droppedFrames:\s*droppedFrames[,\s]/);
    expect(source).toMatch(/droppedFrames:\s*droppedFramesTotal[,\s]/);
  });

  it("never gates the persistent drop notice on the hook's live droppedFrames directly - only on droppedFramesTotal", () => {
    expect(source).not.toMatch(/\{droppedFrames\s*>\s*0\s*&&/);
    expect(source).toMatch(/\{droppedFramesTotal\s*>\s*0\s*&&/);
  });

  it("a Start/Stop/Start session's live readings survive through the panel's own accumulator contract", () => {
    // Reproduces the exact three-call sequence the panel's effect performs
    // across a two-cycle session, using the sibling pure function directly -
    // this is the regression this fix exists to prevent (the panel reading
    // only the live value at download/render time and losing cycle 1's
    // drops entirely).
    let total = 0;
    total = accumulateDroppedFrames(0, 6, total); // cycle 1 climbs to 6
    total = accumulateDroppedFrames(6, 0, total); // Stop, then Start resets live to 0
    total = accumulateDroppedFrames(0, 3, total); // cycle 2 climbs to 3
    expect(total).toBe(9); // NOT 3
  });
});

// A9 wave 2 (docs/REGRESSION.md entry 428, RES-A9-10): intent to dismiss a
// submission comes ONLY from useGradingCaptureTracking's composed handlers -
// commitDismissal is the one place `dismissed` ever gets set. A second
// removal path that bypassed the composed handler would resurrect on the
// next reload (dismissTrackedRow never runs, nothing persists). Pinning the
// FACT (exactly one binding, wired to the composed handler, not the bare
// store method) and the ORDERING (the hook is given the store's own
// mutators), never the spelling of the composed handlers' own bodies -
// those are unit-tested directly in grading-capture-tombstones.test.ts.
// docs/a16-wave1-scope.md W1-G3: an extracted leaf with no caller ships dead
// with every other gate green (this repo has done it twice). Both halves are
// required - the import alone proves nothing if the panel never renders the
// component.
function importsAndRendersGradingCaptureSettings(text: string): boolean {
  return /from "\.\/GradingCaptureSettings"/.test(text) && /<GradingCaptureSettings\b/.test(text);
}

describe("GradingCaptureSettings is imported AND rendered (W1-G3)", () => {
  it("the panel imports from ./GradingCaptureSettings and renders <GradingCaptureSettings", () => {
    // Comment-stripped (RES-V-2): raw `source` let a JSX comment wrapping the
    // live element pass this check, because the render-tag regex still
    // matched the text sitting inside `{/* ... */}`.
    expect(importsAndRendersGradingCaptureSettings(STRIPPED_SOURCE)).toBe(true);
  });

  it("canary: an import with no render tag is detected as NOT wired - proves the detector cannot pass on a dead import", () => {
    const deadImportOnly = 'import GradingCaptureSettings from "./GradingCaptureSettings";\n// never rendered anywhere below\n';
    expect(importsAndRendersGradingCaptureSettings(deadImportOnly)).toBe(false);
  });

  it("canary: a JSX-commented-out element is detected as NOT wired over comment-stripped source (RES-V-2)", () => {
    const commentedOut = 'import GradingCaptureSettings from "./GradingCaptureSettings";\n{/* <GradingCaptureSettings foo={foo} /> */}\n';
    expect(importsAndRendersGradingCaptureSettings(stripComments(commentedOut))).toBe(false);
  });

  it("the rendered element binds all ten props to the panel's own identifiers", () => {
    const match = STRIPPED_SOURCE.match(/<GradingCaptureSettings\b[\s\S]*?\/>/);
    expect(match, "expected to find the <GradingCaptureSettings .../> element").not.toBeNull();
    const el = match![0];
    expect(el).toMatch(/courseId=\{courseId\}/);
    expect(el).toMatch(/setCourseId=\{setCourseId\}/);
    expect(el).toMatch(/courses=\{courses\}/);
    expect(el).toMatch(/coursesLoading=\{coursesLoading\}/);
    expect(el).toMatch(/coursesError=\{coursesError\}/);
    expect(el).toMatch(/selectedRosterText=\{selectedRosterText\}/);
    expect(el).toMatch(/assessmentOptions=\{assessmentOptions\}/);
    expect(el).toMatch(/assessmentLabel=\{assessmentLabel\}/);
    expect(el).toMatch(/setAssessmentLabel=\{setAssessmentLabel\}/);
    expect(el).toMatch(/assessmentId=\{assessmentId\}/);
  });
});

describe("Remove/Clear-table route through the one composed handler (RES-A9-10)", () => {
  it("binds onRemoveRow exactly once, to capture.onRemoveRow - never the bare store mutator", () => {
    const matches = source.match(/onRemoveRow=\{[^}]*\}/g) ?? [];
    expect(matches).toHaveLength(1);
    expect(matches[0]).toBe("onRemoveRow={capture.onRemoveRow}");
  });

  it("binds onClearTable exactly once, to capture.onClearTable - never the bare store mutator", () => {
    const matches = source.match(/onClearTable=\{[^}]*\}/g) ?? [];
    expect(matches).toHaveLength(1);
    expect(matches[0]).toBe("onClearTable={capture.onClearTable}");
  });

  it("useGradingCaptureTracking is given the store's own removeRow and clearTable", () => {
    expect(source).toMatch(
      /useGradingCaptureTracking\(gradingRows\.removeRow,\s*gradingRows\.clearTable,/
    );
  });
});

// ─────────────────────────────────────────────────────────────────────────
// A16-3 (docs/a16-plan.md 5.5/5.5.1/9.3, rulings 14/19/20/21): the run
// cohort a Grade submissions click captures, and the gated trends mount it
// feeds. Every source-text pin below runs over COMMENT-STRIPPED source
// (docs/a16-rulings.md Ruling 15) - the panel's own mandated hinge comments
// name the very identifiers these pins look for, and this repo's own
// submission-kind-callsites.structure.test.ts already strips comments for
// exactly this reason ("comments naming the rule do not count").
//
function extractBalanced(text: string, openBraceIndex: number): string {
  let depth = 0;
  for (let i = openBraceIndex; i < text.length; i++) {
    if (text[i] === "{") depth++;
    else if (text[i] === "}") {
      depth--;
      if (depth === 0) return text.slice(openBraceIndex, i + 1);
    }
  }
  return text.slice(openBraceIndex);
}

/** The comment-stripped body of handleGradeAll - the POSITIVE region
 *  (ruling 15). Located by the literal binding text, then balanced by
 *  brace count so nested blocks (if/for/try) do not truncate it early. */
function handleGradeAllBody(strippedSource: string): string {
  const marker = "const handleGradeAll = useCallback(async () => {";
  const idx = strippedSource.indexOf(marker);
  if (idx === -1) return "";
  return extractBalanced(strippedSource, idx + marker.length - 1);
}

/** The comment-stripped render body, EXCLUDING every handler body - the
 *  NEGATIVE region (ruling 15). Located by the `return (` MARKER, never a
 *  raw line number (ruling 24): comment-stripping and wave 1's own
 *  extraction both shift line numbers, but this marker survives both. */
function renderBody(strippedSource: string): string {
  const match = /^  return \(/m.exec(strippedSource);
  return match ? strippedSource.slice(match.index) : "";
}

const HANDLE_GRADE_ALL_BODY = handleGradeAllBody(STRIPPED_SOURCE);
const RENDER_BODY = renderBody(STRIPPED_SOURCE);

describe("region helpers (canary)", () => {
  it("handleGradeAllBody finds a real, non-empty region on the panel", () => {
    expect(HANDLE_GRADE_ALL_BODY.length).toBeGreaterThan(0);
    expect(HANDLE_GRADE_ALL_BODY).toMatch(/checkGradingReadiness/);
  });

  it("renderBody finds a real, non-empty region on the panel", () => {
    expect(RENDER_BODY.length).toBeGreaterThan(0);
    expect(RENDER_BODY).toMatch(/GradingTable/);
  });

  it("renderBody EXCLUDES handleGradeAll's own body (a fixture proves the split)", () => {
    const fixture = [
      "const handleGradeAll = useCallback(async () => {",
      "  const assessmentLabel = 'leaked';",
      "}, []);",
      "  return (",
      "    <div />",
      "  );",
    ].join("\n");
    expect(renderBody(fixture)).not.toMatch(/assessmentLabel/);
  });
});

// ── THE LEAF IS CALLED (B1, ruling 17 M1/M3 shape) - TWO REGIONS ──────────

function importsBuildRunCohort(strippedWholeSource: string): boolean {
  return /import\s*\{[^}]*\bbuildRunCohort\b[^}]*\}\s*from\s*["']\.\/classTrendsRunCohort["']/.test(strippedWholeSource);
}

function callsBuildRunCohort(strippedHandlerBody: string): boolean {
  return /\bbuildRunCohort\(/.test(strippedHandlerBody);
}

describe("importsBuildRunCohort / callsBuildRunCohort (canary)", () => {
  it("reports true on the shipped import-and-call shape", () => {
    expect(importsBuildRunCohort('import { buildRunCohort } from "./classTrendsRunCohort";')).toBe(true);
    expect(callsBuildRunCohort("buildRunCohort(result.results, identity, meta)")).toBe(true);
  });

  it("reports false on a dead import (P17-adjacent: imported but the merge is inlined)", () => {
    expect(callsBuildRunCohort("const cohort = { rows: [] };")).toBe(false);
  });

  it("reports false on a local reimplementation never imported from ./classTrendsRunCohort", () => {
    expect(importsBuildRunCohort("function buildRunCohort() { return null; }")).toBe(false);
  });
});

describe("GradingRecordingPanel.tsx calls buildRunCohort (B1, closes P17)", () => {
  it("imports buildRunCohort from ./classTrendsRunCohort", () => {
    expect(importsBuildRunCohort(STRIPPED_SOURCE)).toBe(true);
  });

  it("calls buildRunCohort( inside handleGradeAll's own body - not merely imported", () => {
    expect(callsBuildRunCohort(HANDLE_GRADE_ALL_BODY)).toBe(true);
  });
});

// ── THE FIRST ARGUMENT IS THIS RUN'S RESULTS (B1, closes P13) ─────────────

function buildRunCohortFirstArgument(strippedHandlerBody: string): string | null {
  const match = /buildRunCohort\(\s*([^,]+),/.exec(strippedHandlerBody);
  return match ? match[1].trim() : null;
}

describe("buildRunCohortFirstArgument (canary)", () => {
  it("returns 'result.results' on the correct shape", () => {
    expect(buildRunCohortFirstArgument("buildRunCohort(result.results, identity, meta)")).toBe("result.results");
  });

  it("returns the pre-grade row array's name on P13's mutation - never confused with the correct shape", () => {
    expect(buildRunCohortFirstArgument("buildRunCohort(gradingRows.rawRows, identity, meta)")).toBe("gradingRows.rawRows");
    expect(buildRunCohortFirstArgument("buildRunCohort(gradingRows.rows, identity, meta)")).toBe("gradingRows.rows");
  });
});

describe("GradingRecordingPanel.tsx's buildRunCohort call passes THIS RUN'S results (B1, closes P13)", () => {
  it("the first argument is result.results, never gradingRows.rawRows or gradingRows.rows", () => {
    const firstArg = buildRunCohortFirstArgument(HANDLE_GRADE_ALL_BODY);
    expect(firstArg).toBe("result.results");
    expect(firstArg).not.toBe("gradingRows.rawRows");
    expect(firstArg).not.toBe("gradingRows.rows");
  });
});

// ── THE PROJECTION NAMES assessment (B1, closes P15) ──────────────────────

function identityProjectsRowAssessment(strippedHandlerBody: string): boolean {
  const match = /const identity = [\s\S]*?\bassessment:\s*([^,}\n]+)[,}]/.exec(strippedHandlerBody);
  if (!match) return false;
  return match[1].trim() === "r.assessment";
}

describe("identityProjectsRowAssessment (canary)", () => {
  it("returns true when the identity projection's assessment property reads r.assessment", () => {
    expect(identityProjectsRowAssessment("const identity = gradingRows.rawRows.map((r) => ({ id: r.id, assessment: r.assessment }));")).toBe(
      true
    );
  });

  it("returns false on P15's mutation - filling every row from the single in-scope value", () => {
    expect(identityProjectsRowAssessment("const identity = gradingRows.rawRows.map((r) => ({ id: r.id, assessment: assessmentId }));")).toBe(
      false
    );
  });
});

describe("GradingRecordingPanel.tsx's identity projection names r.assessment (B1, closes P15)", () => {
  it("the per-row assessment property reads r.assessment, never assessmentId or assessmentLabel", () => {
    expect(identityProjectsRowAssessment(HANDLE_GRADE_ALL_BODY)).toBe(true);
    const match = /const identity = [\s\S]*?\bassessment:\s*([^,}\n]+)[,}]/.exec(HANDLE_GRADE_ALL_BODY);
    expect(match).not.toBeNull();
    expect(match![1].trim()).not.toBe("assessmentId");
    expect(match![1].trim()).not.toBe("assessmentLabel");
  });
});

// ── THE CLEAR IS IN EVERY NON-SUCCESS BRANCH (B1, closes P16) ─────────────

function readinessRefusalBody(strippedHandlerBody: string): string | null {
  const match = /if \(!readiness\.ok\) \{([\s\S]*?)\n(\s*)\}/.exec(strippedHandlerBody);
  return match ? match[1] : null;
}

function errorResultBranchBody(strippedHandlerBody: string): string | null {
  const match = /if \("error" in result\) \{([\s\S]*?)\n(\s*)\}/.exec(strippedHandlerBody);
  return match ? match[1] : null;
}

function catchBranchBody(strippedHandlerBody: string): string | null {
  const match = /\} catch \([^)]*\) \{([\s\S]*?)\n(\s*)\} finally/.exec(strippedHandlerBody);
  return match ? match[1] : null;
}

describe("branch-body helpers (canary)", () => {
  it("find each of the three non-success branches on the real panel", () => {
    expect(readinessRefusalBody(HANDLE_GRADE_ALL_BODY)).not.toBeNull();
    expect(errorResultBranchBody(HANDLE_GRADE_ALL_BODY)).not.toBeNull();
    expect(catchBranchBody(HANDLE_GRADE_ALL_BODY)).not.toBeNull();
  });
});

describe("GradingRecordingPanel.tsx clears the cohort in all three non-success branches (B1, closes P16)", () => {
  it("the readiness refusal (which returns BEFORE the run starts) clears lastRunCohort", () => {
    const body = readinessRefusalBody(HANDLE_GRADE_ALL_BODY);
    expect(body).not.toBeNull();
    expect(body).toMatch(/setLastRunCohort\(null\)/);
  });

  it("the \"error\" in result branch clears lastRunCohort", () => {
    const body = errorResultBranchBody(HANDLE_GRADE_ALL_BODY);
    expect(body).not.toBeNull();
    expect(body).toMatch(/setLastRunCohort\(null\)/);
  });

  it("the catch branch clears lastRunCohort", () => {
    const body = catchBranchBody(HANDLE_GRADE_ALL_BODY);
    expect(body).not.toBeNull();
    expect(body).toMatch(/setLastRunCohort\(null\)/);
  });
});

// ── THE PROVENANCE PIN, POSITIVE HALF, RE-TARGETED (M2) ───────────────────

function metaBindingCapturesProvenance(strippedHandlerBody: string): boolean {
  const metaMatch = /const meta = (\{[\s\S]*?\});/.exec(strippedHandlerBody);
  if (!metaMatch) return false;
  const metaExpr = metaMatch[1];
  const mentionsAssessment = /\bassessmentId\b|\bassessmentLabel\b/.test(metaExpr);
  const mentionsCourse = /\bselectedCourse\b/.test(metaExpr);
  const passedToCall = /buildRunCohort\([^;]*\bmeta\b[^;]*\)/.test(strippedHandlerBody);
  return mentionsAssessment && mentionsCourse && passedToCall;
}

describe("metaBindingCapturesProvenance (canary)", () => {
  it("returns true on the shipped hoisted-const shape", () => {
    expect(
      metaBindingCapturesProvenance(
        'const meta = { courseName: selectedCourse?.name ?? "", assignmentName: assessmentId };\nbuildRunCohort(result.results, identity, meta);'
      )
    ).toBe(true);
  });

  it("returns false on P8's mutation - dropping assessmentId from the captured meta", () => {
    expect(
      metaBindingCapturesProvenance(
        'const meta = { courseName: selectedCourse?.name ?? "", assignmentName: "" };\nbuildRunCohort(result.results, identity, meta);'
      )
    ).toBe(false);
  });
});

describe("GradingRecordingPanel.tsx's meta argument captures BOTH provenance fields (POSITIVE pin, M2)", () => {
  it("the hoisted const meta mentions assessmentId/assessmentLabel and selectedCourse, and is passed to buildRunCohort", () => {
    expect(metaBindingCapturesProvenance(HANDLE_GRADE_ALL_BODY)).toBe(true);
  });
});

// ── THE PROVENANCE PIN, BINDING-CORRECT (N4) ──────────────────────────────
// metaBindingCapturesProvenance above is a MENTION test: it is satisfied by
// `{ courseName: assessmentId, assignmentName: selectedCourse?.name ?? "" }`
// just as much as by the correct shape, because it never checks which value
// lands in which key. That transposition puts the course name into
// `assignmentName` - reaching student-addressed copy
// (class-trends-draft.ts:185) and the model prompt (class-trends-insight.ts
// :154) - and the half-typed assessment label into `courseName`. This binds
// each property's own value expression.

function metaPropertyValues(metaExpr: string): { courseName: string; assignmentName: string } | null {
  const match = /courseName:\s*([\s\S]*?),\s*assignmentName:\s*([\s\S]*?)\s*\}$/.exec(metaExpr.trim());
  if (!match) return null;
  return { courseName: match[1].trim(), assignmentName: match[2].trim() };
}

function metaBindingIsNotTransposed(strippedHandlerBody: string): boolean {
  const metaMatch = /const meta = (\{[\s\S]*?\});/.exec(strippedHandlerBody);
  if (!metaMatch) return false;
  const values = metaPropertyValues(metaMatch[1]);
  if (!values) return false;
  const courseNameBindsCourse = /\bselectedCourse\b/.test(values.courseName);
  const courseNameBindsAssessment = /\bassessmentId\b|\bassessmentLabel\b/.test(values.courseName);
  const assignmentNameBindsAssessment = /\bassessmentId\b|\bassessmentLabel\b/.test(values.assignmentName);
  const assignmentNameBindsCourse = /\bselectedCourse\b/.test(values.assignmentName);
  return courseNameBindsCourse && !courseNameBindsAssessment && assignmentNameBindsAssessment && !assignmentNameBindsCourse;
}

describe("metaPropertyValues / metaBindingIsNotTransposed (canary)", () => {
  it("returns true on the shipped shape", () => {
    expect(metaBindingIsNotTransposed('const meta = { courseName: selectedCourse?.name ?? "", assignmentName: assessmentId };')).toBe(
      true
    );
  });

  it("returns false on N4's mutation - the two VALUES transposed, keys unchanged", () => {
    expect(
      metaBindingIsNotTransposed('const meta = { courseName: assessmentId, assignmentName: selectedCourse?.name ?? "" };')
    ).toBe(false);
  });
});

describe("GradingRecordingPanel.tsx's meta argument binds each value to its own key, never transposed (N4)", () => {
  it("courseName's value mentions selectedCourse (never assessmentId/assessmentLabel), and assignmentName's value mentions assessmentId/assessmentLabel (never selectedCourse)", () => {
    expect(metaBindingIsNotTransposed(HANDLE_GRADE_ALL_BODY)).toBe(true);
  });
});

// A whole-file, raw-source ban is RED at HEAD before any wave-2 code exists
// (pre-existing legitimate gradingRows.rawRows/gradingRows.rows hits) - so
// this repo's own gate is region-plus-whitelist, never a file-wide ban.
describe("a file-wide raw-source ban would be RED at HEAD (why this file uses regions instead)", () => {
  it("gradingRows.(rawRows|rows) has pre-existing legitimate hits outside the handler", () => {
    expect(/gradingRows\.(rawRows|rows)/.test(source)).toBe(true);
  });
});

// ── THE WHITELIST, QUOTED VERBATIM FROM 5.5.1 (B2, ruling 21) ─────────────
// "there is exactly one `const <name> = <expr>;` binding the trends entry,
// and `<expr>`'s only free identifiers are `lastRunCohort` and the imported
// helpers (`toRunCohortEntry`, `runCohortMeta`). The mount's `entry={...}`
// is that `<name>`."

const TRENDS_ENTRY_ALLOWED_IDENTIFIERS = new Set(["lastRunCohort", "toRunCohortEntry", "runCohortMeta", "null"]);

function findConstBindingsCalling(strippedBody: string, calleeName: string): Array<{ name: string; expr: string }> {
  const found: Array<{ name: string; expr: string }> = [];
  const regex = /const\s+(\w+)\s*=\s*([^;]+);/g;
  let match: RegExpExecArray | null;
  while ((match = regex.exec(strippedBody))) {
    if (new RegExp(`\\b${calleeName}\\(`).test(match[2])) {
      found.push({ name: match[1], expr: match[2] });
    }
  }
  return found;
}

function freeIdentifiers(expr: string): string[] {
  return expr.match(/[A-Za-z_$][A-Za-z0-9_$]*/g) ?? [];
}

describe("findConstBindingsCalling / freeIdentifiers (canary)", () => {
  it("finds exactly one binding on the shipped shape, with only whitelisted free identifiers", () => {
    const fixture = "const trendsEntry = lastRunCohort ? toRunCohortEntry(lastRunCohort) : null;";
    const found = findConstBindingsCalling(fixture, "toRunCohortEntry");
    expect(found).toHaveLength(1);
    expect(freeIdentifiers(found[0].expr).every((id) => TRENDS_ENTRY_ALLOWED_IDENTIFIERS.has(id))).toBe(true);
  });

  it("fails the whitelist on a one-hop evasion that reads a live control instead", () => {
    const fixture = "const trendsEntry = lastRunCohort ? toRunCohortEntry(lastRunCohort) : null;\nconst leaked = assessmentLabel;";
    // The leaked const does not call toRunCohortEntry, so it is invisible to
    // this detector by construction - proving the whitelist is scoped to
    // THE TRENDS-ENTRY CONST'S OWN INITIALISER, never the whole render body.
    const found = findConstBindingsCalling(fixture, "toRunCohortEntry");
    expect(found).toHaveLength(1);
    expect(found[0].expr).not.toMatch(/assessmentLabel/);
  });
});

describe("GradingRecordingPanel.tsx's trends-entry const is whitelisted (B2, ruling 21)", () => {
  it("there is exactly one const binding a toRunCohortEntry(...) expression in the render body", () => {
    const found = findConstBindingsCalling(RENDER_BODY, "toRunCohortEntry");
    expect(found).toHaveLength(1);
  });

  it("that expression's only free identifiers are lastRunCohort and the imported helpers", () => {
    const [binding] = findConstBindingsCalling(RENDER_BODY, "toRunCohortEntry");
    expect(binding).toBeDefined();
    const ids = freeIdentifiers(binding.expr);
    expect(ids.length).toBeGreaterThan(0);
    for (const id of ids) {
      expect(TRENDS_ENTRY_ALLOWED_IDENTIFIERS.has(id), `unexpected free identifier: ${id}`).toBe(true);
    }
  });

  it("the mount's entry={...} prop is that same const's name", () => {
    const [binding] = findConstBindingsCalling(RENDER_BODY, "toRunCohortEntry");
    expect(binding).toBeDefined();
    const tagMatch = /<ClassTrendsPanel\b[^>]*>/.exec(RENDER_BODY);
    expect(tagMatch).not.toBeNull();
    expect(tagMatch![0]).toMatch(new RegExp(`entry=\\{${binding.name}\\}`));
  });
});

// ── THE MOUNT IS GATED (M3) - reusing the shipped classTrendsMountIsGated ──
// shape from gradingResultsExtraction.wiring.test.ts:277-281, DUPLICATED
// (that function is module-local, not exported - see this repo's own rule
// against importing across *.test.ts files).

function classTrendsMountIsGated(strippedSource: string): boolean {
  const match = /hasTrendableResults\([^)]*\)\s*&&([\s\S]{0,400})/.exec(strippedSource);
  if (!match) return false;
  // Negation-aware (docs/a16-wave2-verify.md N1): `!` is not an identifier,
  // and it sits BEFORE the regex's own match (which starts at
  // `hasTrendableResults`), so `!hasTrendableResults(...) &&` used to pass
  // this detector unchanged - the exact inversion that renders the panel
  // only when there is nothing to show ("Trends (0)" forever) and never
  // when there is. Reject when the text immediately preceding the match,
  // modulo whitespace, ends in `!`.
  const textBeforeMatch = strippedSource.slice(0, match.index);
  if (/!\s*$/.test(textBeforeMatch)) return false;
  return /<ClassTrendsPanel\b/.test(match[1]);
}

describe("classTrendsMountIsGated (canary)", () => {
  it("reports true when the tag follows hasTrendableResults(...) && within the same expression", () => {
    expect(classTrendsMountIsGated("return hasTrendableResults(entry) && (\n  <ClassTrendsPanel entry={entry} />\n);")).toBe(true);
  });

  it("reports false when the guard is removed (P18: the exact regression this guards)", () => {
    expect(classTrendsMountIsGated("return <ClassTrendsPanel entry={entry} />;")).toBe(false);
  });

  it("reports false when the guard is NEGATED (N1: mounts only when there is nothing to show)", () => {
    expect(classTrendsMountIsGated("return !hasTrendableResults(entry) && (\n  <ClassTrendsPanel entry={entry} />\n);")).toBe(false);
  });

  it("still reports true when whitespace, not a bang, precedes the guard", () => {
    expect(classTrendsMountIsGated("return   hasTrendableResults(entry) && (\n  <ClassTrendsPanel entry={entry} />\n);")).toBe(true);
  });
});

describe("GradingRecordingPanel.tsx's ClassTrendsPanel mount is gated by hasTrendableResults (M3, closes P18)", () => {
  it("the tag is not reachable unless hasTrendableResults(...) is true, over the comment-stripped source", () => {
    expect(classTrendsMountIsGated(STRIPPED_SOURCE)).toBe(true);
  });
});

// ── ClassTrendsPanel is imported AND rendered, above <GradingTable> ───────

function importsAndRendersClassTrendsPanel(strippedSource: string): boolean {
  const importPattern = /import\s+ClassTrendsPanel\s+from\s*["']\.\.\/drafted-grades\/ClassTrendsPanel["']/;
  const renderPattern = /<ClassTrendsPanel\b/;
  return importPattern.test(strippedSource) && renderPattern.test(strippedSource);
}

describe("importsAndRendersClassTrendsPanel (canary)", () => {
  it("reports false when imported but never rendered (dead import)", () => {
    expect(importsAndRendersClassTrendsPanel('import ClassTrendsPanel from "../drafted-grades/ClassTrendsPanel";')).toBe(false);
  });

  it("reports false when rendered but not imported from that path (a local reimplementation)", () => {
    expect(importsAndRendersClassTrendsPanel("function ClassTrendsPanel() { return null; }\nconst x = <ClassTrendsPanel />;")).toBe(false);
  });
});

describe("GradingRecordingPanel.tsx imports and renders ClassTrendsPanel, above GradingTable", () => {
  it("imports it from ../drafted-grades/ClassTrendsPanel and renders it", () => {
    expect(importsAndRendersClassTrendsPanel(STRIPPED_SOURCE)).toBe(true);
  });

  it("the mount appears before <GradingTable in source order", () => {
    const mountIndex = STRIPPED_SOURCE.indexOf("<ClassTrendsPanel");
    const tableIndex = STRIPPED_SOURCE.indexOf("<GradingTable");
    expect(mountIndex).toBeGreaterThan(-1);
    expect(tableIndex).toBeGreaterThan(-1);
    expect(mountIndex).toBeLessThan(tableIndex);
  });
});

// ── THE DISCLOSURE LINE EXISTS (B-A, closes P20) ──────────────────────────

describe("GradingRecordingPanel.tsx's disclosure line exists and is pinned (B-A/ruling 21, closes P20)", () => {
  it("the render body references cohortLabelSpread at all - deleting the line entirely must fail this", () => {
    expect(RENDER_BODY).toMatch(/cohortLabelSpread\(/);
  });

  it("the disclosure guard's only free identifiers are the trends-entry const, lastRunCohort, and cohortLabelSpread", () => {
    const idx = RENDER_BODY.indexOf("cohortLabelSpread(");
    expect(idx).toBeGreaterThan(-1);
    // The guard is everything between the nearest preceding "{" and the
    // "&& (" that opens the rendered JSX - never the whole surrounding
    // block, which would also catch className={...} JSX attribute braces.
    const openBraceIndex = RENDER_BODY.lastIndexOf("{", idx);
    expect(openBraceIndex).toBeGreaterThan(-1);
    const guardMatch = /^\{([\s\S]*?)&&\s*\(/.exec(RENDER_BODY.slice(openBraceIndex));
    expect(guardMatch).not.toBeNull();
    const [binding] = findConstBindingsCalling(RENDER_BODY, "toRunCohortEntry");
    const allowed = new Set([...TRENDS_ENTRY_ALLOWED_IDENTIFIERS, binding?.name ?? "trendsEntry", "cohortLabelSpread"]);
    const ids = freeIdentifiers(guardMatch![1]);
    expect(ids.length).toBeGreaterThan(0);
    for (const id of ids) {
      expect(allowed.has(id), `unexpected free identifier: ${id}`).toBe(true);
    }
  });

  // N2 (docs/a16-wave2-verify.md): `!` is not an identifier, so the
  // free-identifier whitelist above passes `!cohortLabelSpread(...)`
  // unchanged - the line would then render on every SINGLE-label run and
  // stay silent on the multi-label run it exists for. This checks the
  // guard's own text for a direct negation of the call, which the
  // identifier scan above cannot see by construction.
  it("the disclosure guard calls cohortLabelSpread directly, never negated (N2)", () => {
    const idx = RENDER_BODY.indexOf("cohortLabelSpread(");
    expect(idx).toBeGreaterThan(-1);
    const openBraceIndex = RENDER_BODY.lastIndexOf("{", idx);
    expect(openBraceIndex).toBeGreaterThan(-1);
    const guardMatch = /^\{([\s\S]*?)&&\s*\(/.exec(RENDER_BODY.slice(openBraceIndex));
    expect(guardMatch).not.toBeNull();
    expect(guardMatch![1]).not.toMatch(/!\s*cohortLabelSpread\(/);
  });
});

describe("disclosure-guard negation detector (canary)", () => {
  function guardIsPositive(guardExpr: string): boolean {
    return !/!\s*cohortLabelSpread\(/.test(guardExpr);
  }

  it("reports true on the shipped positive guard", () => {
    expect(guardIsPositive("lastRunCohort && cohortLabelSpread(trendsEntry)")).toBe(true);
  });

  it("reports false on N2's mutation - the call negated", () => {
    expect(guardIsPositive("lastRunCohort && !cohortLabelSpread(trendsEntry)")).toBe(false);
  });
});

// ── THE INHERITED CALLER ROW IS NOT ENOUGH - names BOTH required symbols ──

describe("GradingRecordingPanel.tsx references BOTH toRunCohortEntry and cohortLabelSpread, not just one", () => {
  it("references toRunCohortEntry (the whitelist's initialiser)", () => {
    expect(STRIPPED_SOURCE).toMatch(/\btoRunCohortEntry\(/);
  });

  it("references cohortLabelSpread (the disclosure line)", () => {
    expect(STRIPPED_SOURCE).toMatch(/\bcohortLabelSpread\(/);
  });
});

// ── no second TRENDABLE predicate, no second meta type, no re-export ─────

describe("GradingRecordingPanel.tsx imports hasTrendableResults directly, never re-exported through the cohort leaf", () => {
  it("imports hasTrendableResults from ../grading-results/classTrendsEntry, not from ./classTrendsRunCohort", () => {
    expect(STRIPPED_SOURCE).toMatch(
      /import\s*\{[^}]*\bhasTrendableResults\b[^}]*\}\s*from\s*["']\.\.\/grading-results\/classTrendsEntry["']/
    );
    expect(/import\s*\{[^}]*\bhasTrendableResults\b[^}]*\}\s*from\s*["']\.\/classTrendsRunCohort["']/.test(STRIPPED_SOURCE)).toBe(
      false
    );
  });
});
