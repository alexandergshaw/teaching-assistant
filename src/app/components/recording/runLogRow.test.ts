// docs/recording-controls-ux-acceptance-criteria.md CC8 / section 6: the
// five run-bearing panels render ONE shared <RunLogRow> each, and the label
// literal no longer lives in any of them. Frozen by the orchestrator after
// wave 1 (2026-09-02): a count over the five NAMED panels, not repo-wide - a
// sixth copy of the same label at drafted-grades/RepoGradingLogPanel.tsx is
// outside the group and must not be counted. Comments are stripped first so
// a header note that mentions the component does not double-count.
import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";
import { join } from "path";

const RUN_BEARING_PANELS = [
  "src/app/components/recording/DiscussionRepliesPanel.tsx",
  "src/app/components/grading-recording/GradingRecordingPanel.tsx",
  "src/app/components/grading-recording/LegibilityProbeModal.tsx",
  "src/app/components/module-deck-capture/ModuleDeckCapturePanel.tsx",
  "src/app/components/recording/TakeAnnouncementPanel.tsx",
];

function stripComments(source: string): string {
  // JSX comments first: stripping the inner block comment first would leave
  // a bare `{}` behind and the JSX pattern would then never match.
  return source
    .replace(/\{\/\*[\s\S]*?\*\/\}/g, "")
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/^[ \t]*\/\/.*$/gm, "");
}

function read(rel: string): string {
  return stripComments(readFileSync(join(process.cwd(), rel), "utf8"));
}

describe("RunLogRow adoption (CC8)", () => {
  it("each of the five run-bearing panels renders exactly one <RunLogRow", () => {
    const counts = Object.fromEntries(
      RUN_BEARING_PANELS.map((rel) => [rel, (read(rel).match(/<RunLogRow\b/g) ?? []).length])
    );
    expect(counts).toEqual(Object.fromEntries(RUN_BEARING_PANELS.map((rel) => [rel, 1])));
  });

  it("every site passes summary and onDownload", () => {
    for (const rel of RUN_BEARING_PANELS) {
      const src = read(rel);
      const idx = src.indexOf("<RunLogRow");
      const tag = src.slice(idx, src.indexOf("/>", idx));
      expect(tag, rel).toMatch(/summary=/);
      expect(tag, rel).toMatch(/onDownload=/);
    }
  });

  it("the download label literal has left the panels and lives in RunLogRow.tsx", () => {
    for (const rel of RUN_BEARING_PANELS) {
      expect(read(rel), rel).not.toContain("Download run log (CSV)");
    }
    expect(read("src/app/components/recording/RunLogRow.tsx")).toContain("Download run log");
  });

  it("scanner canary: the comment stripper removes a JSX comment that names the component", () => {
    expect(stripComments("{/* the shared <RunLogRow> */}\n<RunLogRow summary=\"x\" />")).toMatch(/^\s*<RunLogRow/);
    expect((stripComments("{/* <RunLogRow> */}").match(/<RunLogRow\b/g) ?? []).length).toBe(0);
  });
});
