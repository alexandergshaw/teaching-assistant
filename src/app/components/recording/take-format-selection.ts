import { exampleFormatSymbols, exampleSymbolLayout, type ExampleSymbolPlacement } from "@/lib/take-announcement";
import type { AnnouncementOutline } from "@/lib/announcement-outline-types";
import type { LibraryState } from "../walkthrough-announcement/announcement-library-controller";

export type TakeFormatSelection = { scope: string; id: string } | null;
export type TakeFormatExample = { outline: AnnouncementOutline; symbols: string[]; symbolLayout: ExampleSymbolPlacement[] };

export function initialTakeStage(posted: boolean): "review" | "idle" { return posted ? "review" : "idle"; }

/** Lock synchronously, before React can rerender, so a second activation cannot replace the resolver. */
export function beginTakeDraft(lock: { current: boolean }, posted: boolean, start: () => void): boolean {
  if (posted || lock.current) return false;
  lock.current = true;
  try { start(); } catch (error) { lock.current = false; throw error; }
  return true;
}

export function resolveTakeFormat(selection: TakeFormatSelection, scope: string, enabled: boolean, state: LibraryState) {
  if (!selection) return { ok: true as const, example: null };
  if (selection.scope !== scope || !enabled || state.load !== "loaded") return { ok: false as const };
  const card = state.cards.find((entry) => entry.acknowledged?.id === selection.id);
  if (!card?.acknowledged || card.status !== "Saved" || card.deleting) return { ok: false as const };
  return { ok: true as const, example: { outline: card.acknowledged.outline, symbols: exampleFormatSymbols(card.acknowledged.exemplarText), symbolLayout: exampleSymbolLayout(card.acknowledged.exemplarText) } };
}

/** Resolve immediately before model dispatch, after any asynchronous transcription. */
export async function dispatchInitialTakeDraft<T>(transcript: string, resolve: () => { ok: true; example: T } | { ok: false },
  draft: (transcript: string, example: T, current: () => boolean) => Promise<void>, invalid: () => void): Promise<void> {
  const result = resolve();
  if (!result.ok) { invalid(); return; }
  const snapshot = JSON.stringify(result.example);
  const current = () => { const latest = resolve(); return latest.ok && JSON.stringify(latest.example) === snapshot; };
  await draft(transcript, result.example, current);
}

export async function awaitCurrentDraft<T>(request: Promise<T>, current: () => boolean): Promise<{ kind: "result"; value: T } | { kind: "failed" } | { kind: "stale" }> {
  try { const value = await request; return current() ? { kind: "result", value } : { kind: "stale" }; }
  catch { return current() ? { kind: "failed" } : { kind: "stale" }; }
}
