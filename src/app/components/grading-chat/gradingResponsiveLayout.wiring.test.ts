// Source wiring only. Browser layout and focus require the actual-component fixture.
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const read = (path: string) => readFileSync(join(process.cwd(), "src/app/components", path), "utf8");
const panel = read("grading-chat/GradingChatPanel.tsx");
const css = read("grading-chat/grading-chat.module.css");
const results = read("GradingResults.tsx");
const context = read("grading-results/GradingResultsContext.tsx");

function composerContainsOnlyInput(source: string): boolean {
  const start = source.indexOf("<div className={chatStyles.stickyComposer}>");
  if (start < 0) return false;
  const dock = source.slice(start, source.indexOf("</div>", start));
  return dock.includes("<ChatComposer") && !/<(?:LedgerNotice|RecordingSplitConfirm|GradingProgress|ChatRepositoryEvidence|ChatRepositoryMappings|ChatFileRolePreview)\b/.test(dock);
}

describe("responsive grading chat presentation wiring", () => {
  it("keeps every intake surface in flow, with only the input inside the dock", () => {
    expect(composerContainsOnlyInput(panel)).toBe(true);
    const dock = panel.indexOf("<div className={chatStyles.stickyComposer}>");
    for (const name of ["LedgerNotice", "RecordingSplitConfirm", "GradingProgress", "ChatRepositoryEvidence", "ChatRepositoryMappings", "ChatFileRolePreview"]) {
      expect(panel.indexOf("<" + name)).toBeLessThan(dock);
    }
    expect(composerContainsOnlyInput('<div className={chatStyles.stickyComposer}><LedgerNotice /><ChatComposer /></div>')).toBe(false);
  });

  it("uses native setup disclosure and limits automatic collapse to the ready transition", () => {
    expect(panel).toMatch(/<details ref=\{setupRef\}[^>]*open/);
    expect(panel).toContain('sessionReady ? "Assignment setup (locked)" : "Assignment setup"');
    expect(panel).toContain("sessionReady && !previousReadyRef.current");
    expect(panel.indexOf('setup.querySelector("summary")?.focus()')).toBeLessThan(panel.indexOf("setup.open = false"));
    const reset = panel.slice(panel.indexOf("const handleNewSession"), panel.indexOf("const withPreparing"));
    expect(reset.indexOf("window.confirm")).toBeLessThan(reset.indexOf("setupRef.current.open = true"));
    expect(panel.indexOf("{CHAT_SESSION_NOT_SAVED_DISCLOSURE}")).toBeGreaterThan(panel.indexOf("</details>", panel.indexOf("<details ref={setupRef}")));
  });

  it("turns sticking off for narrow or short viewports and bounds the rendered floor", () => {
    expect(css).toMatch(/@media \(max-width: 1024px\), \(max-height: 700px\)\s*\{\s*\.stickyComposer\s*\{\s*position: static/);
    expect(css).toContain("min-height: min(var(--composer-floor, 0px), 25vh)");
    expect(css).toContain("max-height: 25vh");
    expect(css).toContain("grid-template-columns: repeat(2, minmax(0, 1fr))");
  });

  it("names focusable local scroll regions, keeps the matrix, and opts in only chat", () => {
    expect(panel).toMatch(/diagnosticsScroll\} role="region" aria-label="Run diagnostics table" tabIndex=\{0\}/);
    expect(results).toMatch(/layout.tableScroll[^>]+role="region" aria-label="Grading results table" tabIndex=\{0\}/);
    expect(results).toContain("Scroll the table sideways for all criteria and actions.");
    expect(results).toContain("<ResultsTableHeaderRow");
    expect(panel.slice(panel.indexOf("<GradingResults"), panel.indexOf("<RunDiagnostics"))).toContain("compactContext");
    expect(context).toContain("return compactContext ? (");
    expect(context).toContain("<summary>Grading context</summary>");
    expect(context).not.toMatch(/<details[^>]*\bopen[=\s>]/);
    for (const path of ["GradingTab.tsx", "GithubGradingPanel.tsx", "LiveFeedPanel.tsx"]) expect(read(path)).not.toContain("compactContext");
  });
});
