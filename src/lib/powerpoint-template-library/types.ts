export const SLIDE_ROLES = ["title", "section-divider", "content", "closing", "other"] as const;
export type SlideRole = (typeof SLIDE_ROLES)[number];
export interface SourceSlide { id: string; ordinal: number; text: string }
export interface LibrarySlide extends SourceSlide { role: SlideRole }
export interface LibraryDefinition { version: 1; slides: LibrarySlide[] }
export interface LibraryMeta { id: string; sourceFileId: string; name: string; updatedAt: string }
export interface SavedLibrary extends LibraryMeta { definition: LibraryDefinition }
export type TemplateCode = "PPT_AUTH" | "PPT_INVALID" | "PPT_LIMIT" | "PPT_NOT_FOUND" | "PPT_MODEL" | "PPT_STORAGE" | "PPT_DOWNLOAD" | "PPT_SELECTION";
export interface TemplateFailure { error: string; code: TemplateCode }
export class TemplateError extends Error {
  constructor(public code: TemplateCode) { super(code); }
}
const MESSAGES: Record<TemplateCode, string> = {
  PPT_AUTH: "Sign in with an active account and try again.",
  PPT_INVALID: "That template or classification is not supported. Choose a plain .pptx and try again.",
  PPT_LIMIT: "Use a smaller template: at most 80 slides and 24,000 text characters, within the upload limit.",
  PPT_NOT_FOUND: "That template is unavailable in your account. Reload the library.",
  PPT_MODEL: "No usable classifications were returned. Your source is saved; retry analysis.",
  PPT_STORAGE: "Could not save or load templates. Check that template storage is configured, then retry.",
  PPT_DOWNLOAD: "Could not prepare the download. Retry using a smaller template.",
  PPT_SELECTION: "Could not remember the selected template. Allow browser storage and retry.",
};
export function failure(error: unknown, fallback: TemplateCode): TemplateFailure {
  const code = error instanceof TemplateError ? error.code : fallback;
  return { code, error: MESSAGES[code] };
}
export function assertId(value: unknown): asserts value is string {
  if (typeof value !== "string" || !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value)) throw new TemplateError("PPT_NOT_FOUND");
}
export function libraryName(value: unknown): string {
  if (typeof value !== "string" || !value.trim() || value.length > 160) throw new TemplateError("PPT_INVALID");
  return value.trim();
}
export function absentRoles(definition: LibraryDefinition): SlideRole[] {
  return SLIDE_ROLES.filter(role => !definition.slides.some(slide => slide.role === role));
}
