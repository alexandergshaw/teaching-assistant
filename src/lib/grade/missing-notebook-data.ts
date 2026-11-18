import type { SubmittedFileInfo } from "./types";
import type { SubmissionFileInventory } from "./submission-file-inventory";

/** Identify only a literal root-relative pandas CSV read with a complete,
 * unambiguous repository inventory. An absent path is not proof that the
 * student failed to generate it or that it was absent at submission time. */
export function missingNotebookCsv(files: readonly SubmittedFileInfo[], inventories: readonly SubmissionFileInventory[] | undefined): string | null {
  if (!inventories || inventories.length !== 1 || inventories[0].scope.kind !== "repository" || !inventories[0].enumerationComplete) return null;
  const notebooks = files.filter((file) => /\.ipynb$/i.test(file.name));
  if (notebooks.length !== 1 || notebooks[0].name.includes("/") || notebooks[0].previewTruncated || notebooks[0].previewContent.length > 2_000_000 || !inventories[0].files.some((file) => file.path === notebooks[0].name && file.content === "read")) return null;
  try {
    const parsed = JSON.parse(notebooks[0].previewContent);
    if (!Array.isArray(parsed?.cells) || parsed.cells.length > 500) return null;
    let pandasImported = false; const written = new Set<string>();
    for (const cell of parsed.cells) {
      if (cell?.cell_type !== "code") continue;
      const source = typeof cell.source === "string" ? cell.source : Array.isArray(cell.source) && cell.source.every((part: unknown) => typeof part === "string") ? cell.source.join("") : null;
      if (source === null) return null;
      for (const line of source.split(/\r?\n/)) {
        if (line.includes('"""') || line.includes("'''")) return null;
        if (/^import\s+pandas\s+as\s+pd\s*(?:#.*)?$/.test(line)) pandasImported = true;
        const write = /^[A-Za-z_]\w*\.to_csv\(\s*(['"])((?:\.\/)?data\/[A-Za-z0-9_.\-/]+\.csv)\1\s*(?:,|\))/.exec(line);
        if (write) written.add(write[2].replace(/^\.\//, ""));
        if (!pandasImported) continue;
        const match = /^(?:[A-Za-z_]\w*\s*=\s*)?pd\.read_csv\(\s*(['"])((?:\.\/)?data\/[A-Za-z0-9_.\-/]+\.csv)\1\s*\)\s*(?:#.*)?$/.exec(line);
        if (!match) continue;
        const path = match[2].replace(/^\.\//, "");
        if (path.length > 512 || path.split("/").some((part) => !part || part === "." || part === "..")) continue;
        if (!written.has(path) && !inventories[0].files.some((file) => file.path === path)) return path;
      }
    }
  } catch { /* Invalid notebook is handled by the existing evidence guard. */ }
  return null;
}
