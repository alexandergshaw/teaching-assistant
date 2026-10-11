// I-1: pure validator table for normalizeTargetBranch / encodeRefSegment.
import { describe, expect, it } from "vitest";
import { encodeRefSegment, normalizeTargetBranch } from "./github-ref-name";

describe("normalizeTargetBranch", () => {
  const rejected: Array<[string, string]> = [
    ["dot-dot", ".."],
    ["dot-slash", "./"],
    ["double slash", "//"],
    ["x/..", "x/.."],
    ["x/.", "x/."],
    ["a..b", "a..b"],
    ["leading dot segment", ".hidden"],
    ["leading dot nested segment", "a/.hidden"],
    ["trailing .lock", "x/y.lock"],
    ["segment .lock then more", "x.lock/y"],
    ["trailing dot", "x."],
    ["at-brace", "a@{b"],
    ["exactly @", "@"],
    ["control char", "a" + String.fromCharCode(1) + "b"],
    ["space", "a b"],
    ["tilde", "a~b"],
    ["caret", "a^b"],
    ["colon", "a:b"],
    ["question", "a?b"],
    ["star", "a*b"],
    ["bracket", "a[b"],
    ["backslash", "a" + String.fromCharCode(92) + "b"],
    ["leading slash", "/main"],
    ["trailing slash", "main/"],
  ];
  it.each(rejected)("rejects %s", (_name, value) => {
    expect(normalizeTargetBranch(value).ok).toBe(false);
  });

  const accepted: Array<[string, string]> = [
    ["feature/x", "feature/x"],
    ["release/v1.2", "release/v1.2"],
    ["a%2Fb", "a%2Fb"],
    ["a#b", "a#b"],
    ["main", "main"],
  ];
  it.each(accepted)("accepts %s", (value, expected) => {
    expect(normalizeTargetBranch(value)).toEqual({ ok: true, branch: expected });
  });

  it("trims surrounding whitespace", () => {
    expect(normalizeTargetBranch("  main ")).toEqual({ ok: true, branch: "main" });
  });

  it("treats blank and whitespace-only as unset", () => {
    expect(normalizeTargetBranch("")).toEqual({ ok: true, branch: "" });
    expect(normalizeTargetBranch("  ")).toEqual({ ok: true, branch: "" });
  });
});

describe("encodeRefSegment", () => {
  it("throws on a bare dot or dot-dot, even padded", () => {
    expect(() => encodeRefSegment("..")).toThrow();
    expect(() => encodeRefSegment(".")).toThrow();
    expect(() => encodeRefSegment(" .. ")).toThrow();
  });
  it("encodes a normal ref and keeps a slash encoded", () => {
    expect(encodeRefSegment("main")).toBe("main");
    expect(encodeRefSegment("feature/x")).toBe("feature%2Fx");
    expect(encodeRefSegment(" main ")).toBe("main");
  });
});
