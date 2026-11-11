import type { GradingRunHeader } from "@/lib/grade/types";

export type SubmitOutcome =
  | { readonly kind: "accepted"; readonly entryCount: number; readonly sourceIndices?: readonly number[] }
  | { readonly kind: "refused"; readonly reason: string }
  // RES-GC-8 (docs/grading-chat-reliability.md section 2): a multi-entry
  // submission that exceeds the cap dispatches what fits and refuses only
  // the remainder, never the entire event after extraction has completed.
  | { readonly kind: "partial"; readonly dispatchedCount: number; readonly refusedCount: number; readonly reason: string; readonly sourceIndices?: readonly number[] };

export function continuousSessionView(session: { sessionId: number; header: Extract<GradingRunHeader, { kind: "ok" }> | null; canvasUrl: string }) {
  return {
    canvasUrl: session.canvasUrl,
    runKey: "grading-chat-" + session.sessionId,
    sessionId: session.sessionId,
    effectiveRubric: session.header?.effectiveRubric ?? "",
    rubricFingerprint: session.header?.rubricFingerprint ?? "",
    generatedRubric: session.header?.generatedRubric,
  };
}
