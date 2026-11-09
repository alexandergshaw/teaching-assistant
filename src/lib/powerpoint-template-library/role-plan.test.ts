import { describe, expect, it } from "vitest";
import { planRoleAwareSlides } from "./role-plan";

const source = [
  { id: "slide-a", ordinal: 1, text: "Body" },
  { id: "slide-b", ordinal: 2, text: "Title" },
  { id: "slide-c", ordinal: 3, text: "Body with bullet" },
];
const definition = { version: 1, slides: [
  { id: "slide-a", role: "content" },
  { id: "slide-b", role: "title" },
  { id: "slide-c", role: "content" },
] };
const groups = [
  { slide: 1, paragraphs: [{ id: "a-title" }] },
  { slide: 2, paragraphs: [{ id: "b-title" }] },
  { slide: 3, paragraphs: [{ id: "c-title" }, { id: "c-body" }] },
];

describe("role-aware template planner", () => {
  it("matches explicitly requested roles and capacity in requested order without reusing slides", () => {
    expect(planRoleAwareSlides(definition, source, groups, [
      { role: "title", bulletCount: 0 }, { role: "content", bulletCount: 1 }, { role: "content", bulletCount: 0 },
    ])).toEqual({ ok: true, assignments: [
      { outputIndex: 0, sourceId: "slide-b", sourceOrdinal: 2, paragraphIds: ["b-title"] },
      { outputIndex: 1, sourceId: "slide-c", sourceOrdinal: 3, paragraphIds: ["c-title", "c-body"] },
      { outputIndex: 2, sourceId: "slide-a", sourceOrdinal: 1, paragraphIds: ["a-title"] },
    ] });
  });
  it("refuses missing roles, insufficient capacity and slide-count mismatch", () => {
    expect(planRoleAwareSlides(definition, source, groups, [{ role: "closing", bulletCount: 0 }, { role: "content", bulletCount: 1 }, { role: "content", bulletCount: 0 }])).toMatchObject({ ok: false });
    expect(planRoleAwareSlides(definition, source, groups, [{ role: "title", bulletCount: 1 }, { role: "content", bulletCount: 1 }, { role: "content", bulletCount: 0 }])).toMatchObject({ ok: false });
    expect(planRoleAwareSlides(definition, source, groups, [{ role: "title", bulletCount: 0 }])).toMatchObject({ ok: false });
  });
  it("refuses forged identities, duplicate groups, duplicate slots and textless templates", () => {
    const request = [{ role: "title" as const, bulletCount: 0 }, { role: "content" as const, bulletCount: 1 }, { role: "content" as const, bulletCount: 0 }];
    expect(planRoleAwareSlides({ version: 1, slides: [{ id: "foreign", role: "content" }, ...definition.slides.slice(1)] }, source, groups, request)).toMatchObject({ ok: false });
    expect(planRoleAwareSlides(definition, source, [groups[0], groups[0], groups[2]], request)).toMatchObject({ ok: false });
    expect(planRoleAwareSlides(definition, source, [groups[0], groups[1], { slide: 3, paragraphs: [{ id: "a-title" }, { id: "c-body" }] }], request)).toMatchObject({ ok: false });
    expect(planRoleAwareSlides(definition, source.map((item) => item.id === "slide-b" ? { ...item, text: "" } : item), groups, request)).toMatchObject({ ok: false });
  });
});
