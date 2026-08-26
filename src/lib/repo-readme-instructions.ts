// Picks the README that best describes a graded folder, so an instructor
// grading "what's in this assignment dir" does not have to retype the
// assignment instructions when the README sitting in that folder already
// says them. Pure - the caller (gradeRepoAction) does the I/O via ingestRepo
// and passes in the already-fetched digest files.

/** A README chosen as assignment instructions, and where it came from. */
export interface ReadmePick {
  /** The README's content, to be used as the assignment instructions. */
  instructions: string;
  /** The path it came from, for the log and the UI. */
  path: string;
}

/**
 * Depth of `path` relative to `base` (a `pathPrefix`, or "" for the digest
 * root). A file directly inside `base` is depth 0; each further folder
 * segment adds one. Used only for the shallowest-wins comparison below - not
 * exposed, since callers only need the winning pick.
 *
 * When `base` is given and `path` does not actually fall under it, depth is
 * Infinity rather than being measured against the unstripped full path - a
 * README living outside the graded folder (e.g. the repo's own root README
 * sitting beside the assignment folder being graded) must never be mistaken
 * for depth 0 and beat, or wrongly tie, the assignment folder's own README.
 * In practice callers only pass digest files already scoped to `pathPrefix`,
 * so this only matters as a defensive fallback.
 */
function depthRelativeTo(path: string, base: string): number {
  if (!base) return path.split("/").length - 1;
  const prefix = base.endsWith("/") ? base : `${base}/`;
  if (!path.toLowerCase().startsWith(prefix.toLowerCase())) return Infinity;
  const rest = path.slice(prefix.length);
  return rest.split("/").length - 1;
}

/**
 * Tie-break rank once depth is equal: exact "README.md" first, then
 * "readme.txt", then everything else matching /readme/i, each bucket then
 * ordered lexicographically by full path. Named and ranked explicitly (not
 * left to sort stability) so the same repo always yields the same pick
 * regardless of tree listing order.
 */
function nameRank(basename: string): number {
  if (basename === "README.md") return 0;
  if (basename.toLowerCase() === "readme.txt") return 1;
  return 2;
}

/**
 * Picks the README that best describes the graded folder. Returns null when
 * the digest has no README at all - the caller then falls back to whatever
 * instructions it already had, and must SAY it did.
 */
export function pickReadmeInstructions(
  files: readonly { path: string; content: string }[],
  pathPrefix?: string
): ReadmePick | null {
  // Match on the basename only (rule 1): a folder literally named "readmes/"
  // or a file like "not-a-readme-parser.ts" must not win just because
  // "readme" appears somewhere earlier in the path.
  const candidates = files.filter((f) => {
    const base = f.path.split("/").pop() ?? f.path;
    return /readme/i.test(base);
  });

  const base = pathPrefix ?? "";
  let best: { file: { path: string; content: string }; depth: number; rank: number } | null = null;

  for (const file of candidates) {
    const depth = depthRelativeTo(file.path, base);
    const basename = file.path.split("/").pop() ?? file.path;
    const rank = nameRank(basename);
    if (
      !best ||
      depth < best.depth ||
      (depth === best.depth && rank < best.rank) ||
      (depth === best.depth && rank === best.rank && file.path.localeCompare(best.file.path) < 0)
    ) {
      best = { file, depth, rank };
    }
  }

  if (!best) return null;
  // A README with no real content is not a usable pick (rule 4) - grading
  // against an empty instruction string would let the model invent its own
  // criteria instead of failing loudly or falling back honestly.
  if (!best.file.content.trim()) return null;

  return { instructions: best.file.content, path: best.file.path };
}
