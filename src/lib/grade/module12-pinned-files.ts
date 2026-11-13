import "server-only";
import { getRepoCommitTree } from "@/lib/github.repos";
import { makePinnedArchiveBytesReader } from "@/lib/github-grade-archive";
import { isScaffoldingFile } from "@/lib/github.digest";
import { isInstructionReadmeDocument } from "@/lib/repo-readme-instructions";
import type { SubmissionFileInventory } from "@/lib/grade/submission-file-inventory";

export class Module12PinnedFileError extends Error {
  constructor(readonly code: "inventory-incomplete" | "tree-incomplete" | "inventory-mismatch" | "invalid-exclusions"
    | "unreadable-evidence" | "source-limit" | "required-source-missing" | "source-bytes-incomplete", message: string) { super(message); }
}

/** Read all reviewable assignment members from the exact commit as verified
 * Git blobs. Artifact exclusions are returned separately and must remain in
 * result provenance. Never execute source when enumeration or reads are partial. */
export async function readModule12PinnedFiles(input: {
  owner: string; repo: string; accountId: string; sourceCommit: string;
  inventory: SubmissionFileInventory | undefined; excludedArtifacts: readonly string[]; signal: AbortSignal;
}): Promise<Array<{ path: string; bytes: Buffer }>> {
  const folder = "assignments/module_12";
  const { inventory, signal } = input;
  if (!inventory?.enumerationComplete || inventory.scope.kind !== "tree" || inventory.scope.path !== folder) throw new Module12PinnedFileError("inventory-incomplete", "Incomplete assignment inventory");
  const tree = await getRepoCommitTree(input.owner, input.repo, input.sourceCommit,
    { signal, cache: "no-store", redirect: "error", treeCacheAccountId: input.accountId });
  signal.throwIfAborted();
  if (tree.truncated || tree.unenumerated || tree.excluded?.some((entry) => entry.path.startsWith(`${folder}/`))) throw new Module12PinnedFileError("tree-incomplete", "Incomplete pinned repository tree");
  const entries = tree.entries.filter((entry) => entry.type === "blob" && entry.path.startsWith(`${folder}/`)
    && !isScaffoldingFile(entry.path) && !isInstructionReadmeDocument(entry.path));
  const inventoryPaths = inventory.files.map((file) => file.path);
  if (new Set(inventoryPaths).size !== inventoryPaths.length || new Set(entries.map((entry) => entry.path)).size !== entries.length
    || entries.length !== inventoryPaths.length || entries.some((entry) => !inventoryPaths.includes(entry.path))) throw new Module12PinnedFileError("inventory-mismatch", "Assignment inventory does not match pinned tree");
  const excluded = new Set(input.excludedArtifacts);
  if (excluded.size !== input.excludedArtifacts.length || [...excluded].some((path) => !inventoryPaths.includes(path))) throw new Module12PinnedFileError("invalid-exclusions", "Invalid artifact exclusions");
  if (inventory.files.some((file) => !excluded.has(file.path) && file.content !== "read")) throw new Module12PinnedFileError("unreadable-evidence", "Assignment contains unreadable or incomplete evidence");
  const selected = entries.filter((entry) => !excluded.has(entry.path));
  if (selected.some((entry) => !["100644", "100755"].includes(entry.mode ?? "") || !Number.isSafeInteger(entry.size) || entry.size < 0 || entry.size > 100_000)
    || selected.length > 100 || selected.reduce((sum, entry) => sum + entry.size, 0) > 1_000_000) throw new Module12PinnedFileError("source-limit", "Assignment files exceed execution limits");
  for (const name of ["test_utils.py", "TestUtils.java", "test_utils.cpp"]) {
    if (selected.filter((entry) => entry.path === `${folder}/${name}`).length !== 1) throw new Module12PinnedFileError("required-source-missing", "Required source file is missing");
  }
  const bytes = await makePinnedArchiveBytesReader({ accountId: input.accountId, owner: input.owner, repo: input.repo, sha: input.sourceCommit })(selected, signal);
  signal.throwIfAborted();
  return selected.map((entry) => {
    const content = bytes.get(entry.path);
    if (!content || content.length !== entry.size) throw new Module12PinnedFileError("source-bytes-incomplete", "Pinned source bytes are incomplete");
    return { path: entry.path, bytes: content };
  });
}
