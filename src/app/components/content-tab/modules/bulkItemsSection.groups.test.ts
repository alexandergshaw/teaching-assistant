// BulkItemsSection's six bulk-bar groups - reachability and consequence
// pins (docs/bulk-bar-reorganization-acceptance-criteria.md, AC1/AC2/D3/D6).
//
// WHY THIS FILE EXISTS. This section owns six of the bar's thirteen groups
// ("items", "content", "dueDates", "grading", "submissionType", "move") and
// three of the four highest-consequence controls in the whole bar (Remove,
// Set description, Delete from Canvas). Wrapping the section's rows in
// `<BulkBarGroup>` is a real behaviour change to accessibility semantics and
// to which groups can ever be hidden - nothing in the existing
// bulkItemsSection.rubricSource.wiring.test.ts (a narrow rubric-only guard)
// exercises any of it, so it shipped with zero coverage until this file.
//
// vitest here is node-env and collects only `src/**/*.test.ts`
// (vitest.config.ts:13-14) - NO COMPONENT IS EVER RENDERED. Nothing below
// can prove a group actually collapses on screen, that a screen reader
// announces its name, or that keyboard tab order is sane. What IS testable
// and is pinned here: the six groups are wired to the real catalog by id
// (not by a hand-copied literal that could drift), no disclosure body is
// ever gated on `open` (D3 - that would unmount a collapsed group's
// controls, and a control that never mounts never writes its persisted
// default), the section's refusal branch never becomes a `<details>` (D6 -
// collapsing it would hide the only explanation of why the section is
// empty), every control visible in the pre-reorganization file is still
// rendered, and the three highest-consequence controls this section owns
// are provably inside a group that cannot collapse - using the REAL
// `mayCollapse`/`groupTier` functions from ./bulkBarGroups, not a
// reimplementation of their logic here.
//
// Pin the FACT and the ORDERING, never the spelling (docs/DEV_LOOP.md
// section 9) - this feature area has been bitten twice by over-specified
// source-text assertions, most recently in this same chunk. Every
// assertion below matches an identifier, a structural anchor, or a real
// function call - never button label prose.
import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";
import { join } from "path";
import { groupById, mayCollapse, type BulkBarFacts, type BulkBarGroupId } from "./bulkBarGroups";

const SECTION_PATH = join(process.cwd(), "src/app/components/content-tab/modules/BulkItemsSection.tsx");
const source = readFileSync(SECTION_PATH, "utf8");

/** Source with comments stripped, so this file's own prose (which discusses
 * "open", "details" and every control at length) can never satisfy an
 * assertion meant to be about real code - same idiom
 * bulkItemsSection.rubricSource.wiring.test.ts already uses. */
function stripComments(text: string): string {
  return text.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^[ \t]*\/\/.*$/gm, "");
}

describe("stripComments (canary first)", () => {
  it("removes a // comment but leaves real code alone", () => {
    const fixture = ['// findGroup("content") used to live here', 'const x = groupById("content");'].join("\n");
    const stripped = stripComments(fixture);
    expect(stripped).not.toContain('findGroup("content")');
    expect(stripped).toContain('groupById("content")');
  });
});

const code = stripComments(source);

/** The six group ids this section owns, in the order they render (does not
 * need to match BULK_BAR_GROUPS's own declaration order - that array's
 * order is "a convenient, readable order for the data itself", per that
 * file's own header - only this section's JSX order needs to be internally
 * consistent, which is what the ordering assertion below checks). */
const OWNED_GROUP_IDS: BulkBarGroupId[] = ["items", "content", "dueDates", "grading", "submissionType", "move"];

/** A "some items selected, nothing else true" facts object - enough to make
 * every owned group's controls visible, and no other group's `bulkAddType`-
 * gated branches relevant to a group this section does not own. */
function itemsSelectedFacts(overrides: Partial<BulkBarFacts> = {}): BulkBarFacts {
  return {
    moduleCount: 0,
    itemCount: 3,
    selectedAssignmentCount: 0,
    singleItemEditKind: "none",
    bulkAddType: "Assignment",
    bulkAddFileContentPresent: false,
    bulkAddQuestionsCount: 0,
    bulkItemsQuestionsCount: 0,
    rubricsCount: 0,
    offersDeck: false,
    offersScript: false,
    offersIntroDiscussion: false,
    generationKindsCount: 0,
    hasDiagLog: false,
    coverageScanned: false,
    coveredCount: 0,
    creatableGapsCount: 0,
    ...overrides,
  };
}

describe("BulkItemsSection wraps its six owned groups in BulkBarGroup", () => {
  it("imports BulkBarGroup and the shared groupById lookup directly (step-10 review: groupById replaces the six local findGroup copies)", () => {
    expect(code).toMatch(/import\s*\{\s*BulkBarGroup\s*\}\s*from\s*["']\.\/BulkBarGroup["']/);
    // groupById is imported directly from ./bulkBarGroups - not threaded
    // down as a prop, and not wrapped in a second local helper - the final,
    // repo-wide convention every section converged on after step-10 review
    // found six near-identical local `findGroup` copies (three different
    // error messages, one of them called at module scope, in
    // BulkModulesSection.tsx).
    expect(code).toMatch(/import\s*\{[^}]*\bgroupById\b[^}]*\}\s*from\s*["']\.\/bulkBarGroups["']/);
  });

  it("receives facts and groupsState as props, not a `groups` catalog prop", () => {
    // The bar's shared fact bag and its one shared open/closed persistence
    // API are still threaded down from ModulesView (there is exactly one
    // instance of each) - only the catalog itself is imported directly.
    expect(code).toMatch(/facts:\s*BulkBarFacts/);
    expect(code).toMatch(/groupsState:\s*BulkBarGroupsApi/);
    expect(code).not.toMatch(/\bgroups:\s*BulkBarGroupDef\[\]/);
  });

  it("renders exactly six <BulkBarGroup> instances", () => {
    const matches = code.match(/<BulkBarGroup\b/g) ?? [];
    expect(matches.length).toBe(6);
  });

  it.each(OWNED_GROUP_IDS)('wires the "%s" group to the real catalog by id, not a hand-copied literal', (id) => {
    // Structural: a <BulkBarGroup ... group={groupById("id")} ...> somewhere
    // in the file. Anchored on the exact `groupById("id")` call so a typo'd
    // id, or a group looked up by index instead of by id, fails this.
    const re = new RegExp(`<BulkBarGroup[^>]*group=\\{groupById\\("${id}"\\)\\}`);
    expect(code, `group "${id}" is not wired via groupById("${id}")`).toMatch(re);
  });

  it("renders the six groups in a fixed, legible order (items, content, dueDates, grading, submissionType, move)", () => {
    const indices = OWNED_GROUP_IDS.map((id) => code.indexOf(`groupById("${id}")`));
    for (const [i, idx] of indices.entries()) {
      expect(idx, `group "${OWNED_GROUP_IDS[i]}" not found`).toBeGreaterThan(-1);
    }
    for (let i = 1; i < indices.length; i++) {
      expect(indices[i], `"${OWNED_GROUP_IDS[i]}" does not come after "${OWNED_GROUP_IDS[i - 1]}"`).toBeGreaterThan(indices[i - 1]);
    }
  });
});

describe("Step-10 finding 4: five of six groups suppress their own live announcement of the shared opBusy signal", () => {
  // "items", "dueDates", "grading", "submissionType" and "move" all share
  // ModulesView's single `opBusy` flag with each other AND with
  // BulkModulesSection's "modules" group - one bulk write used to be
  // announced from up to eight group headings at once. Full decision on
  // BulkBarGroup.tsx's `announceBusy` prop.
  const SUPPRESSED_IDS: BulkBarGroupId[] = ["items", "dueDates", "grading", "submissionType", "move"];

  it.each(SUPPRESSED_IDS)('the "%s" group passes announceBusy={false} to <BulkBarGroup>', (id) => {
    const re = new RegExp(`<BulkBarGroup[^>]*group=\\{groupById\\("${id}"\\)\\}[^>]*announceBusy=\\{false\\}`);
    expect(code, `group "${id}" does not pass announceBusy={false}`).toMatch(re);
  });

  it('SABOTAGE TARGET: the "content" group keeps the default (announced) - it also reacts to descSharedState, a signal no other group shares', () => {
    const contentTagStart = code.indexOf('group={groupById("content")}');
    expect(contentTagStart, 'the "content" group was not found').toBeGreaterThan(-1);
    const tagEnd = code.indexOf(">", contentTagStart);
    const tagText = code.slice(Math.max(0, contentTagStart - 40), tagEnd + 1);
    expect(tagText, '"content" must not suppress its own live region').not.toMatch(/announceBusy=\{false\}/);
  });
});

describe("no disclosure body is ever gated on `open` (D3 hard rule)", () => {
  it("never writes `{open &&` anywhere in this file", () => {
    // A native <details> hides its content without unmounting it - gating
    // a group's body on `open` would be pure regression (it would unmount
    // every control in a collapsed group, and a control that never mounts
    // never writes its persisted default). This file must never reach for
    // that pattern; BulkBarGroup.tsx alone owns the collapse mechanism.
    expect(code).not.toMatch(/\{\s*open\s*&&/);
  });

  it("never renders a raw <details> element itself", () => {
    // Every group in this section - collapsible or, per step-10 finding 5,
    // forced-static - is rendered through the SAME <details> BulkBarGroup.tsx
    // itself owns; this file should never hand-roll one of its own, which
    // would bypass groupOpen/mayCollapse's forced-open rules.
    expect(code).not.toMatch(/<details/i);
  });
});

describe("the sectionGate refusal renders as a static, non-collapsible group (D6)", () => {
  it("is not a <details> and carries role=\"group\" with aria-labelledby", () => {
    const gateIdx = code.indexOf("sectionGate.allowed");
    expect(gateIdx, "sectionGate.allowed guard not found").toBeGreaterThan(-1);
    // The refusal's own returned JSX - up to the next top-level return in
    // the component (the real bar) - must never contain <details>.
    const nextReturnIdx = code.indexOf("return (", code.indexOf("return (", gateIdx) + 1);
    const refusalBlock = code.slice(gateIdx, nextReturnIdx > -1 ? nextReturnIdx : gateIdx + 1200);
    expect(refusalBlock).not.toMatch(/<details/i);
    expect(refusalBlock).toMatch(/role="group"/);
    expect(refusalBlock).toMatch(/aria-labelledby=/);
  });

  it("still surfaces the refusal reason as always-visible text, never a title tooltip", () => {
    const gateIdx = code.indexOf("sectionGate.allowed");
    const nextReturnIdx = code.indexOf("return (", code.indexOf("return (", gateIdx) + 1);
    const refusalBlock = code.slice(gateIdx, nextReturnIdx > -1 ? nextReturnIdx : gateIdx + 1200);
    expect(refusalBlock).toMatch(/sectionGate\.reason/);
    expect(refusalBlock).not.toMatch(/title=\{sectionGate\.reason\}/);
  });
});

describe("every control visible today is still rendered", () => {
  // One assertion per control this section owned before the reorganization,
  // anchored on the identifier/handler that makes it real rather than on
  // its label prose. This is exactly the reachability risk D6 names by
  // name: "Edit in detail"/"Edit page" is an anonymous IIFE gated on a
  // length check plus a type branch that returns null on two paths - the
  // easiest control in the bar to drop unnoticed while moving JSX around.
  it("items group: Publish, Unpublish, and the single-item Edit-in-detail/Edit-page IIFE", () => {
    expect(code).toMatch(/onClick=\{\(\)\s*=>\s*bulkPublish\(true\)\}/);
    expect(code).toMatch(/onClick=\{\(\)\s*=>\s*bulkPublish\(false\)\}/);
    expect(code).toMatch(/selectedItems\(\)\.length === 1/);
    expect(code).toMatch(/onGradableEditorTrigger\(e\.currentTarget\)/);
    expect(code).toMatch(/onPageEditorTrigger\(e\.currentTarget\)/);
  });

  it("content group: the description field, Set description, Edit questions, and Add to selected quizzes", () => {
    expect(code).toMatch(/onChange=\{\(e\)\s*=>\s*setBulkItemsDescription/);
    expect(code).toMatch(/onClick=\{bulkSetDescription\}/);
    expect(code).toMatch(/onItemQuestionsTrigger\(e\.currentTarget\)/);
    expect(code).toMatch(/onClick=\{bulkAddQuestionsToQuizzes\}/);
  });

  it("dueDates group: Set, Shift days, and Stagger", () => {
    expect(code).toMatch(/onClick=\{bulkSetDue\}/);
    expect(code).toMatch(/onClick=\{bulkShiftDue\}/);
    expect(code).toMatch(/onClick=\{bulkStaggerDue\}/);
  });

  it("grading group: Set points, Associate, Edit, New rubric (the rubricSource wiring test owns Edit's guard)", () => {
    expect(code).toMatch(/onClick=\{bulkSetPoints\}/);
    expect(code).toMatch(/onClick=\{bulkRubric\}/);
    expect(code).toMatch(/editRubricId:/);
    // Step-10 finding 15 (fixer round): `\s*\n\s*` between the two statements
    // required an actual newline, so a behaviour-preserving Prettier reflow
    // (or a one-line reformat) would fail this despite nothing behavioural
    // changing. `\s+` pins that both statements exist and run in order,
    // never their exact line layout.
    expect(code).toMatch(/onClick=\{\(e\)\s*=>\s*\{\s+onRubricBuilderTrigger\(e\.currentTarget\);\s+openRubricBuilder\(\);/);
  });

  it("submissionType group: Apply", () => {
    expect(code).toMatch(/onClick=\{bulkUpdateSubmissionType\}/);
  });

  it("move group: Shift up/down, Move, Remove, and Delete from Canvas", () => {
    expect(code).toMatch(/onClick=\{\(\)\s*=>\s*bulkShiftModules\(-1\)\}/);
    expect(code).toMatch(/onClick=\{\(\)\s*=>\s*bulkShiftModules\(1\)\}/);
    expect(code).toMatch(/onClick=\{bulkMoveToModule\}/);
    expect(code).toMatch(/onClick=\{bulkRemoveFromModule\}/);
    expect(code).toMatch(/onClick=\{bulkDeleteContent\}/);
    // Step-10 finding 15 (fixer round): pins the FACT (a ternary keyed on
    // confirmDeleteContent produces two distinct label strings for the same
    // button) rather than the exact wording of either label, which a
    // copy-edit could change without any behaviour change.
    expect(code).toMatch(/confirmDeleteContent\s*\?\s*"[^"]+"\s*:\s*"[^"]+"/);
  });
});

describe("the three highest-consequence controls this section owns are never inside a collapsible group", () => {
  // Section 0/AC1 name Remove and Set description explicitly; Delete from
  // Canvas is the fourth confirm-armed destructive write in the whole bar.
  // Proven two ways: (1) each control's onClick sits inside the JSX region
  // wired to the group the catalog says owns it, via the group-ordering
  // assertion above, and (2) using the REAL mayCollapse/groupTier functions
  // (not a reimplementation), that group can never collapse once its
  // fan-out/destructive control is visible - so wiring it to that group id
  // is what keeps it at full weight, not an accident of today's facts.
  it('"content" (Set description) cannot collapse once itemCount > 0', () => {
    const group = groupById("content");
    expect(group.controls.some((c) => c.id === "itemsSetDescription")).toBe(true);
    expect(mayCollapse(group, itemsSelectedFacts())).toBe(false);
  });

  it('"move" (Remove, Delete from Canvas) cannot collapse once itemCount > 0', () => {
    const group = groupById("move");
    expect(group.controls.some((c) => c.id === "itemsRemoveButton")).toBe(true);
    expect(group.controls.some((c) => c.id === "itemsDeleteButton")).toBe(true);
    expect(mayCollapse(group, itemsSelectedFacts())).toBe(false);
  });

  it("Set description, Remove, and Delete from Canvas are wired inside a <BulkBarGroup>, never a bare row", () => {
    for (const handler of ["bulkSetDescription", "bulkRemoveFromModule", "bulkDeleteContent"]) {
      const handlerIdx = code.indexOf(`onClick={${handler}}`);
      expect(handlerIdx, `${handler} is no longer rendered`).toBeGreaterThan(-1);
      const groupStart = code.lastIndexOf("<BulkBarGroup", handlerIdx);
      expect(groupStart, `${handler} is not nested inside a <BulkBarGroup>`).toBeGreaterThan(-1);
      // No unmatched-earlier fragment boundary between the group open tag
      // and the handler - a cheap but real proxy for "still inside it",
      // since this file never nests one <BulkBarGroup> inside another.
      const anotherGroupBetween = code.indexOf("<BulkBarGroup", groupStart + 1);
      expect(anotherGroupBetween === -1 || anotherGroupBetween > handlerIdx).toBe(true);
    }
  });
});

describe("Step-10 finding 1 (AC10): the armed Delete from Canvas button gets the three-signal treatment", () => {
  // Before this fix, the two armed Delete buttons (this one and
  // BulkModulesSection's) swapped only their label while the two armed
  // visualizer writes (VisualizerCoverageSection.tsx's linkArmed/
  // createArmed) also got a colocated aria-live banner - the higher-
  // consequence pair was the quieter one. Mirrors that file's own
  // documented pattern: label swap (pinned above), a colocated
  // role="status" aria-live="polite" banner, and the unchanged setNote path.
  it("SABOTAGE TARGET: a role=\"status\" aria-live=\"polite\" banner is colocated with the Delete button, gated on confirmDeleteContent", () => {
    const buttonIdx = code.indexOf("onClick={bulkDeleteContent}");
    expect(buttonIdx, "bulkDeleteContent's own button was not found").toBeGreaterThan(-1);
    const groupEnd = code.indexOf("</BulkBarGroup>", buttonIdx);
    expect(groupEnd, "no closing </BulkBarGroup> found after the Delete button").toBeGreaterThan(buttonIdx);
    const region = code.slice(buttonIdx, groupEnd);
    expect(region, "no confirmDeleteContent-gated banner colocated with the button").toMatch(/confirmDeleteContent\s*&&/);
    const bannerIdx = region.indexOf("confirmDeleteContent &&");
    const bannerRegion = region.slice(bannerIdx, region.indexOf(")}", bannerIdx) + 2);
    expect(bannerRegion).toMatch(/role="status"/);
    expect(bannerRegion).toMatch(/aria-live="polite"/);
  });
});
