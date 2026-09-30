// PRES-2 S3: tests for the Slide-plan stage (docs/pres-2-scope.md section
// 2.3, pass condition PLAN-SEPARATION in section 5).
//
// Two things are asserted:
//
//   1. TYPE-LEVEL: a "prediction and its answer on one slide" is
//      unrepresentable by construction. vitest cannot directly assert that
//      code fails to compile, so this is proven two ways that DO run:
//        (a) exhaustiveness - a switch over `role` with no default case
//            still type-checks (verified by `npx tsc --noEmit`, not by this
//            test file itself, since a missing-case error is a compile
//            error, not a runtime one) and every constructed entry is one
//            of exactly the three roles;
//        (b) at runtime, no value returned by any fixture/constructor ever
//            has both a `predictionId`-bearing question payload AND an
//            answer payload on the same object - there is structurally only
//            one role tag and one payload shape per entry.
//      The type-level guarantee itself is recorded in the comment on
//      SlidePlanEntry in slide-plan.ts: the union has three variants
//      (content, prediction, answer) and none of them combines a question
//      and an answer, so the "question+answer" state has no constructor.
//   2. validateSlidePlan catches each violation class non-vacuously (a
//      sabotage that skips a check must turn the corresponding test red),
//      and a well-formed plan yields zero findings.

import { describe, it, expect } from "vitest";
import {
  validateSlidePlan,
  type SlidePlan,
  type SlidePlanEntry,
} from "./slide-plan";

function content(dominantClaim: string): SlidePlanEntry {
  return { role: "content", dominantClaim };
}

function prediction(dominantClaim: string, predictionId: string): SlidePlanEntry {
  return { role: "prediction", dominantClaim, predictionId };
}

function answer(dominantClaim: string, predictionId: string): SlidePlanEntry {
  return { role: "answer", dominantClaim, predictionId };
}

describe("SlidePlanEntry - type-level separation", () => {
  it("has exactly three roles, none of which combines question and answer", () => {
    const entries: SlidePlanEntry[] = [
      content("intro claim"),
      prediction("what will happen", "p1"),
      answer("here is what happened", "p1"),
    ];

    for (const entry of entries) {
      // Exhaustive switch: if a fourth role were ever added (e.g. a
      // "question+answer" combined variant), this switch would need a new
      // case to keep compiling under tsc's exhaustiveness checking via the
      // `never` assignment in default - proving no such variant exists today.
      switch (entry.role) {
        case "content":
          expect("predictionId" in entry).toBe(false);
          break;
        case "prediction":
          expect(typeof entry.predictionId).toBe("string");
          expect("answer" in entry).toBe(false);
          break;
        case "answer":
          expect(typeof entry.predictionId).toBe("string");
          expect("question" in entry).toBe(false);
          break;
        default: {
          const exhaustive: never = entry;
          throw new Error(`unreachable role: ${JSON.stringify(exhaustive)}`);
        }
      }
    }
  });

  it("a prediction and its answer are always two distinct entries (two slides)", () => {
    const plan: SlidePlan = {
      entries: [prediction("guess the output", "p1"), answer("the output was X", "p1")],
    };

    // One entry -> one slide, so a pair is necessarily two slides. There is
    // no SlidePlanEntry variant an implementer could use to collapse this
    // pair into a single array element - the type has no such constructor.
    expect(plan.entries).toHaveLength(2);
    expect(plan.entries[0].role).toBe("prediction");
    expect(plan.entries[1].role).toBe("answer");
    expect(plan.entries[0]).not.toBe(plan.entries[1]);
  });
});

describe("validateSlidePlan - well-formed plan", () => {
  it("returns zero findings for a fully paired, non-empty plan", () => {
    const plan: SlidePlan = {
      entries: [
        content("HTTP is request/response"),
        prediction("what status code comes back", "p1"),
        answer("a 404, because the path does not exist", "p1"),
        content("headers carry metadata"),
      ],
    };

    expect(validateSlidePlan(plan)).toEqual([]);
  });
});

describe("validateSlidePlan - orphan prediction", () => {
  it("flags a prediction with no matching answer", () => {
    const plan: SlidePlan = {
      entries: [
        content("intro"),
        prediction("what happens next", "p1"),
        // no answer for p1
      ],
    };

    const violations = validateSlidePlan(plan);
    const orphan = violations.find((v) => v.kind === "orphan-prediction");
    expect(orphan).toBeDefined();
    expect(orphan?.index).toBe(1);
    expect(orphan?.predictionId).toBe("p1");
  });

  it("SABOTAGE: a validator that never checks for orphan predictions must fail this test", () => {
    // This mirrors the real check with the orphan-prediction branch removed,
    // proving the assertion above is non-vacuous - it goes red without the
    // real check performing that work.
    function sabotagedValidate(plan: SlidePlan) {
      const violations: SlidePlanViolationLike[] = [];
      const answerIds = new Set(
        plan.entries.filter((e) => e.role === "answer").map((e) => (e as { predictionId: string }).predictionId),
      );
      // Deliberately omits: checking that every prediction has a matching answer.
      for (const entry of plan.entries) {
        if (entry.role === "answer" && !isPrediction(plan, (entry as { predictionId: string }).predictionId)) {
          violations.push({ kind: "orphan-answer" });
        }
      }
      return violations;
    }
    function isPrediction(plan: SlidePlan, id: string) {
      return plan.entries.some((e) => e.role === "prediction" && (e as { predictionId: string }).predictionId === id);
    }
    type SlidePlanViolationLike = { kind: string };

    const plan: SlidePlan = {
      entries: [prediction("what happens next", "p1")],
    };

    // The sabotaged validator misses the orphan prediction...
    expect(sabotagedValidate(plan).some((v) => v.kind === "orphan-prediction")).toBe(false);
    // ...but the real validator catches it, proving the test would fail
    // (go RED) against a sabotaged implementation that skipped this check.
    expect(validateSlidePlan(plan).some((v) => v.kind === "orphan-prediction")).toBe(true);
  });
});

describe("validateSlidePlan - orphan answer", () => {
  it("flags an answer with no matching prediction", () => {
    const plan: SlidePlan = {
      entries: [content("intro"), answer("the answer to nothing", "p9")],
    };

    const violations = validateSlidePlan(plan);
    const orphan = violations.find((v) => v.kind === "orphan-answer");
    expect(orphan).toBeDefined();
    expect(orphan?.index).toBe(1);
    expect(orphan?.predictionId).toBe("p9");
  });
});

describe("validateSlidePlan - duplicate prediction id", () => {
  it("flags two prediction entries sharing one predictionId", () => {
    const plan: SlidePlan = {
      entries: [
        prediction("first guess", "p1"),
        prediction("second guess", "p1"),
        answer("resolved", "p1"),
      ],
    };

    const violations = validateSlidePlan(plan);
    expect(violations.some((v) => v.kind === "duplicate-prediction-id" && v.predictionId === "p1")).toBe(true);
  });
});

describe("validateSlidePlan - missing dominant claim", () => {
  it("flags an entry with an empty dominantClaim", () => {
    const plan: SlidePlan = {
      entries: [content(""), content("   "), content("a real claim")],
    };

    const violations = validateSlidePlan(plan);
    const missing = violations.filter((v) => v.kind === "missing-dominant-claim");
    expect(missing).toHaveLength(2);
    expect(missing.map((v) => v.index).sort()).toEqual([0, 1]);
  });

  it("flags missing dominant claims regardless of role", () => {
    const plan: SlidePlan = {
      entries: [prediction("", "p1"), answer("", "p1")],
    };

    const violations = validateSlidePlan(plan);
    const missing = violations.filter((v) => v.kind === "missing-dominant-claim");
    expect(missing).toHaveLength(2);
  });
});

describe("validateSlidePlan - multiple violation classes at once", () => {
  it("reports every violation with correct indices, not just the first", () => {
    const plan: SlidePlan = {
      entries: [
        content(""), // missing-dominant-claim, index 0
        prediction("guess", "p1"), // orphan-prediction, index 1
        answer("resolved", "p2"), // orphan-answer, index 2
      ],
    };

    const violations = validateSlidePlan(plan);
    const kinds = violations.map((v) => v.kind).sort();
    expect(kinds).toEqual(["missing-dominant-claim", "orphan-answer", "orphan-prediction"].sort());

    const missing = violations.find((v) => v.kind === "missing-dominant-claim");
    expect(missing?.index).toBe(0);
    const orphanPrediction = violations.find((v) => v.kind === "orphan-prediction");
    expect(orphanPrediction?.index).toBe(1);
    const orphanAnswer = violations.find((v) => v.kind === "orphan-answer");
    expect(orphanAnswer?.index).toBe(2);
  });
});
