"use server";

import { ZipCapError } from "@/lib/zip-caps";
import { requireUser } from "@/lib/supabase/auth";
import { abstractDocument, buildDocumentReview, validateDefinition } from "@/lib/document-templates/abstract";
import { extractDocument, outputBase64 } from "@/lib/document-templates/extract";
import { buildDocumentTemplate, fillDocumentTemplate } from "@/lib/document-templates/fill";
import { getDocumentTemplate, listDocumentTemplates, saveDocumentTemplate } from "@/lib/document-templates/store";
import { DocumentTemplateError, boundedName, type DocumentUpload, type DocumentTemplateReview, type DocumentResult, type DocumentTemplateMeta, type DocumentProposal } from "@/lib/document-templates/types";

function failure(error: unknown) {
  if (error instanceof ZipCapError) return { error: "That document is too large or heavily compressed to open safely. Upload a smaller document.", code: "file_complexity" };
  return error instanceof DocumentTemplateError ? { error: error.message, code: error.code } : { error: "Document templates are unavailable. Check your sign-in and setup, then try again.", code: "document_unavailable" };
}
export async function listDocumentTemplatesAction(): Promise<DocumentResult<{ templates: DocumentTemplateMeta[] }>> {
  try { const user = await requireUser(); return { templates: await listDocumentTemplates(user.id) }; } catch (error) { return failure(error); }
}
export async function getDocumentTemplateAction(id: string): Promise<DocumentResult<{ template: DocumentTemplateReview }>> {
  try { const user = await requireUser(); const template = await getDocumentTemplate(user.id, id); const source = await extractDocument({ fileName: template.fileName, base64: template.sourceBase64 }); template.definition = validateDefinition(template.definition, source.paragraphs); return { template: { id: template.id, name: template.name, fileName: template.fileName, sourceKind: template.sourceKind, updatedAt: template.updatedAt, definition: template.definition, review: buildDocumentReview(source.paragraphs, template.definition) } }; } catch (error) { return failure(error); }
}
export async function abstractDocumentTemplateAction(upload: DocumentUpload): Promise<DocumentResult<{ proposal: DocumentProposal }>> {
  try {
    const user = await requireUser();
    const parsed = await extractDocument(upload);
    const definition = await abstractDocument(parsed.paragraphs);
    const current = await requireUser();
    if (current.id !== user.id) throw new DocumentTemplateError("document_unavailable", "Your account changed. Reopen Document Templates and retry.");
    return { proposal: { sourceKind: parsed.sourceKind, definition, review: buildDocumentReview(parsed.paragraphs, definition) } };
  } catch (error) { return failure(error); }
}
export async function saveDocumentTemplateAction(name: string, upload: DocumentUpload, definition: unknown, id?: string): Promise<DocumentResult<{ template: DocumentTemplateMeta }>> {
  try {
    const user = await requireUser();
    boundedName(name);
    const parsed = id ? await getDocumentTemplate(user.id, id).then((saved) => extractDocument({ fileName: saved.fileName, base64: saved.sourceBase64 })) : await extractDocument(upload);
    const built = await buildDocumentTemplate(parsed.docx, definition);
    const current = await requireUser();
    if (current.id !== user.id) throw new DocumentTemplateError("document_unavailable", "Your account changed. Reopen Document Templates and retry.");
    return { template: await saveDocumentTemplate(user.id, { name, fileName: parsed.fileName, sourceKind: parsed.sourceKind, sourceBase64: outputBase64(parsed.source), sourceSha256: parsed.sourceSha256, ...built }, id) };
  } catch (error) { return failure(error); }
}
export async function downloadDocumentTemplateAction(id: string, kind: "original" | "template" | "filled", values?: unknown): Promise<DocumentResult<{ base64: string; fileName: string }>> {
  try {
    const user = await requireUser();
    const saved = await getDocumentTemplate(user.id, id);
    const parsed = await extractDocument({ fileName: saved.fileName, base64: saved.sourceBase64 });
    if (kind === "original") return { base64: outputBase64(parsed.source), fileName: saved.fileName };
    if (kind !== "template" && kind !== "filled") throw new DocumentTemplateError("invalid_input", "Choose a document download type.");
    const base64 = kind === "filled" ? await fillDocumentTemplate(parsed.docx, saved.definition, values) : (await buildDocumentTemplate(parsed.docx, saved.definition)).templateBase64;
    return { base64, fileName: `${saved.name.replace(/[<>:"/\\|?*\x00-\x1f]/g, "_")}${kind === "filled" ? "-filled" : "-template"}.docx` };
  } catch (error) { return failure(error); }
}
export async function previewDocumentTemplateAction(upload: DocumentUpload | null, definition: unknown, id?: string): Promise<DocumentResult<{ base64: string; fileName: string }>> {
  try { const user = await requireUser(); const source = id ? await getDocumentTemplate(user.id, id).then((saved) => ({ fileName: saved.fileName, base64: saved.sourceBase64 })) : upload; if (!source) throw new DocumentTemplateError("invalid_input", "Choose a document to preview."); const parsed = await extractDocument(source); const built = await buildDocumentTemplate(parsed.docx, definition); return { base64: built.templateBase64, fileName: "document-template.docx" }; } catch (error) { return failure(error); }
}



