import { describe, expect, it } from "vitest";
import { validateRepositoryScope } from "./repository-evidence-policy";
const scope = { owner: "owner", repo: "repo", kind: "tree", requestedRef: "feature/slash", requestedPath: "src" };
describe("confirmed repository scope validation", () => {
  it("requires the explicitly confirmed full ref/path recomposition", () => {
    expect(validateRepositoryScope("https://github.com/owner/repo/tree/feature/slash/src", scope)).toBe(true);
    expect(validateRepositoryScope("https://github.com/owner/repo/tree/feature/slash/src", { ...scope, requestedPath: "other" })).toBe(false);
  });
  it.each(["https://u:p@github.com/owner/repo/tree/feature/slash/src", "http://github.com/owner/repo/tree/feature/slash/src", "https://github.com:123/owner/repo/tree/feature/slash/src", "https://github.com/owner/repo/tree/feature%2fslash/src", "https://github.com/owner/repo/tree/feature/slash/%2e%2e/src", "https://github.com/owner/repo/tree/feature/slash/src?q=1", "https://github.com/owner/repo/tree/feature/slash/src#x"])("rejects unsafe shape %s", (url) => expect(validateRepositoryScope(url, scope)).toBe(false));
  it("admits only exact full commit links", () => {
    const sha = "a".repeat(40); const commit = { ...scope, kind: "commit", requestedRef: sha, requestedPath: null };
    expect(validateRepositoryScope(`https://github.com/owner/repo/commit/${sha}`, commit)).toBe(true);
    expect(validateRepositoryScope(`https://github.com/owner/repo/commit/${sha}/file`, commit)).toBe(false);
    expect(validateRepositoryScope("https://github.com/owner/repo/commit/abc", { ...commit, requestedRef: "abc" })).toBe(false);
  });
});