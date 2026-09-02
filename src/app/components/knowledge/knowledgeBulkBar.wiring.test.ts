// Source-text guards for the bulk bar's aesthetics/UX pass redesign. Nothing
// here renders (this repo's vitest is node-env and collects only
// src/**/*.test.ts - no component has ever been rendered by the suite), so
// the structural facts that matter - "the bar is mounted unconditionally now",
// "every action still carries a consequence tag, wherever it now lives", "the
// delete arm still reads its OWN state before mutating it" - are pinned
// against the actual file text instead. Mirrors the idiom
// content-tab/modules/bulkBar.wiring.test.ts already uses (stripComments,
// indexOf-bounded slices, "SABOTAGE TARGET" labels on anything worth
// deliberately breaking to prove the test is live).
import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";
import { join } from "path";

const KNOWLEDGE_TAB_PATH = join(process.cwd(), "src/app/components/KnowledgeTab.tsx");
const knowledgeTabSource = readFileSync(KNOWLEDGE_TAB_PATH, "utf8");
const BULK_BAR_PATH = join(process.cwd(), "src/app/components/knowledge/KnowledgeBulkBar.tsx");
const bulkBarSource = readFileSync(BULK_BAR_PATH, "utf8");

/** Same idiom bulkBar.wiring.test.ts uses: strip comments so a reference
 *  inside a doc comment (this file's own header discusses several of these
 *  strings at length) is never mistaken for a real render site. */
function stripComments(text: string): string {
  return text.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^[ \t]*\/\/.*$/gm, "");
}

describe("stripComments (canary first)", () => {
  it("removes a // comment but leaves real code alone", () => {
    const fixture = ["// <KnowledgeBulkBar used to be gated here", "const x = <KnowledgeBulkBar />;"].join("\n");
    const stripped = stripComments(fixture);
    expect(stripped).not.toContain("used to be gated here");
    expect(stripped).toContain("<KnowledgeBulkBar />");
  });
});

describe("KnowledgeTab.tsx mounts <KnowledgeBulkBar> unconditionally (never jump)", () => {
  it("SABOTAGE TARGET: <KnowledgeBulkBar is rendered, and NOT inside a `selected.size > 0 &&` (or `.kbOverlayAnchor`) gate", () => {
    const stripped = stripComments(knowledgeTabSource);
    const idx = stripped.indexOf("<KnowledgeBulkBar");
    expect(idx, "<KnowledgeBulkBar is never rendered in KnowledgeTab.tsx").toBeGreaterThan(-1);

    // Look at the 400 characters immediately BEFORE the tag - this is where
    // a reintroduced `{kbSelection.selected.size > 0 && (` gate, or a
    // reintroduced `<div className={kbStyles.kbOverlayAnchor}>` wrapper,
    // would have to sit.
    const before = stripped.slice(Math.max(0, idx - 400), idx);
    expect(before, "the bar must not be gated behind a selection-size check").not.toMatch(
      /selected\.size\s*>\s*0\s*&&/
    );
    expect(before, "the bar must not be wrapped in the K2 zero-height overlay anchor").not.toMatch(
      /kbOverlayAnchor/
    );
  });

  it("passes selectedCount as a bare `kbSelection.selected.size` prop (KnowledgeBulkBar itself, not the caller, decides what zero looks like)", () => {
    const stripped = stripComments(knowledgeTabSource);
    const idx = stripped.indexOf("<KnowledgeBulkBar");
    expect(idx).toBeGreaterThan(-1);
    const selfClose = stripped.indexOf("/>", idx);
    const tagText = stripped.slice(idx, selfClose + 2);
    expect(tagText).toMatch(/selectedCount=\{kbSelection\.selected\.size\}/);
  });
});

describe("KnowledgeBulkBar.tsx - the resting row is exactly one row, everything else moved into the overflow menu", () => {
  const stripped = stripComments(bulkBarSource);

  it("SABOTAGE TARGET: the empty-selection branch returns before rendering the resting row (constant-height slot, no controls)", () => {
    const emptyIdx = stripped.indexOf("selectedCount === 0");
    expect(emptyIdx, "the empty-selection guard was not found").toBeGreaterThan(-1);
    const returnIdx = stripped.indexOf("return", emptyIdx);
    const blockEnd = stripped.indexOf("}", returnIdx);
    const block = stripped.slice(emptyIdx, blockEnd + 1);
    expect(block, "the empty branch must return the constant-height slot, not the full bar").toMatch(/kbBulkSlot/);
    expect(block, "the empty branch must not also render the resting controls row").not.toMatch(/kbBulkSlotRow/);
  });

  it("the resting row renders exactly the count, Ask AI, the overflow trigger, and Clear - nothing else", () => {
    const rowIdx = stripped.indexOf("kbBulkSlotRow");
    expect(rowIdx, "kbBulkSlotRow is never rendered").toBeGreaterThan(-1);
    // Bounded to the resting row's own closing </div>, before the Menu.
    const menuIdx = stripped.indexOf("<Menu", rowIdx);
    expect(menuIdx, "<Menu is never rendered after the resting row").toBeGreaterThan(-1);
    const restingSlice = stripped.slice(rowIdx, menuIdx);
    expect(restingSlice).toMatch(/onClick=\{onAskAi\}/);
    expect(restingSlice).toMatch(/onClick=\{onClear\}/);
    expect(restingSlice).toMatch(/aria-haspopup="menu"/);
    // The four items this bar used to render directly in its resting rows
    // (K1-K10) must NOT still be directly in the resting slice - they belong
    // in the menu now.
    expect(restingSlice, "Start recording must not render in the resting row").not.toMatch(/onStartRecording/);
    expect(restingSlice, "Grade via recording must not render in the resting row").not.toMatch(/onStartGrading/);
    expect(restingSlice, "the selection description must not render in the resting row").not.toMatch(
      /selectionDescription\.text/
    );
  });
});

describe("Every bulk action still carries its consequence tag (K7), wherever it now lives", () => {
  const stripped = stripComments(bulkBarSource);

  it("SABOTAGE TARGET: all three tiers are called - read-only (Ask AI), fan-out x2 (Start recording, Grade via recording), destructive (Delete)", () => {
    const readOnlyCalls = [...stripped.matchAll(/kbBulkActionConsequenceTag\("read-only"\)/g)];
    const fanOutCalls = [...stripped.matchAll(/kbBulkActionConsequenceTag\("fan-out"\)/g)];
    const destructiveCalls = [...stripped.matchAll(/kbBulkActionConsequenceTag\("destructive"\)/g)];
    expect(readOnlyCalls.length, "Ask AI's read-only tag is missing").toBeGreaterThanOrEqual(1);
    expect(fanOutCalls.length, "Start recording / Grade via recording must each carry a fan-out tag").toBe(2);
    expect(destructiveCalls.length, "Delete's destructive tag is missing").toBeGreaterThanOrEqual(1);
  });

  it("no tag is wired through a `title` attribute (unreachable by keyboard, unannounced)", () => {
    // Every place a consequence tag is used, it feeds a JSX child/prop other
    // than `title=` - this greps for the specific anti-pattern rather than
    // banning `title` outright (a `title` attribute could legitimately exist
    // elsewhere in this file for an unrelated reason).
    expect(stripped).not.toMatch(/title=\{kbBulkActionConsequenceTag/);
  });
});

describe("Bulk delete's two-click arm reads its OWN armed state before mutating it (K10)", () => {
  const stripped = stripComments(bulkBarSource);

  it("SABOTAGE TARGET: handleDeleteClick captures `wasArmed` from bulkDelete.armed BEFORE calling requestBulkDelete, and only closes the menu when wasArmed was already true", () => {
    const fnIdx = stripped.indexOf("const handleDeleteClick");
    expect(fnIdx, "handleDeleteClick is not defined").toBeGreaterThan(-1);
    const fnEnd = stripped.indexOf("};", fnIdx);
    const fnBody = stripped.slice(fnIdx, fnEnd + 2);

    const wasArmedIdx = fnBody.indexOf("bulkDelete.armed");
    const requestIdx = fnBody.indexOf("requestBulkDelete()");
    expect(wasArmedIdx, "wasArmed is never read from bulkDelete.armed").toBeGreaterThan(-1);
    expect(requestIdx, "requestBulkDelete is never called").toBeGreaterThan(-1);
    expect(wasArmedIdx, "bulkDelete.armed must be read BEFORE requestBulkDelete is called (it flips as a side effect)").toBeLessThan(
      requestIdx
    );
    expect(fnBody, "closeMenu must be conditioned on wasArmed, not called unconditionally").toMatch(
      /if\s*\(\s*wasArmed\s*\)\s*closeMenu\(\)/
    );
  });

  it("the menu's onClose does not disarm the pending delete (arming is a property of the selection value, not the menu's open state - confirmArming.ts's own contract)", () => {
    const menuIdx = stripped.indexOf("<Menu");
    expect(menuIdx).toBeGreaterThan(-1);
    const onCloseMatch = stripped.slice(menuIdx, menuIdx + 200).match(/onClose=\{([^}]*)\}/);
    expect(onCloseMatch, "Menu has no onClose").not.toBeNull();
    expect(onCloseMatch![1], "onClose must be exactly closeMenu, not an inline function that also resets arm state").toBe(
      "closeMenu"
    );
  });

  it("the delete item's label states the cascade-inclusive count (bulkDelete.inclusiveCount), never a bare checkbox count", () => {
    const deleteIdx = stripped.indexOf("Confirm delete (");
    expect(deleteIdx, "the armed delete label was not found").toBeGreaterThan(-1);
    const nearby = stripped.slice(deleteIdx, deleteIdx + 300);
    expect(nearby).toMatch(/bulkDelete\.inclusiveCount/);
  });
});

describe("Exactly one bar-level live region (K8) - status text is computed once, not gated per control", () => {
  const stripped = stripComments(bulkBarSource);

  it("SABOTAGE TARGET: exactly one role=\"status\" element, sourced from kbBulkBarStatusText", () => {
    const statusRegions = [...stripped.matchAll(/role="status"/g)];
    expect(statusRegions.length, "KnowledgeBulkBar must render exactly one status region").toBe(1);
    expect(stripped).toMatch(/aria-live="polite"/);
    expect(stripped).toMatch(/kbBulkBarStatusText\(/);
  });
});
