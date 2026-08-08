// Shared home for the non-transient-quota-refusal predicate. It used to live
// only in src/lib/workflows/registry/weekly-generator.ts, which is fine for
// every CLIENT-bundled step that already imports that file - but the weekly
// announcement drafting orchestration (src/lib/announcement-drafting.ts) is
// called from a SERVER ACTION and must not pull in weekly-generator.ts, which
// imports the "use server" actions barrel and registry-helpers. Moving the
// predicate to its own dependency-free module lets both sides share the exact
// same rule without either importing the other's world. weekly-generator.ts
// re-exports this under the same name so none of its existing importers (or
// their tests) need to change.
//
// docs/weekly-announcement-module-content-acceptance-criteria.md AC2 item 10.

/** Whether an LLM action's `error` message is a NON-transient quota/billing
 * refusal (a hard spend-cap, never a plain rate-limit) - the vendor's own
 * wording tells the two apart: a spend-cap/quota refusal names the cap or
 * billing explicitly, never the generic "too many requests"/"resource
 * exhausted, check quota" phrasing a transient 429 uses (which callLlm/
 * callGemini, src/lib/llm.ts, already backs off and retries internally). A
 * non-transient refusal cannot recover inside a run - every remaining week is
 * doomed to fail identically - so a caller's per-week loop stops issuing
 * further calls instead of working through the rest of the schedule one
 * doomed call at a time. A transient 429 is NOT this; such a loop is right to
 * just move on to the next week for one of those. */
export function isNonTransientQuotaRefusal(errorMessage: string): boolean {
  if (typeof errorMessage !== "string" || !/HTTP 429/i.test(errorMessage)) return false;
  return /spending cap|billing (?:quota|limit|cap)|exceeded (?:its|your) (?:monthly|daily) (?:quota|budget|limit|spending)/i.test(
    errorMessage
  );
}
