// PARSEREPOREF-TRAVERSAL: parseRepoRef must reject any owner/repo that would
// steer or truncate an authenticated /repos/<owner>/<repo>/... call.
import { describe, expect, it } from "vitest";
import { parseRepoRef } from "./github.repos";

const API = "https://api.github.com";

function treesUrl(owner: string, repo: string): URL {
  return new URL(`${API}/repos/${owner}/${repo}/git/trees/main`);
}

// Instrument A: reject / accept matrix on parseRepoRef's return value.
const REJECT: string[] = [
  "../x",
  "o/..",
  "o/.",
  "./x",
  "o/%2e%2e",
  "o/r?x=1",
  "o/r#f",
  "o/r&y=1",
  "https://github.com/../x/git",
  "https://github.com/o/r?x=1",
  "https://github.com/o/..",
  "https://github.com/o/r#f",
  "a b/c",
];

const ACCEPT: Array<[string, { owner: string; repo: string }]> = [
  ["octocat/Hello-World", { owner: "octocat", repo: "Hello-World" }],
  ["my-org_1/repo.name-2_x", { owner: "my-org_1", repo: "repo.name-2_x" }],
  ["org/repo.with.dots", { owner: "org", repo: "repo.with.dots" }],
  ["https://github.com/octocat/Hello-World", { owner: "octocat", repo: "Hello-World" }],
  ["https://github.com/octocat/Hello-World.git", { owner: "octocat", repo: "Hello-World" }],
];

describe("parseRepoRef traversal guard - Instrument A", () => {
  it.each(REJECT)("rejects %s", (raw) => {
    expect(parseRepoRef(raw)).toBeNull();
  });

  it.each(ACCEPT)("accepts %s", (raw, expected) => {
    expect(parseRepoRef(raw)).toEqual(expected);
  });
});

// Instrument B: frozen raw-danger oracle. Each row is the raw captured parts an
// UNGUARDED parser would have produced, with the pathname/search the WHATWG URL
// parser turns them into (measured against the pre-guard parser).
const DANGER: Array<{ raw: string; owner: string; repo: string; pathname: string; search: string }> = [
  { raw: "../x", owner: "..", repo: "x", pathname: "/x/git/trees/main", search: "" },
  { raw: "o/..", owner: "o", repo: "..", pathname: "/repos/git/trees/main", search: "" },
  { raw: "o/.", owner: "o", repo: ".", pathname: "/repos/o/git/trees/main", search: "" },
  { raw: "./x", owner: ".", repo: "x", pathname: "/repos/x/git/trees/main", search: "" },
  { raw: "o/%2e%2e", owner: "o", repo: "%2e%2e", pathname: "/repos/git/trees/main", search: "" },
  { raw: "o/r?x=1", owner: "o", repo: "r?x=1", pathname: "/repos/o/r", search: "?x=1/git/trees/main" },
  { raw: "o/r#f", owner: "o", repo: "r#f", pathname: "/repos/o/r", search: "" },
];

describe("parseRepoRef traversal guard - Instrument B", () => {
  it.each(ACCEPT)("accepted %s builds the intended pathname with no query", (raw, expected) => {
    const parsed = parseRepoRef(raw);
    expect(parsed).not.toBeNull();
    const url = treesUrl(parsed!.owner, parsed!.repo);
    expect(url.pathname).toBe(`/repos/${expected.owner}/${expected.repo}/git/trees/main`);
    expect(url.search).toBe("");
  });

  it.each(DANGER)("oracle: unguarded $raw collapses, and the guard returns null", (row) => {
    const intended = `/repos/${row.owner}/${row.repo}/git/trees/main`;
    const url = treesUrl(row.owner, row.repo);
    expect(url.pathname).toBe(row.pathname);
    expect(url.search).toBe(row.search);
    expect(url.pathname === intended && url.search === "").toBe(false);
    expect(parseRepoRef(row.raw)).toBeNull();
  });
});
