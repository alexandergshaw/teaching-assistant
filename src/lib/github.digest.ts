// Codebase digest for LLM analysis (course/rubric generation, grading).

import { getRepo } from "./github.repos";
import { getRepoTree, getFileText } from "./github.files";
import { ghFetch } from "./github.repos";

// Text/code file extensions worth feeding to a model.
const TEXT_EXT = new Set([
  "md", "mdx", "txt", "rst", "js", "ts", "tsx", "jsx", "mjs", "cjs", "py", "java", "c", "cc", "cpp", "h", "hpp",
  "cs", "go", "rb", "php", "rs", "swift", "kt", "scala", "html", "css", "scss", "sass", "vue", "svelte", "json",
  "yml", "yaml", "toml", "sql", "sh", "bash", "r", "ipynb", "dockerfile",
]);
const SKIP_DIR = /(^|\/)(node_modules|\.git|dist|build|out|\.next|\.nuxt|vendor|venv|\.venv|__pycache__|coverage|\.idea|\.vscode|target)(\/|$)/;
const SKIP_FILE = /(package-lock\.json|yarn\.lock|pnpm-lock\.yaml|poetry\.lock|\.min\.(js|css)$|\.map$)/;

const fileExt = (path: string): string => path.split(".").pop()?.toLowerCase() ?? "";

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
}

/**
 * Build a bounded text digest of a repo (README + selected source files) for the
 * LLM. Skips binaries, dependencies, and lockfiles, and caps file count + bytes
 * so a large repo never blows the token budget.
 */
export async function ingestRepo(
  owner: string,
  repo: string,
  opts: { maxFiles?: number; maxBytes?: number; perFileBytes?: number; pathPrefix?: string } = {},
  ref?: string
): Promise<RepoDigest> {
  const maxFiles = opts.maxFiles ?? 40;
  const maxBytes = opts.maxBytes ?? 220_000;
  const perFileBytes = opts.perFileBytes ?? 8_000;
  const prefix = opts.pathPrefix
    ? (opts.pathPrefix.endsWith("/") ? opts.pathPrefix : `${opts.pathPrefix}/`).toLowerCase()
    : "";

  const info = await getRepo(owner, repo);
  const branch = ref || info.defaultBranch;
  const tree = await getRepoTree(owner, repo, branch);
  const candidates = tree
    .filter(
      (t) =>
        t.type === "blob" &&
        t.size > 0 &&
        t.size < 60_000 &&
        (!prefix || t.path.toLowerCase().startsWith(prefix)) &&
        !SKIP_DIR.test(t.path) &&
        !SKIP_FILE.test(t.path) &&
        (TEXT_EXT.has(fileExt(t.path)) || /(^|\/)(readme|dockerfile|makefile)$/i.test(t.path.toLowerCase()))
    )
    .sort((a, b) => pathRank(a.path) - pathRank(b.path) || a.path.localeCompare(b.path));

  const parts: string[] = [`# Repository: ${info.fullName}${info.description ? `\n\n${info.description}` : ""}`];
  const files: RepoFile[] = [];
  let used = 0;
  let count = 0;
  let truncated = false;
  for (const f of candidates) {
    if (count >= maxFiles || used >= maxBytes) {
      truncated = true;
      break;
    }
    let body: string;
    try {
      body = await getFileText(owner, repo, f.path, branch);
    } catch {
      continue;
    }
    const budget = Math.min(perFileBytes, maxBytes - used);
    const slice = body.slice(0, budget);
    if (slice.length < body.length) truncated = true;
    parts.push(`\n\n--- FILE: ${f.path} ---\n${slice}`);
    files.push({ path: f.path, content: slice });
    used += slice.length;
    count += 1;
  }
  return { fullName: info.fullName, description: info.description, fileCount: count, text: parts.join(""), truncated, files };
}

/** Download a repo as a zip archive (GitHub's zipball) at `ref` / default branch. */
export async function downloadRepoZipball(owner: string, repo: string, ref?: string): Promise<Buffer> {
  const branch = ref || (await getRepo(owner, repo)).defaultBranch;
  const res = await ghFetch(`/repos/${owner}/${repo}/zipball/${encodeURIComponent(branch)}`);
  return Buffer.from(await res.arrayBuffer());
}
