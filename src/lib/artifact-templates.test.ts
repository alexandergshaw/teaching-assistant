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

  it("returns an empty object spec for a placeholder (undesigned) kind, ignoring whatever jsonb is stored", () => {
    const template = mapArtifactTemplate(
      row({ kind: "quiz", spec: { anything: true, goes: [1, 2, 3] } as unknown as Json })
    );
    expect(template.kind).toBe("quiz");
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
