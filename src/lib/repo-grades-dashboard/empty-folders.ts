import type { TreeEntry } from "@/lib/github-verified-tree";
import { isInstructionReadmeDocument } from "@/lib/repo-readme-instructions";

/** Only a complete, cryptographically verified tree may establish absence.
 * Treat every non-placeholder file, symlink and submodule as possible work. */
export function provenEmptyFolders(folders: readonly string[], entries: Iterable<TreeEntry>): string[] {
  const rows = [...entries];
  return folders.filter((folder) => {
    const prefix = `${folder}/`;
    const descendants = rows.filter((row) => row.path.startsWith(prefix) && row.mode !== "040000");
    return descendants.length > 0 && descendants.every((row) =>
      (row.mode === "100644" || row.mode === "100755") && row.size === 0
      && row.sha === "e69de29bb2d1d6434b8b29ae775ad8c2e48c5391"
      && row.path.slice(row.path.lastIndexOf("/") + 1) === ".gitkeep");
  });
}

/** The text-capability retry is eligible only when a verified pinned tree
 * actually contains a file covered by the new text/extensionless support. */
export function provenTextRecoveryFolders(folders: readonly string[], entries: Iterable<TreeEntry>): string[] {
  const candidates = [...entries].filter((row) => {
    if (row.mode !== "100644" && row.mode !== "100755") return false;
    const name = row.path.slice(row.path.lastIndexOf("/") + 1);
    if (!name || name.startsWith(".") || isInstructionReadmeDocument(row.path)) return false;
    return /\.text$/i.test(name) || !name.includes(".");
  });
  return folders.filter((folder) => candidates.some((row) => row.path.startsWith(`${folder}/`)));
}
