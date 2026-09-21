import { describe, it, expect } from "vitest";
import fs from "fs";
import path from "path";

// docs/a16-wave1-scope.md section 8: GradingCaptureSettings.tsx is a React
// component and nothing renders under this repo's vitest (node-env, collects
// only src/**/*.test.ts - see this repo's own AGENTS.md note). Modeled on
// DiscussionCaptureSettings.wiring.test.ts's shape: a LOCAL stripComments
// (never imported from another *.test.ts - that re-runs its describe
// blocks), each assertion anchored on the control's own visible label text,
// pinning the FACT and the ORDERING, never the spelling.
//
// Assertions 2 and 3 below are MOVED out of
// GradingRecordingPanel.assessment.test.ts (the panel's own source-text
// suite), not written fresh - the region they pinned there now lives here.
// Sabotage-checked in their new home by the same mutations that reddened
// them in the old one (dropping `freeSolo`; changing the hint's gate to
// `assessmentLabel === ""`), using a cp backup, never `git checkout --`. See
// this task's own report for the transcript.

const SOURCE_PATH = path.join(process.cwd(), "src/app/components/grading-recording/GradingCaptureSettings.tsx");
const source = fs.readFileSync(SOURCE_PATH, "utf8");

function stripComments(text: string): string {
  return text
    .replace(/\{\/\*[\s\S]*?\*\/\}/g, "")
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/^[ \t]*\/\/.*$/gm, "");
}

describe("GradingCaptureSettings.tsx - the extracted Capture fieldset", () => {
  const stripped = stripComments(source);

  it("is a real file, not a renamed/moved stub - a vacuous pass would make every other row below meaningless", () => {
    expect(source.length).toBeGreaterThan(1000);
  });

  it('the course select stays MOUNTED and disabled while loading, never swapped out behind a ternary (Fixer pass finding 2)', () => {
    const idx = stripped.indexOf('label="Course (for roster matching)"');
    expect(idx).toBeGreaterThan(-1);
    const block = stripped.slice(Math.max(0, idx - 200), idx + 400);
    expect(block).toMatch(/disabled=\{coursesLoading\}/);
    // Not a ternary swapping the field out - no "coursesLoading ?" gating
    // the TextField element itself.
    expect(stripped).not.toMatch(/coursesLoading\s*\?\s*[\s\S]{0,40}<TextField/);
  });

  it("the Autocomplete field is freeSolo (never a closed set of options) and controlled by assessmentLabel/setAssessmentLabel", () => {
    expect(stripped).toMatch(
      /<Autocomplete\s*\n\s*freeSolo\s*\n\s*options=\{assessmentOptions\}\s*\n\s*value=\{assessmentLabel\}\s*\n\s*onInputChange=\{\(_, next\) => setAssessmentLabel\(next\)\}/
    );
  });

  it('the "no assessment set" hint is gated on assessmentId === "" (the trimmed value), never on assessmentLabel directly - so whitespace-only input still shows the hint', () => {
    expect(stripped).toMatch(/\{assessmentId === "" && \(/);
    expect(stripped).not.toMatch(/\{assessmentLabel === "" && \(/);
  });

  it("the no-roster hint gates on the combination courseId && !selectedRosterText, never on courseId alone", () => {
    expect(stripped).toMatch(/\{courseId && !selectedRosterText && \(/);
  });

  it("no primary-button spelling in this file - keeps buttonVariant.test.ts's FROZEN_PRIMARY_SITES from silently gaining an entry", () => {
    expect(stripped).not.toMatch(/variant="contained"|variantFor\(|idleVariant="contained"/);
  });

  it("no hook is declared here - the whole reason this extraction is safe under preserve-manual-memoization", () => {
    expect(stripped).not.toMatch(/\buseState\b|\buseEffect\b|\buseCallback\b|\buseMemo\b|\buseRef\b/);
  });
});
