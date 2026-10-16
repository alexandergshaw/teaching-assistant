import { previewDocumentTemplateAction } from "@/app/actions/document-template-files";
import type { DocumentReviewParagraph, DocumentUpload } from "@/lib/document-templates/types";
import { checkFileWireBudget } from "@/lib/upload-budget";
import { base64ToArrayBuffer } from "@/app/components/presentations/panel-logic";
import { recordSessionDiagnosticEntry } from "@/lib/session-diagnostic-log";
import { DocumentTemplateError, type DocumentResult } from "@/lib/document-templates/types";

export function createDocumentRequestGate() {
  let generation = 0;
  return { next: () => ++generation, current: (token: number) => token === generation, invalidate: () => { generation += 1; } };
}
export async function readDocumentFile(file: File): Promise<string> {
  const budget = checkFileWireBudget(file.size, "That document");
  if (!budget.ok) throw new DocumentTemplateError("file_size", budget.error ?? "Choose a smaller document.");
  if (!/\.(docx|pdf)$/i.test(file.name)) throw new DocumentTemplateError("file_type", "Upload a DOCX or text-based PDF.");
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new DocumentTemplateError("file_read", "Could not read that file. Select it again."));
    reader.onload = () => resolve(String(reader.result).split(",")[1] ?? "");
    reader.readAsDataURL(file);
  });
}
export async function documentOperation<T>(operation: string, task: () => Promise<DocumentResult<T>>): Promise<DocumentResult<T>> {
  const start = Date.now();
  let result: DocumentResult<T>;
  try { result = await task(); } catch { result = { error: "The request failed. Try again.", code: "request_failed" }; }
  const failure = typeof result === "object" && result !== null && "error" in result ? result as { error: string; code: string } : null;
  recordSessionDiagnosticEntry({ at: new Date().toISOString(), surface: "templates", operation: `document_template_${operation}`, label: `Document template ${operation}`, outcome: failure ? "failure" : "success", durationMs: Date.now() - start, ...(failure ? { error: failure.error, code: failure.code.toUpperCase() } : {}) });
  return result;
}
export function downloadDocument(base64: string, fileName: string): void {
  const url = URL.createObjectURL(new Blob([base64ToArrayBuffer(base64)], { type: /\.pdf$/i.test(fileName) ? "application/pdf" : "application/vnd.openxmlformats-officedocument.wordprocessingml.document" }));
  const link = document.createElement("a"); link.href = url; link.download = fileName; link.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}


/** Display-only merge: the server validates all edits before save or download. */
export function reviewDocumentProposal(source: DocumentReviewParagraph[], proposal: string): DocumentReviewParagraph[] {
  let value: unknown;
  try { value = JSON.parse(proposal); } catch { return source; }
  if (!value || typeof value !== "object" || !("replacements" in value) || !Array.isArray(value.replacements)) return source;
  const replacements = new Map<string, string>();
  for (const replacement of value.replacements) if (replacement && typeof replacement === "object" && typeof replacement.id === "string" && typeof replacement.text === "string") replacements.set(replacement.id, replacement.text);
  return source.map((paragraph) => ({ ...paragraph, templateText: replacements.get(paragraph.id) ?? paragraph.sourceText, replaced: replacements.has(paragraph.id) }));
}
export async function previewReviewedDocument(upload: DocumentUpload | null, id: string | undefined, proposal: string) {
  let definition: unknown;
  try { definition = JSON.parse(proposal); } catch { return { error: "Enter valid proposal JSON before downloading.", code: "invalid_proposal" }; }
  return previewDocumentTemplateAction(upload, definition, id);
}
