/** Generic roster replies never consume individual posts. */
export function parseDiscussionRoster(value: string): string[] {
  return value.split(/\r?\n/).map((name) => name.trim()).filter(Boolean);
}
export function defaultDiscussionPrompt(discussion: string): string {
  return `Write one reusable instructor reply template for the discussion prompt below. It must work for every student without claiming to have read or evaluated any student's post. Do not mention specific student content. Use {{name}} for the student's name. Return only the reply template.\n\nDiscussion prompt:\n${discussion}`;
}
export function personalizeDiscussionReply(template: string, name: string): string {
  const normalized = template.trim();
  return /\{\{\s*name\s*\}\}/i.test(normalized)
    ? normalized.replace(/\{\{\s*name\s*\}\}/gi, () => name)
    : `Hi ${name},\n\n${normalized}`;
}
