// GRADING-CHAT smoothing W1: the setup-field fill decision (ruling I1).
// Pure and client-safe. For each of the two setup fields independently, the
// first non-blank source wins, in this order: what the instructor typed, then
// what a Canvas fetch returned, then the persisted scoped memory, else blank.
// A typed value is never replaced by a fetched or stored one.
//
// The legacy global slots are NOT an input here: the panel resolves which
// persisted value to hand in as storedMemory (scoped memory, or the one-time
// legacy read for a non-Canvas session).

export type FillSource = "typed" | "canvas" | "memory" | "blank";

export interface SetupFields {
  readonly instructions: string;
  readonly rubric: string;
}

export interface ResolveSetupFillInput {
  readonly typed: SetupFields;
  readonly canvasMeta: SetupFields | null;
  readonly storedMemory: SetupFields | null;
}

export interface ResolveSetupFillResult {
  readonly instructions: string;
  readonly rubric: string;
  readonly instructionsSource: FillSource;
  readonly rubricSource: FillSource;
}

function isFilled(value: string | undefined): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

function pick(
  typed: string,
  canvas: string | undefined,
  memory: string | undefined,
): { readonly value: string; readonly source: FillSource } {
  if (isFilled(typed)) return { value: typed, source: "typed" };
  if (isFilled(canvas)) return { value: canvas, source: "canvas" };
  if (isFilled(memory)) return { value: memory, source: "memory" };
  return { value: "", source: "blank" };
}

export function resolveSetupFill(input: ResolveSetupFillInput): ResolveSetupFillResult {
  const ins = pick(input.typed.instructions, input.canvasMeta?.instructions, input.storedMemory?.instructions);
  const rub = pick(input.typed.rubric, input.canvasMeta?.rubric, input.storedMemory?.rubric);
  return {
    instructions: ins.value,
    rubric: rub.value,
    instructionsSource: ins.source,
    rubricSource: rub.source,
  };
}
