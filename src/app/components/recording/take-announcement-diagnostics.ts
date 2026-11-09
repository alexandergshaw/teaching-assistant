import { recordSessionDiagnosticEntry } from "@/lib/session-diagnostic-log";

export type TakeDiagnosticOperation = "example_list" | "example_add" | "example_select" | "example_remove" | "draft" | "regenerate" | "edit_save" | "source_response" | "download_dispatch" | "post";
type TakeDiagnosticDetail = { exampleCount?: number; exampleSelected?: boolean; hasLabel?: boolean; hasExample?: boolean; hasInstructorContext?: boolean; mediaCategory?: "audio" | "video" | "other"; delivery?: "confirmed" | "refused" | "uncertain" };

/** The caller passes only bounded aggregates and closed categories, never content. */
export function recordTakeDiagnostic(operation: TakeDiagnosticOperation, success: boolean, started: number, detail: TakeDiagnosticDetail = {}): void {
  try {
    const safeDetail = {
      ...(Number.isFinite(detail.exampleCount) ? { exampleCount: Math.max(0, Math.min(10000, Math.round(detail.exampleCount!))) } : {}),
      ...(typeof detail.exampleSelected === "boolean" ? { exampleSelected: detail.exampleSelected } : {}),
      ...(typeof detail.hasLabel === "boolean" ? { hasLabel: detail.hasLabel } : {}),
      ...(typeof detail.hasExample === "boolean" ? { hasExample: detail.hasExample } : {}),
      ...(typeof detail.hasInstructorContext === "boolean" ? { hasInstructorContext: detail.hasInstructorContext } : {}),
      ...(["audio", "video", "other"].includes(detail.mediaCategory ?? "") ? { mediaCategory: detail.mediaCategory! } : {}),
      ...(["confirmed", "refused", "uncertain"].includes(detail.delivery ?? "") ? { delivery: detail.delivery! } : {}),
    };
    recordSessionDiagnosticEntry({ at: new Date().toISOString(), surface: "recording", operation: `recording_announcement_${operation}`,
      label: `Recording announcement ${operation.replace(/_/g, " ")}`, outcome: success ? "success" : "failure",
      error: success ? undefined : "Announcement operation failed.", durationMs: Math.max(0, Date.now() - started), detail: safeDetail });
  } catch { /* Diagnostics must never affect the operation. */ }
}

export function mediaCategory(mime: string): "audio" | "video" | "other" {
  return mime.startsWith("audio/") ? "audio" : mime.startsWith("video/") ? "video" : "other";
}
