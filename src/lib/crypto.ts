// Symmetric encryption for secrets at rest (the Google and Microsoft OAuth
// tokens, and now a per-user Canvas API token - see src/lib/lms-credentials.ts).
// AES-256-GCM with a key supplied via the GOOGLE_TOKEN_ENC_KEY environment
// variable. Server-only (uses Node's crypto).
//
// NAMING DEBT, FLAGGED RATHER THAN FIXED HERE: the environment variable is
// still named GOOGLE_TOKEN_ENC_KEY even though it now encrypts Google,
// Microsoft AND Canvas secrets for every tenant (see SEC8 in
// docs/lms-credentials-acceptance-criteria.md). It is not renamed in this
// change because src/lib/google-credentials.ts and
// src/lib/microsoft-credentials.ts both read it directly and neither is in
// this change's file set - renaming here would silently break both. Renaming
// it (e.g. to SECRET_ENC_KEY, with GOOGLE_TOKEN_ENC_KEY read as a fallback
// for one deploy cycle) is follow-up work, and it matters beyond tidiness: an
// operator reading an incident runbook that says "rotate GOOGLE_TOKEN_ENC_KEY"
// while Canvas credentials are actively leaking will reasonably conclude
// Canvas is unaffected, which is false.
//
// The payload format is versioned: encryptSecret writes "v1:iv:tag:ciphertext"
// (each part base64). decryptSecret accepts both that and the legacy
// unversioned "iv:tag:ciphertext" format written before this format existed,
// so every row already in the database keeps decrypting with no migration
// required.
//
// KEY ROTATION (SEC8 / E-REL5). Before this change, decrypting with a
// rotated key was indistinguishable from "tampered" or "never connected" -
// the standard response to a suspected key compromise (rotate the key) would
// have destroyed every stored credential for every user across all three
// providers, silently, with nothing to notice it happening.
//
// decryptSecret now also accepts GOOGLE_TOKEN_ENC_KEY_PREVIOUS: if decrypting
// under the CURRENT key fails for any reason, and a previous key is
// configured, decryptSecret retries once under the previous key before
// giving up. encryptSecret NEVER reads or writes under the previous key - a
// fresh write always moves a row forward onto the current key, so rotation
// is self-healing: every credential re-encrypts onto the new key the next
// time its owner uses or replaces it, rather than needing a bulk migration.
//
// THE ROTATION RUNBOOK, since none existed anywhere in this repo before now:
//   1. Generate a new key (openssl rand -base64 32).
//   2. Set GOOGLE_TOKEN_ENC_KEY_PREVIOUS to the CURRENT (soon to be old)
//      value of GOOGLE_TOKEN_ENC_KEY, and set GOOGLE_TOKEN_ENC_KEY to the new
//      value, in the SAME deploy. Order matters: if the new key goes out
//      first without the previous var, every row encrypted under the old key
//      fails to decrypt until this step completes.
//   3. Deploy. Every read of a not-yet-rotated row now succeeds via the
//      previous-key fallback below; every write (a token replaced, a refresh
//      token rotated by Google/Microsoft) moves that row onto the new key.
//   4. Wait for normal traffic to touch (and so re-encrypt) the credentials
//      that matter, or force it by re-saving them.
//   5. Once satisfied, remove GOOGLE_TOKEN_ENC_KEY_PREVIOUS. Any row that was
//      never re-touched decrypts as "tampered/unreadable" from that point on
//      and its owner is asked to reconnect - the same fail-closed shape a
//      compromised key should always have had.
//
// AAD (additional authenticated data, SEC7). Both functions take an OPTIONAL
// third-argument-shaped `aad` parameter, used to cryptographically bind a
// ciphertext to the row it lives in (e.g. `${userId}:${institution}`) so a
// blob copied into the wrong row fails to authenticate instead of decrypting
// into a working token for someone else's account. It is optional, not
// required, because google-credentials.ts and microsoft-credentials.ts call
// encryptSecret/decryptSecret with no AAD today and are NOT part of this
// change's file set - an optional parameter with no default behavior change
// is what lets them keep compiling and behaving identically, while a new
// caller (lms-credentials.ts) opts in. AAD is never stored in the payload
// itself (GCM does not require that): the caller must supply the exact same
// `aad` string on decrypt that it used on encrypt, derived from context it
// already has (the row's own primary key), not from anything read out of the
// ciphertext.
//
// WHY THIS MODULE STILL DOES NOT ADD A KEY-ID COLUMN: the version prefix
// already on every row is what makes the previous-key retry above a one-file
// change with no schema change and no data migration - decryptSecret simply
// tries "current, then previous" rather than needing a column to tell it
// which key a given row was written under. A key-id column would only earn
// its cost if this module ever needed to support MORE than one rotation in
// flight at a time, which nothing here does.

import { createCipheriv, createDecipheriv, randomBytes } from "crypto";

const ALGORITHM = "aes-256-gcm";
const CURRENT_VERSION = "v1";

/** Decode and length-check a base64-encoded 32-byte key, naming which env var it came from in any error so a misconfiguration is diagnosable without guessing. */
function decodeKey(raw: string, envVarName: string): Buffer {
  const key = Buffer.from(raw, "base64");
  if (key.length !== 32) {
    throw new Error(`${envVarName} must decode to 32 bytes. Generate one with: openssl rand -base64 32`);
  }
  return key;
}

function getKey(): Buffer {
  const raw = process.env.GOOGLE_TOKEN_ENC_KEY;
  if (!raw) {
    throw new Error("Missing environment variable: GOOGLE_TOKEN_ENC_KEY");
  }
  return decodeKey(raw, "GOOGLE_TOKEN_ENC_KEY");
}

/**
 * The key a row may have been encrypted under before the most recent
 * rotation - see the module header's runbook. Returns null (never throws for
 * "unset") when the variable is absent, because that is the ordinary,
 * non-rotating steady state for almost every deploy - decryptSecret must not
 * require this var just to decrypt a normal row. When the variable IS set
 * but does not decode to a 32-byte key, that is a real misconfiguration
 * (someone half-finished a rotation) and this throws, exactly like getKey()
 * does for the current key.
 */
function getPreviousKey(): Buffer | null {
  const raw = process.env.GOOGLE_TOKEN_ENC_KEY_PREVIOUS;
  if (!raw) return null;
  return decodeKey(raw, "GOOGLE_TOKEN_ENC_KEY_PREVIOUS");
}

/**
 * Encrypt a UTF-8 string. The output is `v1:iv:authTag:ciphertext`, each part
 * base64-encoded, so it round-trips cleanly through a text column. See the
 * module header for why the version tag is there, and for why this always
 * encrypts under the CURRENT key only - never the previous one, so every
 * write moves a row forward during a rotation rather than re-entrenching the
 * old key.
 *
 * `aad` (optional - see the module header's SEC7 section) is authenticated
 * but not encrypted: GCM mixes it into the auth tag so decrypting with a
 * different (or absent) `aad` fails, without the ciphertext growing to carry
 * it.
 */
export function encryptSecret(plaintext: string, aad?: string): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv(ALGORITHM, getKey(), iv);
  if (aad !== undefined) {
    cipher.setAAD(Buffer.from(aad, "utf8"));
  }
  const encrypted = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  const authTag = cipher.getAuthTag();
  return [
    CURRENT_VERSION,
    iv.toString("base64"),
    authTag.toString("base64"),
    encrypted.toString("base64"),
  ].join(":");
}

/** Split a payload into its base64 parts, or throw "Malformed encrypted secret." Shared by decryptSecret's single parse step, run once before either key is ever touched. */
function parsePayload(payload: string): { ivB64: string; tagB64: string; dataB64: string } {
  const parts = payload.split(":");

  let ivB64: string | undefined;
  let tagB64: string | undefined;
  let dataB64: string | undefined;

  if (parts.length === 4 && parts[0] === CURRENT_VERSION) {
    [, ivB64, tagB64, dataB64] = parts;
  } else if (parts.length === 3) {
    // Legacy, unversioned payload.
    [ivB64, tagB64, dataB64] = parts;
  }

  // dataB64 legitimately IS the empty string when the plaintext was empty
  // (AES-GCM ciphertext is the same length as the plaintext - see
  // crypto.test.ts), so only reject it when the split produced no segment at
  // all. iv and tag are always fixed, non-zero lengths, so they stay a
  // simple truthiness check.
  if (!ivB64 || !tagB64 || dataB64 === undefined) {
    throw new Error("Malformed encrypted secret.");
  }

  return { ivB64, tagB64, dataB64 };
}

/** Attempt one decrypt under a specific key. Throws on any authentication failure - wrong key, tampered ciphertext, tampered tag, or mismatched `aad` all surface as the same Node crypto error, by design of AES-GCM itself; see decryptSecret's own doc comment for what that costs. */
function decryptWithKey(key: Buffer, ivB64: string, tagB64: string, dataB64: string, aad?: string): string {
  const decipher = createDecipheriv(ALGORITHM, key, Buffer.from(ivB64, "base64"));
  if (aad !== undefined) {
    decipher.setAAD(Buffer.from(aad, "utf8"));
  }
  decipher.setAuthTag(Buffer.from(tagB64, "base64"));
  return Buffer.concat([decipher.update(Buffer.from(dataB64, "base64")), decipher.final()]).toString("utf8");
}

/**
 * Reverse of {@link encryptSecret}. Throws if the payload was tampered with,
 * was encrypted under a key this process cannot resolve, or is malformed.
 *
 * Accepts both the current versioned format ("v1:iv:tag:ciphertext") and the
 * legacy unversioned format ("iv:tag:ciphertext") that every row predating
 * this format was written with - see the module header.
 *
 * KEY ROTATION: tries the current key first; if that fails for ANY reason
 * and GOOGLE_TOKEN_ENC_KEY_PREVIOUS is configured, retries once under the
 * previous key before giving up. This CANNOT and does not try to distinguish
 * "encrypted under the previous key" from "tampered" or "wrong AAD" - AES-GCM
 * authentication failure is one opaque outcome, not a diagnosis, so a
 * tampered row and a merely-not-yet-rotated row look identical to this
 * function up until the retry either succeeds or also fails. The cost of
 * that is small in practice: every caller of decryptSecret in this codebase
 * already collapses ANY failure (wrong key, tampered data, no key configured
 * at all) into the same "could not read this credential, ask the user to
 * reconnect" outcome, so a sharper diagnosis here would have nowhere to go
 * even if this function could produce one.
 *
 * `aad` must match whatever was passed to {@link encryptSecret} for this
 * exact payload, or authentication fails under BOTH keys - a payload
 * encrypted with no `aad` must be decrypted with no `aad` too.
 */
export function decryptSecret(payload: string, aad?: string): string {
  const { ivB64, tagB64, dataB64 } = parsePayload(payload);

  try {
    return decryptWithKey(getKey(), ivB64, tagB64, dataB64, aad);
  } catch (currentKeyError) {
    const previousKey = getPreviousKey();
    if (previousKey === null) {
      throw currentKeyError;
    }
    // Deliberately not wrapped in its own try/catch: if this also throws,
    // that IS the final answer - propagate it as-is rather than re-wrapping
    // or preferring the first error, so a caller's catch block sees whatever
    // Node's crypto module actually raised.
    return decryptWithKey(previousKey, ivB64, tagB64, dataB64, aad);
  }
}
