/** Extract SQL comments without treating quoted strings or identifiers as comments.
 * An unterminated quote/comment is uncertain and must be reviewed. */
function sqlComments(source: string): { blocks: string[]; uncertain: boolean } {
  const comments: string[] = [];
  let i = 0;
  let previousLineEnd = -1;
  while (i < source.length) {
    const start = i;
    if (source[i] === "#") return { blocks: comments, uncertain: true }; // Dialect-dependent operator or comment.
    if (source.startsWith("--", i)) {
      i += 2;
      const end = source.indexOf("\n", i);
      const text = source.slice(i, end < 0 ? source.length : end);
      if (previousLineEnd >= 0 && /^[ \t]*$/.test(source.slice(previousLineEnd, start))) comments[comments.length - 1] += `\n${text}`;
      else comments.push(text);
      i = end < 0 ? source.length : end + 1;
      previousLineEnd = i;
    } else if (source.startsWith("/*", i)) {
      const executable = source[i + 2] === "!" || source[i + 2] === "+";
      i += 2;
      let depth = 1;
      const from = i;
      while (i < source.length && depth) {
        if (source.startsWith("/*", i)) { depth++; i += 2; }
        else if (source.startsWith("*/", i)) { depth--; i += 2; }
        else i++;
      }
      if (depth) return { blocks: comments, uncertain: true };
      if (!executable) comments.push(source.slice(from, i - 2));
      previousLineEnd = -1;
    } else {
      const quote = source[i];
      const dollar = quote === "$" ? source.slice(i).match(/^\$(?:[A-Za-z_][A-Za-z_0-9]*)?\$/)?.[0] : undefined;
      if (dollar) {
        const end = source.indexOf(dollar, i + dollar.length);
        if (end < 0) return { blocks: comments, uncertain: true };
        i = end + dollar.length;
      } else if (quote === "'" || quote === '"' || quote === "`" || quote === "[") {
        const close = quote === "[" ? "]" : quote;
        i++;
        let closed = false;
        while (i < source.length) {
          if (source[i] === "\\") return { blocks: comments, uncertain: true }; // Escape rules differ by dialect.
          if (source[i] === close) {
            if (source[i + 1] === close) { i += 2; continue; }
            i++; closed = true; break;
          }
          i++;
        }
        if (!closed) return { blocks: comments, uncertain: true };
      } else i++;
    }
    if (i <= start) return { blocks: comments, uncertain: true };
  }
  return { blocks: comments, uncertain: false };
}

/** Conservative preflight: absence, insufficient comment text, or uncertain
 * parsing requires review. Passing does not establish relevance or quality. */
export function missingSqlCommentRequiresReview(
  instructions: string, files: readonly { path: string; content: string }[],
): boolean {
  const requirement = instructions.match(/\bin\s+(?:an?\s+)?(sql\s+)?comment\s+of\s+at\s+least\s+(\d+|one|two|three|four|five|six|seven|eight|nine|ten)\s+sentences?\b/i);
  if (!requirement) return false;
  const sqlFiles = files.filter((file) => /\.sql$/i.test(file.path));
  if (!sqlFiles.length) return false;
  if (!requirement[1] && sqlFiles.length !== files.length) return false;
  const numbers: Record<string, number> = { one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9, ten: 10 };
  const required = numbers[requirement[2].toLowerCase()] ?? Number(requirement[2]);
  const parsed = sqlFiles.map((file) => sqlComments(file.content));
  return !parsed.some((file) => file.blocks.some((block) =>
    (block.match(/[\p{L}\p{N}][^.!?]*[.!?](?=\s|$)/gu) ?? []).length >= required));
}

