// Pure validation and encoding for a git ref (branch) name that is about to be
// interpolated into a GitHub REST path. A plain .ts leaf (not a "use server"
// file) so the helpers can be synchronous and unit-tested.
//
// Why this exists: encodeURIComponent neutralises "../" and a leading "/", but
// it leaves "." and ".." untouched, and the WHATWG URL parser inside fetch then
// collapses a bare dot-segment - a branch of ".." turns
// /git/trees/<ref>?recursive=1 into /git/?recursive=1, an authenticated call
// aimed at a path the caller never intended. Validation makes the bad state
// unrepresentable rather than merely improbable.

export type NormalizedBranch = { ok: true; branch: string } | { ok: false; error: string };

// Characters git's check-ref-format forbids anywhere in a ref name (plus
// space). Control characters are checked separately by code point.
const FORBIDDEN_CHARS = new Set([" ", "~", "^", ":", "?", "*", "[", "\\"]);

function hasControlChar(value: string): boolean {
  for (let i = 0; i < value.length; i += 1) {
    const code = value.charCodeAt(i);
    if (code < 0x20 || code === 0x7f) return true;
  }
  return false;
}

const INVALID = "That is not a valid branch name.";

/**
 * Trim and validate an instructor-typed target branch.
 *  - blank or whitespace-only -> { ok: true, branch: "" } meaning UNSET; the
 *    caller forwards `undefined`, never a whitespace string.
 *  - internal "/" is legal (feature/x); a literal "%" or "#" is legal too
 *    (encoding handles them at the URL boundary).
 */
export function normalizeTargetBranch(raw: string): NormalizedBranch {
  const branch = (raw ?? "").trim();
  if (branch === "") return { ok: true, branch: "" };
  if (hasControlChar(branch)) return { ok: false, error: INVALID };
  for (const ch of branch) {
    if (FORBIDDEN_CHARS.has(ch)) return { ok: false, error: INVALID };
  }
  if (branch === "@" || branch.includes("@{") || branch.includes("..")) return { ok: false, error: INVALID };
  if (branch.endsWith(".") || branch.endsWith(".lock")) return { ok: false, error: INVALID };
  for (const segment of branch.split("/")) {
    if (segment === "" || segment === "." || segment === ".." || segment.startsWith(".") || segment.endsWith(".lock")) {
      return { ok: false, error: INVALID };
    }
  }
  return { ok: true, branch };
}

// Owner / repo name policy (differs from the ref policy above: a repo name
// permits none of "/", "%", "#", "?"). Mirrors submission-repo.ts SAFE_NAME and
// DOT_SEGMENT. SAFE_NAME alone passes a bare "." or "..", so DOT_SEGMENT is
// load-bearing.
const SAFE_NAME = /^[A-Za-z0-9_.-]+$/;
const DOT_SEGMENT = /^\.{1,2}$/;

/**
 * True when owner and repo are each safe to interpolate UNENCODED into
 * /repos/<owner>/<repo>/... : only [A-Za-z0-9_.-], and neither is a bare
 * dot-segment (. or ..), which the WHATWG URL parser would collapse.
 */
export function validateGithubOwnerRepo(owner: string, repo: string): boolean {
  for (const part of [owner, repo]) {
    if (!SAFE_NAME.test(part) || DOT_SEGMENT.test(part)) return false;
  }
  return true;
}

/**
 * encodeURIComponent for a ref placed in a GitHub URL, but throws on a bare "."
 * or ".." (after trim) - the one shape encodeURIComponent does not neutralise.
 */
export function encodeRefSegment(ref: string): string {
  const trimmed = ref.trim();
  if (trimmed === "." || trimmed === "..") throw new Error(INVALID);
  return encodeURIComponent(trimmed);
}
