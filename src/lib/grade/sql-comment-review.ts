/**
 * Narrow preflight for explicit written SQL-comment requirements. This only
 * identifies a reason for instructor review; it neither scores nor asserts
 * that a comment, when present, satisfies the assignment.
 */
export function missingSqlCommentRequiresReview(
  instructions: string, files: readonly { path: string; content: string }[],
): boolean {
  if (!/\bin\s+(?:an?\s+)?comment\s+of\s+at\s+least\s+(?:\d+|one|two|three|four|five|six|seven|eight|nine|ten)\s+sentences?\b/i.test(instructions)) return false;
  if (!files.length || files.some((file) => !/\.sql$/i.test(file.path))) return false;
  return files.every((file) => !/--|\/\*|^\s*#/m.test(file.content));
}
