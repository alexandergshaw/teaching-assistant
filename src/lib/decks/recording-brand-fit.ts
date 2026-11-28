export const MAX_RECORDING_BRAND_SLIDES = 12;
export const MAX_RECORDING_BRAND_BULLETS = 6;
export const MAX_BRANDED_RECORDING_PPTX_BYTES = 64 * 1024 * 1024;

export type RecordingBrandFit =
  | { kind: "fixed"; bulletSlots: number[] }
  | { kind: "layout" };

export type RecordingBrandSlide = { title: string; bullets: string[] };

export function recordingBrandFit(value: unknown): value is RecordingBrandFit {
  if (!value || typeof value !== "object" || !("kind" in value)) return false;
  if (value.kind === "layout") return true;
  return value.kind === "fixed" && "bulletSlots" in value && Array.isArray(value.bulletSlots)
    && value.bulletSlots.length > 0 && value.bulletSlots.length <= MAX_RECORDING_BRAND_SLIDES
    && value.bulletSlots.every((slots) => Number.isSafeInteger(slots) && slots >= 0 && slots <= MAX_RECORDING_BRAND_BULLETS);
}

export function recordingBrandSlides(value: unknown): value is RecordingBrandSlide[] {
  const validText = (text: unknown, limit: number): text is string =>
    typeof text === "string" && !!text.trim() && text.length <= limit && text.isWellFormed() && !/[\x00-\x08\x0b\x0c\x0e-\x1f\ufffe\uffff]/.test(text);
  return Array.isArray(value) && value.length > 0 && value.length <= MAX_RECORDING_BRAND_SLIDES
    && value.every((slide) => slide && typeof slide === "object" && validText(slide.title, 160)
      && Array.isArray(slide.bullets) && slide.bullets.length <= MAX_RECORDING_BRAND_BULLETS
      && slide.bullets.every((bullet: unknown) => validText(bullet, 240)));
}
