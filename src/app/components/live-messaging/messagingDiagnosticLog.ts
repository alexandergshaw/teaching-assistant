// The live-messaging surface's client wrapper over the app-wide Session
// Diagnostic Log (src/lib/session-diagnostic-log.ts). Mirrors
// gradingDiagnosticLog.ts: ONE surface value ("messaging"), this module owns
// the operation vocabulary, and every record goes THROUGH the core so
// scrubbing, capping and drop accounting stay in one place.
//
// BROWSER-ONLY. The core holds module-scope state that a server would share
// across requests, so nothing under src/app/api, src/app/actions or any
// "use server" file may import this module (the scan in
// session-diagnostic-log.test.ts bans this specifier too). The send action
// returns per-student {key, status} values and the CLIENT records from them.
//
// NO STUDENT DATA, COUNTS ONLY. A finished (or stopped) batch records exactly
// three entries: accepted, refused and unknown, each with the number of
// recipients in that class in the generic `Students` column. `error` carries
// enumerated outcome codes only ("2x refused-http"), never a name, a subject, a
// body or a login id. A zero count is a recorded zero, not an absence.
import { recordSessionDiagnosticEntry } from "@/lib/session-diagnostic-log";

export type MessagingDiagnosticOperation = "send_batch_accepted" | "send_batch_refused" | "send_batch_unknown";

export const MESSAGING_DIAGNOSTIC_OPERATION_LABELS: Readonly<Record<MessagingDiagnosticOperation, string>> = {
  send_batch_accepted: "Messages accepted by Canvas",
  send_batch_refused: "Messages refused by Canvas",
  send_batch_unknown: "Messages with unconfirmed delivery",
};

export interface MessagingBatchOutcome {
  at: string;
  /** The institution code (not personal data). */
  institution: string;
  durationMs: number;
  accepted: number;
  refused: number;
  unknown: number;
  /** Enumerated code summaries such as "2x refused-http, 1x refused-rate-limited". */
  refusedCodes: string;
  unknownCodes: string;
}

export interface MessagingDiagnosticDraft {
  operation: MessagingDiagnosticOperation;
  label: string;
  outcome: "success" | "failure";
  count: number;
  error: string;
}

/** PURE. The three entries a batch produces; only counts and enumerated codes. */
export function buildBatchDiagnosticEntries(outcome: MessagingBatchOutcome): MessagingDiagnosticDraft[] {
  const clean = (n: number) => (Number.isFinite(n) && n > 0 ? Math.floor(n) : 0);
  const refused = clean(outcome.refused);
  const unknown = clean(outcome.unknown);
  return [
    {
      operation: "send_batch_accepted",
      label: MESSAGING_DIAGNOSTIC_OPERATION_LABELS.send_batch_accepted,
      outcome: "success",
      count: clean(outcome.accepted),
      error: "",
    },
    {
      operation: "send_batch_refused",
      label: MESSAGING_DIAGNOSTIC_OPERATION_LABELS.send_batch_refused,
      outcome: refused > 0 ? "failure" : "success",
      count: refused,
      error: refused > 0 ? outcome.refusedCodes : "",
    },
    {
      operation: "send_batch_unknown",
      label: MESSAGING_DIAGNOSTIC_OPERATION_LABELS.send_batch_unknown,
      outcome: unknown > 0 ? "failure" : "success",
      count: unknown,
      error: unknown > 0 ? outcome.unknownCodes : "",
    },
  ];
}

/** Record one finished or stopped batch. Call it OUTSIDE a setState updater. */
export function recordMessagingBatchOutcome(outcome: MessagingBatchOutcome): void {
  for (const draft of buildBatchDiagnosticEntries(outcome)) {
    recordSessionDiagnosticEntry({
      at: outcome.at,
      surface: "messaging",
      operation: draft.operation,
      label: draft.label,
      institution: outcome.institution,
      course: "",
      outcome: draft.outcome,
      error: draft.error,
      durationMs: outcome.durationMs,
      classificationStudentCount: draft.count,
    });
  }
}
