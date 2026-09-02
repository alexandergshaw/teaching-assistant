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
import { interpretRubricsResult } from "./modules/useRubrics";
import type { CanvasRubric } from "@/lib/canvas-modules";

const VIEW_PATH = join(process.cwd(), "src/app/components/content-tab/CourseItemsView.tsx");
const SELECTION_PATH = join(process.cwd(), "src/app/components/content-tab/useFlatItemSelection.ts");
// The bulk-action bar (rendered once a row is selected) was extracted into
// its own leaf, CourseItemsBulkBar.tsx, once CourseItemsView.tsx again
// closed on this repo's 1000-line ceiling - the same way the per-row render
// was pulled into CourseItemRow.tsx earlier (see CourseItemRow.wiring.test.ts).
// Every assertion below that pins the BULK BAR's own JSX (not a handler
// function's body, which stayed in CourseItemsView.tsx) now reads THIS file
// instead.
const BULK_BAR_PATH = join(process.cwd(), "src/app/components/content-tab/CourseItemsBulkBar.tsx");

const viewSource = readFileSync(VIEW_PATH, "utf8");
const selectionSource = readFileSync(SELECTION_PATH, "utf8");
const bulkBarSource = readFileSync(BULK_BAR_PATH, "utf8");

/** Source with comments stripped, so a name mentioned only in prose (this
 *  file's own header, or CourseItemsView's own doc comments) is never
 *  mistaken for a real reference. Mirrors askAiSelection.wiring.test.ts's
 *  own stripComments. */
function stripComments(text: string): string {
  return text.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^[ \t]*\/\/.*$/gm, "");
}

const stripped = stripComments(viewSource);
const selectionStripped = stripComments(selectionSource);
const bulkBarStripped = stripComments(bulkBarSource);

describe("canary: the bulk bar leaf was actually read", () => {
  it("is non-trivial", () => {
    expect(bulkBarStripped.length).toBeGreaterThan(500);
  });
});

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

  // The per-row New Quiz/shadow labelling itself (isNewQuiz/
  // isClassicQuizShadow/isGradedDiscussionShadow badges) moved into
  // CourseItemRow.tsx along with the rest of the per-row render - see
  // CourseItemRow.wiring.test.ts for those assertions now. This file only
  // pins that CourseItemsView.tsx actually RENDERS that component (below) and
  // that every write path still routes through the shared effective-kind
  // helper.
  it("renders CourseItemRow for each shown item, passing item/selected/onToggle/moduleInfo/moduleIndexFailed", () => {
    expect(stripped).toMatch(
      /import\s*\{\s*CourseItemRow\s*\}\s*from\s*["']\.\/CourseItemRow["']/
    );
    const mapIdx = stripped.indexOf("shown.map((it) => (");
    expect(mapIdx, "shown.map((it) => (...)) rendering CourseItemRow not found").toBeGreaterThan(-1);
    const mapEnd = stripped.indexOf("))}", mapIdx);
    const body = stripped.slice(mapIdx, mapEnd);
    expect(body).toMatch(/<CourseItemRow/);
    expect(body).toMatch(/item=\{it\}/);
    expect(body).toMatch(/selected=\{selection\.selected\.has\(it\.id\)\}/);
    expect(body).toMatch(/onToggle=\{\(\)\s*=>\s*selection\.toggle\(it\.id\)\}/);
    expect(body).toMatch(/moduleInfo=\{moduleInfoById\.get\(it\.id\)\s*\?\?\s*\{\s*known:\s*false\s*\}\}/);
    expect(body).toMatch(/moduleIndexFailed=\{moduleIndexFailed\}/);
  });

  it("builds moduleInfoById from filterRows (never calling modulesForItem a second time per row)", () => {
    expect(stripped).toMatch(/const moduleInfoById = useMemo\(/);
    const idx = stripped.indexOf("const moduleInfoById = useMemo(");
    const end = stripped.indexOf(");", idx);
    expect(stripped.slice(idx, end)).toMatch(/filterRows\.map\(\(r\) => \[r\.item\.id, r\.moduleInfo\]/);
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
  // This gating is JSX inside the bulk bar, which now lives in
  // CourseItemsBulkBar.tsx (see this file's header) - not in CourseItemsView.tsx.
  it("gates both the rubric row and the submission-type row on kind === \"Assignment\"", () => {
    const rubricGuardIdx = bulkBarStripped.indexOf('kind === "Assignment" && (');
    expect(rubricGuardIdx, "no kind === \"Assignment\" gated block found").toBeGreaterThan(-1);
    const subtypeGuardIdx = bulkBarStripped.indexOf('kind === "Assignment" && (', rubricGuardIdx + 1);
    expect(subtypeGuardIdx, "only one kind === \"Assignment\" gated block found - expected rubric AND submission type").toBeGreaterThan(rubricGuardIdx);

    const rubricBlockEnd = bulkBarStripped.indexOf("bulkRubric", rubricGuardIdx);
    const subtypeBlockEnd = bulkBarStripped.indexOf("bulkUpdateSubmissionType", subtypeGuardIdx);
    expect(rubricBlockEnd).toBeGreaterThan(rubricGuardIdx);
    expect(subtypeBlockEnd).toBeGreaterThan(subtypeGuardIdx);
  });

  it("never offers Move or Remove from module (D5) - this view has no module context at all", () => {
    expect(stripped).not.toMatch(/bulkMoveToModule|bulkRemoveFromModule|Move to module|Remove from module/);
    // The bulk bar leaf inherited this view's controls verbatim - it must
    // never have grown these either.
    expect(bulkBarStripped).not.toMatch(/bulkMoveToModule|bulkRemoveFromModule|Move to module|Remove from module/);
  });
});

// FINDING 1 FIX: both writes used to be gated on the TAB only, taking
// `[...selection.selected]` verbatim - so a New Quiz, a classic-quiz shadow
// row, or a graded-discussion shadow row selected in the Assignments tab
// reached the rubric/submission-type write. The real per-row proof lives in
// courseItems-eligibility.test.ts (it calls ordinaryAssignmentSelection
// directly - a source-text match here cannot prove a New Quiz id is actually
// excluded, only that the right function is called). This file only pins the
// WIRING: the view calls that pure helper rather than sending the raw
// selection, and the buttons are ALSO disabled up front when nothing in the
// selection is eligible.
describe("FINDING 1: rubric/submission-type writes are gated per ROW, not just per tab", () => {
  it("imports ordinaryAssignmentSelection and both bulkRubric/bulkUpdateSubmissionType call it instead of sending the raw selection", () => {
    expect(stripped).toMatch(
      /import\s*\{\s*ordinaryAssignmentSelection\s*\}\s*from\s*["']\.\/courseItems-eligibility["']/
    );
    expect(stripped).not.toMatch(/function ordinaryAssignmentSelection\(/);

    const rubricIdx = stripped.indexOf("const bulkRubric = () => {");
    expect(rubricIdx, "bulkRubric not found").toBeGreaterThan(-1);
    const rubricEnd = stripped.indexOf("const bulkUpdateSubmissionType", rubricIdx);
    const rubricBody = stripped.slice(rubricIdx, rubricEnd);
    expect(rubricBody).toMatch(/ordinaryAssignmentSelection\(selection\.selected,\s*itemsById\)/);
    // The old unfiltered form must be gone from this function.
    expect(rubricBody).not.toMatch(/const ids = \[\.\.\.selection\.selected\];/);

    const subtypeIdx = rubricEnd;
    const subtypeEnd = stripped.indexOf("const bulkSetDescription", subtypeIdx);
    const subtypeBody = stripped.slice(subtypeIdx, subtypeEnd);
    expect(subtypeBody).toMatch(/ordinaryAssignmentSelection\(selection\.selected,\s*itemsById\)/);
    expect(subtypeBody).not.toMatch(/const ids = \[\.\.\.selection\.selected\];/);
  });

  it("both functions bail out with a note (never an empty-selection silent no-op) when zero rows are eligible", () => {
    for (const fnName of ["bulkRubric", "bulkUpdateSubmissionType"]) {
      const fnIdx = stripped.indexOf(`const ${fnName} = () => {`);
      expect(fnIdx, `${fnName} not found`).toBeGreaterThan(-1);
      const nextFnIdx = stripped.indexOf("\n  const ", fnIdx + 10);
      const body = stripped.slice(fnIdx, nextFnIdx > -1 ? nextFnIdx : undefined);
      expect(body, `${fnName} does not check ids.length === 0`).toMatch(/if \(ids\.length === 0\)/);
      expect(body, `${fnName} does not report a "not eligible" note`).toMatch(/setNote\(\{\s*kind:\s*"error"/);
    }
  });

  it("both result notes mention how many rows were skipped and why, never silently dropping ineligible rows", () => {
    expect(stripped).toMatch(/\$\{skipped \? `, \$\{skipped\} skipped \(not an ordinary assignment\)` : ""\}/g);
  });

  it("computes eligibleAssignmentCount from ordinaryAssignmentSelection", () => {
    expect(stripped).toMatch(/const eligibleAssignmentCount =/);
  });

  // The button JSX these two checks target lives in CourseItemsBulkBar.tsx
  // now (see this file's header) - CourseItemsView.tsx only computes
  // eligibleAssignmentCount (checked above) and passes it down as a prop.
  it("disables both the rubric and submission-type buttons when eligibleAssignmentCount is zero, in addition to the pre-existing gates", () => {
    const rubricButtonIdx = bulkBarStripped.indexOf("onClick={bulkRubric}");
    expect(rubricButtonIdx).toBeGreaterThan(-1);
    const rubricButtonStart = bulkBarStripped.lastIndexOf("<Button", rubricButtonIdx);
    const rubricDisabled = bulkBarStripped.slice(rubricButtonStart, rubricButtonIdx);
    expect(rubricDisabled).toMatch(/eligibleAssignmentCount === 0/);

    const subtypeButtonIdx = bulkBarStripped.indexOf("onClick={bulkUpdateSubmissionType}");
    expect(subtypeButtonIdx).toBeGreaterThan(-1);
    const subtypeButtonStart = bulkBarStripped.lastIndexOf("<Button", subtypeButtonIdx);
    const subtypeDisabled = bulkBarStripped.slice(subtypeButtonStart, subtypeButtonIdx);
    expect(subtypeDisabled).toMatch(/eligibleAssignmentCount === 0/);
  });

  it("surfaces a hint when the selection is non-empty but nothing in it is eligible", () => {
    // CourseItemsView.tsx passes `selection.selected.size` down as the
    // `selectedCount` prop (see CourseItemsBulkBar.tsx's own props) - the
    // bulk bar itself has no `selection` object to read.
    expect(bulkBarStripped).toMatch(/selectedCount > 0 && eligibleAssignmentCount === 0/);
  });
});

describe("BLOCKER FIX: a PARTIAL rubric load still populates the picker", () => {
  // The bug: `listRubrics` (rubrics.ts) can return `{ rubrics, error }` on a
  // partial load - BOTH keys present, whenever one of its two sources
  // (course-level, account-level) failed but the other still loaded. The old
  // code narrowed with `if (!("error" in result)) setRubrics(result.rubrics)`
  // - a runtime KEY check that is FALSE on that shape (the key is present),
  // so `setRubrics` was never called and the picker rendered "No rubrics" -
  // indistinguishable from the feature being entirely absent, on a SECOND
  // surface after the same defect was already found and fixed once for the
  // Modules tab's own bulk rubric picker (useRubrics.ts/rubrics.ts).
  it("the rubrics effect no longer narrows on the bare 'error' key (the shape both keys can share), and instead threads every result through interpretRubricsResult", () => {
    const fnIdx = stripped.indexOf('if (kind !== "Assignment" || !courseUrl || sourceContext.source === "export") {');
    expect(fnIdx, "rubrics effect body not found").toBeGreaterThan(-1);
    const fnEnd = stripped.indexOf("})();", fnIdx);
    const body = stripped.slice(fnIdx, fnEnd);
    // The exact broken pattern must be gone.
    expect(body).not.toMatch(/if \(!\("error" in result\)\)/);
    // Reuses the same pure decision function the Modules tab's rubric picker
    // already uses and already has unit tests for (useRubrics.ts), rather
    // than a second, independently-drifting narrowing rule.
    expect(body).toMatch(/interpretRubricsResult\(result\)/);
    expect(body).toMatch(/setRubrics\(loaded\)/);
    expect(body).toMatch(/if \(note\) setNote\(note\)/);
    expect(stripped).toMatch(
      /import\s*\{\s*interpretRubricsResult\s*\}\s*from\s*["']\.\/modules\/useRubrics["']/
    );
  });

  // This is the actual behavioural proof, not just a text match: since the
  // test above pins that CourseItemsView's rubric effect delegates to
  // interpretRubricsResult for every outcome, exercising that SAME function
  // with a partial-load result here proves what the picker in this view
  // actually does with one - directly, not by inference.
  it("a partial load (both `rubrics` and `error` present) still returns the rubrics that DID load, not an empty list", () => {
    const courseRubric: CanvasRubric = { id: 1, title: "Essay Rubric", source: "course" };
    const partial = { rubrics: [courseRubric], error: "Could not load account-level rubrics (HTTP 500)." };
    const outcome = interpretRubricsResult(partial);
    expect(outcome.rubrics).toEqual([courseRubric]);
    expect(outcome.note).toEqual({ kind: "error", text: partial.error });
  });
});

describe("B4: delete arming changes the button's own label, not only a note", () => {
  it("imports isConfirmArmed/selectionSignature from confirmArming.ts", () => {
    expect(stripped).toMatch(/import\s*\{\s*isConfirmArmed,\s*selectionSignature\s*\}\s*from\s*["']\.\/modules\/confirmArming["']/);
  });

  // This ternary is JSX inside the bulk bar's own Delete button, which now
  // lives in CourseItemsBulkBar.tsx (see this file's header) -
  // CourseItemsView.tsx only computes the `confirmDelete` boolean
  // (isConfirmArmed/selectionSignature, checked above) and passes it down.
  it("the delete Button's own children switch on confirmDelete, rendering two DIFFERENT expressions (finding 7: structure, never prose spelling)", () => {
    const ternaryMatch = bulkBarStripped.match(/\{confirmDelete\s*\?\s*([^:{}]+?)\s*:\s*([^}]+?)\}/);
    expect(ternaryMatch, "no confirmDelete ternary found").not.toBeNull();
    const armedExpr = ternaryMatch![1].trim();
    const unarmedExpr = ternaryMatch![2].trim();
    // Pin the STRUCTURE (armed and unarmed states are two distinct
    // expressions), never the literal wording either one contains - renaming
    // either label must not break this test.
    expect(armedExpr).not.toBe(unarmedExpr);

    const idx = bulkBarStripped.indexOf(ternaryMatch![0]);
    expect(idx).toBeGreaterThan(-1);
    // Structural anchor: this expression must be inside a <Button ...> tag,
    // not a sibling <span>/<p> note next to it (the failure mode this AC
    // explicitly calls out from a prior feature) - AND it must be the
    // Button's DIRECT child, not wrapped in yet another element nested
    // inside the Button, which would just relocate the same failure mode
    // one level deeper.
    const buttonStart = bulkBarStripped.lastIndexOf("<Button", idx);
    const tagEnd = bulkBarStripped.indexOf(">", buttonStart);
    expect(buttonStart).toBeGreaterThan(-1);
    expect(tagEnd).toBeGreaterThan(buttonStart);
    expect(idx).toBeGreaterThan(tagEnd);
    // Only whitespace may separate the Button's own closing `>` from the
    // label expression - any other character (a wrapping tag's `<`, text, or
    // anything else) means the label is no longer the Button's immediate
    // child content.
    expect(bulkBarStripped.slice(tagEnd + 1, idx).trim()).toBe("");
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

describe("module associations column (which module each item belongs to)", () => {
  it("imports buildModuleIndex/modulesForItem from the pure leaf, rather than redefining the mapping", () => {
    expect(stripped).toMatch(
      /import\s*\{\s*buildModuleIndex,\s*modulesForItem\s*\}\s*from\s*["']\.\/courseItems-modules["']/
    );
    expect(stripped).not.toMatch(/function buildModuleIndex\(/);
    expect(stripped).not.toMatch(/function modulesForItem\(/);
  });

  it("imports listCourseContentAction and calls it with (courseUrl, acronym) to build the module index", () => {
    expect(stripped).toMatch(/import\s*\{[^}]*\blistCourseContentAction\b[^}]*\}\s*from\s*["']\.\.\/\.\.\/actions["']/);
    expect(stripped).toMatch(/listCourseContentAction\(courseUrl,\s*acronym\)/);
  });

  it("A4: a module-tree fetch failure sets the index to null and surfaces the failure through setNote, never touching item status/error", () => {
    const idx = stripped.indexOf("const loadModuleIndex = async () => {");
    expect(idx, "loadModuleIndex not found").toBeGreaterThan(-1);
    const end = stripped.indexOf("\n  };", idx);
    const body = stripped.slice(idx, end);
    expect(body).toMatch(/if \("error" in result\)/);
    expect(body).toMatch(/setModuleIndex\(null\)/);
    expect(body).toMatch(/setNote\(\{\s*kind:\s*"error"/);
    // Never sets the whole-list error state - a module-tree failure degrades
    // only the module column (A4), it must not fail the items list too.
    expect(body).not.toMatch(/setStatus\("error"\)/);
  });

  it("A6: reload() also refreshes the module index, so a manual refresh or any bulk write's own reload keeps the column in step", () => {
    const idx = stripped.indexOf("const reload = async () => {");
    expect(idx, "reload not found").toBeGreaterThan(-1);
    const end = stripped.indexOf("const loadModuleIndex", idx);
    expect(end).toBeGreaterThan(idx);
    expect(stripped.slice(idx, end)).toMatch(/loadModuleIndex\(\)/);
  });

  // The four-way module-cell rendering (A2/A3/A4/NIT11) moved into
  // CourseItemRow.tsx along with the rest of the per-row render - see
  // CourseItemRow.wiring.test.ts for those assertions now.

  it("DECISION (NIT13): search stays title-only, now delegated to the shared filterCourseItems leaf (courseItems-filters.ts) rather than a hand-rolled inline filter", () => {
    const idx = stripped.indexOf("const shown = filterCourseItems(");
    expect(idx, "shown must be computed via filterCourseItems").toBeGreaterThan(-1);
    const end = stripped.indexOf("const visibleIds =", idx);
    const body = stripped.slice(idx, end);
    expect(body).toMatch(/filterCourseItems\(filterRows,\s*filters,\s*search\)/);
  });
});

describe("facet filters (this feature's own AC): delegated to the pure courseItems-filters leaf", () => {
  it("imports the filtering leaf's functions rather than redefining the logic in the component", () => {
    expect(stripped).toMatch(
      /import\s*\{[\s\S]*?\bfilterCourseItems\b[\s\S]*?\}\s*from\s*["']\.\/courseItems-filters["']/
    );
    expect(stripped).not.toMatch(/function filterCourseItems\(/);
    expect(stripped).not.toMatch(/function matchesCourseItemFilters\(/);
    expect(stripped).not.toMatch(/function matchesTitleSearch\(/);
  });

  it("builds filterRows from modulesForItem (the same module leaf the row render itself uses), not a second copy of the association rule", () => {
    const idx = stripped.indexOf("const filterRows = useMemo(");
    expect(idx, "filterRows not found").toBeGreaterThan(-1);
    const end = stripped.indexOf(");", idx);
    expect(stripped.slice(idx, end)).toMatch(/modulesForItem\(it,\s*kind,\s*moduleIndex\)/);
  });

  it("every facet control is a MenuItem-based select bound to `filters`, and quiz kind is gated on kind === \"Quiz\" (Assignments tab never renders it, C3)", () => {
    expect(stripped).toMatch(/value=\{filters\.published\}/);
    expect(stripped).toMatch(/value=\{filters\.module\}/);
    expect(stripped).toMatch(/value=\{filters\.dueDate\}/);
    expect(stripped).toMatch(/value=\{filters\.points\}/);
    const quizKindIdx = stripped.indexOf("value={filters.quizKind}");
    expect(quizKindIdx).toBeGreaterThan(-1);
    const guardIdx = stripped.lastIndexOf('kind === "Quiz" && (', quizKindIdx);
    expect(guardIdx, "quiz-kind select is not gated on kind === \"Quiz\"").toBeGreaterThan(-1);
  });

  it("persists all five facets together under one ta-course-items-filters key, scoped per kind - not five independent keys", () => {
    expect(stripped).toMatch(/const filtersKey = courseItemFiltersStorageKey\(kindLower\)/);
    expect(stripped).toMatch(/localStorage\.getItem\(filtersKey\)/);
    expect(stripped).toMatch(/localStorage\.setItem\(filtersKey,\s*serializeCourseItemFilters\(filters\)\)/);
  });

  it("offers a way to clear every facet at once (F4), only surfaced while a facet is actually narrowed", () => {
    expect(stripped).toMatch(/const clearFilters = \(\) => setFilters\(DEFAULT_COURSE_ITEM_FILTERS\)/);
    expect(stripped).toMatch(/\{filtersActive && \(/);
  });

  it("F6: the empty-filtered-result message is worded differently depending on whether the facets are active, distinct from the whole-course-empty state", () => {
    const idx = stripped.indexOf("{shown.length === 0 && (");
    expect(idx, "empty-filtered-result block not found").toBeGreaterThan(-1);
    const end = stripped.indexOf("{shown.map((it) => {", idx);
    const body = stripped.slice(idx, end);
    expect(body).toMatch(/filtersActive/);
    expect(body).toMatch(/clearFilters/);
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
