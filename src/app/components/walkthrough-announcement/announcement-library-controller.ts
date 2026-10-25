import { EXEMPLAR_FETCH_TIMEOUT_MS } from "./announcement-draft-slots";
import { ANNOUNCEMENT_LIBRARY_MAX_BODY_CHARS, ANNOUNCEMENT_LIBRARY_MAX_BODY_BYTES, ANNOUNCEMENT_LIBRARY_MAX_LABEL_CHARS, normalizeAnnouncementLibraryLabel } from "@/lib/announcement-library-input";
import type { AnnouncementLibraryEntry, AnnouncementLibrarySnapshot, SaveAnnouncementLibraryInput, AnnouncementLibraryResult } from "@/lib/announcement-library-types";
import { recordLibraryDiagnostic } from "./announcement-library-diagnostics";
export type LibraryCard = { id: string; exemplarText: string; label: string; acknowledged: AnnouncementLibraryEntry | null;
  status: "Unsaved" | "Saving" | "Saved" | "Could not save"; error: string | null; deleting: boolean };
export type LibraryState = { cards: readonly LibraryCard[]; load: "loading" | "loaded" | "failed" | "timedout" };
export interface LibraryAdapters {
  list(courseId: string): Promise<AnnouncementLibraryResult<AnnouncementLibraryEntry[]>>;
  save(input: SaveAnnouncementLibraryInput): Promise<AnnouncementLibraryResult<AnnouncementLibraryEntry>>;
  remove(courseId: string, id: string): Promise<AnnouncementLibraryResult<void>>;
}
export function libraryValidation(body: string, label: string): string | null {
  if (!body.trim()) return "Enter announcement text before saving.";
  if (body.length > ANNOUNCEMENT_LIBRARY_MAX_BODY_CHARS || new TextEncoder().encode(body).length > ANNOUNCEMENT_LIBRARY_MAX_BODY_BYTES) return "Use at most 16,000 characters and 32 KiB of announcement text.";
  if (label.length > ANNOUNCEMENT_LIBRARY_MAX_LABEL_CHARS) return "Use at most 120 characters for the label.";
  return null;
}
function snapshot(card: LibraryCard): AnnouncementLibrarySnapshot | null {
  return card.acknowledged ? { exemplarText: card.acknowledged.exemplarText, label: card.acknowledged.label } : null;
}
function current(card: LibraryCard): boolean {
  return !!card.acknowledged && card.exemplarText === card.acknowledged.exemplarText && normalizeAnnouncementLibraryLabel(card.label) === normalizeAnnouncementLibraryLabel(card.acknowledged.label);
}
export function createAnnouncementLibraryController(courseId: string, adapters: LibraryAdapters, changed: () => void,
  options: { debounceMs?: number; timeoutMs?: number; uuid?: () => string } = {}) {
  let state: LibraryState = { cards: [], load: "loading" }, disposed = false, loadRun = 0;
  const timers = new Map<string, ReturnType<typeof setTimeout>>();
  const pending = new Map<string, Promise<void>>();
  const deleted = new Set<string>();
  const conflicts = new Set<string>();
  const attempted = new Set<string>();
  const uncertain = new Map<string, SaveAnnouncementLibraryInput>();
  const emit = () => { if (!disposed) changed(); };
  const cardFor = (id: string) => state.cards.find(c => c.id === id);
  const patch = (id: string, p: Partial<LibraryCard>) => { state = { ...state, cards: state.cards.map(c => c.id === id ? { ...c, ...p } : c) }; emit(); };
  const cancel = (id: string) => { clearTimeout(timers.get(id)); timers.delete(id); };
  function schedule(id: string) { cancel(id); timers.set(id, setTimeout(() => { timers.delete(id); void save(id); }, options.debounceMs ?? 700)); }
  async function save(id: string, retry = false, replay?: SaveAnnouncementLibraryInput): Promise<void> {
    cancel(id);
    const card = cardFor(id);
    if (disposed || !card || card.deleting || pending.has(id) || (!replay && current(card) && !uncertain.has(id))) return;
    const error = replay ? null : libraryValidation(card.exemplarText, card.label);
    if (error) { patch(id, { status: "Unsaved", error }); return; }
    const started = Date.now();
    const input = replay ?? { id, courseId, exemplarText: card.exemplarText, label: normalizeAnnouncementLibraryLabel(card.label), expected: snapshot(card) };
    attempted.add(id); uncertain.set(id, input);
    patch(id, { status: "Saving", error: null });
    const timeout = setTimeout(() => { if (!disposed && cardFor(id) && !cardFor(id)?.deleting) {
      patch(id, { status: "Could not save", error: "Saving is taking longer than expected. Retry after the request finishes." });
      recordLibraryDiagnostic(retry ? "retry" : "save", "timedout", Date.now() - started);
    } }, options.timeoutMs ?? EXEMPLAR_FETCH_TIMEOUT_MS);
    const request = Promise.resolve().then(() => adapters.save(input)).catch(() => ({ ok: false, code: "unavailable" } as const)).then(result => {
      if (disposed || !cardFor(id)) return;
      recordLibraryDiagnostic(retry ? "retry" : "save", result.ok ? "ok" : result.code, Date.now() - started);
      if (result.ok || result.code !== "unavailable") uncertain.delete(id);
      if (result.ok) {
        patch(id, { acknowledged: result.value });
        const latest = cardFor(id)!;
        patch(id, { status: current(latest) ? "Saved" : "Unsaved", error: null });
      } else {
        if (result.code === "conflict") conflicts.add(id);
        patch(id, { status: "Could not save", error: result.code === "conflict" ? "This announcement changed elsewhere. Retry saves your edits over its latest saved version." : "Could not save. Your edits are kept. Retry." });
      }
    }).finally(() => {
      clearTimeout(timeout); pending.delete(id);
      const latest = cardFor(id);
      if (!disposed && latest && !latest.deleting && latest.status === "Unsaved" && latest.exemplarText.trim()) schedule(id);
    });
    pending.set(id, request); await request;
  }
  async function load() {
    const run = ++loadRun, started = Date.now();
    state = { ...state, load: "loading" }; emit();
    const timeout = setTimeout(() => { if (!disposed && run === loadRun) { state = { ...state, load: "timedout" }; emit(); recordLibraryDiagnostic("load", "timedout", Date.now() - started); } }, options.timeoutMs ?? EXEMPLAR_FETCH_TIMEOUT_MS);
    const result = await adapters.list(courseId).catch(() => ({ ok: false, code: "unavailable" } as const));
    clearTimeout(timeout);
    if (disposed || run !== loadRun) return;
    recordLibraryDiagnostic("load", result.ok ? "ok" : result.code, Date.now() - started, result.ok ? result.value.length : 0);
    if (!result.ok) { state = { ...state, load: "failed" }; emit(); return; }
    const ids = new Set(state.cards.map(c => c.id));
    state = { load: "loaded", cards: [...state.cards, ...result.value.filter(e => !ids.has(e.id) && !deleted.has(e.id)).map(e => ({ id: e.id, exemplarText: e.exemplarText, label: e.label ?? "", acknowledged: e, status: "Saved" as const, error: null, deleting: false }))] }; emit();
  }
  function add(body = "", label = "") {
    if (disposed) return null;
    const id = (options.uuid ?? (() => crypto.randomUUID()))();
    state = { ...state, cards: [...state.cards, { id, exemplarText: body, label, acknowledged: null, status: "Unsaved", error: body || label ? libraryValidation(body, label) : null, deleting: false }] }; emit();
    if (body.trim()) schedule(id); return id;
  }
  function edit(id: string, field: "label" | "exemplarText", value: string) {
    const card = cardFor(id); if (disposed || !card || card.deleting) return;
    const next = { ...card, [field]: value };
    const status = pending.has(id) ? (card.status === "Could not save" ? "Could not save" : "Saving") : uncertain.has(id) ? "Could not save" : current(next) ? "Saved" : "Unsaved";
    patch(id, { [field]: value, status, error: uncertain.has(id) && !pending.has(id) ? "The last save has an unknown outcome. Retry to reconcile before drafting." : null });
    if (!uncertain.has(id)) schedule(id);
  }
  async function remove(id: string): Promise<boolean> {
    const card = cardFor(id); if (!card || disposed) return false;
    cancel(id); patch(id, { deleting: true });
    await pending.get(id); if (disposed) return false;
    const latest = cardFor(id)!;
    const started = Date.now();
    const result = latest.acknowledged || attempted.has(id) ? await adapters.remove(courseId, id).catch(() => ({ ok: false, code: "unavailable" } as const)) : { ok: true } as const;
    if (disposed) return false;
    recordLibraryDiagnostic("delete", result.ok ? "ok" : result.code, Date.now() - started);
    if (!result.ok) { patch(id, { deleting: false, error: "Could not remove. Retry removal." }); return false; }
    deleted.add(id); state = { ...state, cards: state.cards.filter(c => c.id !== id) }; emit(); return true;
  }
  return { getState: () => state, load, add, edit, retry: async (id: string) => {
      if (disposed || pending.has(id)) return;
      const unknown = uncertain.get(id);
      if (unknown) {
        await save(id, true, unknown);
        if (disposed || uncertain.has(id) || conflicts.has(id)) return;
      }
      if (conflicts.has(id)) {
        const result = await adapters.list(courseId).catch(() => ({ ok: false, code: "unavailable" } as const));
        if (disposed) return;
        const entry = result.ok ? result.value.find(e => e.id === id) : null;
        if (!entry) { patch(id, { error: "Could not refresh the saved announcement. Your edits are kept." }); return; }
        patch(id, { acknowledged: entry }); conflicts.delete(id);
      }
      await save(id, true);
    }, remove,
    dirty: () => state.cards.some(c => pending.has(c.id) || uncertain.has(c.id) || (!current(c) && (!!c.acknowledged || !!(c.exemplarText || c.label)))),
    blocked: (id: string) => { const c = cardFor(id); return !!c && (!current(c) || pending.has(id) || uncertain.has(id) || c.deleting); },
    flush: async () => { await Promise.all(state.cards.map(c => save(c.id))); await Promise.all(pending.values()); },
    activate: () => { disposed = false; },
    isDisposed: () => disposed,
    dispose: () => { disposed = true; loadRun++; timers.forEach(clearTimeout); timers.clear(); },
  };
}
export type AnnouncementLibraryController = ReturnType<typeof createAnnouncementLibraryController>;

export async function importAnnouncementLibraryFiles(controller: AnnouncementLibraryController,
  files: readonly { name: string; size: number; text(): Promise<string> }[]) {
  const errors: string[] = []; const started = Date.now(); let count = 0;
  for (const file of files) {
    if (controller.isDisposed()) return { errors, count };
    if (!/\.(txt|md)$/i.test(file.name)) { errors.push(`${file.name}: use TXT or MD.`); continue; }
    if (file.size > ANNOUNCEMENT_LIBRARY_MAX_BODY_BYTES) { errors.push(`${file.name}: maximum file size is 32 KiB.`); continue; }
    try {
      const text = await file.text(), label = file.name.replace(/\.(txt|md)$/i, "");
      if (controller.isDisposed()) return { errors, count };
      const error = libraryValidation(text, label);
      if (error) errors.push(`${file.name}: ${error}`);
      else if (controller.add(text, label)) count++;
    } catch { errors.push(`${file.name}: could not read this file.`); }
  }
  recordLibraryDiagnostic("import", errors.length ? "invalid" : "ok", Date.now() - started, count);
  return { errors, count };
}
