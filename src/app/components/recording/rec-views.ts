/** Destinations shown in the Recording tab strip, in display order. */
export const REC_VIEWS = [
  ["lecturevideos", "Narration/Caption Generation"],
  ["moduledeck", "Slide Deck Generation"],
  ["discussions", "Discussion Board Reply Generation"],
] as const;

// Existing links and in-app launches can still open these panels.
const LEGACY_REC_VIEWS = ["record", "messages", "speed", "captions", "slides", "avatar"] as const;
export type RecView = (typeof REC_VIEWS)[number][0] | (typeof LEGACY_REC_VIEWS)[number];
const REC_VIEW_VALUES: ReadonlySet<string> = new Set([...REC_VIEWS.map(([key]) => key), ...LEGACY_REC_VIEWS]);
export function isRecView(value: unknown): value is RecView {
  return typeof value === "string" && REC_VIEW_VALUES.has(value);
}
