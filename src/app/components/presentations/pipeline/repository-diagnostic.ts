import { recordSessionDiagnosticEntry } from "@/lib/session-diagnostic-log";
export function recordRepositoryPublication(outcome: "success" | "failure", durationMs: number, phase: "READY" | "REFUSED" | "UNCERTAIN", count: number, bytes: number, writer = recordSessionDiagnosticEntry) {
  try { writer({ at: new Date().toISOString(), surface: "templates", operation: "pipeline_private_snapshot_publish", label: "Publish private deck snapshot", institution: "", course: "", outcome, durationMs: Math.max(0, durationMs), code: phase, detail: { count: Math.min(100, Math.max(0, count)), bytes: Math.min(8 * 1024 * 1024, Math.max(0, bytes)) } }); } catch { /* Preserve remote receipts when the sink fails. */ }
}
