/** Generic roster replies never consume individual posts. */
export type DiscussionDraft = { discussion: string; roster: string; promptOverride: string | null; overrideDiscussion: string; template: string; generatedFromDiscussion: string | null };
export function discussionDraftKey(userId: string | null): string | null {
  return userId ? `ta-discussions-draft-v1:${userId}` : null;
}
export function readDiscussionDraft(storage: Pick<Storage, "getItem">, userId: string | null): DiscussionDraft | null {
  const key = discussionDraftKey(userId);
  const raw = key ? storage.getItem(key) : null;
  if (!raw) return null;
  const value: unknown = JSON.parse(raw);
  if (!value || typeof value !== "object") throw new Error("Invalid discussion draft");
  const d = value as Record<string, unknown>;
  if (typeof d.discussion !== "string" || typeof d.roster !== "string" ||
      (d.promptOverride !== null && typeof d.promptOverride !== "string") ||
      typeof d.overrideDiscussion !== "string" || typeof d.template !== "string" ||
      (d.generatedFromDiscussion !== null && typeof d.generatedFromDiscussion !== "string")) throw new Error("Invalid discussion draft");
  return d as DiscussionDraft;
}
export function writeDiscussionDraft(storage: Pick<Storage, "setItem">, userId: string | null, draft: DiscussionDraft): void {
  const key = discussionDraftKey(userId);
  if (key) storage.setItem(key, JSON.stringify(draft));
}
export function parseDiscussionRoster(value: string): string[] {
  return value.split(/\r?\n/).map((name) => name.trim()).filter(Boolean);
}
/** Only interpret delimited exports with an unambiguous, labeled name column. */
export function detectDiscussionRosterExport(value: string): string[] | null {
  const firstLine = value.split(/\r?\n/, 1)[0] ?? "";
  const delimiter = firstLine.includes("\t") ? "\t" : firstLine.includes(",") ? "," : null;
  if (!delimiter) return null;
  const rows: string[][] = [];
  let row: string[] = [], field = "", quoted = false, closed = false;
  for (let i = 0; i < value.length; i++) {
    const c = value[i];
    if (quoted) {
      if (c === '"' && value[i + 1] === '"') { field += '"'; i++; }
      else if (c === '"') { quoted = false; closed = true; }
      else field += c;
    } else if (c === '"') {
      if (field.trim() || closed) return null;
      field = ""; quoted = true;
    } else if (c === delimiter || c === "\n" || c === "\r") {
      row.push(field.trim()); field = ""; closed = false;
      if (c !== delimiter) { rows.push(row); row = []; if (c === "\r" && value[i + 1] === "\n") i++; }
    } else {
      if (closed && !/\s/.test(c)) return null;
      field += c;
    }
  }
  if (quoted) return null;
  row.push(field.trim()); rows.push(row);
  const header = rows.shift()?.map((cell) => cell.replace(/^\uFEFF/, "").trim().toLowerCase()) ?? [];
  const indices = (labels: string[]) => header.flatMap((name, index) => labels.includes(name) ? [index] : []);
  const full = indices(["student", "student name", "name", "full name"]);
  const first = indices(["first name", "first"]), last = indices(["last name", "last"]);
  if (full.length > 1 || first.length > 1 || last.length > 1) return null;
  const useFull = full.length === 1;
  if (!useFull && (first.length !== 1 || last.length !== 1)) return null;
  const result: string[] = [];
  for (const cells of rows) {
    if (cells.every((cell) => !cell)) continue;
    if (cells.length !== header.length) return null;
    const name = useFull ? cells[full[0]] : `${cells[first[0]]} ${cells[last[0]]}`.trim();
    if (!name || /[\r\n]/.test(name) || (!useFull && (!cells[first[0]] || !cells[last[0]]))) return null;
    result.push(name);
  }
  return result.length ? result : null;
}
export function discussionRosterWarnings(names: string[]): string[] {
  const seen = new Set<string>();
  let duplicate = false;
  let columns = false;
  for (const name of names) {
    const key = name.normalize("NFKC").toLowerCase().replace(/\s+/g, " ");
    if (seen.has(key)) duplicate = true;
    seen.add(key);
    if (/[,\t;|@]/.test(name)) columns = true;
  }
  return [
    ...(duplicate ? ["Some names appear more than once. Confirm they are separate students or correct the roster."] : []),
    ...(columns ? ["Some lines may contain multiple columns or names. Check each line is one student's name."] : []),
  ];
}
/** Shared decision used before producing replies from any roster. */
export function discussionRosterProblem(roster: string, reviewed: boolean): string | null {
  const names = parseDiscussionRoster(roster);
  if (!names.length) return "Add at least one student to the roster.";
  if (detectDiscussionRosterExport(roster)) return "Apply the detected roster import or correct the roster before generating replies.";
  if (names.length > 1000) return "Use at most 1,000 roster lines per run.";
  if (discussionRosterWarnings(names).length && !reviewed) return "Review and confirm the roster warnings first.";
  return null;
}
export function discussionTemplateProblem(template: string): string | null {
  if (!/\{\{\s*name\s*\}\}/i.test(template)) return "Add {{name}} to the reply template where each student's name belongs.";
  if (/^\s*(?:hi|hello|hey|dear)\s+(?!\{\{\s*name\s*\}\})[^\n,!:]{1,80}\s*[,!:]/im.test(template)) {
    return "A greeting appears to contain a fixed name. Replace it with {{name}} before generating replies.";
  }
  return null;
}
export function defaultDiscussionPrompt(discussion: string): string {
  return `Write one reusable instructor reply template for the discussion prompt below. It must work for every student without claiming to have read or evaluated any student's post. Do not mention specific student content. Use {{name}} for the student's name. Return only the reply template.\n\nDiscussion prompt:\n${discussion}`;
}
export function personalizeDiscussionReply(template: string, name: string): string {
  const normalized = template.trim();
  if (discussionTemplateProblem(normalized)) throw new Error("Review the reply template first.");
  return normalized.replace(/\{\{\s*name\s*\}\}/gi, () => name);
}
