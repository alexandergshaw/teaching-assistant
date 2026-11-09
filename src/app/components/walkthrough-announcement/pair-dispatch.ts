import { promptSafeAnnouncementOutline } from "@/lib/announcement-prompt-outline";
import type { AnnouncementOutline } from "@/lib/announcement-outline-types";
import { resolveChoice, type DraftSlot, type SlotsAction, type ResearchNotice, type ResourceOutcome, type LiveDefaults } from "./announcement-draft-slots";
import type { AnnouncementDraftRequestContext, AnnouncementDraftDispatchContext } from "./useAnnouncementDraftSlots";
import { pairRole } from "./pair-preferences";
import { recordWalkthroughDiagnostic } from "./walkthrough-diagnostics";
type DraftAdapter = (ctx: AnnouncementDraftDispatchContext, outline: AnnouncementOutline, isCurrent?: () => boolean) => Promise<{ title: string; message: string; researchNotice: ResearchNotice } | { error: string }>;
export async function dispatchResolvedAnnouncementDraft(ctx: AnnouncementDraftDispatchContext, resolved: ReturnType<typeof resolveChoice>, draftOne: DraftAdapter) {
  if (resolved.error) return { error: resolved.error };
  const result = await draftOne(ctx, promptSafeAnnouncementOutline(resolved.outline));
  return "error" in result ? result : { ...result, builtFrom: resolved.template, timing: ctx.timing, sourceCourseId: ctx.courseId ?? null };
}
export interface PairDraftAdapters {
  buildRequest: () => AnnouncementDraftRequestContext;
  mayGenerate?: () => boolean;
  resolveLive: () => LiveDefaults;
  fetchResources: (ctx: AnnouncementDraftRequestContext) => Promise<ResourceOutcome>;
  draftOne: DraftAdapter;
  researchFingerprint: (ctx: AnnouncementDraftRequestContext) => string;
}
// All entry points use this synchronous reservation table, including auto-draft
// and regeneration. React render/effect timing never grants a reservation.
export function createPairDraftRunner(read: () => readonly DraftSlot[], dispatch: (action: SlotsAction) => void, adapters: () => PairDraftAdapters, researchStatus: (busy: boolean) => void) {
  let epoch = 0;
  type Pair = { snapshot: AnnouncementDraftRequestContext; context: string; research: Promise<ResourceOutcome> | null; dispatched: boolean };
  let pair: Pair | null = null;
  const reservations = new Map<string, object>();
  function invalidate() {
    if (reservations.size) recordWalkthroughDiagnostic("pair", "cancelled", 0, "optional", reservations.size, pair?.snapshot.sourceKind);
    epoch += 1;
    pair = null;
    reservations.clear();
    researchStatus(false);
  }
  function run(ids: readonly string[], regenerate = false): Promise<void> {
    if (adapters().mayGenerate?.() === false) return Promise.resolve();
    const selected = ids.flatMap(id => {
      const slot = read().find(s => s.id === id);
      return slot && !slot.posting && !reservations.has(id) && (regenerate ? slot.draft.phase === "drafted" : slot.draft.phase === "empty") ? [slot] : [];
    });
    if (!selected.length) return Promise.resolve();
    const token = {};
    const runEpoch = epoch;
    for (const slot of selected) reservations.set(slot.id, token);
    const api = adapters();
    const requestAtStart = Object.freeze({ ...api.buildRequest() });
    const contextAtStart = JSON.stringify([requestAtStart, api.resolveLive()]);
    if (!pair || (!pair.dispatched && pair.context !== contextAtStart)) {
      pair = { snapshot: requestAtStart, context: contextAtStart, research: null, dispatched: false };
    }
    const currentPair = pair;
    const ctx = regenerate ? requestAtStart : currentPair.snapshot;
    const current = () => runEpoch === epoch;
    const started = Date.now();
    let failures = 0;
    for (const slot of selected) dispatch(regenerate ? { type: "regenerate-started", id: slot.id } : { type: "generate-started", ids: [slot.id] });
    // Install the shared promise before invoking even an injected adapter.
    if (!currentPair.research) {
      if (currentPair.snapshot.researchOn) researchStatus(true);
      const captured = currentPair.snapshot;
      currentPair.research = Promise.resolve().then((): Promise<ResourceOutcome> | ResourceOutcome => current() && captured.researchOn ? api.fetchResources(captured) : { kind: "off" })
        .catch((): ResourceOutcome => ({ kind: "failed", reason: "Resource search unavailable." }))
        .finally(() => { if (current() && pair === currentPair) researchStatus(false); });
    }
    const sharedResearch = currentPair.research;
    return Promise.all(selected.map(async slot => {
      const role = pairRole(slot.id) ?? "optional";
      try {
        const outcome = await sharedResearch;
        if (!current() || reservations.get(slot.id) !== token) return;
        if (pair !== currentPair || JSON.stringify([adapters().buildRequest(), adapters().resolveLive()]) !== contextAtStart) {
          if (!currentPair.dispatched && pair === currentPair) pair = null;
          failures += 1;
          dispatch({ type: "result", id: slot.id, result: { error: "The course or draft settings changed while researching. Retry with the current settings." } });
          return;
        }
        const latest = read().find(s => s.id === slot.id);
        if (!latest) return;
        const resolved = resolveChoice(latest.choice, adapters().resolveLive());
        const researchOutcome = api.researchFingerprint(ctx) === api.researchFingerprint(currentPair.snapshot) ? outcome : { kind: "off" as const };
        const revision = regenerate && slot.draft.phase === "drafted" ? { editedDraft: { title: slot.draft.draft.title, message: slot.draft.draft.message }, revisionNote: slot.revisionNote.slice(0, 2000) } : undefined;
        if (!resolved.error) currentPair.dispatched = true;
        const guardedDraft: DraftAdapter = (context, outline) => api.draftOne(context, outline, () => current() && reservations.get(slot.id) === token);
        const result = await dispatchResolvedAnnouncementDraft({ ...ctx, timing: slot.timing, researchOutcome, revision }, resolved, guardedDraft);
        if (!current() || reservations.get(slot.id) !== token) return;
        if ("error" in result) failures += 1;
        dispatch({ type: "result", id: slot.id, result });
        recordWalkthroughDiagnostic("draft", resolved.error ? "invalid-mapping" : "error" in result ? "failed" : "ok", Date.now() - started, role, 1, ctx.sourceKind);
      } catch {
        if (current() && reservations.get(slot.id) === token) {
          failures += 1;
          dispatch({ type: "result", id: slot.id, result: { error: "Could not draft this announcement. Retry this draft; existing edits are kept." } });
          recordWalkthroughDiagnostic("draft", "failed", Date.now() - started, role, 1, ctx.sourceKind);
        }
      } finally {
        if (current() && reservations.get(slot.id) === token) reservations.delete(slot.id);
      }
    })).then(() => { if (current()) recordWalkthroughDiagnostic("pair", failures ? "failed" : "ok", Date.now() - started, "optional", selected.length, ctx.sourceKind); });
  }
  function cancelSlot(id: string) { reservations.delete(id); }
  return { invalidate, cancelSlot, generate: () => run(read().filter(s => s.draft.phase === "empty").map(s => s.id)), retry: (id: string) => run([id]), regenerate: (id: string) => run([id], true) };
}
