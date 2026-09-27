// REQ-A32-1: the single source of truth for whether a walkthrough draft's
// scheduled-visibility pick is immediate, scheduled, or invalid - read by the
// consequence copy, all five per-slot ConfirmArmButtons labels
// (AnnouncementDraftSlot.tsx), AND the post decision itself
// (useAnnouncementDraftSlots.ts's commitPost). A boolean prop threaded from a
// length check and a SEPARATE future-time check (the shape
// announcements-panel.tsx uses, at :296 and :247) is the assertion version of
// this requirement, and it can drift: the whole point of resolving ONCE is
// that there is nothing left to drift between.
//
// No React, no DOM, no "use server" - a plain pure leaf, because this
// project's vitest is environment: "node" with include: ["src/**/*.test.ts"]
// and renders no component (docs/loop/this-repo.md section 6).

export type ScheduledVisibility =
  | { readonly kind: "immediate" }
  | { readonly kind: "scheduled"; readonly iso: string; readonly label: string }
  | { readonly kind: "invalid" };

/**
 * `now` is INJECTED (milliseconds since epoch), never read from the clock
 * inside this function, so callers can pin exact past/now/future rows
 * without a fake clock. Every production call site passes `Date.now()`.
 *
 * - empty or whitespace `raw` -> `immediate`.
 * - a malformed date (`Number.isNaN(new Date(raw).getTime())`) -> `invalid`.
 * - a valid time strictly AFTER `now` -> `scheduled`, with `iso` the UTC
 *   ISO-8601 string Canvas's `delayed_post_at` expects (REQ-A32-2 - the same
 *   local-to-UTC conversion `announcements-panel.tsx` performs client-side
 *   before its own server action is called) and `label` a locale-formatted
 *   string for the consequence copy and success text.
 * - a valid time that is NOT in the future -> `immediate`. This preserves
 *   the sibling's actual posting BEHAVIOUR (`announcements-panel.tsx:247`'s
 *   `when.getTime() > Date.now()`) - a past pick posts now, it is not an
 *   error - while making it impossible for the copy to disagree with the
 *   post decision, because both read this same `kind`.
 */
export function resolveScheduledVisibility(raw: string, now: number): ScheduledVisibility {
  const trimmed = raw.trim();
  if (!trimmed) return { kind: "immediate" };
  const when = new Date(trimmed);
  const time = when.getTime();
  if (Number.isNaN(time)) return { kind: "invalid" };
  if (time > now) return { kind: "scheduled", iso: when.toISOString(), label: when.toLocaleString() };
  return { kind: "immediate" };
}
