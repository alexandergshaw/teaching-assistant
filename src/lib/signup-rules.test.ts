import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  PASSWORD_MAX_BYTES,
  PASSWORD_MIN_LENGTH,
  decideInitialAccount,
  initialStatusForSignup,
  isEmailDomainAllowed,
  signupMode,
  signupsAreOpen,
  validateSignup,
} from "./signup-rules";

/**
 * Contract tests for the sign-up rules (docs/multi-user-login-acceptance-criteria.md
 * B1, and the SIGNUP_MODE contract). Written before the module existed.
 *
 * These assert the RULE and the ORDERING, never the wording of a message -
 * copy is the implementer's to write, the decision is not.
 *
 * REVISED after an adversarial audit of an earlier draft, which found that
 * the draft left PASSWORD_MAX unbounded (so a 500-character maximum passed
 * every assertion while shipping the exact silent bcrypt truncation the test's
 * own comment existed to prevent), measured passwords in characters when the
 * limit is in BYTES, accepted a two-at-sign address that three plausible
 * domain extractors disagree about, and pinned closed mode to CREATE AN OWNER
 * rather than refuse.
 */

const SAVED = {
  mode: process.env.SIGNUP_MODE,
  domains: process.env.SIGNUP_ALLOWED_DOMAINS,
  owners: process.env.OWNER_EMAILS,
};

const validInput = {
  fullName: "Dana Reyes",
  email: "dana@example.edu",
  password: "correct horse battery",
};

const byteLength = (value: string) => new TextEncoder().encode(value).length;

beforeEach(() => {
  delete process.env.SIGNUP_MODE;
  delete process.env.SIGNUP_ALLOWED_DOMAINS;
  delete process.env.OWNER_EMAILS;
});

afterEach(() => {
  for (const [key, value] of [
    ["SIGNUP_MODE", SAVED.mode],
    ["SIGNUP_ALLOWED_DOMAINS", SAVED.domains],
    ["OWNER_EMAILS", SAVED.owners],
  ] as const) {
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
});

describe("signupMode", () => {
  it("defaults to approval when unset - the safe door, not the open one", () => {
    expect(signupMode()).toBe("approval");
  });

  it("reads each supported mode", () => {
    process.env.SIGNUP_MODE = "open";
    expect(signupMode()).toBe("open");
    process.env.SIGNUP_MODE = "approval";
    expect(signupMode()).toBe("approval");
    process.env.SIGNUP_MODE = "closed";
    expect(signupMode()).toBe("closed");
  });

  it("tolerates surrounding whitespace and casing", () => {
    process.env.SIGNUP_MODE = "  OPEN  ";
    expect(signupMode()).toBe("open");
  });

  it("falls back to approval on an unrecognised value rather than opening up", () => {
    process.env.SIGNUP_MODE = "yes-please";
    expect(signupMode()).toBe("approval");
    process.env.SIGNUP_MODE = "";
    expect(signupMode()).toBe("approval");
  });
});

describe("initialStatusForSignup", () => {
  it("activates immediately only in open mode", () => {
    process.env.SIGNUP_MODE = "open";
    expect(initialStatusForSignup()).toBe("active");
  });

  it("queues the account for approval in approval mode", () => {
    process.env.SIGNUP_MODE = "approval";
    expect(initialStatusForSignup()).toBe("pending");
  });

  it("never yields active in closed mode", () => {
    process.env.SIGNUP_MODE = "closed";
    expect(initialStatusForSignup()).toBe("pending");
  });

  it("never yields active by default", () => {
    expect(initialStatusForSignup()).toBe("pending");
  });
});

describe("signupsAreOpen", () => {
  it("is true for open and approval, false for closed", () => {
    process.env.SIGNUP_MODE = "open";
    expect(signupsAreOpen()).toBe(true);
    process.env.SIGNUP_MODE = "approval";
    expect(signupsAreOpen()).toBe(true);
    process.env.SIGNUP_MODE = "closed";
    expect(signupsAreOpen()).toBe(false);
  });
});

describe("isEmailDomainAllowed", () => {
  it("allows any domain when the allowlist is unset or empty", () => {
    expect(isEmailDomainAllowed("anyone@anywhere.test")).toBe(true);
    process.env.SIGNUP_ALLOWED_DOMAINS = "   ";
    expect(isEmailDomainAllowed("anyone@anywhere.test")).toBe(true);
  });

  it("allows an exact domain match, case-insensitively", () => {
    process.env.SIGNUP_ALLOWED_DOMAINS = "Example.edu";
    expect(isEmailDomainAllowed("dana@EXAMPLE.EDU")).toBe(true);
  });

  it("refuses a domain that is not listed", () => {
    process.env.SIGNUP_ALLOWED_DOMAINS = "example.edu";
    expect(isEmailDomainAllowed("dana@other.edu")).toBe(false);
  });

  it("refuses a lookalike that merely ends with an allowed domain", () => {
    // "notexample.edu" must not pass a suffix check for "example.edu".
    process.env.SIGNUP_ALLOWED_DOMAINS = "example.edu";
    expect(isEmailDomainAllowed("dana@notexample.edu")).toBe(false);
  });

  it("does not grant subdomains unless the entry opts in with a leading dot", () => {
    // Otherwise the leading-dot syntax means nothing, and an owner who wrote
    // "example.edu" silently admits students.example.edu.
    process.env.SIGNUP_ALLOWED_DOMAINS = "example.edu";
    expect(isEmailDomainAllowed("dana@cs.example.edu")).toBe(false);
    expect(isEmailDomainAllowed("dana@a.b.example.edu")).toBe(false);
  });

  it("treats a leading dot as 'this domain or any subdomain of it'", () => {
    process.env.SIGNUP_ALLOWED_DOMAINS = ".example.edu";
    expect(isEmailDomainAllowed("dana@cs.example.edu")).toBe(true);
    expect(isEmailDomainAllowed("dana@example.edu")).toBe(true);
    expect(isEmailDomainAllowed("dana@notexample.edu")).toBe(false);
  });

  it("accepts several domains in one comma-separated list", () => {
    process.env.SIGNUP_ALLOWED_DOMAINS = "example.edu, other.edu";
    expect(isEmailDomainAllowed("dana@other.edu")).toBe(true);
  });

  it("does not let a second at-sign fake an allowed domain", () => {
    // "dana@evil.com@example.edu": split("@")[1] says evil.com, .pop() says
    // example.edu. Two plausible implementations, opposite answers, and the
    // permissive one is an allowlist bypass.
    process.env.SIGNUP_ALLOWED_DOMAINS = "example.edu";
    expect(isEmailDomainAllowed("dana@evil.com@example.edu")).toBe(false);
    expect(isEmailDomainAllowed("dana@example.edu@evil.com")).toBe(false);
  });

  it("refuses input with no domain at all", () => {
    process.env.SIGNUP_ALLOWED_DOMAINS = "example.edu";
    expect(isEmailDomainAllowed("dana")).toBe(false);
    expect(isEmailDomainAllowed("")).toBe(false);
    expect(isEmailDomainAllowed(null)).toBe(false);
  });
});

describe("validateSignup", () => {
  it("accepts a well-formed signup", () => {
    expect(validateSignup(validInput).ok).toBe(true);
  });

  it("returns the normalised name and email the caller should store", () => {
    // Otherwise the caller re-derives them and the two normalisations drift:
    // "Dana@Example.edu" and "dana@example.edu" become two accounts, and the
    // OWNER_EMAILS reconciliation stops matching the stored value.
    const result = validateSignup({ ...validInput, email: "  Dana@Example.EDU  " });
    expect(result.ok).toBe(true);
    expect(result.ok === true && result.email).toBe("dana@example.edu");
    expect(result.ok === true && result.fullName).toBe("Dana Reyes");
  });

  it("refuses outright in closed mode instead of queueing an account", () => {
    process.env.SIGNUP_MODE = "closed";
    const result = validateSignup(validInput);
    expect(result.ok).toBe(false);
    expect(result.ok === false && result.field).toBe("mode");
  });

  it("checks the mode before the fields, so nothing leaks about the form", () => {
    process.env.SIGNUP_MODE = "closed";
    const result = validateSignup({ fullName: "", email: "nope", password: "short" });
    expect(result.ok === false && result.field).toBe("mode");
  });

  it("requires a name", () => {
    const result = validateSignup({ ...validInput, fullName: "   " });
    expect(result.ok).toBe(false);
    expect(result.ok === false && result.field).toBe("fullName");
  });

  it("requires an email that looks like an address", () => {
    for (const email of ["dana", "dana@", "@example.edu", "dana@example", "a b@c.edu"]) {
      const result = validateSignup({ ...validInput, email });
      expect(result.ok, `expected ${email} to be refused`).toBe(false);
      expect(result.ok === false && result.field).toBe("email");
    }
  });

  it("refuses an address with more than one at-sign", () => {
    for (const email of ["dana@@example.edu", "dana@evil.com@example.edu", "a@b@c.edu"]) {
      const result = validateSignup({ ...validInput, email });
      expect(result.ok, `expected ${email} to be refused`).toBe(false);
      expect(result.ok === false && result.field).toBe("email");
    }
  });

  it("refuses an email outside the domain allowlist, naming the email field", () => {
    process.env.SIGNUP_ALLOWED_DOMAINS = "example.edu";
    const result = validateSignup({ ...validInput, email: "dana@other.edu" });
    expect(result.ok).toBe(false);
    expect(result.ok === false && result.field).toBe("email");
  });

  it("refuses a password shorter than the stated minimum", () => {
    const result = validateSignup({
      ...validInput,
      password: "x".repeat(PASSWORD_MIN_LENGTH - 1),
    });
    expect(result.ok).toBe(false);
    expect(result.ok === false && result.field).toBe("password");
  });

  it("accepts a password of exactly the stated minimum", () => {
    expect(
      validateSignup({ ...validInput, password: "x".repeat(PASSWORD_MIN_LENGTH) }).ok
    ).toBe(true);
  });

  it("pins the maximum to the byte limit the password hash actually honours", () => {
    // bcrypt truncates past 72 BYTES. An unbounded maximum passes every other
    // assertion here while shipping silent truncation.
    expect(PASSWORD_MAX_BYTES).toBe(72);
    expect(PASSWORD_MIN_LENGTH).toBeGreaterThanOrEqual(8);
    expect(PASSWORD_MIN_LENGTH).toBeLessThan(PASSWORD_MAX_BYTES);
  });

  it("measures the password in bytes, not characters", () => {
    // 24 CJK characters are 72 bytes; 25 are 75 and would be truncated. A
    // character-length check accepts both and lets the user believe a long
    // password protects them when only its first bytes are ever hashed.
    const atLimit = "中".repeat(24);
    const overLimit = "中".repeat(25);
    const emoji = "\u{1f512}".repeat(20);
    expect(byteLength(atLimit)).toBe(72);
    expect(byteLength(overLimit)).toBe(75);
    expect(byteLength(emoji)).toBe(80);

    expect(validateSignup({ ...validInput, password: atLimit }).ok).toBe(true);
    for (const password of [overLimit, emoji, "x".repeat(PASSWORD_MAX_BYTES + 1)]) {
      const result = validateSignup({ ...validInput, password });
      expect(result.ok, `${byteLength(password)} bytes must be refused`).toBe(false);
      expect(result.ok === false && result.field).toBe("password");
    }
  });

  it("refuses a password that is just the account's own identity", () => {
    for (const password of [
      validInput.email,
      validInput.email.toUpperCase(),
      `  ${validInput.email}  `,
      validInput.fullName,
    ]) {
      const result = validateSignup({ ...validInput, password });
      expect(result.ok, `expected ${JSON.stringify(password)} to be refused`).toBe(false);
      expect(result.ok === false && result.field).toBe("password");
    }
  });

  it("reports the FIRST problem in visual field order when several are wrong", () => {
    const result = validateSignup({ fullName: "", email: "nope", password: "short" });
    expect(result.ok === false && result.field).toBe("fullName");
  });

  it("reports email before password when the name is fine", () => {
    const result = validateSignup({ fullName: "Dana", email: "nope", password: "short" });
    expect(result.ok === false && result.field).toBe("email");
  });

  it("refuses rather than throwing when a field is missing entirely", () => {
    // A server action reading FormData gets null for an absent field, and the
    // natural `password.length < MIN` throws a TypeError. B1 requires a
    // refusal; the design requires never showing a stack trace.
    for (const bad of [
      {},
      { fullName: "Dana" },
      { fullName: "Dana", email: "d@e.edu" },
      { fullName: null, email: null, password: null },
      { fullName: 1, email: [], password: {} },
    ]) {
      const result = validateSignup(bad as never);
      expect(result.ok, `for ${JSON.stringify(bad)}`).toBe(false);
      expect(result.ok === false && typeof result.field).toBe("string");
      expect(result.ok === false && result.message.trim().length).toBeGreaterThan(0);
    }
  });

  it("always carries a non-empty message a form can render", () => {
    const result = validateSignup({ ...validInput, password: "short" });
    expect(result.ok === false && result.message.trim().length).toBeGreaterThan(0);
  });
});

/**
 * The bootstrap rule (AC A3, AMENDED).
 *
 * An earlier draft promoted the FIRST account to owner whenever OWNER_EMAILS
 * was empty. The adversarial review killed it, correctly: today an unset or
 * unpropagated OWNER_EMAILS (a Vercel env that did not reach the deployment, a
 * typo, a fresh preview branch) locks everyone out - recoverable and harmless,
 * and README.md:45-47 states that fail-closed contract on purpose. Under
 * first-account bootstrap the SAME misconfiguration hands ownership of the
 * deployment, its service-role data and every shared API key to the first
 * stranger who finds the URL. It also raced: two concurrent sign-ups would both
 * observe "no accounts yet".
 *
 * So there is no bootstrap. Ownership comes from OWNER_EMAILS and nowhere else.
 */
describe("decideInitialAccount", () => {
  const OWNER = "boss@example.edu";

  it("makes an allowlisted email an active owner, whatever the mode", () => {
    process.env.OWNER_EMAILS = OWNER;
    for (const mode of ["open", "approval", "closed"] as const) {
      process.env.SIGNUP_MODE = mode;
      expect(decideInitialAccount({ email: OWNER })).toMatchObject({
        role: "owner",
        status: "active",
      });
    }
  });

  it("does NOT promote anyone when the allowlist is unset", () => {
    // The fail-closed property. An env var that failed to propagate must lock
    // the deployment, never hand it to whoever arrives first.
    process.env.SIGNUP_MODE = "approval";
    expect(decideInitialAccount({ email: "first@example.edu" })).toMatchObject({
      role: "instructor",
      status: "pending",
    });
  });

  it("does NOT promote anyone when the allowlist is present but does not match", () => {
    process.env.OWNER_EMAILS = OWNER;
    process.env.SIGNUP_MODE = "open";
    expect(decideInitialAccount({ email: "stranger@example.edu" }).role).toBe("instructor");
  });

  it("queues an ordinary account in approval mode", () => {
    process.env.SIGNUP_MODE = "approval";
    expect(decideInitialAccount({ email: "dana@example.edu" })).toMatchObject({
      role: "instructor",
      status: "pending",
    });
  });

  it("activates an ordinary account in open mode", () => {
    process.env.SIGNUP_MODE = "open";
    expect(decideInitialAccount({ email: "dana@example.edu" })).toMatchObject({
      role: "instructor",
      status: "active",
    });
  });

  it("never returns an active instructor by default", () => {
    expect(decideInitialAccount({ email: "dana@example.edu" })).toMatchObject({
      role: "instructor",
      status: "pending",
    });
  });

  it("never returns an owner from any input except an allowlist match", () => {
    process.env.OWNER_EMAILS = OWNER;
    for (const email of ["", "  ", "not-the-owner@example.edu", `${OWNER}.evil.com`, "example.edu"]) {
      expect(
        decideInitialAccount({ email }).role,
        `${JSON.stringify(email)} must not be an owner`
      ).toBe("instructor");
    }
  });
});
