import { EMPTY_ANNOUNCEMENT_OUTLINE } from "@/lib/announcement-outline-types";
import type { TemplateChoice } from "./announcement-draft-slots";
export type PairRole = "weekly" | "midweek";
type Selection = { kind: "none" } | { kind: "saved"; id: string } | null;
export type PairPreferences = Record<PairRole, Selection>;
export const EMPTY_PAIR_PREFERENCES: PairPreferences = { weekly: null, midweek: null };
export const pairRole = (id: string): PairRole | null => id === "wta-slot-1" ? "weekly" : id === "wta-slot-2" ? "midweek" : null;
export function preferenceChoice(selection: Selection): TemplateChoice {
  return selection === null ? { kind: "unresolved" } : selection.kind === "none" ? { kind: "none" }
    : { kind: "saved", exemplarId: selection.id, label: "Selected saved example", outline: EMPTY_ANNOUNCEMENT_OUTLINE };
}
export function createPairPreferenceStore(scope: string, storage: Pick<Storage, "getItem" | "setItem">) {
  const key = `ta-walkthrough-pair-v1:${encodeURIComponent(scope)}`;
  let loaded = false;
  let value = { ...EMPTY_PAIR_PREFERENCES };
  return {
    load(): { value: PairPreferences; error: "storage-corrupt" | "storage-unavailable" | null } {
      try {
        const raw = storage.getItem(key);
        loaded = true;
        if (raw !== null) {
          const parsed = JSON.parse(raw);
          const valid = (v: unknown): v is Selection => v === null || (!!v && typeof v === "object" && ("kind" in v) && (v.kind === "none" || (v.kind === "saved" && "id" in v && typeof v.id === "string" && v.id.length > 0)));
          if (!parsed || typeof parsed !== "object" || parsed.version !== 1 || !valid(parsed.weekly) || !valid(parsed.midweek)) return { value, error: "storage-corrupt" };
          value = { weekly: parsed.weekly, midweek: parsed.midweek };
        }
        loaded = true;
        return { value, error: null };
      } catch (error) { return { value, error: error instanceof SyntaxError ? "storage-corrupt" : "storage-unavailable" }; }
    },
    choose(role: PairRole, choice: TemplateChoice): boolean {
      if (!loaded) return false;
      value = { ...value, [role]: choice.kind === "saved" ? { kind: "saved", id: choice.exemplarId } : choice.kind === "none" ? { kind: "none" } : null };
      try { storage.setItem(key, JSON.stringify({ version: 1, ...value })); return true; } catch { return false; }
    },
  };
}
