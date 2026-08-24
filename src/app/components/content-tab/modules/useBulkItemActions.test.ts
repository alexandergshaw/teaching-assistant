// docs/rubric-bulk-action-acceptance-criteria.md, chunk H, agent 2B's slice
// (AC4/AC5) - "Generate & associate rubric" (useBulkItemActions.ts's
// `bulkGenerateAndAssociateRubric`, wired to bulkBarGroupCatalog.ts's
// `itemsGenerateAssociateRubric`).
//
// The three PURE functions bulkGenerateAndAssociateRubric composes
// (buildRubricGenerationInstructions, summarizeRubricGenerateOutcomes,
// describeRubricGenerateNote) were extracted into ./bulkRubricGenerateSummary.ts
// (useBulkItemActions.ts was at 999 of this repo's 1000-line ceiling) and are
// tested directly there, in bulkRubricGenerateSummary.test.ts. This file
// keeps only what must stay pinned against useBulkItemActions.ts itself: the
// wiring proof that `bulkGenerateAndAssociateRubric`'s own body - which is
// stateful (useState/async) and therefore cannot move to a pure module or be
// invoked outside a React render (this repo's own "vitest is node-env...
// no component is ever rendered" note, e.g. useCarryModulePattern.test.ts's
// identical header) - actually calls the REAL server actions, never a
// stand-in or a dead no-op. Source-text, per this repo's own "pin the fact
// and the ordering, never the spelling" rule (docs/DEV_LOOP.md section 9) -
// anchored on identifiers/call expressions, not prose.
import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";
import { join } from "path";

describe("bulkGenerateAndAssociateRubric wiring (source text)", () => {
  const HOOK_PATH = join(process.cwd(), "src/app/components/content-tab/modules/useBulkItemActions.ts");
  const source = readFileSync(HOOK_PATH, "utf8");

  it("imports the real generateAndAssociateRubricAction from the sibling action file, not a local reimplementation", () => {
    expect(source).toMatch(/import\s*\{[^}]*\bgenerateAndAssociateRubricAction\b[^}]*\}\s*from\s*["']@\/app\/actions\/rubric-bulk["']/);
  });

  it("bulkGenerateAndAssociateRubric's own body calls getGradableAction (bounded via mapWithConcurrency) then generateAndAssociateRubricAction, in that order", () => {
    const start = source.indexOf("const bulkGenerateAndAssociateRubric = () => {");
    expect(start, "bulkGenerateAndAssociateRubric was not found - renamed or removed?").toBeGreaterThan(-1);
    const end = source.indexOf("const openRubricBuilder = ", start);
    expect(end, "openRubricBuilder anchor after bulkGenerateAndAssociateRubric moved - update this test's anchor").toBeGreaterThan(start);
    const body = source.slice(start, end);

    const concurrencyCallIdx = body.indexOf("mapWithConcurrency(");
    const detailCallIdx = body.indexOf("getGradableAction(");
    const generateCallIdx = body.indexOf("generateAndAssociateRubricAction(");
    expect(concurrencyCallIdx, "the detail fan-out is not bounded via mapWithConcurrency (C7)").toBeGreaterThan(-1);
    expect(detailCallIdx, "getGradableAction is not called (existing rubric id / description)").toBeGreaterThan(-1);
    expect(generateCallIdx, "generateAndAssociateRubricAction is not called").toBeGreaterThan(-1);
    expect(concurrencyCallIdx).toBeLessThan(generateCallIdx);
    expect(detailCallIdx).toBeLessThan(generateCallIdx);
  });

  // C7: listBulkItemsAction used to be called a SECOND time here purely to
  // fill RubricTargetItem.isNewQuiz - dead weight, since
  // generateAndAssociateRubricAction (rubric-bulk.ts's resolveNewQuizFlags)
  // already makes the identical course-level fetch itself and its own value
  // always wins whenever it has one. This asserts the deleted call stays
  // deleted, not just that the feature still works with it gone.
  it("does not call listBulkItemsAction anywhere in this file (the duplicate New Quiz fetch was deleted, C7)", () => {
    expect(source).not.toMatch(/\blistBulkItemsAction\b/);
  });

  // C3: a failed per-item detail fetch must never be read as "no existing
  // rubric" - see classifyAssignmentDetailFetch's own header
  // (bulkRubricGenerateSummary.ts) for the full argument. This checks the
  // hook actually routes every detail result through that classifier rather
  // than reading `"error" in res` inline again (the shape of the original
  // defect), and that a fetch failure is threaded into the report rather than
  // discarded.
  it("routes every detail fetch through classifyAssignmentDetailFetch and folds failures into the report (C3)", () => {
    const start = source.indexOf("const bulkGenerateAndAssociateRubric = () => {");
    const end = source.indexOf("const openRubricBuilder = ", start);
    const body = source.slice(start, end);
    expect(body).toMatch(/classifyAssignmentDetailFetch\(/);
    expect(body).toMatch(/detailFetchFailureOutcome\(/);
    expect(body).toMatch(/detailFetchFailures/);
    // The three report-building branches (action error / generation failed /
    // done) must all route through summarizeRubricGenerateOutcomes so a
    // detail-fetch failure can never be silently absent from any of them.
    const reportBranches = body.match(/summarizeRubricGenerateOutcomes\(/g) ?? [];
    expect(reportBranches.length).toBeGreaterThanOrEqual(3);
  });

  it("reports the outcome via setBulkRubricGenerateReport and setNote(describeRubricGenerateNote(...)) rather than only reloading silently", () => {
    const start = source.indexOf("const bulkGenerateAndAssociateRubric = () => {");
    const end = source.indexOf("const openRubricBuilder = ", start);
    const body = source.slice(start, end);
    expect(body).toMatch(/setBulkRubricGenerateReport\(/);
    expect(body).toMatch(/setNote\(describeRubricGenerateNote\(/);
  });

  it("is exposed on the hook's return object (reachable from outside the hook)", () => {
    const returnStart = source.lastIndexOf("return {");
    expect(returnStart, "the hook's return object was not found").toBeGreaterThan(-1);
    const returnBlock = source.slice(returnStart);
    expect(returnBlock).toMatch(/\bbulkGenerateAndAssociateRubric\b/);
    expect(returnBlock).toMatch(/\bbulkRubricGenerateReport\b/);
  });
});
