import { describe, it, expect, vi } from "vitest";
import { mapDeckTemplate, upsertDeckTemplate } from "./deck-templates";
import { DEFAULT_DECK_THEME } from "./decks/types";
import type { DeckTemplate } from "./decks/types";
import type { Database, Json } from "./supabase/types";
import type { SupabaseClient } from "@supabase/supabase-js";

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
    theme: DEFAULT_DECK_THEME as unknown as Json,
    created_at: "2026-08-01T00:00:00Z",
    updated_at: "2026-08-01T00:00:00Z",
    course_kind: null,
    ...overrides,
  };
}

describe("mapDeckTemplate round-trip", () => {
  it("maps slides and loops from jsonb", () => {
    const slides = [
      { id: "s1", role: "title", title: "Welcome", notes: "", includeCode: false, codeLanguage: "", maxBullets: 0, loopGroupId: null, depth: "standard" },
      { id: "s2", role: "concept", title: "", notes: "Explain the concept", includeCode: false, codeLanguage: "", maxBullets: 0, loopGroupId: null, depth: "standard" },
    ];
    const loops = [
      { id: "loop1", label: "Concepts", source: "runtime", items: [], runtimeLabel: "Concepts", breadth: "standard" },
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

  // course_kind round trip (the "deck template should default to just pull
  // from the type of class it is" fix's storage column - see
  // 20260919000000_deck_templates_course_kind.sql). Nullable, no CHECK
  // constraint - validated in app code via courseKindOrNull, never trusted
  // raw off the row, so garbage/legacy data reads as unset rather than
  // propagating.
  describe("course_kind mapping", () => {
    it("a null course_kind column maps to a null courseKind", () => {
      const template = mapDeckTemplate(row({ course_kind: null }));
      expect(template.courseKind).toBeNull();
    });

    it("a 'coding' course_kind column maps through", () => {
      const template = mapDeckTemplate(row({ course_kind: "coding" }));
      expect(template.courseKind).toBe("coding");
    });

    it("an 'applied' course_kind column maps through", () => {
      const template = mapDeckTemplate(row({ course_kind: "applied" }));
      expect(template.courseKind).toBe("applied");
    });

    it("garbage/legacy course_kind data (courseKindOrNull, not a raw cast) reads as null rather than propagating", () => {
      const template = mapDeckTemplate(row({ course_kind: "not-a-real-kind" }));
      expect(template.courseKind).toBeNull();
    });
  });
});

function deckTemplate(overrides: Partial<DeckTemplate> = {}): DeckTemplate {
  return {
    id: "d1",
    name: "My Template",
    description: "",
    audience: "",
    tone: "",
    slides: [],
    loops: [],
    theme: DEFAULT_DECK_THEME,
    ...overrides,
  };
}

// Builds a minimal fake SupabaseClient whose .from("deck_templates").upsert()
// is a spy, so the wire-up (AC5 of the deck-templates.ts change) is
// unit-testable without a live Supabase connection.
function fakeSupabase() {
  const upsert = vi.fn().mockResolvedValue({ error: null });
  const from = vi.fn(() => ({ upsert }));
  return { client: { from } as unknown as SupabaseClient<Database>, upsert };
}

describe("upsertDeckTemplate: course_kind is wired into the write payload", () => {
  it("writes an explicit courseKind through to course_kind", async () => {
    const { client, upsert } = fakeSupabase();
    await upsertDeckTemplate(client, "u1", deckTemplate({ courseKind: "coding" }));
    expect(upsert).toHaveBeenCalledTimes(1);
    const payload = upsert.mock.calls[0][0];
    expect(payload.course_kind).toBe("coding");
  });

  it("an absent (undefined) courseKind writes course_kind: null, never dropping the key", async () => {
    const { client, upsert } = fakeSupabase();
    await upsertDeckTemplate(client, "u1", deckTemplate());
    const payload = upsert.mock.calls[0][0];
    expect(payload.course_kind).toBeNull();
  });
});
