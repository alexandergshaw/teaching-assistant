// Typed grade-call failure classes (docs/chat-grading-detailed-diagnostics-scope.md
// 4.3, WA). IMPORT-FREE on purpose, like video-failure.ts: engine.ts's runtime
// import closure is policed by runtime-import-graph.test.ts, and this leaf is
// imported by route.ts and the client as well.
//
// THE CLASS IS ASSIGNED WHERE THE FAILURE IS THROWN (a GradeCallError carries
// it), never recovered from message text. The message literals thrown with it
// are byte-identical to the pre-existing ones so classifyChatSeamFailure (which
// does read prose) and every UI string keyed on them are unchanged.

export const GRADE_FAILURE_CLASSES = [
  "model rejected request", // callLlm !ok, status 400
  "model quota", // 429
  "model unavailable", // 404
  "model service error", // 408, 5xx
  "model unreachable", // status 0 (network or abort)
  "model http other", // any other non-ok status
  "model cut off", // finishReason MAX_TOKENS
  "model stopped early", // every other non-STOP finishReason
  "model unparseable", // no valid grading JSON
  "route budget", // route soft budget, 504
  "route error", // route 502 not from the model
  "request refused", // route 400 / 401 (client-assigned)
  "transport lost", // client got no usable response (client-assigned)
  "unclassified",
] as const;

export type GradeFailureClass = (typeof GRADE_FAILURE_CLASSES)[number];

export function isGradeFailureClass(value: unknown): value is GradeFailureClass {
  return typeof value === "string" && (GRADE_FAILURE_CLASSES as readonly string[]).includes(value);
}

/** Map a non-ok HTTP status from callLlm to a class, by NUMBER only. */
export function gradeFailureClassForStatus(status: number): GradeFailureClass {
  if (status === 400) return "model rejected request";
  if (status === 429) return "model quota";
  if (status === 404) return "model unavailable";
  if (status === 408 || status >= 500) return "model service error";
  if (status === 0) return "model unreachable";
  return "model http other";
}

/**
 * Map a non-STOP finish reason to a class. Deliberately only two buckets: the
 * provider's enum semantics were not verifiable when this was written (scope
 * R3), so MAX_TOKENS is "cut off" and everything else is "stopped early".
 */
export function gradeFailureClassForFinishReason(finishReason: string): GradeFailureClass {
  return finishReason === "MAX_TOKENS" ? "model cut off" : "model stopped early";
}

export class GradeCallError extends Error {
  readonly failureClass: GradeFailureClass;
  readonly finishReason?: string;

  constructor(message: string, failureClass: GradeFailureClass, finishReason?: string) {
    super(message);
    this.name = "GradeCallError";
    this.failureClass = failureClass;
    if (finishReason !== undefined) this.finishReason = finishReason;
  }
}
