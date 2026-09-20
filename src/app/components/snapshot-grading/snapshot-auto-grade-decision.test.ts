// N15c (Ruling D1). Mirrors stop-guard.test.ts's convention for
// decideStopGuard: decideAutoGrade and planAutoGradeStep are executed
// DIRECTLY here, not merely mentioned - a real, behavioral proof that "fires
// when it should not" and "never fires" are both assertable, per the reframe
// this whole file exists to prove.

import { describe, it, expect } from "vitest";
import {
  decideAutoGrade,
  planAutoGradeStep,
  type DecideAutoGradeInput,
} from "./snapshot-auto-grade-decision";
import type { GradeEligibilityInputs } from "./snapshot-row";
import type { SnapshotShot } from "./snapshot-shot";

function makeShot(overrides: Partial<SnapshotShot> = {}): SnapshotShot {
  return {
    id: "snap-1",
    role: "submission",
    base64: "AAAA",
    previewUrl: "blob:test",
    source: "capture",
    capturedAt: 0,
    ...overrides,
  };
}

function makeEligibility(overrides: Partial<GradeEligibilityInputs> = {}): GradeEligibilityInputs {
  return {
    grading: false,
    shotCount: 1,
    transcriptText: "",
    rubricText: "",
    confirmedRubricAreas: null,
    ...overrides,
  };
}

function makeInput(overrides: Partial<DecideAutoGradeInput> = {}): DecideAutoGradeInput {
  return {
    armed: true,
    addedShots: [makeShot()],
    inFlight: false,
    confirmedThisLoad: true,
    eligibility: makeEligibility(),
    ...overrides,
  };
}

describe("decideAutoGrade (N15c AC 1-5)", () => {
  it("[fires-unarmed bar] armed:false -> {fire:false, reason:'not-armed'}, even with every other precondition satisfied", () => {
    expect(decideAutoGrade(makeInput({ armed: false }))).toEqual({ fire: false, reason: "not-armed" });
  });

  it("[never-fires bar] every precondition genuinely satisfied -> {fire:true}", () => {
    expect(decideAutoGrade(makeInput())).toEqual({ fire: true });
  });

  it("zero submission arrivals (null and non-submission roles only) -> {fire:false, reason:'no-arrivals'}", () => {
    expect(
      decideAutoGrade(
        makeInput({ addedShots: [null, makeShot({ role: "rubric" })] })
      )
    ).toEqual({ fire: false, reason: "no-arrivals" });
  });

  it("inFlight:true -> {fire:false, reason:'in-flight'}, even with everything else fireable", () => {
    expect(decideAutoGrade(makeInput({ inFlight: true }))).toEqual({ fire: false, reason: "in-flight" });
  });

  it("eligibility.grading:true -> {fire:false, reason:'not-eligible'}", () => {
    expect(
      decideAutoGrade(makeInput({ eligibility: makeEligibility({ grading: true }) }))
    ).toEqual({ fire: false, reason: "not-eligible" });
  });

  it("non-blank rubricText with confirmedRubricAreas:null -> {fire:false, reason:'not-eligible'} (bypasses the shared button gate otherwise)", () => {
    expect(
      decideAutoGrade(
        makeInput({
          eligibility: makeEligibility({ rubricText: "non-blank", confirmedRubricAreas: null }),
        })
      )
    ).toEqual({ fire: false, reason: "not-eligible" });
  });

  it("blank rubricText with confirmedRubricAreas:null is still fireable (the no-rubric path)", () => {
    expect(
      decideAutoGrade(
        makeInput({ eligibility: makeEligibility({ rubricText: "", confirmedRubricAreas: null }) })
      )
    ).toEqual({ fire: true });
  });

  it("confirmedThisLoad:false -> {fire:false, reason:'needs-confirmation'}, even with everything else fireable", () => {
    expect(decideAutoGrade(makeInput({ confirmedThisLoad: false }))).toEqual({
      fire: false,
      reason: "needs-confirmation",
    });
  });

  it("confirmedThisLoad:true with everything else satisfied -> {fire:true}", () => {
    expect(decideAutoGrade(makeInput({ confirmedThisLoad: true }))).toEqual({ fire: true });
  });
});

// ---------------------------------------------------------------------------
// The nine measured evasions this pass must catalogue as RED. Several of
// these are wiring/dispatch defects one level up from decideAutoGrade
// itself (a caller ignoring its own return value, or hardcoding an input) -
// named as such, not oversold as something decideAutoGrade alone can catch.
// Every sabotage below is expressed as "the real behavior this function (or
// planAutoGradeStep) must have", proven by direct execution.
// ---------------------------------------------------------------------------

describe("sabotage 1: armed check deleted from decideAutoGrade", () => {
  it("an unarmed instructor never gets {fire:true} - proven by direct execution, not a text scan", () => {
    const result = decideAutoGrade(makeInput({ armed: false }));
    expect(result.fire).toBe(false);
  });
});

describe("sabotage 2 (armed:true hardcoded at the gather site): decideAutoGrade itself is honest about what it was given", () => {
  it("decideAutoGrade({armed:false,...}) never returns fire:true regardless of every other field - a caller that hardcodes armed:true bypasses THIS gate, which is why the gather-site wiring check (instruction 3) pins the literal `armed: autoGradeArmed` textually, not just this function's own correctness", () => {
    expect(decideAutoGrade(makeInput({ armed: false })).fire).toBe(false);
  });
});

describe("sabotage 3 (confirmedThisLoad:true hardcoded): decideAutoGrade honestly requires the real value", () => {
  it("decideAutoGrade({confirmedThisLoad:false,...otherwise-fireable}) never returns fire:true - a caller that hardcodes confirmedThisLoad:true bypasses this, which is why instruction 3 also pins `confirmedThisLoad: confirmedThisLoadRef.current` textually", () => {
    expect(decideAutoGrade(makeInput({ confirmedThisLoad: false })).fire).toBe(false);
  });
});

describe("sabotage 4: the return after a no-fire decision is deleted (planAutoGradeStep never lets a no-fire decision become a fire step)", () => {
  it("every no-fire reason maps to a step kind OTHER than 'fire'", () => {
    const reasons: Array<DecideAutoGradeInput> = [
      makeInput({ armed: false }),
      makeInput({ addedShots: [null] }),
      makeInput({ inFlight: true }),
      makeInput({ eligibility: makeEligibility({ grading: true }) }),
      makeInput({ confirmedThisLoad: false }),
    ];
    for (const input of reasons) {
      const decision = decideAutoGrade(input);
      const step = planAutoGradeStep(decision, { shotsForGrade: [] });
      expect(step.kind).not.toBe("fire");
    }
  });
});

describe("sabotage 5 (the decision is computed and thrown away): planAutoGradeStep is a pure function of its own decision argument, not of some other ambient state", () => {
  it("the exact same decision always produces the exact same step kind", () => {
    const decision = decideAutoGrade(makeInput());
    const shots = [makeShot()];
    expect(planAutoGradeStep(decision, { shotsForGrade: shots }).kind).toBe("fire");
    expect(planAutoGradeStep(decision, { shotsForGrade: shots }).kind).toBe("fire");
  });

  it("an in-flight rejection maps to 'queue', never 'none' (a dropped, not queued, rejection is D3's exact defect)", () => {
    const decision = decideAutoGrade(makeInput({ inFlight: true }));
    expect(planAutoGradeStep(decision, { shotsForGrade: [] }).kind).toBe("queue");
  });

  it("a needs-confirmation rejection maps to 'confirm', never silently to 'fire' or silently to 'none'", () => {
    const decision = decideAutoGrade(makeInput({ confirmedThisLoad: false }));
    expect(planAutoGradeStep(decision, { shotsForGrade: [] }).kind).toBe("confirm");
  });

  it("a not-armed/no-arrivals/not-eligible rejection maps to 'none' - none of these has a settle event to retry on, so none may be queued", () => {
    expect(planAutoGradeStep(decideAutoGrade(makeInput({ armed: false })), { shotsForGrade: [] }).kind).toBe(
      "none"
    );
    expect(
      planAutoGradeStep(decideAutoGrade(makeInput({ addedShots: [null] })), { shotsForGrade: [] }).kind
    ).toBe("none");
    expect(
      planAutoGradeStep(
        decideAutoGrade(makeInput({ eligibility: makeEligibility({ grading: true }) })),
        { shotsForGrade: [] }
      ).kind
    ).toBe("none");
  });
});

describe("planAutoGradeStep carries shotsForGrade through unchanged - never recomputed, never dropped", () => {
  it("the queueState's shotsForGrade array is the one returned, for every kind", () => {
    const shots = [makeShot({ id: "x" }), makeShot({ id: "y" })];
    expect(planAutoGradeStep(decideAutoGrade(makeInput()), { shotsForGrade: shots }).shotsForGrade).toBe(
      shots
    );
    expect(
      planAutoGradeStep(decideAutoGrade(makeInput({ inFlight: true })), { shotsForGrade: shots })
        .shotsForGrade
    ).toBe(shots);
  });
});
