import { createHash } from "node:crypto";
import { createGithubBoundedReadContext } from "../github-bounded-read";
import { getFileBytes, getRepoTreeWithMeta } from "../github.files";
import { isSafeGenericExecutionComponent } from "./generic-execution-path";
import type { NotebookKernelFile } from "./notebook-kernel-runner";
import { inventoryPathInScope } from "./submission-file-inventory";
import { NOTEBOOK_PROJECT_MAX_BYTES, NOTEBOOK_PROJECT_MAX_FILES } from "./notebook-project-limits";

/** Collect a complete pinned project for execution; never silently skip a file. */
export async function collectNotebookProject(owner: string, repo: string, commit: string, deadline: number, scope: { kind: "repository" | "tree" | "blob"; path: string | null } = { kind: "repository", path: null }): Promise<NotebookKernelFile[]> {
  if (!/^[A-Za-z0-9-]{1,100}$/.test(owner) || !/^[A-Za-z0-9_.-]{1,100}$/.test(repo) || /^\.{1,2}$/.test(repo) || !/^[a-f0-9]{40}$/i.test(commit)) throw new Error("A pinned repository is required.");
  const context = createGithubBoundedReadContext(deadline, NOTEBOOK_PROJECT_MAX_BYTES + 1_000_000);
  try {
    const tree = await getRepoTreeWithMeta(owner, repo, commit, context);
    const files = tree.entries.filter(entry => entry.type === "blob" && inventoryPathInScope(entry.path, scope));
    if (tree.truncated || tree.unenumerated || (tree.excluded ?? []).some(entry => inventoryPathInScope(entry.path, scope)) || !files.length || files.length > NOTEBOOK_PROJECT_MAX_FILES) throw new Error("Project enumeration is incomplete.");
    const paths = new Set<string>(); const result: NotebookKernelFile[] = []; let total = 0;
    for (const file of files) {
      if (!file.path || file.path.length > 200 || file.path.split("/").some(part => !part || part.startsWith("-") || !isSafeGenericExecutionComponent(part)) || paths.has(file.path.toLowerCase()) || !["100644", "100755"].includes(file.mode ?? "") || !/^[a-f0-9]{40}$/i.test(file.sha) || !Number.isSafeInteger(file.size) || file.size < 0 || file.size > NOTEBOOK_PROJECT_MAX_BYTES || total + file.size > NOTEBOOK_PROJECT_MAX_BYTES) throw new Error("Project cannot be staged safely.");
      paths.add(file.path.toLowerCase()); total += file.size;
      const bytes = await getFileBytes(owner, repo, file.path, commit, context, Math.max(file.size, 1));
      const hash = createHash("sha1").update(`blob ${bytes.byteLength}\0`).update(bytes).digest("hex");
      if (bytes.byteLength !== file.size || hash !== file.sha.toLowerCase()) throw new Error("Project file integrity check failed.");
      result.push({ path: file.path, content: bytes });
    }
    return result;
  } finally { context.dispose(); }
}
