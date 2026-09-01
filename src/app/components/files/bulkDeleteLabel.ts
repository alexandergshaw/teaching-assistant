// B1 (docs/ux-audit-files-content.md): "the confirm must state the count it
// is actually about to delete." Shared by both Files bulk-delete surfaces
// (files/BulkSelectionBar.tsx and content-tab/FilesView.tsx) so the wording
// cannot drift between the two copies of this same control, and so the
// count/singular-plural logic is one pure, directly-testable unit rather
// than an inline ternary repeated at each call site.
export function bulkDeleteConfirmLabel(confirmArmed: boolean, count: number): string {
  if (!confirmArmed) return "Delete";
  return `Confirm delete ${count} file${count === 1 ? "" : "s"}`;
}
