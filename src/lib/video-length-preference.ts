// Resource-controls feature: the "preferred video length" setting
// (discussion-persisted-controls.ts's videoLengthMinMinutes/videoLengthMaxMinutes).
//
// A plain, dependency-free leaf - NOT part of src/app/actions/discussion-replies.ts
// (a "use server" module), because a "use server" file may export only async
// functions and type-only exports (src/lib/use-server-exports.test.ts). This
// is a synchronous, pure string-building function with its own test surface,
// so it lives here instead, imported by that action.
//
// SURVEY FINDING: nothing in this feature's resource pipeline ever learns a
// candidate video's actual runtime - CandidateResourceItem/ResourceLink
// (src/app/actions/discussion-replies.ts and learning-resource-links.ts)
// carry title/url/kind/whatYouGet only, the grounded search call never asks
// for a duration, and checkUrlsReachable (src/lib/url-reachability.ts) only
// checks that a URL resolves, never what is at it. So this setting CANNOT be
// enforced as a filter or a guarantee - it is threaded through as one extra
// sentence in the research prompt (ResourceProfile.extraGuidance,
// learning-resource-links.ts), worded explicitly as a preference the model
// may be unable to satisfy. Returns undefined (the prompt stays
// byte-identical to before this setting existed) when neither bound is a
// usable positive number.
//
// FIX 3 (review pass) - defense in depth on the ORDERING of the two bounds:
// DiscussionResourceSettings.tsx (the control) is the primary place an
// inverted pair ("between 20 and 5 minutes") gets caught and flagged to the
// instructor - see that file's own comment for why the UI shows a message
// there rather than silently swapping the two numbers. This function is the
// LAST point before the pair reaches the model's prompt, and has no UI
// channel of its own to report a problem through, so it cannot repeat that
// same "tell the instructor" behaviour - it can only decide what (if
// anything) reaches the prompt. min > max is dropped entirely (both bounds
// discarded, same as "no preference set") rather than silently swapped:
// swapping would guess which number the instructor meant as which bound,
// and a wrong guess sent to the model as a confident-sounding "between 5 and
// 20 minutes" is worse than saying nothing, since nothing here can tell the
// instructor the guess was made. Reachable in practice from a persisted
// localStorage pair written before this fix existed, or from any future
// caller of this leaf that does not route through the control - the control
// itself never PRODUCES an inverted pair once its own validation lands.
export function videoLengthPreferenceSentence(pref?: {
  minMinutes?: number;
  maxMinutes?: number;
}): string | undefined {
  let min = pref && typeof pref.minMinutes === "number" && pref.minMinutes > 0 ? pref.minMinutes : undefined;
  let max = pref && typeof pref.maxMinutes === "number" && pref.maxMinutes > 0 ? pref.maxMinutes : undefined;
  if (min !== undefined && max !== undefined && min > max) {
    min = undefined;
    max = undefined;
  }
  if (min === undefined && max === undefined) return undefined;
  const range =
    min !== undefined && max !== undefined
      ? `between ${min} and ${max} minutes`
      : min !== undefined
        ? `at least ${min} minutes`
        : `no more than ${max} minutes`;
  return `If you suggest a video, prefer one that runs ${range}, when a suitable option exists for this concept - this is a preference from the instructor, not a hard requirement, since a video's exact length cannot be confirmed from these search results.`;
}
