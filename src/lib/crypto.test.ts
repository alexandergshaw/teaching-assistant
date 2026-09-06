import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createCipheriv, randomBytes } from "crypto";
import { encryptSecret, decryptSecret } from "./crypto";

/**
 * Contract tests for the app's only secret-encryption helper. Written from
 * the bug report against src/lib/crypto.ts: BUG 2 there added a version tag
 * ("v1:iv:tag:ciphertext") to the payload so a future key rotation is a code
 * change rather than a data migration, while every already-stored legacy
 * ("iv:tag:ciphertext") row must keep decrypting unchanged. These tests pin
 * both formats plus the tamper-detection properties AES-256-GCM is chosen
 * for, since this module is about to start protecting every user's Canvas
 * API token in addition to the Google/Microsoft OAuth tokens it already
 * guards.
 */

const TEST_KEY = randomBytes(32).toString("base64");
const ORIGINAL_KEY = process.env.GOOGLE_TOKEN_ENC_KEY;
const ORIGINAL_PREVIOUS_KEY = process.env.GOOGLE_TOKEN_ENC_KEY_PREVIOUS;

beforeEach(() => {
  process.env.GOOGLE_TOKEN_ENC_KEY = TEST_KEY;
  delete process.env.GOOGLE_TOKEN_ENC_KEY_PREVIOUS;
});

afterEach(() => {
  if (ORIGINAL_KEY === undefined) delete process.env.GOOGLE_TOKEN_ENC_KEY;
  else process.env.GOOGLE_TOKEN_ENC_KEY = ORIGINAL_KEY;
  if (ORIGINAL_PREVIOUS_KEY === undefined) delete process.env.GOOGLE_TOKEN_ENC_KEY_PREVIOUS;
  else process.env.GOOGLE_TOKEN_ENC_KEY_PREVIOUS = ORIGINAL_PREVIOUS_KEY;
});

/**
 * Build a payload in the OLD, unversioned format ("iv:tag:ciphertext") using
 * the same primitives encryptSecret uses, so the "legacy row" fixture is
 * genuinely produced the way rows already in the database were - not just
 * asserted to look right.
 */
function encryptLegacy(plaintext: string): string {
  const key = Buffer.from(TEST_KEY, "base64");
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key, iv);
  const encrypted = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  const authTag = cipher.getAuthTag();
  return [iv.toString("base64"), authTag.toString("base64"), encrypted.toString("base64")].join(":");
}

describe("encryptSecret / decryptSecret - round trip", () => {
  it("returns the original plaintext", () => {
    const plaintext = "ya29.a0AfH6SMC-example-refresh-token";
    expect(decryptSecret(encryptSecret(plaintext))).toBe(plaintext);
  });

  it("round-trips unicode", () => {
    const plaintext = "sécrèt éè 日本語 \u0000 \u{1f600}";
    expect(decryptSecret(encryptSecret(plaintext))).toBe(plaintext);
  });

  it("round-trips an empty string", () => {
    expect(decryptSecret(encryptSecret(""))).toBe("");
  });
});

describe("encryptSecret - fresh IV per call", () => {
  it("produces different ciphertext for the same plaintext on repeated calls", () => {
    const plaintext = "same-secret-both-times";
    const a = encryptSecret(plaintext);
    const b = encryptSecret(plaintext);
    expect(a).not.toBe(b);
    // Both still decrypt to the same plaintext, so the difference is only the
    // random IV (and the ciphertext/tag that follow from it), not a bug.
    expect(decryptSecret(a)).toBe(plaintext);
    expect(decryptSecret(b)).toBe(plaintext);
  });
});

describe("decryptSecret - tamper detection", () => {
  it("fails to authenticate a tampered ciphertext rather than returning garbage", () => {
    const payload = encryptSecret("do not leak this");
    const [version, iv, tag, data] = payload.split(":");
    const bytes = Buffer.from(data, "base64");
    bytes[0] ^= 0xff; // flip a bit in the ciphertext
    const tampered = [version, iv, tag, bytes.toString("base64")].join(":");

    expect(() => decryptSecret(tampered)).toThrow();
  });

  it("fails to authenticate a tampered auth tag", () => {
    const payload = encryptSecret("do not leak this either");
    const [version, iv, tag, data] = payload.split(":");
    const bytes = Buffer.from(tag, "base64");
    bytes[0] ^= 0xff; // flip a bit in the auth tag
    const tampered = [version, iv, bytes.toString("base64"), data].join(":");

    expect(() => decryptSecret(tampered)).toThrow();
  });
});

describe("decryptSecret - legacy unversioned payload", () => {
  it("still decrypts a payload produced by the old iv:tag:ciphertext format", () => {
    const plaintext = "a token encrypted before versioning existed";
    const legacyPayload = encryptLegacy(plaintext);

    // Confirm the fixture really is in the old, unversioned shape (three
    // parts, no "v1" tag) before relying on it to prove backward compatibility.
    expect(legacyPayload.split(":")).toHaveLength(3);

    expect(decryptSecret(legacyPayload)).toBe(plaintext);
  });
});

describe("decryptSecret - malformed payload", () => {
  it("rejects an empty string with a clear error, not a crash", () => {
    expect(() => decryptSecret("")).toThrow("Malformed encrypted secret.");
  });

  it("rejects a payload with too few parts", () => {
    expect(() => decryptSecret("onlyonepart")).toThrow("Malformed encrypted secret.");
    expect(() => decryptSecret("two:parts")).toThrow("Malformed encrypted secret.");
  });

  it("rejects a payload with an unrecognized version tag", () => {
    const payload = encryptSecret("whatever");
    const parts = payload.split(":");
    parts[0] = "v2";
    expect(() => decryptSecret(parts.join(":"))).toThrow("Malformed encrypted secret.");
  });

  it("rejects a payload with too many parts", () => {
    const payload = encryptSecret("whatever");
    expect(() => decryptSecret(`${payload}:extra`)).toThrow("Malformed encrypted secret.");
  });

  it("rejects non-base64 segments instead of crashing uncontrollably", () => {
    expect(() => decryptSecret("v1:not-base64!!:not-base64!!:not-base64!!")).toThrow();
  });
});

describe("decryptSecret - wrong key", () => {
  it("throws rather than returning plaintext when the key does not match", () => {
    const payload = encryptSecret("token encrypted under the original key");
    process.env.GOOGLE_TOKEN_ENC_KEY = randomBytes(32).toString("base64");
    expect(() => decryptSecret(payload)).toThrow();
  });
});

describe("decryptSecret - previous-key rotation (SEC8 / E-REL5)", () => {
  it("decrypts a row written under the OLD key once it is set as GOOGLE_TOKEN_ENC_KEY_PREVIOUS and a new key is current", () => {
    const oldKey = TEST_KEY;
    const payload = encryptSecret("token encrypted before rotation");

    // Simulate the rotation runbook: a new key becomes current, the old one
    // moves to the PREVIOUS var - in the same step, per the module header.
    const newKey = randomBytes(32).toString("base64");
    process.env.GOOGLE_TOKEN_ENC_KEY = newKey;
    process.env.GOOGLE_TOKEN_ENC_KEY_PREVIOUS = oldKey;

    expect(decryptSecret(payload)).toBe("token encrypted before rotation");
  });

  it("still decrypts a row written under the CURRENT key even when a previous key is also configured", () => {
    process.env.GOOGLE_TOKEN_ENC_KEY_PREVIOUS = randomBytes(32).toString("base64");
    const payload = encryptSecret("fresh token, current key");
    expect(decryptSecret(payload)).toBe("fresh token, current key");
  });

  it("never encrypts under the previous key - a fresh write always targets the current key", () => {
    const oldKey = TEST_KEY;
    const newKey = randomBytes(32).toString("base64");
    process.env.GOOGLE_TOKEN_ENC_KEY = newKey;
    process.env.GOOGLE_TOKEN_ENC_KEY_PREVIOUS = oldKey;

    const payload = encryptSecret("written mid-rotation");

    // Decrypts fine under the current key with no previous-key var at all.
    delete process.env.GOOGLE_TOKEN_ENC_KEY_PREVIOUS;
    expect(decryptSecret(payload)).toBe("written mid-rotation");
  });

  it("throws when the payload matches neither the current nor the previous key", () => {
    const payload = encryptSecret("token under a since-discarded key");
    process.env.GOOGLE_TOKEN_ENC_KEY = randomBytes(32).toString("base64");
    process.env.GOOGLE_TOKEN_ENC_KEY_PREVIOUS = randomBytes(32).toString("base64");
    expect(() => decryptSecret(payload)).toThrow();
  });

  it("throws (does not silently succeed) when GOOGLE_TOKEN_ENC_KEY_PREVIOUS is set but malformed", () => {
    const payload = encryptSecret("whatever");
    process.env.GOOGLE_TOKEN_ENC_KEY = randomBytes(32).toString("base64"); // current key now wrong on purpose
    process.env.GOOGLE_TOKEN_ENC_KEY_PREVIOUS = "not-32-bytes";
    expect(() => decryptSecret(payload)).toThrow(/GOOGLE_TOKEN_ENC_KEY_PREVIOUS must decode to 32 bytes/);
  });
});

describe("encryptSecret / decryptSecret - aad (SEC7 row binding)", () => {
  it("round-trips when the same aad is supplied on both ends", () => {
    const payload = encryptSecret("bound to a row", "user-1:MCC");
    expect(decryptSecret(payload, "user-1:MCC")).toBe("bound to a row");
  });

  it("fails to authenticate when decrypted with a DIFFERENT aad than it was encrypted with", () => {
    const payload = encryptSecret("bound to a row", "user-1:MCC");
    expect(() => decryptSecret(payload, "user-2:MCC")).toThrow();
  });

  it("fails to authenticate when the aad is dropped on decrypt", () => {
    const payload = encryptSecret("bound to a row", "user-1:MCC");
    expect(() => decryptSecret(payload)).toThrow();
  });

  it("fails to authenticate when an aad is supplied on decrypt but none was used on encrypt", () => {
    const payload = encryptSecret("no aad at encrypt time");
    expect(() => decryptSecret(payload, "user-1:MCC")).toThrow();
  });

  it("is optional and defaults to today's no-aad behavior, so existing callers are unaffected", () => {
    // google-credentials.ts and microsoft-credentials.ts call these two
    // functions with no third argument at all - this pins that shape keeps
    // working exactly as before aad existed.
    const payload = encryptSecret("legacy caller, no aad");
    expect(decryptSecret(payload)).toBe("legacy caller, no aad");
  });

  it("combines with previous-key rotation: the retried decrypt under the previous key also honors aad", () => {
    const oldKey = TEST_KEY;
    const payload = encryptSecret("bound and rotated", "user-3:UNL");

    const newKey = randomBytes(32).toString("base64");
    process.env.GOOGLE_TOKEN_ENC_KEY = newKey;
    process.env.GOOGLE_TOKEN_ENC_KEY_PREVIOUS = oldKey;

    expect(decryptSecret(payload, "user-3:UNL")).toBe("bound and rotated");
    expect(() => decryptSecret(payload, "user-4:UNL")).toThrow();
  });
});

describe("AES-GCM ciphertext length", () => {
  it("preserves plaintext length, so the ciphertext leaks how long the secret is", () => {
    // This is a real, documented property of AES-GCM (a stream-cipher mode):
    // it does not pad, so the base64 ciphertext segment's decoded length
    // tracks the plaintext's byte length exactly. Anything that stores or
    // logs encryptSecret's output alongside metadata should treat the
    // secret's length as observable, not hidden by encryption.
    for (const plaintext of ["", "a", "a".repeat(16), "a".repeat(1000)]) {
      const payload = encryptSecret(plaintext);
      const dataB64 = payload.split(":")[3];
      const ciphertextLength = Buffer.from(dataB64, "base64").length;
      expect(ciphertextLength).toBe(Buffer.byteLength(plaintext, "utf8"));
    }
  });
});
