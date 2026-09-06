import { describe, expect, it } from "vitest";
import { assertCanvasSuppliedUrlIsSameOrigin, CANVAS_PAGINATION_PAGE_CAP } from "./canvas-remote-url";

const BASE = "https://canvas.example.edu";

describe("CANVAS_PAGINATION_PAGE_CAP", () => {
  it("is the 20-page cap E-REL2 derived, exported for every call site to share", () => {
    expect(CANVAS_PAGINATION_PAGE_CAP).toBe(20);
  });
});

describe("assertCanvasSuppliedUrlIsSameOrigin", () => {
  it("accepts a same-origin absolute URL and returns it", () => {
    const candidate = "https://canvas.example.edu/api/v1/courses?page=2";
    expect(assertCanvasSuppliedUrlIsSameOrigin(candidate, BASE)).toBe(candidate);
  });

  it("REJECTS a host that merely has the base URL as a string PREFIX - the case that proves this is an origin check, not a prefix check", () => {
    // "canvas.example.edu.evil.com" starts with the base's hostname as a raw
    // string. A `candidate.startsWith(baseUrl)` implementation passes this.
    expect(() =>
      assertCanvasSuppliedUrlIsSameOrigin("https://canvas.example.edu.evil.com/api/v1/courses", BASE)
    ).toThrow();
  });

  it("rejects a different scheme on the same host", () => {
    expect(() =>
      assertCanvasSuppliedUrlIsSameOrigin("http://canvas.example.edu/api/v1/courses", BASE)
    ).toThrow();
  });

  it("rejects a different port on the same host", () => {
    expect(() =>
      assertCanvasSuppliedUrlIsSameOrigin("https://canvas.example.edu:8443/api/v1/courses", BASE)
    ).toThrow();
  });

  it("rejects a subdomain of the base host", () => {
    expect(() =>
      assertCanvasSuppliedUrlIsSameOrigin("https://sub.canvas.example.edu/api/v1/courses", BASE)
    ).toThrow();
  });

  it("rejects a protocol-relative URL that resolves to a foreign origin", () => {
    expect(() => assertCanvasSuppliedUrlIsSameOrigin("//evil.com/x", BASE)).toThrow();
  });

  it("rejects a value that does not parse as a URL even against a base (malformed authority)", () => {
    expect(() => assertCanvasSuppliedUrlIsSameOrigin("https://[::1", BASE)).toThrow();
  });

  it("rejects a non-string value without throwing an unexpected error type", () => {
    expect(() => assertCanvasSuppliedUrlIsSameOrigin(12345, BASE)).toThrow(Error);
    expect(() => assertCanvasSuppliedUrlIsSameOrigin(undefined, BASE)).toThrow(Error);
    expect(() => assertCanvasSuppliedUrlIsSameOrigin(null, BASE)).toThrow(Error);
    expect(() => assertCanvasSuppliedUrlIsSameOrigin({ url: "https://canvas.example.edu" }, BASE)).toThrow(
      Error
    );
  });

  it("rejects an empty string rather than silently resolving it to the base itself", () => {
    expect(() => assertCanvasSuppliedUrlIsSameOrigin("", BASE)).toThrow();
  });

  it("rejects a whitespace-only string", () => {
    expect(() => assertCanvasSuppliedUrlIsSameOrigin("   ", BASE)).toThrow();
  });

  it("rejects a javascript: URL", () => {
    expect(() => assertCanvasSuppliedUrlIsSameOrigin("javascript:alert(1)", BASE)).toThrow();
  });

  it("rejects a data: URL (another opaque-origin scheme, same branch as javascript:)", () => {
    expect(() => assertCanvasSuppliedUrlIsSameOrigin("data:text/html,hi", BASE)).toThrow();
  });

  it("accepts a same-origin RELATIVE URL, resolving it against the base", () => {
    const result = assertCanvasSuppliedUrlIsSameOrigin("/api/v1/courses?page=3", BASE);
    expect(result).toBe("https://canvas.example.edu/api/v1/courses?page=3");
  });

  it("accepts a bare relative path with no leading slash, resolved against the base origin", () => {
    const result = assertCanvasSuppliedUrlIsSameOrigin("api/v1/courses", BASE);
    expect(result).toBe("https://canvas.example.edu/api/v1/courses");
  });

  it("does not leak anything token-shaped in its thrown message", () => {
    // This function never receives a token, so the strongest thing worth
    // pinning is that the message stays about hosts/origins, not about
    // authorization, and stays bounded for a very long candidate.
    const longCandidate = `https://evil.com/${"a".repeat(5000)}`;
    try {
      assertCanvasSuppliedUrlIsSameOrigin(longCandidate, BASE);
      throw new Error("expected assertCanvasSuppliedUrlIsSameOrigin to throw");
    } catch (err) {
      const message = (err as Error).message;
      expect(message.toLowerCase()).not.toContain("bearer");
      expect(message.toLowerCase()).not.toContain("authorization");
      expect(message.length).toBeLessThan(500);
    }
  });

  it("names the expected host and the offending host in the thrown message, for an operator", () => {
    try {
      assertCanvasSuppliedUrlIsSameOrigin("https://attacker.example.com/x", BASE);
      throw new Error("expected assertCanvasSuppliedUrlIsSameOrigin to throw");
    } catch (err) {
      const message = (err as Error).message;
      expect(message).toContain("canvas.example.edu");
      expect(message).toContain("attacker.example.com");
    }
  });

  it("refuses up front when the base URL itself has no well-defined origin", () => {
    expect(() => assertCanvasSuppliedUrlIsSameOrigin("https://canvas.example.edu/x", "javascript:x")).toThrow();
  });

  it("throws a clear internal error, not a raw parser exception, when baseUrl itself is unparseable", () => {
    expect(() => assertCanvasSuppliedUrlIsSameOrigin("https://canvas.example.edu/x", "not a url")).toThrow();
  });
});
