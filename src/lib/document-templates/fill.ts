import { fillOfficeTemplate } from "@/lib/decks/office-template-fill";
import { parseOfficeParagraphs } from "@/lib/office-edit";
import { validateDefinition } from "./abstract";
import { outputBase64 } from "./extract";
import { MAX_TEXT, isXmlText, refuse, type DocumentDefinition } from "./types";

export async function buildDocumentTemplate(docx: Buffer, definition: unknown) {
  const valid = validateDefinition(definition, await parseOfficeParagraphs("docx", docx));
  return { definition: valid, templateBase64: outputBase64(await fillOfficeTemplate("docx", docx, valid.replacements)) };
}
export async function fillDocumentTemplate(docx: Buffer, definition: DocumentDefinition, values: unknown): Promise<string> {
  const valid = validateDefinition(definition, await parseOfficeParagraphs("docx", docx));
  if (!values || typeof values !== "object" || Array.isArray(values)) refuse("invalid_values", "Enter a value for every field.");
  const data = values as Record<string, unknown>;
  if (Object.keys(data).some((key) => !valid.fields.some((f) => f.key === key))) refuse("invalid_values", "Values contain an unknown field.");
  if (JSON.stringify(data).length > MAX_TEXT) refuse("invalid_values", "Use shorter field values (at most 24,000 characters total).");
  for (const { key } of valid.fields) if (typeof data[key] !== "string" || !(data[key] as string).trim() || (data[key] as string).length > 4000) refuse("invalid_values", "Enter every field value using at most 4,000 characters each.");
  for (const { key } of valid.fields) if (!isXmlText(data[key] as string)) refuse("invalid_values", "Field values contain characters that cannot be used in a Word document.");
  const replacements = valid.replacements.map((r) => ({ id: r.id, text: r.text.replace(/\{\{([a-z][a-z0-9_]{0,39})\}\}/g, (_, key: string) => data[key] as string) }));
  return outputBase64(await fillOfficeTemplate("docx", docx, replacements));
}
