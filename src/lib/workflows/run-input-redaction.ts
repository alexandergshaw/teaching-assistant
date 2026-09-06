// Redaction and size-capping for workflow run diagnostics BEFORE they are
// ever written to workflow_run_steps.inputs / workflow_runs.field_values.
// Both columns back a DOWNLOADABLE log file an instructor can email around,
// so nothing sensitive may reach the database in the first place -
// redacting at render time would already be too late (the raw value would
// have sat in storage, in backups, in any admin query, before a formatter
// ever ran). This module is the ONE chokepoint both the unattended runner
// (server-runner.ts) and the attended runner (useWorkflowRun.ts) go through
// - see run-logging.ts's logStepOutcome/safeStartWorkflowRun, which are
// themselves the ONE chokepoint both runners already share for logging.
//
// Two independent risks named in this feature's brief, two independent
// defenses:
//
//   1. Credential-shaped values (API tokens, Canvas access tokens, GitHub
//      PATs, JWTs, ...) - caught by KEY NAME (a field literally called
//      "token"/"apiKey"/"secret"/...) AND by VALUE SHAPE (a string that
//      LOOKS like a token even under an innocuous key name - e.g. a
//      "notes" field a user pasted a credential into by mistake). Either
//      match redacts the WHOLE value with a marker - never a partial mask
//      (a visible prefix/suffix is still enough to narrow a brute force, or
//      to identify which secret it was).
//   2. File/binary payloads - a File/Blob-like input (an "uploads" field),
//      or a raw base64 data-URL string, is reduced to name/type/size (or
//      just a byte count for a bare data URL) - the CONTENT is never
//      written, regardless of size or whether it would have fit under the
//      length cap anyway.
//
// Independently of both, every rendered value is length-capped
// (MAX_VALUE_CHARS) and the whole per-call payload is capped
// (MAX_TOTAL_CHARS) - a step that received a multi-page pasted submission,
// or a run whose field values include a long "longtext" field, must not
// blow up the log row. Both caps leave an EXPLICIT marker showing how much
// was dropped, per this feature's AC2 - never a silent cut.
//
// A key is NEVER omitted from the result once it is present in the input
// object, even once the total-cap budget is exhausted (the value just
// becomes an "(omitted - cap reached)" marker) - see AC1's core rule that
// an absent line and an empty value must stay distinguishable. Applying
// that same "never omit the key" discipline to the total cap means a
// reader can always see which inputs a step resolved, even once their
// values were too large to keep.

/** Per-value cap: an individual resolved input's rendered string is cut to
 * this length before anything else, with a trailing marker showing how many
 * characters were dropped. Generous enough to keep a normal value (a
 * course name, a repo slug, a short prompt) completely intact, small enough
 * that one runaway "longtext" field cannot dominate the log. */
export const MAX_VALUE_CHARS = 500;

/** Total cap across every value recorded for one call (one step's resolved
 * inputs, or one run's field values) - bounds the worst case (many inputs,
 * each near MAX_VALUE_CHARS) independently of the per-value cap. */
export const MAX_TOTAL_CHARS = 4000;

/** Marker stored in place of a value whose key name or shape looks
 * credential-shaped. Deliberately generic (not "this held a GitHub token")
 * - see the value-shape doc below for why not naming which pattern matched
 * would itself be a data-shape hint about the secret's origin. */
const CREDENTIAL_MARKER = "[REDACTED]";

/** What a truly absent/empty resolved value renders as - see AC1: this must
 * be a visible line, distinguishable from the input key never appearing in
 * the object at all (which this module does not affect - the caller only
 * ever hands in keys that were actually part of what a step/run resolved). */
const EMPTY_MARKER = "(empty)";

// ---------------------------------------------------------------------------
// Key-name redaction
// ---------------------------------------------------------------------------

// Deliberately narrow substrings, checked against a normalized (lowercased,
// punctuation-stripped) key so "api-key"/"api_key"/"apiKey" all match
// "apikey" alike. "auth" is intentionally NOT in this list even though it
// would catch "authToken": bare "auth" as a substring also matches this
// codebase's own StepRunHelpers.author field, and false-redacting a
// document author's name is exactly the kind of over-eager match that would
// erode trust in the feature. "token"/"secret" alone already catch
// "authToken"/"clientSecret"/etc without that collision.
const CREDENTIAL_KEY_SUBSTRINGS = [
  "token",
  "secret",
  "password",
  "pwd",
  "credential",
  "apikey",
  "accesskey",
  "privatekey",
  "bearer",
] as const;

function normalizeKey(key: string): string {
  return key.toLowerCase().replace(/[^a-z0-9]/g, "");
}

/** True when a key NAME alone marks its value as credential-shaped, e.g.
 * "canvasApiToken", "GITHUB_SECRET", "db-password". Checked independently
 * of the value's own shape (isCredentialShapedValue below) - either one
 * redacts. */
export function isCredentialKeyName(key: string): boolean {
  const normalized = normalizeKey(key);
  return CREDENTIAL_KEY_SUBSTRINGS.some((s) => normalized.includes(s));
}

// ---------------------------------------------------------------------------
// Value-shape redaction
// ---------------------------------------------------------------------------

// Known credential formats, matched regardless of the key they were stored
// under - this is the defense for "the field was named something innocuous
// but a token ended up in it anyway".
const CREDENTIAL_VALUE_PATTERNS: RegExp[] = [
  /^bearer\s+\S+/i, // an Authorization-header-shaped value pasted whole
  /^(ghp|gho|ghu|ghs|ghr)_[A-Za-z0-9]{20,}$/, // GitHub personal/app tokens
  /^github_pat_[A-Za-z0-9_]{20,}$/, // GitHub fine-grained PAT
  /^sk-(ant-)?[A-Za-z0-9_-]{16,}$/i, // OpenAI/Anthropic-style secret keys
  /^(pk|rk)_[A-Za-z0-9]{16,}$/i, // Stripe-style publishable/restricted keys
  /^AKIA[0-9A-Z]{16}$/, // AWS access key id
  /^[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}$/, // JWT
  /^\d+~[A-Za-z0-9]{10,}$/, // Canvas-style "<id>~<opaque>" access token
];

// A 32-hex-digit value (with or without the standard hyphen positions) is a
// UUID - course/user/tile ids in this app take this shape and are meant to
// be visible in the log (buildRunLogText already prints course/step ids in
// the clear). Excluded from the generic opaque-secret heuristic below so
// this feature does not regress that.
const UUID_SHAPE = /^[0-9a-f]{8}-?[0-9a-f]{4}-?[0-9a-f]{4}-?[0-9a-f]{4}-?[0-9a-f]{12}$/i;

/** Generic fallback for a long opaque token that does not match any known
 * provider's format: length >= 32, no whitespace, drawn only from the
 * base64url-ish alphabet, not a UUID, and mixing at least two of
 * {lowercase, uppercase, digit} - the entropy signature of a generated
 * secret. A plain lowercase-hex hash (a git SHA, a checksum) stays
 * unredacted on purpose: those are not secret, and ARE useful diagnostic
 * evidence, so a heuristic that swallowed them too would cost more than it
 * protects. */
function looksLikeOpaqueSecret(value: string): boolean {
  if (value.length < 32) return false;
  if (UUID_SHAPE.test(value)) return false;
  if (!/^[A-Za-z0-9_.-]+$/.test(value)) return false;
  const classes = [/[a-z]/.test(value), /[A-Z]/.test(value), /[0-9]/.test(value)].filter(Boolean).length;
  return classes >= 2 && /[A-Z]/.test(value);
}

/** True when a value's own SHAPE looks like a credential, independent of
 * the key it was stored under. */
export function isCredentialShapedValue(value: string): boolean {
  return CREDENTIAL_VALUE_PATTERNS.some((re) => re.test(value)) || looksLikeOpaqueSecret(value);
}

// ---------------------------------------------------------------------------
// Embedded-secret scrubbing (unanchored) - for FREE TEXT, not whole values
// ---------------------------------------------------------------------------

// isCredentialShapedValue above is ANCHORED (`^...$`): it only fires when an
// entire value IS a token. That is the right rule for a resolved input,
// which is either a token or it is not. It is the WRONG rule for a step's
// `error`/`summary` string or an onProgress message, because that is exactly
// where a token reaches this system embedded in a sentence rather than
// standing alone - e.g. an upstream Canvas rejection quoting the value it
// rejected ("Canvas rejected 1234~abcdef...: 401") or a fetch error quoting
// the URL it dialled (which can itself carry a token/key as a query
// parameter). A whole-string match against that sentence never fires, so the
// token survives into workflow_run_steps.error and then verbatim into the
// downloadable run log (buildRunLogText's renderStep) - the exact path this
// module's own header warns is "already too late" once anything sensitive
// reaches storage.
//
// redactEmbeddedSecrets below is the unanchored counterpart, modelled on
// src/lib/lms-generation/generation-diag.ts's redactSensitiveText: several
// independent, narrow, global patterns, each applied with .replace() so only
// the MATCHED SUBSTRING is removed and everything around it survives -
// deliberately NOT swapping the whole string for CREDENTIAL_MARKER the way
// isCredentialKeyName/isCredentialShapedValue do. Flattening the whole
// message would destroy the one thing a user needs to act on a Canvas
// failure: whether their token was unreadable, rejected, or the host was
// unreachable is a STATUS, not a secret, and this feature's diagnostic work
// elsewhere exists specifically to keep those three distinguishable. So
// "Canvas rejected your token: [REDACTED]" is the target shape, never
// "[REDACTED]".
//
// Every pattern below is a straight sequence of bounded, non-overlapping
// character classes with a fixed literal or `\b` boundary between them - no
// nested quantifiers (`(a+)+`), no ambiguous alternation inside a repeated
// group - so matching is linear in the input length regardless of content.
// This runs on every step of every workflow run, against attacker-reachable
// text (an upstream host's own error body), so a catastrophically
// backtracking pattern here would be a self-inflicted denial of service;
// see run-input-redaction.test.ts's "very long input" case for a check that
// this stays fast against a large adversarial string.
const EMBEDDED_SECRET_MARKER = "[REDACTED]";

// Whole-match patterns: the entire match IS the secret, so the whole match is
// replaced. Same provider shapes as CREDENTIAL_VALUE_PATTERNS above, minus
// the `^`/`$` anchors and plus a `g` flag (global - the same message can
// quote a token more than once, e.g. once in a URL and once in a body) and
// `\b` word boundaries (so, e.g., the GitHub-token pattern cannot match the
// tail end of a longer unrelated identifier that merely contains "ghp_").
const EMBEDDED_SECRET_PATTERNS: RegExp[] = [
  /\b(?:ghp|gho|ghu|ghs|ghr)_[A-Za-z0-9]{20,255}\b/g, // GitHub personal/app tokens
  /\bgithub_pat_[A-Za-z0-9_]{20,255}\b/g, // GitHub fine-grained PAT
  /\bsk-(?:ant-)?[A-Za-z0-9_-]{16,255}\b/gi, // OpenAI/Anthropic-style secret keys
  /\b(?:pk|rk)_[A-Za-z0-9]{16,255}\b/gi, // Stripe-style publishable/restricted keys
  /\bAKIA[0-9A-Z]{16}\b/g, // AWS access key id
  /\b[A-Za-z0-9_-]{10,255}\.[A-Za-z0-9_-]{10,255}\.[A-Za-z0-9_-]{10,255}\b/g, // JWT (e.g. a Supabase service-role/anon key)
  // Canvas-style "<id>~<opaque>" access token - THE pattern SEC4 named: the
  // anchored version above can never match this shape once it is quoted
  // inside a sentence, which is exactly how it reaches an error message.
  //
  // NO LEADING \b, deliberately. A word boundary on the left requires the
  // character before the token to be a NON-word character, so a token
  // butted straight against preceding text (`...id=abc70000000012345~xyz`,
  // or any error that concatenates without a separator) would not match at
  // all and would be stored verbatim. A scrubber for a secret must not
  // depend on the secret being politely delimited. Found 2026-09-06 by a
  // test that placed a token directly after a run of letters; it survived
  // scrubbing entirely.
  //
  // Dropping the left boundary can only make this match MORE, never less,
  // and the shape is specific enough that over-matching is not a real
  // risk: it still requires digits, a tilde, and at least ten
  // alphanumerics. Starting mid-number redacts the same secret, just from
  // one character later.
  /\d+~[A-Za-z0-9]{10,255}\b/g,
];

// "Authorization: Bearer <token>" (or a bare "Bearer <token>" fragment) -
// captures the "Bearer " prefix so it survives the replace, since the scheme
// name itself carries no secret and is useful context ("this failure came
// from an authenticated call"). Bounded to one non-whitespace run so it
// cannot run away across an entire multi-line body.
const EMBEDDED_BEARER_PATTERN = /\b(bearer\s+)\S{1,255}/gi;

// A token/key handed as a URL query parameter - e.g. an upstream error that
// echoes the request it rejected. Mirrors generation-diag.ts's
// KEY_PARAM_PATTERN shape exactly (capture the delimiter, replace only the
// value), extended with the parameter names Canvas/Supabase URLs actually
// use ("access_token" is Canvas's own OAuth query param name; "apikey" is
// PostgREST/Supabase's).
const EMBEDDED_KEY_PARAM_PATTERN = /([?&](?:access_token|api[-_]?key|token|secret)=)[^&\s"'<>]{1,500}/gi;

/** Scrub every recognizable secret SUBSTRING out of a free-text string,
 * leaving everything else untouched - the counterpart to
 * isCredentialShapedValue for text that is a SENTENCE which might quote a
 * token, not a value that IS one. Used at the run-logging chokepoint
 * (run-logging.ts) for a step's error/summary/progress text, never for
 * `redactRunInputs`'s own resolved-input values (those already get the
 * stronger whole-value treatment above).
 *
 * Defensive like the rest of this module's public surface: a non-string
 * input (should not happen given this repo's types, but this function must
 * never be the thing that turns a logging bug into a thrown error) renders
 * as "" rather than throwing; an empty string is returned unchanged. */
export function redactEmbeddedSecrets(text: unknown): string {
  if (typeof text !== "string" || text.length === 0) return typeof text === "string" ? text : "";
  let out = text;
  for (const pattern of EMBEDDED_SECRET_PATTERNS) {
    out = out.replace(pattern, EMBEDDED_SECRET_MARKER);
  }
  out = out.replace(EMBEDDED_BEARER_PATTERN, `$1${EMBEDDED_SECRET_MARKER}`);
  out = out.replace(EMBEDDED_KEY_PARAM_PATTERN, `$1${EMBEDDED_SECRET_MARKER}`);
  return out;
}

// ---------------------------------------------------------------------------
// File / binary payloads
// ---------------------------------------------------------------------------

interface FileLike {
  name: string;
  type: string;
  size: number;
}

/** Duck-typed File/Blob detection - deliberately NOT `instanceof File`
 * (Node's global File is undici-provided and not guaranteed present in
 * every runtime this module loads in; a structural check works identically
 * client-side and server-side). Matches the browser File shape a step's
 * "uploads" input resolves to (see useWorkflowRun.ts's
 * `uploadFiles[binding.fieldKey]`). */
function isFileLike(value: unknown): value is FileLike {
  if (!value || typeof value !== "object") return false;
  const v = value as Record<string, unknown>;
  if (typeof v.name !== "string" || typeof v.type !== "string" || typeof v.size !== "number") return false;
  return typeof (v as { arrayBuffer?: unknown }).arrayBuffer === "function" || typeof (v as { stream?: unknown }).stream === "function";
}

function fileMetadata(f: FileLike): string {
  return `[file: ${f.name || "(unnamed)"}, ${f.type || "unknown type"}, ${f.size} bytes]`;
}

const DATA_URL_PATTERN = /^data:([^;,]+);base64,/i;

/** A raw base64 data URL string (not wrapped in a File object) - reduced to
 * its declared mime type and character count, never the payload itself. */
function dataUrlMetadata(value: string): string {
  const match = value.match(DATA_URL_PATTERN);
  const mime = match ? match[1] : "unknown";
  return `[file data omitted - ${mime}, ${value.length} base64 characters]`;
}

// ---------------------------------------------------------------------------
// Recursive sanitizer
// ---------------------------------------------------------------------------

// A step's resolved input can be a nested structure (a prior step's
// structured output threaded in as this step's input - e.g. a schedule
// plan, a list of table rows), so redaction must walk it, not just
// top-level string values. Capped depth so a pathological/circular-ish
// structure cannot make this walk unbounded; anything deeper renders as a
// generic marker rather than being spelled out (still fully safe - it just
// stops being detailed, which is the correct trade against DoS-by-payload).
const MAX_DEPTH = 4;

function sanitizeString(value: string): string {
  if (DATA_URL_PATTERN.test(value)) return dataUrlMetadata(value);
  if (isCredentialShapedValue(value)) return CREDENTIAL_MARKER;
  return value;
}

function sanitizeValue(value: unknown, depth: number): unknown {
  if (value === null || value === undefined) return value;
  if (isFileLike(value)) return fileMetadata(value);
  if (typeof value === "string") return sanitizeString(value);
  if (typeof value === "number" || typeof value === "boolean") return value;
  if (Array.isArray(value)) {
    if (depth >= MAX_DEPTH) return "[nested array omitted]";
    return value.map((v) => sanitizeValue(v, depth + 1));
  }
  if (typeof value === "object") {
    if (depth >= MAX_DEPTH) return "[nested object omitted]";
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      out[k] = isCredentialKeyName(k) ? CREDENTIAL_MARKER : sanitizeValue(v, depth + 1);
    }
    return out;
  }
  // function, symbol, bigint - none expected in a resolved input, but never
  // let an unrecognized runtime type reach JSON.stringify unguarded.
  return String(value);
}

/** Sanitized value -> the single-line-friendly display string stored/
 * rendered for one input key. A plain string passes through as-is (so the
 * common case - a course name, a repo slug - reads naturally, not
 * JSON-quoted); anything else is JSON-stringified (JSON.stringify escapes
 * embedded newlines, so the result is always one physical line even when
 * the pre-JSON value was not). Empty renders as EMPTY_MARKER, never as "",
 * "[]", or "{}" - AC1's "empty must be visible, not blank-looking". */
function stringifyForLog(value: unknown): string {
  if (value === null || value === undefined) return EMPTY_MARKER;
  if (typeof value === "string") return value.trim() === "" ? EMPTY_MARKER : value;
  if (Array.isArray(value)) {
    if (value.length === 0) return EMPTY_MARKER;
    try {
      return JSON.stringify(value);
    } catch {
      return String(value);
    }
  }
  if (typeof value === "object") {
    if (Object.keys(value as object).length === 0) return EMPTY_MARKER;
    try {
      return JSON.stringify(value);
    } catch {
      return String(value);
    }
  }
  return String(value); // number/boolean
}

function capValueLength(rendered: string): string {
  if (rendered.length <= MAX_VALUE_CHARS) return rendered;
  const dropped = rendered.length - MAX_VALUE_CHARS;
  return `${rendered.slice(0, MAX_VALUE_CHARS)} [truncated, ${dropped} more character(s) dropped]`;
}

function renderEntry(key: string, value: unknown): string {
  // A credential-shaped KEY redacts the ENTIRE value outright, before any
  // recursive walk - even if the value is itself a nested object, nothing
  // about it (not even its shape) is worth partially exposing once its own
  // field name says "this holds a secret".
  if (isCredentialKeyName(key)) return CREDENTIAL_MARKER;
  return capValueLength(stringifyForLog(sanitizeValue(value, 0)));
}

// ---------------------------------------------------------------------------
// Public entry point
// ---------------------------------------------------------------------------

/** Redact + cap a flat key/value map of resolved inputs (a step's
 * `resolvedInputs`, or a run's runtime field values) into the small,
 * display-ready, already-safe shape that gets stored verbatim in
 * workflow_run_steps.inputs / workflow_runs.field_values. Returns null for
 * a null/undefined/empty input - a step or run with nothing resolved gets
 * no inputs section at all (see buildRunLogText), rather than an empty
 * object rendered as noise. Every key present on `inputs` is ALSO present
 * on the result (see this module's header comment on why a key is never
 * omitted, even once the total cap is reached) - only the VALUE ever
 * changes to a marker. */
export function redactRunInputs(inputs: Record<string, unknown> | null | undefined): Record<string, string> | null {
  if (!inputs) return null;
  const keys = Object.keys(inputs);
  if (keys.length === 0) return null;

  const out: Record<string, string> = {};
  let budget = MAX_TOTAL_CHARS;
  for (const key of keys) {
    if (budget <= 0) {
      out[key] = `(omitted - step input payload cap of ${MAX_TOTAL_CHARS} characters reached)`;
      continue;
    }
    const rendered = renderEntry(key, inputs[key]);
    if (rendered.length > budget) {
      const fit = rendered.slice(0, budget);
      out[key] = `${fit} [truncated - step input payload cap reached, ${rendered.length - fit.length} more character(s) dropped]`;
      budget = 0;
    } else {
      out[key] = rendered;
      budget -= rendered.length;
    }
  }
  return out;
}
