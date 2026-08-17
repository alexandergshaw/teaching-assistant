// The canonical student-repo naming transform. This used to be duplicated:
// once as a local const in src/app/actions/github.ts (setupStudentRepoAction),
// and once, byte-for-byte, in src/lib/repo-student-bindings.ts (which could
// not import the action file's copy because "use server" files may only
// export async functions). Both call sites now import from here instead.
//
// This module is pure and has no imports of its own, on purpose: every
// student repo already created by the workflow step was named by this
// transform, and the invitation status panel finds a student's repo by
// RECOMPUTING the name from this function. A drift here would silently
// orphan every existing repo, so keep any change verified against
// student-repo-names.test.ts's frozen oracle first.

/** Slugs free text into a lowercase, hyphen-separated identifier: lowercases,
 * collapses every run of non [a-z0-9] characters into a single hyphen, and
 * trims leading/trailing hyphens. Verbatim transform, unchanged behavior. */
export function repoSlug(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
}

/** The naming rule setupStudentRepoAction uses to compute a student's repo
 * name: the slugged prefix (when non-blank), a hyphen, and the slugged
 * student name (falling back to the username, then to the literal
 * "student" when both are blank), truncated to GitHub's 100-char repo name
 * limit minus headroom (95). Lifted verbatim out of
 * src/app/actions/github.ts's setupStudentRepoAction. */
export function studentRepoName(prefix: string, student: string, username: string): string {
  const base = prefix.trim() ? repoSlug(prefix) : "";
  const suffix = repoSlug(student.trim() || username.trim()) || "student";
  return (base ? `${base}-${suffix}` : suffix).slice(0, 95);
}
