// The bulk bar's own section-order oracle (docs/bulk-bar-reorganization-
// acceptance-criteria.md, section 3b/E2 and D2's correction of it: there are
// TWO existing ordering tests - visualizerCoverage.wiring.test.ts:56-87 and
// askAiSelection.wiring.test.ts:46-76 - each pinning the same chain via a
// handful of separate `indexOf`/`toBeGreaterThan`/`toBeLessThan` pairs. This
// file adds ONE oracle covering the full six-section order in a single
// declared list, on top of those (not instead of them - "Leave the existing
// pairwise assertions in place. Nothing is deleted.").
//
// A NOTE ON WHAT THIS ORACLE IS NOT KEYED TO, AND WHY (read before touching
// this file): the assignment brief for this chunk describes the oracle as
// "the order of the six section tags in ModulesView.tsx equals the order
// sequence of the top-level entries in BULK_BAR_GROUPS." Verified against
// the actual code (2026-08-23) rather than trusted: bulkBarGroupCatalog.ts's
// own header comment on BULK_BAR_GROUPS states explicitly that "ORDER HERE
// IS NOT THE BAR'S DOM ORDER CONTRACT" - and that is not a hypothetical
// disclaimer, it is accurate. The catalog's actual order is
// head/items/content/dueDates/grading/submissionType/move/modules/
// addToEach/generate/download/askAi/visualizerCoverage; ModulesView.tsx's
// actual (unchanged, must-not-reorder per this chunk's own D7) render order
// is generate/download/askAi/visualizerCoverage/modules/items - the OPPOSITE
// relative order for these six groups, not merely a different one.
// bulkBarGroups.test.ts's own "BULK_BAR_GROUPS shape" describe block never
// pins the array's order either (only its id set), confirming the omission
// is deliberate rather than an oversight this file should route around by
// reordering something. Reordering the DOM is independently forbidden
// (section 3b/D7's own "Reordering the bar... breaks both ordering tests for
// cosmetic gain"), and bulkBarGroupCatalog.ts is a completed sibling-wave
// file this chunk does not touch. So the oracle below declares the DOM order
// as its own fact (replacing four scattered pairwise comparisons with one
// ordered list) and separately proves every group id it names is real -
// present in BULK_BAR_GROUPS - which is the part of the original intent
// (pin the FACT, not the spelling; fail loudly if a group id renames or a
// seventh entry lands out of place) that a same-array-order comparison
// cannot honestly satisfy here.
import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";
import { join } from "path";
import { BULK_BAR_GROUPS, type BulkBarGroupId } from "./bulkBarGroups";

const MODULES_VIEW_PATH = join(process.cwd(), "src/app/components/content-tab/ModulesView.tsx");
const modulesViewSource = readFileSync(MODULES_VIEW_PATH, "utf8");
const BULK_BAR_HEAD_PATH = join(process.cwd(), "src/app/components/content-tab/modules/BulkBarHead.tsx");
const bulkBarHeadSource = readFileSync(BULK_BAR_HEAD_PATH, "utf8");
const BULK_BAR_GROUP_PATH = join(process.cwd(), "src/app/components/content-tab/modules/BulkBarGroup.tsx");
const bulkBarGroupSource = readFileSync(BULK_BAR_GROUP_PATH, "utf8");
const BULK_ITEMS_SECTION_PATH = join(process.cwd(), "src/app/components/content-tab/modules/BulkItemsSection.tsx");
const bulkItemsSectionSource = readFileSync(BULK_ITEMS_SECTION_PATH, "utf8");
const BULK_MODULES_SECTION_PATH = join(process.cwd(), "src/app/components/content-tab/modules/BulkModulesSection.tsx");
const bulkModulesSectionSource = readFileSync(BULK_MODULES_SECTION_PATH, "utf8");

/** Source with line/block comments stripped - same idiom
 * visualizerCoverage.wiring.test.ts and askAiSelection.wiring.test.ts both
 * use, so a name mentioned only in this file's own header comment (which
 * discusses several of these tags and ids at length) is never mistaken for a
 * real render site. */
function stripComments(text: string): string {
  return text.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^[ \t]*\/\/.*$/gm, "");
}

describe("stripComments (canary first)", () => {
  it("removes a // comment but leaves real code alone", () => {
    const fixture = ["// <GenerateFromSelectionSection used to live here", "const x = <GenerateFromSelectionSection />;"].join("\n");
    const stripped = stripComments(fixture);
    expect(stripped).not.toContain("used to live here");
    expect(stripped).toContain("<GenerateFromSelectionSection />");
  });
});

/**
 * The single declared, reviewable order for the bar's six section
 * components - the oracle itself. Each entry names the JSX tag AND the
 * BulkBarGroupId(s) that section owns in the group model (bulkBarGroups.ts),
 * so a rename on either side is caught by ONE structure instead of two
 * independently-maintained lists. Adding a seventh section here in the
 * wrong slot (or rendering a seventh, undeclared section in ModulesView.tsx
 * ahead of where this list says it belongs) fails the ordering test below at
 * the point the two sequences diverge.
 *
 * All six sections share one shape - `{ facts: BulkBarFacts; groupsState:
 * BulkBarGroupsApi }` - and each imports BULK_BAR_GROUPS directly rather
 * than receiving it as a prop (a `groups` prop briefly existed only on
 * BulkItemsSection.tsx while the six section files were landing concurrently
 * on 2026-08-23; it converged to this shared shape before this chunk's own
 * gates ran, which is what "the six render sites are BARE IDENTIFIERS"
 * below now checks against uniformly).
 */
const DECLARED_SECTION_ORDER: ReadonlyArray<{ tag: string; groupIds: readonly BulkBarGroupId[] }> = [
  { tag: "<GenerateFromSelectionSection", groupIds: ["generate"] },
  { tag: "<DownloadSelectionSection", groupIds: ["download"] },
  { tag: "<AskAiSelectionSection", groupIds: ["askAi"] },
  { tag: "<VisualizerCoverageSection", groupIds: ["visualizerCoverage"] },
  { tag: "<BulkModulesSection", groupIds: ["modules", "addToEach"] },
  { tag: "<BulkItemsSection", groupIds: ["items", "content", "dueDates", "grading", "submissionType", "move"] },
];

describe("bulk bar section order - one oracle (section 3b/E2/D2)", () => {
  it("every group id the oracle names is a real, present entry in BULK_BAR_GROUPS", () => {
    const knownIds = new Set(BULK_BAR_GROUPS.map((g) => g.id));
    for (const { tag, groupIds } of DECLARED_SECTION_ORDER) {
      for (const id of groupIds) {
        expect(knownIds.has(id), `${tag} names group id "${id}" which is not in BULK_BAR_GROUPS`).toBe(true);
      }
    }
  });

  it("the six section tags render in ModulesView.tsx in exactly the declared order", () => {
    const stripped = stripComments(modulesViewSource);
    const indices = DECLARED_SECTION_ORDER.map(({ tag }) => {
      const idx = stripped.indexOf(tag);
      expect(idx, `${tag} is never rendered in ModulesView.tsx`).toBeGreaterThan(-1);
      return idx;
    });
    for (let i = 1; i < indices.length; i++) {
      expect(
        indices[i],
        `${DECLARED_SECTION_ORDER[i].tag} must render after ${DECLARED_SECTION_ORDER[i - 1].tag}`
      ).toBeGreaterThan(indices[i - 1]);
    }
  });

  it("all six render sites fall inside the same bulk bar gate, not scattered elsewhere in the file", () => {
    // Structural anchor, same idiom the two existing ordering tests use: the
    // bulk bar only exists inside the `(selection.selected.size > 0 ||
    // selection.selectedModules.size > 0)` gate, rendered as
    // `styles.bulkBar}`. Every declared tag must appear after that gate.
    const stripped = stripComments(modulesViewSource);
    const barGateIdx = stripped.indexOf("styles.bulkBar}");
    expect(barGateIdx, "bulk bar not found").toBeGreaterThan(-1);
    for (const { tag } of DECLARED_SECTION_ORDER) {
      const idx = stripped.indexOf(tag);
      expect(idx, `${tag} is never rendered`).toBeGreaterThan(-1);
      expect(idx, `${tag} renders before the bulk bar gate`).toBeGreaterThan(barGateIdx);
    }
  });

  it("the six sections render inside .bulkBarBody (AC4/D0's height ceiling), not loose in .bulkBar", () => {
    // AC4/D0: .bulkBarBody is what activates the height ceiling AND the
    // scoped .bulkBarBody .bulkLabel gutter removal (page.module.css) -
    // neither does anything until a real render site carries the class. This
    // is a fact about ModulesView.tsx's own wrapper, not about any one
    // section, so it is pinned once here rather than duplicated per section.
    const stripped = stripComments(modulesViewSource);
    const bodyIdx = stripped.indexOf("styles.bulkBarBody}");
    expect(bodyIdx, "no element carries styles.bulkBarBody").toBeGreaterThan(-1);
    for (const { tag } of DECLARED_SECTION_ORDER) {
      const idx = stripped.indexOf(tag);
      expect(idx, `${tag} renders before .bulkBarBody`).toBeGreaterThan(bodyIdx);
    }
  });
});

describe("ModulesView threads the group model to every section as bare identifiers (section 3b/D3/D4)", () => {
  it("calls useBulkBarGroups exactly once", () => {
    const stripped = stripComments(modulesViewSource);
    const matches = [...stripped.matchAll(/\buseBulkBarGroups\(/g)];
    expect(matches.length, "useBulkBarGroups must be called exactly once, from ModulesView itself").toBe(1);
  });

  it("passes facts and groupsState as bare identifiers at every one of the six render sites", () => {
    // D4's own trap: an arrow-function prop here (e.g. `onToggle={(id) =>
    // ...}`) would put a `>` inside the JSX tag and truncate a
    // `indexOf(">", start)` slice elsewhere, silently passing assertions
    // against broken code. Bare identifiers only - `facts={Y}` and
    // `groupsState={Z}` on every section, where Y/Z are plain identifiers,
    // never a call or an inline function.
    const stripped = stripComments(modulesViewSource);
    for (const { tag } of DECLARED_SECTION_ORDER) {
      const start = stripped.indexOf(tag);
      expect(start, `${tag} is never rendered`).toBeGreaterThan(-1);
      // Bounded to this tag's own opening element: up to the next `/>` or
      // `>` closing the opening tag, whichever comes first - mirrors the
      // bounded-tag-slice idiom askAiSelection.wiring.test.ts already uses.
      const selfClose = stripped.indexOf("/>", start);
      const openClose = stripped.indexOf(">", start);
      const end = selfClose !== -1 && selfClose < openClose ? selfClose + 2 : openClose + 1;
      const tagText = stripped.slice(start, end);
      expect(tagText, `${tag} does not thread facts={...}`).toMatch(/facts=\{[A-Za-z_$][\w$]*\}/);
      expect(tagText, `${tag} does not thread groupsState={...}`).toMatch(/groupsState=\{[A-Za-z_$][\w$]*\}/);
    }
  });
});

describe("Step-10 finding 2 (AC8): a module-only selection names the control that selects items", () => {
  const strippedHead = stripComments(bulkBarHeadSource);

  it("BulkBarHead.tsx imports selectItemsButtonLabel rather than re-spelling a literal", () => {
    expect(strippedHead).toMatch(
      /import\s*\{\s*selectItemsButtonLabel\s*\}\s*from\s*["']\.\/moduleItemSelection["']/
    );
  });

  it("SABOTAGE TARGET: the disclosure is gated on moduleCount > 0 && itemCount === 0, and calls selectItemsButtonLabel(\"none\") rather than a hand-written string", () => {
    const gateIdx = strippedHead.indexOf("moduleCount > 0 && itemCount === 0");
    expect(gateIdx, "the AC8 disclosure's gate was not found").toBeGreaterThan(-1);
    // Bounded to this JSX block's own closing `)}`.
    const blockEnd = strippedHead.indexOf(")}", gateIdx);
    const block = strippedHead.slice(gateIdx, blockEnd + 2);
    expect(block, "the disclosure does not derive its control name from selectItemsButtonLabel").toMatch(
      /selectItemsButtonLabel\(\s*["']none["']\s*\)/
    );
  });

  it("ModulesView.tsx renders <BulkBarHead> with moduleCount/itemCount/busy/onClear, ahead of the six sections", () => {
    const stripped = stripComments(modulesViewSource);
    const headIdx = stripped.indexOf("<BulkBarHead");
    expect(headIdx, "<BulkBarHead is never rendered in ModulesView.tsx").toBeGreaterThan(-1);
    const selfClose = stripped.indexOf("/>", headIdx);
    expect(selfClose, "<BulkBarHead ...> has no self-closing tag").toBeGreaterThan(-1);
    const tagText = stripped.slice(headIdx, selfClose + 2);
    expect(tagText).toMatch(/moduleCount=\{/);
    expect(tagText).toMatch(/itemCount=\{/);
    expect(tagText).toMatch(/busy=\{/);
    expect(tagText).toMatch(/onClear=\{/);

    const firstSectionIdx = Math.min(...DECLARED_SECTION_ORDER.map(({ tag }) => stripped.indexOf(tag)));
    expect(headIdx, "<BulkBarHead must render before the six bulk-bar sections").toBeLessThan(firstSectionIdx);
  });
});

describe("Step-10 finding 4: one bar-level live region for the shared opBusy signal", () => {
  const strippedHead = stripComments(bulkBarHeadSource);
  const strippedGroup = stripComments(bulkBarGroupSource);

  it("SABOTAGE TARGET: BulkBarHead renders exactly one role=\"status\" aria-live=\"polite\" region, gated on its own `busy` prop", () => {
    const statusRegions = [...strippedHead.matchAll(/role="status"/g)];
    expect(statusRegions.length, "BulkBarHead must render exactly one status region").toBe(1);
    const regionIdx = strippedHead.indexOf('role="status"');
    const blockStart = strippedHead.lastIndexOf("{busy &&", regionIdx);
    expect(blockStart, "the status region is not gated on `busy`").toBeGreaterThan(-1);
    expect(strippedHead.slice(blockStart, regionIdx)).not.toContain("}");
    expect(strippedHead).toMatch(/aria-live="polite"/);
  });

  it("ModulesView.tsx computes <BulkBarHead>'s busy as ONLY the shared opBusy flag, never OR-ed with a group-owned signal (F4, confirmation-review fix)", () => {
    // Confirmation review found the region genuinely fixed (one bar-level
    // region exists) but its INPUT still OR-ed in the two signals only
    // "content" and "addToEach" own (bulkAiBusy, descSharedState loading) -
    // so a bulk write on an items-only or modules-only selection still made
    // TWO live regions speak the same fact, and a mixed-selection write made
    // THREE. This test is re-pointed at the corrected expression; see the
    // sibling test below for the other half of the fix (the two group call
    // sites no longer re-OR opBusy back in on their own end).
    const stripped = stripComments(modulesViewSource);
    const headIdx = stripped.indexOf("<BulkBarHead");
    expect(headIdx, "<BulkBarHead is never rendered in ModulesView.tsx").toBeGreaterThan(-1);
    const selfClose = stripped.indexOf("/>", headIdx);
    expect(selfClose, "<BulkBarHead ...> has no self-closing tag").toBeGreaterThan(-1);
    const tagText = stripped.slice(headIdx, selfClose + 2);
    expect(tagText, "<BulkBarHead>'s busy prop must be exactly opBusy").toMatch(/busy=\{opBusy\}/);
    expect(tagText, "<BulkBarHead>'s busy prop must not re-include a group-owned signal").not.toMatch(
      /bulkAiBusy|descSharedState/
    );
  });

  it("SABOTAGE TARGET: neither BulkItemsSection's \"content\" group nor BulkModulesSection's \"addToEach\" group re-announces the shared opBusy flag (F4, confirmation-review fix)", () => {
    // The fix is at the two call sites, not in BulkBarGroup.tsx itself (that
    // component only ever reads whatever `runtime.busy` it is handed). Each
    // fact must now announce from exactly ONE region: opBusy from the
    // bar-level region alone, descSharedState==="loading" from "content"
    // alone, bulkAiBusy from "addToEach" alone.
    const strippedItems = stripComments(bulkItemsSectionSource);
    const contentIdx = strippedItems.indexOf('group={groupById("content")}');
    expect(contentIdx, '<BulkBarGroup group={groupById("content")}...> not found').toBeGreaterThan(-1);
    const contentTagStart = strippedItems.lastIndexOf("<BulkBarGroup", contentIdx);
    const contentTagEnd = strippedItems.indexOf(">", contentIdx);
    const contentTag = strippedItems.slice(contentTagStart, contentTagEnd + 1);
    expect(contentTag, '"content" group\'s runtime must be staticRuntime(descSharedState === "loading") only').toMatch(
      /runtime=\{staticRuntime\(descSharedState === "loading"\)\}/
    );
    expect(contentTag, '"content" group\'s runtime must not also OR in opBusy').not.toMatch(/opBusy/);

    const strippedModules = stripComments(bulkModulesSectionSource);
    const runtimeIdx = strippedModules.indexOf("const addToEachRuntime");
    expect(runtimeIdx, "addToEachRuntime declaration not found").toBeGreaterThan(-1);
    const runtimeEnd = strippedModules.indexOf("};", runtimeIdx);
    const runtimeBlock = strippedModules.slice(runtimeIdx, runtimeEnd + 2);
    expect(runtimeBlock, "addToEachRuntime.busy must be bulkAiBusy only").toMatch(/busy:\s*bulkAiBusy,/);
    expect(runtimeBlock, "addToEachRuntime.busy must not also OR in opBusy").not.toMatch(/opBusy/);
  });

  it("SABOTAGE TARGET: BulkBarGroup.tsx's heading only wraps \"Working...\" in a live region when announceBusy is true, and announceBusy defaults to true", () => {
    expect(strippedGroup).toMatch(/announceBusy\s*=\s*true/);
    // The announced branch: busy AND announceBusy, inside a role="status" span.
    const announcedIdx = strippedGroup.indexOf("runtime.busy && announceBusy");
    expect(announcedIdx, "no branch gates the live region on both busy and announceBusy").toBeGreaterThan(-1);
    const announcedRegion = strippedGroup.slice(announcedIdx, strippedGroup.indexOf(")", announcedIdx) + 400);
    expect(announcedRegion).toMatch(/role="status"/);
    expect(announcedRegion).toMatch(/aria-live="polite"/);
    // The suppressed branch: busy AND NOT announceBusy, no role/aria-live.
    const suppressedIdx = strippedGroup.indexOf("runtime.busy && !announceBusy");
    expect(suppressedIdx, "no branch renders the suppressed (non-live) Working... text").toBeGreaterThan(-1);
    const suppressedLine = strippedGroup.slice(suppressedIdx, strippedGroup.indexOf(";", suppressedIdx) + 1);
    expect(suppressedLine).not.toMatch(/role="status"/);
  });
});
