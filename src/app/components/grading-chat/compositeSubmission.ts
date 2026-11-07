import type { SubmitOutcome } from "./useContinuousGradingRun";

export type CompositeDispatchResult =
  | { kind: "accepted" }
  | { kind: "refused"; reason: string }
  | { kind: "uncertain" };

/** An interrupted or ambiguous dispatch must not be automatically retried. */
export async function dispatchComposite(
  submit: () => Promise<SubmitOutcome>,
  isCurrent: () => boolean,
): Promise<CompositeDispatchResult> {
  try {
    const outcome = await submit();
    if (!isCurrent()) return { kind: "uncertain" };
    if (outcome.kind === "refused") return outcome;
    if (outcome.kind === "accepted" && outcome.entryCount === 1) return { kind: "accepted" };
    return { kind: "uncertain" };
  } catch {
    return { kind: "uncertain" };
  }
}
