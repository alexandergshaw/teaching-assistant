// LMS-META-OVERRIDE-OFFER: the pure decision leaf for offering to replace
// typed (non-blank) setup text with the Canvas assignment's values. Sibling of
// chatSetupFill.ts; pure and client-safe, single caller (GradingChatPanel).
//
// OFFERABILITY is judged on the RAW typed values: a field is offerable when
// the instructor typed a non-blank value AND Canvas returned a non-blank value
// that DIFFERS. A blank field is never offerable (resolveSetupFill fills it
// silently). The apply composes over the resolveSetupFill RESULT, never over
// raw typed, so a blank field that was silently filled from Canvas is never
// reverted to blank (an empty instructions field makes beginSession refuse).
import type { ResolveSetupFillResult, SetupFields } from "./chatSetupFill";

export interface OverrideOfferField {
  readonly offerable: boolean;
  readonly canvasValue: string;
}

export interface OverrideOffer {
  readonly instructions: OverrideOfferField;
  readonly rubric: OverrideOfferField;
  readonly anyOfferable: boolean;
}

export interface OverrideDecision {
  readonly instructions: boolean;
  readonly rubric: boolean;
}

function isFilled(value: string | undefined): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

function offerField(typed: string, canvas: string | undefined): OverrideOfferField {
  if (isFilled(typed) && isFilled(canvas) && typed !== canvas) {
    return { offerable: true, canvasValue: canvas };
  }
  return { offerable: false, canvasValue: isFilled(canvas) ? canvas : "" };
}

export function computeOverrideOffer(args: {
  typed: SetupFields;
  canvasMeta: SetupFields | null;
}): OverrideOffer {
  const instructions = offerField(args.typed.instructions, args.canvasMeta?.instructions);
  const rubric = offerField(args.typed.rubric, args.canvasMeta?.rubric);
  return { instructions, rubric, anyOfferable: instructions.offerable || rubric.offerable };
}

export function applyOverride(args: {
  base: ResolveSetupFillResult;
  offer: OverrideOffer;
  decision: OverrideDecision;
}): ResolveSetupFillResult {
  const { base, offer, decision } = args;
  const takeIns = offer.instructions.offerable && decision.instructions;
  const takeRub = offer.rubric.offerable && decision.rubric;
  return {
    instructions: takeIns ? offer.instructions.canvasValue : base.instructions,
    rubric: takeRub ? offer.rubric.canvasValue : base.rubric,
    instructionsSource: takeIns ? "canvas" : base.instructionsSource,
    rubricSource: takeRub ? "canvas" : base.rubricSource,
  };
}

/** How many fields the decision actually replaces (a bare count for the
 * diagnostic; never the text). */
export function countOverriddenFields(offer: OverrideOffer, decision: OverrideDecision): number {
  return (offer.instructions.offerable && decision.instructions ? 1 : 0) +
    (offer.rubric.offerable && decision.rubric ? 1 : 0);
}
