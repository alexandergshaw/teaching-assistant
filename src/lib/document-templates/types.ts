export const MAX_TEXT = 24_000;
export const MAX_FIELDS = 80;
export const PDF_DISCLOSURE = "PDF templates become editable text-based DOCX files. PDF page layout, images and forms are not retained. Your original PDF remains available separately.";
export type DocumentSourceKind = "docx" | "pdf";
export interface DocumentField { key: string; label: string }
export interface DocumentReplacement { id: string; text: string }
export interface DocumentDefinition { version: 1; fields: DocumentField[]; replacements: DocumentReplacement[] }
export interface DocumentUpload { fileName: string; base64: string }
export interface DocumentReviewParagraph { id: string; sourceText: string; templateText: string; replaced: boolean }
export interface DocumentProposal { sourceKind: DocumentSourceKind; definition: DocumentDefinition; review: DocumentReviewParagraph[] }
export interface DocumentTemplateReview extends DocumentTemplateMeta { definition: DocumentDefinition; review: DocumentReviewParagraph[] }
export interface DocumentTemplateMeta { id: string; name: string; fileName: string; sourceKind: DocumentSourceKind; updatedAt: string }
export interface DocumentTemplate extends DocumentTemplateMeta { sourceBase64: string; sourceSha256: string; definition: DocumentDefinition; templateBase64: string }
export type DocumentResult<T> = T | { error: string; code: string };
export class DocumentTemplateError extends Error {
  constructor(public code: string, message: string) { super(message); this.name = "DocumentTemplateError"; }
}
export function refuse(code: string, message: string): never { throw new DocumentTemplateError(code, message); }
export function boundedName(value: unknown, label = "template name"): string {
  if (typeof value !== "string" || !value.trim() || value.length > 180 || /[\x00-\x1f]/.test(value)) refuse("invalid_input", `Enter a ${label} of at most 180 characters.`);
  return value.trim();
}
export function documentId(id: unknown): string {
  if (typeof id !== "string" || !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id)) refuse("not_found", "That document template is unavailable.");
  return id;
}


/** XML 1.0 character repertoire, including paired supplementary Unicode. */
export function isXmlText(value: string): boolean {
  for (const character of value) {
    const point = character.codePointAt(0)!;
    if (point !== 9 && point !== 10 && point !== 13 && !(point >= 0x20 && point <= 0xd7ff) && !(point >= 0xe000 && point <= 0xfffd) && !(point >= 0x10000 && point <= 0x10ffff)) return false;
  }
  return true;
}
