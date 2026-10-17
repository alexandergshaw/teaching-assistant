import { recordSessionDiagnosticEntry } from "@/lib/session-diagnostic-log";
export function recordRepositoryPublication(outcome: "success" | "failure", durationMs: number, phase: "READY" | "REFUSED" | "UNCERTAIN", count: number, bytes: number, writer = recordSessionDiagnosticEntry) {
  try { writer({ at: new Date().toISOString(), surface: "templates", operation: "pipeline_private_snapshot_publish", label: "Publish private deck snapshot", institution: "", course: "", outcome, durationMs: Math.max(0, durationMs), code: phase, detail: { count: Math.min(100, Math.max(0, count)), bytes: Math.min(8 * 1024 * 1024, Math.max(0, bytes)) } }); } catch { /* Preserve remote receipts when the sink fails. */ }
}

export function recordCopilotTask(outcome: "success" | "failure", durationMs: number, code: "QUEUED" | "FAILED" | "UNCERTAIN", kind: "initial" | "followup", promptCharacters: number, writer = recordSessionDiagnosticEntry) {
  try { writer({ at: new Date().toISOString(), surface: "templates", operation: "pipeline_copilot_task", label: "Submit Copilot presentation task", institution: "", course: "", outcome, durationMs: Math.max(0, durationMs), code, detail: { kind, promptCharacters: Math.min(20_000, Math.max(0, promptCharacters)) } }); } catch { /* Preserve task receipts when diagnostics are unavailable. */ }
}

/** Observe the actual read without copying any response content into diagnostics. */
export async function measureCopilotTaskRefresh<T extends { error: string } | { task: unknown }>(read: () => Promise<T>, writer = recordSessionDiagnosticEntry, now = () => performance.now()): Promise<T> {
  const started = now();
  function record(outcome: "success" | "failure") {
    try { writer({ at: new Date().toISOString(), surface: "templates", operation: "pipeline_copilot_task_refresh", label: "Refresh Copilot task status", institution: "", course: "", outcome, durationMs: Math.max(0, now() - started), code: outcome === "success" ? "REFRESHED" : "FAILED" }); } catch { /* Diagnostics cannot change the read result. */ }
  }
  try {
    const result = await read();
    record("error" in result ? "failure" : "success");
    return result;
  } catch (error) { record("failure"); throw error; }
}
