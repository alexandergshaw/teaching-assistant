/** Accept the cell-based Jupyter format; unknown major versions require review. */
export function hasSupportedNotebookHeader(value: unknown): boolean {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const notebook = value as { nbformat?: unknown; nbformat_minor?: unknown; cells?: unknown };
  return notebook.nbformat === 4 && Number.isSafeInteger(notebook.nbformat_minor) && (notebook.nbformat_minor as number) >= 0 && Array.isArray(notebook.cells);
}
