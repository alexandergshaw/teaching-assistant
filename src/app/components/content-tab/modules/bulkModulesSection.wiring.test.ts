// BulkModulesSection - wiring guard for the bulk bar group reorganisation
// (docs/bulk-bar-reorganization-acceptance-criteria.md, section 3b/D1/D5/D6).
// This file had NO TEST AT ALL for its fifteen controls before this one - the
// AC names that gap explicitly (section 5's "Existing coverage to respect").
//
// vitest here is node-env and collects only src/**/*.test.ts
// (vitest.config.ts:13-14) - NO COMPONENT IS EVER RENDERED. Nothing below
// proves a group visually collapses, that the disclosure triangle paints, or
// that a screen reader announces anything. Two kinds of assertion make up
// for that as far as a node suite can:
//   (a) real calls into ./bulkBarGroups's own pure functions (mayCollapse) -
//       these genuinely execute and return a genuine boolean, not a guess
//       about what markup would do;
//   (b) source-text checks over BulkModulesSection.tsx (and, for the
//       catalog-drift checks, bulkBarGroupCatalog.ts) as plain strings, the
//       same idiom ModulesHeaderBar.wiring.test.ts and
//       askAiSelection.wiring.test.ts already use.
// Pin the FACT and the ORDERING, never the spelling (docs/DEV_LOOP.md section
// 9) - this feature area has already been bitten twice by over-specified
// string assertions.
//
// A NOTE ON THE "SIX" NESTED PREDICATES: the brief for this file described
// six visibility predicates nested a level deeper than the five bulkAddType
// row gates. Reading BulkModulesSection.tsx turns up five distinct ones (the
// submission-type select, Discard AI file, the points field, the rubric
// select, and Clear) - see the last describe block below, which pins all
// five it actually found rather than fabricating a sixth to match the
// brief's count.
import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";
import { join } from "path";
import { groupById, mayCollapse, type BulkBarFacts } from "./bulkBarGroups";

const SECTION_PATH = join(process.cwd(), "src/app/components/content-tab/modules/BulkModulesSection.tsx");
const CATALOG_PATH = join(process.cwd(), "src/app/components/content-tab/modules/bulkBarGroupCatalog.ts");

/** Comments stripped first, exactly per ModulesHeaderBar.wiring.test.ts's own
 * reasoning - this file's (and BulkModulesSection.tsx's own) comments
 * legitimately discuss `<details>`, `role="group"`, and `{open &&` at length,
 * and must never satisfy an assertion meant to be about real code. */
function stripComments(text: string): string {
  return text.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^[ \t]*\/\/.*$/gm, "");
}

describe("stripComments (canary first)", () => {
  it("removes a // comment but leaves real code alone", () => {
    const fixture = ["// findGroup(\"modules\") used to live here", 'const x = groupById("modules");'].join("\n");
    const stripped = stripComments(fixture);
    expect(stripped).not.toContain('findGroup("modules")');
    expect(stripped).toContain('groupById("modules")');
  });
});

const code = stripComments(readFileSync(SECTION_PATH, "utf8"));
const catalogCode = stripComments(readFileSync(CATALOG_PATH, "utf8"));

function baseFacts(overrides: Partial<BulkBarFacts> = {}): BulkBarFacts {
  return {
    moduleCount: 0,
    itemCount: 0,
    selectedAssignmentCount: 0,
    singleItemEditKind: "none",
    bulkAddType: "Assignment",
    bulkAddFileContentPresent: false,
    bulkAddQuestionsCount: 0,
    bulkItemsQuestionsCount: 0,
    rubricsCount: 1,
    offersDeck: false,
    offersScript: false,
    offersIntroDiscussion: false,
    generationKindsCount: 0,
    hasDiagLog: false,
    coverageScanned: false,
    coveredCount: 0,
    creatableGapsCount: 0,
    carryReviewOpen: false,
    generatePostReachable: false,
    // docs/llm-command-interface-acceptance-criteria.md section 10 (G7): the
    // one field this chunk added to BulkBarFacts - see that section's own
    // commandInterfaceGroup comment in bulkBarGroupCatalog.ts.
    commandProposalOpen: false,
    ...overrides,
  };
}

/** Pulls a control's own `visible: (f) => ...` expression verbatim out of
 * bulkBarGroupCatalog.ts, so a JSX row gate can be checked against the SAME
 * text the data model declares, rather than a hand-copied guess that could
 * silently drift from it. Relies only on the catalog's consistent key order
 * (`visible` always immediately followed by `, persistKey`), not on any
 * particular formatting of the expression itself. */
function catalogVisibleExpr(controlId: string): string {
  const idAnchor = catalogCode.indexOf(`id: "${controlId}"`);
  expect(idAnchor, `control "${controlId}" not found in bulkBarGroupCatalog.ts`).toBeGreaterThan(-1);
  const marker = "visible: (f) => ";
  const exprStart = catalogCode.indexOf(marker, idAnchor);
  expect(exprStart, `"${controlId}" has no "visible: (f) => " clause`).toBeGreaterThan(-1);
  const start = exprStart + marker.length;
  const end = catalogCode.indexOf(", persistKey", start);
  expect(end, `"${controlId}"'s visible clause has no trailing ", persistKey"`).toBeGreaterThan(start);
  return catalogCode.slice(start, end).trim();
}

/** BulkModulesSection.tsx never sees `f.moduleCount > 0` explicitly - that
 * half of every one of this section's own control predicates is already
 * guaranteed by the group's own `visible` gate before any row renders at
 * all - and it reads the type as a bare `bulkAddType`, not `f.bulkAddType`. */
function toSectionExpr(catalogExpr: string): string {
  return catalogExpr.replace(/^f\.moduleCount > 0 && /, "").replace(/f\.bulkAddType/g, "bulkAddType");
}

describe("BulkModulesSection wraps its three owned groups in BulkBarGroup (D1/D5)", () => {
  it("imports BulkBarGroup and looks up exactly the \"modules\", \"addToEach\", \"currentEvents\" and \"carryPattern\" ids from the shared catalog via groupById (step-10 review: groupById replaces the six local findGroup copies)", () => {
    expect(code).toMatch(/import\s*\{\s*BulkBarGroup\s*\}\s*from\s*["']\.\/BulkBarGroup["']/);
    expect(code).toMatch(/groupById\(\s*["']modules["']\s*\)/);
    expect(code).toMatch(/groupById\(\s*["']addToEach["']\s*\)/);
    expect(code).toMatch(/groupById\(\s*["']currentEvents["']\s*\)/);
    expect(code).toMatch(/groupById\(\s*["']carryPattern["']\s*\)/);
  });

  it("renders exactly four <BulkBarGroup> instances (docs/carry-module-pattern-forward-acceptance-criteria.md, chunk D: this canary moved from three to four)", () => {
    const matches = [...code.matchAll(/<BulkBarGroup\b/g)];
    expect(matches.length).toBe(4);
  });

  it("threads facts and groupsState as bare identifiers into all four instances - never an inline arrow function", () => {
    // The same hazard D4/trap-1 names for ModulesView's own render sites
    // (askAiSelection.wiring.test.ts:113 slices a tag with indexOf(">",
    // start); an arrow prop's own `>` would truncate that slice) applies
    // here too, one level down.
    const openTags = [...code.matchAll(/<BulkBarGroup group=\{[^}]+\}[^>]*>/g)];
    expect(openTags.length).toBe(4);
    for (const [tag] of openTags) {
      expect(tag).toMatch(/facts=\{facts\}/);
      expect(tag).toMatch(/state=\{groupsState\}/);
      expect(tag).not.toMatch(/=\{\s*\([^)]*\)\s*=>/);
    }
  });
});

describe("the currentEvents group (D5/D6/D8): a NEW sibling group, rendered after addToEach closes", () => {
  it("SABOTAGE TARGET: the <BulkBarGroup group={CURRENT_EVENTS_GROUP}> tag starts strictly after addToEach's own closing </BulkBarGroup>", () => {
    // D8's second trap: a group inserted BETWEEN "modules" and "addToEach"
    // would land inside the two slices the tests above take from a group's
    // open tag to the first </BulkBarGroup> that follows it, corrupting
    // assertions unrelated to this feature. Pinning the ORDER, not just
    // presence, is what would have caught that.
    const addToEachStart = code.indexOf("<BulkBarGroup group={ADD_TO_EACH_GROUP}");
    expect(addToEachStart, "addToEach group tag not found").toBeGreaterThan(-1);
    const addToEachClose = code.indexOf("</BulkBarGroup>", addToEachStart);
    expect(addToEachClose, "addToEach has no closing tag").toBeGreaterThan(-1);
    const currentEventsStart = code.indexOf("<BulkBarGroup group={CURRENT_EVENTS_GROUP}");
    expect(currentEventsStart, "currentEvents group tag not found").toBeGreaterThan(-1);
    expect(currentEventsStart, "currentEvents must render after addToEach's own closing tag").toBeGreaterThan(addToEachClose);
  });

  it('SABOTAGE TARGET: the currentEvents group passes announceBusy={false} - its own busy state is the shared opBusy, not an independent signal', () => {
    const start = code.indexOf("<BulkBarGroup group={CURRENT_EVENTS_GROUP}");
    expect(start, "currentEvents group tag not found").toBeGreaterThan(-1);
    const tagEnd = code.indexOf(">", start);
    const tagText = code.slice(start, tagEnd + 1);
    expect(tagText, "currentEvents must pass announceBusy={false}").toMatch(/announceBusy=\{false\}/);
    expect(tagText, "currentEvents's runtime busy must be the bare opBusy identifier, never OR-ed").toMatch(/runtime=\{currentEventsRuntime\}/);
  });

  it("SABOTAGE TARGET: currentEventsRuntime.busy is the bare opBusy identifier, never OR-ed with a group-owned signal", () => {
    const start = code.indexOf("const currentEventsRuntime");
    expect(start, "currentEventsRuntime declaration not found").toBeGreaterThan(-1);
    const end = code.indexOf("};", start);
    const block = code.slice(start, end);
    expect(block, "currentEventsRuntime.busy must be exactly opBusy").toMatch(/busy:\s*opBusy\s*,/);
    expect(block, "currentEventsRuntime.busy must not be OR-ed with anything").not.toMatch(/opBusy\s*\|\|/);
  });

  it("SABOTAGE TARGET: useCurrentEventsAssignments is never called from this file - it is called once, from ModulesView", () => {
    expect(code).not.toMatch(/useCurrentEventsAssignments\(/);
  });

  it("SABOTAGE TARGET: the three currentEvents props are declared REQUIRED (no `?`) on BulkModulesSectionProps, so omitting one fails tsc", () => {
    const start = code.indexOf("export interface BulkModulesSectionProps");
    expect(start, "BulkModulesSectionProps interface not found").toBeGreaterThan(-1);
    const end = code.indexOf("\n}", start);
    const block = code.slice(start, end);
    expect(block).toMatch(/confirmCurrentEvents:\s*boolean;/);
    expect(block).toMatch(/currentEventsLabel:\s*string;/);
    expect(block).toMatch(/runCurrentEventsAssignments:\s*\(\)\s*=>\s*void;/);
    // Negative check: none of the three is declared optional (a trailing `?`
    // right before the colon would make the control silently unreachable if
    // ever omitted at a call site rather than failing tsc - entry 328's own
    // "hop that has shipped dead before").
    expect(block).not.toMatch(/confirmCurrentEvents\?:/);
    expect(block).not.toMatch(/currentEventsLabel\?:/);
    expect(block).not.toMatch(/runCurrentEventsAssignments\?:/);
  });

  it("the button renders currentEventsLabel verbatim and wires onClick to runCurrentEventsAssignments, never a hand-written label", () => {
    const start = code.indexOf("<BulkBarGroup group={CURRENT_EVENTS_GROUP}");
    const end = code.indexOf("</BulkBarGroup>", start);
    const block = code.slice(start, end);
    expect(block).toMatch(/onClick=\{runCurrentEventsAssignments\}/);
    expect(block).toContain("{currentEventsLabel}");
  });

  it("the armed banner is gated on confirmCurrentEvents and carries role=status aria-live=polite, mirroring the Delete banner's own treatment", () => {
    const start = code.indexOf("<BulkBarGroup group={CURRENT_EVENTS_GROUP}");
    const end = code.indexOf("</BulkBarGroup>", start);
    const block = code.slice(start, end);
    expect(block).toMatch(/confirmCurrentEvents\s*&&/);
    expect(block).toMatch(/role="status"/);
    expect(block).toMatch(/aria-live="polite"/);
  });
});

describe("Step-10 finding 4: \"modules\" suppresses its own live announcement of the shared opBusy signal, \"addToEach\" does not", () => {
  // "modules" shares ModulesView's single `opBusy` flag with five of
  // BulkItemsSection's six groups - one bulk write used to be announced
  // from up to eight group headings at once. Full decision on
  // BulkBarGroup.tsx's `announceBusy` prop.
  it('SABOTAGE TARGET: the "modules" group passes announceBusy={false}', () => {
    const modulesTagStart = code.indexOf("<BulkBarGroup group={MODULES_GROUP}");
    expect(modulesTagStart, '"modules" group tag not found').toBeGreaterThan(-1);
    const tagEnd = code.indexOf(">", modulesTagStart);
    const tagText = code.slice(modulesTagStart, tagEnd + 1);
    expect(tagText, '"modules" must pass announceBusy={false}').toMatch(/announceBusy=\{false\}/);
  });

  it('SABOTAGE TARGET: the "addToEach" group keeps the default (announced) - it also reacts to bulkAiBusy, a signal no other group shares', () => {
    const addToEachTagStart = code.indexOf("<BulkBarGroup group={ADD_TO_EACH_GROUP}");
    expect(addToEachTagStart, '"addToEach" group tag not found').toBeGreaterThan(-1);
    const tagEnd = code.indexOf(">", addToEachTagStart);
    const tagText = code.slice(addToEachTagStart, tagEnd + 1);
    expect(tagText, '"addToEach" must not suppress its own live region').not.toMatch(/announceBusy=\{false\}/);
  });
});

describe("Add and Delete are never inside a collapsible group (the two named non-negotiables)", () => {
  it("mayCollapse is false for the modules group whenever a module is selected - Delete is destructive and always visible", () => {
    const modulesGroup = groupById("modules");
    expect(mayCollapse(modulesGroup, baseFacts({ moduleCount: 1 }))).toBe(false);
    expect(mayCollapse(modulesGroup, baseFacts({ moduleCount: 9 }))).toBe(false);
  });

  it("mayCollapse is false for the addToEach group whenever a module is selected, on every bulkAddType branch - Add is fan-out-write and always visible", () => {
    const addToEachGroup = groupById("addToEach");
    for (const bulkAddType of ["Assignment", "Quiz", "Discussion", "Page", "File", "SubHeader"]) {
      expect(mayCollapse(addToEachGroup, baseFacts({ moduleCount: 1, bulkAddType }))).toBe(false);
    }
  });

  // SABOTAGE, run in-line per docs/DEV_LOOP.md section 9: temporarily weaken
  // moduleAddButton's declared tier and confirm mayCollapse flips to true,
  // then restore and confirm it is false again - proving the test above can
  // actually fail, not merely happen to pass against today's catalog.
  it("SABOTAGE: weakening moduleAddButton's tier away from fan-out-write makes the group collapsible, and restoring it makes it non-collapsible again", () => {
    // PLAUSIBLE finding (step-10 fixer round): `groupById`/`BULK_BAR_GROUPS`
    // return references into ONE shared, module-level array - mutating
    // `addControl.tier` in place mutates that singleton for every later test
    // in the run, not a local copy. The restore below used to happen only on
    // the happy path; a thrown assertion between the mutation and the
    // restore would leave the catalog corrupted for every subsequent test
    // file sharing this module (vitest does not reset module state between
    // test files by default). try/finally guarantees the restore runs
    // regardless of how this test exits.
    const addToEachGroup = groupById("addToEach");
    const addControl = addToEachGroup.controls.find((c) => c.id === "moduleAddButton");
    expect(addControl, "moduleAddButton is missing from the addToEach group").toBeTruthy();
    const original = addControl!.tier;
    expect(original).toBe("fan-out-write");

    try {
      addControl!.tier = "reversible-write";
      expect(mayCollapse(addToEachGroup, baseFacts({ moduleCount: 1 }))).toBe(true);
    } finally {
      addControl!.tier = original;
    }
    expect(mayCollapse(addToEachGroup, baseFacts({ moduleCount: 1 }))).toBe(false);
  });

  it("neither Add nor Delete is ever wrapped in a <details> this file renders itself", () => {
    // Collapsibility is entirely delegated to BulkBarGroup.tsx, which (per
    // step-10 finding 5) renders a real <details> for every group including
    // these two - never wrapped a second time by this file - and forces it
    // open (mayCollapse false, proved above) by suppressing the <summary>'s
    // own toggle rather than by swapping in a different element. This file
    // itself must contain no <details> of its own for either control to
    // hide inside.
    expect(code).not.toMatch(/<details/);
  });
});

describe("D3: nobody gates a disclosure body on `open`", () => {
  it("contains no `{open &&` pattern anywhere", () => {
    expect(code).not.toMatch(/\{\s*open\s*&&/);
  });
});

describe("D6: the sectionGate refusal branch renders as a static, non-collapsible group", () => {
  it("is a plain <section role=\"group\">, never a <details>, and surfaces the refusal reason as visible text", () => {
    const start = code.indexOf("if (!sectionGate.allowed)");
    expect(start, "the refusal branch was removed").toBeGreaterThan(-1);
    const end = code.indexOf("const bodyLabel =", start);
    expect(end, "could not bound the refusal branch").toBeGreaterThan(start);
    const block = code.slice(start, end);
    expect(block).toMatch(/<section role="group"/);
    expect(block).not.toMatch(/<details/);
    expect(block).toMatch(/sectionGate\.reason/);
  });
});

describe("addToEach's five nested children render one level deep, never independently collapsible", () => {
  const nestedKeys = ["file", "details", "body", "questions", "ai"] as const;

  it("each nested key is referenced exactly twice - once as aria-labelledby, once as the heading's own id", () => {
    for (const key of nestedKeys) {
      const refs = [...code.matchAll(new RegExp(`NESTED_HEADING_IDS\\.${key}\\b`, "g"))];
      expect(refs.length, `NESTED_HEADING_IDS.${key} should appear exactly twice`).toBe(2);
    }
  });

  it("each nested child is a <section role=\"group\">, not a <details>", () => {
    for (const key of nestedKeys) {
      const anchor = code.indexOf(`NESTED_HEADING_IDS.${key}}`);
      expect(anchor, `NESTED_HEADING_IDS.${key} not found`).toBeGreaterThan(-1);
      const tagStart = code.lastIndexOf("<section", anchor);
      expect(tagStart, `no <section before NESTED_HEADING_IDS.${key}`).toBeGreaterThan(-1);
      const tagEnd = code.indexOf(">", tagStart);
      const tag = code.slice(tagStart, tagEnd + 1);
      expect(tag).toMatch(/role="group"/);
      expect(tag.startsWith("<section")).toBe(true);
    }
  });

  it("all five nested sections render strictly inside the addToEach group's own tags", () => {
    const groupStart = code.indexOf("<BulkBarGroup group={ADD_TO_EACH_GROUP}");
    const groupEnd = code.indexOf("</BulkBarGroup>", groupStart);
    expect(groupStart).toBeGreaterThan(-1);
    expect(groupEnd).toBeGreaterThan(groupStart);
    for (const key of nestedKeys) {
      const anchor = code.indexOf(`NESTED_HEADING_IDS.${key}}`, groupStart);
      expect(anchor).toBeGreaterThan(groupStart);
      expect(anchor).toBeLessThan(groupEnd);
    }
  });
});

describe("the five bulkAddType row gates match the catalog's own visible predicates, verbatim", () => {
  // One representative control per nested row - each one's `visible` clause
  // in the catalog is the row-level predicate this file's own conditional
  // must reproduce exactly, so the two can never quietly drift apart.
  const rowGates: Array<[string, string]> = [
    ["moduleAddFileFormatSelect", "the File row"],
    ["moduleAddDue", "the Details row"],
    ["moduleAddBody", "the Body row"],
    ["moduleAddQuestionsEdit", "the Questions row"],
    ["moduleAddAiPrompt", "the AI row"],
  ];

  for (const [controlId, rowName] of rowGates) {
    it(`${rowName}'s gate reproduces ${controlId}'s catalog predicate`, () => {
      const expr = toSectionExpr(catalogVisibleExpr(controlId));
      expect(code).toContain(expr);
    });
  }
});

describe("the five predicates nested a level deeper than the row gates", () => {
  it("the base row's submission-type select is Assignment-only", () => {
    const baseStart = code.indexOf("<BulkBarGroup group={ADD_TO_EACH_GROUP}");
    const fileStart = code.indexOf("NESTED_HEADING_IDS.file}");
    expect(baseStart).toBeGreaterThan(-1);
    expect(fileStart).toBeGreaterThan(baseStart);
    const baseRow = code.slice(baseStart, fileStart);
    expect(baseRow).toMatch(/\{bulkAddType === "Assignment" && \(/);
  });

  it("Discard AI file requires File type AND non-empty draft content, nested inside the File row", () => {
    const fileStart = code.indexOf("NESTED_HEADING_IDS.file}");
    const detailsStart = code.indexOf("NESTED_HEADING_IDS.details}");
    const fileRow = code.slice(fileStart, detailsStart);
    expect(fileRow).toMatch(/\{bulkAddFileContent\.trim\(\) !== "" && \(/);
    expect(fileRow).toContain("Discard AI file");
  });

  it("the points field is Assignment/Quiz-only, nested inside the Details row", () => {
    const detailsStart = code.indexOf("NESTED_HEADING_IDS.details}");
    const bodyStart = code.indexOf("NESTED_HEADING_IDS.body}");
    const detailsRow = code.slice(detailsStart, bodyStart);
    expect(detailsRow).toMatch(/\{\["Assignment", "Quiz"\]\.includes\(bulkAddType\) && \(/);
  });

  it("the rubric select is Assignment-only, nested inside the Details row", () => {
    const detailsStart = code.indexOf("NESTED_HEADING_IDS.details}");
    const bodyStart = code.indexOf("NESTED_HEADING_IDS.body}");
    const detailsRow = code.slice(detailsStart, bodyStart);
    expect(detailsRow).toMatch(/\{bulkAddType === "Assignment" && \(/);
  });

  it("Clear requires at least one composed question, nested inside the Questions row", () => {
    const questionsStart = code.indexOf("NESTED_HEADING_IDS.questions}");
    const aiStart = code.indexOf("NESTED_HEADING_IDS.ai}");
    const questionsRow = code.slice(questionsStart, aiStart);
    expect(questionsRow).toMatch(/\{bulkAddQuestions\.length > 0 && \(/);
    expect(questionsRow).toContain("Clear");
  });
});

describe("E3: the former title tooltips on Add and Delete are gone, not merely relocated to a second tooltip", () => {
  it("neither the modules group nor the addToEach group renders a title= attribute", () => {
    const modulesStart = code.indexOf("<BulkBarGroup group={MODULES_GROUP}");
    const modulesEnd = code.indexOf("</BulkBarGroup>", modulesStart);
    expect(code.slice(modulesStart, modulesEnd)).not.toMatch(/\btitle=/);

    const addToEachStart = code.indexOf("<BulkBarGroup group={ADD_TO_EACH_GROUP}");
    const addToEachEnd = code.indexOf("</BulkBarGroup>", addToEachStart);
    expect(code.slice(addToEachStart, addToEachEnd)).not.toMatch(/\btitle=/);
  });
});

describe("AC11: near-dead controls are reported, not silently removed", () => {
  it("the rubric select still renders (disabled), rather than being omitted when the course has no rubrics", () => {
    expect(code).toMatch(/disabled=\{rubrics\.length === 0\}/);
    expect(code).toMatch(/rubrics\.length === 0 \? "No rubrics"/);
  });
});

describe("Step-10 finding 13 (confirmation review): groupById is called at RENDER time, not module scope", () => {
  // Before this fix, `MODULES_GROUP`/`ADD_TO_EACH_GROUP` were declared at
  // module scope (this file's own top-level, above the component), so a
  // missing catalog id would throw during MODULE EVALUATION and take down
  // the whole ModulesView import chain - a materially worse failure mode
  // than every sibling section's own render-time groupById call.
  it("SABOTAGE TARGET: no groupById(...) call appears before BulkModulesSection's own function declaration", () => {
    const functionIdx = code.indexOf("export function BulkModulesSection(");
    expect(functionIdx, "BulkModulesSection's own function declaration was not found").toBeGreaterThan(-1);
    const beforeFunction = code.slice(0, functionIdx);
    expect(
      beforeFunction,
      "groupById must not be called at module scope - a missing id must throw at render, scoped to this section, not at import time"
    ).not.toMatch(/groupById\(/);
  });

  it("both MODULES_GROUP and ADD_TO_EACH_GROUP are declared inside the component body, right after its own parameter list", () => {
    const functionIdx = code.indexOf("export function BulkModulesSection(");
    expect(functionIdx).toBeGreaterThan(-1);
    const propsCloseIdx = code.indexOf("}: BulkModulesSectionProps) {", functionIdx);
    expect(propsCloseIdx, "component's own parameter list close was not found").toBeGreaterThan(-1);
    const afterParams = code.slice(propsCloseIdx);
    expect(afterParams).toMatch(/const MODULES_GROUP = groupById\("modules"\);/);
    expect(afterParams).toMatch(/const ADD_TO_EACH_GROUP = groupById\("addToEach"\);/);
    // D5: the third group's lookup follows the SAME render-time discipline -
    // a module-scope call here would reproduce the exact import-time failure
    // this whole describe block exists to prevent.
    expect(afterParams).toMatch(/const CURRENT_EVENTS_GROUP = groupById\("currentEvents"\);/);
    // Chunk D: the fourth group's lookup follows the same discipline too.
    expect(afterParams).toMatch(/const CARRY_PATTERN_GROUP = groupById\("carryPattern"\);/);
  });
});

describe("the carryPattern group (docs/carry-module-pattern-forward-acceptance-criteria.md, chunk D, D14/D17/D19): a NEW sibling group, rendered after currentEvents closes", () => {
  it("SABOTAGE TARGET: the <BulkBarGroup group={CARRY_PATTERN_GROUP}> tag starts strictly after currentEvents's own closing </BulkBarGroup>", () => {
    // Same ordering trap D8 names for currentEvents itself: a group inserted
    // between two existing ones would land inside an earlier slice-from-
    // open-tag-to-first-</BulkBarGroup> and corrupt an assertion unrelated
    // to this feature. Pinning ORDER, not just presence, is what would catch
    // that.
    const currentEventsStart = code.indexOf("<BulkBarGroup group={CURRENT_EVENTS_GROUP}");
    expect(currentEventsStart, "currentEvents group tag not found").toBeGreaterThan(-1);
    const currentEventsClose = code.indexOf("</BulkBarGroup>", currentEventsStart);
    expect(currentEventsClose, "currentEvents has no closing tag").toBeGreaterThan(-1);
    const carryPatternStart = code.indexOf("<BulkBarGroup group={CARRY_PATTERN_GROUP}");
    expect(carryPatternStart, "carryPattern group tag not found").toBeGreaterThan(-1);
    expect(carryPatternStart, "carryPattern must render after currentEvents's own closing tag").toBeGreaterThan(currentEventsClose);
  });

  it("SABOTAGE TARGET: the six carryPattern props are declared REQUIRED (no `?`) on BulkModulesSectionProps, so omitting one fails tsc", () => {
    const start = code.indexOf("export interface BulkModulesSectionProps");
    expect(start, "BulkModulesSectionProps interface not found").toBeGreaterThan(-1);
    const end = code.indexOf("\n}", start);
    const block = code.slice(start, end);
    expect(block).toMatch(/carryTemplateOptions:\s*CarryTemplateOption\[\];/);
    expect(block).toMatch(/carrySourceModuleId:\s*number \| null;/);
    expect(block).toMatch(/onCarrySourceModuleIdChange:\s*\(id:\s*number\)\s*=>\s*void;/);
    expect(block).toMatch(/carryReviewBusy:\s*boolean;/);
    expect(block).toMatch(/onReviewCarryPattern:\s*\(\)\s*=>\s*void;/);
    expect(block).toMatch(/onCarryReviewTrigger:\s*\(trigger:\s*HTMLElement\)\s*=>\s*void;/);
    // Negative check: none of the six is declared optional - entry 328's own
    // "hop that has shipped dead before".
    expect(block).not.toMatch(/carryTemplateOptions\?:/);
    expect(block).not.toMatch(/carrySourceModuleId\?:/);
    expect(block).not.toMatch(/onCarrySourceModuleIdChange\?:/);
    expect(block).not.toMatch(/carryReviewBusy\?:/);
    expect(block).not.toMatch(/onReviewCarryPattern\?:/);
    expect(block).not.toMatch(/onCarryReviewTrigger\?:/);
  });

  it("useCarryModulePattern is never called from this file - it is called once, from useModulesViewOrchestration", () => {
    expect(code).not.toMatch(/useCarryModulePattern\(/);
  });

  it("the Review button captures the click target via onCarryReviewTrigger before calling onReviewCarryPattern", () => {
    const start = code.indexOf("<BulkBarGroup group={CARRY_PATTERN_GROUP}");
    const end = code.indexOf("</BulkBarGroup>", start);
    expect(start).toBeGreaterThan(-1);
    expect(end).toBeGreaterThan(start);
    const block = code.slice(start, end);
    expect(block).toMatch(/onCarryReviewTrigger\(e\.currentTarget\)/);
    expect(block).toMatch(/onReviewCarryPattern\(\)/);
  });

  it("the template select is driven by carrySourceModuleId/onCarrySourceModuleIdChange and lists carryTemplateOptions", () => {
    const start = code.indexOf("<BulkBarGroup group={CARRY_PATTERN_GROUP}");
    const end = code.indexOf("</BulkBarGroup>", start);
    const block = code.slice(start, end);
    expect(block).toMatch(/value=\{carrySourceModuleId \?\? ""\}/);
    expect(block).toMatch(/onCarrySourceModuleIdChange\(Number\(e\.target\.value\)\)/);
    expect(block).toMatch(/carryTemplateOptions\.map/);
  });

  // Step-10 review, C3: this hint's own "order" claim ("Carries the template
  // module's item types, order, points...") is only true if the Assignment
  // write path actually threads position/indent through - it did not, as of
  // section 5/D10's own header comment ("Threading position/indent through
  // that action would need a signature change... reported as a follow-up").
  // A sibling fixer landed that change in the same review round
  // (canvas-modules.ts's createCourseAssignmentAction 5th argument,
  // `moduleItemPlacement`), so the claim is verified TRUE here against the
  // real source rather than assumed - see this suite's own header for why a
  // source-text check is what a node suite can do. If a future change ever
  // drops this threading, this test fails FIRST, before the copy silently
  // goes back to overstating what Apply does.
  it("C3: verifies the hint's 'order' claim against carry-module-pattern.ts's actual Assignment write path, rather than assuming it", () => {
    const carryPatternPath = join(process.cwd(), "src/app/actions/carry-module-pattern.ts");
    const carryCode = stripComments(readFileSync(carryPatternPath, "utf8"));
    const start = carryCode.indexOf("async function applyAssignment");
    expect(start, "applyAssignment not found in carry-module-pattern.ts").toBeGreaterThan(-1);
    const end = carryCode.indexOf("\n}", start);
    expect(end, "applyAssignment has no closing brace").toBeGreaterThan(start);
    const block = carryCode.slice(start, end);
    expect(block).toMatch(/createCourseAssignmentAction/);
    expect(block).toMatch(/position:\s*sourceItem\.position/);
    expect(block).toMatch(/indent:\s*sourceItem\.indent/);

    // Given the fact above holds, the bar's own copy is entitled to claim
    // order carries - confirm it still does.
    const hintStart = code.indexOf("<BulkBarGroup group={CARRY_PATTERN_GROUP}");
    const hintEnd = code.indexOf("</BulkBarGroup>", hintStart);
    const hintBlock = code.slice(hintStart, hintEnd);
    expect(hintBlock).toMatch(/\border\b/i);
  });
});

describe("Step-10 finding 1 (AC10): the armed Delete button gets the three-signal treatment", () => {
  // Before this fix, the two armed Delete buttons (this one and
  // BulkItemsSection's) swapped only their label while the two armed
  // visualizer writes (VisualizerCoverageSection.tsx's linkArmed/
  // createArmed) also got a colocated aria-live banner - the higher-
  // consequence pair was the quieter one.
  it('SABOTAGE TARGET: a role="status" aria-live="polite" banner is colocated with the Delete button, gated on confirmDeleteModules', () => {
    const buttonIdx = code.indexOf("onClick={bulkDeleteModules}");
    expect(buttonIdx, "bulkDeleteModules's own button was not found").toBeGreaterThan(-1);
    const groupEnd = code.indexOf("</BulkBarGroup>", buttonIdx);
    expect(groupEnd, "no closing </BulkBarGroup> found after the Delete button").toBeGreaterThan(buttonIdx);
    const region = code.slice(buttonIdx, groupEnd);
    expect(region, "no confirmDeleteModules-gated banner colocated with the button").toMatch(/confirmDeleteModules\s*&&/);
    const bannerIdx = region.indexOf("confirmDeleteModules &&");
    const bannerRegion = region.slice(bannerIdx, region.indexOf(")}", bannerIdx) + 2);
    expect(bannerRegion).toMatch(/role="status"/);
    expect(bannerRegion).toMatch(/aria-live="polite"/);
  });
});
