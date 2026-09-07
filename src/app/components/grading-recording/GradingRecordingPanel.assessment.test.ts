// docs/course-student-intelligence-acceptance-criteria.md D22b/D23e: the
// grading panel's assessment selector - "the blocking piece" this task's own
// brief names. GradingRecordingPanel.tsx is a React component and nothing
// renders under this repo's vitest (node-env, collects only src/**/*.test.ts
// - see this repo's own AGENTS.md note and GradingRecordingPanel.wiring.test.ts's
// own identical header). These are source-text checks for the wiring a
// pure-function unit test cannot reach: that the new control persists under
// its own literal key, is trimmed before it becomes a scope value, and is
// threaded into useGradingRows as the second argument - never left an
// unread, decorative piece of state.
//
// grading-rows.test.ts's own "grading-recording persisted key canary" covers
// the generic read+write wiring for "ta-rec-grade-assessment" already (this
// file's own STORAGE_KEY_ASSESSMENT constant is what that canary's regex
// scan picks up) - the checks below are specific to THIS control's own
// correctness, which that generic canary cannot see: trimming, the
// never-required-to-capture design decision, and the exact hook call shape.
//
// SABOTAGE CHECK LOG (verified by actually breaking the source and
// re-running each affected `it`, then reverting - see this task's own
// report for the full transcript):
//   1. Passed `assessmentLabel` (untrimmed) instead of `assessmentId` to
//      useGradingRows -> "assessmentId ... is passed as useGradingRows's
//      second argument" failed as expected. Reverted.
//   2. Removed `.trim()` from `assessmentLabel.trim()` -> "assessmentId is
//      the TRIMMED form of assessmentLabel" failed as expected. Reverted.
//   3. Changed STORAGE_KEY_ASSESSMENT's literal value to a stray prefix
//      variant ("ta-rec-grade-assess") -> the exact-literal assertion below
//      failed as expected, and separately the grading-rows.test.ts key-set
//      canary would also have failed (not re-run here; see that file's own
//      suite). Reverted.

import { describe, it, expect } from "vitest";
import * as fs from "fs";
import * as path from "path";

const PANEL_PATH = path.resolve(process.cwd(), "src/app/components/grading-recording/GradingRecordingPanel.tsx");
const source = fs.readFileSync(PANEL_PATH, "utf-8");

describe("GradingRecordingPanel.tsx D22b/D23e assessment selector wiring", () => {
  it('STORAGE_KEY_ASSESSMENT is the exact literal "ta-rec-grade-assessment", bound to a const (never a bare/template-literal key)', () => {
    expect(source).toMatch(/const STORAGE_KEY_ASSESSMENT = "ta-rec-grade-assessment";/);
  });

  it("assessmentLabel is read from STORAGE_KEY_ASSESSMENT in the useState initializer, guarded by typeof window - mirrors courseId's own initializer shape", () => {
    expect(source).toMatch(
      /const \[assessmentLabel, setAssessmentLabelState\] = useState<string>\(\(\) => \{\s*if \(typeof window === "undefined"\) return "";\s*return window\.localStorage\.getItem\(STORAGE_KEY_ASSESSMENT\) \?\? "";\s*\}\);/
    );
  });

  it("setAssessmentLabel writes STORAGE_KEY_ASSESSMENT on every call - a real write call wired to the same const the read uses", () => {
    expect(source).toMatch(/window\.localStorage\.setItem\(STORAGE_KEY_ASSESSMENT, next\);/);
  });

  it("assessmentId is the TRIMMED form of assessmentLabel, never the raw typed value", () => {
    expect(source).toMatch(/const assessmentId = assessmentLabel\.trim\(\);/);
    expect(source).not.toMatch(/const assessmentId = assessmentLabel;/);
  });

  it("assessmentId (the trimmed value) - not assessmentLabel, not courseId alone - is passed as useGradingRows's second argument", () => {
    expect(source).toMatch(/const gradingRows = useGradingRows\(courseId, assessmentId\);/);
  });

  it("assessmentOptions is derived from gradingRows.rawRows (already course-scoped), collecting only truthy row.assessment values - never a fixed/invented catalogue", () => {
    expect(source).toMatch(
      /const assessmentOptions = useMemo\(\(\) => \{\s*const seen = new Set<string>\(\);\s*for \(const row of gradingRows\.rawRows\) \{\s*if \(row\.assessment\) seen\.add\(row\.assessment\);\s*\}\s*return Array\.from\(seen\)\.sort\(\);\s*\}, \[gradingRows\.rawRows\]\);/
    );
  });

  it("the Autocomplete field is freeSolo (never a closed set of options) and controlled by assessmentLabel/setAssessmentLabel", () => {
    expect(source).toMatch(/<Autocomplete\s*\n\s*freeSolo\s*\n\s*options=\{assessmentOptions\}\s*\n\s*value=\{assessmentLabel\}\s*\n\s*onInputChange=\{\(_, next\) => setAssessmentLabel\(next\)\}/);
  });

  it('the "no assessment set" hint is gated on assessmentId === "" (the trimmed value), never on assessmentLabel directly - so whitespace-only input still shows the hint', () => {
    expect(source).toMatch(/\{assessmentId === "" && \(/);
  });

  it("capture is NOT disabled on a missing assessment - mirrors course's own non-blocking precedent (D21d): the Start/Stop capture Button's whole element carries no reference to assessmentId at all", () => {
    // The run row's Start/Stop capture button is the one place capture could
    // be blocked; captures its whole JSX element (variant/color/size/onClick
    // through the closing tag) and asserts none of that references
    // assessmentId - the "unattributed is honest, not blocked" design
    // decision this task's report explains, made impossible to silently
    // reverse by adding a `disabled` prop that reads it.
    const match = source.match(/<Button\s*\n\s*variant=\{variantFor\(capturing \|\| gradingRows\.totalCount === 0\)\}[\s\S]*?<\/Button>/);
    expect(match, "expected to find the Start/Stop capture Button element").not.toBeNull();
    expect(match![0]).not.toMatch(/assessmentId/);
    expect(match![0]).toMatch(/onClick=\{handleStartStop\}/);
  });
});
