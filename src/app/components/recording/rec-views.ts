/** Ordered Recording destinations shared by the strip and URL membership guard. */
export const REC_VIEWS = [
  ["record", "Record"], ["discussions", "Discussion replies"],
  ["messages", "Message replies"], ["moduledeck", "Module walkthrough deck"],
  ["speed", "Change speed"], ["captions", "Caption a video"],
  ["slides", "Narrate a deck"], ["avatar", "Avatar"],
] as const;
export type RecView = (typeof REC_VIEWS)[number][0];
const REC_VIEW_VALUES: ReadonlySet<string> = new Set(REC_VIEWS.map(([key]) => key));
export function isRecView(value: unknown): value is RecView {
  return typeof value === "string" && REC_VIEW_VALUES.has(value);
}
