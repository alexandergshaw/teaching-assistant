// Persisted vertical size of the grading-chat "Submission text" field.
//
// MECHANISM (docs/grading-chat-consolidation-scope.md W1, A): MUI's multiline
// field renders a TextareaAutosize that owns the inline `height`, so a drag on
// `height` is fought. `min-height` is a different property: it floors the box
// while autosize keeps owning the height above the floor. The chosen floor is
// captured at drag end and persisted here. Pure parse/clamp is exported so it
// can be tested; the storage wrappers swallow blocked storage.

/** localStorage key for the persisted composer floor height, in px. */
export const COMPOSER_HEIGHT_STORAGE_KEY = "ta-grading-chat-composer-height";

/** Smallest floor worth persisting (about two rows of the small field). */
export const COMPOSER_MIN_HEIGHT_PX = 56;
/** Largest floor, so a stray drag cannot push the composer off screen. */
export const COMPOSER_MAX_HEIGHT_PX = 640;

/** PURE. A raw stored/measured value -> a clamped integer px height, or null
 *  when it is not a usable number. */
export function parseComposerHeight(raw: unknown): number | null {
  const n = typeof raw === "number" ? raw : typeof raw === "string" && raw.trim() !== "" ? Number(raw) : NaN;
  if (!Number.isFinite(n)) return null;
  return Math.min(COMPOSER_MAX_HEIGHT_PX, Math.max(COMPOSER_MIN_HEIGHT_PX, Math.round(n)));
}

export function loadComposerHeight(): number | null {
  if (typeof window === "undefined") return null;
  try {
    return parseComposerHeight(localStorage.getItem(COMPOSER_HEIGHT_STORAGE_KEY));
  } catch {
    return null;
  }
}

export function persistComposerHeight(heightPx: number): number | null {
  const clamped = parseComposerHeight(heightPx);
  if (clamped === null) return null;
  if (typeof window === "undefined") return clamped;
  try {
    localStorage.setItem(COMPOSER_HEIGHT_STORAGE_KEY, String(clamped));
  } catch {
    // Private window / blocked storage: the size just does not persist.
  }
  return clamped;
}
