// Backlog N11, layer C - reachability guard, same idiom as classTrends.wiring.test.ts
// (N12): a layer that is never mounted anywhere ships fully tested and
// completely dead. This suite checks that ClassTrendsPanel.tsx actually
// mounts ClassTrendsDraftPanel, passing the props it needs, and that the
// panel's own source genuinely wires composeClassTrendsDraft/nextDraftUiState
// through to a real clipboard call - and, per Amendment 3, that the
// no-body-clauses ("empty") branch never renders a copy control next to it.
//
// vitest here is node-env and renders nothing - every check below reads
// source as TEXT and pins FACTS and ORDERING, never exact prose spelling
// (source-text-tests-overspecify).
import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";
import { join } from "path";

const PANEL_PATH = join(process.cwd(), "src/app/components/drafted-grades/ClassTrendsPanel.tsx");
const DRAFT_PANEL_PATH = join(process.cwd(), "src/app/components/drafted-grades/ClassTrendsDraftPanel.tsx");
const DRAFT_LIB_PATH = join(process.cwd(), "src/lib/grade/class-trends-draft.ts");
const DRAFT_STATE_PATH = join(process.cwd(), "src/app/components/drafted-grades/classTrendsDraftState.ts");

const panelSource = readFileSync(PANEL_PATH, "utf8");
const draftPanelSource = readFileSync(DRAFT_PANEL_PATH, "utf8");
const draftLibSource = readFileSync(DRAFT_LIB_PATH, "utf8");
const draftStateSource = readFileSync(DRAFT_STATE_PATH, "utf8");

function stripComments(text: string): string {
  return text.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^[ \t]*\/\/.*$/gm, "");
}

const strippedPanel = stripComments(panelSource);
const strippedDraftPanel = stripComments(draftPanelSource);

describe("ClassTrendsPanel mounts ClassTrendsDraftPanel (reachability, not merely rendering)", () => {
  it("imports ClassTrendsDraftPanel from the drafted-grades folder", () => {
    expect(strippedPanel).toMatch(
      /import\s+ClassTrendsDraftPanel\s+from\s*["']\.\/ClassTrendsDraftPanel["']/
    );
  });

  it("renders <ClassTrendsDraftPanel> passing report=/observations=/assignmentName=", () => {
    const idx = strippedPanel.indexOf("<ClassTrendsDraftPanel");
    expect(idx, "ClassTrendsDraftPanel is never rendered").toBeGreaterThan(-1);
    const tagEnd = strippedPanel.indexOf("/>", idx);
    const tag = strippedPanel.slice(idx, tagEnd + 2);
    expect(tag).toMatch(/report=\{report\}/);
    expect(tag).toMatch(/observations=\{/);
    expect(tag).toMatch(/assignmentName=\{/);
  });
});

describe("class-trends-draft.ts exports the real composer", () => {
  it("exports composeClassTrendsDraft", () => {
    expect(draftLibSource).toMatch(/export function composeClassTrendsDraft\(/);
  });
});

describe("ClassTrendsDraftPanel wires the clipboard call through to state (source-text, ordering only)", () => {
  it("imports composeClassTrendsDraft and nextDraftUiState from their real modules", () => {
    expect(strippedDraftPanel).toMatch(
      /import\s*\{\s*composeClassTrendsDraft\s*\}\s*from\s*["']@\/lib\/grade\/class-trends-draft["']/
    );
    expect(strippedDraftPanel).toMatch(
      /import\s*\{\s*nextDraftUiState\s*\}\s*from\s*["']\.\/classTrendsDraftState["']/
    );
  });

  it("imports writeClipboardText and markdownToHtml, not markdown-lite", () => {
    expect(strippedDraftPanel).toMatch(/import\s*\{\s*writeClipboardText\s*\}\s*from\s*["']\.\.\/ui\/clipboard["']/);
    expect(strippedDraftPanel).toMatch(/import\s*\{\s*markdownToHtml\s*\}\s*from\s*["']@\/lib\/markdown["']/);
    expect(strippedDraftPanel).not.toMatch(/markdown-lite/);
  });

  it("calls writeClipboardText(, followed later by two copy-settled dispatches (the .then/.catch pair)", () => {
    const writeIdx = strippedDraftPanel.indexOf("writeClipboardText(");
    expect(writeIdx, "writeClipboardText is never called").toBeGreaterThan(-1);

    const afterWrite = strippedDraftPanel.slice(writeIdx);
    const settledMatches = [...afterWrite.matchAll(/type:\s*["']copy-settled["']/g)];
    expect(settledMatches.length, "expected two copy-settled dispatches after the write call").toBe(2);
  });

  it("never renders a copy control from the empty-body state (Amendment 3)", () => {
    // Structural: find the `state.status === "empty"` branch and the next
    // sibling branch, and assert nothing between them references a Copy
    // control or the copy handler.
    const emptyIdx = strippedDraftPanel.indexOf('state.status === "empty"');
    expect(emptyIdx, "no empty-status branch found").toBeGreaterThan(-1);
    const nextBranchIdx = strippedDraftPanel.indexOf("state.status ===", emptyIdx + 1);
    expect(nextBranchIdx, "no branch found after the empty-status branch").toBeGreaterThan(-1);
    const emptyBranch = strippedDraftPanel.slice(emptyIdx, nextBranchIdx);
    expect(emptyBranch).not.toMatch(/handleCopy/);
    expect(emptyBranch).not.toContain(">Copy<");
  });

  it("never renders a copy control from the below-floor state", () => {
    const belowIdx = strippedDraftPanel.indexOf('state.status === "below-floor"');
    expect(belowIdx, "no below-floor branch found").toBeGreaterThan(-1);
    const nextBranchIdx = strippedDraftPanel.indexOf("state.status ===", belowIdx + 1);
    expect(nextBranchIdx, "no branch found after the below-floor branch").toBeGreaterThan(-1);
    const belowBranch = strippedDraftPanel.slice(belowIdx, nextBranchIdx);
    expect(belowBranch).not.toMatch(/handleCopy/);
    expect(belowBranch).not.toContain(">Copy<");
  });
});

describe('classTrendsDraftState.ts exposes "empty" as its own DraftUiState member, not an empty-string special case', () => {
  it("declares a distinct empty status in DraftUiState", () => {
    expect(draftStateSource).toMatch(/\{\s*status:\s*["']empty["']\s*\}/);
  });
});
