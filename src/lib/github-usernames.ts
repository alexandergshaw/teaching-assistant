/**
 * Normalize and validate GitHub usernames from student submissions.
 */

export function normalizeGithubHandle(raw: string): string {
  let s = (raw ?? "").trim();
  if (!s) return "";

  const urlMatch = s.match(/github\.com\/([^/\s?#]+)/i);
  if (urlMatch) s = urlMatch[1];

  s = s.split(/\s+/)[0] ?? "";
  s = s.replace(/^@+/, "").replace(/[\/,.;:]+$/, "");

  return s;
}

export function isValidGithubUsername(s: string): boolean {
  return /^[a-zA-Z0-9](?:[a-zA-Z0-9]|-(?=[a-zA-Z0-9])){0,38}$/.test(s);
}

export function extractGithubHandle(raw: string): { handle: string; ok: boolean } {
  const t = (raw ?? "").trim();
  if (!t) return { handle: "", ok: false };

  const urlMatch = t.match(/^https?:\/\/(?:www\.)?github\.com\/([^/\s?#]+)/i);
  if (urlMatch) {
    const h = urlMatch[1];
    return { handle: h, ok: isValidGithubUsername(h) };
  }

  const stripped = t.replace(/^@+/, "");
  if (/\s/.test(stripped)) return { handle: normalizeGithubHandle(t), ok: false };

  return { handle: stripped, ok: isValidGithubUsername(stripped) };
}
