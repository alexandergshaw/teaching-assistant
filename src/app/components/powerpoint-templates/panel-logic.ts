import { recordSessionDiagnosticEntry } from "@/lib/session-diagnostic-log";
import { failure, type LibrarySlide, type TemplateFailure } from "@/lib/powerpoint-template-library/types";
export const SELECTED_TEMPLATE_KEY = "ta-ppt-template-file-id";
export function allowPowerPointRouteChange(dirty: boolean, busy: boolean, confirm: () => boolean, inform: () => void): boolean {
  if (busy) { inform(); return false; }
  return !dirty || confirm();
}
export function libraryDisplayName<T extends { id: string; name: string }>(library: T, libraries: readonly T[]): string {
  const key = library.name.trim().normalize("NFKC").toLocaleLowerCase();
  const duplicate = libraries.some((other) => other.id !== library.id && other.name.trim().normalize("NFKC").toLocaleLowerCase() === key);
  return duplicate ? `${library.name} (${library.id})` : library.name;
}
export function filterLibraryPage<T extends { name: string }>(libraries: readonly T[], query: string, page: number, pageSize = 10) {
  const key = query.trim().normalize("NFKC").toLocaleLowerCase();
  const matches = libraries.filter((library) => library.name.normalize("NFKC").toLocaleLowerCase().includes(key));
  const pages = Math.max(1, Math.ceil(matches.length / pageSize));
  const current = Number.isInteger(page) ? Math.max(1, Math.min(page, pages)) : 1;
  return { matches: matches.length, pages, current, items: matches.slice((current - 1) * pageSize, current * pageSize) };
}
export const SELECTED_ROLE_LIBRARY_KEY = "ta-ppt-role-library";
export function filterTemplateSlides(slides: readonly LibrarySlide[], query: string): LibrarySlide[] {
  const term = query.trim().toLocaleLowerCase();
  return slides.filter((slide) => `${slide.ordinal}\n${slide.text}`.toLocaleLowerCase().includes(term));
}
export const ROLE_LIBRARY_CHANGED = "ta-ppt-role-library-changed";
export function sourceSlidePage<T>(slides: readonly T[], page: number, pageSize = 6): readonly T[] {
  const safePage = Number.isInteger(page) && page > 0 ? page : 1;
  return slides.slice((safePage - 1) * pageSize, safePage * pageSize);
}
export function handoffTemplate(sourceFileId: string, storage: Pick<Storage, "setItem">, navigate: () => void, libraryId?: string): { ok: true } | TemplateFailure {
  try {
    storage.setItem(SELECTED_ROLE_LIBRARY_KEY, JSON.stringify(libraryId ? { libraryId, sourceFileId } : null));
    storage.setItem(SELECTED_TEMPLATE_KEY, JSON.stringify(sourceFileId));
    if (typeof window !== "undefined") window.dispatchEvent(new Event(ROLE_LIBRARY_CHANGED));
  }
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
