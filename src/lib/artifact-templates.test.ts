import { describe, it, expect } from "vitest";
import { mapArtifactTemplate } from "./artifact-templates";
import { emptyAssignmentSpec } from "./artifact-templates/types";
import type { Database, Json } from "./supabase/types";

type Row = Database["public"]["Tables"]["artifact_templates"]["Row"];

function row(overrides: Partial<Row> = {}): Row {
  return {
    id: "t1",
    user_id: "u1",
    kind: "assignment",
    name: "My Template",
    description: "",
    spec: emptyAssignmentSpec() as unknown as Json,
    created_at: "2026-08-01T00:00:00Z",
    updated_at: "2026-08-01T00:00:00Z",
    ...overrides,
  };
}

describe("mapArtifactTemplate", () => {
  it("maps a well-formed assignment row", () => {
    const spec = { ...emptyAssignmentSpec(), goal: "Ship a feature", minutes: 90 };

    const template = mapArtifactTemplate(row({ spec: spec as unknown as Json }));

    expect(template.id).toBe("t1");
    expect(template.kind).toBe("assignment");
    expect(template.name).toBe("My Template");
    expect(template.spec).toEqual(spec);
    expect(template.createdAt).toBe("2026-08-01T00:00:00Z");
    expect(template.updatedAt).toBe("2026-08-01T00:00:00Z");
  });

  it("coerces a malformed (non-object) spec to defaults instead of throwing", () => {
    expect(() => mapArtifactTemplate(row({ spec: "not-an-object" as unknown as Json }))).not.toThrow();

    const template = mapArtifactTemplate(row({ spec: "not-an-object" as unknown as Json }));
    expect(template.spec).toEqual(emptyAssignmentSpec());
  });

  it("coerces a null spec to defaults instead of throwing", () => {
    const template = mapArtifactTemplate(row({ spec: null as unknown as Json }));
    expect(template.spec).toEqual(emptyAssignmentSpec());
  });

  it("coerces a spec with an unknown aptitude/grouping to defaults for those fields", () => {
    const template = mapArtifactTemplate(
      row({ spec: { aptitude: "expert", grouping: "trio" } as unknown as Json })
    );
    expect(template.spec).toEqual(emptyAssignmentSpec());
  });

  // Every kind now has its own coercion, so stored jsonb is coerced to that
  // kind's spec rather than discarded. An UNRECOGNIZED kind still falls
  // through to {} rather than guessing which spec it meant.
  it("coerces a quiz row through the quiz spec instead of discarding it", () => {
    const template = mapArtifactTemplate(
      row({ kind: "quiz", spec: { questionCount: 12, pointsEach: 3, kinds: ["true_false"] } as unknown as Json })
    );
    expect(template.kind).toBe("quiz");
    expect(template.spec).toEqual({ questionCount: 12, pointsEach: 3, kinds: ["true_false"] });
  });

  it("returns an empty object spec for an unrecognized kind value", () => {
    const template = mapArtifactTemplate(
      row({ kind: "not-a-kind", spec: { anything: true } as unknown as Json })
    );
    expect(template.spec).toEqual({});
  });

  it("defaults null/undefined name and description to empty string", () => {
    const template = mapArtifactTemplate(
      row({
        name: null as unknown as string,
        description: undefined as unknown as string,
      })
    );
    expect(template.name).toBe("");
    expect(template.description).toBe("");
  });
});
