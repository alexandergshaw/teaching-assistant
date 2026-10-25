import { recordSessionDiagnosticEntry } from "@/lib/session-diagnostic-log";
export type LibraryOperation = "load" | "import" | "save" | "retry" | "delete";
export type LibraryCode = "ok" | "invalid" | "conflict" | "unavailable" | "unauthenticated" | "not-found" | "timedout";
export function recordLibraryDiagnostic(operation: LibraryOperation, code: LibraryCode, durationMs: number, count = 1): void {
  recordSessionDiagnosticEntry({ at: new Date().toISOString(), surface: "templates",
    operation: `announcement_library_${operation}`, label: `Announcement library ${operation}`,
    outcome: code === "ok" ? "success" : "failure", code: `ANN_LIBRARY_${code.toUpperCase().replace(/-/g, "_")}`, error: code === "ok" ? undefined : code,
    durationMs: Math.max(0, Math.round(durationMs)), detail: { count } });
}
