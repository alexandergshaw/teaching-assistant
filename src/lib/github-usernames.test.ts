import { describe, it, expect } from "vitest";
import { normalizeGithubHandle, isValidGithubUsername, extractGithubHandle } from "./github-usernames";

describe("normalizeGithubHandle", () => {
  it("strips leading @", () => {
    expect(normalizeGithubHandle("@johndoe")).toBe("johndoe");
  });

  it("extracts username from GitHub URL", () => {
    expect(normalizeGithubHandle("https://github.com/jane-d")).toBe("jane-d");
  });

  it("handles case-insensitive URLs", () => {
    expect(normalizeGithubHandle("HTTPS://GitHub.com/foo/bar")).toBe("foo");
  });

  it("takes first token", () => {
    expect(normalizeGithubHandle("bob smith")).toBe("bob");
  });

  it("returns empty string for empty input", () => {
    expect(normalizeGithubHandle("")).toBe("");
  });

  it("strips trailing punctuation", () => {
    expect(normalizeGithubHandle("alice,")).toBe("alice");
    expect(normalizeGithubHandle("bob;")).toBe("bob");
    expect(normalizeGithubHandle("charlie:")).toBe("charlie");
  });

  it("handles multiple @ signs", () => {
    expect(normalizeGithubHandle("@@username")).toBe("username");
  });
});

describe("isValidGithubUsername", () => {
  it("accepts valid usernames", () => {
    expect(isValidGithubUsername("a")).toBe(true);
    expect(isValidGithubUsername("Valid1")).toBe(true);
    expect(isValidGithubUsername("a-b")).toBe(true);
    expect(isValidGithubUsername("user-123")).toBe(true);
  });

  it("rejects leading hyphen", () => {
    expect(isValidGithubUsername("-bad")).toBe(false);
  });

  it("rejects trailing hyphen", () => {
    expect(isValidGithubUsername("bad-")).toBe(false);
  });

  it("rejects double hyphen", () => {
    expect(isValidGithubUsername("a--b")).toBe(false);
  });

  it("rejects names longer than 39 chars", () => {
    expect(isValidGithubUsername("a".repeat(40))).toBe(false);
  });

  it("accepts 39 char names", () => {
    expect(isValidGithubUsername("a".repeat(39))).toBe(true);
  });

  it("rejects special characters", () => {
    expect(isValidGithubUsername("user@name")).toBe(false);
    expect(isValidGithubUsername("user.name")).toBe(false);
    expect(isValidGithubUsername("user name")).toBe(false);
  });
});

describe("extractGithubHandle", () => {
  it("accepts plain username", () => {
    expect(extractGithubHandle("johndoe")).toEqual({ handle: "johndoe", ok: true });
  });

  it("accepts username with leading @", () => {
    expect(extractGithubHandle("@johndoe")).toEqual({ handle: "johndoe", ok: true });
  });

  it("accepts GitHub profile URL", () => {
    expect(extractGithubHandle("https://github.com/jane-d")).toEqual({ handle: "jane-d", ok: true });
  });

  it("accepts GitHub profile URL with trailing slash", () => {
    expect(extractGithubHandle("https://github.com/jane-d/")).toEqual({ handle: "jane-d", ok: true });
  });

  it("accepts GitHub repo URL and returns owner with ok:true", () => {
    expect(extractGithubHandle("https://github.com/foo/bar")).toEqual({ handle: "foo", ok: true });
  });

  it("rejects prose with username - marked not ok", () => {
    expect(extractGithubHandle("johndoe (John Doe)")).toEqual({ handle: "johndoe", ok: false });
  });

  it("rejects multiple tokens - marked not ok", () => {
    expect(extractGithubHandle("my handle is x")).toEqual({ handle: "my", ok: false });
  });

  it("returns not ok for empty input", () => {
    expect(extractGithubHandle("")).toEqual({ handle: "", ok: false });
  });

  it("returns not ok for invalid username starting with hyphen", () => {
    expect(extractGithubHandle("-bad")).toEqual({ handle: "-bad", ok: false });
  });

  it("returns not ok for username longer than 39 chars", () => {
    const long = "a".repeat(40);
    expect(extractGithubHandle(long)).toEqual({ handle: long, ok: false });
  });

  it("returns ok for valid 39-char username", () => {
    const valid = "a".repeat(39);
    expect(extractGithubHandle(valid)).toEqual({ handle: valid, ok: true });
  });
});
