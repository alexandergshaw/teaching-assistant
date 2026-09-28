// A39 wave 5 (docs/a39-waves.md 8.5): the credential has a route. Before this
// module, an instructor who hit CANVAS_CREDENTIAL_REQUIRED_MESSAGE on a
// grading surface had no in-app path to the place that sets one -
// src/app/account/integrations/LmsCredentialSection.tsx, behind requireUser()
// (not an owner check - resolveCanvasCredential in canvas-credentials.ts
// reads the CALLER'S OWN stored credential first, and only falls back to the
// owner-only env var). This is a reachability fix, not a permissions change:
// it does not add or relax any guard.
//
// W5-1 - the predicate below compares BY IDENTITY, importing
// CANVAS_CREDENTIAL_REQUIRED_MESSAGE rather than copying its text, so the two
// can never drift apart. See canvas-credential-cta.test.ts's own "watched
// failure" describe block for the RED a copied literal produces once the
// source message changes, reproduced there with a mocked module rather than
// by editing canvas-credentials.ts (out of this wave's write set).
import { CANVAS_CREDENTIAL_REQUIRED_MESSAGE } from "./canvas-credential-message";

/**
 * Where the credential gets set. Same route LmsCredentialSection.tsx renders
 * on (src/app/account/integrations/page.tsx).
 */
export const CANVAS_CREDENTIAL_CTA_HREF = "/account/integrations";

/**
 * Copy rule: this sentence must hold for EVERY caller and EVERY reachable
 * state, so it names only the action and the location - never a benefit
 * claim like "grade faster". Some callers who see this message already had
 * a credential attempt fail for other reasons the message doesn't
 * distinguish (E6/E7); this link does not promise anything about speed, only
 * where to go.
 */
export const CANVAS_CREDENTIAL_CTA_LABEL = "Add your Canvas credential in Settings";

/**
 * True only for the exact CANVAS_CREDENTIAL_REQUIRED_MESSAGE string. Never
 * matches null, undefined, an unrelated error, or a near-miss substring - a
 * caller with any other error should not see a credential CTA that cannot
 * help them (that would add a step for people the message doesn't describe).
 */
export function isCanvasCredentialRequiredError(message: string | null | undefined): boolean {
  return message === CANVAS_CREDENTIAL_REQUIRED_MESSAGE;
}
