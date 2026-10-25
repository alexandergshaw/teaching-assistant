import { recordSessionDiagnosticEntry } from "@/lib/session-diagnostic-log";
export type WalkthroughCode = "ok" | "failed" | "invalid-mapping" | "storage-unavailable" | "storage-corrupt" | "cancelled";
export function recordWalkthroughDiagnostic(operation: "pair" | "draft" | "preferences", code: WalkthroughCode, durationMs: number, role: "weekly" | "midweek" | "optional" = "optional", count = 1, source: "live" | "upload" = "live"): void {
  recordSessionDiagnosticEntry({ at: new Date().toISOString(), surface: "templates",
    operation: `walkthrough_${operation}`, label: `Walkthrough ${operation}`,
    outcome: code === "ok" ? "success" : "failure", code: `WTA_${code.toUpperCase().replace(/-/g, "_")}`,
    durationMs: Math.max(0, Math.round(durationMs)), detail: { role, source, count } });
}
