import { describe, it, expect } from "vitest";
import { resolveSetupFill, type ResolveSetupFillResult, type SetupFields } from "./chatSetupFill";
import {
  applyOverride,
  computeOverrideOffer,
  countOverriddenFields,
  type OverrideDecision,
  type OverrideOffer,
} from "./chatOverrideOffer";

const CANVAS: SetupFields = { instructions: "Canvas directions", rubric: "Canvas rubric" };

function fields(instructions: string, rubric: string): SetupFields {
  return { instructions, rubric };
}

function fillFor(typed: SetupFields, canvas: SetupFields | null): ResolveSetupFillResult {
  return resolveSetupFill({ typed, canvasMeta: canvas, storedMemory: null });
}

function resolveLikePanel(typed: SetupFields, canvas: SetupFields | null, decision: OverrideDecision): ResolveSetupFillResult {
  const fill = fillFor(typed, canvas);
  const offer: OverrideOffer = computeOverrideOffer({ typed, canvasMeta: canvas });
  return applyOverride({ base: fill, offer, decision });
}

describe("computeOverrideOffer offerability table", () => {
  const cases: ReadonlyArray<{ name: string; typed: SetupFields; canvas: SetupFields | null; ins: boolean; rub: boolean }> = [
    { name: "blank typed is never offerable", typed: fields("", "  "), canvas: CANVAS, ins: false, rub: false },
    { name: "non-blank differing is offerable", typed: fields("mine", "mine rubric"), canvas: CANVAS, ins: true, rub: true },
    { name: "matching is not offerable", typed: fields("Canvas directions", "Canvas rubric"), canvas: CANVAS, ins: false, rub: false },
    { name: "null canvas is not offerable", typed: fields("mine", "mine"), canvas: null, ins: false, rub: false },
    { name: "blank canvas value is not offerable", typed: fields("mine", "mine"), canvas: fields("", "x y"), ins: false, rub: true },
    { name: "mixed: blank instructions, differing rubric", typed: fields("", "mine"), canvas: CANVAS, ins: false, rub: true },
  ];
  for (const c of cases) {
    it(c.name, () => {
      const offer = computeOverrideOffer({ typed: c.typed, canvasMeta: c.canvas });
      expect(offer.instructions.offerable).toBe(c.ins);
      expect(offer.rubric.offerable).toBe(c.rub);
      expect(offer.anyOfferable).toBe(c.ins || c.rub);
    });
  }
});

describe("applyOverride over the fill result", () => {
  it("accepted instructions + declined rubric: canvas instructions, typed rubric", () => {
    const typed = fields("mine", "mine rubric");
    const out = resolveLikePanel(typed, CANVAS, { instructions: true, rubric: false });
    expect(out).toEqual({
      instructions: "Canvas directions",
      rubric: "mine rubric",
      instructionsSource: "canvas",
      rubricSource: "typed",
    });
  });

  it("a decision of true on a non-offerable field changes nothing", () => {
    const typed = fields("", "mine rubric");
    const base = fillFor(typed, CANVAS);
    const offer = computeOverrideOffer({ typed, canvasMeta: CANVAS });
    const out = applyOverride({ base, offer, decision: { instructions: true, rubric: false } });
    expect(out).toEqual(base);
  });

  it("all declined returns the base values and sources", () => {
    const typed = fields("mine", "mine rubric");
    const base = fillFor(typed, CANVAS);
    const offer = computeOverrideOffer({ typed, canvasMeta: CANVAS });
    expect(applyOverride({ base, offer, decision: { instructions: false, rubric: false } })).toEqual(base);
  });
});

describe("blank-fill non-regression (round-1 blocker)", () => {
  it("instructions blank + rubric differing and accepted: instructions stay the Canvas value, not blank", () => {
    const out = resolveLikePanel(fields("", "mine rubric"), CANVAS, { instructions: false, rubric: true });
    expect(out.instructions).toBe("Canvas directions");
    expect(out.instructionsSource).toBe("canvas");
    expect(out.rubric).toBe("Canvas rubric");
    expect(out.rubricSource).toBe("canvas");
  });

  it("a non-blank field is never silently replaced without an accept", () => {
    const out = resolveLikePanel(fields("mine", "mine rubric"), CANVAS, { instructions: false, rubric: false });
    expect(out.instructions).toBe("mine");
    expect(out.rubric).toBe("mine rubric");
  });
});

describe("countOverriddenFields", () => {
  it("counts only offerable+accepted fields", () => {
    const offer = computeOverrideOffer({ typed: fields("", "mine"), canvasMeta: CANVAS });
    expect(countOverriddenFields(offer, { instructions: true, rubric: true })).toBe(1);
    expect(countOverriddenFields(offer, { instructions: true, rubric: false })).toBe(0);
  });
});
