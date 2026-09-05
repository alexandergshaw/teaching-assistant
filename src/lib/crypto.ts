// Symmetric encryption for secrets at rest (currently the Google and Microsoft
// OAuth tokens; a per-user Canvas API token is planned to go through this same
// module). AES-256-GCM with a key supplied via the GOOGLE_TOKEN_ENC_KEY
// environment variable. Server-only (uses Node's crypto).
//
// The payload format is versioned: encryptSecret writes "v1:iv:tag:ciphertext"
// (each part base64). This is deliberate future-proofing for key rotation -
// the standard response to a suspected key compromise. Today decryptSecret
// only knows how to unwrap the "v1" format (plus the legacy unversioned format
// below), but because the version tag is already on every newly written row,
// adding a "v2" branch later - e.g. one that tries a new key and falls back to
// an old one - is a code change in this file only, not a data migration of
// every already-encrypted row. This module deliberately does NOT add a second
// key env var or a key-id column yet; that is left for whenever a rotation is
// actually needed.
//
// decryptSecret also still accepts the original unversioned "iv:tag:ciphertext"
// format (no leading "v1:") produced before this format existed, so every row
// already in the database keeps decrypting with no migration required.

import { createCipheriv, createDecipheriv, randomBytes } from "crypto";

const ALGORITHM = "aes-256-gcm";
const CURRENT_VERSION = "v1";

function getKey(): Buffer {
  const raw = process.env.GOOGLE_TOKEN_ENC_KEY;
  if (!raw) {
    throw new Error("Missing environment variable: GOOGLE_TOKEN_ENC_KEY");
  }
  const key = Buffer.from(raw, "base64");
  if (key.length !== 32) {
    throw new Error(
      "GOOGLE_TOKEN_ENC_KEY must decode to 32 bytes. Generate one with: openssl rand -base64 32"
    );
  }
  return key;
}

/**
 * Encrypt a UTF-8 string. The output is `v1:iv:authTag:ciphertext`, each part
 * base64-encoded, so it round-trips cleanly through a text column. See the
 * module header for why the version tag is there.
 */
export function encryptSecret(plaintext: string): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv(ALGORITHM, getKey(), iv);
  const encrypted = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  const authTag = cipher.getAuthTag();
  return [
    CURRENT_VERSION,
    iv.toString("base64"),
    authTag.toString("base64"),
    encrypted.toString("base64"),
  ].join(":");
}

/**
 * Reverse of {@link encryptSecret}. Throws if the payload was tampered with,
 * was encrypted under a different key, or is malformed.
 *
 * Accepts both the current versioned format ("v1:iv:tag:ciphertext") and the
 * legacy unversioned format ("iv:tag:ciphertext") that every row predating
 * this format was written with - see the module header.
 */
export function decryptSecret(payload: string): string {
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

  const decipher = createDecipheriv(ALGORITHM, getKey(), Buffer.from(ivB64, "base64"));
  decipher.setAuthTag(Buffer.from(tagB64, "base64"));
  return Buffer.concat([
    decipher.update(Buffer.from(dataB64, "base64")),
    decipher.final(),
  ]).toString("utf8");
}
