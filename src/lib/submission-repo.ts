/**
 * Fetching a student's submitted GitHub repository on demand from the drafted
 * grades page (never from a grading workflow - see fetchSubmissionRepoAction
 * in src/app/actions/submission-repo.ts, which is the only caller). Kept as a
 * separate, pure/testable module: URL parsing, hard bounds, and source-file
 * selection have no network dependency, so they can be unit-tested without
 * mocking GitHub.
 */

/** One file loaded from a submitted repo, ready to display/run. */
export interface SubmissionRepoFile {
  path: string;
  text: string;
  // F5 (docs/grading-results-file-viewer-acceptance-criteria.md): optional
  // and set only by repo-content.ts's grading path (clampFileBytes's own
  // per-file result) - the on-demand "Load code" action never sets it, so a
  // reader there sees plain `undefined`, not a false "not truncated".
  truncated?: boolean;
}

/** The subset of a GitHub tree entry this module needs (matches RepoTreeEntry
 *  from src/lib/github.files.ts structurally, without importing it, so this
 *  module stays network-free). */
export interface SubmissionRepoTreeEntry {
  path: string;
  type: "blob" | "tree";
  size?: number;
}

export interface ParsedSubmissionRepoUrl {
  owner: string;
  repo: string;
  /** Branch, tag, or commit from a /tree/<ref> or /blob/<ref> URL segment. */
  ref?: string;
  /** Path within the repo from a /tree/<ref>/<subpath...> URL. */
  subpath?: string;
}

const GITHUB_HOST = /^(www\.)?github\.com$/i;
const HAS_SCHEME = /^[a-z][a-z0-9+.-]*:\/\//i;

/**
 * Parse a student-submitted URL into an owner/repo (+ optional ref/subpath).
 * Never throws: a non-GitHub URL or unparseable garbage returns a clear,
 * actionable error string instead, since students paste all sorts of links.
 */
export function parseSubmissionGithubUrl(raw: string): ParsedSubmissionRepoUrl | { error: string } {
  const trimmed = (raw ?? "").trim();
  if (!trimmed) return { error: "No submission URL to parse." };

  let url: URL;
  try {
    url = new URL(HAS_SCHEME.test(trimmed) ? trimmed : `https://${trimmed}`);
  } catch {
    return { error: `"${trimmed}" is not a valid URL.` };
  }

  if (!GITHUB_HOST.test(url.hostname)) {
    return { error: `"${url.hostname || trimmed}" is not a github.com repository link.` };
  }

  const segments = url.pathname
    .split("/")
    .filter(Boolean)
    .map((segment) => {
      try {
        return decodeURIComponent(segment);
      } catch {
        return segment;
      }
    });

  if (segments.length < 2) {
    return { error: "The GitHub URL is missing a repository (expected github.com/<owner>/<repo>)." };
  }

  const owner = segments[0];
  const repo = segments[1].replace(/\.git$/i, "");
  if (!owner || !repo) {
    return { error: "The GitHub URL is missing a repository (expected github.com/<owner>/<repo>)." };
  }

  let ref: string | undefined;
  let subpath: string | undefined;
  if (segments.length > 3 && (segments[2] === "tree" || segments[2] === "blob")) {
    ref = segments[3];
    if (segments.length > 4) subpath = segments.slice(4).join("/");
  }

  return { owner, repo, ref, subpath };
}

/** Whether a submitted URL is (parseable as) a GitHub repository link, for
 *  the page to decide whether to offer "Load code" without fully parsing it. */
export function looksLikeGithubUrl(raw: string): boolean {
  return !("error" in parseSubmissionGithubUrl(raw));
}

// ── Hard bounds ──────────────────────────────────────────────────────────
// A "load code" pull is triggered on demand by an instructor viewing one
// draft, but a student repo is untrusted and unbounded in principle - these
// caps keep one click from blowing up latency, memory, or the GitHub API
// rate limit. Each is a plain constant (not configurable) so the limit is
// visible at a glance; callers that need custom limits for tests use the
// `opts`/parameter overrides on the functions below instead of changing these.

/** Maximum number of source files to load from one repo. */
export const MAX_SUBMISSION_REPO_FILES = 80;

/** Maximum bytes (UTF-8) to keep from a single file; longer files are
 *  truncated rather than skipped, so at least a prefix is still reviewable. */
export const MAX_SUBMISSION_FILE_BYTES = 300_000;

/** Maximum combined bytes across all loaded files in one pull. */
export const MAX_SUBMISSION_REPO_TOTAL_BYTES = 3_000_000;

/** Extensions (no leading dot, lowercase) treated as reviewable/runnable
 *  source. Binaries, images, and lockfiles are excluded on purpose - this is
 *  for reading and running code, not archiving a repo. Filenames without an
 *  extension (README, Dockerfile, Makefile) are matched separately below. */
export const SUBMISSION_SOURCE_EXTENSIONS = new Set([
  "ts", "tsx", "js", "jsx", "mjs", "cjs",
  "py", "java", "c", "cc", "cpp", "cxx", "h", "hpp",
  "cs", "go", "rb", "php", "rs", "swift", "kt", "kts", "scala",
  "html", "htm", "css", "scss", "sass", "less", "vue", "svelte",
  "json", "jsonc", "yml", "yaml", "toml", "ini", "xml",
  "sql", "sh", "bash", "zsh", "r", "md", "mdx", "txt",
  "graphql", "proto", "dart", "lua", "pl",
]);

// Directories a repo's own tooling generates or vendors - never source the
// student wrote, and often huge (node_modules, build output, venvs).
const SKIP_PATH = /(^|\/)(node_modules|\.git|dist|build|out|\.next|\.nuxt|vendor|venv|\.venv|__pycache__|coverage|\.idea|\.vscode|target)(\/|$)/;

// Lockfiles and compiled/minified/sourcemap output: technically text, but
// never something an instructor wants to read or run.
const SKIP_FILE = /(package-lock\.json|yarn\.lock|pnpm-lock\.yaml|poetry\.lock|composer\.lock|Gemfile\.lock|\.min\.(js|css)$|\.map$)/i;

function isSourcePath(path: string): boolean {
  const base = (path.split("/").pop() ?? path).toLowerCase();
  if (base === "readme" || base === "dockerfile" || base === "makefile") return true;
  const ext = base.includes(".") ? base.split(".").pop() ?? "" : "";
  return SUBMISSION_SOURCE_EXTENSIONS.has(ext);
}

/**
 * Select which blobs from a repo's tree are worth loading: within `subpath`
 * (when given), source-like by extension, not a generated/vendored path or a
 * lockfile, sorted for a stable display order, and capped at `maxFiles`
 * entries no larger than `maxFileBytes` (per the tree's own size metadata -
 * a cheap pre-fetch filter; actual downloaded content is re-checked by
 * clampFileBytes since a blob's real size can differ slightly). `truncated`
 * is set whenever either cap actually removed an otherwise-eligible file.
 */
export function selectSubmissionRepoFiles(
  tree: SubmissionRepoTreeEntry[],
  subpath?: string,
  opts: { maxFiles?: number; maxFileBytes?: number } = {}
): { selected: SubmissionRepoTreeEntry[]; truncated: boolean } {
  const maxFiles = opts.maxFiles ?? MAX_SUBMISSION_REPO_FILES;
  const maxFileBytes = opts.maxFileBytes ?? MAX_SUBMISSION_FILE_BYTES;
  const cleanSubpath = subpath ? subpath.replace(/^\/+|\/+$/g, "") : "";
  const prefix = cleanSubpath ? `${cleanSubpath}/` : "";

  const inScope = (path: string): boolean => {
    if (!prefix) return true;
    return path === cleanSubpath || path.startsWith(prefix);
  };

  const eligible = tree.filter(
    (entry) =>
      entry.type === "blob" &&
      inScope(entry.path) &&
      !SKIP_PATH.test(entry.path) &&
      !SKIP_FILE.test(entry.path) &&
      isSourcePath(entry.path)
  );

  let truncated = false;
  const withinSize: SubmissionRepoTreeEntry[] = [];
  for (const entry of eligible) {
    if (typeof entry.size === "number" && entry.size > maxFileBytes) {
      truncated = true; // an oversized file was skipped entirely, pre-fetch
      continue;
    }
    withinSize.push(entry);
  }
  withinSize.sort((a, b) => a.path.localeCompare(b.path));

  let selected = withinSize;
  if (withinSize.length > maxFiles) {
    selected = withinSize.slice(0, maxFiles);
    truncated = true;
  }

  return { selected, truncated };
}

/**
 * Clamp one file's decoded text to `maxBytes` (UTF-8). A safety net behind
 * selectSubmissionRepoFiles's pre-fetch size filter, in case the tree's size
 * metadata was missing or stale for a particular blob.
 */
export function clampFileBytes(
  text: string,
  maxBytes: number = MAX_SUBMISSION_FILE_BYTES
): { text: string; truncated: boolean } {
  if (Buffer.byteLength(text, "utf8") <= maxBytes) {
    return { text, truncated: false };
  }
  // Source files are overwhelmingly ASCII/UTF-8-single-byte, so slicing by
  // character count is a safe, simple approximation of a byte budget here.
  return { text: text.slice(0, maxBytes), truncated: true };
}

/**
 * Trim an ordered list of already-fetched files down to a combined
 * `maxTotalBytes`, stopping (and marking truncated) at the first file that
 * would push the running total over the limit. `maxTotalBytes` is an
 * explicit parameter (rather than always reading the module constant)
 * so tests can exercise the trimming logic without megabyte-scale fixtures.
 */
export function applyTotalByteBudget(
  files: SubmissionRepoFile[],
  maxTotalBytes: number = MAX_SUBMISSION_REPO_TOTAL_BYTES
): { files: SubmissionRepoFile[]; truncated: boolean } {
  const out: SubmissionRepoFile[] = [];
  let total = 0;
  let truncated = false;
  for (const file of files) {
    const bytes = Buffer.byteLength(file.text, "utf8");
    if (total + bytes > maxTotalBytes) {
      truncated = true;
      break;
    }
    out.push(file);
    total += bytes;
  }
  return { files: out, truncated };
}
