import { describe, it, expect } from "vitest";
import fs from "fs";
import path from "path";

// Wiring guard for CarryModulePatternReviewModal.tsx (docs/carry-module-
// pattern-forward-acceptance-criteria.md, chunk D, D18/D19). vitest here is
// node-env and renders no component (this repo's own "vitest is node-env...
// no component is ever rendered" note) - this pins the FACTS this modal's
// own source text must state, via the same source-text-check idiom
// bulkModulesSection.wiring.test.ts and ModulesHeaderBar.wiring.test.ts
// already use, not by rendering anything.
const MODAL_PATH = path.join(process.cwd(), "src/app/components/content-tab/modules/CarryModulePatternReviewModal.tsx");
const SECONDARY_MODALS_PATH = path.join(process.cwd(), "src/app/components/content-tab/modules/ModulesViewSecondaryModals.tsx");
const MODULES_VIEW_PATH = path.join(process.cwd(), "src/app/components/content-tab/ModulesView.tsx");

function stripComments(text: string): string {
  return text.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^[ \t]*\/\/.*$/gm, "");
}

describe("stripComments (canary first)", () => {
  it("removes a // comment but leaves real code alone", () => {
    const fixture = ["// ModalShell used to live here", "const x = ModalShell;"].join("\n");
    const stripped = stripComments(fixture);
    expect(stripped).not.toContain("ModalShell used to live here");
    expect(stripped).toContain("const x = ModalShell;");
  });
});

const modalCode = stripComments(fs.readFileSync(MODAL_PATH, "utf8"));
const secondaryModalsCode = stripComments(fs.readFileSync(SECONDARY_MODALS_PATH, "utf8"));
const modulesViewCode = stripComments(fs.readFileSync(MODULES_VIEW_PATH, "utf8"));

describe("D19: the modal reuses ModalShell and the shared preview* CSS, never new markup/CSS of its own", () => {
  it("imports ModalShell rather than rendering its own backdrop/portal", () => {
    expect(modalCode).toMatch(/import\s*\{\s*ModalShell\s*\}\s*from\s*["']\.\.\/\.\.\/ui\/ModalShell["']/);
  });

  it("reuses previewHeader/previewMeta/previewContent/previewCloseButton, not new class names", () => {
    expect(modalCode).toMatch(/styles\.previewHeader/);
    expect(modalCode).toMatch(/styles\.previewMeta/);
    expect(modalCode).toMatch(/styles\.previewContent/);
    expect(modalCode).toMatch(/styles\.previewCloseButton/);
  });

  it("threads restoreFocusRef/fallbackFocusRefs through to ModalShell", () => {
    const start = modalCode.indexOf("<ModalShell");
    const end = modalCode.indexOf(">", start);
    const tag = modalCode.slice(start, end + 1);
    expect(tag).toMatch(/restoreFocusRef=\{restoreFocusRef\}/);
    expect(tag).toMatch(/fallbackFocusRefs=\{fallbackFocusRefs\}/);
  });
});

describe("coordinator correction: no overwrite control is ever offered", () => {
  it("the modal renders no control whose visible label or aria-label is 'Overwrite'", () => {
    expect(modalCode).not.toMatch(/>Overwrite</);
    expect(modalCode).not.toMatch(/aria-label="[^"]*[Oo]verwrite[^"]*"/);
  });
});

describe("D9/coordinator correction: checkpoint-refused items are shown BEFORE apply runs, with their reason", () => {
  it("renders checkpointRefusedItems as a distinct, always-visible list, not folded into the per-item rows", () => {
    expect(modalCode).toMatch(/checkpointRefusedItems\.map/);
    expect(modalCode).toMatch(/checkpoint/i);
  });

  // Coordinator addition: the refusal reason must name OUR OWN limitation
  // (this app cannot read checkpoint structure back from Canvas at all),
  // never describe it as a property of the instructor's own discussion
  // ("this discussion may carry..."). It is shared with module-template.ts's
  // own refusal path (src/lib/module-template-shape.ts's
  // DISCUSSION_CHECKPOINTS_UNREADABLE_REASON) so the two call sites cannot
  // drift - pin the FACT that this modal imports and renders THAT constant,
  // never the exact sentence, so a copy edit made once in the shared module
  // does not have to redden this test too.
  it("renders the shared DISCUSSION_CHECKPOINTS_UNREADABLE_REASON constant rather than re-spelling the refusal reason locally", () => {
    expect(modalCode).toMatch(/import\s*\{\s*DISCUSSION_CHECKPOINTS_UNREADABLE_REASON\s*\}\s*from\s*["']@\/lib\/module-template-shape["']/);
    expect(modalCode).toMatch(/\{DISCUSSION_CHECKPOINTS_UNREADABLE_REASON\}/);
  });
});

describe("C1: an excluded row renders its own explanation rather than the normal create/skip detail", () => {
  it("branches on the row's own `excluded` flag, not only on excludedItemIds membership", () => {
    expect(modalCode).toMatch(/excluded\s*\?[\s\S]{0,200}Excluded from this carry-forward/);
  });
});

describe("C2: an unwritable kind is disclosed as 'not created', distinct from Blocked", () => {
  it("renders a danger-tone tag and reads unsupportedCount, never silently folding it into createCount", () => {
    expect(modalCode).toMatch(/bulkGroupTagDanger/);
    expect(modalCode).toMatch(/row\.unsupportedCount/);
    expect(modalCode).toMatch(/Not created/);
  });

  it("the header total line also surfaces plan.totals.unsupported when non-zero", () => {
    expect(modalCode).toMatch(/plan\.totals\.unsupported/);
  });
});

// C9: these three used to pin the LITERAL JSX boolean-expression source text
// (`useState(authoredText ?? row.sourceTitle)`, `disabled={!draft.includes
// ("{n}")}`, `row.uniformBlockedMessage ?`) - this repo's own recorded
// "source-text tests over-specify" failure, since a harmless rename or
// ternary inversion would redden these with no behavior change at all. The
// three decisions are now pure exported predicates
// (useCarryModulePattern.ts's `initialCarryDraftText`,
// `draftContainsPatternToken`, `isUniformlyBlockedRow`, each pinned directly
// by useCarryModulePattern.test.ts) - these assertions pin only that the
// modal's call site actually INVOKES the named predicate with the FACTS
// that matter (which two values seed the draft, and in which precedence;
// which predicate gates the Unblock button; which predicate gates the
// affordance), never the surrounding expression's exact spelling.
describe("D4/C9: a uniformly-blocked row offers the {n} affordance, pre-filled with the source title, gated on containing {n}", () => {
  it("imports all three C9 predicates rather than inlining the boolean expressions they replaced", () => {
    expect(modalCode).toMatch(/import\s*\{[^}]*draftContainsPatternToken[^}]*\}\s*from\s*["']\.\/useCarryModulePattern["']/);
    expect(modalCode).toMatch(/\binitialCarryDraftText\b/);
    expect(modalCode).toMatch(/\bisUniformlyBlockedRow\b/);
  });

  it("the draft field is seeded via initialCarryDraftText(authoredText, row.sourceTitle) - authoredText first, sourceTitle as the fallback", () => {
    expect(modalCode).toMatch(/useState\(\s*initialCarryDraftText\(\s*authoredText\s*,\s*row\.sourceTitle\s*\)\s*\)/);
  });

  it("the Unblock control is disabled via draftContainsPatternToken(draft), not an inline .includes check", () => {
    expect(modalCode).toMatch(/disabled=\{!draftContainsPatternToken\(draft\)\}/);
  });

  it("the affordance renders only when isUniformlyBlockedRow(row) is true", () => {
    expect(modalCode).toMatch(/isUniformlyBlockedRow\(row\)/);
  });

  // Pins the ORDERING, not the exact ternary spelling that expresses it: the
  // blocked branch (carrying the Unblock control) must appear before the
  // normal branch (carrying the Pattern: display) in ReviewRow's own source,
  // which is true regardless of which named boolean or inline call drives
  // the ternary, and survives converting `const blocked = ...` into an
  // inlined predicate call.
  it("the blocked branch (Unblock) is written before the normal branch (Pattern:) in ReviewRow", () => {
    const start = modalCode.indexOf("function ReviewRow");
    expect(start).toBeGreaterThan(-1);
    const end = modalCode.indexOf("function CarryModulePatternReviewModal", start);
    const body = modalCode.slice(start, end === -1 ? modalCode.length : end);
    const unblockIdx = body.indexOf("Unblock");
    const patternIdx = body.indexOf("Pattern:");
    expect(unblockIdx).toBeGreaterThan(-1);
    expect(patternIdx).toBeGreaterThan(-1);
    expect(unblockIdx).toBeLessThan(patternIdx);
  });
});

describe("D19: rendered from ModulesViewSecondaryModals.tsx, gated on reviewVisible AND a resolved template/plan", () => {
  it("ModulesViewSecondaryModals imports and renders CarryModulePatternReviewModal", () => {
    expect(secondaryModalsCode).toMatch(/import\s*\{\s*CarryModulePatternReviewModal\s*\}\s*from\s*["']\.\/CarryModulePatternReviewModal["']/);
    expect(secondaryModalsCode).toMatch(/<CarryModulePatternReviewModal/);
  });

  it("the render is gated on reviewVisible, template and plan all being present - never reviewOpen alone", () => {
    const idx = secondaryModalsCode.indexOf("<CarryModulePatternReviewModal");
    expect(idx).toBeGreaterThan(-1);
    const before = secondaryModalsCode.slice(Math.max(0, idx - 200), idx);
    expect(before).toMatch(/carryModulePattern\.reviewVisible\s*&&\s*carryModulePattern\.template\s*&&\s*carryModulePattern\.plan\s*&&/);
  });
});

// C8: a selection change mid-fetch reseeds sourceModuleId (D15), which can
// null out the hook's template/plan while reviewOpen is still true - nothing
// else ever resets reviewOpen. The regression this repo's step-11 pass found
// was not that the modal's OWN gate was wrong (the test above already pinned
// that side) but that ModulesView.tsx fed the bulk bar's consequence-tier
// fact from the BARE reviewOpen flag, so the bar and the modal could
// disagree about whether the destructive path was still reachable. Both
// sides are pinned here, reading the SAME hook field
// (carryModulePattern.reviewVisible) rather than each restating "open and
// resolved" in its own words.
describe("C8: the bulk bar's consequence-tier fact and the modal's mount gate read the SAME field, never a bare reviewOpen", () => {
  it("ModulesView feeds bulkBarFacts.carryReviewOpen from carryModulePattern.reviewVisible", () => {
    expect(modulesViewCode).toMatch(/carryReviewOpen:\s*carryModulePattern\.reviewVisible\s*,/);
  });

  // SABOTAGE-checkable directly: this is the literal shape of the defect -
  // feeding the fact from the bare flag pins the bar's consequence tier open
  // any time template/plan have nulled out from under a still-true
  // reviewOpen, with no reachable control left to dismiss it.
  it("never feeds bulkBarFacts.carryReviewOpen from the bare reviewOpen flag", () => {
    expect(modulesViewCode).not.toMatch(/carryReviewOpen:\s*carryModulePattern\.reviewOpen\s*,/);
  });

  it("the modal's own mount gate reads the identical carryModulePattern.reviewVisible field the bar reads", () => {
    const idx = secondaryModalsCode.indexOf("<CarryModulePatternReviewModal");
    expect(idx).toBeGreaterThan(-1);
    const before = secondaryModalsCode.slice(Math.max(0, idx - 200), idx);
    expect(before).toMatch(/carryModulePattern\.reviewVisible/);
  });
});
