// Codebase digest for LLM analysis (course/rubric generation, grading).

import { getRepo } from "./github.repos";
import { getRepoTreeWithMeta, getFileText, type RepoTreeEntry } from "./github.files";
import { ghFetch } from "./github.repos";

// Text/code file extensions worth feeding to a model. Broad on purpose - a
// student submission can be written in almost anything - but deliberately
// stops short of images, archives, binaries, lockfiles, minified bundles and
// source maps (C3.9 boundary): "all code" is not "all bytes".
const TEXT_EXT = new Set([
  // Docs / markup
  "md", "mdx", "txt", "rst", "tex", "xml",
  // JS/TS family
  "js", "ts", "tsx", "jsx", "mjs", "cjs",
  // General-purpose languages
  "py", "java", "c", "cc", "cpp", "cxx", "h", "hpp", "cs", "go", "rb", "php", "rs",
  "swift", "kt", "kts", "scala", "groovy", "dart", "lua", "pl", "pm", "r", "jl",
  "hs", "lhs", "ml", "mli", "clj", "cljs", "cljc", "ex", "exs", "erl", "zig", "nim",
  "fs", "fsx", "vb", "m", "mm", "el", "asm", "s",
  // Shell / scripting
  "sh", "bash", "zsh", "bat", "cmd", "ps1", "psm1",
  // Web
  "html", "htm", "css", "scss", "sass", "less", "vue", "svelte",
  // Data / config (text, not binary)
  "json", "jsonc", "yml", "yaml", "toml", "ini", "cfg", "conf", "properties",
  "sql", "graphql", "gql", "proto", "gradle", "cmake",
  // Notebooks
  "ipynb",
  // Named without a leading dot elsewhere in this file (dockerfile has no
  // extension in practice, but keep the literal in case a repo names it
  // "Dockerfile.ext")
  "dockerfile",
]);

// Directories a repo's own tooling generates or vendors - never source the
// student wrote, and often huge (node_modules, build output, venvs). Kept
// current even inside a chosen folder (C3.10): a student who commits
// node_modules must not be able to evict their own source through the byte
// budget.
const SKIP_DIR =
  /(^|\/)(node_modules|\.git|dist|build|out|\.next|\.nuxt|vendor|venv|\.venv|__pycache__|coverage|\.idea|\.vscode|target|bin|obj|\.pytest_cache|\.mypy_cache|\.tox|\.gradle)(\/|$)/;

// Lockfiles and compiled/minified/sourcemap output: technically text, but
// never something worth putting in a grading prompt.
const SKIP_FILE = /(package-lock\.json|yarn\.lock|pnpm-lock\.yaml|poetry\.lock|composer\.lock|Gemfile\.lock|\.min\.(js|css)$|\.map$)/i;

// Filenames with no extension that are still clearly text/source, matched by
// basename only (case-insensitive).
const NO_EXT_ALLOW = /^(readme|dockerfile|makefile|license|licence|procfile|rakefile|gemfile|vagrantfile|jenkinsfile|changelog|notice|authors|contributors)$/i;

/**
 * The extension of a path, lowercased, considering only the BASENAME. A file
 * with no dot in its basename (or a dotfile like ".env", where the only dot
 * is the leading one) has no extension - it does not inherit a dot from a
 * parent directory (e.g. "my.project/main" has no extension, not "project/main").
 */
function fileExt(path: string): string {
  const base = path.split("/").pop() ?? path;
  const dot = base.lastIndexOf(".");
  if (dot <= 0) return "";
  return base.slice(dot + 1).toLowerCase();
}

/**
 * Whether a path is worth digesting as source text. Extensionless files are
 * included only when they are a well-known project file (README, LICENSE,
 * Procfile, ...) or carry the executable bit (mode "100755") - a strong,
 * cheap signal that an extensionless file is a script rather than a stray
 * binary or data file, without needing to fetch its content first.
 */
function isTextCandidate(path: string, mode?: string): boolean {
  const ext = fileExt(path);
  if (ext) return TEXT_EXT.has(ext);
  const base = (path.split("/").pop() ?? path).toLowerCase();
  return NO_EXT_ALLOW.test(base) || mode === "100755";
}

// Read order: README first, then docs, then source — so the digest leads with intent.
function pathRank(path: string): number {
  const lower = path.toLowerCase();
  if (/(^|\/)readme\./.test(lower)) return 0;
  if (/(^|\/)(docs?|documentation)\//.test(lower)) return 1;
  if (/(^|\/)(src|app|lib|server|client)\//.test(lower)) return 2;
  return 3;
}

/** One file included in a repo digest (its content is the post-truncation slice). */
export interface RepoFile {
  path: string;
  content: string;
  /**
   * True when THIS file's own content was cut by `perFileBytes` (or by the
   * remaining `maxBytes` headroom) - i.e. `content.length < <the file's real
   * size>`. Set at the exact point the slice happens (below), never
   * recomputed later from `content` alone: a file that is short because it
   * IS short must not be mistaken for a file that is short because it was
   * cut (docs/grading-results-file-viewer-acceptance-criteria.md F3). A
   * viewer reads this to warn at the point the text stops, not just in a
   * header.
   */
  truncated: boolean;
}

/** Counts of every reason a candidate file did not make it into the digest. */
export interface RepoDigestSkipCounts {
  /** Excluded by the extension allowlist, filename denylist, or SKIP_DIR - not something the digest treats as source. */
  type: number;
  /** Blob size at or above the per-blob fetch ceiling - too large to ever pull in. */
  size: number;
  /** Matched every filter, but pushed out by the file-count or total-byte budget. */
  budget: number;
  /** Passed every filter, but the GitHub fetch for the file's content threw. */
  fetchError: number;
}

export interface RepoDigest {
  fullName: string;
  description: string;
  fileCount: number;
  /** Concatenated, bounded source text for the model. */
  text: string;
  truncated: boolean;
  /**
   * The individual files that make up {@link text}. Lets the deterministic grader
   * check file types / counts and preview per-file content without re-parsing the
   * concatenated digest.
   */
  files: RepoFile[];
  /**
   * True only when a `pathPrefix` was given and it matched no blob anywhere in
   * the repo tree (the folder does not exist at this ref, or is empty). This is
   * its own outcome, distinct from "the folder had one small file" - a caller
   * must report it rather than silently grading a near-empty digest as if the
   * student's code had been reviewed (C2 item 6).
   */
  // The three fields below are optional in the TYPE only so existing mocks/
  // fixtures elsewhere that build a RepoDigest literal (e.g. tests stubbing
  // ingestRepoAction) do not all need updating for this addition - ingestRepo
  // itself always populates every one of them at runtime.
  prefixMatchedNothing?: boolean;
  /** Counts of every reason a candidate file did not make it into {@link files}. */
  skipped?: RepoDigestSkipCounts;
  /**
   * True when GitHub's own recursive tree listing was truncated (see
   * RepoTreeResult in github.files.ts). When true, `prefixMatchedNothing`
   * should be read with caution - the folder may exist past the point
   * GitHub's listing cut off, not actually be absent.
   */
  treeTruncated?: boolean;
}

// ── Ingest budgets ──────────────────────────────────────────────────────────
//
// These numbers were sized for "digest a whole repo for background context"
// (rubric generation from a reference repo, course materials, etc.) - the
// digest is a sample, not the graded artifact, so staying small is correct.
//
// When the caller names a folder (`pathPrefix`), that folder IS the grading
// scope, not a sample of it - applying the whole-repo caps there silently
// discards the very thing the instructor scoped to. SCOPED_BUDGET raises all
// four numbers for that case:
//   - maxFiles 40 -> 200: a real assignment folder (excluding node_modules
//     etc., which SKIP_DIR still removes) realistically runs from a handful
//     of files to a couple hundred; 200 lets a normal submission through
//     uncut while still bounding a pathological one.
//   - maxBytes 220,000 -> 900,000: several times the size of a typical
//     assignment folder's source, so a normal submission fits with headroom,
//     while a run does not become unbounded (C1 item 3 - caps still exist).
//   - perFileBytes 8,000 -> 40,000: most individual source files are well
//     under 40 KB, so a scoped digest can usually include a file WHOLE
//     instead of an 8 KB fragment, without letting one huge generated file
//     eat the entire budget.
//   - maxBlobBytes (the "never even fetch it" ceiling) 60,000 -> 400,000: kept
//     above maxBytes/perFileBytes headroom so the fetch ceiling is never the
//     tightest constraint; anything still too large to fetch at that size is
//     overwhelmingly a generated/vendored artifact, not code to grade.
// The unprefixed defaults are UNCHANGED - other callers (ingestRepoAction,
// rubric sourcing from a reference repo, course materials) depend on them.
export const DEFAULT_BUDGET = { maxFiles: 40, maxBytes: 220_000, perFileBytes: 8_000, maxBlobBytes: 60_000 } as const;
export const SCOPED_BUDGET = { maxFiles: 200, maxBytes: 900_000, perFileBytes: 40_000, maxBlobBytes: 400_000 } as const;

export interface SelectDigestFilesOpts {
  maxFiles: number;
  maxBytes: number;
  perFileBytes: number;
  maxBlobBytes: number;
  pathPrefix?: string;
}

export interface DigestSelection {
  /** Files chosen for the digest, in read order, already within the file-count/byte budget. */
  selected: RepoTreeEntry[];
  /** True only when `pathPrefix` was given and matched no blob anywhere in the tree. */
  prefixMatchedNothing: boolean;
  skipped: { type: number; size: number; budget: number };
}

/**
 * Pure selection logic: given a repo tree and budget, decide which blobs make
 * it into the digest and why the rest did not. No network access, so this is
 * unit-testable directly against hand-built trees.
 *
 * Prefix matching is case-insensitive, anchored at the path root, and a
 * trailing slash is enforced before comparing (so "week1" cannot match
 * "week10") - this must stay exact per C4 item 11; do not make it fuzzy. If
 * the prefix matches nothing at all, that is reported via
 * `prefixMatchedNothing` rather than guessed at or silently treated as "no
 * prefix".
 */
export function selectDigestFiles(tree: RepoTreeEntry[], opts: SelectDigestFilesOpts): DigestSelection {
  const prefix = opts.pathPrefix
    ? (opts.pathPrefix.endsWith("/") ? opts.pathPrefix : `${opts.pathPrefix}/`).toLowerCase()
    : "";
  const scoped = !!prefix;

  const blobsInScope = tree.filter((t) => t.type === "blob" && (!scoped || t.path.toLowerCase().startsWith(prefix)));

  if (scoped && blobsInScope.length === 0) {
    return { selected: [], prefixMatchedNothing: true, skipped: { type: 0, size: 0, budget: 0 } };
  }

  const skipped = { type: 0, size: 0, budget: 0 };
  const candidates: RepoTreeEntry[] = [];
  for (const t of blobsInScope) {
    if (t.size <= 0) continue; // empty file: nothing to feed the model, not a meaningful exclusion to report
    if (t.size >= opts.maxBlobBytes) {
      skipped.size += 1;
      continue;
    }
    if (SKIP_DIR.test(t.path) || SKIP_FILE.test(t.path) || !isTextCandidate(t.path, t.mode)) {
      skipped.type += 1;
      continue;
    }
    candidates.push(t);
  }
  candidates.sort((a, b) => pathRank(a.path) - pathRank(b.path) || a.path.localeCompare(b.path));

  const selected: RepoTreeEntry[] = [];
  let used = 0;
  let count = 0;
  for (const c of candidates) {
    if (count >= opts.maxFiles || used >= opts.maxBytes) {
      skipped.budget += 1;
      continue; // keep counting the rest - each remaining candidate was also cut by the cap
    }
    const sliceLen = Math.min(opts.perFileBytes, opts.maxBytes - used, c.size);
    selected.push(c);
    used += sliceLen;
    count += 1;
  }

  return { selected, prefixMatchedNothing: false, skipped };
}

/**
 * Build a bounded text digest of a repo (README + selected source files) for the
 * LLM. Skips binaries, dependencies, and lockfiles, and caps file count + bytes
 * so a large repo never blows the token budget. When `pathPrefix` is given the
 * budget is raised to match a folder-scoped grading run - see SCOPED_BUDGET.
 */
export async function ingestRepo(
  owner: string,
  repo: string,
  opts: { maxFiles?: number; maxBytes?: number; perFileBytes?: number; maxBlobBytes?: number; pathPrefix?: string } = {},
  ref?: string
): Promise<RepoDigest> {
  const budget = opts.pathPrefix ? SCOPED_BUDGET : DEFAULT_BUDGET;
  const maxFiles = opts.maxFiles ?? budget.maxFiles;
  const maxBytes = opts.maxBytes ?? budget.maxBytes;
  const perFileBytes = opts.perFileBytes ?? budget.perFileBytes;
  const maxBlobBytes = opts.maxBlobBytes ?? budget.maxBlobBytes;

  const info = await getRepo(owner, repo);
  const branch = ref || info.defaultBranch;
  const { entries: tree, truncated: treeTruncated } = await getRepoTreeWithMeta(owner, repo, branch);

  const selection = selectDigestFiles(tree, { maxFiles, maxBytes, perFileBytes, maxBlobBytes, pathPrefix: opts.pathPrefix });
  const header = `# Repository: ${info.fullName}${info.description ? `\n\n${info.description}` : ""}`;

  if (selection.prefixMatchedNothing) {
    return {
      fullName: info.fullName,
      description: info.description,
      fileCount: 0,
      text: header,
      truncated: treeTruncated,
      files: [],
      prefixMatchedNothing: true,
      skipped: { type: 0, size: 0, budget: 0, fetchError: 0 },
      treeTruncated,
    };
  }

  const parts: string[] = [header];
  const files: RepoFile[] = [];
  let used = 0;
  let count = 0;
  let fetchErrorCount = 0;
  // The selection already respects the budget; `truncated` starts true if the
  // size ceiling or the count/byte cap already excluded anything, so that a
  // fetch that happens to fail below does not mask exclusions that already
  // happened above (C2 item 4/5 - the flag must reflect everything dropped).
  let truncated = selection.skipped.size > 0 || selection.skipped.budget > 0 || treeTruncated;

  for (const f of selection.selected) {
    let body: string;
    try {
      body = await getFileText(owner, repo, f.path, branch);
    } catch {
      fetchErrorCount += 1;
      truncated = true;
      continue;
    }
    const perFileBudget = Math.min(perFileBytes, maxBytes - used);
    const slice = body.slice(0, perFileBudget);
    // The one place this fact is ever computed - callers (the repo grading
    // actions, F3) carry `fileTruncated` through as `previewTruncated` rather
    // than re-deriving it, so there is exactly one source of truth for
    // whether a given file's preview is honest.
    const fileTruncated = slice.length < body.length;
    if (fileTruncated) truncated = true;
    parts.push(`\n\n--- FILE: ${f.path} ---\n${slice}`);
    files.push({ path: f.path, content: slice, truncated: fileTruncated });
    used += slice.length;
    count += 1;
  }

  return {
    fullName: info.fullName,
    description: info.description,
    fileCount: count,
    text: parts.join(""),
    truncated,
    files,
    prefixMatchedNothing: false,
    skipped: { type: selection.skipped.type, size: selection.skipped.size, budget: selection.skipped.budget, fetchError: fetchErrorCount },
    treeTruncated,
  };
}

/**
 * Removes from a digest whatever file was used as the ASSIGNMENT
 * INSTRUCTIONS, so that exact content is never also fed to the grader as if
 * it were the student's own submission. This is the fix for a real grading
 * defect: `gradeRepoAction` (src/app/actions/github-repos.ts) used to pull a
 * folder's README out of the digest to use as instructions (via
 * pickReadmeInstructions) but then left that same README sitting in
 * `digest.files`/`digest.text` - so a student who submitted nothing but the
 * assignment's own README (which, in the reported case, contained a full
 * worked solution) was graded against the model answer as if it were their
 * work.
 *
 * A file is excluded when EITHER:
 * - its `path` equals `instructionsPath` (the file pickReadmeInstructions
 *   actually chose, when the caller used that flow), or
 * - its `content`, trimmed, equals `instructionsText` (trimmed, and only
 *   when non-empty) - a defensive, path-independent check that also closes
 *   the same shape of defect for a caller that fetches a folder's README
 *   ITSELF (via a separate getFileText call) and passes it straight in as
 *   the instructions argument, without ever going through
 *   pickReadmeInstructions or setting a "use the README" flag (see
 *   steps.grading-repos.helpers.ts's resolveReadmeInstructions, used by
 *   gradeTileRepos/gradeOrgRepos) - gradeRepoAction has no path to go on for
 *   that caller, only the text, so the content check is what catches it), or
 * - the file is marked `truncated` AND its (trimmed) `content` is a
 *   non-empty PREFIX of `instructionsText` (trimmed) - covers the same
 *   caller when its README was long enough to be cut by THIS digest's own
 *   per-file budget (perFileBytes: 8,000 bytes when no folder was scoped,
 *   see DEFAULT_BUDGET/SCOPED_BUDGET above), while `instructionsText` was
 *   fetched separately, in full, by `getFileText`. Without this branch the
 *   two strings are no longer byte-identical (one is a slice of the other)
 *   so the exact-match check above silently fails and the original defect
 *   reappears for any instructions file over the active per-file budget.
 *   Gated strictly on `f.truncated` - never loosened to a prefix match for
 *   an untruncated file, which could wrongly exclude a student file that
 *   legitimately happens to start with the same text as the instructions.
 *
 * Rebuilds `text`/`fileCount` from the surviving files in the exact same
 * format `ingestRepo` itself builds them in (header, then one
 * "--- FILE: path ---" block per remaining file) so `content`,
 * `submittedFiles`, and `mergedFileCount` downstream (repoDigestToEmbeddedEntry)
 * always agree on what was actually graded. Returns `digest` UNCHANGED
 * (same reference) when nothing actually matched, so a caller that never
 * used README instructions pays no cost and sees no accidental behavior
 * change.
 */
export function excludeInstructionsFromDigest(
  digest: RepoDigest,
  opts: { instructionsPath?: string; instructionsText?: string }
): RepoDigest {
  const trimmedInstructions = opts.instructionsText?.trim() ?? "";
  const matches = (f: RepoFile): boolean => {
    if (opts.instructionsPath && f.path === opts.instructionsPath) return true;
    if (trimmedInstructions === "") return false;
    const trimmedContent = f.content.trim();
    if (trimmedContent === trimmedInstructions) return true;
    // f.truncated is required here: only a file THIS digest actually cut
    // short can legitimately be a strict prefix of the separately-fetched,
    // untruncated instructions text. An untruncated file is held to exact
    // equality only, so a student file that happens to start the same way
    // is never excluded on a prefix alone.
    return f.truncated && trimmedContent !== "" && trimmedInstructions.startsWith(trimmedContent);
  };

  const files = digest.files.filter((f) => !matches(f));
  if (files.length === digest.files.length) return digest;

  const header = `# Repository: ${digest.fullName}${digest.description ? `\n\n${digest.description}` : ""}`;
  const text = [header, ...files.map((f) => `\n\n--- FILE: ${f.path} ---\n${f.content}`)].join("");

  return { ...digest, files, fileCount: files.length, text };
}

/** Download a repo as a zip archive (GitHub's zipball) at `ref` / default branch. */
export async function downloadRepoZipball(owner: string, repo: string, ref?: string): Promise<Buffer> {
  const branch = ref || (await getRepo(owner, repo)).defaultBranch;
  const res = await ghFetch(`/repos/${owner}/${repo}/zipball/${encodeURIComponent(branch)}`);
  return Buffer.from(await res.arrayBuffer());
}
