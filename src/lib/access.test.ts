import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  canUseApp,
  isOwnerDecision,
  isPublicPath,
  loginRedirectFor,
  resolveAccess,
  safeNextPath,
  type AccessDecision,
  type AccessProfile,
} from "./access";
import { isOwnerEmail } from "./owner";

/**
 * Contract tests for the single access decision. Written from the acceptance
 * criteria (docs/multi-user-login-acceptance-criteria.md, A4/A5/A7 and R2)
 * BEFORE the module existed, so the implementation is coded against them.
 *
 * The rule these pin, in order:
 *   1. no email            -> anonymous
 *   2. OWNER_EMAILS match  -> owner, WITHOUT consulting the profile (break-glass)
 *   3. lookup failed       -> unavailable (fails closed, distinct from suspended)
 *   4. no profile row      -> pending
 *   5. suspended / pending -> themselves
 *   6. active + owner role -> owner, else active
 *
 * REVISED after an adversarial audit of an earlier draft. That draft's
 * open-redirect suite was passed in full by a guard that still redirected to
 * evil.com, and its allowlist suite was passed in full by a substring match
 * that granted owner to any suffix of the owner's address. Both classes are
 * pinned here by a PROPERTY (the resolved origin; agreement with the one
 * allowlist implementation) rather than by a list of the shapes I happened to
 * think of.
 */

const APP_ORIGIN = "https://app.example.edu";
const ALL_DECISIONS: AccessDecision[] = [
  "anonymous",
  "pending",
  "suspended",
  "unavailable",
  "active",
  "owner",
];

const ORIGINAL_OWNER_EMAILS = process.env.OWNER_EMAILS;

const profile = (
  role: AccessProfile["role"],
  status: AccessProfile["status"]
): AccessProfile => ({ role, status });

beforeEach(() => {
  delete process.env.OWNER_EMAILS;
});

afterEach(() => {
  if (ORIGINAL_OWNER_EMAILS === undefined) delete process.env.OWNER_EMAILS;
  else process.env.OWNER_EMAILS = ORIGINAL_OWNER_EMAILS;
});

describe("resolveAccess - identity", () => {
  it("is anonymous with no email, whatever the profile says", () => {
    expect(resolveAccess({ email: null, profile: profile("owner", "active") })).toBe(
      "anonymous"
    );
    expect(resolveAccess({ email: undefined, profile: null })).toBe("anonymous");
    expect(resolveAccess({ email: "", profile: null })).toBe("anonymous");
  });

  it("treats a whitespace-only email as no identity at all", () => {
    // Trim before the emptiness check, or "   " reads as a signed-in person.
    expect(resolveAccess({ email: "   ", profile: null })).toBe("anonymous");
    expect(resolveAccess({ email: "\t\n", profile: profile("owner", "active") })).toBe(
      "anonymous"
    );
  });

  it("is anonymous when nothing at all is supplied", () => {
    expect(resolveAccess({})).toBe("anonymous");
  });
});

describe("resolveAccess - the OWNER_EMAILS break-glass path", () => {
  it("returns owner for an allowlisted email with NO profile row", () => {
    process.env.OWNER_EMAILS = "boss@example.edu";
    expect(resolveAccess({ email: "boss@example.edu", profile: null })).toBe("owner");
  });

  it("returns owner for an allowlisted email even when the profile lookup failed", () => {
    process.env.OWNER_EMAILS = "boss@example.edu";
    expect(
      resolveAccess({ email: "boss@example.edu", profile: null, lookupFailed: true })
    ).toBe("owner");
  });

  it("returns owner for an allowlisted email whose stored profile says suspended", () => {
    // The env allowlist is the deployment owner's way back in. A stale or
    // corrupted row must not be able to lock them out of their own app.
    // CONSEQUENCE, decided deliberately: suspension cannot revoke an
    // allowlisted account, so the admin surface must refuse to offer suspend
    // or demote for one rather than reporting a success that does nothing.
    process.env.OWNER_EMAILS = "boss@example.edu";
    expect(
      resolveAccess({ email: "boss@example.edu", profile: profile("instructor", "suspended") })
    ).toBe("owner");
  });

  it("matches the allowlist case-insensitively and across a comma list", () => {
    process.env.OWNER_EMAILS = "first@example.edu, Second@Example.edu";
    expect(resolveAccess({ email: "SECOND@example.edu", profile: null })).toBe("owner");
  });

  it("matches whole allowlist entries, not substrings of one", () => {
    // A `OWNER_EMAILS.includes(email)` implementation passes every other test
    // in this describe and grants owner to "example.edu" and "@example.edu".
    process.env.OWNER_EMAILS = "boss@example.edu";
    for (const near of [
      "oss@example.edu",
      "s@example.edu",
      "example.edu",
      "@example.edu",
      "xboss@example.edu",
      "boss@example.edu.evil.com",
      "boss@example.ed",
    ]) {
      expect(
        resolveAccess({ email: near, profile: null }),
        `${near} must not be an owner`
      ).toBe("pending");
    }
  });

  it("agrees with the one allowlist implementation the app already has", () => {
    // AC A4: no second copy of the rule. A hand-rolled copy is where the
    // substring bug above comes from, so pin agreement rather than behaviour.
    process.env.OWNER_EMAILS = "boss@example.edu, other@example.edu";
    for (const email of [
      "boss@example.edu",
      "BOSS@example.edu",
      "oss@example.edu",
      "boss@example.edu ",
      " boss@example.edu",
      "bo ss@example.edu",
      "other@example.edu",
      "nobody@example.edu",
    ]) {
      expect(
        resolveAccess({ email, profile: null }) === "owner",
        `resolveAccess and isOwnerEmail disagree about ${JSON.stringify(email)}`
      ).toBe(isOwnerEmail(email));
    }
  });

  it("grants nobody owner status through an empty or unset allowlist", () => {
    process.env.OWNER_EMAILS = "";
    expect(resolveAccess({ email: "boss@example.edu", profile: null })).toBe("pending");
    delete process.env.OWNER_EMAILS;
    expect(resolveAccess({ email: "boss@example.edu", profile: null })).toBe("pending");
  });

  it("reads the allowlist on every call, not once at module load", () => {
    // The gate runs per request and the value can differ between deployments
    // of the same bundle.
    delete process.env.OWNER_EMAILS;
    expect(resolveAccess({ email: "boss@example.edu", profile: null })).toBe("pending");
    process.env.OWNER_EMAILS = "boss@example.edu";
    expect(resolveAccess({ email: "boss@example.edu", profile: null })).toBe("owner");
  });
});

/**
 * `authFailed` exists because of a hole found when the gate was built.
 *
 * The rule as first written resolved "no email" to `anonymous` UNCONDITIONALLY,
 * before anything else. But a Supabase transport failure also produces no
 * email - `getUser()` returns `{ data: { user: null }, error }` for BOTH an
 * ordinary signed-out visitor and an unreachable auth service. So the outage
 * case collapsed into `anonymous`, and the user was redirected to a sign-in
 * page that could not possibly work, with nothing saying why.
 *
 * `lookupFailed` could not express this either: it is consulted after the
 * no-email branch, so it never got the chance to fire. The implementer worked
 * around it by calling `loginRedirectFor("unavailable", ...)` directly from
 * the gate - correct behaviour, but a SECOND copy of the access decision,
 * which is exactly what AC A4 forbids. These tests move the rule back into
 * the one place it belongs.
 *
 * `authFailed` is therefore checked FIRST, ahead of the no-email branch:
 * "we could not determine who you are" is a different fact from "you are not
 * signed in", and only the caller can tell them apart.
 */
describe("resolveAccess - the identity could not be determined", () => {
  it("is unavailable, not anonymous, when authentication itself failed", () => {
    expect(resolveAccess({ email: null, authFailed: true })).toBe("unavailable");
    expect(resolveAccess({ email: undefined, profile: null, authFailed: true })).toBe(
      "unavailable"
    );
  });

  it("outranks every other branch, including the owner break-glass", () => {
    // If we could not establish an identity, we cannot honour an allowlist
    // match either - there is no verified email to match against.
    process.env.OWNER_EMAILS = "boss@example.edu";
    expect(
      resolveAccess({ email: "boss@example.edu", profile: null, authFailed: true })
    ).toBe("unavailable");
    expect(
      resolveAccess({
        email: "m@e.edu",
        profile: profile("owner", "active"),
        authFailed: true,
      })
    ).toBe("unavailable");
  });

  it("does not fire for an ordinary signed-out visitor", () => {
    // The common case by far. Misreading it as an outage would show every
    // logged-out person a "something went wrong" screen instead of sign-in.
    expect(resolveAccess({ email: null, authFailed: false })).toBe("anonymous");
    expect(resolveAccess({ email: null })).toBe("anonymous");
  });

  it("routes to the login page like every other blocked decision", () => {
    const decision = resolveAccess({ email: null, authFailed: true });
    expect(canUseApp(decision)).toBe(false);
    const target = loginRedirectFor(decision, "/courses");
    expect(target?.pathname).toBe("/login");
    expect(new URLSearchParams(target!.search).get("state")).toBe("unavailable");
  });
});

describe("resolveAccess - failing closed", () => {
  it("is unavailable, not active, when the profile lookup failed", () => {
    expect(
      resolveAccess({ email: "member@example.edu", profile: null, lookupFailed: true })
    ).toBe("unavailable");
  });

  it("is unavailable even when a stale profile object is also supplied", () => {
    // A caller that both errored and passed a value must not have the value
    // trusted; "unavailable" is the honest answer.
    expect(
      resolveAccess({
        email: "member@example.edu",
        profile: profile("owner", "active"),
        lookupFailed: true,
      })
    ).toBe("unavailable");
  });

  it("treats a session with no profile row as pending, never as active", () => {
    expect(resolveAccess({ email: "member@example.edu", profile: null })).toBe("pending");
  });

  it("fails closed on a role or status it does not recognise", () => {
    // Rows arrive from a migration, from a database trigger, and from hand
    // edits in the Supabase dashboard. A `return profile.status` implementation
    // would emit a value outside the union and leave the gate with no branch.
    expect(
      resolveAccess({ email: "m@e.edu", profile: { role: "root", status: "active" } as never })
    ).toBe("active");
    for (const status of ["deleted", "ACTIVE", "", null, undefined]) {
      const decision = resolveAccess({
        email: "m@e.edu",
        profile: { role: "instructor", status } as never,
      });
      expect(canUseApp(decision), `status ${String(status)} must not admit`).toBe(false);
      expect(loginRedirectFor(decision, "/courses")?.pathname).toBe("/login");
    }
  });
});

describe("resolveAccess - stored status wins for everyone else", () => {
  it("maps each stored status to its decision for an instructor", () => {
    expect(resolveAccess({ email: "m@e.edu", profile: profile("instructor", "active") })).toBe(
      "active"
    );
    expect(resolveAccess({ email: "m@e.edu", profile: profile("instructor", "pending") })).toBe(
      "pending"
    );
    expect(
      resolveAccess({ email: "m@e.edu", profile: profile("instructor", "suspended") })
    ).toBe("suspended");
  });

  it("returns owner for an active owner-role profile with no env allowlist", () => {
    expect(resolveAccess({ email: "m@e.edu", profile: profile("owner", "active") })).toBe(
      "owner"
    );
  });

  it("does not let a suspended or pending owner-role profile act as an owner", () => {
    expect(
      resolveAccess({ email: "m@e.edu", profile: profile("owner", "suspended") })
    ).toBe("suspended");
    expect(resolveAccess({ email: "m@e.edu", profile: profile("owner", "pending") })).toBe(
      "pending"
    );
  });
});

describe("canUseApp / isOwnerDecision", () => {
  it("admits exactly active and owner", () => {
    const table: Record<AccessDecision, boolean> = {
      active: true,
      owner: true,
      pending: false,
      suspended: false,
      unavailable: false,
      anonymous: false,
    };
    for (const decision of ALL_DECISIONS) {
      expect(canUseApp(decision), `decision ${decision}`).toBe(table[decision]);
    }
  });

  it("treats only the owner decision as owner", () => {
    // Exhaustive over the union: a `d !== "active" && d !== "anonymous"`
    // implementation passes a three-case test and makes suspended an owner.
    const table: Record<AccessDecision, boolean> = {
      owner: true,
      active: false,
      pending: false,
      suspended: false,
      unavailable: false,
      anonymous: false,
    };
    for (const decision of ALL_DECISIONS) {
      expect(isOwnerDecision(decision), `decision ${decision}`).toBe(table[decision]);
    }
  });
});

describe("safeNextPath - the open-redirect guard", () => {
  it("keeps a same-origin absolute path, including its query and hash", () => {
    expect(safeNextPath("/courses")).toBe("/courses");
    expect(safeNextPath("/courses?tab=modules")).toBe("/courses?tab=modules");
    expect(safeNextPath("/courses#week-3")).toBe("/courses#week-3");
    expect(safeNextPath("/courses?tab=modules#week-3")).toBe("/courses?tab=modules#week-3");
  });

  it("resolves to the app's own origin, whatever the spelling", () => {
    // The PROPERTY, not a denylist of the shapes I happened to think of.
    for (const raw of [
      "/courses",
      "//evil.example.com",
      "/\\evil.example.com",
      "///evil.example.com",
      "/\t/evil.example.com",
      "https://evil.example.com",
      "http://evil.example.com",
      "javascript:alert(1)",
    ]) {
      expect(
        new URL(safeNextPath(raw), APP_ORIGIN).origin,
        `${JSON.stringify(raw)} escaped the origin`
      ).toBe(APP_ORIGIN);
    }
  });

  it("refuses control characters that a browser strips out of a URL", () => {
    // "/<TAB>/evil.com" IS "//evil.com" by the time the browser parses the
    // Location header: tab, LF and CR are removed before parsing.
    for (const raw of [
      "/\t/evil.example.com",
      "/\n/evil.example.com",
      "/\r/evil.example.com",
      "/ /evil.example.com",
      "///evil.example.com",
    ]) {
      expect(safeNextPath(raw), `${JSON.stringify(raw)} must be refused`).toBe("/");
    }
  });

  it("refuses a protocol-relative or backslash-smuggled origin", () => {
    expect(safeNextPath("//evil.example.com/steal")).toBe("/");
    expect(safeNextPath("/\\evil.example.com")).toBe("/");
  });

  it("refuses an absolute URL or a scheme", () => {
    expect(safeNextPath("https://evil.example.com")).toBe("/");
    expect(safeNextPath("javascript:alert(1)")).toBe("/");
    expect(safeNextPath("  javascript:alert(1)")).toBe("/");
    expect(safeNextPath("JavaScript:alert(1)")).toBe("/");
  });

  it("refuses anything that is not an absolute path", () => {
    expect(safeNextPath("courses")).toBe("/");
    expect(safeNextPath("")).toBe("/");
    expect(safeNextPath(null)).toBe("/");
    expect(safeNextPath(undefined)).toBe("/");
  });

  it("is total for the shapes a query parameter can actually arrive as", () => {
    // ?next=/a&next=/b reaches a page component as string[].
    expect(safeNextPath(["/courses", "//evil.example.com"] as never)).toBe("/");
    expect(safeNextPath(42 as never)).toBe("/");
    expect(safeNextPath({} as never)).toBe("/");
  });

  it("refuses every screen under the login prefix, not just the two I listed", () => {
    // Otherwise a bounced sign-in loops back onto itself. The design puts four
    // screens under /login, so an exact-match denylist of two is not enough.
    for (const raw of [
      "/login",
      "/login/",
      "/login/signup",
      "/login/forgot",
      "/login/reset",
      "/login?next=%2Fcourses",
      "/login?next=https://evil.example.com",
    ]) {
      expect(safeNextPath(raw), `${raw} must not be a destination`).toBe("/");
    }
  });
});

describe("loginRedirectFor - what the request gate does with a decision", () => {
  it("routes every decision in the union, and only the two that may proceed to null", () => {
    const expected: Record<AccessDecision, string | null> = {
      anonymous: "/login",
      pending: "/login",
      suspended: "/login",
      unavailable: "/login",
      active: null,
      owner: null,
    };
    for (const decision of ALL_DECISIONS) {
      const target = loginRedirectFor(decision, "/courses");
      expect(target?.pathname ?? null, `decision ${decision}`).toBe(expected[decision]);
      expect(target === null, `decision ${decision}`).toBe(canUseApp(decision));
    }
  });

  it("carries the blocked decision so the page can explain itself", () => {
    const target = loginRedirectFor("suspended", "/courses");
    expect(new URLSearchParams(target!.search).get("state")).toBe("suspended");
  });

  it("preserves the intended destination so the user lands where they meant to", () => {
    const target = loginRedirectFor("anonymous", "/courses?tab=modules");
    expect(new URLSearchParams(target!.search).get("next")).toBe("/courses?tab=modules");
  });

  it("encodes the destination so it cannot inject sibling parameters", () => {
    // Raw concatenation passes every other test here, because URLSearchParams
    // splits on "&" and then the FIRST "=".
    const raw = "/courses?a=1&state=owner&next=/elsewhere";
    const params = new URLSearchParams(loginRedirectFor("anonymous", raw)!.search);
    expect(params.get("next")).toBe(raw);
    expect(params.get("state")).toBe("anonymous");
    expect(params.getAll("next")).toHaveLength(1);
    expect(params.getAll("state")).toHaveLength(1);
  });

  it("sends a login-area destination to the root, positively", () => {
    for (const raw of ["/login", "/login/signup", "/login/forgot", "/login?next=%2Fa"]) {
      expect(
        new URLSearchParams(loginRedirectFor("anonymous", raw)!.search).get("next"),
        `for ${raw}`
      ).toBe("/");
    }
  });

  it("refuses to smuggle an off-origin destination into next", () => {
    for (const raw of ["//evil.example.com", "https://evil.example.com", "/\t/evil.example.com"]) {
      expect(
        new URLSearchParams(loginRedirectFor("anonymous", raw)!.search).get("next"),
        `for ${JSON.stringify(raw)}`
      ).toBe("/");
    }
  });
});

/**
 * The gate's public-path table (AC A5, R3). This is the highest-value pure
 * predicate in the feature: a prefix typo either leaves /api/github/webhook
 * 307-redirected (the bug R3 exists to fix) or silently exempts a real route.
 */
describe("isPublicPath", () => {
  it("exempts every path that is reached without a session", () => {
    for (const p of [
      "/login",
      "/login/signup",
      "/login/forgot",
      "/login/reset",
      "/auth/confirm",
      "/api/cron/run-schedules",
      "/api/triggers/abc123",
      "/api/github/webhook",
    ]) {
      expect(isPublicPath(p), `${p} must be public`).toBe(true);
    }
  });

  it("gates everything else", () => {
    for (const p of [
      "/",
      "/courses",
      "/knowledge",
      "/account/security",
      "/account/people",
      "/api/ai-chat",
      "/api/prose",
      "/api/research",
      "/api/parse-calendar",
      "/api/accessibility",
    ]) {
      expect(isPublicPath(p), `${p} must be gated`).toBe(false);
    }
  });

  it("matches whole path segments, not bare prefixes", () => {
    // "/loginish" starts with "/login" and must NOT be public.
    for (const p of [
      "/loginish",
      "/logins",
      "/authors",
      "/api/cronjobs",
      "/api/triggersomething",
      "/api/github/repos",
      "/api/github/webhooks-admin",
    ]) {
      expect(isPublicPath(p), `${p} must be gated`).toBe(false);
    }
  });
});
