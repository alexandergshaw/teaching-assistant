export const REC_VIEW_ORDER = [
  "record",
  "discussions",
  "messages",
  "moduledeck",
  "speed",
  "captions",
  "slides",
  "avatar",
] as const;

export type RecView = (typeof REC_VIEW_ORDER)[number];

export function isRecView(value: unknown): value is RecView {
  return typeof value === "string" && REC_VIEW_ORDER.some((view) => view === value);
}
