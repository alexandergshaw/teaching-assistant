import { describe, it, expect } from "vitest";
import fs from "fs";
import path from "path";

// A20 (docs/a20-scope.md AC4, RULING W2): this file did not exist before A20
// - no dedicated wiring test previously covered DiscussionCaptureSettings.tsx's
// DOM structure (confirmed by `find src/app/components/recording -iname
// "DiscussionCaptureSettings*test*"` returning nothing before this file was
// added). Without an assertion here, the natural (and wrong) implementation
// - dropping `autoDownload:` from useDiscussionReplies.ts's start({...})
// call, or wiring the new checkbox to nothing - ships with every other gate
// green: AC5's "exactly once" count assertion never notices, because the
// call still exists and fires, it is just never told to.

const SOURCE_PATH = path.join(process.cwd(), "src/app/components/recording/DiscussionCaptureSettings.tsx");
const source = fs.readFileSync(SOURCE_PATH, "utf8");

function stripComments(text: string): string {
  return text
    .replace(/\{\/\*[\s\S]*?\*\/\}/g, "")
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/^[ \t]*\/\/.*$/gm, "");
}

describe("DiscussionCaptureSettings.tsx - A20's auto-download checkbox, pinned as source text", () => {
  const stripped = stripComments(source);

  // Anchored on the checkbox's own label text (Section 5.1's exact wording,
  // the control's LABEL - not the disable-reason copy, which stays free for
  // a later UX pass to change without breaking this test).
  it('the "Download automatically when recording stops" checkbox is bound to autoDownload/setAutoDownload', () => {
    const idx = stripped.indexOf("Download automatically when recording stops");
    expect(idx).toBeGreaterThan(-1);
    const block = stripped.slice(Math.max(0, idx - 400), idx);
    expect(block).toMatch(/checked=\{autoDownload\}/);
    expect(block).toMatch(/onChange=\{\(e\) => setAutoDownload\(e\.target\.checked\)\}/);
  });

  it("the checkbox is disabled while saveVideo is off - there is nothing to auto-download from a capture with no recording", () => {
    const idx = stripped.indexOf("Download automatically when recording stops");
    const block = stripped.slice(Math.max(0, idx - 400), idx);
    expect(block).toMatch(/disabled=\{!saveVideo\}/);
  });

  it("the disabled reason is discoverable by more than sighted mouse-hover alone - aria-describedby reaches the input via slotProps", () => {
    const idx = stripped.indexOf("Download automatically when recording stops");
    const block = stripped.slice(Math.max(0, idx - 400), idx);
    const describedByMatch = block.match(/slotProps=\{\{\s*input:\s*\{\s*"aria-describedby":\s*([A-Za-z0-9_]+)\s*\}\s*\}\}/);
    expect(describedByMatch).not.toBeNull();
    const hintId = describedByMatch?.[1] ?? "";
    expect(hintId.length).toBeGreaterThan(0);
    expect(stripped).toMatch(new RegExp(`<p id=\\{${hintId}\\}`));
  });
});
