/** Recognize only a single URL, optionally after an explicit student heading. */
export function pastedSubmissionUrl(content: string): string | undefined {
  const text = content.replace(/^\s*(?:\d+[.)]\s*)?(?:student|student name|name)\s*:[^\n]*\n/i, "").replace(/\r?\n[ \t]*---+[ \t]*$/, "").trim();
  if (!/^https?:\/\/[^\s]+$/i.test(text)) return undefined;
  try {
    new URL(text);
    return text;
  } catch { return undefined; }
}
