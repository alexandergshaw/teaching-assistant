// CourseItemsView - structural/wiring guard (Contract 2,
// docs/assignments-quizzes-tabs-acceptance-criteria.md).
//
// vitest here is node-env and collects only src/**/*.test.ts, so nothing in
// this suite is ever rendered - this file reads CourseItemsView.tsx and
// useFlatItemSelection.ts as TEXT, the same idiom
// askAiSelection.wiring.test.ts already uses for ModulesView's bulk bar. What
// is pinned below is FACTS and ORDERING (a call is made with these
// arguments, a branch is gated on this condition, a button's own label
// changes) - never exact prose spelling, per this repo's own
// source-text-tests-overspecify note.
import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";
import { join } from "path";

const VIEW_PATH = join(process.cwd(), "src/app/components/content-tab/CourseItemsView.tsx");
const SELECTION_PATH = join(process.cwd(), "src/app/components/content-tab/useFlatItemSelection.ts");

const viewSource = readFileSync(VIEW_PATH, "utf8");
const selectionSource = readFileSync(SELECTION_PATH, "utf8");

/** Source with comments stripped, so a name mentioned only in prose (this
 *  file's own header, or CourseItemsView's own doc comments) is never
 *  mistaken for a real reference. Mirrors askAiSelection.wiring.test.ts's
 *  own stripComments. */
function stripComments(text: string): string {
  return text.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^[ \t]*\/\/.*$/gm, "");
}

const stripped = stripComments(viewSource);
const selectionStripped = stripComments(selectionSource);

describe("CourseItemsView exports Contract 2's exact shape", () => {
  it("exports the CourseItemsViewProps interface with every fixed field", () => {
    const marker = "export interface CourseItemsViewProps {";
    const start = stripped.indexOf(marker);
    expect(start, "CourseItemsViewProps is not exported").toBeGreaterThan(-1);
    const end = stripped.indexOf("\n}", start);
    const body = stripped.slice(start + marker.length, end);
    expect(body).toMatch(/\bcourseUrl:\s*string/);
    expect(body).toMatch(/\bacronym\?:\s*string/);
    expect(body).toMatch(/kind:\s*"Assignment"\s*\|\s*"Quiz"/);
    expect(body).toMatch(/\bsourceContext:\s*ContentSourceContext/);
    expect(body).toMatch(/\bsetNote:\s*\(/);
  });

  it("exports a CourseItemsView function component", () => {
    expect(stripped).toMatch(/export function CourseItemsView\(/);
  });
});

describe("the whole-view source gate (D4/D7r): subject is derived from `kind`, not a shared literal", () => {
  it("calls gateOperation with a subject picked between the two purpose-built subjects by `kind`, never the shared 'items' subject", () => {
    const callIdx = stripped.indexOf("gateOperation(sourceContext,");
    expect(callIdx, "gateOperation(sourceContext, ...) call not found").toBeGreaterThan(-1);
    const callEnd = stripped.indexOf(");", callIdx);
    const callArgs = stripped.slice(callIdx, callEnd);
    // Must be a ternary that reads `kind` and picks between the two subjects
    // contentSourceGating.ts added specifically for this whole-view gate
    // (finding 2) - never a bare pinned literal.
    expect(callArgs).toMatch(/kind === "Assignment"/);
    expect(callArgs).toMatch(/"assignments"/);
    expect(callArgs).toMatch(/"quizzes"/);
    expect(callArgs).not.toMatch(/"items"/);

    // Structural anchor: an early return renders gate.reason, mirroring
    // FilesView's own `if (!filesGate.allowed) return (...)` shape.
    const gateCheckIdx = stripped.indexOf("!gate.allowed");
    expect(gateCheckIdx).toBeGreaterThan(-1);
    const gateBlockEnd = stripped.indexOf("</div>", gateCheckIdx);
    const gateBlock = stripped.slice(gateCheckIdx, gateBlockEnd);
    expect(gateBlock).toMatch(/\{gate\.reason\}/);
  });
});

describe("data comes from listBulkItemsAction, kept in step with `kind` (A2)", () => {
  it("imports listBulkItemsAction and calls it with (courseUrl, kind, acronym) at least twice", () => {
    expect(stripped).toMatch(/import\s*\{[^}]*\blistBulkItemsAction\b[^}]*\}\s*from\s*["']\.\.\/\.\.\/actions["']/);
    const calls = [...stripped.matchAll(/listBulkItemsAction\(courseUrl,\s*kind,\s*acronym\)/g)];
    // Once in the initial-load effect, once in reload() - both must exist so
    // a manual refresh and the first mount fetch identically.
    expect(calls.length).toBeGreaterThanOrEqual(2);
  });

  it("the initial-load effect depends on `kind`, so switching tabs (a remount) is not the only way it refetches", () => {
    const effectIdx = stripped.indexOf("useEffect(() => {");
    expect(effectIdx).toBeGreaterThan(-1);
    const depsIdx = stripped.indexOf("}, [courseUrl, acronym, kind, sourceContext.source]);", effectIdx);
    expect(depsIdx).toBeGreaterThan(-1);
  });
});

describe("B2: publish/unpublish goes through bulkUpdateAction, never the module-item API", () => {
  it("imports bulkUpdateAction and never imports updateModuleItemAction", () => {
    expect(stripped).toMatch(/import\s*\{[^}]*\bbulkUpdateAction\b[^}]*\}\s*from\s*["']\.\.\/\.\.\/actions["']/);
    expect(stripped).not.toMatch(/updateModuleItemAction/);
  });

  it("bulkPublish calls bulkUpdateAction with a `published` field, routed through the effective-kind grouping (not the view's own `kind` directly)", () => {
    const fnIdx = stripped.indexOf("const bulkPublish = (published: boolean) => {");
    expect(fnIdx).toBeGreaterThan(-1);
    const fnEnd = stripped.indexOf("const bulkSetDue = ()", fnIdx);
    const body = stripped.slice(fnIdx, fnEnd);
    expect(body).toMatch(/bulkUpdateAction\(courseUrl,\s*effKind,\s*ids,\s*\{\s*published\s*\},\s*acronym\)/);
  });
});

describe("New Quiz routing and labelling (D1, C2/C4, finding 6)", () => {
  it("imports effectiveKindOf and groupSelectedByEffectiveKind from the pure routing leaf, rather than redefining them", () => {
    expect(stripped).toMatch(
      /import\s*\{\s*effectiveKindOf,\s*groupSelectedByEffectiveKind\s*\}\s*from\s*["']\.\/courseItems-routing["']/
    );
    // The rule must live ONLY in the leaf now - a redefinition here would
    // mean the leaf's own unit tests are not actually exercising what runs.
    expect(stripped).not.toMatch(/function effectiveKindOf\(/);
    expect(stripped).not.toMatch(/function groupSelectedByEffectiveKind\(/);
  });

  it("labels a New Quiz row only in the Quiz tab, never the Assignment tab (C2/C3), regardless of label casing", () => {
    const guardMarker = 'kind === "Quiz" && it.isNewQuiz && (';
    const guardStart = stripped.indexOf(guardMarker);
    expect(guardStart, "no kind===\"Quiz\" && isNewQuiz gated block found").toBeGreaterThan(-1);
    const blockEnd = stripped.indexOf(")}", guardStart);
    expect(blockEnd).toBeGreaterThan(guardStart);
    const guardBlock = stripped.slice(guardStart, blockEnd);
    // The gating condition must include both kind === "Quiz" and isNewQuiz -
    // a label gated on isNewQuiz alone would (incorrectly) also fire if such
    // a row ever reached the Assignment tab.
    expect(guardBlock).toMatch(/kind === "Quiz"/);
    expect(guardBlock).toMatch(/it\.isNewQuiz/);
    // Pins the FACT that a "new quiz" label is rendered inside this guard,
    // case-insensitively - never the exact spelling/casing (finding 7,
    // source-text-tests-overspecify). Checked only in the JSX CHILDREN after
    // the guard's own condition, not the whole block - the condition text
    // itself contains the code identifier `isNewQuiz`, whose "NewQuiz"
    // substring would otherwise satisfy this regex without any label ever
    // being rendered.
    const childrenPart = guardBlock.slice(guardMarker.length);
    expect(childrenPart).toMatch(/new\s*quiz/i);
  });

  it("deletes and points/publish writes use the same grouped-by-effective-kind helper the New Quiz routing relies on", () => {
    expect(stripped).toMatch(/groupSelectedByEffectiveKind\(selection\.selected,\s*itemsById,\s*kind\)/);
    expect(stripped).toMatch(/bulkDeleteAction\(courseUrl,\s*effKind,\s*ids,\s*acronym\)/);
  });

  it("the due-date write path also routes each id through effectiveKindOf, not just publish/delete (finding 6)", () => {
    const fnIdx = stripped.indexOf("const bulkSetDue = () => {");
    expect(fnIdx, "bulkSetDue not found").toBeGreaterThan(-1);
    const fnEnd = stripped.indexOf("const bulkSetPoints", fnIdx);
    expect(fnEnd).toBeGreaterThan(fnIdx);
    expect(stripped.slice(fnIdx, fnEnd)).toMatch(/effectiveKindOf\(item,\s*kind\)/);
  });

  it("the description write path also routes each id through effectiveKindOf, not just publish/delete (finding 6)", () => {
    const fnIdx = stripped.indexOf("const bulkSetDescription = () => {");
    expect(fnIdx, "bulkSetDescription not found").toBeGreaterThan(-1);
    const fnEnd = stripped.indexOf("const selectionSig", fnIdx);
    expect(fnEnd).toBeGreaterThan(fnIdx);
    expect(stripped.slice(fnIdx, fnEnd)).toMatch(/effectiveKindOf\(item,\s*kind\)/);
  });
});

describe("B3: rubrics and submission type are offered for Assignments only", () => {
  it("gates both the rubric row and the submission-type row on kind === \"Assignment\"", () => {
    const rubricGuardIdx = stripped.indexOf('kind === "Assignment" && (');
    expect(rubricGuardIdx, "no kind === \"Assignment\" gated block found").toBeGreaterThan(-1);
    const subtypeGuardIdx = stripped.indexOf('kind === "Assignment" && (', rubricGuardIdx + 1);
    expect(subtypeGuardIdx, "only one kind === \"Assignment\" gated block found - expected rubric AND submission type").toBeGreaterThan(rubricGuardIdx);

    const rubricBlockEnd = stripped.indexOf("bulkRubric", rubricGuardIdx);
    const subtypeBlockEnd = stripped.indexOf("bulkUpdateSubmissionType", subtypeGuardIdx);
    expect(rubricBlockEnd).toBeGreaterThan(rubricGuardIdx);
    expect(subtypeBlockEnd).toBeGreaterThan(subtypeGuardIdx);
  });

  it("never offers Move or Remove from module (D5) - this view has no module context at all", () => {
    expect(stripped).not.toMatch(/bulkMoveToModule|bulkRemoveFromModule|Move to module|Remove from module/);
  });
});

describe("B4: delete arming changes the button's own label, not only a note", () => {
  it("imports isConfirmArmed/selectionSignature from confirmArming.ts", () => {
    expect(stripped).toMatch(/import\s*\{\s*isConfirmArmed,\s*selectionSignature\s*\}\s*from\s*["']\.\/modules\/confirmArming["']/);
  });

  it("the delete Button's own children switch on confirmDelete, rendering two DIFFERENT expressions (finding 7: structure, never prose spelling)", () => {
    const ternaryMatch = stripped.match(/\{confirmDelete\s*\?\s*([^:{}]+?)\s*:\s*([^}]+?)\}/);
    expect(ternaryMatch, "no confirmDelete ternary found").not.toBeNull();
    const armedExpr = ternaryMatch![1].trim();
    const unarmedExpr = ternaryMatch![2].trim();
    // Pin the STRUCTURE (armed and unarmed states are two distinct
    // expressions), never the literal wording either one contains - renaming
    // either label must not break this test.
    expect(armedExpr).not.toBe(unarmedExpr);

    const idx = stripped.indexOf(ternaryMatch![0]);
    expect(idx).toBeGreaterThan(-1);
    // Structural anchor: this expression must be inside a <Button ...> tag,
    // not a sibling <span>/<p> note next to it (the failure mode this AC
    // explicitly calls out from a prior feature) - AND it must be the
    // Button's DIRECT child, not wrapped in yet another element nested
    // inside the Button, which would just relocate the same failure mode
    // one level deeper.
    const buttonStart = stripped.lastIndexOf("<Button", idx);
    const tagEnd = stripped.indexOf(">", buttonStart);
    expect(buttonStart).toBeGreaterThan(-1);
    expect(tagEnd).toBeGreaterThan(buttonStart);
    expect(idx).toBeGreaterThan(tagEnd);
    // Only whitespace may separate the Button's own closing `>` from the
    // label expression - any other character (a wrapping tag's `<`, text, or
    // anything else) means the label is no longer the Button's immediate
    // child content.
    expect(stripped.slice(tagEnd + 1, idx).trim()).toBe("");
  });
});

describe("B6: every bulk write reloads the list afterward", () => {
  it("runGroupedBulkSummary (used by publish/points/delete) calls reload()", () => {
    const fnIdx = stripped.indexOf("const runGroupedBulkSummary = async (");
    expect(fnIdx).toBeGreaterThan(-1);
    const fnEnd = stripped.indexOf("const bulkPublish", fnIdx);
    expect(stripped.slice(fnIdx, fnEnd)).toMatch(/void reload\(\)/);
  });

  it("bulkSetDue, bulkRubric, bulkUpdateSubmissionType and bulkSetDescription each reload after a successful write", () => {
    for (const fnName of ["bulkSetDue", "bulkRubric", "bulkUpdateSubmissionType", "bulkSetDescription"]) {
      const fnIdx = stripped.indexOf(`const ${fnName} = () => {`);
      expect(fnIdx, `${fnName} not found`).toBeGreaterThan(-1);
      const nextFnIdx = stripped.indexOf("\n  const ", fnIdx + 10);
      const body = stripped.slice(fnIdx, nextFnIdx > -1 ? nextFnIdx : undefined);
      expect(body, `${fnName} does not call reload()`).toMatch(/void reload\(\)/);
    }
  });
});

describe("A4/A5: selection is useFlatItemSelection, not a local Set or useModuleSelection", () => {
  it("imports and calls useFlatItemSelection with the current items' ids", () => {
    expect(stripped).toMatch(/import\s*\{\s*useFlatItemSelection\s*\}\s*from\s*["']\.\/useFlatItemSelection["']/);
    expect(stripped).toMatch(/useFlatItemSelection\(currentIds\)/);
    expect(stripped).not.toMatch(/useModuleSelection/);
  });

  it("select-all is called with the filtered/visible ids, not the full list (A4)", () => {
    expect(stripped).toMatch(/selection\.selectAllVisible\(visibleIds\)/);
    // visibleIds must be derived from the searched/filtered `shown` list, not
    // the raw `items` list.
    const visibleIdsIdx = stripped.indexOf("const visibleIds =");
    expect(visibleIdsIdx).toBeGreaterThan(-1);
    const shownIdx = stripped.indexOf("const shown =");
    expect(shownIdx).toBeGreaterThan(-1);
    expect(visibleIdsIdx).toBeGreaterThan(shownIdx);
    expect(stripped.slice(visibleIdsIdx, visibleIdsIdx + 80)).toMatch(/shown\.map/);
  });
});

describe("search persists across reloads under a ta- key, scoped per kind", () => {
  it("reads and writes a ta-course-items-search key derived from `kind`", () => {
    expect(stripped).toMatch(/localStorage\.getItem\(searchKey\)/);
    expect(stripped).toMatch(/localStorage\.setItem\(searchKey,\s*search\)/);
    expect(stripped).toMatch(/const searchKey = `ta-course-items-search-\$\{kindLower\}`/);
  });
});

describe("useFlatItemSelection.ts (Contract 2's flat-selection shape)", () => {
  it("exports the documented return shape and pure helpers", () => {
    expect(selectionStripped).toMatch(/export function useFlatItemSelection\(currentIds: readonly string\[\]\)/);
    expect(selectionStripped).toMatch(/export function toggleSelected\(/);
    expect(selectionStripped).toMatch(/export function mergeOrClearVisible\(/);
    expect(selectionStripped).toMatch(/export function pruneSelection\(/);
    expect(selectionStripped).toMatch(/export function allVisibleSelected\(/);
  });

  it("prunes during render (compare-and-adjust), never inside a useEffect", () => {
    // The eslint rule this repo enforces (AGENTS.md's set-state-in-effect
    // idiom) rejects setState reached synchronously from an effect - the
    // prune call must not appear inside a useEffect body.
    const pruneCallIdx = selectionStripped.indexOf("pruneSelection(selected, currentIds)");
    expect(pruneCallIdx).toBeGreaterThan(-1);
    const precedingEffectIdx = selectionStripped.lastIndexOf("useEffect(", pruneCallIdx);
    const precedingHookIdx = selectionStripped.lastIndexOf("export function useFlatItemSelection", pruneCallIdx);
    // The nearest preceding useFlatItemSelection declaration must be closer
    // than any preceding useEffect call (there should be none at all).
    expect(precedingEffectIdx).toBe(-1);
    expect(precedingHookIdx).toBeGreaterThan(-1);
  });
});
