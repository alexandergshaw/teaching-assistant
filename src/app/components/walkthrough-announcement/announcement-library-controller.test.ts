import { afterEach, describe, expect, it, vi } from "vitest";
import { createAnnouncementLibraryController, importAnnouncementLibraryFiles, libraryValidation, type LibraryAdapters } from "./announcement-library-controller";
import type { AnnouncementLibraryEntry, AnnouncementLibraryResult } from "@/lib/announcement-library-types";
import { deriveAnnouncementOutline } from "@/lib/announcement-outline";
import { makeSlot, resolveChoice, slotsReducer, type TemplateChoice } from "./announcement-draft-slots";
import { dispatchResolvedAnnouncementDraft, type AnnouncementDraftDispatchContext } from "./useAnnouncementDraftSlots";
const courseId = "course";
function entry(id = "one", body = "Hello class.\n\n## Work\n- Read the book", label = "Beginning") : AnnouncementLibraryEntry {
  return { id, courseId, exemplarText: body, label, outline: deriveAnnouncementOutline(body), createdAt: "2026-01-01" };
}
function deferred<T>() { let resolve!: (value: T) => void; const promise = new Promise<T>(r => { resolve = r; }); return { promise, resolve }; }
function harness(overrides: Partial<LibraryAdapters> = {}) {
  let n = 0;
  const adapters: LibraryAdapters = {
    list: vi.fn(async () => ({ ok: true as const, value: [] })),
    save: vi.fn(async input => ({ ok: true as const, value: entry(input.id, input.exemplarText, input.label ?? "") })),
    remove: vi.fn(async () => ({ ok: true as const, value: undefined })), ...overrides,
  };
  const changed = vi.fn();
  const controller = createAnnouncementLibraryController(courseId, adapters, changed, { uuid: () => `new-${++n}`, debounceMs: 10, timeoutMs: 40 });
  return { controller, adapters, changed };
}
afterEach(() => vi.useRealTimers());
describe("announcement library production controller", () => {
  it("coalesces typing into one stable identity and acknowledges the displayed revision", async () => {
    vi.useFakeTimers(); const { controller: c, adapters } = harness(); const id = c.add()!;
    c.edit(id, "exemplarText", "A"); c.edit(id, "exemplarText", "B"); c.edit(id, "label", "My label");
    await vi.advanceTimersByTimeAsync(10);
    expect(adapters.save).toHaveBeenCalledTimes(1);
    expect(adapters.save).toHaveBeenCalledWith(expect.objectContaining({ id, exemplarText: "B", label: "My label", expected: null }));
    expect(c.getState().cards[0].status).toBe("Saved"); c.dispose();
  });
  it("never overlaps a timed-out write and never marks newer typing saved from an old acknowledgment", async () => {
    vi.useFakeTimers(); const pending = deferred<AnnouncementLibraryResult<AnnouncementLibraryEntry>>();
    const { controller: c, adapters } = harness({ save: vi.fn().mockReturnValueOnce(pending.promise).mockImplementation(async input => ({ ok: true, value: entry(input.id, input.exemplarText) })) });
    const id = c.add("first")!; await vi.advanceTimersByTimeAsync(10);
    c.edit(id, "exemplarText", "second"); await vi.advanceTimersByTimeAsync(50); await c.retry(id);
    expect(adapters.save).toHaveBeenCalledTimes(1); expect(c.getState().cards[0].status).toBe("Could not save");
    pending.resolve({ ok: true, value: entry(id, "first") }); await vi.advanceTimersByTimeAsync(0);
    expect(c.getState().cards[0].status).toBe("Unsaved");
    await vi.advanceTimersByTimeAsync(10);
    expect(adapters.save).toHaveBeenCalledTimes(2);
    expect(adapters.save).toHaveBeenLastCalledWith(expect.objectContaining({ id, exemplarText: "second", expected: { exemplarText: "first", label: "Beginning" } })); c.dispose();
  });
  it("preserves edits during old loads and makes load failures and timeouts distinct", async () => {
    vi.useFakeTimers(); const pending = deferred<AnnouncementLibraryResult<AnnouncementLibraryEntry[]>>();
    const { controller: c } = harness({ list: () => pending.promise });
    const load = c.load(); const id = c.add("local")!;
    await vi.advanceTimersByTimeAsync(41); expect(c.getState().load).toBe("timedout");
    pending.resolve({ ok: true, value: [entry(id, "old")] }); await load;
    expect(c.getState().cards[0].exemplarText).toBe("local"); expect(c.getState().load).toBe("loaded"); c.dispose();
    const failed = harness({ list: async () => { throw Error("private detail"); } }); await failed.controller.load(); expect(failed.controller.getState().load).toBe("failed"); failed.controller.dispose();
  });
  it("serializes confirmed deletion after saving and rejects resurrection by a stale list", async () => {
    vi.useFakeTimers(); const pending = deferred<AnnouncementLibraryResult<AnnouncementLibraryEntry>>();
    const oldList = deferred<AnnouncementLibraryResult<AnnouncementLibraryEntry[]>>();
    const { controller: c, adapters } = harness({ save: () => pending.promise, list: () => oldList.promise });
    const id = c.add("first")!; await vi.advanceTimersByTimeAsync(10); const load = c.load(); const removal = c.remove(id);
    expect(adapters.remove).not.toHaveBeenCalled(); c.edit(id, "exemplarText", "resurrect");
    pending.resolve({ ok: true, value: entry(id, "first") }); await removal;
    oldList.resolve({ ok: true, value: [entry(id)] }); await load;
    expect(adapters.remove).toHaveBeenCalledWith(courseId, id); expect(c.getState().cards).toEqual([]); c.dispose();
  });
  it("keeps a failed removal editable and retries a conflict only after explicit refresh", async () => {
    vi.useFakeTimers(); const saved = entry();
    const { controller: c, adapters } = harness({ list: async () => ({ ok: true, value: [saved] }), remove: async () => ({ ok: false, code: "unavailable" }),
      save: vi.fn().mockResolvedValueOnce({ ok: false, code: "conflict" }).mockImplementation(async input => ({ ok: true, value: entry(input.id, input.exemplarText) })) });
    await c.load(); c.edit(saved.id, "exemplarText", "local"); await vi.advanceTimersByTimeAsync(100);
    expect(adapters.save).toHaveBeenCalledTimes(1); expect(c.blocked(saved.id)).toBe(true);
    await c.retry(saved.id); expect(adapters.save).toHaveBeenCalledTimes(2);
    expect(await c.remove(saved.id)).toBe(false); expect(c.getState().cards[0].deleting).toBe(false); c.dispose();
  });
  it("cancels queued work and ignores old callbacks/import completion across disposal and scope changes", async () => {
    vi.useFakeTimers(); const pending = deferred<AnnouncementLibraryResult<AnnouncementLibraryEntry[]>>();
    const old = harness({ list: () => pending.promise }); const loading = old.controller.load(); old.controller.add("body"); old.controller.dispose();
    const count = old.changed.mock.calls.length; await vi.advanceTimersByTimeAsync(100); pending.resolve({ ok: true, value: [entry()] }); await loading;
    expect(old.adapters.save).not.toHaveBeenCalled(); expect(old.changed).toHaveBeenCalledTimes(count); expect(old.controller.add("late file")).toBeNull();
    const next = harness(); expect(next.controller.getState().cards).toEqual([]); next.controller.dispose();
  });
  it("validates UTF-8 bytes separately and preserves invalid content without writes", async () => {
    vi.useFakeTimers(); expect(libraryValidation("x".repeat(16001), "")).toBeTruthy(); expect(libraryValidation("界".repeat(11000), "")).toBeTruthy();
    expect(libraryValidation("ok", "x".repeat(121))).toBeTruthy(); const { controller: c, adapters } = harness();
    c.add("x".repeat(16001)); await vi.advanceTimersByTimeAsync(20); expect(adapters.save).not.toHaveBeenCalled(); expect(c.getState().cards[0].exemplarText.length).toBe(16001); c.dispose();
  });
});
const ctx: AnnouncementDraftDispatchContext = { courseLabel: "course", moduleLabel: null, materialsText: "new capture", coverageBlock: "", notes: "", provider: "gemini", emojiOn: false, researchOn: false, researchOutcome: { kind: "off" }, timing: "beginning-of-week" };
it("restores labeled examples into actual draft adapter calls and frozen slot receipts; acknowledged edits refresh only explicit regeneration", async () => {
  vi.useFakeTimers(); const a = entry("a"), b = entry("b", "## Updates\nOne paragraph.", "Midweek");
  const { controller: c } = harness({ list: async () => ({ ok: true, value: [a, b] }) }); await c.load();
  const candidates = () => c.getState().cards.flatMap(card => card.acknowledged ? [{ id: card.id, label: card.acknowledged.label ?? "Untitled", outline: card.acknowledged.outline }] : []);
  const live = () => ({ pastedOutline: null, mostRecent: null, saved: candidates(), blocked: c.blocked });
  const choice = (e: AnnouncementLibraryEntry): TemplateChoice => ({ kind: "saved", exemplarId: e.id, label: e.label!, outline: e.outline });
  let slots = [makeSlot("s1", choice(a), ctx.timing), makeSlot("s2", choice(b), ctx.timing)];
  const draftOne = vi.fn(async (_ctx: AnnouncementDraftDispatchContext, _outline: import("@/lib/announcement-outline-types").AnnouncementOutline) => { void _ctx; void _outline; return { title: "New title", message: "New content", researchNotice: { kind: "off" as const } }; });
  for (const id of ["s1", "s2"]) {
    slots = [...slotsReducer(slots, { type: "generate-started", ids: [id] })];
    const result = await dispatchResolvedAnnouncementDraft(ctx, resolveChoice(slots.find(s => s.id === id)!.choice, live()), draftOne);
    slots = [...slotsReducer(slots, { type: "result", id, result })];
  }
  expect(draftOne.mock.calls[0]).toEqual([ctx, a.outline]); expect(draftOne.mock.calls[1]).toEqual([ctx, b.outline]);
  const frozenOther = slots[1].draft;
  expect(slots[0].draft).toMatchObject({ phase: "drafted", draft: { builtFrom: { kind: "saved", exemplarId: "a", label: "Beginning" } } });
  c.edit("a", "exemplarText", "## Revised\n1. Read\n2. Submit"); c.edit("a", "label", "Revised format");
  expect(resolveChoice({ kind: "default" }, { ...live(), mostRecent: candidates()[0] })).toHaveProperty("error");
  expect(resolveChoice({ kind: "default" }, { ...live(), mostRecent: candidates()[0], pastedOutline: b.outline })).not.toHaveProperty("error");
  const blocked = await dispatchResolvedAnnouncementDraft(ctx, resolveChoice(slots[0].choice, live()), draftOne);
  expect(blocked).toHaveProperty("error"); expect(draftOne).toHaveBeenCalledTimes(2);
  await vi.advanceTimersByTimeAsync(10); slots = [...slotsReducer(slots, { type: "regenerate-started", id: "s1" })];
  const result = await dispatchResolvedAnnouncementDraft(ctx, resolveChoice(slots[0].choice, live()), draftOne);
  slots = [...slotsReducer(slots, { type: "result", id: "s1", result })];
  expect(draftOne.mock.calls[2]).toEqual([ctx, c.getState().cards[0].acknowledged!.outline]);
  expect(slots[0].draft).toMatchObject({ phase: "drafted", draft: { builtFrom: { exemplarId: "a", label: "Revised format" } } });
  expect(slots[1].draft).toBe(frozenOther); expect(JSON.stringify(draftOne.mock.calls)).not.toContain(a.exemplarText); c.dispose();
});

it("imports valid siblings as plain text and rejects late file completion after scope disposal", async () => {
  vi.useFakeTimers(); const { controller: c } = harness();
  const result = await importAnnouncementLibraryFiles(c, [
    { name: "Beginning.txt", size: 10, text: async () => "Hello class" },
    { name: "unsafe.html", size: 4, text: async () => "HTML" },
    { name: "Midweek.MD", size: 10, text: async () => "## Updates" },
    { name: "large.txt", size: 32769, text: async () => "large" },
  ]);
  expect(result.count).toBe(2); expect(result.errors).toHaveLength(2);
  expect(c.getState().cards.map(e => [e.label, e.exemplarText])).toEqual([["Beginning", "Hello class"], ["Midweek", "## Updates"]]);
  const pending = deferred<string>(); const importing = importAnnouncementLibraryFiles(c, [{ name: "late.txt", size: 5, text: () => pending.promise }]);
  c.dispose(); pending.resolve("late body"); await importing; expect(c.getState().cards).toHaveLength(2);
});
it("keeps a pending revert dirty and blocked until its actual write settles, then restores A durably", async () => {
  vi.useFakeTimers(); const original = entry("one", "A", "");
  let stored = original; const write = deferred<AnnouncementLibraryResult<AnnouncementLibraryEntry>>();
  const save = vi.fn().mockImplementationOnce(async input => { stored = entry(input.id, input.exemplarText, input.label ?? ""); return write.promise; })
    .mockImplementation(async input => { stored = entry(input.id, input.exemplarText, input.label ?? ""); return { ok: true, value: stored }; });
  const { controller: c } = harness({ list: async () => ({ ok: true, value: [stored] }), save });
  await c.load(); c.edit("one", "exemplarText", "B"); await vi.advanceTimersByTimeAsync(10); c.edit("one", "exemplarText", "A");
  expect(c.dirty()).toBe(true); expect(c.blocked("one")).toBe(true); expect(c.getState().cards[0].status).toBe("Saving");
  write.resolve({ ok: true, value: stored }); await vi.advanceTimersByTimeAsync(10);
  expect(save).toHaveBeenCalledTimes(2); expect(stored.exemplarText).toBe("A"); expect(c.dirty()).toBe(false); c.dispose();
});
it("reconciles lost success B before retrying local A even when A equals the old acknowledgment; reload sees A", async () => {
  vi.useFakeTimers(); let stored = entry("one", "A", "");
  const failure = deferred<AnnouncementLibraryResult<AnnouncementLibraryEntry>>(); let calls = 0;
  const save = vi.fn(async (input: import("@/lib/announcement-library-types").SaveAnnouncementLibraryInput): Promise<AnnouncementLibraryResult<AnnouncementLibraryEntry>> => {
    calls++;
    if (calls === 1) { stored = entry(input.id, input.exemplarText, input.label ?? ""); return failure.promise; }
    if (stored.exemplarText === input.exemplarText) return { ok: true, value: stored };
    if (input.expected?.exemplarText !== stored.exemplarText) return { ok: false, code: "conflict" };
    stored = entry(input.id, input.exemplarText, input.label ?? ""); return { ok: true, value: stored };
  });
  const adapters = { list: async () => ({ ok: true as const, value: [stored] }), save };
  const { controller: c } = harness(adapters); await c.load();
  c.edit("one", "exemplarText", "B"); await vi.advanceTimersByTimeAsync(10); c.edit("one", "exemplarText", "A");
  failure.resolve({ ok: false, code: "unavailable" }); await vi.advanceTimersByTimeAsync(100);
  expect(save).toHaveBeenCalledTimes(1); expect(c.dirty()).toBe(true); expect(c.blocked("one")).toBe(true); expect(c.getState().cards[0].status).toBe("Could not save");
  await c.retry("one");
  expect(save.mock.calls.map(([input]) => [input.exemplarText, input.expected?.exemplarText])).toEqual([["B", "A"], ["B", "A"], ["A", "B"]]);
  expect(c.dirty()).toBe(false); expect(c.getState().cards[0].status).toBe("Saved"); c.dispose();
  const reload = harness(adapters); await reload.controller.load(); expect(reload.controller.getState().cards[0].exemplarText).toBe("A"); reload.controller.dispose();
});
it("a settled local revert displays Saved; clearing an existing row stays dirty while an untouched empty placeholder does not", async () => {
  vi.useFakeTimers(); const { controller: c, adapters } = harness({ list: async () => ({ ok: true, value: [entry("one", "A", "")] }) });
  await c.load(); c.edit("one", "exemplarText", "B"); c.edit("one", "exemplarText", "A");
  expect(c.getState().cards[0].status).toBe("Saved"); expect(c.dirty()).toBe(false);
  c.edit("one", "exemplarText", ""); c.edit("one", "label", ""); await vi.advanceTimersByTimeAsync(10);
  expect(c.dirty()).toBe(true); expect(c.blocked("one")).toBe(true); expect(adapters.save).not.toHaveBeenCalled(); c.dispose();
  const blank = harness(); blank.controller.add(); expect(blank.controller.dirty()).toBe(false); blank.controller.dispose();
});
it("deletes a possibly created stable ID after an unacknowledged create and retains the card when deletion fails", async () => {
  vi.useFakeTimers(); const create = deferred<AnnouncementLibraryResult<AnnouncementLibraryEntry>>();
  const remove = vi.fn().mockResolvedValueOnce({ ok: false, code: "unavailable" }).mockResolvedValue({ ok: true, value: undefined });
  const { controller: c } = harness({ save: () => create.promise, remove });
  const id = c.add("Created on server")!; await vi.advanceTimersByTimeAsync(10); const removing = c.remove(id);
  expect(remove).not.toHaveBeenCalled(); create.resolve({ ok: false, code: "unavailable" });
  expect(await removing).toBe(false); expect(remove).toHaveBeenCalledWith(courseId, id); expect(c.getState().cards).toHaveLength(1);
  expect(await c.remove(id)).toBe(true); expect(c.getState().cards).toEqual([]); c.dispose();
  const blank = harness(); const blankId = blank.controller.add()!; await blank.controller.remove(blankId);
  expect(blank.adapters.remove).not.toHaveBeenCalled(); blank.controller.dispose();
});
