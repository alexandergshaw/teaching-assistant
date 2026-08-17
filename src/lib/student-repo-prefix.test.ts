import { describe, expect, it } from "vitest";
import { findExistingRepoNames } from "./student-repo-prefix";
import { studentRepoName } from "./student-repo-names";

describe("findExistingRepoNames", () => {
  it("matches a computed name against the full org listing (case-insensitive)", () => {
    const computed = ["cs-101-smith-john", "cs-101-doe-jane"];
    const orgRepoNames = ["CS-101-Smith-John", "some-other-repo"];
    const found = findExistingRepoNames(computed, orgRepoNames);
    expect(found.has("cs-101-smith-john")).toBe(true);
    expect(found.has("cs-101-doe-jane")).toBe(false);
  });

  // Regression test for the "No repo yet" bug: a course prefix containing a
  // character that repoSlug() rewrites (here, a space) must still resolve
  // its students' repos as existing when the org listing has them.
  it("resolves a repo as existing when the prefix contains a character slugging rewrites", () => {
    const prefix = "CS 101";
    const computedName = studentRepoName(prefix, "Smith John", "jsmith");
    expect(computedName).toBe("cs-101-smith-john");

    // Full, unfiltered org listing - this is what listOrgRepos(trimmedOrg)
    // (no prefix argument) returns after the fix.
    const orgRepoNames = ["cs-101-smith-john", "cs-101-doe-jane"];

    const found = findExistingRepoNames([computedName], orgRepoNames);
    expect(found.has(computedName)).toBe(true);
  });

  // Sabotage check: reproduces the pre-fix behavior, where the org listing
  // was filtered client-side (listOrgRepos's `needle` filter) by the RAW,
  // unslugged prefix before any existence check ran. For "CS 101" the
  // needle "cs 101" never matches "cs-101-smith-john", so the filtered
  // listing comes back empty and the row would be reported as missing even
  // though the repo exists. This proves the bug was real, and that the fix
  // (never filtering the listing by the raw prefix) is what avoids it.
  it("would fail to find the repo if the org listing had been filtered by the raw prefix first (documents the bug)", () => {
    const prefix = "CS 101";
    const computedName = studentRepoName(prefix, "Smith John", "jsmith");
    const orgRepoNames = ["cs-101-smith-john", "cs-101-doe-jane"];

    const needle = prefix.trim().toLowerCase(); // "cs 101" - listOrgRepos's old `needle`
    const buggyFilteredListing = orgRepoNames.filter((n) => n.toLowerCase().startsWith(needle));
    expect(buggyFilteredListing).toEqual([]);

    const found = findExistingRepoNames([computedName], buggyFilteredListing);
    expect(found.has(computedName)).toBe(false);
  });
});
