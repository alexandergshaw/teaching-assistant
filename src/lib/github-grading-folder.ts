// Pure helpers for the GitHub grading "common folder" scope (see
// docs/github-grading-folder-and-assignment-acceptance-criteria.md, AC A4/A5/C2).
//
// A "grading folder" narrows a multi-repo grading run to one path inside every
// queued repo, passed through to `ingestRepo`'s existing `opts.pathPrefix`
// (src/lib/github.digest.ts:53-64). Blank means "whole repo" - today's
// behaviour - so normalization must return "" for anything that means
// "no scope", never null/undefined, so callers can treat the return value as
// an always-safe string.
//
// This module is a leaf: no "@/app/actions" import, no Supabase, no DOM. Keep
// it that way so it stays trivially unit-testable and importable from a
// "use server" action file without pulling in a client bundle.

/**
 * Normalize a user-typed or scan-picked grading folder path.
 *
 * - Blank, whitespace-only, null, or undefined all mean "whole repo": returns
 *   `""`.
 * - Leading and trailing slashes are stripped (mirrors the trim/strip rule
 *   already used for repo file paths at
 *   src/app/components/repo-detail/useFilesTab.ts:165).
 * - Duplicate internal slashes ("a//b") collapse to one ("a/b").
 * - Backslashes are normalized to forward slashes, since a path may have been
 *   typed on Windows or pasted from a Windows tree view; GitHub repo paths are
 *   always forward-slash.
 * - `..` path segments are REJECTED, not silently stripped: a folder value
 *   whose normalized form contains a `..` segment collapses to `""` (whole
 *   repo) rather than resolving upward, because `ingestRepo`'s `pathPrefix` is
 *   a plain `string.startsWith` filter (github.digest.ts:75) - it has no
 *   notion of directory traversal, so a `..` segment cannot "escape" the repo
 *   the way a filesystem path could. There is nothing for it to escape TO.
 *   Passing it through anyway would just produce a prefix so unlikely to
 *   match anything (e.g. "..") that the run silently grades zero files - a
 *   worse failure than treating the input as invalid and falling back to
 *   whole-repo. Rejecting is the safer default and keeps the function total:
 *   no path, however typed, can ever throw or return something surprising.
 */
export function normalizeGradingFolder(raw: string | null | undefined): string {
  if (!raw) return "";
  const withForwardSlashes = raw.replace(/\\/g, "/");
  const stripped = withForwardSlashes.trim().replace(/^\/+/, "").replace(/\/+$/, "");
  if (!stripped) return "";
  const collapsed = stripped.replace(/\/+/g, "/");
  const segments = collapsed.split("/");
  if (segments.some((segment) => segment === "..")) return "";
  // A stray "." segment (e.g. "a/./b") carries no traversal risk, just
  // redundancy, so it is dropped rather than rejected outright.
  const cleaned = segments.filter((segment) => segment !== ".");
  return cleaned.join("/");
}

/**
 * A short, plain-language sentence describing the current grading scope, for
 * AC A5's "the run silently grading a subfolder is worse than one grading
 * everything" requirement - the panel surfaces this so the instructor always
 * knows what a run covered.
 *
 * `folder` is expected to already be normalized (see
 * {@link normalizeGradingFolder}); an un-normalized value is treated the same
 * way normalization would treat it (only its blankness is checked here).
 */
export function describeGradingFolder(folder: string): string {
  const trimmed = folder.trim();
  if (!trimmed) return "Grading the entire repository.";
  return `Grading only the "${trimmed}" folder in each repo.`;
}
