import { promptSafeAnnouncementOutline } from "@/lib/announcement-prompt-outline";
import type { AnnouncementOutline } from "@/lib/announcement-outline-types";
import { resolveChoice, type DraftSlot, type SlotsAction, type ResearchNotice, type ResourceOutcome, type LiveDefaults } from "./announcement-draft-slots";
import type { AnnouncementDraftRequestContext, AnnouncementDraftDispatchContext } from "./useAnnouncementDraftSlots";
import { pairRole } from "./pair-preferences";
import { recordWalkthroughDiagnostic } from "./walkthrough-diagnostics";
type DraftAdapter = (ctx: AnnouncementDraftDispatchContext, outline: AnnouncementOutline) => Promise<{ title: string; message: string; researchNotice: ResearchNotice } | { error: string }>;
export async function dispatchResolvedAnnouncementDraft(ctx: AnnouncementDraftDispatchContext, resolved: ReturnType<typeof resolveChoice>, draftOne: DraftAdapter) {
  if (resolved.error) return { error: resolved.error };
  const result = await draftOne(ctx, promptSafeAnnouncementOutline(resolved.outline));
  return "error" in result ? result : { ...result, builtFrom: resolved.template, timing: ctx.timing };
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
  let snapshot: AnnouncementDraftRequestContext | null = null;
  let research: Promise<ResourceOutcome> | null = null;
  const reservations = new Map<string, object>();
  function invalidate() {
    if (reservations.size) recordWalkthroughDiagnostic("pair", "cancelled", 0, "optional", reservations.size, snapshot?.sourceKind);
    epoch += 1;
    snapshot = null;
    research = null;
    reservations.clear();
    researchStatus(false);
  }
  function run(ids: readonly string[], regenerate = false): Promise<void> {
    if (adapters().mayGenerate?.() === false) return Promise.resolve();
    const selected = ids.flatMap(id => {
      const slot = read().find(s => s.id === id);
      return slot && !reservations.has(id) && (regenerate ? slot.draft.phase === "drafted" : slot.draft.phase === "empty") ? [slot] : [];
    });
    if (!selected.length) return Promise.resolve();
    const token = {};
    const runEpoch = epoch;
    for (const slot of selected) reservations.set(slot.id, token);
    const api = adapters();
    snapshot ??= Object.freeze({ ...api.buildRequest() });
    const ctx = regenerate ? Object.freeze({ ...api.buildRequest() }) : snapshot;
    const current = () => runEpoch === epoch;
    const started = Date.now();
    let failures = 0;
    for (const slot of selected) dispatch(regenerate ? { type: "regenerate-started", id: slot.id } : { type: "generate-started", ids: [slot.id] });
    // Install the shared promise before invoking even an injected adapter.
    if (!research) {
      if (snapshot.researchOn) researchStatus(true);
      const captured = snapshot;
      research = Promise.resolve().then((): Promise<ResourceOutcome> | ResourceOutcome => current() && captured.researchOn ? api.fetchResources(captured) : { kind: "off" })
        .catch((): ResourceOutcome => ({ kind: "failed", reason: "Resource search unavailable." }))
        .finally(() => { if (current()) researchStatus(false); });
    }
    const sharedResearch = research;
    return Promise.all(selected.map(async slot => {
      const role = pairRole(slot.id) ?? "optional";
      try {
        const outcome = await sharedResearch;
        if (!current() || reservations.get(slot.id) !== token) return;
        const latest = read().find(s => s.id === slot.id);
        if (!latest) return;
        const resolved = resolveChoice(latest.choice, adapters().resolveLive());
        const researchOutcome = api.researchFingerprint(ctx) === api.researchFingerprint(snapshot!) ? outcome : { kind: "off" as const };
        const revision = regenerate && slot.draft.phase === "drafted" ? { editedDraft: { title: slot.draft.draft.title, message: slot.draft.draft.message }, revisionNote: slot.revisionNote.slice(0, 2000) } : undefined;
        const result = await dispatchResolvedAnnouncementDraft({ ...ctx, timing: slot.timing, researchOutcome, revision }, resolved, api.draftOne);
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
  return { invalidate, generate: () => run(read().filter(s => s.draft.phase === "empty").map(s => s.id)), retry: (id: string) => run([id]), regenerate: (id: string) => run([id], true) };
}
