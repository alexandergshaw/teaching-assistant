/**
 * Classifies the failure `setAppUserStatus` (./supabase/app-users.ts) throws
 * when a suspend goes wrong, into the three states the operator has to be
 * told apart (docs/account-people-copy.md, the action-feedback section).
 *
 * WHY THIS IS ITS OWN MODULE, WHICH IS THE WHOLE POINT.
 *
 * This judgement used to live inside `src/app/account/people/actions.ts`. That
 * is a `"use server"` file, and such a file may export ONLY async functions -
 * so a pure classifier defined there is unreachable from any test, and this
 * repo's own loop rule is that a judgement which lives where nothing can test
 * it is a judgement nobody is checking. A `"use server"` file may freely
 * IMPORT, so moving the decision here costs nothing and makes it testable.
 *
 * WHY IT IS A STRING MATCH, WHICH IS NOT A CHOICE ANYONE ENJOYED.
 *
 * `setAppUserStatus` reports all three failures as a thrown `Error` and
 * nothing else - no code, no cause, no structured field. Its own doc comment
 * calls the message "the only mechanism available today". So the coupling
 * between that function's wording and this classification is real, and it is
 * SILENT: reword the throw and this quietly degrades to the generic failure,
 * with every test still green, and the operator stops being told that an
 * account may be locked out at the provider with no automatic recovery.
 *
 * That is exactly why the markers live here as named constants rather than
 * inline literals, and why `account-suspend-failure.test.ts` drives the REAL
 * `setAppUserStatus` into all three failure modes and asserts on the message
 * it actually produces. A test that classifies a string the TEST wrote proves
 * only that this function can read its own constants back. Do not replace
 * that test with fixtures.
 *
 * IF YOU ARE HERE BECAUSE YOU CHANGED ONE OF THOSE MESSAGES: update the
 * matching constant below in the same change. The test will have told you.
 */

/**
 * The catastrophic case: the provider ban succeeded, the row write failed,
 * AND reversing the ban also failed. The account may be unreachable at the
 * auth provider with no automatic recovery, and no code in this repository
 * can fix it - only the provider's own dashboard can.
 *
 * Matched with `includes` rather than a prefix: this text sits at the END of
 * a long message that leads with the underlying write error. Note that in
 * app-users.ts the sentence is SPLIT ACROSS A STRING CONCATENATION
 * ("...at the " + "auth provider..."), so it exists in the runtime string but
 * NOT as a contiguous run in the source file - which is precisely why the
 * test for this must run the function rather than grep it.
 */
export const SUSPEND_LOCKED_OUT_MARKER = "This needs manual intervention at the auth provider";

/**
 * The recoverable case: the row write failed, but the just-applied ban was
 * successfully reversed, so the account is NOT left locked out. Retrying
 * after the underlying error clears is a safe instruction to give.
 */
export const SUSPEND_REVERSED_MARKER = "The provider-side ban has been reversed";

/**
 * The earliest case: the provider call itself failed, so nothing was written
 * and nothing was banned. `setAppUserStatus` bans BEFORE it writes the row
 * precisely so that this failure can never be reported as a successful
 * suspend.
 *
 * A prefix rather than a substring, because this message opens with it. The
 * verb is interpolated (`suspend` or `restore`) and only the suspend
 * direction reaches this classifier.
 */
export const SUSPEND_PROVIDER_FAILED_PREFIX = "Could not suspend the Supabase session for app_users ";

/**
 * What the caller should tell the operator. Deliberately NOT the copy itself
 * - the strings live in docs/account-people-copy.md and are rendered by the
 * page; this module decides only WHICH state occurred.
 */
export type SuspendFailureKind =
  | "suspend_locked_out"
  | "suspend_reversed"
  | "suspend_provider_failed"
  | "failed";

/**
 * Maps a thrown error to its failure state, returning "failed" for anything
 * unrecognised.
 *
 * ORDER IS LOAD-BEARING and must stay most-severe-first. The locked-out
 * message and the reversed message BOTH begin with the same
 * "Could not set status for app_users ..." text, and both describe what
 * happened to the ban afterwards - so a check for the milder state placed
 * first would swallow the catastrophic one. Failing toward "the account may
 * be locked out" is the safe direction; failing away from it tells an
 * operator everything is fine when an account is unreachable.
 *
 * Total: never throws, and accepts anything, because it runs inside a catch
 * block where the value is genuinely `unknown`.
 */
export function classifySuspendFailure(error: unknown): SuspendFailureKind {
  const message = error instanceof Error ? error.message : "";

  if (message.includes(SUSPEND_LOCKED_OUT_MARKER)) {
    return "suspend_locked_out";
  }
  if (message.includes(SUSPEND_REVERSED_MARKER)) {
    return "suspend_reversed";
  }
  if (message.startsWith(SUSPEND_PROVIDER_FAILED_PREFIX)) {
    return "suspend_provider_failed";
  }
  return "failed";
}
