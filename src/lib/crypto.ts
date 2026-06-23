// Symmetric encryption for secrets at rest (currently the Google OAuth tokens in
// the google_credentials table). AES-256-GCM with a key supplied via the
// GOOGLE_TOKEN_ENC_KEY environment variable. Server-only (uses Node's crypto).

import { createCipheriv, createDecipheriv, randomBytes } from "crypto";

const ALGORITHM = "aes-256-gcm";

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
 * Encrypt a UTF-8 string. The output is `iv:authTag:ciphertext`, each part
 * base64-encoded, so it round-trips cleanly through a text column.
 */
export function encryptSecret(plaintext: string): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv(ALGORITHM, getKey(), iv);
  const encrypted = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  const authTag = cipher.getAuthTag();
  return [iv.toString("base64"), authTag.toString("base64"), encrypted.toString("base64")].join(":");
}

/** Reverse of {@link encryptSecret}. Throws if the payload was tampered with. */
export function decryptSecret(payload: string): string {
  const [ivB64, tagB64, dataB64] = payload.split(":");
  if (!ivB64 || !tagB64 || !dataB64) {
    throw new Error("Malformed encrypted secret.");
  }
  const decipher = createDecipheriv(ALGORITHM, getKey(), Buffer.from(ivB64, "base64"));
  decipher.setAuthTag(Buffer.from(tagB64, "base64"));
  return Buffer.concat([
    decipher.update(Buffer.from(dataB64, "base64")),
    decipher.final(),
  ]).toString("utf8");
}
