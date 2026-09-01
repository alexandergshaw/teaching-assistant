import { describe, it, expect } from "vitest";
import {
  plansSignature,
  isGenerateConfirmArmed,
  planEditSignature,
  planHasEdits,
  isRegenerateConfirmArmed,
  generateButtonLabel,
  generateConfirmMessage,
  regenerateButtonLabel,
  regenerateTooltip,
  courseEngineDoneMessage,
  type EditablePlanFields,
} from "./lecture-planning-decisions";
import type { AssignmentPlan } from "../actions";

// Sabotage check performed on every test below: each assertion pins an EXACT
// literal (not a "matches the input" tautology, not a round-trip through the
// function under test on both sides). Flipping any conditional inside
// lecture-planning-decisions.ts flips at least one of these expectations.

function plan(overrides: Partial<AssignmentPlan> = {}): AssignmentPlan {
  return {
    assignmentName: "assignment1",
    label: "Assignment 1",
    presentationTitle: "Title",
    slides: [],
    moduleIntroduction: "intro",
    assignmentInstructions: "instructions",
    ...overrides,
  } as AssignmentPlan;
}

describe("plansSignature / isGenerateConfirmArmed (BLOCKER 1)", () => {
  it("an empty plan set never needs confirming, even if a stale armed value happens to match", () => {
    expect(isGenerateConfirmArmed("", [])).toBe(false);
    expect(isGenerateConfirmArmed(null, [])).toBe(false);
  });

  it("a non-empty plan set is NOT armed until it has been armed for its own signature", () => {
    const plans = [plan({ assignmentName: "a1" }), plan({ assignmentName: "a2" })];
    expect(isGenerateConfirmArmed(null, plans)).toBe(false);
    expect(isGenerateConfirmArmed("something-else", plans)).toBe(false);
  });

  it("arming for the current plan set's own signature is what makes it armed", () => {
    const plans = [plan({ assignmentName: "a1" }), plan({ assignmentName: "a2" })];
    expect(isGenerateConfirmArmed(plansSignature(plans), plans)).toBe(true);
  });

  it("signature is order-independent - arming for {a2,a1} still arms {a1,a2}", () => {
    const forward = [plan({ assignmentName: "a1" }), plan({ assignmentName: "a2" })];
    const reversed = [plan({ assignmentName: "a2" }), plan({ assignmentName: "a1" })];
    expect(isGenerateConfirmArmed(plansSignature(reversed), forward)).toBe(true);
  });

  it("a DIFFERENT plan set invalidates a stale arm (a new zip / new scope re-requires confirmation)", () => {
    const armedFor = plansSignature([plan({ assignmentName: "a1" }), plan({ assignmentName: "a2" })]);
    const differentPlans = [plan({ assignmentName: "a1" }), plan({ assignmentName: "a3" })];
    expect(isGenerateConfirmArmed(armedFor, differentPlans)).toBe(false);
  });
});

describe("planEditSignature / planHasEdits (BLOCKER 2)", () => {
  const original: EditablePlanFields = {
    presentationTitle: "Original Title",
    moduleIntroduction: "Original intro",
    assignmentInstructions: "Original instructions",
    slides: [{ title: "S1", bullets: ["b1"] }],
  };

  it("an unedited card (identical fields) has no edits", () => {
    const current: EditablePlanFields = {
      presentationTitle: "Original Title",
      moduleIntroduction: "Original intro",
      assignmentInstructions: "Original instructions",
      slides: [{ title: "S1", bullets: ["b1"] }],
    };
    expect(planHasEdits(current, original)).toBe(false);
  });

  it("a title-only edit is detected", () => {
    const current: EditablePlanFields = { ...original, presentationTitle: "Edited Title" };
    expect(planHasEdits(current, original)).toBe(true);
  });

  it("an edit buried inside the slides array is detected (not just top-level fields)", () => {
    const current: EditablePlanFields = {
      ...original,
      slides: [{ title: "S1", bullets: ["b1 EDITED"] }],
    };
    expect(planHasEdits(current, original)).toBe(true);
  });

  it("planEditSignature is deterministic for identical content", () => {
    const a: EditablePlanFields = { ...original, slides: [{ title: "S1", bullets: ["b1"] }] };
    const b: EditablePlanFields = { ...original, slides: [{ title: "S1", bullets: ["b1"] }] };
    expect(planEditSignature(a)).toBe(planEditSignature(b));
  });
});

describe("isRegenerateConfirmArmed (BLOCKER 2)", () => {
  const current: EditablePlanFields = {
    presentationTitle: "Edited Title",
    moduleIntroduction: "intro",
    assignmentInstructions: "instructions",
    slides: [],
  };

  it("no armed state at all - not armed", () => {
    expect(isRegenerateConfirmArmed(null, 0, current)).toBe(false);
  });

  it("armed for a DIFFERENT index - not armed for this card", () => {
    expect(isRegenerateConfirmArmed({ index: 1, signature: planEditSignature(current) }, 0, current)).toBe(false);
  });

  it("armed for this index with a signature that matches the CURRENT card - armed", () => {
    expect(isRegenerateConfirmArmed({ index: 0, signature: planEditSignature(current) }, 0, current)).toBe(true);
  });

  it("armed for this index, but the card changed again since arming (stale signature) - not armed", () => {
    const staleSignature = planEditSignature({ ...current, presentationTitle: "A different edit" });
    expect(isRegenerateConfirmArmed({ index: 0, signature: staleSignature }, 0, current)).toBe(false);
  });

  it("undefined plan (index out of range) - never armed", () => {
    expect(isRegenerateConfirmArmed({ index: 0, signature: "anything" }, 0, undefined)).toBe(false);
  });
});

describe("generateButtonLabel", () => {
  it("loading always wins regardless of scope or arming", () => {
    expect(generateButtonLabel({ status: "loading", scope: "all", confirmArmed: true })).toBe("Generating…");
    expect(generateButtonLabel({ status: "loading", scope: "single", confirmArmed: false })).toBe("Generating…");
  });

  it("armed (and not loading) shows the confirm label regardless of scope", () => {
    expect(generateButtonLabel({ status: "idle", scope: "all", confirmArmed: true })).toBe(
      "Confirm — discard and regenerate"
    );
    expect(generateButtonLabel({ status: "done", scope: "single", confirmArmed: true })).toBe(
      "Confirm — discard and regenerate"
    );
  });

  it("idle/unarmed shows the scope-specific label", () => {
    expect(generateButtonLabel({ status: "idle", scope: "all", confirmArmed: false })).toBe("Generate Lecture Plans");
    expect(generateButtonLabel({ status: "idle", scope: "single", confirmArmed: false })).toBe("Generate Module");
  });
});

describe("generateConfirmMessage", () => {
  it("pluralizes correctly at the boundary", () => {
    expect(generateConfirmMessage(1)).toBe(
      "This will discard 1 generated plan and any edits you have made to them. Click Generate again to confirm."
    );
    expect(generateConfirmMessage(2)).toBe(
      "This will discard 2 generated plans and any edits you have made to them. Click Generate again to confirm."
    );
  });
});

describe("regenerateButtonLabel / regenerateTooltip", () => {
  it("regenerating wins over armed", () => {
    expect(regenerateButtonLabel({ regenerating: true, confirmArmed: true })).toBe("Regenerating…");
  });

  it("armed (not regenerating) shows the confirm label", () => {
    expect(regenerateButtonLabel({ regenerating: false, confirmArmed: true })).toBe("Confirm — discard edits");
  });

  it("neither regenerating nor armed shows the plain label", () => {
    expect(regenerateButtonLabel({ regenerating: false, confirmArmed: false })).toBe("Regenerate");
  });

  it("tooltip: no edits at all - immediate-regenerate copy, no mention of discarding", () => {
    expect(regenerateTooltip({ hasEdits: false, confirmArmed: false })).toBe(
      "Regenerate this module from the uploaded zip."
    );
  });

  it("tooltip: edits present but not yet armed - warns before the first click", () => {
    expect(regenerateTooltip({ hasEdits: true, confirmArmed: false })).toBe(
      "This module has unsaved edits. Regenerating will discard them."
    );
  });

  it("tooltip: edits present and armed - tells the instructor the next click confirms", () => {
    expect(regenerateTooltip({ hasEdits: true, confirmArmed: true })).toBe(
      "This module has unsaved edits. Click again to discard them and regenerate."
    );
  });
});

describe("courseEngineDoneMessage (BLOCKER 3)", () => {
  it("names the exact file that was produced", () => {
    expect(courseEngineDoneMessage("course-materials.zip")).toBe(
      "Course package generated: course-materials.zip. The download should have started automatically — if it did not, use the button below."
    );
  });
});
