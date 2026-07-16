import { describe, it, expect } from "vitest";
import { mapDeckTemplate } from "./deck-templates";
import type { Database, Json } from "./supabase/types";

type Row = Database["public"]["Tables"]["deck_templates"]["Row"];

function row(overrides: Partial<Row> = {}): Row {
  return {
    id: "d1",
    user_id: "u1",
    name: "My Template",
    description: "",
    slides: [] as unknown as Json,
    loops: [] as unknown as Json,
    audience: "",
    tone: "",
    created_at: "2026-08-01T00:00:00Z",
    updated_at: "2026-08-01T00:00:00Z",
    ...overrides,
  };
}

describe("mapDeckTemplate round-trip", () => {
  it("maps slides and loops from jsonb", () => {
    const slides = [
      { id: "s1", role: "title", title: "Welcome", notes: "", includeCode: false, codeLanguage: "", maxBullets: 0, loopGroupId: null },
      { id: "s2", role: "concept", title: "", notes: "Explain the concept", includeCode: false, codeLanguage: "", maxBullets: 0, loopGroupId: null },
    ];
    const loops = [
      { id: "loop1", label: "Concepts", source: "runtime", items: [], runtimeLabel: "Concepts" },
    ];

    const template = mapDeckTemplate(
      row({
        slides: slides as unknown as Json,
        loops: loops as unknown as Json,
      })
    );

    expect(template.slides).toEqual(slides);
    expect(template.loops).toEqual(loops);
    expect(template.createdAt).toBe("2026-08-01T00:00:00Z");
  });

  it("defensively converts non-array slides to empty array", () => {
    const template = mapDeckTemplate(row({ slides: "not-an-array" as unknown as Json }));
    expect(template.slides).toEqual([]);
  });

  it("defensively converts non-array loops to empty array", () => {
    const template = mapDeckTemplate(row({ loops: { broken: true } as unknown as Json }));
    expect(template.loops).toEqual([]);
  });

  it("defaults null/undefined string fields to empty string", () => {
    const template = mapDeckTemplate(
      row({
        description: null as unknown as string,
        audience: undefined as unknown as string,
        tone: null as unknown as string,
      })
    );

    expect(template.description).toBe("");
    expect(template.audience).toBe("");
    expect(template.tone).toBe("");
  });
});
