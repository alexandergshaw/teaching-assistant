"use server";

/**
 * The sign-up server action (docs/multi-user-login-acceptance-criteria.md
 * B0, B1, B3, and the RB1/RB3/RB5 amendments). Its ONLY job is validation
 * and the Supabase call - nothing else. In particular:
 *
 * - IT NEVER WRITES `role`, AND DOES NOT PERSIST `status` EITHER. A stored
 *   `role='owner'` row is trusted forever afterward with no re-check (see
 *   `resolveAccess`, src/lib/access.ts) - writing one here, even for an
 *   allowlisted address, would be an account takeover of that address before
 *   its real owner ever claims it. `decideInitialAccount`
 *   (src/lib/signup-rules.ts) exists to answer "what should the sign-up
 *   screen tell this person happens next", not to hand this action a
 *   role/status pair meant for direct persistence - its own doc comment says
 *   so explicitly, in capitals, for exactly this reason. The row itself is
 *   created by the database trigger (`handle_new_auth_user`,
 *   supabase/migrations/20261012000000_create_app_users.sql) with safe
 *   column defaults (`role='instructor'`, `status='pending'`), and
 *   `ensureAppUser` (src/lib/supabase/app-users.ts) promotes an allowlisted
 *   address later - only once the auth provider has actually confirmed the
 *   email (`email_confirmed_at`), never from a caller-supplied claim.
 *
 * - IT STORES THE NORMALISED `fullName`/`email` THAT `validateSignup` ITSELF
 *   RETURNS, never a re-derived trim/lower-case of the raw input. Two
 *   independent normalisations of the same input can drift (see
 *   `validateSignup`'s own doc comment for the concrete
 *   `Dana@Example.edu`-stored-twice example), and the `OWNER_EMAILS`
 *   reconciliation on sign-in only works if the stored email matches the
 *   form `isOwnerEmail` expects.
 *
 * - IT PASSES THE NAME THROUGH AS `options: { data: { full_name } } }` so the
 *   insert trigger above can copy it onto `app_users.display_name` at t0 -
 *   see supabase/migrations/20261013000000_app_users_display_name_at_insert.sql.
 *   Without this, a `pending` account's name never reaches the database at
 *   all: that account is exactly the one that never reaches
 *   `ensureAppUser`'s own application-side fallback, because that fallback
 *   only ever runs from `requireUser()`, AFTER the pending/suspended deny.
 *
 * - IT HAS NO GUARD. `requireUser()`/`requireAppOwner()` both throw for
 *   anyone who is not already an active account, which is exactly who this
 *   action serves - there is no account yet to authorize. See this export's
 *   entry in action-guard-coverage.test.ts's `DELIBERATELY_PUBLIC` map.
 */

import { createClient } from "@/lib/supabase/server";
import { validateSignup, type SignupInput } from "@/lib/signup-rules";

/**
 * The complete set of outcomes this action can produce, as TOKENS rather
 * than messages the caller interpolates - the same convention
 * src/lib/auth-screen-state.ts uses for the sign-in and confirmation
 * screens, applied here for the same reason: a message built here from the
 * provider's own error text could leak account-existence information into
 * whatever the caller renders, and a caller that has to build its own copy
 * from a token cannot accidentally echo something unsafe.
 *
 * - "invalid": a `validateSignup` refusal. Its `field`/`message` ARE passed
 *   through rather than collapsed to a token, because they are already the
 *   curated, safe copy that module hands out for a bad submission (a weak
 *   password, a malformed email, a disallowed domain, closed sign-ups) - none
 *   of that enumerates accounts, and it says what to fix, per B1.
 * - "signup_disabled": the ONE provider error that is not collapsed into
 *   "error" - see `noticeFromConfirmError`'s doc comment in
 *   src/lib/auth-screen-state.ts for the same reasoning applied to the
 *   confirmation flow. This code is a property of the DEPLOYMENT (the
 *   Supabase dashboard's "Allow new users to sign up" toggle is off), not of
 *   any one account, so the account-enumeration argument that collapses
 *   every other error does not apply to it - collapsing it anyway would just
 *   produce a worse message for an operator who followed the README, not a
 *   safer one (RB3).
 * - "error": every other provider failure - a duplicate address, a rate
 *   limit, a transport failure, anything this action does not specifically
 *   recognise. Collapsed to one outcome, deliberately, so the screen cannot
 *   be used to enumerate which addresses already have accounts.
 * - "check_email": sign-up succeeded and the provider is waiting on email
 *   confirmation (Supabase's "Confirm email" setting is ON).
 * - "signed_in": sign-up succeeded and the provider returned a live session
 *   immediately (that setting is OFF).
 */
export type SignUpActionResult =
  | { outcome: "invalid"; field: string; message: string }
  | { outcome: "signup_disabled" }
  | { outcome: "error" }
  | { outcome: "check_email" }
  | { outcome: "signed_in" };

export async function signUpAction(input: SignupInput): Promise<SignUpActionResult> {
  const validated = validateSignup(input);
  if (!validated.ok) {
    return { outcome: "invalid", field: validated.field, message: validated.message };
  }

  // Store exactly what validateSignup normalised - see this file's header
  // comment for why a re-derived trim/lower-case here would be a bug, not a
  // style choice. `validated.password` is passed through untouched: it is
  // never normalised (case or whitespace) by validateSignup, only checked.
  const { fullName, email, password } = validated;

  const supabase = await createClient();
  const { data, error } = await supabase.auth.signUp({
    email,
    password,
    options: {
      // Writes user_metadata.full_name so the insert trigger can copy it
      // onto app_users.display_name at insert time - see this file's header
      // comment. Nothing in this call, or anywhere else in this action,
      // writes role or status.
      data: { full_name: fullName },
      // NEVER window.location.origin here - this runs on the server (there
      // is no `window`), and that fallback pattern is exactly what RB5
      // warns against: it would mint every preview deployment its own
      // confirmation links. Read fresh on every call, like the rest of
      // ./signup-rules.ts's env reads, rather than cached at module scope.
      // Left `undefined` when unset, rather than defaulted to anything
      // guessed here: Supabase's dashboard "Site URL" field is a SEPARATE
      // setting GoTrue falls back to when `emailRedirectTo` is omitted, and
      // an unconfigured project's Site URL is `http://localhost:3000` - so
      // an operator who has not set this env var yet gets localhost links,
      // not a thrown error from this action.
      emailRedirectTo: process.env.SIGNUP_EMAIL_REDIRECT_URL || undefined,
    },
  });

  if (error) {
    // signup_disabled gets its own outcome rather than falling into the
    // generic branch below - see this module's own SignUpActionResult doc
    // comment for why.
    if (error.code === "signup_disabled") {
      return { outcome: "signup_disabled" };
    }
    return { outcome: "error" };
  }

  // B3: detect which of the two confirmation outcomes happened from the
  // RESPONSE itself, never assumed from an env var or a guess about
  // dashboard configuration. With email confirmations ON, signUp returns a
  // user and no session; with them OFF, a live session comes back
  // immediately. Deliberately NOT `data.user?.identities?.length === 0` -
  // the one signal that would distinguish "we sent a confirmation" from
  // "this address already has an account" - B3 records that branching on it
  // is an enumeration risk this app declines to take.
  return data.session ? { outcome: "signed_in" } : { outcome: "check_email" };
}
