import { recordSessionDiagnosticEntry } from "@/lib/session-diagnostic-log";
import { failure, type TemplateFailure } from "@/lib/powerpoint-template-library/types";
export const SELECTED_TEMPLATE_KEY = "ta-ppt-template-file-id";
export function handoffTemplate(sourceFileId: string, storage: Pick<Storage, "setItem">, navigate: () => void): { ok: true } | TemplateFailure {
  try { storage.setItem(SELECTED_TEMPLATE_KEY, JSON.stringify(sourceFileId)); }
  catch { return failure(null, "PPT_SELECTION"); }
  navigate();
  return { ok: true };
}
export function readTemplateFile(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => { const data = String(reader.result); resolve(data.slice(data.indexOf(",") + 1)); };
    reader.onerror = () => reject(new Error("PPT_INVALID"));
    reader.readAsDataURL(file);
  });
}
export function downloadTemplate(base64: string, mimeType: string, name: string) {
  const bytes = Uint8Array.from(atob(base64), char => char.charCodeAt(0));
  const url = URL.createObjectURL(new Blob([bytes], { type: mimeType }));
  try {
    const anchor = document.createElement("a");
    anchor.href = url; anchor.download = name; anchor.click();
  } finally { URL.revokeObjectURL(url); }
}

export function recordPowerPointDiagnostic(operation: "load" | "analyze" | "save" | "reuse" | "download", started: number, result: { code?: string } | null = null) {
  recordSessionDiagnosticEntry({
    at: new Date().toISOString(), surface: "templates", operation: "ppt_template_" + operation,
    outcome: result ? "failure" : "success", durationMs: Math.max(0, Date.now() - started),
    ...(result?.code ? { code: result.code, error: result.code } : {}),
  });
}
export function templateOperationStartedAt(): number { return Date.now(); }
