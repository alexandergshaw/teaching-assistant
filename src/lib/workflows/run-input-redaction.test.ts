import { describe, it, expect } from "vitest";
import {
  redactRunInputs,
  isCredentialKeyName,
  isCredentialShapedValue,
  MAX_VALUE_CHARS,
  MAX_TOTAL_CHARS,
} from "./run-input-redaction";

// Fake File-like object - a duck-typed stand-in for the browser File class
// (see run-input-redaction.ts's isFileLike), since the vitest environment
// used here does not guarantee a global File constructor identical to the
// browser's.
function fakeFile(overrides: Partial<{ name: string; type: string; size: number }> = {}) {
  return {
    name: overrides.name ?? "notes.pdf",
    type: overrides.type ?? "application/pdf",
    size: overrides.size ?? 2048,
    arrayBuffer: async () => new ArrayBuffer(0),
  };
}

describe("redactRunInputs", () => {
  // -------------------------------------------------------------------
  // AC1 - never omitted, empty is visible
  // -------------------------------------------------------------------

  it("returns null for null/undefined/empty input (no inputs section at all)", () => {
    expect(redactRunInputs(null)).toBeNull();
    expect(redactRunInputs(undefined)).toBeNull();
    expect(redactRunInputs({})).toBeNull();
  });

  it("renders an empty string value as the visible (empty) marker, never dropping the key", () => {
    const result = redactRunInputs({ repo: "" });
    expect(result).not.toBeNull();
    expect(result!.repo).toBe("(empty)");
    expect(Object.keys(result!)).toContain("repo");
  });

  it("renders null/undefined/empty-array/empty-object values as (empty), key still present", () => {
    const result = redactRunInputs({ a: null, b: undefined, c: [], d: {} });
    expect(result).toEqual({ a: "(empty)", b: "(empty)", c: "(empty)", d: "(empty)" });
  });

  it("passes a non-empty plain string through unchanged", () => {
    const result = redactRunInputs({ courseName: "Prescriptive AI" });
    expect(result!.courseName).toBe("Prescriptive AI");
  });

  it("keeps distinct keys distinct - an absent key never appears (only keys actually resolved get a line)", () => {
    const result = redactRunInputs({ repo: "org/repo" });
    expect(Object.keys(result!)).toEqual(["repo"]);
  });

  // -------------------------------------------------------------------
  // AC2 - redaction by KEY NAME
  // -------------------------------------------------------------------

  describe("redaction by key name", () => {
    it("redacts common credential-shaped key names regardless of value", () => {
      const result = redactRunInputs({
        apiToken: "harmless-looking-value",
        canvasApiKey: "harmless-looking-value",
        clientSecret: "harmless-looking-value",
        dbPassword: "harmless-looking-value",
        pwd: "harmless-looking-value",
        accessKey: "harmless-looking-value",
        privateKey: "harmless-looking-value",
        credential: "harmless-looking-value",
        bearerToken: "harmless-looking-value",
      });
      for (const key of Object.keys(result!)) {
        expect(result![key]).toBe("[REDACTED]");
      }
    });

    it("matches regardless of separator style (camelCase, snake_case, kebab-case, SCREAMING_CASE)", () => {
      for (const key of ["apiToken", "api_token", "api-token", "API_TOKEN", "ApiToken"]) {
        expect(isCredentialKeyName(key)).toBe(true);
      }
    });

    it("does NOT redact a field merely because it contains a substring like 'auth' - avoids false-positiving on 'author'", () => {
      expect(isCredentialKeyName("author")).toBe(false);
      const result = redactRunInputs({ author: "Jane Doe" });
      expect(result!.author).toBe("Jane Doe");
    });

    it("does not redact ordinary field names", () => {
      for (const key of ["repo", "institution", "courseName", "dueDate", "notes"]) {
        expect(isCredentialKeyName(key)).toBe(false);
      }
    });

    it("redacts a credential-shaped key nested inside an object value, at any depth", () => {
      const result = redactRunInputs({ config: { nested: { token: "harmless-looking-value" }, ok: "fine" } });
      const parsed = JSON.parse(result!.config);
      expect(parsed.nested.token).toBe("[REDACTED]");
      expect(parsed.ok).toBe("fine");
    });
  });

  // -------------------------------------------------------------------
  // AC2 - redaction by VALUE SHAPE (independent of key name)
  // -------------------------------------------------------------------

  describe("redaction by value shape", () => {
    it("redacts a GitHub personal access token even under an innocuous key name", () => {
      const result = redactRunInputs({ notes: "ghp_abcdefghijklmnopqrstuvwxyz0123456789" });
      expect(result!.notes).toBe("[REDACTED]");
    });

    it("redacts a GitHub fine-grained PAT", () => {
      expect(isCredentialShapedValue("github_pat_11ABCDEFG0abcdefghijklmnopqrstuvwxyz")).toBe(true);
    });

    it("redacts an OpenAI/Anthropic-style secret key", () => {
      expect(isCredentialShapedValue("sk-ant-api03-abcdefghijklmnopqrstuvwxyz")).toBe(true);
      expect(isCredentialShapedValue("sk-abcdefghijklmnopqrstuvwxyz")).toBe(true);
    });

    it("redacts an AWS access key id", () => {
      expect(isCredentialShapedValue("AKIAIOSFODNN7EXAMPLE")).toBe(true);
    });

    it("redacts a JWT (three dot-separated segments)", () => {
      const jwt = "eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxMjM0NTY3ODkwIn0.dQw4w9WgXcQ_examplesignature123";
      expect(isCredentialShapedValue(jwt)).toBe(true);
    });

    it("redacts a Canvas-style '<id>~<opaque>' access token", () => {
      expect(isCredentialShapedValue("11224~AbCdEfGh1234567890abcdefghijklmnopqrstuvwxyz")).toBe(true);
    });

    it("redacts a 'Bearer <token>' value", () => {
      expect(isCredentialShapedValue("Bearer abc.def.ghi")).toBe(true);
    });

    it("does NOT redact a plain course/user UUID - those are meant to be visible in the log", () => {
      expect(isCredentialShapedValue("1c41b131-f052-4da6-a077-ae5178271cea")).toBe(false);
      const result = redactRunInputs({ courseId: "1c41b131-f052-4da6-a077-ae5178271cea" });
      expect(result!.courseId).toBe("1c41b131-f052-4da6-a077-ae5178271cea");
    });

    it("does NOT redact a plain lowercase-hex hash (e.g. a git SHA) - not secret, and useful evidence", () => {
      const sha = "a".repeat(40); // shape of a sha1 hex digest
      expect(isCredentialShapedValue(sha)).toBe(false);
    });

    it("does not redact an ordinary short value or sentence", () => {
      expect(isCredentialShapedValue("Prescriptive AI")).toBe(false);
      expect(isCredentialShapedValue("org/repo")).toBe(false);
      expect(isCredentialShapedValue("2026-07-30")).toBe(false);
    });
  });

  // -------------------------------------------------------------------
  // AC2 - file/base64 payloads never stored
  // -------------------------------------------------------------------

  describe("file and binary payloads", () => {
    it("reduces a File-like value to name/type/size metadata, never its content", () => {
      const result = redactRunInputs({ upload: fakeFile({ name: "roster.csv", type: "text/csv", size: 4096 }) });
      expect(result!.upload).toBe("[file: roster.csv, text/csv, 4096 bytes]");
    });

    it("reduces an array of File-like values (an 'uploads' field) to metadata for each", () => {
      const result = redactRunInputs({
        uploads: [fakeFile({ name: "a.pdf", size: 100 }), fakeFile({ name: "b.pdf", size: 200 })],
      });
      const parsed = JSON.parse(result!.uploads);
      expect(parsed).toEqual([
        "[file: a.pdf, application/pdf, 100 bytes]",
        "[file: b.pdf, application/pdf, 200 bytes]",
      ]);
    });

    it("reduces a raw base64 data URL string to its mime type and character count, never the payload", () => {
      const payload = "data:image/png;base64," + "A".repeat(500);
      const result = redactRunInputs({ image: payload });
      expect(result!.image).not.toContain("A".repeat(50));
      expect(result!.image).toContain("image/png");
      expect(result!.image).toContain(String(payload.length));
    });
  });

  // -------------------------------------------------------------------
  // AC2 - per-value and total truncation, with explicit markers
  // -------------------------------------------------------------------

  describe("truncation caps", () => {
    it("truncates a single value longer than MAX_VALUE_CHARS, with a marker showing how much was dropped", () => {
      const long = "x".repeat(MAX_VALUE_CHARS + 250);
      const result = redactRunInputs({ notes: long });
      expect(result!.notes.length).toBeLessThan(long.length);
      expect(result!.notes).toContain("truncated");
      expect(result!.notes).toContain("250");
      expect(result!.notes.startsWith("x".repeat(MAX_VALUE_CHARS))).toBe(true);
    });

    it("does not truncate a value at or under MAX_VALUE_CHARS", () => {
      const exact = "x".repeat(MAX_VALUE_CHARS);
      const result = redactRunInputs({ notes: exact });
      expect(result!.notes).toBe(exact);
    });

    it("caps the TOTAL payload across all keys, never omitting a key - later keys become an explicit cap-reached marker", () => {
      const near = "x".repeat(MAX_VALUE_CHARS); // stays under MAX_VALUE_CHARS itself
      const inputs: Record<string, unknown> = {};
      // Enough near-max-length values to blow well past MAX_TOTAL_CHARS.
      const keyCount = Math.ceil(MAX_TOTAL_CHARS / MAX_VALUE_CHARS) + 3;
      for (let i = 0; i < keyCount; i++) inputs[`k${i}`] = near;

      const result = redactRunInputs(inputs)!;
      // Every key from the input is still present in the output.
      expect(Object.keys(result)).toEqual(Object.keys(inputs));
      // At least one later key was capped rather than holding the full value.
      const lastKey = `k${keyCount - 1}`;
      expect(result[lastKey]).not.toBe(near);
      expect(result[lastKey].toLowerCase()).toMatch(/cap|truncat/);
    });

    it("keeps the total rendered payload bounded (roughly MAX_TOTAL_CHARS, plus small per-marker overhead) even with many large inputs", () => {
      const near = "x".repeat(MAX_VALUE_CHARS);
      const inputs: Record<string, unknown> = {};
      for (let i = 0; i < 30; i++) inputs[`k${i}`] = near;

      const result = redactRunInputs(inputs)!;
      const totalChars = Object.values(result).reduce((sum, v) => sum + v.length, 0);
      // Generous slack for the marker text itself (not the redacted payload) -
      // this is a boundedness check, not an exact-byte-count check.
      expect(totalChars).toBeLessThan(MAX_TOTAL_CHARS + 30 * 120);
    });
  });

  // -------------------------------------------------------------------
  // Determinism / key order
  // -------------------------------------------------------------------

  it("is deterministic: same input produces the exact same output", () => {
    const inputs = { repo: "org/repo", institution: "MIT", token: "harmless-looking-value" };
    expect(redactRunInputs(inputs)).toEqual(redactRunInputs(inputs));
  });

  it("preserves the input object's key order", () => {
    const inputs = { z: "1", a: "2", m: "3" };
    expect(Object.keys(redactRunInputs(inputs)!)).toEqual(["z", "a", "m"]);
  });
});
