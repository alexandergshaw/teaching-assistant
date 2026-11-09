import { describe, expect, it } from "vitest";
import { EMPTY_ANNOUNCEMENT_OUTLINE } from "@/lib/announcement-outline-types";
import { resolveTakeFormat } from "./take-format-selection";
import type { LibraryCard, LibraryState } from "../walkthrough-announcement/announcement-library-controller";
const emoji = String.fromCodePoint(0x1f4cc);
const entry = { id: "one", courseId: "course", exemplarText: `Sample ${emoji}`, label: null, outline: EMPTY_ANNOUNCEMENT_OUTLINE, createdAt: "2026" };
const card: LibraryCard = { id: "one", exemplarText: entry.exemplarText, label: "", acknowledged: entry, status: "Saved", error: null, deleting: false };
const state = (cards: LibraryCard[], load: LibraryState["load"] = "loaded"): LibraryState => ({ cards, load });
const selection = { scope: "owner:course", id: "one" };
describe("take format selection", () => {
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
