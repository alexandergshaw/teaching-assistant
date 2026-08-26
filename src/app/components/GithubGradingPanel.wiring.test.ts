// Wiring guard for F1 (docs/grading-results-file-viewer-acceptance-criteria.md):
// GithubGradingPanel.tsx used to pass `onOpenPreview={() => {}}` to
// GradingResults - a labelled, keyboard-focusable Preview button that took
// focus and did nothing, recorded as a known defect at
// docs/REGRESSION.md:23278-23286. That entry names exactly why no other gate
// caught it: a zero-arg lambda satisfies `onOpenPreview`'s three-arg type, so
// `tsc --noEmit` is silent, and vitest here is node-env and never renders a
// component, so nothing ever clicked the button either.
//
// This is a SOURCE-READING guard, the idiom
// gradingResultsHelpers.test.ts:722-773 ("grading-results client files stay
// client-bundle-safe") already established for this class of defect, and is
// paired with a canary proving the detector actually fires on the exact
// known-bad literal (and does NOT fire on real wiring) - a memory note in
// this project records that a hand-rolled scan reporting "clean" without
// checking anything has shipped here before.
//
// Comments are stripped before scanning (same habit as
// syllabusUploadTransport.wiring.test.ts) for the same reason in reverse:
// this file's OWN header comment quotes the exact banned literal to explain
// the defect it guards against, and an unstripped scan would trip its own
// "must not match" assertion on that quote.
import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";
import { fileURLToPath } from "url";

function readSource(relativeToThisFile: string): string {
  return readFileSync(fileURLToPath(new URL(relativeToThisFile, import.meta.url)), "utf8")
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/\/\/.*$/gm, "");
}

// Matches `onOpenPreview={() => {}}` and `onOpenPreview={() => { }}` (any
// amount of whitespace inside the empty body) - a zero-arg arrow function
// assigned directly, with nothing in its body. Deliberately does NOT match
// `onOpenPreview={handleOpenPreview}` or `onOpenPreview={(a, b, c) => real(a, b, c)}`,
// which is the whole point: those are real wiring, not a no-op.
const EMPTY_HANDLER_PATTERN = /onOpenPreview=\{\s*\(\s*\)\s*=>\s*\{\s*\}\s*\}/;

describe("onOpenPreview is never wired to an empty-body no-op handler", () => {
  it("canary: the exact regressed literal (no internal space) is detected", () => {
    expect(EMPTY_HANDLER_PATTERN.test("onOpenPreview={() => {}}")).toBe(true);
  });

  it("canary: the same literal with a space inside the braces is also detected", () => {
    expect(EMPTY_HANDLER_PATTERN.test("onOpenPreview={() => { }}")).toBe(true);
  });

  it("canary: a real handler identity is NOT flagged", () => {
    expect(EMPTY_HANDLER_PATTERN.test("onOpenPreview={handleOpenPreview}")).toBe(false);
  });

  it("canary: a real inline three-arg handler is NOT flagged", () => {
    expect(
      EMPTY_HANDLER_PATTERN.test("onOpenPreview={(student, file, trigger) => handleOpenPreview(student, file, trigger)}")
    ).toBe(false);
  });

  it("GithubGradingPanel.tsx no longer contains the empty-body literal", () => {
    const source = readSource("./GithubGradingPanel.tsx");
    expect(source).not.toMatch(EMPTY_HANDLER_PATTERN);
  });

  it("GithubGradingPanel.tsx wires onOpenPreview to its own real handler", () => {
    const source = readSource("./GithubGradingPanel.tsx");
    expect(source).toMatch(/onOpenPreview=\{handleOpenPreview\}/);
    expect(source).toMatch(/const handleOpenPreview = \(student: string, file: PreviewFile, trigger: HTMLElement\) => \{/);
  });
});
