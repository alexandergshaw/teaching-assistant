import type { TreeEntry } from "@/lib/github-verified-tree";

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
