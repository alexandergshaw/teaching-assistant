import "server-only";
import { getRepoCommitTree } from "@/lib/github.repos";
import { makePinnedArchiveBytesReader } from "@/lib/github-grade-archive";
import { isScaffoldingFile, SCOPED_BUDGET } from "@/lib/github.digest";
import { isInstructionReadmeDocument } from "@/lib/repo-readme-instructions";
import type { SubmissionFileInventory } from "@/lib/grade/submission-file-inventory";
import { MAX_GENERIC_EXECUTION_FILES, MAX_WINDOWS_EXECUTABLE_BYTES, MAX_WINDOWS_INVENTORY_BYTES } from "./generic-execution-limits";

/** Whole scoped inventory, verified against commit tree and individual Git blob hashes. */
export async function readGenericPinnedInventory(input: {
  owner: string; repo: string; accountId: string; sourceCommit: string; folder: string;
  inventory: SubmissionFileInventory | undefined; signal: AbortSignal;
}): Promise<Array<{path:string;bytes:Buffer}>> {
  const { inventory, folder, signal } = input;
  if (!inventory?.enumerationComplete || (folder ? inventory.scope.kind !== "tree" || inventory.scope.path !== folder : inventory.scope.kind !== "repository" || inventory.scope.path !== null)) throw new Error("Incomplete scoped execution inventory");
  const tree = await getRepoCommitTree(input.owner, input.repo, input.sourceCommit, {signal,cache:"no-store",redirect:"error",treeCacheAccountId:input.accountId});
  signal.throwIfAborted();
  const inScope = (path: string) => !folder || path.startsWith(`${folder}/`);
  if (tree.truncated || tree.unenumerated || tree.excluded?.some(entry => inScope(entry.path))) throw new Error("Incomplete pinned execution tree");
  const entries = tree.entries.filter(entry => entry.type === "blob" && inScope(entry.path) && !isScaffoldingFile(entry.path) && !isInstructionReadmeDocument(entry.path));
  const listed = inventory.files.map(file => file.path);
  if (new Set(listed).size !== listed.length || new Set(entries.map(entry => entry.path)).size !== entries.length || entries.length !== listed.length || entries.some(entry => !listed.includes(entry.path))) throw new Error("Execution inventory does not match pinned tree");
  if (!entries.length || entries.length > MAX_GENERIC_EXECUTION_FILES || entries.some(entry => !["100644","100755"].includes(entry.mode ?? "") || !Number.isSafeInteger(entry.size) || entry.size < 0 || (/\.exe$/i.test(entry.path) ? entry.size > MAX_WINDOWS_EXECUTABLE_BYTES : entry.size >= SCOPED_BUDGET.maxBlobBytes)) || entries.reduce((n,entry) => n+entry.size,0) > MAX_WINDOWS_INVENTORY_BYTES) throw new Error("Execution inventory exceeds supported bounds");
  const bytes = await makePinnedArchiveBytesReader({owner:input.owner,repo:input.repo,accountId:input.accountId,sha:input.sourceCommit})(entries,signal);
  signal.throwIfAborted();
  return entries.map(entry => { const content=bytes.get(entry.path); if(!content || content.length!==entry.size) throw new Error("Pinned execution bytes are incomplete"); return {path:entry.path,bytes:content}; });
}
