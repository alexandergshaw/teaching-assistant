// docs/knowledge-recording-handoff-acceptance-criteria.md section 4b - "add
// a page" (the missing half of "select more or less from the recording
// page"). Nothing here renders (this repo's vitest is node-env and collects
// only src/**/*.test.ts - no component has ever been rendered by the suite),
// so the pure logic (tree nesting, id filtering, the budget recompute/diff)
// is pinned directly, and the render-time facts (institution gate, which
// action fetches what, unconditional mounting in both panels) are pinned
// against the actual source text - mirrors knowledgeBulkBar.wiring.test.ts's
// own idiom (stripComments, indexOf-bounded slices, "SABOTAGE TARGET" labels
// on anything worth deliberately breaking to prove the test is live).
import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";
import { join } from "path";
import { idsPendingAdd, computeContextAfterAddingPages, type SummaryTreeNode } from "./AddKnowledgePages";
import { buildKnowledgeContextBlock, DEFAULT_KNOWLEDGE_CONTEXT_MAX_CHARS } from "@/lib/chat/knowledge-context";
import { buildPageTree, type InstitutionPageSummary } from "@/lib/knowledge-base";
import type { SelectedContextPage } from "../knowledge/knowledge-helpers";

function summary(id: string, parentId: string | null, title: string, position: number): InstitutionPageSummary {
  return { id, parentId, title, position };
}

// This file used to own a second, independent tree-nesting implementation
// (buildSummaryTree) with its own describe block here. That function is gone
// - AddKnowledgePages.tsx now calls buildPageTree (src/lib/knowledge-base.ts)
// directly, which is generic over exactly the shape InstitutionPageSummary
// already has (see that function's own docstring for why one builder now
// serves both the Knowledge tab and this picker). These are frozen literal
// oracles written from the documented semantics, not values pulled from
// running either implementation - a test that merely asserted "this picker's
// tree equals buildPageTree's tree" would pass trivially now that they are
// the same call, which is exactly the tautology this avoids.
describe("buildPageTree over InstitutionPageSummary (the recording-side picker's own shape)", () => {
  it("nests children under their parentId, siblings ordered by position", () => {
    const pages = [
      summary("root2", null, "Zebra root", 1),
      summary("root1", null, "Alpha root", 0),
      summary("child1", "root1", "Child one", 0),
      summary("child2", "root1", "Child two", 1),
    ];
    const tree = buildPageTree(pages);
    expect(tree.map((n) => n.id)).toEqual(["root1", "root2"]);
    expect(tree[0].children.map((c) => c.id)).toEqual(["child1", "child2"]);
    expect(tree[1].children).toEqual([]);
  });

  it("orders same-position siblings by title", () => {
    const pages = [summary("b", null, "Banana", 0), summary("a", null, "Apple", 0)];
    const tree = buildPageTree(pages);
    expect(tree.map((n) => n.id)).toEqual(["a", "b"]);
  });

  it("treats a page whose parentId points at nothing as a root", () => {
    const pages = [summary("orphan", "does-not-exist", "Orphan", 0)];
    const tree = buildPageTree(pages);
    expect(tree.map((n) => n.id)).toEqual(["orphan"]);
  });

  it("treats a self-referencing parentId as a root, not an infinite loop", () => {
    const pages = [summary("self", "self", "Self-parented", 0)];
    const tree = buildPageTree(pages);
    expect(tree.map((n) => n.id)).toEqual(["self"]);
  });

  it("SABOTAGE TARGET: a two-node cycle roots the cycle's entry point and keeps BOTH pages visible - this is the one behaviour this picker gained by unifying with buildPageTree; it used to make both pages vanish (see git history of buildSummaryTree)", () => {
    const pages = [summary("a", "b", "A", 0), summary("b", "a", "B", 0)];
    const tree = buildPageTree(pages);
    // "a" is first in the input array, so its walk reaches "b" then loops
    // back to "a" - "a" (not "b") is the cycle's entry point and is rooted;
    // "b" keeps its real parentId ("a") and nests under it. See
    // computeEffectiveParents in src/lib/knowledge-base.ts: walk order, never
    // id or title, decides which cycle member is promoted.
    expect(tree.map((n) => n.id)).toEqual(["a"]);
    expect(tree[0].children.map((c) => c.id)).toEqual(["b"]);
    expect(tree[0].children[0].children).toEqual([]);
  });

  it("returns an empty tree for an empty page list", () => {
    expect(buildPageTree<InstitutionPageSummary>([])).toEqual([]);
  });
});

describe("idsPendingAdd", () => {
  it("keeps only ids not already carried", () => {
    const checked = new Set(["a", "b", "c"]);
    const existing = new Set(["b"]);
    expect(idsPendingAdd(checked, existing)).toEqual(["a", "c"]);
  });

  it("is a no-op (empty result) when everything checked is already carried - 4e", () => {
    const checked = new Set(["a"]);
    const existing = new Set(["a"]);
    expect(idsPendingAdd(checked, existing)).toEqual([]);
  });

  it("returns everything when nothing is carried yet", () => {
    expect(idsPendingAdd(new Set(["a", "b"]), new Set())).toEqual(["a", "b"]);
  });
});

describe("computeContextAfterAddingPages", () => {
  it("adding a page changes what the model receives (text), not just a display list", () => {
    const outcome = computeContextAfterAddingPages([], [
      { id: "n1", title: "New Page", body: "UNIQUE_MARKER_BODY_TEXT" },
    ]);
    expect(outcome.context).not.toBeNull();
    expect(outcome.context!.text).toContain("UNIQUE_MARKER_BODY_TEXT");
    expect(outcome.context!.text).toContain("New Page");
    expect(outcome.addedTitles).toEqual(["New Page"]);
    expect(outcome.pushedOutTitles).toEqual([]);
  });

  it("adding an already-carried page is a no-op, not a duplicate (dedupes by id even if the caller failed to filter)", () => {
    const existing: SelectedContextPage[] = [{ id: "1", title: "A", body: "original body" }];
    // Simulates a stale/duplicate entry slipping through to this function
    // directly (idsPendingAdd is the picker's own first line of defense -
    // this proves the guarantee does not depend on that alone).
    const outcome = computeContextAfterAddingPages(existing, [{ id: "1", title: "A changed", body: "changed body" }]);
    expect(outcome.context!.pages).toEqual(existing);
    expect(outcome.context!.text).toContain("original body");
    expect(outcome.context!.text).not.toContain("changed body");
    expect(outcome.addedTitles).toEqual([]);
    expect(outcome.pushedOutTitles).toEqual([]);
  });

  it("returns null context when nothing is carried and nothing is added", () => {
    const outcome = computeContextAfterAddingPages([], []);
    expect(outcome.context).toBeNull();
    expect(outcome.addedTitles).toEqual([]);
    expect(outcome.pushedOutTitles).toEqual([]);
  });

  describe("AC1's highest-value case: a previously-included page pushed out by the addition, never silently dropped", () => {
    // Binary search for the LARGEST single-page body that still fits the
    // budget entirely on its own (buildKnowledgeContextBlock's "full <=
    // maxChars" early-return path, omittedPages === 0) - this deliberately
    // does not hardcode FRAMING_HEADER's length (an implementation detail
    // this test must not pin - AGENTS.md's "source-text tests over-specify"
    // caution) and instead discovers the exact boundary empirically against
    // the real budget function.
    function maxFittingBodyLength(maxChars: number): number {
      let lo = 0;
      let hi = maxChars;
      while (lo < hi) {
        const mid = Math.ceil((lo + hi) / 2);
        const result = buildKnowledgeContextBlock({
          pages: [{ title: "Old page", body: "a".repeat(mid) }],
          attachments: [],
        });
        if (result.omittedPages === 0 && result.text.length <= maxChars) lo = mid;
        else hi = mid - 1;
      }
      return lo;
    }

    it("SABOTAGE TARGET: an existing page that fit ALONE is pushed out once a second page is merely present, while the new page (added AFTER it) still gets in - proves this is a real diff against fresh inclusion, never a prefix/suffix assumption", () => {
      const maxLen = maxFittingBodyLength(DEFAULT_KNOWLEDGE_CONTEXT_MAX_CHARS);
      // Sanity check on the construction itself, not just the outcome below -
      // if this ever fails, the scenario stopped being what it claims to be.
      const alone = buildKnowledgeContextBlock({
        pages: [{ title: "Old page", body: "a".repeat(maxLen) }],
        attachments: [],
      });
      expect(alone.omittedPages, "construction check: the old page must fit completely on its own").toBe(0);

      const existing: SelectedContextPage[] = [{ id: "old", title: "Old page", body: "a".repeat(maxLen) }];
      const added: SelectedContextPage[] = [{ id: "new", title: "New page", body: "b".repeat(100) }];

      const outcome = computeContextAfterAddingPages(existing, added);

      // The OLD page - previously included, unchanged itself - is reported
      // pushed out. This is the one assertion this whole test exists for:
      // never silently drop it.
      expect(outcome.pushedOutTitles).toEqual(["Old page"]);
      // The loop is `continue`, not `break` (knowledge-context.ts's own
      // contract) - the NEW page, appearing later in the merged list, still
      // gets in even though the earlier page was excluded. A naive
      // "assume only a trailing suffix can be dropped" implementation would
      // get this backwards.
      expect(outcome.addedTitles).toEqual(["New page"]);
      expect(outcome.context!.pages!.map((p) => p.id)).toEqual(["new"]);
      expect(outcome.context!.text).not.toContain("Old page");
      expect(outcome.context!.text).toContain("New page");
    });
  });
});

// ---------------------------------------------------------------------------
// Source-text guards: what a pure-function test cannot see - which server
// action fetches what, and where each panel mounts this component. Mirrors
// knowledgeBulkBar.wiring.test.ts's own idiom.
// ---------------------------------------------------------------------------

function stripComments(text: string): string {
  return text.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^[ \t]*\/\/.*$/gm, "");
}

const PICKER_PATH = join(process.cwd(), "src/app/components/recording/AddKnowledgePages.tsx");
const pickerSource = stripComments(readFileSync(PICKER_PATH, "utf8"));

describe("AddKnowledgePages.tsx wiring", () => {
  it("SABOTAGE TARGET: the tree load uses the summaries action (no body), never the full-bodied list action", () => {
    expect(pickerSource).toMatch(/listInstitutionPageSummariesAction\(/);
    expect(pickerSource.includes("listInstitutionPagesAction(")).toBe(false);
  });

  it("SABOTAGE TARGET: bodies are fetched only for the pending-add ids, never the whole summaries list", () => {
    const callIdx = pickerSource.indexOf("getInstitutionPagesByIdsAction(");
    expect(callIdx, "getInstitutionPagesByIdsAction is never called").toBeGreaterThan(-1);
    const argEnd = pickerSource.indexOf(")", callIdx);
    const arg = pickerSource.slice(callIdx, argEnd + 1);
    expect(arg).toContain("(ids)");
    expect(arg).not.toMatch(/summaries/);
  });

  it("a missing institution renders an explicit state and the tree section requires `institution &&` first - never an empty picker", () => {
    expect(pickerSource).toMatch(/!institution\s*&&/);
    expect(pickerSource).toMatch(/No institution is selected/);
    const gateIdx = pickerSource.indexOf("institution && summaries && summaries.length > 0");
    expect(gateIdx, "the institution && summaries && summaries.length > 0 gate was not found").toBeGreaterThan(-1);
    // Search for <SummaryTreeList STARTING FROM the gate - the component
    // also renders <SummaryTreeList recursively inside SummaryTreeRow (for
    // nested children), which appears EARLIER in the file and is gated on
    // `hasChildren && isOpen`, not on `institution`; a plain first-match
    // indexOf would find that one instead and pass vacuously.
    const treeIdx = pickerSource.indexOf("<SummaryTreeList", gateIdx);
    expect(treeIdx, "<SummaryTreeList must render only after that gate").toBeGreaterThan(gateIdx);
  });

  it("an already-carried row's checkbox is disabled - a checked-and-disabled row can never be toggled back into `checked`", () => {
    expect(pickerSource).toMatch(/disabled=\{alreadyCarried\}/);
  });
});

const DISC_PANEL_PATH = join(process.cwd(), "src/app/components/recording/DiscussionRepliesPanel.tsx");
const discPanelSource = stripComments(readFileSync(DISC_PANEL_PATH, "utf8"));
const GRADING_PANEL_PATH = join(process.cwd(), "src/app/components/grading-recording/GradingRecordingPanel.tsx");
const gradingPanelSource = stripComments(readFileSync(GRADING_PANEL_PATH, "utf8"));

/** Given source text and the index of a `{COND && (` JSX gate's own `&&`,
 *  returns the index of that block's matching closing `)` (paren-depth
 *  tracking, starting from the `(` immediately after the `&&`) - so a caller
 *  can tell "rendered AFTER this block closes" apart from "merely nearby in
 *  the source, but actually a preceding sibling", which a fixed-size
 *  "slice the N characters before" window cannot reliably distinguish once
 *  the gated block itself is short. */
function findGateBlockEnd(source: string, gateIdx: number): number {
  const openParenIdx = source.indexOf("(", gateIdx);
  let depth = 0;
  for (let i = openParenIdx; i < source.length; i += 1) {
    const ch = source[i];
    if (ch === "(") depth += 1;
    else if (ch === ")") {
      depth -= 1;
      if (depth === 0) return i;
    }
  }
  return -1;
}

describe("DiscussionRepliesPanel.tsx mounts <AddKnowledgePages> unconditionally", () => {
  it("SABOTAGE TARGET: <AddKnowledgePages is rendered, and not nested inside the `knowledgeContextLabel &&` gate", () => {
    const idx = discPanelSource.indexOf("<AddKnowledgePages");
    expect(idx, "<AddKnowledgePages is never rendered in DiscussionRepliesPanel.tsx").toBeGreaterThan(-1);
    const gateIdx = discPanelSource.indexOf("{knowledgeContextLabel &&");
    expect(gateIdx, "the knowledgeContextLabel && gate was not found").toBeGreaterThan(-1);
    const closeIdx = findGateBlockEnd(discPanelSource, gateIdx);
    expect(closeIdx, "could not find the matching close for the knowledgeContextLabel && block").toBeGreaterThan(-1);
    expect(idx, "<AddKnowledgePages must not be nested inside the knowledgeContextLabel && block").toBeGreaterThan(
      closeIdx
    );
  });
});

describe("GradingRecordingPanel.tsx mounts <AddKnowledgePages> unconditionally", () => {
  it("SABOTAGE TARGET: <AddKnowledgePages sits OUTSIDE the `knowledgeContext &&` block, never nested inside it", () => {
    const gateIdx = gradingPanelSource.indexOf("{knowledgeContext &&");
    expect(gateIdx, "the knowledgeContext && gate was not found").toBeGreaterThan(-1);
    const closeIdx = findGateBlockEnd(gradingPanelSource, gateIdx);
    expect(closeIdx, "could not find the matching close for the knowledgeContext && block").toBeGreaterThan(-1);

    const addIdx = gradingPanelSource.indexOf("<AddKnowledgePages");
    expect(addIdx, "<AddKnowledgePages is never rendered in GradingRecordingPanel.tsx").toBeGreaterThan(-1);
    expect(addIdx, "<AddKnowledgePages must be OUTSIDE (after) the knowledgeContext && block, not nested inside it").toBeGreaterThan(
      closeIdx
    );
  });
});

// Type-only reference so `SummaryTreeNode` stays exercised by this file's own
// import list if a future refactor stops using it in an expression above.
const _typeCheck: SummaryTreeNode[] = [];
void _typeCheck;
