// ModuleCard.tsx - the selection-cluster wiring (JOB 2/3 of this chunk;
// AC1/AC2/AC5 of docs/module-item-selection-discoverability-acceptance-
// criteria.md).
//
// ModuleCard is a React component and this vitest setup is node-env with no
// renderer, so its JSX cannot be exercised directly - this reads the
// component as TEXT, the same idiom ModulesHeaderBar.wiring.test.ts already
// uses (see that file's own header comment for the same caveat). Nothing
// here can prove a checkbox actually paints indeterminate, that the button
// text is legible, or that Delete is visually far from Select items ON
// SCREEN - only that the SOURCE wires them the way the ACs require.
//
// PINS STRUCTURE, NOT SPELLING (this repo's source-text-tests-overspecify
// rule): every assertion below is about which functions/props are used and
// in what relative order, never about the visible copy those functions
// produce - that copy is free to be reworded without breaking this file.

import { describe, expect, it } from "vitest";
import { readFileSync } from "fs";
import { join } from "path";

const MODULE_CARD_PATH = join(process.cwd(), "src/app/components/content-tab/modules/ModuleCard.tsx");

/** Comments stripped first, mirroring ModulesHeaderBar.wiring.test.ts, so a
 *  comment that happens to mention Checkbox or Delete can never satisfy an
 *  assertion meant to be about real code. Strips block comments anywhere and
 *  full-line `//` comments (leading whitespace then `//` through EOL) - this
 *  file's own comments are always full-line, never trailing, so this is
 *  deliberately narrower than a generic `//.*$` strip. */
function stripComments(text: string): string {
  return text.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^[ \t]*\/\/.*$/gm, "");
}

// Finding 14 (step-10 review): a canary proving stripComments actually
// discriminates, per this repo's own stripComments idiom (see e.g.
// taskInstructionIndicator.wiring.test.ts's identically-named describe
// block) - a scanner that silently strips nothing, or strips real code along
// with comments, would make every assertion below pass vacuously.
describe("stripComments (canary: proves comment-stripping actually discriminates)", () => {
  it("removes a full-line comment mentioning a term this file asserts on", () => {
    expect(stripComments("  // Checkbox mentioned here\nconst x = 1;")).toBe("\nconst x = 1;");
  });

  it("removes a block comment spanning multiple lines", () => {
    expect(stripComments("const x = 1;\n/* Checkbox\n   mentioned here */\nconst y = 2;")).toBe(
      "const x = 1;\n\nconst y = 2;"
    );
  });

  it("leaves a real (non-commented) tag intact", () => {
    expect(stripComments('<span className={styles.ccSelectGroup}>')).toContain("ccSelectGroup");
  });
});

const code = stripComments(readFileSync(MODULE_CARD_PATH, "utf8"));

const exportBranchStart = code.indexOf("if (!m.raw)");
const liveBranchStart = code.indexOf("const mc = m.raw;");
expect(exportBranchStart, "the export-sourced early-return branch was not found").toBeGreaterThan(-1);
expect(liveBranchStart, "the live-module branch was not found").toBeGreaterThan(exportBranchStart);

const exportBranch = code.slice(exportBranchStart, liveBranchStart);
const liveBranch = code.slice(liveBranchStart);

interface SelectGroupRange {
  block: string;
  end: number;
}

/** Locates the FIRST `<span className={styles.ccSelectGroup}>...</span>` in
 *  a slice of source - the selection cluster JOB 3/AC1 asks for (the
 *  checkbox and Select items grouped as one unit). No nested `<span>`
 *  appears between the checkbox and its button today, so the first
 *  `</span>` after the opening marker is the block's own close - the same
 *  "walk to the nearest matching close" idiom as
 *  ModulesHeaderBar.wiring.test.ts's editButtonSource. */
function selectGroupRange(branch: string, label: string): SelectGroupRange {
  const marker = "className={styles.ccSelectGroup}";
  const markerIdx = branch.indexOf(marker);
  expect(markerIdx, `${label}: no ccSelectGroup wrapper found`).toBeGreaterThan(-1);
  const start = branch.lastIndexOf("<span", markerIdx);
  expect(start, `${label}: could not find the owning span for ccSelectGroup`).toBeGreaterThan(-1);
  const end = branch.indexOf("</span>", markerIdx);
  expect(end, `${label}: ccSelectGroup wrapper is never closed`).toBeGreaterThan(markerIdx);
  return { block: branch.slice(start, end), end: end + "</span>".length };
}

describe("ModuleCard: the module checkbox and Select items are grouped, and driven by one shared predicate", () => {
  it.each([
    ["export branch", exportBranch],
    ["live branch", liveBranch],
  ])("%s: the selection cluster wraps a Checkbox together with the Select-items Button", (label, branch) => {
    const { block } = selectGroupRange(branch, label);
    expect(block, `${label}: cluster has no Checkbox`).toMatch(/<Checkbox/);
    expect(block, `${label}: cluster has no Button`).toMatch(/<Button/);
    // Ordering within the cluster: checkbox first, button second - AC1's own
    // "the two read as one selection cluster" with the checkbox leading.
    expect(block.indexOf("<Checkbox")).toBeLessThan(block.indexOf("<Button"));
  });

  // CORRECTED CONTRACT (docs/bulk-bar-reorganization-acceptance-criteria.md
  // section 3c, AC2a/AC2b - overrides the original AC2 as first built here).
  // The original version of this file pinned "indeterminate is passed" and
  // "checkbox and label read the same predicate" - both of which encoded the
  // exact incoherence the correction fixes: a checkbox whose visual state
  // came from item selection while its own onChange wrote module selection,
  // so clicking it produced no visible change. THE RULE: a control's visual
  // state must reflect the state that control writes. The checkbox now
  // reads `selectedModules` (what it writes); the three-state item signal
  // lives only on the button.
  it.each([
    ["export branch", exportBranch],
    ["live branch", liveBranch],
  ])(
    "%s: the checkbox reads selectedModules - what its own onChange writes - and carries no indeterminate state (AC2a)",
    (label, branch) => {
      const { block } = selectGroupRange(branch, label);
      const checkboxEnd = block.indexOf("/>");
      expect(checkboxEnd, `${label}: could not find the checkbox's own closing tag`).toBeGreaterThan(-1);
      const checkboxTag = block.slice(0, checkboxEnd);
      expect(checkboxTag, `${label}: checkbox no longer reads selectedModules membership`).toMatch(
        /selectedModules\.has\(/
      );
      expect(
        checkboxTag,
        `${label}: module/folder selection is binary - the checkbox must not carry an indeterminate prop`
      ).not.toMatch(/indeterminate=/);
    }
  );

  it.each([
    ["export branch", exportBranch],
    ["live branch", liveBranch],
  ])(
    "%s: the checkbox's write target and the Select-items predicate are DIFFERENT sources - a re-derived checkbox is the regression this guards against (section 3c)",
    (label, branch) => {
      const { block } = selectGroupRange(branch, label);
      const checkboxTag = block.slice(0, block.indexOf("/>"));
      const labelSource = branch.match(/selectItemsButtonLabel\((\w+)/);
      expect(labelSource, `${label}: button label is not built via selectItemsButtonLabel`).not.toBeNull();
      // The identifier feeding the button's three-state label (an
      // item-selection SelectionState) must never also feed the checkbox's
      // own checked prop - that exact coupling (checked from items, onChange
      // writing modules) is the bug section 3c fixes. Checked both by
      // absence of the label's own identifier and by absence of the
      // predicate/helper names that would reintroduce the coupling, so a
      // future rename of the identifier cannot silently defeat this guard.
      expect(checkboxTag, `${label}: checkbox reads the same identifier as the item-selection label`).not.toContain(
        labelSource![1]
      );
      expect(
        checkboxTag,
        `${label}: checkbox must not be rebuilt from the item-selection predicate`
      ).not.toMatch(/moduleCheckboxVisualState|moduleSelectionState/);
    }
  );

  it.each([
    ["export branch", exportBranch],
    ["live branch", liveBranch],
  ])("%s: the Select-items tooltip states the search-scope decision (JOB 4/AC7), not left silent", (label, branch) => {
    expect(branch, `${label}: no selectItemsButtonTooltip call found`).toMatch(/selectItemsButtonTooltip\(/);
  });
});

describe("ModuleCard: Delete is not adjacent to Select items in the live branch (AC1)", () => {
  it("Select items sits inside the selection cluster, and Delete is a separate control further down the row, with other controls between them", () => {
    const { block: clusterBlock, end: clusterEnd } = selectGroupRange(liveBranch, "live branch");
    expect(clusterBlock).toMatch(/<Checkbox/);

    const deleteAnchor = liveBranch.indexOf('color="error"');
    expect(deleteAnchor, 'the Delete control (color="error") was not found in the live branch').toBeGreaterThan(-1);
    expect(deleteAnchor, "Delete must come after the selection cluster, not before it").toBeGreaterThan(clusterEnd);

    const between = liveBranch.slice(clusterEnd, deleteAnchor);
    // Not merely "some whitespace" - real controls sit between them today
    // (the name field, the item count, the reorder arrows, the publish
    // toggle, the external-link icon). Pinned by COUNT of other
    // capitalised (component) tags, not by which ones, so this survives any
    // of those being renamed or reordered among themselves - only a change
    // that puts Delete directly against the cluster fails it.
    const otherControlTags = between.match(/<[A-Z]\w*/g) ?? [];
    expect(
      otherControlTags.length,
      "Delete sits immediately next to Select items with nothing rendered between them"
    ).toBeGreaterThan(1);
  });
});
