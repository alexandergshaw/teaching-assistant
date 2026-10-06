// Source-text guards for KNOWLEDGE-ASK-AI-INDEPENDENT. Nothing renders under
// vitest (node env), so the structural facts are pinned against file text.
import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";
import { join } from "path";
import {
  parseAskAiQuestion,
  serializeAskAiQuestion,
  parseAskAiOpen,
  parseAskAiHistoryOpen,
} from "./knowledge-askai-storage";

const read = (rel: string): string => readFileSync(join(process.cwd(), rel), "utf8");

function withoutLineComments(text: string): string {
  return text.replace(/\/\*[\s\S]*?\*\//g, "").split(/\r?\n/).map((line) => line.replace(/\/\/.*$/, "")).join("\n");
}

const tab = withoutLineComments(read("src/app/components/KnowledgeTab.tsx"));
const askHook = withoutLineComments(read("src/app/components/knowledge/useKnowledgeAskAi.ts"));
const askPanel = withoutLineComments(read("src/app/components/knowledge/KnowledgeAskAiPanel.tsx"));
const askStorage = withoutLineComments(read("src/app/components/knowledge/knowledge-askai-storage.ts"));
const summaryHook = withoutLineComments(read("src/app/components/knowledge/useKnowledgeOverview.ts"));
const summaryPanel = withoutLineComments(read("src/app/components/knowledge/KnowledgeOverviewPanel.tsx"));

describe("withoutLineComments (canary)", () => {
  it("strips comments, keeps code", () => {
    expect(withoutLineComments("// x\nconst a = 1; /* y */")).not.toContain("x");
    expect(withoutLineComments("// x\nconst a = 1;")).toContain("const a = 1;");
  });
});

describe("AC-A1: ask state is keyed on institution, never scopeKey", () => {
  it("SABOTAGE TARGET: the ask hook resets on institution and never references scopeKey / scopePageId state", () => {
    expect(askHook).toMatch(/institution !== prevInstitution/);
    expect(askHook).not.toMatch(/scopeKey/);
    expect(askHook).not.toMatch(/scopeStorageKey/);
  });
  it("the ask hook always asks with scopePageId null", () => {
    expect(askHook).toMatch(/askKnowledgeOverviewAction\(institution, null,/);
    expect(askHook).toMatch(/getKnowledgeOverviewAction\(institution, null\)/);
  });
});

describe("AC-A2: KnowledgeAskAiPanel is mounted once, outside both selection branches", () => {
  it("SABOTAGE TARGET: exactly one mount, before the `!selectedPage ?` branch", () => {
    const mounts = tab.match(/<KnowledgeAskAiPanel/g) ?? [];
    expect(mounts.length).toBe(1);
    const mountIdx = tab.indexOf("<KnowledgeAskAiPanel");
    const branchIdx = tab.indexOf("{!selectedPage ? (");
    expect(branchIdx).toBeGreaterThan(-1);
    expect(mountIdx).toBeLessThan(branchIdx);
  });
  it("the mount is not gated on loadState/bodiesReady/selectedPage", () => {
    const mountIdx = tab.indexOf("<KnowledgeAskAiPanel");
    const before = tab.slice(Math.max(0, mountIdx - 120), mountIdx);
    expect(before).not.toMatch(/loadState|bodiesReady|selectedPage|isEditing/);
  });
});

describe("AC-A3: the summary stays scoped and keeps the hard-cap/skipped notices", () => {
  it("the summary hook is still keyed on scopeKey and owns hardCappedPages / skippedAttachments", () => {
    expect(summaryHook).toMatch(/scopeStorageKey\(institution, scopePageId\)/);
    expect(summaryHook).toMatch(/setHardCappedPages\(result\.hardCappedPages\)/);
    expect(summaryHook).toMatch(/setSkippedAttachments\(result\.skippedAttachments\)/);
    expect(summaryHook).not.toMatch(/askKnowledgeOverviewAction/);
  });
  it("only the summary panel renders them; the ask half does not touch them", () => {
    expect(summaryPanel).toMatch(/describeHardCappedPages/);
    expect(summaryPanel).toMatch(/describeSkippedAttachments/);
    expect(askHook).not.toMatch(/hardCappedPages|skippedAttachments/);
    expect(askPanel).not.toMatch(/hardCappedPages|skippedAttachments/);
  });
  it("the summary panel no longer renders Ask AI or history; both existing mounts remain", () => {
    expect(summaryPanel).not.toMatch(/KnowledgeOverviewHistory|TextField/);
    expect((tab.match(/<KnowledgeOverviewPanel/g) ?? []).length).toBe(2);
  });
});

describe("AC-A4/A5: draft key is nav-independent; history is institution-keyed", () => {
  it("single-value ta- keys, no per-scope map", () => {
    expect(askStorage).toMatch(/"ta-kb-askai-question"/);
    expect(askStorage).not.toMatch(/scopeKey|JSON\.parse/);
    expect(askHook).toMatch(/readAskAiUiState\(\)/);
    expect(askHook).toMatch(/\[institution\]\)/);
  });
  it("parse/serialize behave", () => {
    expect(parseAskAiQuestion(null)).toBe("");
    expect(parseAskAiQuestion("hi")).toBe("hi");
    expect(serializeAskAiQuestion("")).toBeNull();
    expect(serializeAskAiQuestion("q")).toBe("q");
    expect(parseAskAiOpen(null)).toBe(true);
    expect(parseAskAiOpen("false")).toBe(false);
    expect(parseAskAiHistoryOpen(null)).toBe(false);
    expect(parseAskAiHistoryOpen("true")).toBe(true);
  });
});

describe("AC-1: citations link out through onSelectPage", () => {
  it("the panel resolves against pages and calls onSelectPage; the tab wires openSearchHit", () => {
    expect(askPanel).toMatch(/citationPageExists\(citation\.id, pages\)/);
    expect(askPanel).toMatch(/onClick=\{\(\) => onSelectPage\(citation\.id\)\}/);
    expect(tab).toMatch(/<KnowledgeAskAiPanel[^>]*onSelectPage=\{openSearchHit\}/);
  });
});
