// Drafts-loop lifecycle for the announcement-from-recording surface (W2, defect
// G6). A pure, dependency-injected leaf so the hook (useTakeAnnouncement.ts,
// near its line ceiling) only wires it: the hook holds the saved draft id as
// its single source of truth and hands accessors in through the deps objects.
//
// Three facts live here:
//  - a second "Save to drafts" UPDATES the first row in place instead of
//    creating a duplicate (plan/apply save, runTakeDraftSave);
//  - a successful in-app post cleans the saved draft up exactly once, so it
//    cannot be re-posted from Drafts, and a cleanup FAILURE keeps the id so a
//    later save still updates rather than duplicates (runTakeDraftPostCleanup);
//  - the post-save notice discloses when the draft carries no course.
//
// The cleanup dep is action-agnostic: production binds it to
// markMessageDraftReviewedAction, tests bind a mock.

import type { MessageDraftPayload } from "@/lib/message-drafts";

export interface TakeDraftState {
  savedDraftId: string | null;
}

export const INITIAL_TAKE_DRAFT_STATE: TakeDraftState = { savedDraftId: null };

export type TakeDraftSavePlan =
  | { op: "create"; summary: string; payload: MessageDraftPayload }
  | { op: "update"; id: string; payload: MessageDraftPayload };

export type TakeDraftCleanupPlan = { op: "none" } | { op: "cleanup"; id: string };

export function planTakeDraftSave(
  state: TakeDraftState,
  input: { summary: string; payload: MessageDraftPayload }
): TakeDraftSavePlan {
  if (state.savedDraftId) {
    return { op: "update", id: state.savedDraftId, payload: input.payload };
  }
  return { op: "create", summary: input.summary, payload: input.payload };
}

export function applyTakeDraftSaveResult(
  state: TakeDraftState,
  plan: TakeDraftSavePlan,
  result: { ok: boolean; id?: string }
): TakeDraftState {
  if (!result.ok) return state;
  if (plan.op === "create" && result.id) return { savedDraftId: result.id };
  return state;
}

export function planTakeDraftPostCleanup(state: TakeDraftState): TakeDraftCleanupPlan {
  if (state.savedDraftId) return { op: "cleanup", id: state.savedDraftId };
  return { op: "none" };
}

export function applyTakeDraftPostCleanup(state: TakeDraftState): TakeDraftState {
  void state;
  return { savedDraftId: null };
}

export interface TakeDraftSaveDeps {
  save: (summary: string, payload: MessageDraftPayload) => Promise<{ id: string } | { error: string }>;
  update: (id: string, payload: MessageDraftPayload) => Promise<{ ok: true } | { error: string }>;
  getSavedId: () => string | null;
  setSavedId: (id: string | null) => void;
}

export interface TakeDraftCleanupDeps {
  cleanup: (id: string) => Promise<{ ok: true } | { error: string }>;
  getSavedId: () => string | null;
  setSavedId: (id: string | null) => void;
}

/** Create the draft on the first save, update it in place on every later one. */
export async function runTakeDraftSave(
  deps: TakeDraftSaveDeps,
  input: { summary: string; payload: MessageDraftPayload }
): Promise<{ ok: true } | { error: string }> {
  const state: TakeDraftState = { savedDraftId: deps.getSavedId() };
  const plan = planTakeDraftSave(state, input);
  if (plan.op === "create") {
    const res = await deps.save(plan.summary, plan.payload);
    if ("error" in res) return { error: res.error };
    const next = applyTakeDraftSaveResult(state, plan, { ok: true, id: res.id });
    deps.setSavedId(next.savedDraftId);
    return { ok: true };
  }
  const res = await deps.update(plan.id, plan.payload);
  if ("error" in res) return { error: res.error };
  deps.setSavedId(applyTakeDraftSaveResult(state, plan, { ok: true }).savedDraftId);
  return { ok: true };
}

/** After a successful in-app post, retire the saved draft once. A failure keeps the id. */
export async function runTakeDraftPostCleanup(
  deps: TakeDraftCleanupDeps
): Promise<{ ok: true } | { error: string }> {
  const state: TakeDraftState = { savedDraftId: deps.getSavedId() };
  const plan = planTakeDraftPostCleanup(state);
  if (plan.op === "none") return { ok: true };
  const res = await deps.cleanup(plan.id);
  if ("error" in res) return { error: res.error };
  deps.setSavedId(applyTakeDraftPostCleanup(state).savedDraftId);
  return { ok: true };
}

/** The post-save notice. hasCourse is whether a course was present AT SAVE. */
export function takeDraftSavedNotice(hasCourse: boolean): string {
  if (hasCourse) return "Saved to drafts.";
  return "Saved to drafts with no course - pick a course here and save again to update the same draft.";
}
