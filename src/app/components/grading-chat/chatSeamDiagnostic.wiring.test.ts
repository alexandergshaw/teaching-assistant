import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

// Reads source text; not a render test. Pins that the chat panel records the
// Canvas-meta timing around its await, and that the leaf records only through
// the grading wrapper.
function withoutLineComments(src: string): string {
  return src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/.*$/gm, "");
}

const panel = withoutLineComments(readFileSync("src/app/components/grading-chat/GradingChatPanel.tsx", "utf-8"));
const leaf = withoutLineComments(readFileSync("src/app/components/grading-chat/chatSeamDiagnostic.ts", "utf-8"));

describe("chat panel fetch_canvas_meta diagnostic wiring", () => {
  it("captures a start before the await and records after it, with a fixed class", () => {
    const start = panel.indexOf("metaStartedAtMs = chatSeamNowMs()");
    const call = panel.indexOf("await fetchCanvasMetaAction(");
    const record = panel.indexOf('operation: "fetch_canvas_meta"');
    expect(start).toBeGreaterThan(-1);
    expect(start).toBeLessThan(call);
    expect(call).toBeLessThan(record);
    expect(panel).toMatch(/classifyChatSeamFailure\(meta\.error\)/);
  });

  it("the leaf records only on the grading wrapper and passes only the decided class", () => {
    expect(leaf).toContain("recordGradingDiagnosticEntry(");
    expect(leaf).not.toContain("session-diagnostic-log");
    expect(leaf).toMatch(/error: decision\.error/);
  });
});
