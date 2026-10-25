import { describe, expect, it, vi } from "vitest";
import { deriveAnnouncementOutline } from "@/lib/announcement-outline";
import { buildWalkthroughAnnouncementPrompt } from "@/lib/walkthrough-announcement-prompt";
import { createPairDraftRunner, type PairDraftAdapters } from "./pair-dispatch";
import { makeSlot, slotsReducer, type DraftSlot, type SlotsAction, type ResourceOutcome } from "./announcement-draft-slots";
import { createPairPreferenceStore, preferenceChoice } from "./pair-preferences";
import type { AnnouncementDraftRequestContext } from "./useAnnouncementDraftSlots";

// Independent semantic fixtures: old facts occur in headings as well as prose.
const WEEKLY = "## Week OLD_WEEK: OLD_TOPIC\nWelcome to OLD_BODY.\n\nComplete\n\n- OLD_TASK one\n- OLD_TASK two\n- OLD_TASK three\n\nAlso Review\n\nRead OLD_READING.\n\nBefore You Submit\n\n- [ ] OLD_CHECK one\n- [ ] OLD_CHECK two\n\nHelp\n\nAsk about OLD_HELP.";
const MIDWEEK = "Hello everyone,\n\n## OLD_ASSIGNMENT criteria\nRemember OLD_REQUIREMENT.\n\nComplete\n\n1. OLD_STEP one\n2. OLD_STEP two\n\nHelp\n\nContact OLD_PERSON.\n\nThanks,";
const context: AnnouncementDraftRequestContext = { courseLabel: "Current course", moduleLabel: "Current week", materialsText: "CURRENT_FACT: Lab 12 due Thursday; explain three observations.", coverageBlock: "One visible page", notes: "", provider: "gemini", emojiOn: false, researchOn: true };
function deferred<T>() { let resolve!: (v: T) => void; const promise = new Promise<T>(r => { resolve = r; }); return { promise, resolve }; }
async function drain() { for (let i = 0; i < 8; i++) await Promise.resolve(); }
function harness(researchOn = true) {
  const entries = [{ id: "A", label: "Weekly", outline: deriveAnnouncementOutline(WEEKLY) }, { id: "B", label: "Reminder", outline: deriveAnnouncementOutline(MIDWEEK) }];
  let state: readonly DraftSlot[] = entries.map((e, i) => makeSlot(`wta-slot-${i + 1}`, { kind: "saved", exemplarId: e.id, label: e.label, outline: e.outline }, i ? "midweek" : "beginning-of-week"));
  const dispatch = (a: SlotsAction) => { state = slotsReducer(state, a); };
  const buildRequest = vi.fn(() => ({ ...context, researchOn }));
  const fetchResources = vi.fn(async (): Promise<ResourceOutcome> => ({ kind: "found", links: [{ title: "Current", url: "https://example.org/current" }] }));
  const draftOne = vi.fn<PairDraftAdapters["draftOne"]>(async ctx => ({ title: ctx.timing, message: "Fresh draft", researchNotice: { kind: "off" } }));
  const live = { pastedOutline: null, mostRecent: entries[0], saved: entries, savedState: "loaded" as const, blocked: (id: string) => { void id; return false; } };
  const adapters: PairDraftAdapters = { buildRequest, fetchResources, draftOne, resolveLive: () => live, researchFingerprint: ctx => ctx.materialsText + ctx.researchOn };
  const runner = createPairDraftRunner(() => state, dispatch, () => adapters, vi.fn());
  return { runner, entries, live, adapters, dispatch, buildRequest, fetchResources, draftOne, read: () => state };
}

describe("production pair runner", () => {
  it("admits the finalized snapshot only after the captured-frame queue and synchronous extraction marker drain", async () => {
    const h = harness(false);
    let pendingFrames = 2;
    let batchInFlight = false;
    h.adapters.mayGenerate = () => pendingFrames === 0 && !batchInFlight;
    await h.runner.generate();
    expect(h.buildRequest).not.toHaveBeenCalled(); expect(h.draftOne).not.toHaveBeenCalled();
    pendingFrames = 0; batchInFlight = true;
    await h.runner.generate();
    expect(h.buildRequest).not.toHaveBeenCalled(); expect(h.draftOne).not.toHaveBeenCalled();
    h.buildRequest.mockReturnValue({ ...context, researchOn: false, materialsText: "FINAL_DRAINED_PAGE" });
    batchInFlight = false;
    await h.runner.generate();
    expect(h.buildRequest).toHaveBeenCalledTimes(1);
    expect(h.draftOne.mock.calls.map(([ctx]) => ctx.materialsText)).toEqual(["FINAL_DRAINED_PAGE", "FINAL_DRAINED_PAGE"]);
  });
  it("reserves synchronously even when slot reads remain stale until React commits", async () => {
    const h = harness(false);
    const stale = h.read(); const draft = deferred<Awaited<ReturnType<PairDraftAdapters["draftOne"]>>>();
    h.draftOne.mockImplementation(() => draft.promise);
    const runner = createPairDraftRunner(() => stale, vi.fn(), () => h.adapters, vi.fn());
    const a = runner.generate(); const b = runner.generate(); const c = runner.regenerate("wta-slot-1");
    await drain(); expect(h.draftOne).toHaveBeenCalledTimes(2);
    draft.resolve({ title: "Fresh", message: "Fresh", researchNotice: { kind: "off" } }); await Promise.all([a, b, c]);
  });
  it("reserves both targets before research: same-tick manual, auto and regenerate issue one call each", async () => {
    const h = harness();
    const research = deferred<ResourceOutcome>();
    const draft = deferred<Awaited<ReturnType<PairDraftAdapters["draftOne"]>>>();
    h.fetchResources.mockImplementation(() => research.promise);
    h.draftOne.mockImplementation(() => draft.promise);
    const first = h.runner.generate();
    const second = h.runner.generate();
    const automatic = h.runner.generate();
    const regeneration = h.runner.regenerate("wta-slot-1");
    await drain();
    expect(h.fetchResources).toHaveBeenCalledTimes(1);
    expect(h.draftOne).toHaveBeenCalledTimes(0);
    research.resolve({ kind: "off" }); await drain();
    expect(h.draftOne).toHaveBeenCalledTimes(2);
    expect(h.draftOne.mock.calls.map(([ctx]) => ctx.timing)).toEqual(["beginning-of-week", "midweek"]);
    expect(h.draftOne.mock.calls.map(([ctx]) => ctx.materialsText)).toEqual([context.materialsText, context.materialsText]);
    expect(h.draftOne.mock.calls[0][1]).not.toEqual(h.draftOne.mock.calls[1][1]);
    draft.resolve({ title: "Fresh", message: "Fresh", researchNotice: { kind: "off" } });
    await Promise.all([first, second, automatic, regeneration]);
    expect(h.draftOne).toHaveBeenCalledTimes(2);
    expect(h.buildRequest).toHaveBeenCalledTimes(1);
  });
  it("reserves before draft even with research off", async () => {
    const h = harness(false); const draft = deferred<Awaited<ReturnType<PairDraftAdapters["draftOne"]>>>();
    h.draftOne.mockImplementation(() => draft.promise);
    const a = h.runner.generate(); const b = h.runner.generate(); await drain();
    expect(h.draftOne).toHaveBeenCalledTimes(2); expect(h.fetchResources).toHaveBeenCalledTimes(0);
    draft.resolve({ title: "Fresh", message: "Fresh", researchNotice: { kind: "off" } }); await Promise.all([a, b]);
  });
  it("retries only the failed role from the captured snapshot with settled research and keeps edited sibling", async () => {
    const h = harness();
    h.draftOne.mockImplementation(async ctx => ctx.timing === "midweek" ? { error: "unavailable" } : { title: "Weekly", message: "Original", researchNotice: { kind: "off" } });
    await h.runner.generate();
    h.dispatch({ type: "edit", id: "wta-slot-1", field: "message", value: "Instructor edited weekly" });
    h.buildRequest.mockReturnValue({ ...context, materialsText: "CHANGED_MATERIAL" });
    h.draftOne.mockResolvedValue({ title: "Reminder", message: "Retried", researchNotice: { kind: "off" } });
    await h.runner.retry("wta-slot-2");
    expect(h.fetchResources).toHaveBeenCalledTimes(1); expect(h.buildRequest).toHaveBeenCalledTimes(1);
    expect(h.draftOne).toHaveBeenCalledTimes(3);
    expect(h.draftOne.mock.calls[2][0].materialsText).toBe(context.materialsText);
    expect(h.draftOne.mock.calls[2][0].timing).toBe("midweek");
    expect(h.read()[0].draft).toMatchObject({ phase: "drafted", draft: { message: "Instructor edited weekly" } });
  });
  it("freshly resolves missing/deleted and dirty mappings without using their carried outline", async () => {
    const h = harness(false);
    h.live.saved = h.entries.slice(1); // Keep A in the selected choice and mostRecent.
    await h.runner.generate();
    expect(h.draftOne).toHaveBeenCalledTimes(1);
    expect(h.draftOne.mock.calls[0][0].timing).toBe("midweek");
    expect(h.read()[0].draft).toMatchObject({ phase: "empty", error: expect.stringContaining("unavailable") });
    h.live.saved = h.entries;
    h.live.blocked = id => id === "A";
    await h.runner.retry("wta-slot-1");
    expect(h.draftOne).toHaveBeenCalledTimes(1);
    expect(h.read()[0].draft).toMatchObject({ error: expect.stringContaining("Save or retry") });
  });
  it("old research/finally cannot update reset slots or release a newer reservation", async () => {
    const h = harness(); const oldResearch = deferred<ResourceOutcome>(); const newDraft = deferred<Awaited<ReturnType<PairDraftAdapters["draftOne"]>>>();
    h.fetchResources.mockImplementationOnce(() => oldResearch.promise);
    const old = h.runner.generate(); await drain();
    h.runner.invalidate();
    for (const i of h.entries.keys()) h.dispatch({ type: "result", id: `wta-slot-${i + 1}`, result: { error: "reset" } });
    h.draftOne.mockImplementation(() => newDraft.promise);
    const fresh = h.runner.generate(); await drain();
    oldResearch.resolve({ kind: "off" }); await old; await drain();
    await h.runner.generate();
    expect(h.draftOne).toHaveBeenCalledTimes(2);
    newDraft.resolve({ title: "New run", message: "New run", researchNotice: { kind: "off" } }); await fresh;
    expect(h.read()[0].draft).toMatchObject({ draft: { message: "New run" } });
  });
  it("discards late draft results and finally handlers while a newer run is reserved", async () => {
    const h = harness(false); const oldDraft = deferred<Awaited<ReturnType<PairDraftAdapters["draftOne"]>>>(); const freshDraft = deferred<Awaited<ReturnType<PairDraftAdapters["draftOne"]>>>();
    h.draftOne.mockImplementation(() => oldDraft.promise);
    const old = h.runner.generate(); await drain(); h.runner.invalidate();
    for (const slot of h.read()) h.dispatch({ type: "result", id: slot.id, result: { error: "reset" } });
    h.draftOne.mockImplementation(() => freshDraft.promise);
    const fresh = h.runner.generate(); await drain();
    oldDraft.resolve({ title: "OLD_OUTPUT", message: "OLD_OUTPUT", researchNotice: { kind: "off" } }); await old;
    expect(h.read().every(slot => slot.draft.phase === "drafting")).toBe(true);
    await h.runner.generate(); expect(h.draftOne).toHaveBeenCalledTimes(4);
    freshDraft.resolve({ title: "NEW_OUTPUT", message: "NEW_OUTPUT", researchNotice: { kind: "off" } }); await fresh;
    expect(h.read()[0].draft).toMatchObject({ draft: { message: "NEW_OUTPUT" } });
  });
  it("regenerates only the target with edited draft and bounded note, preserving edits/note on rejection", async () => {
    const h = harness(false); await h.runner.generate();
    h.dispatch({ type: "edit", id: "wta-slot-1", field: "message", value: "Edited target" });
    h.dispatch({ type: "edit", id: "wta-slot-1", field: "revisionNote", value: "Shorten ".repeat(400) });
    const sibling = h.read()[1];
    h.draftOne.mockRejectedValue(new Error("PRIVATE_UPSTREAM"));
    await h.runner.regenerate("wta-slot-1");
    expect(h.draftOne).toHaveBeenCalledTimes(3);
    expect(h.draftOne.mock.calls[2][0].revision).toMatchObject({ editedDraft: { message: "Edited target" } });
    expect(h.draftOne.mock.calls[2][0].revision?.revisionNote).toHaveLength(2000);
    expect(h.read()[0].draft).toMatchObject({ draft: { message: "Edited target" } });
    expect(h.read()[0].revisionNote).toHaveLength(2000); expect(h.read()[1]).toBe(sibling);
  });
});

describe("restored choices reach the real runner and safe prompt", () => {
  it("reloads independent ID choices and produces distinct formats without old body or factual headings", async () => {
    const data = new Map<string, string>(); const storage = { getItem: (key: string) => data.get(key) ?? null, setItem: (key: string, value: string) => { data.set(key, value); } };
    const first = createPairPreferenceStore("account:course", storage); first.load();
    first.choose("weekly", { kind: "saved", exemplarId: "A", label: "private label", outline: deriveAnnouncementOutline(WEEKLY) });
    first.choose("midweek", { kind: "saved", exemplarId: "B", label: "private label", outline: deriveAnnouncementOutline(MIDWEEK) });
    expect([...data.values()].join()).not.toContain("OLD_");
    const fresh = createPairPreferenceStore("account:course", storage).load(); const h = harness(false);
    h.dispatch({ type: "choose", id: "wta-slot-1", choice: preferenceChoice(fresh.value.weekly) });
    h.dispatch({ type: "choose", id: "wta-slot-2", choice: preferenceChoice(fresh.value.midweek) });
    await h.runner.generate();
    const calls = h.draftOne.mock.calls;
    expect(calls[0][1].sections.map(s => [s.heading, s.listKind])).toEqual([["Current material section", null], ["Complete", "unordered"], ["Also Review", null], ["Before You Submit", "unordered"], ["Help", null]]);
    expect(calls[1][1].sections.map(s => [s.heading, s.listKind])).toEqual([["Current material section", null], ["Complete", "ordered"], ["Help", null]]);
    expect(calls[0][1].sections[3]).toMatchObject({ checklist: true, listItemRange: [1, 3] });
    for (const [ctx, outline] of calls) {
      const prompt = buildWalkthroughAnnouncementPrompt({ ...ctx, outline: JSON.parse(JSON.stringify(outline)), styleBlock: "", emojiPolicy: "forbidden", researchedResources: [] });
      expect(prompt).not.toContain("OLD_"); expect(prompt).toContain("CURRENT_FACT"); expect(prompt).toContain("Complete");
    }
    expect(createPairPreferenceStore("other-account:course", storage).load().value).toEqual({ weekly: null, midweek: null });
    expect(createPairPreferenceStore("account:other-course", storage).load().value).toEqual({ weekly: null, midweek: null });
  });
  it("distinguishes missing, corrupt, blocked storage and pending reads; none is explicit", () => {
    const writes = vi.fn(); const pending = createPairPreferenceStore("scope", { getItem: () => null, setItem: writes });
    expect(pending.choose("weekly", { kind: "none" })).toBe(false); expect(writes).not.toHaveBeenCalled();
    expect(pending.load()).toEqual({ value: { weekly: null, midweek: null }, error: null });
    expect(pending.choose("weekly", { kind: "none" })).toBe(true);
    expect(preferenceChoice(null).kind).toBe("unresolved"); expect(preferenceChoice({ kind: "none" }).kind).toBe("none");
    expect(createPairPreferenceStore("scope", { getItem: () => '{"version":2}', setItem: writes }).load().error).toBe("storage-corrupt");
    expect(createPairPreferenceStore("scope", { getItem: () => { throw new Error("denied"); }, setItem: writes }).load().error).toBe("storage-unavailable");
  });
});
