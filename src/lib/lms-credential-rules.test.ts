import { describe, expect, it } from "vitest";
import {
  describeTokenSecret,
  maskToken,
  normalizeLmsBaseUrl,
  validateLmsBaseUrl,
} from "./lms-credential-rules";

/**
 * Contract tests for per-user LMS credential input (docs/lms-credentials-
 * acceptance-criteria.md).
 *
 * WHY THIS MODULE EXISTS AT ALL. Today a Canvas token comes from
 * `process.env[CODE_CANVAS_API_TOKEN]`, where CODE is a string the CLIENT
 * supplies from localStorage (src/lib/canvas-core.ts:165-205,
 * src/lib/institutions.ts:13-14). Letting signed-in users bring their own
 * token removes that, but it replaces it with a URL the SERVER will fetch
 * while carrying a bearer token - which is a server-side request forgery
 * primitive handed to us by the user, on purpose.
 *
 * So validation here is not input hygiene. It is the security boundary, and
 * these tests are written against the bypasses that are actually used:
 * alternate IP encodings, the cloud metadata endpoint, credentials in the
 * authority, and hosts that are not routable at all.
 *
 * Every assertion below is unchanged from before the E-ARCH5 extraction
 * (2026-09-06): the IPv4/IPv6 special-purpose-address rules this file
 * exercises through `validateLmsBaseUrl` now live in `./lms-address-
 * rules.ts`, imported by this module rather than duplicated, but this test
 * file still only calls the exports below - it never imports the leaf
 * module directly, so it keeps proving what a CALLER of `validateLmsBaseUrl`
 * observes rather than proving the leaf agrees with itself.
 */

describe("validateLmsBaseUrl - what may be saved", () => {
  it("accepts an ordinary institutional Canvas host over https", () => {
    for (const url of [
      "https://canvas.mccneb.edu",
      "https://canvas.mccneb.edu/",
      "https://mycollege.instructure.com",
      "https://canvas.sub.domain.example.edu",
    ]) {
      expect(validateLmsBaseUrl(url).ok, `${url} should be accepted`).toBe(true);
    }
  });

  it("refuses plaintext http - the token would be on the wire", () => {
    const result = validateLmsBaseUrl("http://canvas.mccneb.edu");
    expect(result.ok).toBe(false);
    expect(result.ok === false && result.reason.trim().length).toBeGreaterThan(0);
  });

  it("refuses any scheme that is not https", () => {
    for (const url of [
      "ftp://canvas.example.edu",
      "file:///etc/passwd",
      "javascript:alert(1)",
      "gopher://canvas.example.edu",
      "data:text/plain,hi",
    ]) {
      expect(validateLmsBaseUrl(url).ok, `${url} must be refused`).toBe(false);
    }
  });

  it("refuses input that is not a URL at all", () => {
    for (const url of ["", "   ", "canvas.mccneb.edu", "not a url", null, undefined, 42]) {
      expect(validateLmsBaseUrl(url as never).ok, `${String(url)} must be refused`).toBe(
        false
      );
    }
  });
});

describe("validateLmsBaseUrl - the SSRF boundary", () => {
  it("refuses loopback in every spelling", () => {
    for (const host of [
      "localhost",
      "LOCALHOST",
      "127.0.0.1",
      "127.1",
      "127.0.0.2",
      "[::1]",
      "0.0.0.0",
    ]) {
      expect(
        validateLmsBaseUrl(`https://${host}`).ok,
        `${host} must be refused`
      ).toBe(false);
    }
  });

  it("refuses the cloud metadata endpoint", () => {
    // The single highest-value SSRF target on a hosted deployment: it hands
    // out the platform's own credentials to anything that can make it fetch.
    for (const host of ["169.254.169.254", "metadata.google.internal", "169.254.170.2"]) {
      expect(validateLmsBaseUrl(`https://${host}`).ok, `${host} must be refused`).toBe(
        false
      );
    }
  });

  it("refuses RFC1918 private ranges", () => {
    for (const host of [
      "10.0.0.1",
      "10.255.255.255",
      "192.168.1.1",
      "172.16.0.1",
      "172.31.255.255",
      "169.254.1.1",
    ]) {
      expect(validateLmsBaseUrl(`https://${host}`).ok, `${host} must be refused`).toBe(
        false
      );
    }
  });

  it("accepts a public address that merely looks adjacent to a private range", () => {
    // 172.32.x is public; a sloppy "172." prefix check would refuse it and a
    // sloppy range check would let 172.16.x through.
    expect(validateLmsBaseUrl("https://172.32.0.1").ok).toBe(true);
    expect(validateLmsBaseUrl("https://11.0.0.1").ok).toBe(true);
  });

  it("refuses alternate encodings of a loopback address", () => {
    // 2130706433 and 0x7f000001 and 0177.0.0.1 are all 127.0.0.1. A guard
    // that only string-matches "127." lets every one of these through.
    for (const host of ["2130706433", "0x7f000001", "0177.0.0.1", "017700000001"]) {
      expect(validateLmsBaseUrl(`https://${host}`).ok, `${host} must be refused`).toBe(
        false
      );
    }
  });

  it("refuses IPv6 private and mapped forms", () => {
    for (const host of ["[::ffff:127.0.0.1]", "[fc00::1]", "[fe80::1]", "[::]"]) {
      expect(validateLmsBaseUrl(`https://${host}`).ok, `${host} must be refused`).toBe(
        false
      );
    }
  });

  it("refuses a host that cannot be public", () => {
    for (const host of ["intranet", "canvas", "canvas.local", "canvas.internal"]) {
      expect(validateLmsBaseUrl(`https://${host}`).ok, `${host} must be refused`).toBe(
        false
      );
    }
  });

  it("refuses credentials embedded in the authority", () => {
    // https://canvas.example.edu@evil.example.com is a request to evil, and
    // it reads as the institution's host to a human.
    for (const url of [
      "https://user:pass@canvas.example.edu",
      "https://canvas.example.edu@evil.example.com",
      "https://canvas.example.edu%40evil.example.com",
    ]) {
      expect(validateLmsBaseUrl(url).ok, `${url} must be refused`).toBe(false);
    }
  });

  it("refuses a path, query or fragment - this is a base URL, not a link", () => {
    for (const url of [
      "https://canvas.example.edu/courses/1",
      "https://canvas.example.edu?next=x",
      "https://canvas.example.edu#frag",
      "https://canvas.example.edu/api/v1",
    ]) {
      expect(validateLmsBaseUrl(url).ok, `${url} must be refused`).toBe(false);
    }
  });

  it("explains every refusal in terms a person could act on", () => {
    for (const url of ["http://canvas.example.edu", "https://127.0.0.1", "nonsense"]) {
      const result = validateLmsBaseUrl(url);
      expect(result.ok).toBe(false);
      expect(
        result.ok === false && result.reason.trim().length,
        `${url} needs a reason`
      ).toBeGreaterThan(0);
    }
  });
});

describe("normalizeLmsBaseUrl", () => {
  it("stores one canonical form so two spellings are one credential", () => {
    for (const raw of [
      "https://Canvas.MCCNEB.edu",
      "https://canvas.mccneb.edu/",
      "  https://canvas.mccneb.edu  ",
      "https://canvas.mccneb.edu//",
    ]) {
      expect(normalizeLmsBaseUrl(raw)).toBe("https://canvas.mccneb.edu");
    }
  });

  it("keeps an explicit non-default port, which is part of the identity", () => {
    expect(normalizeLmsBaseUrl("https://canvas.example.edu:8443/")).toBe(
      "https://canvas.example.edu:8443"
    );
  });

  it("drops a redundant default port", () => {
    expect(normalizeLmsBaseUrl("https://canvas.example.edu:443/")).toBe(
      "https://canvas.example.edu"
    );
  });
});

describe("maskToken - the token never comes back to the browser", () => {
  it("reveals at most the last four characters", () => {
    const masked = maskToken("1234~abcdefghijklmnopqrstuvwxyz0987");
    expect(masked).toContain("0987");
    expect(masked).not.toContain("abcdefghij");
    expect(masked.length).toBeLessThanOrEqual(16);
  });

  it("never reveals the leading characters, which identify the Canvas account", () => {
    // A Canvas token starts with the user id and a tilde.
    const masked = maskToken("70000000012345~abcdefghijklmnop");
    expect(masked).not.toContain("70000000012345");
    expect(masked).not.toContain("7000");
  });

  it("does not echo a short secret through its own masked form", () => {
    // The empty string is deliberately NOT in this list. Every JavaScript
    // string contains "", so `not.toContain("")` is unsatisfiable by any
    // return value - it would assert nothing at all while looking like a
    // guarantee. The empty case is covered by the length property below,
    // which is what it was always really about.
    for (const token of ["abc", "abcd", "abcde"]) {
      const masked = maskToken(token);
      expect(masked, `masked form of ${JSON.stringify(token)}`).not.toContain(token);
    }
  });

  it("renders every too-short secret identically, so the mask is not a length oracle", () => {
    // If a three-character secret masked differently from a five-character
    // one, the mask would measure the secret for anyone who could see it.
    // An empty secret masks the same way for the same reason - telling
    // present from absent is describeTokenSecret's job, not this one's.
    const masked = ["", "a", "abc", "abcd", "abcde"].map((token) => maskToken(token));
    expect(new Set(masked).size, `distinct masks: ${JSON.stringify(masked)}`).toBe(1);
  });

  it("is total for input that is not a string", () => {
    for (const value of [null, undefined, 42, {}]) {
      expect(typeof maskToken(value as never)).toBe("string");
    }
  });
});

describe("describeTokenSecret - nothing sensitive reaches a log line", () => {
  it("never returns the secret itself, whatever it is asked about", () => {
    const secret = "1234~SUPERSECRETTOKENVALUE";
    const described = describeTokenSecret(secret);
    expect(described).not.toContain(secret);
    expect(described).not.toContain("SUPERSECRET");
  });

  it("distinguishes present from absent without revealing either", () => {
    expect(describeTokenSecret("1234~abc")).not.toBe(describeTokenSecret(""));
  });
});
