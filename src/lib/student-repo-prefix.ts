// Pure helper for the per-student repo invitation status panel
// (src/app/actions/github-student-repos.ts). Determines which computed
// student-repo names exist in an org's repo listing.
//
// Match by exact name (case-insensitive) against the FULL, unfiltered org
// listing - never against a listing pre-filtered by the raw, unslugged
// course prefix. studentRepoName() (student-repo-names.ts) slugs the prefix
// before building a repo name: a prefix like "CS 101" becomes the repo-name
// base "cs-101". Filtering the org listing client-side with the raw prefix
// ("cs 101") would never match those real repo names ("cs-101-smith-john"),
// so every row would falsely resolve as missing even when every repo
// already exists. See student-repo-prefix.test.ts.

/** Of `computedNames` (the repo names studentRepoName() computed for each
 * roster row), returns the lowercased subset that are present in
 * `orgRepoNames` (the org's full, unfiltered repo listing). Comparison is
 * case-insensitive exact match, matching GitHub's own case-insensitivity
 * for repo names. */
export function findExistingRepoNames(computedNames: string[], orgRepoNames: string[]): Set<string> {
  const existing = new Set(orgRepoNames.map((n) => n.toLowerCase()));
  const found = new Set<string>();
  for (const name of computedNames) {
    const lower = name.toLowerCase();
    if (existing.has(lower)) found.add(lower);
  }
  return found;
}
