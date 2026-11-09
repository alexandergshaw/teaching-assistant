import { beforeEach, describe, expect, it, vi } from "vitest";
import { pptFixture } from "@/lib/powerpoint-template-library/inventory.test";
import { inventorySlides } from "@/lib/powerpoint-template-library/inventory";
const h = vi.hoisted(() => ({ user: vi.fn(), library: vi.fn(), source: vi.fn() }));
vi.mock("@/lib/supabase/auth", () => ({ requireUser: h.user }));
vi.mock("@/lib/powerpoint-template-library/store", () => ({ getLibrary: h.library, getSource: h.source }));
import { fillRoleAwarePowerPointAction } from "./powerpoint-role-fill";

beforeEach(() => { vi.clearAllMocks(); h.user.mockResolvedValue({ id: "owner" }); });
describe("role-aware PowerPoint action", () => {
  it("loads owner-scoped library/source and returns a real role-ordered package", async () => {
    const bytes = await pptFixture(["Content source", "Title source"]);
    const inventory = await inventorySlides(bytes);
    h.library.mockResolvedValue({ sourceFileId: "source", name: "Template", definition: { version: 1, slides: inventory.map((slide) => ({ ...slide, role: slide.text === "Title source" ? "title" : "content" })) } });
    h.source.mockResolvedValue({ content: bytes.toString("base64") });
    const result = await fillRoleAwarePowerPointAction("library", "source", { presentationTitle: "Deck", slides: [{ role: "content", title: "Body", bullets: [] }, { role: "title", title: "Opening", bullets: [] }] });
    if ("error" in result) throw new Error(result.error);
    expect(h.library).toHaveBeenCalledWith("owner", "library");
    expect(h.source).toHaveBeenCalledWith("owner", "source");
    expect((await inventorySlides(Buffer.from(result.base64, "base64"))).map((slide) => slide.text)).toEqual(["Body", "Opening"]);
  });
  it("refuses identity mismatch, unauthenticated requests and content it cannot preserve", async () => {
    h.library.mockResolvedValue({ sourceFileId: "other" });
    const deck = { presentationTitle: "Deck", slides: [{ role: "title", title: "Title", bullets: [] }] };
    expect(await fillRoleAwarePowerPointAction("library", "source", deck)).toHaveProperty("error", expect.stringContaining("no longer match"));
    expect(h.source).not.toHaveBeenCalled();
    expect(await fillRoleAwarePowerPointAction("library", "source", { ...deck, slides: [{ ...deck.slides[0], notes: "Important" }] })).toHaveProperty("error", expect.stringContaining("notes"));
    h.user.mockRejectedValueOnce(new Error("no access"));
    expect(await fillRoleAwarePowerPointAction("library", "source", deck)).toHaveProperty("error");
  });
  it("does not return output if the library changes while filling", async () => {
    const bytes = await pptFixture(["Source"]);
    const source = await inventorySlides(bytes);
    const definition = { version: 1, slides: source.map((slide) => ({ ...slide, role: "title" })) };
    h.library.mockResolvedValueOnce({ sourceFileId: "source", name: "T", updatedAt: "old", definition }).mockResolvedValueOnce({ sourceFileId: "source", name: "T", updatedAt: "new", definition });
    h.source.mockResolvedValue({ content: bytes.toString("base64") });
    const result = await fillRoleAwarePowerPointAction("library", "source", { presentationTitle: "D", slides: [{ title: "New", bullets: [], role: "title" }] });
    expect(result).toHaveProperty("error", expect.stringContaining("changed"));
    expect(result).not.toHaveProperty("base64");
  });
});
