import { describe, it, expect } from "vitest";
import { deriveAltTextFromHtml, deriveLinkTextFromHtml, deriveLinkTextFromUrl } from "./accessibility";

describe("deriveAltTextFromHtml", () => {
  it("humanizes a descriptive image file name", () => {
    const alt = deriveAltTextFromHtml('<img src="/files/tcp-handshake-diagram.png">');
    expect(alt).toBe("Tcp handshake diagram");
  });

  it("splits camelCase file names", () => {
    expect(deriveAltTextFromHtml('<img src="binarySearchTree.svg">')).toBe("Binary Search Tree");
  });

  it("returns null for a generic file name", () => {
    expect(deriveAltTextFromHtml('<img src="image1.png">')).toBeNull();
    expect(deriveAltTextFromHtml('<img src="screenshot.png">')).toBeNull();
  });

  it("returns null when there is no src", () => {
    expect(deriveAltTextFromHtml("<img alt='old'>")).toBeNull();
  });
});

describe("deriveLinkTextFromUrl", () => {
  it("combines host and last path segment", () => {
    expect(deriveLinkTextFromUrl("https://docs.python.org/3/tutorial/introduction.html")).toBe(
      "docs.python.org: introduction"
    );
  });

  it("drops a www prefix and uses the host when there is no path", () => {
    expect(deriveLinkTextFromUrl("https://www.example.com/")).toBe("example.com");
  });

  it("handles mailto links", () => {
    expect(deriveLinkTextFromUrl("mailto:prof@school.edu")).toBe("Email prof@school.edu");
  });

  it("returns null for empty input", () => {
    expect(deriveLinkTextFromUrl("")).toBeNull();
  });
});

describe("deriveLinkTextFromHtml", () => {
  it("reads the href out of an anchor snippet", () => {
    expect(deriveLinkTextFromHtml('<a href="https://mdn.io/web/css">click here</a>')).toBe("mdn.io: css");
  });

  it("returns null without an href", () => {
    expect(deriveLinkTextFromHtml("<a>click here</a>")).toBeNull();
  });
});
