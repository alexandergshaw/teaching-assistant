/**
 * The pure row view-model behind E5's settings list - the surface where a
 * signed-in user sees, replaces and deletes their own Canvas credentials.
 * Contract: docs/lms-credentials-acceptance-criteria.md E5, E10, DAT3, SEC12,
 * E-UX5, E-UX6; tests: ./lms-credential-view.test.ts.
 *
 * WHY THIS IS A SEPARATE MODULE FROM THE PAGE. This repo's vitest is
 * node-environment and collects only test files ending `.test.ts`, never
 * `.test.tsx` - no component is ever rendered by the suite. A rule that
 * lives in JSX is a rule nothing can test. Every judgment below - which
 * field leads the row, how the mask is worded, what "never used" means, what
 * an environment-backed row is even allowed to show - is a decision an
 * implementer would otherwise make once, silently, inside a page nothing
 * exercises. So it lives here instead, exactly as
 * ./account-people-view.ts's own header argues for the owner's account list.
 *
 * THIS MODULE READS NO ENVIRONMENT AND NO AMBIENT STATE. `LmsCredentialRowInput`
 * below is deliberately its own shape rather than an import of
 * `LmsCredentialSummary` (./lms-credentials.ts): that module reaches a real
 * database through a service-role client, and pure view modules in this
 * codebase import shared TYPES from other PURE modules, never from the
 * impure accessor whose row shape happens to line up today -
 * ./account-people-view.ts sets this precedent itself, importing `AccessRole`
 * / `AccessStatus` from ./access.ts (also pure) rather than `AppUserRow` from
 * ./supabase/app-users.ts (the impure accessor with the real database code).
 * Whoever assembles this module's input is expected to have already resolved
 * it from the caller's own stored rows and, for E10, the caller's own
 * environment-configured institutions - this module never resolves either
 * itself.
 *
 * E-UX5 - THE ROW'S IDENTITY IS THE CANVAS ACCOUNT, NOT THE MASK. E5 lists
 * five fields with no ranking, and an implementer left to their own devices
 * makes the masked token prominent - it is the most token-shaped field on the
 * row. That is backwards: four trailing characters are useless for
 * recognizing a credential six weeks from now, and a name is not. So
 * `LmsCredentialStoredRow.identityLabel` - built from the Canvas account name
 * the E4 probe recorded, falling back to the numeric Canvas id, falling back
 * to an explicit "not recorded" phrase only as a last, defensive resort - is
 * the field this module puts first, and it is the field a page should render
 * as the row's heading. The mask is `maskLabel`, further down the shape, on
 * purpose.
 *
 * E-UX6 - THE MASK IS WORDS, NOT ASTERISKS, AND HAS EXACTLY TWO PRODUCERS
 * THAT MUST NEVER DRIFT. `maskLabel` reads "Ends in 1a2b" - words, because a
 * run of asterisks is announced by a screen reader as eight punctuation
 * events or as nothing at all, depending on verbosity, and neither tells a
 * user anything. There are TWO places a Canvas token ever gets masked in this
 * feature: the DB-stored `token_last_four` column this list renders (DAT3 -
 * the list never decrypts to build a row), and `maskToken`
 * (./lms-credential-rules.ts) operating on a LIVE secret, used wherever the
 * plaintext is briefly available (e.g. an E4 confirmation step, before the
 * row this module renders even exists). Two independent implementations of
 * "turn some characters into a mask" is precisely the "two copies that must
 * agree" failure `lms-credential-rules.ts`'s own header warns about for the
 * address-classification rules, so `formatStoredCredentialMask` below and
 * `formatLiveCredentialMask` (exported for the confirmation-step caller to
 * use) both funnel through `revealedSuffixFrom`, which calls the REAL,
 * exported `maskToken` and never hardcodes any of its private constants
 * (`MASK_FILLER`, `REVEALED_SUFFIX_LENGTH`, `MIN_LENGTH_TO_REVEAL_SUFFIX` are
 * all unexported, and this module must not edit that file to export them) -
 * see `revealedSuffixFrom`'s own doc comment for exactly how.
 *
 * THE NO-SUFFIX CASE MUST NOT BE A VISUALLY DISTINCT PLACEHOLDER (E-UX6).
 * `maskToken` refuses to reveal a suffix at all for a too-short secret,
 * specifically so a short secret cannot be told apart from a long one by
 * whether its mask carries a suffix - a length oracle. If this module
 * rendered that case as something visually alarming ("--", "(invalid)"), it
 * would reintroduce exactly the oracle the threshold exists to remove: a
 * user (or an attacker who can trigger a save on someone else's behalf some
 * other way) would learn something about the underlying secret's length from
 * how the row LOOKS, not just from what it says. So the no-suffix phrase
 * (`NO_SUFFIX_MASK_LABEL`) is exactly as calm as the with-suffix one, in the
 * same established idiom this app already uses for "nothing to show, said
 * plainly" (`describeTokenSecret`'s "token: not on file", this app's
 * "(no name)" / "(no email on file)" placeholders). In practice this branch
 * is close to unreachable for a STORED row - `saveLmsCredential`
 * (./lms-credentials.ts) only ever writes a row after E4's probe already
 * proved the token works against Canvas, and no real Canvas personal access
 * token is short enough to hit maskToken's floor - but it is implemented and
 * tested rather than assumed away, because "close to unreachable" is not
 * "unreachable," and a function that silently produces something worse than
 * its own filler on a corrupt four-character value is a bug waiting for that
 * one row.
 *
 * SEC12 - THE HOST IS THE PUNYCODE FORM, NEVER PRETTIFIED. `hostFromBaseUrl`
 * below does exactly one thing: parse the stored `baseUrl` with `URL` and
 * read `.host` (not `.hostname` - a non-default port is part of the stored
 * identity, per `normalizeLmsBaseUrl`'s own reasoning in
 * ./lms-credential-rules.ts, and `.host` is the field that keeps it). It
 * never attempts to render a homograph registration's `xn--` form back into
 * the Unicode glyphs a user typed - `URL` itself never does that conversion,
 * so there is no "un-prettify" step to accidentally skip, only a "do not add
 * one" discipline to hold.
 *
 * DAT3 - "NEVER USED" IS A REAL, PERMANENT STATE, NOT A LOADING GAP. `last_
 * used_at` is stamped only by a SUCCESSFUL resolver use, never merely by an
 * attempt (./lms-credentials.ts's own doc comment on `touchLmsCredentialUsed`)
 * - so a credential that has never once been used to make a real Canvas call,
 * and a credential that used to work and has silently stopped, are
 * IDENTICAL in this column: both read `null`. This module does not invent a
 * "broken" state the data cannot support to paper over that gap. `lastUsed`
 * is a two-branch union - `{ kind: "never" }` or `{ kind: "at"; at: string }`
 * - with no third branch for a page to reach for, mirroring
 * `StatusActor`'s own "never" case in ./account-people-view.ts for the
 * identical reason: a type that cannot express a state this module has no
 * evidence for is what stops a future edit from inventing one anyway.
 *
 * NEEDS-REENTRY IS DERIVED FROM last_failure_kind, NOT FROM last_used_at. The
 * per-row "needs re-entry" signal comes from the E-REL6 diagnostic columns
 * (`last_failure_kind`), which is a different, later addition specifically
 * because DAT3 already ruled out inferring health from `last_used_at`'s
 * absence. Of the three possible kinds, only `"rejected"` (Canvas said the
 * token is no good) and `"unreadable"` (this process could not decrypt the
 * stored value - a rotated-past key, or tampering) mean a FRESH TOKEN would
 * fix the row, so only those two set `needsReentry: true`. `"host_
 * unreachable"` deliberately does NOT: it means the network layer never got
 * an answer on the credential's last use, which re-entering the same,
 * unbroken token cannot fix - flagging it as "needs re-entry" would send a
 * user through the replace-token flow for a problem no token can solve, and
 * this surface has exactly two pill states (AES-5: connected, or needs
 * re-entry) with no third for "temporarily unreachable" to occupy.
 *
 * E10 - AN ENVIRONMENT-BACKED ROW IS A DIFFERENT SHAPE, NOT THE SAME SHAPE
 * WITH FIELDS BLANKED OUT. `LmsCredentialRow` is a discriminated union on
 * `source` precisely so an "environment" row cannot be built carrying a mask,
 * a last-used state, or a Canvas identity it has no way to actually have -
 * none of those concepts apply to the owner's env-var fallback, which never
 * runs E4's probe and was never stored by ./lms-credentials.ts at all. A
 * single flat interface with those fields left `null` would let a future
 * edit render a blank "Last used" cell instead of omitting the concept
 * entirely, exactly the shape of invented state DAT3's own case warns
 * against one section up.
 */

import { maskToken } from "./lms-credential-rules";

// ============================================================================
// Input
// ============================================================================

/**
 * One stored credential, as the page reads it - field-for-field the same
 * facts `LmsCredentialSummary` (./lms-credentials.ts) carries, deliberately
 * redeclared here rather than imported (see the module doc comment) so this
 * module keeps zero import edges into anything that touches a database.
 */
export interface LmsCredentialStoredInput {
  readonly source: "stored";
  /** Bare acronym, already normalized (trim + uppercase) by the accessor. */
  readonly institution: string;
  /** The full stored origin, e.g. "https://canvas.example.edu" - already validated and normalized; never re-validated here. */
  readonly baseUrl: string;
  /** The last four characters of the raw token ONLY (DAT3) - never the leading characters, which encode the Canvas user id for a real Canvas token. */
  readonly tokenLastFour: string;
  /** From E4's mandatory verification probe. Nullable only defensively - see identityLabel below for why a missing value still renders something explicit. */
  readonly canvasUserId: string | null;
  readonly canvasUserName: string | null;
  /** When this row was first saved (created_at) - not re-formatted here; a page formats a raw ISO instant however its own date conventions require. */
  readonly createdAt: string;
  /** Stamped ONLY on a successful resolver use (DAT3) - null means "never used," not "unknown" or "broken". */
  readonly lastUsedAt: string | null;
  /**
   * The closed three-value diagnostic (E-REL6) - matches
   * `LmsCredentialFailureKind` in ./lms-credentials.ts, redeclared for the
   * same reason every other field here is. `null` means the most recent
   * attempt (if any) succeeded, or nothing has ever failed yet.
   */
  readonly lastFailureKind: "rejected" | "unreadable" | "host_unreachable" | null;
}

/**
 * A row backed by the deployment owner's own environment variables (E10) -
 * the pre-existing `<CODE>_CANVAS_URL` / `<CODE>_CANVAS_API_TOKEN` mechanism,
 * still the only path for the owner's existing setup (E6, E10). It was never
 * run through E4's probe and is not a row in `lms_credentials` at all, so
 * there is no Canvas identity, no mask, and no usage history to report - see
 * `LmsCredentialRow`'s own doc comment for why this is a distinct output
 * shape rather than the stored shape with fields blanked out.
 */
export interface LmsCredentialEnvironmentInput {
  readonly source: "environment";
  readonly institution: string;
  /** The env-configured host. Always present when this row is included at all - see the module doc comment's E10 section: a row exists here only because the URL env var is actually set. */
  readonly baseUrl: string;
}

export type LmsCredentialRowInput = LmsCredentialStoredInput | LmsCredentialEnvironmentInput;

// ============================================================================
// Output
// ============================================================================

/** DAT3: exactly two states, no invented third. See the module doc comment. */
export type LmsCredentialLastUsed = { readonly kind: "never" } | { readonly kind: "at"; readonly at: string };

/** A row backed by this user's own stored credential - every field E5 lists, plus the judgments this module makes about them. */
export interface LmsCredentialStoredRow {
  readonly source: "stored";
  readonly institution: string;
  /** E-UX5: leads the row. The Canvas account name, or a numeric fallback, or an explicit "not recorded" phrase - never blank. */
  readonly identityLabel: string;
  /** SEC12: the punycode host, exactly as parsed - never prettified. */
  readonly host: string;
  /** E-UX6: words, e.g. "Ends in 1a2b" - never asterisks, and the no-suffix case is not a visually distinct placeholder. */
  readonly maskLabel: string;
  /** Raw ISO instant this credential was first saved - a page formats it. */
  readonly addedAt: string;
  readonly lastUsed: LmsCredentialLastUsed;
  /** True only for "rejected" or "unreadable" - see the module doc comment for why "host_unreachable" is deliberately excluded. */
  readonly needsReentry: boolean;
  readonly hasControls: true;
}

/** A row backed by the owner's environment configuration (E10) - no controls, because there is no per-user credential here to replace or delete. */
export interface LmsCredentialEnvironmentRow {
  readonly source: "environment";
  readonly institution: string;
  readonly host: string;
  readonly hasControls: false;
}

export type LmsCredentialRow = LmsCredentialStoredRow | LmsCredentialEnvironmentRow;

// ============================================================================
// The mask - one shared derivation, two producers
// ============================================================================

/**
 * The calm, explicit phrase for "a token is on file, but this module has
 * nothing further to reveal about it" - the no-suffix case E-UX6 requires be
 * exactly as unremarkable as the with-suffix phrasing. Deliberately worded
 * like `describeTokenSecret`'s own "token: on file" (./lms-credential-
 * rules.ts) rather than inventing new vocabulary for the same concept.
 */
export const NO_SUFFIX_MASK_LABEL = "Token on file";

/**
 * The revealed suffix `maskToken` would show for `candidate`, or `null` when
 * `maskToken` would show pure filler with nothing revealed - derived ENTIRELY
 * by calling the real, exported `maskToken` twice (once with an empty
 * string, guaranteed too short to ever reveal anything, and once with the
 * real candidate) and diffing the two results. This is what lets both
 * producers below share `maskToken`'s own `MASK_FILLER`, `REVEALED_SUFFIX_
 * LENGTH` and `MIN_LENGTH_TO_REVEAL_SUFFIX` constants without importing any
 * of them - they are private to ./lms-credential-rules.ts, and this module
 * must not edit that file to export them. A function with no copied
 * constants of its own cannot drift from the thing it is copying, because it
 * never copied anything in the first place.
 */
function revealedSuffixFrom(candidate: string): string | null {
  const pureFiller = maskToken("");
  const masked = maskToken(candidate);
  return masked === pureFiller ? null : masked.slice(pureFiller.length);
}

/**
 * Producer 1: a LIVE secret (the plaintext token, briefly available - e.g.
 * an E4 confirmation step before this row is ever saved). Thin wrapper
 * around `maskToken` itself, converting its asterisk-filler shape into
 * E-UX6's words form. Exported so that confirmation-step caller shares this
 * module's wording instead of reimplementing it.
 */
export function formatLiveCredentialMask(secret: unknown): string {
  const suffix = typeof secret === "string" ? revealedSuffixFrom(secret) : null;
  return suffix === null ? NO_SUFFIX_MASK_LABEL : `Ends in ${suffix}`;
}

/**
 * Producer 2: the DB-stored `token_last_four` (DAT3 - this list never
 * decrypts to build a row). `token_last_four` is only ever the trailing
 * characters of an already-Canvas-verified token, never the whole secret, so
 * this cannot ask `maskToken`'s own length gate the question it was built to
 * answer ("was the ORIGINAL secret long enough"). Instead it asks a
 * narrower, answerable question: "are there four real characters to show at
 * all" - padded with synthetic filler well past any plausible reveal
 * threshold so `maskToken`'s gate clears, then verified to guard against the
 * one failure mode that padding trick could ever cause: if a future change
 * to ./lms-credential-rules.ts ever grew `REVEALED_SUFFIX_LENGTH` past the
 * four real characters this function actually has, `masked` would start
 * pulling in synthetic padding as if it were real - `real.endsWith(revealed)`
 * is what catches that and falls back to no reveal instead of ever
 * presenting a fabricated character as part of the real token.
 */
export function formatStoredCredentialMask(tokenLastFour: unknown): string {
  const real = typeof tokenLastFour === "string" ? tokenLastFour : "";
  if (real === "") {
    return NO_SUFFIX_MASK_LABEL;
  }
  const candidate = "0".repeat(64) + real;
  const revealed = revealedSuffixFrom(candidate);
  if (revealed !== null && real.endsWith(revealed)) {
    return `Ends in ${revealed}`;
  }
  return NO_SUFFIX_MASK_LABEL;
}

// ============================================================================
// Building the rows
// ============================================================================

/** SEC12: the punycode host as `URL` itself parsed it - `.host` (not `.hostname`) keeps a non-default port, matching `normalizeLmsBaseUrl`'s own reasoning. Falls back to the raw stored string only if it somehow fails to parse, which should not happen for an already-validated, already-stored value - a defensive floor, not an expected path. */
function hostFromBaseUrl(baseUrl: string): string {
  try {
    return new URL(baseUrl).host;
  } catch {
    return baseUrl;
  }
}

/**
 * E-UX5: the Canvas account name, falling back to the numeric id, falling
 * back to an explicit phrase - never blank, and never the mask. The name is
 * preferred because it is what a person actually recognizes six weeks later;
 * the numeric id is the second-best identifying fact this row has; the final
 * phrase only fires when neither is present, which should not happen for a
 * row `saveLmsCredential` wrote (it always supplies `canvasUserId`) but is
 * handled rather than assumed away, per this module's own "nullable only
 * defensively" comment on the input shape.
 */
function identityLabelFor(canvasUserId: string | null, canvasUserName: string | null): string {
  const trimmedName = typeof canvasUserName === "string" ? canvasUserName.trim() : "";
  if (trimmedName !== "") {
    return trimmedName;
  }
  const trimmedId = typeof canvasUserId === "string" ? canvasUserId.trim() : "";
  if (trimmedId !== "") {
    return `Canvas user ${trimmedId}`;
  }
  return "Canvas account not recorded";
}

function lastUsedFor(lastUsedAt: string | null): LmsCredentialLastUsed {
  return lastUsedAt === null ? { kind: "never" } : { kind: "at", at: lastUsedAt };
}

/** See the module doc comment's "NEEDS-REENTRY IS DERIVED FROM last_failure_kind" section for why "host_unreachable" is excluded on purpose. */
function needsReentryFor(lastFailureKind: LmsCredentialStoredInput["lastFailureKind"]): boolean {
  return lastFailureKind === "rejected" || lastFailureKind === "unreadable";
}

function buildStoredRow(input: LmsCredentialStoredInput): LmsCredentialStoredRow {
  return {
    source: "stored",
    institution: input.institution,
    identityLabel: identityLabelFor(input.canvasUserId, input.canvasUserName),
    host: hostFromBaseUrl(input.baseUrl),
    maskLabel: formatStoredCredentialMask(input.tokenLastFour),
    addedAt: input.createdAt,
    lastUsed: lastUsedFor(input.lastUsedAt),
    needsReentry: needsReentryFor(input.lastFailureKind),
    hasControls: true,
  };
}

function buildEnvironmentRow(input: LmsCredentialEnvironmentInput): LmsCredentialEnvironmentRow {
  return {
    source: "environment",
    institution: input.institution,
    host: hostFromBaseUrl(input.baseUrl),
    hasControls: false,
  };
}

/**
 * Sort key: institution ascending (already normalized to uppercase by the
 * accessor, but compared case-insensitively regardless so this module never
 * depends on that), then `"stored"` before `"environment"` as a defensive
 * tiebreak for the case both exist for the same institution (a stored
 * per-user credential coexisting with the owner's still-configured env
 * fallback for that same acronym) - the row backed by a REAL, replaceable
 * credential is the more actionable one and leads.
 */
function compareRows(a: LmsCredentialRowInput, b: LmsCredentialRowInput): number {
  const institutionCompare = a.institution.toUpperCase().localeCompare(b.institution.toUpperCase());
  if (institutionCompare !== 0) {
    return institutionCompare;
  }
  if (a.source === b.source) {
    return 0;
  }
  return a.source === "stored" ? -1 : 1;
}

/**
 * Builds every row E5's list shows: this user's own stored credentials plus,
 * for an owner whose deployment still relies on it, the environment-backed
 * institutions E10 says are a distinct, control-free case. Sorted by
 * institution so the list order does not depend on whatever order the
 * caller's own queries happened to return rows in.
 */
export function buildLmsCredentialRows(inputs: readonly LmsCredentialRowInput[]): LmsCredentialRow[] {
  return [...inputs]
    .sort(compareRows)
    .map((input) => (input.source === "stored" ? buildStoredRow(input) : buildEnvironmentRow(input)));
}
