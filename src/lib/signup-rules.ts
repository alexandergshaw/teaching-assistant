// This module reads bare (non-NEXT_PUBLIC_) environment variables
// (SIGNUP_MODE, SIGNUP_ALLOWED_DOMAINS). Per Next's own docs
// (node_modules/next/dist/docs/01-app/02-guides/environment-variables.md),
// those are stripped from any bundle a Client Component pulls in, so both
// reads silently become `undefined` if this module is ever imported from
// client code. That failure is invisible on purpose-defeating: signupMode()
// falls back to "approval" (so SIGNUP_MODE=closed would silently close
// nothing) and the domain allowlist becomes empty, which this module
// deliberately treats as "no restriction" (so SIGNUP_ALLOWED_DOMAINS would
// become a no-op). No test run in Node, no `tsc`, and no `next build` catches
// either failure - only opening the app in a browser with the wrong bundle
// would. `import "server-only"` turns that silent client-side fallback into a
// build-time error instead, so a future client-side caller (e.g. a form that
// "validates on the client") fails loudly at build time rather than shipping
// a signup gate that quietly does nothing.
import "server-only";

/**
 * The sign-up rules: what mode the deployment is in, which email domains
 * (if any) are allowed to sign up, what a submitted form is checked against,
 * and what role/status a brand-new account starts with.
 *
 * This module may import TYPES from `./access` and the `isOwnerEmail`
 * allowlist check from `./owner`. It must never be imported BY `./access` -
 * the access decision is the more fundamental module (it runs at the edge on
 * every request; this one runs only when a sign-up form is submitted), and a
 * mutual import between the two would form a cycle. In this repo's module
 * system a cycle does not raise an error; it silently resolves one side's
 * import to `undefined` at the point it is read, which is far harder to
 * diagnose than a build failure would be.
 */

import type { AccessRole, AccessStatus } from "./access";
import { isOwnerEmail } from "./owner";

/** The three modes a deployment's sign-up form can be in. */
export type SignupMode = "open" | "approval" | "closed";

/**
 * The minimum password length this app accepts. Deliberately expressed in
 * characters (not bytes): it exists to rule out trivially short passwords,
 * not to interact with the hashing algorithm's own limit, so counting
 * Unicode code units is the right measure here.
 */
export const PASSWORD_MIN_LENGTH = 12;

/**
 * The maximum password size this app accepts, measured in BYTES rather than
 * characters. bcrypt (and the compatible hashes Supabase Auth uses) silently
 * truncates the input past 72 bytes - anything typed beyond that point is
 * never hashed at all, so a longer password can be LESS secure than a
 * shorter one if the user believes the extra length is protecting them. A
 * character count cannot catch this: 24 CJK characters are exactly 72 bytes
 * in UTF-8, but 25 are already 75 and would be silently cut short. Measuring
 * with `TextEncoder` (rather than `.length`, which counts UTF-16 code
 * units) is what makes the byte check accurate for non-ASCII input.
 */
export const PASSWORD_MAX_BYTES = 72;

/**
 * Reads the deployment's sign-up mode from the environment on every call
 * (never cached), tolerating surrounding whitespace and casing. Falls back
 * to `"approval"` - the safer of the two doors that actually accept
 * sign-ups - on anything unset or unrecognised, rather than falling open to
 * `"open"`. A typo in an env var must never be the difference between
 * "queued for approval" and "immediately active with access to every shared,
 * owner-funded API key".
 */
export function signupMode(): SignupMode {
  const raw = (process.env.SIGNUP_MODE ?? "").trim().toLowerCase();
  if (raw === "open" || raw === "approval" || raw === "closed") {
    return raw;
  }
  return "approval";
}

/** True for `open` and `approval` (a form exists); false only for `closed`. */
export function signupsAreOpen(): boolean {
  return signupMode() !== "closed";
}

/**
 * The status a brand-new, non-owner account starts with. Only `open` mode
 * activates immediately; every other mode (including `closed`, which never
 * reaches this in practice because `validateSignup` refuses first) queues
 * the account rather than risk defaulting to `active`.
 */
export function initialStatusForSignup(): AccessStatus {
  return signupMode() === "open" ? "active" : "pending";
}

/**
 * Splits an email into its local and domain parts, requiring EXACTLY one
 * `@`. This is the one place that split happens; both `isEmailDomainAllowed`
 * and `validateSignup` call through it so the "how many at-signs" rule
 * cannot drift between two hand-rolled copies. `dana@evil.com@example.edu`
 * has two plausible one-line extractions - `split("@")[1]` says `evil.com`,
 * `split("@").pop()` says `example.edu` - and they disagree, which is
 * exactly the shape of bug that turns an allowlist into a bypass. Requiring
 * the split to produce precisely two non-empty parts refuses the address
 * outright instead of picking one of the two answers.
 */
function splitEmail(email: string): { local: string; domain: string } | null {
  const parts = email.split("@");
  if (parts.length !== 2) {
    return null;
  }
  const [local, domain] = parts;
  if (!local || !domain) {
    return null;
  }
  return { local, domain };
}

/**
 * Parses `SIGNUP_ALLOWED_DOMAINS` into its normalised entries: trimmed,
 * lower-cased, comma-separated, empty entries dropped. An unset or
 * whitespace-only value yields an empty list, which `isEmailDomainAllowed`
 * treats as "no restriction" rather than "nothing is allowed".
 */
function allowedDomainEntries(): string[] {
  return (process.env.SIGNUP_ALLOWED_DOMAINS ?? "")
    .split(",")
    .map((entry) => entry.trim().toLowerCase())
    .filter(Boolean);
}

/**
 * Whether `email`'s domain is permitted to sign up. With no allowlist
 * configured, every domain is allowed - the allowlist is an opt-in
 * restriction, not a default one.
 *
 * Matching is EXACT by default and does not imply subdomains: an entry of
 * `example.edu` admits `dana@example.edu` but not `dana@cs.example.edu`.
 * Prefixing an entry with a dot (`.example.edu`) opts that entry into
 * "this domain or any subdomain of it". Without that distinction the leading
 * dot syntax would mean nothing, and an owner who typed the plain form would
 * be silently granting every subdomain anyway. A plain suffix check
 * (`domain.endsWith("example.edu")`) is deliberately not used either way,
 * because it would let `notexample.edu` pass for an allowlisted
 * `example.edu`.
 */
export function isEmailDomainAllowed(email: string | null | undefined): boolean {
  if (typeof email !== "string") {
    return false;
  }
  const parts = splitEmail(email);
  if (!parts) {
    return false;
  }
  const domain = parts.domain.toLowerCase();

  const entries = allowedDomainEntries();
  if (entries.length === 0) {
    return true;
  }

  return entries.some((entry) => {
    if (entry.startsWith(".")) {
      const base = entry.slice(1);
      return domain === base || domain.endsWith(entry);
    }
    return domain === entry;
  });
}

/**
 * Whether `email` is well-formed enough to accept: exactly one `@`, a
 * non-empty local part with no whitespace, and a domain part with no
 * whitespace that contains at least one dot and does not start or end with
 * one (and has no consecutive dots). This is a shape check, not a full
 * RFC 5322 parser - it exists to catch obviously malformed input
 * (`dana`, `dana@`, `@example.edu`, `dana@example`, `a b@c.edu`) before it
 * reaches Supabase Auth, not to be the last word on what a valid address is.
 */
function looksLikeEmail(email: string): boolean {
  const parts = splitEmail(email);
  if (!parts) {
    return false;
  }
  const { local, domain } = parts;
  if (/\s/.test(local)) {
    return false;
  }
  if (/\s/.test(domain)) {
    return false;
  }
  if (!domain.includes(".")) {
    return false;
  }
  if (domain.startsWith(".") || domain.endsWith(".") || domain.includes("..")) {
    return false;
  }
  return true;
}

export interface SignupInput {
  fullName?: unknown;
  email?: unknown;
  password?: unknown;
}

export type SignupResult =
  | { ok: true; fullName: string; email: string; password: string }
  | { ok: false; field: string; message: string };

function refuse(field: string, message: string): SignupResult {
  return { ok: false, field, message };
}

/**
 * Validates a sign-up submission and, on success, returns the NORMALISED
 * `fullName` and `email` - trimmed, with the email lower-cased - so the
 * caller stores exactly what was validated rather than re-deriving it. Two
 * independent normalisations of the same input can drift (`Dana@Example.edu`
 * stored once trimmed-only and once trimmed-and-lowercased becomes two
 * accounts), and the `OWNER_EMAILS` reconciliation on sign-in only works if
 * the stored email matches the form `isOwnerEmail` expects.
 *
 * This function is TOTAL: a missing, `null`, or wrong-typed field produces a
 * refusal with a string `field` and a non-empty `message`, and never throws.
 * A server action reading `FormData` gets `null` (via `formData.get`) for a
 * field that was never submitted, and a naive `password.length < MIN` on
 * that value throws a `TypeError` before any refusal can be shown.
 *
 * Checks run in this order: MODE first (a closed deployment refuses before
 * looking at the form at all, so nothing about field validity leaks to a
 * stranger probing a closed instance), then `fullName`, then `email`, then
 * `password`. When several fields are wrong, the first one in that order is
 * reported.
 */
export function validateSignup(input: SignupInput): SignupResult {
  if (!signupsAreOpen()) {
    return refuse("mode", "Sign-ups are currently closed for this workspace.");
  }

  const fullNameRaw = typeof input?.fullName === "string" ? input.fullName : null;
  const fullName = fullNameRaw !== null ? fullNameRaw.trim() : "";
  if (!fullName) {
    return refuse("fullName", "Enter your full name.");
  }

  const emailRaw = typeof input?.email === "string" ? input.email : null;
  const email = emailRaw !== null ? emailRaw.trim().toLowerCase() : "";
  if (!email || !looksLikeEmail(email)) {
    return refuse("email", "Enter a valid email address.");
  }
  if (!isEmailDomainAllowed(email)) {
    return refuse(
      "email",
      "This email address is not permitted to sign up. Contact your workspace administrator."
    );
  }

  const password = typeof input?.password === "string" ? input.password : null;
  if (password === null) {
    return refuse("password", "Enter a password.");
  }
  if (password.length < PASSWORD_MIN_LENGTH) {
    return refuse("password", `Password must be at least ${PASSWORD_MIN_LENGTH} characters.`);
  }
  if (new TextEncoder().encode(password).length > PASSWORD_MAX_BYTES) {
    return refuse("password", "Password is too long.");
  }
  const passwordNormalized = password.trim().toLowerCase();
  if (passwordNormalized === email || passwordNormalized === fullName.toLowerCase()) {
    return refuse("password", "Choose a password that is not your name or email address.");
  }

  return { ok: true, fullName, email, password };
}

export interface InitialAccountInput {
  email: string;
}

export interface InitialAccountDecision {
  role: AccessRole;
  status: AccessStatus;
}

/**
 * Decides the role and status a brand-new account starts with. Takes only
 * an email - there is deliberately NO first-account bootstrap. An earlier
 * design promoted the first account created to owner whenever `OWNER_EMAILS`
 * was empty; that was removed because the failure mode it was meant to
 * prevent (an unset or unpropagated `OWNER_EMAILS` - a typo, an env var that
 * did not reach the deployment, a fresh preview branch) already has a safe
 * outcome: nobody is approved, which is recoverable by fixing the
 * environment. Bootstrap-on-empty turns that SAME misconfiguration into
 * handing the deployment, its service-role database access and every shared
 * API key to the first stranger who finds the URL - and it races, since two
 * concurrent sign-ups both observe "no accounts yet". Ownership comes from
 * `OWNER_EMAILS` and nowhere else; an unset allowlist means the deployment
 * has no owner yet, which is the same fail-closed state this app already
 * has, not a new one.
 */
export function decideInitialAccount(input: InitialAccountInput): InitialAccountDecision {
  if (isOwnerEmail(input.email)) {
    return { role: "owner", status: "active" };
  }
  return { role: "instructor", status: initialStatusForSignup() };
}
