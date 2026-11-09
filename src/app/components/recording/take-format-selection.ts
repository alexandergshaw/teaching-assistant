import { exampleFormatSymbols } from "@/lib/take-announcement";
import type { LibraryState } from "../walkthrough-announcement/announcement-library-controller";

export type TakeFormatSelection = { scope: string; id: string } | null;

export function resolveTakeFormat(selection: TakeFormatSelection, scope: string, enabled: boolean, state: LibraryState) {
  if (!selection) return { ok: true as const, example: null };
  if (selection.scope !== scope || !enabled || state.load !== "loaded") return { ok: false as const };
  const card = state.cards.find((entry) => entry.acknowledged?.id === selection.id);
  if (!card?.acknowledged || card.status !== "Saved" || card.deleting) return { ok: false as const };
  return { ok: true as const, example: { outline: card.acknowledged.outline, symbols: exampleFormatSymbols(card.acknowledged.exemplarText) } };
}
