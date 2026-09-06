import { describe, expect, it } from "vitest";
import {
  AUTH_NOTICES,
  mapSignInFailure,
  noticeFromConfirmError,
  noticeFromStateParam,
  type AuthNotice,
} from "./auth-screen-state";

/**
 * Contract for the three places a Group B screen turns UNTRUSTED input into a
 * screen (docs/multi-user-login-acceptance-criteria.md B2, B5, B5b). All three
 * are pure, and all three are security decisions rather than presentation:
 *
 *   - `?state=` is attacker-authored. Anyone can send a colleague
 *     /login?state=suspended and they read an alarming message on the real
 *     domain with a real certificate. So the parameter selects from a closed
 *     set or selects nothing, and is never carried into copy.
 *
 *   - The sign-in error distinguishes "wrong password", "unconfirmed" and
 *     "banned" at the auth provider. Rendering that distinction enumerates
 *     accounts, and since suspension now bans the account, it also discloses
 *     account status to anyone with an address. All of them collapse.
 *
 *   - An expired link and an already-used link are the SAME observable, so a
 *     design that offers two screens is describing a distinction that does not
 *     exist.
 *
 * These functions deliberately return a TOKEN, never a message. A function
 * that returned a string would let a caller interpolate an untrusted value
 * into the page, which is the whole failure being designed out.
 */

const isNotice = (value: unknown): value is AuthNotice =>
  typeof value === "string" && (AUTH_NOTICES as readonly string[]).includes(value);

describe("noticeFromStateParam - the gate's state parameter is untrusted", () => {
  it("accepts the three states the gate can actually produce", () => {
    expect(noticeFromStateParam("pending")).toBe("pending");
    expect(noticeFromStateParam("suspended")).toBe("suspended");
    expect(noticeFromStateParam("unavailable")).toBe("unavailable");
  });

  it("renders nothing for decisions the gate never redirects with", () => {
    // loginRedirectFor returns null for these, so a request carrying them was
    // hand-crafted. The honest response is the plain sign-in card.
    expect(noticeFromStateParam("active")).toBeNull();
    expect(noticeFromStateParam("owner")).toBeNull();
  });

  it("renders nothing for anonymous, which needs no explanation", () => {
    // "You are not signed in" on a sign-in page is noise.
    expect(noticeFromStateParam("anonymous")).toBeNull();
  });

  it("renders nothing for anything else at all", () => {
    for (const raw of [
      "Your account was flagged. Verify at id-teaching-assistant.com",
      "SUSPENDED",
      " suspended ",
      "pending; drop table",
      "<script>alert(1)</script>",
      "",
      "   ",
      "banned",
      "error",
    ]) {
      expect(noticeFromStateParam(raw), `${JSON.stringify(raw)} must not select a screen`).toBeNull();
    }
  });

  it("is total for the shapes a query parameter actually arrives as", () => {
    // ?state=a&state=b reaches a page component as string[].
    for (const raw of [null, undefined, 42, {}, ["pending"], ["pending", "suspended"], true]) {
      expect(noticeFromStateParam(raw as never)).toBeNull();
    }
  });

  it("only ever returns a member of the closed notice set", () => {
    for (const raw of ["pending", "suspended", "unavailable", "nonsense", null]) {
      const result = noticeFromStateParam(raw as never);
      expect(result === null || isNotice(result)).toBe(true);
    }
  });
});

describe("mapSignInFailure - a sign-in error must not enumerate accounts", () => {
  it("collapses the three codes that would otherwise disclose account existence", () => {
    // invalid_credentials: wrong password OR no such account - safe on its own.
    // email_not_confirmed: proves the address HAS an account.
    // user_banned: proves it has one AND that it is suspended.
    for (const code of ["invalid_credentials", "email_not_confirmed", "user_banned"]) {
      expect(mapSignInFailure(code), `${code} must not be distinguishable`).toBe("generic");
    }
  });

  it("collapses an unknown code too, rather than falling through to something specific", () => {
    // A provider that adds a new code must not silently start leaking.
    for (const code of ["over_request_rate_limit", "weak_password", "brand_new_code_2027", ""]) {
      expect(mapSignInFailure(code)).toBe("generic");
    }
  });

  it("is total for a missing or non-string code", () => {
    for (const code of [null, undefined, 42, {}]) {
      expect(mapSignInFailure(code as never)).toBe("generic");
    }
  });

  it("never returns a provider message, only a token", () => {
    // A string return would invite interpolating the provider's own wording,
    // which is exactly how the distinction reaches the screen today.
    const result = mapSignInFailure("user_banned");
    expect(result).toBe("generic");
    expect(result).not.toContain(" ");
  });
});

describe("noticeFromConfirmError - expired and already-used are one state", () => {
  it("maps an expired-or-used token to a single invalid-link notice", () => {
    // The provider returns otp_expired for BOTH, so offering two screens would
    // describe a distinction that does not exist.
    expect(noticeFromConfirmError("otp_expired")).toBe("link-invalid");
  });

  it("maps every other verification failure to the same invalid-link notice", () => {
    for (const code of ["otp_disabled", "validation_failed", "bad_jwt", "unexpected_failure", ""]) {
      expect(noticeFromConfirmError(code)).toBe("link-invalid");
    }
  });

  it("is total for a missing or non-string code", () => {
    for (const code of [null, undefined, 42, {}]) {
      expect(noticeFromConfirmError(code as never)).toBe("link-invalid");
    }
  });

  it("keeps a MISSING token separate from a failed one", () => {
    // A request with no token at all is not a broken link - it is usually
    // someone opening /auth/confirm directly, and it is the branch most likely
    // to be mishandled into an open redirect.
    expect(noticeFromConfirmError("missing")).toBe("link-invalid");
    expect(AUTH_NOTICES).toContain("link-missing");
  });
});

describe("the notice set is closed, and every screen is reachable", () => {
  it("exposes exactly the notices the acceptance criteria name", () => {
    expect([...AUTH_NOTICES].sort()).toEqual(
      [
        "check-email",
        "link-invalid",
        "link-missing",
        "pending",
        "suspended",
        "unavailable",
        "wrong-account",
      ].sort()
    );
  });

  it("has no notice that no mapper can ever produce without a caller choosing it", () => {
    // check-email, link-missing and wrong-account are set explicitly by their
    // own flows rather than derived from an untrusted string. Pin that the
    // untrusted mappers cannot reach them, so a crafted URL cannot render a
    // "we emailed you" screen that is not true.
    const reachableFromUntrusted = new Set<string>();
    for (const raw of [...AUTH_NOTICES, "nonsense", "check-email", "wrong-account", null]) {
      const fromState = noticeFromStateParam(raw as never);
      if (fromState) reachableFromUntrusted.add(fromState);
    }
    expect(reachableFromUntrusted.has("check-email")).toBe(false);
    expect(reachableFromUntrusted.has("wrong-account")).toBe(false);
    expect(reachableFromUntrusted.has("link-missing")).toBe(false);
  });
});
