export const INSTITUTION_BRANDED_DECKS_LABEL = "Officially Branded Slide Decks";
export const INSTITUTION_BRANDED_DECKS_BUCKET = "institution-directory-decks";
export const MAX_INSTITUTION_DECK_BYTES = 25 * 1024 * 1024;

export const BRANDED_DECK_MIME = {
  pptx: "application/vnd.openxmlformats-officedocument.presentationml.presentation",
  potx: "application/vnd.openxmlformats-officedocument.presentationml.template",
} as const;

export type InstitutionDeckExtension = keyof typeof BRANDED_DECK_MIME;
export type InstitutionBrandedDeck = {
  id: string;
  acronym: string;
  name: string;
  size: number;
  extension: InstitutionDeckExtension;
};

export function institutionDeckFile(name: unknown, size: unknown) {
  if (typeof name !== "string" || typeof size !== "number" || !Number.isSafeInteger(size) || size < 1 || size > MAX_INSTITUTION_DECK_BYTES) return null;
  const fileName = name.trim();
  if (!fileName || fileName.length > 180 || !fileName.isWellFormed() || /[\\/<>:"|?*\p{Cc}]/u.test(fileName)) return null;
  const extension = /\.(pptx|potx)$/i.exec(fileName)?.[1].toLowerCase();
  if (extension !== "pptx" && extension !== "potx") return null;
  return { name: fileName, size, extension } as const;
}
