import { describe, it, expect } from "vitest";
import fs from "fs";
import path from "path";

// docs/message-replies-acceptance-criteria.md M3/M9/M18 (sections 3-7): the
// panel's own RunLogRow contract, M18's outstandingHint placement directly
// under <RunLogRow>, and CC1 (docs/recording-controls-ux-acceptance-criteria.
// md): Start/Stop capture becomes THIS panel's primary once nothing else has
// a claim on it, the same formula the discussion sibling applies - see
// buttonVariant.test.ts's own frozen count (1) for this file.

const SOURCE_PATH = path.join(process.cwd(), "src/app/components/message-replies/MessageRepliesPanel.tsx");
const source = fs.readFileSync(SOURCE_PATH, "utf8");

function stripComments(text: string): string {
  return text
    .replace(/\{\/\*[\s\S]*?\*\/\}/g, "")
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/^[ \t]*\/\/.*$/gm, "");
}

describe("MessageRepliesPanel.tsx - M3's RunLogRow/primary rules and M9/M18's hints, pinned as source text", () => {
  const stripped = stripComments(source);

  it("exactly one <RunLogRow, carrying summary= and onDownload=", () => {
    const count = (stripped.match(/<RunLogRow\b/g) ?? []).length;
    expect(count).toBe(1);
    const idx = stripped.indexOf("<RunLogRow");
    const tag = stripped.slice(idx, stripped.indexOf("/>", idx));
    expect(tag).toMatch(/summary=/);
    expect(tag).toMatch(/onDownload=/);
  });

  it('the "Download run log (CSV)" literal never appears in this panel - it lives only in RunLogRow.tsx', () => {
    expect(stripped).not.toContain("Download run log (CSV)");
  });

  it("summary is built from messageRepliesLogSummaryLine(summarizeMessageRepliesLog(runLog)) - the M18 frozen oracle's own real call chain, not a hand-rolled string", () => {
    expect(stripped).toMatch(/summary=\{messageRepliesLogSummaryLine\(summarizeMessageRepliesLog\(runLog\)\)\}/);
  });

  it("M18: outstandingHint renders DIRECTLY under <RunLogRow>, hidden (no paragraph) when empty", () => {
    const runLogIdx = stripped.indexOf("<RunLogRow");
    const runLogEnd = stripped.indexOf("/>", runLogIdx) + 2;
    const hintIdx = stripped.indexOf("{outstandingHint &&", runLogEnd);
    expect(hintIdx).toBeGreaterThan(-1);
    // Nothing but whitespace/JSX-comment-free text between the two.
    const between = stripped.slice(runLogEnd, hintIdx);
    expect(between.trim()).toBe("");
  });

  it("M9: the instructor-name-empty hint lives in MessageCaptureSettings.tsx (directly under its own field), not duplicated here in the panel", () => {
    expect(stripped).not.toMatch(/Set your Canvas display name/);
  });

  it('no static variant="contained" anywhere in this panel - the only primary spelling is the one variantFor( call on Start/Stop capture (CC1)', () => {
    expect(stripped).not.toMatch(/variant="contained"/);
    const calls = stripped.match(/variantFor\(/g) ?? [];
    expect(calls.length).toBe(1);
  });

  it("CC1: Start/Stop capture becomes the primary via variantFor(capturing || (primaryAction === null && !drafting)) - the same formula the discussion sibling applies", () => {
    const idx = stripped.indexOf("onClick={handleStartStop}");
    expect(idx).toBeGreaterThan(-1);
    const tag = stripped.slice(stripped.lastIndexOf("<Button", idx), idx);
    expect(tag).toMatch(/variant=\{variantFor\(capturing \|\| \(primaryAction === null && !drafting\)\)\}/);
  });

  it("searchInputRef comes from useMessageReplies() (UseMessageRepliesReturn), not a panel-local useRef - MessageReplyToolbar binds the hook's own ref", () => {
    expect(stripped).not.toMatch(/const searchInputRef = useRef/);
    expect(stripped).toMatch(/searchInputRef,/);
    expect(stripped).toMatch(/searchInputRef=\{searchInputRef\}/);
  });

  it("mounts MessageCaptureSettings, MessageReplyToolbar and MessageThreadTable (M1 reachability, one level down)", () => {
    expect(stripped).toMatch(/<MessageCaptureSettings/);
    expect(stripped).toMatch(/<MessageReplyToolbar/);
    expect(stripped).toMatch(/<MessageThreadTable/);
  });

  it("both the toolbar and the table are gated on totalCount > 0, the same whole-table discipline the discussion sibling documents (F11/F13)", () => {
    expect(stripped).toMatch(/\{totalCount > 0 && \(\s*<MessageReplyToolbar/);
    expect(stripped).toMatch(/\{totalCount > 0 && \(\s*<MessageThreadTable/);
  });

  it("the panel's Draft-all eligibility mirrors the hook's: pending or failed, not preview, not skipped, AND has an incoming message - so the count on the button never exceeds what a click dispatches", () => {
    const fnIdx = stripped.indexOf("function isDraftAllPendingEligible");
    expect(fnIdx).toBeGreaterThan(-1);
    const body = stripped.slice(fnIdx, stripped.indexOf("\n}", fnIdx));
    expect(body).toMatch(/row\.state === "pending"/);
    expect(body).toMatch(/row\.state === "failed"/);
    expect(body).toMatch(/!row\.previewOnly/);
    expect(body).toMatch(/!row\.skipped/);
    expect(body).toMatch(/latestIncoming\(row\) !== undefined/);
    expect(stripped).toMatch(/import \{ latestIncoming \} from "\.\/message-thread"/);
  });

  it("the knowledge-context block (CarriedKnowledgePages/AddKnowledgePages) is passed as MessageCaptureSettings' children, matching the discussion original's own pinned placement", () => {
    const openIdx = stripped.indexOf("<MessageCaptureSettings");
    const closeIdx = stripped.indexOf("</MessageCaptureSettings>");
    expect(openIdx).toBeGreaterThan(-1);
    expect(closeIdx).toBeGreaterThan(openIdx);
    const children = stripped.slice(openIdx, closeIdx);
    expect(children).toMatch(/<CarriedKnowledgePages/);
    expect(children).toMatch(/<AddKnowledgePages/);
  });
});
