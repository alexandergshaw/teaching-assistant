/** Ignore well-known OS and version-control bookkeeping, not arbitrary hidden files. */
export function isArchiveBookkeeping(name: string): boolean {
  const segments = name.split("/");
  const leaf = segments.at(-1) ?? "";
  return segments.some((segment) => ["__MACOSX", ".git", ".svn", ".hg"].includes(segment)) ||
    [".ds_store", "thumbs.db", "desktop.ini"].includes(leaf.toLowerCase()) || leaf.startsWith("._");
}

/** Bounded refusal avoids grading a student's remaining files as complete. */
export function unsupportedArchiveReason(files: readonly string[]): string | null {
  if (!files.length) return null;
  if (files.some((file) => file === "PARTIAL_ARCHIVE_REQUIRES_REVIEW.json")) return "This partial archive includes omitted submissions and unverified ownership. Partial archive grading is not yet supported. Nothing was queued; retain the review record with the original archive.";
  const shown = files.slice(0, 3).map((file) => file.replace(/\s+/g, " ").trim().slice(0, 160) || "Unnamed file").join(", ");
  const more = files.length > 3 ? ` and ${files.length - 3} more` : "";
  return `Some files in the archive are not supported for grading: ${shown}${more}. Nothing was queued. Remove or convert those files and try again.`;
}

/** An unreadable file can belong to a student who also has readable files. */
export function unreadableArchiveReason(files: readonly string[]): string | null {
  if (!files.length) return null;
  const shown = files.slice(0, 3).map((file) => file.replace(/\s+/g, " ").trim().slice(0, 160) || "Unnamed file").join(", ");
  const more = files.length > 3 ? ` and ${files.length - 3} more` : "";
  return `Some files in the archive could not be read: ${shown}${more}. Nothing was queued. Fix the archive and try again.`;
}
