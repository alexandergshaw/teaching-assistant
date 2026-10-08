// Session Diagnostic Log timing for the CHAT grading seams (resolve_header,
// prepare_submission, grade_item, fetch_canvas_meta) on the "grading" surface.
// GRADING-DIAGNOSTICS-COVERAGE wave 2b. Mirrors decideWholeRunDiagnostic in
// ../grading/gradingDiagnosticLog.ts: the DECISION is a pure leaf, the thin
// recorder below calls the browser-only wrapper.
//
// NO STUDENT DATA. A refusal or failure message embeds student names and file
// paths (collisionRefusal.ts), and the diagnostic core scrubs secrets only. So
// the recorded `error` is ALWAYS one of the fixed class strings below, mapped
// from the raw text by pattern; the raw text itself is never passed on.
import { recordGradingDiagnosticEntry } from "@/app/components/grading/gradingDiagnosticLog";

export type ChatSeamOperation = "resolve_header" | "prepare_submission" | "grade_item" | "fetch_canvas_meta";

export const CHAT_SEAM_FAILURE_CLASSES = [
  "name collision",
  "cap exceeded",
  "too large",
  "timed out",
  "unsupported",
  "unreadable",
  "interrupted",
  "grade failed",
  "refused",
] as const;

export type ChatSeamFailureClass = (typeof CHAT_SEAM_FAILURE_CLASSES)[number];

/** PURE. Map a raw refusal / error message to ONE fixed class string. The input
 * is only ever read, never returned. */
export function classifyChatSeamFailure(raw: unknown): ChatSeamFailureClass {
  const text = raw instanceof Error ? raw.message : typeof raw === "string" ? raw : "";
  if (/same student name|collision|collid/i.test(text)) return "name collision";
  if (/time(d)?[ -]?out|deadline|aborted/i.test(text)) return "timed out";
  if (/limit|too many|between \d+ and \d+/i.test(text)) return "cap exceeded";
  if (/too large|exceed|oversize|budget/i.test(text)) return "too large";
  if (/not supported|isn't supported|unsupported/i.test(text)) return "unsupported";
  if (/could not (be )?read|nothing to grade/i.test(text)) return "unreadable";
  return "refused";
}

export interface ChatSeamDecision {
  operation: ChatSeamOperation;
  outcome: "success" | "failure";
  durationMs: number;
  /** A member of CHAT_SEAM_FAILURE_CLASSES; present only on failure. */
  error?: ChatSeamFailureClass;
}

/** PURE. `null` when no start was captured. `failureClass` null = success. */
export function decideChatSeamDiagnostic(args: {
  operation: ChatSeamOperation;
  startedAtMs: number | null;
  settledAtMs: number;
  failureClass: ChatSeamFailureClass | null;
}): ChatSeamDecision | null {
  if (args.startedAtMs === null) return null;
  const durationMs = Math.max(0, Math.round(args.settledAtMs - args.startedAtMs));
  if (args.failureClass) {
    return { operation: args.operation, outcome: "failure", durationMs, error: args.failureClass };
  }
  return { operation: args.operation, outcome: "success", durationMs };
}

/** The monotonic clock the seams capture their start from. A named export so a
 * call site inside a hook body is not read as an impure render-time call. */
export function chatSeamNowMs(): number {
  return performance.now();
}

/** The thin caller the chat handlers use: decide, then record. Returns whether
 * an entry was recorded. `startedAtMs` is a performance.now() capture. */
export function recordChatSeamSettled(args: {
  operation: ChatSeamOperation;
  startedAtMs: number | null;
  failureClass: ChatSeamFailureClass | null;
}): boolean {
  const decision = decideChatSeamDiagnostic({ ...args, settledAtMs: chatSeamNowMs() });
  if (!decision) return false;
  recordGradingDiagnosticEntry({
    at: new Date().toISOString(),
    operation: decision.operation,
    outcome: decision.outcome,
    durationMs: decision.durationMs,
    error: decision.error,
  });
  return true;
}
