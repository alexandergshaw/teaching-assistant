import type React from "react";
import type { AccessibleItemType } from "@/lib/accessibility/types";
import type {
  CanvasModule,
  CanvasModuleItem,
  CourseFile,
  FileUploadTicket,
  QuizQuestionInput,
  QuizQuestionType,
} from "@/lib/canvas-modules";
import { requestFileUploadAction, addFileToModuleAction } from "../../actions";
import { ROW_INTERACTIVE } from "./constants";
import type { DuplicateGroup, EditableQuestion, EditCriterion, SlideDeck } from "./types";

// Format a Canvas ISO timestamp for display; blank when absent.
export function formatWhen(iso: string | null): string {
  if (!iso) return "";
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "";
  return date.toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

// Build a self-contained preview document so a page's HTML renders in isolation
// (sandboxed, no scripts) instead of bleeding into the app's own styles.
export function previewDoc(html: string): string {
  return `<!doctype html><html><head><meta charset="utf-8"><style>
    body { font: 15px/1.6 system-ui, -apple-system, sans-serif; color: #1f2933; padding: 14px; margin: 0; }
    img { max-width: 100%; height: auto; }
    table { border-collapse: collapse; }
    td, th { border: 1px solid #d2d6dc; padding: 4px 8px; }
    a { color: #2563eb; }
  </style></head><body>${html}</body></html>`;
}

// Stable key for a module item in the selection / drag sets.
export function itemKey(moduleId: number, itemId: number): string {
  return `${moduleId}:${itemId}`;
}

// Run `toggle` when a row click landed on blank space, not on one of its controls.
export function rowBlankClick(e: React.MouseEvent, toggle: () => void) {
  if ((e.target as HTMLElement).closest(ROW_INTERACTIVE)) return;
  toggle();
}

export function slidesToText(deck: SlideDeck): string {
  const parts: string[] = [`# ${deck.presentationTitle}`];
  for (const s of deck.slides) {
    parts.push("", `## ${s.title}`, ...s.bullets.map((b) => `- ${b}`));
  }
  return parts.join("\n");
}

export function textToSlides(text: string): SlideDeck {
  let presentationTitle = "Presentation";
  let titleSet = false;
  const slides: SlideDeck["slides"] = [];
  let current: SlideDeck["slides"][number] | null = null;
  for (const raw of text.split("\n")) {
    const line = raw.trim();
    if (!line) continue;
    const h2 = line.match(/^##\s+(.*)$/);
    const h1 = line.match(/^#\s+(.*)$/);
    const bullet = line.match(/^[-*•]\s+(.*)$/);
    if (h2) {
      current = { title: h2[1].trim(), bullets: [] };
      slides.push(current);
    } else if (h1 && !titleSet) {
      presentationTitle = h1[1].trim() || presentationTitle;
      titleSet = true;
    } else {
      const value = bullet ? bullet[1].trim() : line;
      if (!current) {
        current = { title: value, bullets: [] };
        slides.push(current);
      } else {
        current.bullets.push(value);
      }
    }
  }
  return { presentationTitle, slides: slides.filter((s) => s.title || s.bullets.length > 0) };
}

// Human-readable file size ("2.4 MB").
export function formatBytes(bytes: number): string {
  if (!bytes || bytes < 0) return "0 B";
  const units = ["B", "KB", "MB", "GB", "TB"];
  const i = Math.min(units.length - 1, Math.floor(Math.log(bytes) / Math.log(1024)));
  return `${(bytes / Math.pow(1024, i)).toFixed(i === 0 ? 0 : 1)} ${units[i]}`;
}

// Strip Canvas's auto-dedup suffix from a display name so renamed copies of the
// same upload group together: "Syllabus (3).docx" -> "syllabus.docx". Canvas
// inserts " (N)" before the extension when a duplicate name is uploaded.
export function dedupBaseName(displayName: string): string {
  const dot = displayName.lastIndexOf(".");
  const ext = dot > 0 ? displayName.slice(dot) : "";
  const stem = dot > 0 ? displayName.slice(0, dot) : displayName;
  return `${stem.replace(/\s*\(\d+\)\s*$/, "")}${ext}`.trim().toLowerCase();
}

// Find files that look like Canvas dedup copies of one upload: grouped by base
// name + folder, keeping the most recently updated copy and flagging the rest.
export function findDuplicateGroups(files: CourseFile[]): DuplicateGroup[] {
  const byKey = new Map<string, CourseFile[]>();
  for (const f of files) {
    const key = `${f.folderId ?? "root"}::${dedupBaseName(f.displayName)}`;
    const list = byKey.get(key);
    if (list) list.push(f);
    else byKey.set(key, [f]);
  }
  const groups: DuplicateGroup[] = [];
  for (const [key, list] of byKey) {
    if (list.length < 2) continue;
    const sorted = [...list].sort((a, b) => (b.updatedAt ?? "").localeCompare(a.updatedAt ?? "") || b.id - a.id);
    groups.push({ baseName: key.split("::")[1], keep: sorted[0], strays: sorted.slice(1) });
  }
  return groups;
}

// Short type label for a file chip (extension, else a content-type category).
export function fileKindLabel(contentType: string, fileName: string): string {
  const ext = fileName.includes(".") ? fileName.split(".").pop()?.toUpperCase() : undefined;
  if (ext && ext.length >= 2 && ext.length <= 4) return ext;
  if (contentType.startsWith("image/")) return "IMAGE";
  if (contentType.startsWith("video/")) return "VIDEO";
  if (contentType.startsWith("audio/")) return "AUDIO";
  if (contentType === "application/pdf") return "PDF";
  return "FILE";
}

// Compact local rendering of a due date for a module row ("Jan 20, 11:59 PM").
export function formatDueDate(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

// Format an ISO timestamp as the local value a datetime-local input expects.
export function toLocalInput(iso: string | null): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

// Turn a base64 payload into an object URL for previewing (images / PDFs).
export function base64ToBlobUrl(base64: string, mimeType: string): string {
  const bytes = atob(base64);
  const arr = new Uint8Array(bytes.length);
  for (let i = 0; i < bytes.length; i++) arr[i] = bytes.charCodeAt(i);
  return URL.createObjectURL(new Blob([arr], { type: mimeType }));
}

// ── File upload helpers (browser side of the Canvas upload) ───────────────────

/** Step 2 of the Canvas upload: POST the file bytes to the pre-signed URL. */
async function uploadFileToCanvas(ticket: FileUploadTicket, file: File): Promise<number> {
  const form = new FormData();
  for (const [key, value] of Object.entries(ticket.uploadParams)) form.append(key, value);
  form.append("file", file);
  const response = await fetch(ticket.uploadUrl, { method: "POST", body: form });
  if (!response.ok) throw new Error(`Upload failed (HTTP ${response.status}).`);
  const data = (await response.json()) as { id?: number };
  if (typeof data.id !== "number") throw new Error("Upload did not return a file id.");
  return data.id;
}

/** Full pipeline for one file: pre-sign (server), upload (browser), attach (server). */
export async function uploadFileToModule(
  courseUrl: string,
  acronym: string | undefined,
  moduleId: number,
  file: File
): Promise<void> {
  const ticket = await requestFileUploadAction(
    courseUrl,
    { name: file.name, size: file.size, contentType: file.type || undefined },
    acronym
  );
  if ("error" in ticket) throw new Error(ticket.error);
  const fileId = await uploadFileToCanvas(ticket.ticket, file);
  const attached = await addFileToModuleAction(courseUrl, moduleId, fileId, acronym);
  if ("error" in attached) throw new Error(attached.error);
}

// Tokenize a name for matching: drop the extension, lowercase, split on non-alphanumerics.
function matchTokens(s: string): string[] {
  return s
    .toLowerCase()
    .replace(/\.[a-z0-9]+$/i, "")
    .replace(/[^a-z0-9]+/g, " ")
    .trim()
    .split(/\s+/)
    .filter(Boolean);
}

/** Best-matching module for a filename by shared tokens (numbers weighted), or "". */
export function bestModuleIdFor(fileName: string, modules: CanvasModule[]): number | "" {
  const fileTokens = matchTokens(fileName);
  const fileNums = fileTokens.filter((t) => /^\d+$/.test(t));
  let best: { id: number; score: number } | null = null;
  for (const m of modules) {
    const modTokens = matchTokens(m.name);
    const modNums = modTokens.filter((t) => /^\d+$/.test(t));
    let score = 0;
    for (const t of fileTokens) if (t.length > 2 && modTokens.includes(t)) score += 1;
    for (const n of fileNums) if (modNums.includes(n)) score += 2;
    if (score > 0 && (!best || score > best.score)) best = { id: m.id, score };
  }
  return best ? best.id : "";
}

// Map a module item to its accessibility scan key, when it's a scannable type.
export function a11yRefForItem(item: CanvasModuleItem): { type: AccessibleItemType; id: string } | null {
  if (item.type === "Page" && item.pageUrl) return { type: "page", id: item.pageUrl };
  if (item.contentId == null) return null;
  if (item.type === "Assignment") return { type: "assignment", id: String(item.contentId) };
  if (item.type === "Quiz") return { type: "quiz", id: String(item.contentId) };
  if (item.type === "Discussion") return { type: "discussion", id: String(item.contentId) };
  return null;
}

// ── Quiz question helpers ─────────────────────────────────────────────────────

let quizKeySeq = 0;
export const nextQuizKey = () => `qq${++quizKeySeq}`;

export function defaultQuizAnswers(type: QuizQuestionType): Array<{ text: string; correct: boolean }> {
  if (type === "true_false_question") return [{ text: "True", correct: true }, { text: "False", correct: false }];
  if (type === "multiple_choice_question") return [{ text: "", correct: true }, { text: "", correct: false }];
  if (type === "short_answer_question") return [{ text: "", correct: true }];
  return [];
}

// An editable draft question reduced to the shape Canvas accepts.
export function quizQuestionToInput(q: EditableQuestion): QuizQuestionInput {
  return {
    name: q.name,
    text: q.text,
    type: q.type,
    points: Number.isFinite(q.points) ? q.points : 0,
    answers: q.answers,
  };
}

// A blank question to seed the editors with.
export function newDraftQuestion(): EditableQuestion {
  return {
    key: nextQuizKey(),
    id: 0,
    name: "",
    text: "",
    type: "multiple_choice_question",
    points: 1,
    answers: defaultQuizAnswers("multiple_choice_question"),
  };
}

// ── Rubric criterion helpers ──────────────────────────────────────────────────

let rubricKeySeq = 0;
export const nextRubricKey = () => `rb${++rubricKeySeq}`;

export function defaultCriterion(mode: "percent" | "points"): EditCriterion {
  if (mode === "percent") {
    // Five tiers at 100/75/50/25/0% of the criterion's percentage weight.
    const base = 20;
    return {
      key: nextRubricKey(),
      description: "",
      points: base,
      ratings: [100, 75, 50, 25, 0].map((pct) => ({
        key: nextRubricKey(),
        description: `${pct}%`,
        longDescription: "",
        points: Math.round((base * pct) / 100),
      })),
    };
  }
  return {
    key: nextRubricKey(),
    description: "",
    points: 5,
    ratings: [
      { key: nextRubricKey(), description: "Full marks", longDescription: "", points: 5 },
      { key: nextRubricKey(), description: "Partial", longDescription: "", points: 3 },
      { key: nextRubricKey(), description: "No marks", longDescription: "", points: 0 },
    ],
  };
}
