import { describe, expect, it } from "vitest";
import { pptFixture } from "./inventory.test";
import { inventorySlides } from "./inventory";
import { fillRoleAwareTemplate } from "./role-fill";

describe("role-aware PowerPoint output", () => {
  it("reorders a real source package to the requested roles and verifies generated text", async () => {
    const bytes = await pptFixture(["Content source", "Title source"]);
    const source = await inventorySlides(bytes);
    expect(source.map((slide) => slide.text)).toEqual(["Title source", "Content source"]);
    const definition = { version: 1, slides: source.map((slide) => ({ ...slide, role: slide.text === "Title source" ? "title" : "content" })) };
    const result = await fillRoleAwareTemplate(bytes, definition, [{ role: "content", title: "New content", bullets: [] }, { role: "title", title: "New title", bullets: [] }]);
    const output = await inventorySlides(result);
    expect(output.map((slide) => [slide.id, slide.text])).toEqual([[source[1].id, "New content"], [source[0].id, "New title"]]);
    expect((await inventorySlides(bytes)).map((slide) => slide.text)).toEqual(["Title source", "Content source"]);
  });
  it("does not return a file if role counts or editable slot counts do not fit", async () => {
    const bytes = await pptFixture(["Content source", "Title source"]);
    const source = await inventorySlides(bytes);
    const definition = { version: 1, slides: source.map((slide) => ({ ...slide, role: "content" })) };
    await expect(fillRoleAwareTemplate(bytes, definition, [{ role: "title", title: "Title", bullets: [] }, { role: "content", title: "Content", bullets: [] }])).rejects.toThrow("No unused title");
  });
});
