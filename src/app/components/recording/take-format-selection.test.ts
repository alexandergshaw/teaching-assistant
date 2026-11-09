import { describe, expect, it, vi } from "vitest";
import { EMPTY_ANNOUNCEMENT_OUTLINE } from "@/lib/announcement-outline-types";
import { awaitCurrentDraft, beginTakeDraft, dispatchInitialTakeDraft, initialTakeStage, resolveTakeFormat } from "./take-format-selection";
import type { LibraryCard, LibraryState } from "../walkthrough-announcement/announcement-library-controller";
const emoji = String.fromCodePoint(0x1f4cc);
const entry = { id: "one", courseId: "course", exemplarText: `Sample ${emoji}`, label: null, outline: EMPTY_ANNOUNCEMENT_OUTLINE, createdAt: "2026" };
const card: LibraryCard = { id: "one", exemplarText: entry.exemplarText, label: "", acknowledged: entry, status: "Saved", error: null, deleting: false };
const state = (cards: LibraryCard[], load: LibraryState["load"] = "loaded"): LibraryState => ({ cards, load });
const selection = { scope: "owner:course", id: "one" };
describe("take format selection", () => {
  it("locks the start synchronously and preserves the first resolver on repeated activation", () => {
    const lock = { current: false }, first = vi.fn(), second = vi.fn();
    expect(beginTakeDraft(lock, false, first)).toBe(true);
    expect(beginTakeDraft(lock, false, second)).toBe(false);
    expect(first).toHaveBeenCalledTimes(1); expect(second).not.toHaveBeenCalled();
  });
  it("reopens a posted take in review and never starts it", () => {
    const start = vi.fn();
    expect(initialTakeStage(true)).toBe("review"); expect(initialTakeStage(false)).toBe("idle");
    expect(beginTakeDraft({ current: false }, true, start)).toBe(false); expect(start).not.toHaveBeenCalled();
  });
  it("sends the selected saved example on the first draft", async () => {
    const draft = vi.fn().mockResolvedValue(undefined), invalid = vi.fn();
    await dispatchInitialTakeDraft("selected transcript", () => resolveTakeFormat(selection, "owner:course", true, state([card])), draft, invalid);
    expect(draft).toHaveBeenCalledWith("selected transcript", { outline: EMPTY_ANNOUNCEMENT_OUTLINE, symbols: [emoji] }, expect.any(Function));
    expect(invalid).not.toHaveBeenCalled();
  });
  it("discards a deferred response after its scope or selected example changes", async () => {
    let finish!: (value: string) => void, scope = "owner:course";
    const request = new Promise<string>((resolve) => { finish = resolve; });
    const result = awaitCurrentDraft(request, () => scope === "owner:course");
    scope = "other:course"; finish("private old draft");
    expect(await result).toEqual({ kind: "stale" });
  });
  it("fences the initial model response when the selected example is revised in flight", async () => {
    let finish!: (value: string) => void, currentCard = card;
    const request = new Promise<string>((resolve) => { finish = resolve; });
    const received = vi.fn(), invalid = vi.fn();
    const dispatch = dispatchInitialTakeDraft("transcript", () => resolveTakeFormat(selection, "owner:course", true, state([currentCard])),
      async (_transcript, _example, current) => { received(await awaitCurrentDraft(request, current)); }, invalid);
    currentCard = { ...card, acknowledged: { ...entry, exemplarText: `Changed ${String.fromCodePoint(0x1f4a1)}` } };
    finish("old draft"); await dispatch;
    expect(received).toHaveBeenCalledWith({ kind: "stale" }); expect(invalid).not.toHaveBeenCalled();
  });
  it("returns a current response and rejects canceled failures as stale", async () => {
    expect(await awaitCurrentDraft(Promise.resolve("draft"), () => true)).toEqual({ kind: "result", value: "draft" });
    expect(await awaitCurrentDraft(Promise.reject(new Error("private")), () => false)).toEqual({ kind: "stale" });
  });
  it("does not dispatch after the account, course, or example changes while transcribing", async () => {
    const draft = vi.fn(), invalid = vi.fn();
    await dispatchInitialTakeDraft("transcript", () => resolveTakeFormat(selection, "other:course", true, state([card])), draft, invalid);
    await dispatchInitialTakeDraft("transcript", () => resolveTakeFormat(selection, "owner:course", true, state([{ ...card, status: "Unsaved" }])), draft, invalid);
    expect(draft).not.toHaveBeenCalled(); expect(invalid).toHaveBeenCalledTimes(2);
  });
  it("uses the current saved example and preserves its literal symbol", () => {
    expect(resolveTakeFormat(selection, "owner:course", true, state([card]))).toEqual({ ok: true, example: { outline: EMPTY_ANNOUNCEMENT_OUTLINE, symbols: [emoji] } });
  });
  it("blocks a different owner or course, unavailable library and missing card", () => {
    expect(resolveTakeFormat(selection, "other:course", true, state([card])).ok).toBe(false);
    expect(resolveTakeFormat(selection, "owner:other", true, state([card])).ok).toBe(false);
    expect(resolveTakeFormat(selection, "owner:course", false, state([card])).ok).toBe(false);
    expect(resolveTakeFormat(selection, "owner:course", true, state([card], "loading")).ok).toBe(false);
    expect(resolveTakeFormat(selection, "owner:course", true, state([])).ok).toBe(false);
  });
  it("blocks unsaved, failed, saving and deleting cards", () => {
    for (const status of ["Unsaved", "Saving", "Could not save"] as const) expect(resolveTakeFormat(selection, "owner:course", true, state([{ ...card, status }])).ok).toBe(false);
    expect(resolveTakeFormat(selection, "owner:course", true, state([{ ...card, deleting: true }])).ok).toBe(false);
  });
  it("supports the default without an example", () => expect(resolveTakeFormat(null, "", false, state([], "loading"))).toEqual({ ok: true, example: null }));
});
