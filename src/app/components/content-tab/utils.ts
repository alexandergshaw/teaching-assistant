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
    /* paper preview stays white/dark-text in dark mode */
    body { font: 15px/1.6 system-ui, -apple-system, sans-serif; color: #1f2933; padding: 14px; margin: 0; }
    img { max-width: 100%; height: auto; }
    table { border-collapse: collapse; }
    td, th { border: 1px solid #d2d6dc; padding: 4px 8px; }
    a { color: #2563eb; }
  </style></head><body>${html}</body></html>`;
}

// ── Item selection keys (Canvas live items, course-export items and repo
// folders/files) ────────────────────────────────────────────────────────
// The LMS selection layer (useModuleSelection) needs one identity key that
// works for content pulled live from the Canvas API, content read from a
// stored course export (a cartridge zip), AND content read from a paired
// code repo's tree - an upcoming generation feature selects across all
// three. Export and repo items carry no Canvas ids at all, so the old
// Canvas-only "${moduleId}:${itemId}" key cannot represent them; the key is
// now a discriminated string instead: "live:<moduleId>:<itemId>" for a
// Canvas item, "export:<moduleRef>:<itemRef>" for an export item,
// "repo:<moduleRef>:<itemRef>" for a repo folder/file, where
// moduleRef/itemRef are whatever stable identifiers the source provides
// (strings, not necessarily numeric - a repo itemRef is a tree path such as
// "assignments/module_01/README.md", which contains slashes but never the
// ":" delimiter this scheme reserves).
//
// `src/lib/workflows/module-value.ts` already encodes live-vs-export for
// MODULE-level values ("<id>|<name>" / "export|<name>", "|"-delimited), but
// it is a ONE-PART value naming a single module by id-or-name - there is no
// second field to hold an item ref, and its delimiter is "|" where these
// keys already use ":" (chosen originally so `withoutModuleKeys` below could
// prefix-match "${moduleId}:"). Reusing it would mean bolting a second,
// differently-delimited field onto a scheme built for one field, which is
// not simpler than a purpose-built two-part key - so item keys get their own
// encoding rather than sharing module-value.ts's.
export type ItemSource = "live" | "export" | "repo";

export interface ParsedItemKey {
  source: ItemSource;
  moduleRef: string;
  itemRef: string;
}

// Stable key for a LIVE Canvas module item in the selection / drag sets.
export function itemKey(moduleId: number, itemId: number): string {
  return `live:${moduleId}:${itemId}`;
}

// Stable key for an item sourced from a stored course export. Export items
// have no Canvas ids, so moduleRef/itemRef are whatever stable identifiers
// the export's manifest provides.
export function exportItemKey(moduleRef: string, itemRef: string): string {
  return `export:${moduleRef}:${itemRef}`;
}

// Stable key for an item sourced from a paired repo's tree (a folder or a
// file inside one). Repo items have no Canvas ids either, so moduleRef is
// the matched module's ref and itemRef is the repo tree path (e.g.
// "assignments/module_01/README.md").
export function repoItemKey(moduleRef: string, itemRef: string): string {
  return `repo:${moduleRef}:${itemRef}`;
}

// The prefix every LIVE key for one module shares - used by the selection
// pruning helpers to drop a whole module's worth of keys in one pass. Kept
// here, not re-derived elsewhere from itemKey's template string, so the two
// can never drift apart.
export function liveModuleKeyPrefix(moduleId: number): string {
  return `live:${moduleId}:`;
}

// Parse a key produced by itemKey, exportItemKey or repoItemKey back into
// its source and refs. Splits on the first colon (source) and the next
// colon (moduleRef), leaving everything after as itemRef, so an itemRef
// that itself contains the delimiter still round-trips. Returns null
// instead of throwing for anything that doesn't match any producer's shape
// - a caller sweeping a selection for stale keys must not crash on a
// malformed one.
export function parseItemKey(key: string): ParsedItemKey | null {
  const sourceSep = key.indexOf(":");
  if (sourceSep === -1) return null;
  const source = key.slice(0, sourceSep);
  if (source !== "live" && source !== "export" && source !== "repo") return null;
  const rest = key.slice(sourceSep + 1);
  const refSep = rest.indexOf(":");
  if (refSep === -1) return null;
  const moduleRef = rest.slice(0, refSep);
  const itemRef = rest.slice(refSep + 1);
  if (!moduleRef || !itemRef) return null;
  return { source, moduleRef, itemRef };
}

// ── Module selection keys (mirrors the item-key scheme above) ──────────────
// useModuleSelection's `selectedModules` needs the SAME live/export/repo
// discriminated identity item keys already have. A CartridgeModule
// (src/lib/cartridge-import-shared.ts) carries NO numeric id at all - only an
// optional string `identifier` - so the old `Set<number>` cannot represent an
// export-sourced (or repo-sourced) module selection; it is not merely
// unwired, it is UNTYPEABLE. Deliberately NOT a synthetic numeric id (e.g.
// hashing a ref into a negative number): a course that has BOTH a live
// Canvas tree and a stored export (or a paired repo) could then collide a
// fabricated id with a real Canvas module id. `ModuleSource` is the same
// three-value union as `ItemSource` - modules and items share one source
// vocabulary, not separate ones.
export type ModuleSource = ItemSource;

export interface ParsedModuleKey {
  source: ModuleSource;
  ref: string;
}

// Stable key for a LIVE Canvas module in the module-selection Set.
export function liveModuleKey(id: number): string {
  return `live:${id}`;
}

// Stable key for a module sourced from a stored course export. `ref` is the
// export manifest's own `identifier` (CartridgeModule.identifier) - the same
// stable, spec-guaranteed identity itemKey's export branch already relies on
// (docs/REGRESSION.md entry 261 checks 6-7), never a position, since
// re-parsing an edited zip can reorder modules.
export function exportModuleKey(ref: string): string {
  return `export:${ref}`;
}

// The prefix every EXPORT item key for one module shares - the export
// counterpart to liveModuleKeyPrefix below, used by the selection pruning
// helpers to drop a whole export module's worth of item keys in one pass.
export function exportModuleKeyPrefix(moduleRef: string): string {
  return `export:${moduleRef}:`;
}

// Stable key for a module sourced from a paired repo (a matched top-level
// assignment folder). `ref` is the repo tree path of the folder (e.g.
// "assignments/module_01"), the same stable identifier repoItemKey's
// moduleRef half carries.
export function repoModuleKey(ref: string): string {
  return `repo:${ref}`;
}

// The prefix every REPO item key for one module shares - the repo
// counterpart to liveModuleKeyPrefix/exportModuleKeyPrefix, used by the
// selection pruning helpers to drop a whole repo module's worth of item
// keys in one pass.
export function repoModuleKeyPrefix(moduleRef: string): string {
  return `repo:${moduleRef}:`;
}

// Parse a key produced by liveModuleKey, exportModuleKey or repoModuleKey
// back into its source and ref. Returns null instead of throwing for
// anything that doesn't match any producer's shape, mirroring parseItemKey.
export function parseModuleKey(key: string): ParsedModuleKey | null {
  const sep = key.indexOf(":");
  if (sep === -1) return null;
  const source = key.slice(0, sep);
  if (source !== "live" && source !== "export" && source !== "repo") return null;
  const ref = key.slice(sep + 1);
  if (!ref) return null;
  return { source, ref };
}

// The numeric Canvas ids among a discriminated module-key Set - what
// Canvas-write bulk operations (publish/delete/add-to-module in
// useBulkModuleActions.ts) need, since those can only ever target a real
// Canvas module. Export-sourced keys are silently dropped: there is no
// Canvas module for them to act on. Used to derive a backward-compatible
// `Set<number>` view of `selectedModules` for consumers that predate (and
// are out of scope for) this discriminated scheme.
export function liveModuleIdsFromKeys(keys: Iterable<string>): Set<number> {
  const out = new Set<number>();
  for (const key of keys) {
    const parsed = parseModuleKey(key);
    if (parsed && parsed.source === "live") {
      const id = Number(parsed.ref);
      if (Number.isFinite(id)) out.add(id);
    }
  }
  return out;
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
// Exported for reuse by the repo-folder-to-module matcher (repo-folder-tree.ts's
// suggestion path per AC3), which needs the identical tokenization
// `bestModuleIdFor` below applies to filenames, so folder-name suggestions and
// file-name suggestions never drift into two subtly different matchers.
export function matchTokens(s: string): string[] {
  return s
    .toLowerCase()
    .replace(/\.[a-z0-9]+$/i, "")
    .replace(/[^a-z0-9]+/g, " ")
    .trim()
    .split(/\s+/)
    .filter(Boolean);
}

/**
 * Best-matching module for a filename by shared tokens (numbers weighted), or "".
 * Already exported before this change; now also reused (unchanged) by the repo-folder
 * matcher's title-overlap SUGGESTION fallback per AC3 - the number-first pairing pass
 * there only calls this when a folder yields no module number of its own.
 */
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
