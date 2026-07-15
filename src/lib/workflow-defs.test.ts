import { describe, it, expect } from "vitest";
import { mapWorkflowDef } from "./workflow-defs";
import type { Database, Json } from "./supabase/types";

type Row = Database["public"]["Tables"]["workflow_defs"]["Row"];

function row(overrides: Partial<Row> = {}): Row {
  return {
    id: "w1",
    user_id: "u1",
    name: "My Workflow",
    description: "",
    steps: [] as unknown as Json,
    scope: {} as unknown as Json,
    created_at: "2026-08-01T00:00:00Z",
    updated_at: "2026-08-01T00:00:00Z",
    ...overrides,
  };
}

describe("mapWorkflowDef scope round-trip", () => {
  it("reads a non-empty scope back (so unattended runs and reloads keep the targets)", () => {
    const def = mapWorkflowDef(row({ scope: { hubCourse: "*", institution: "MCC" } as unknown as Json }));
    expect(def.scope).toEqual({ hubCourse: "*", institution: "MCC" });
  });

  it("leaves scope undefined for an empty object", () => {
    expect(mapWorkflowDef(row({ scope: {} as unknown as Json })).scope).toBeUndefined();
  });

  it("leaves scope undefined for a non-object / array / null scope", () => {
    expect(mapWorkflowDef(row({ scope: [] as unknown as Json })).scope).toBeUndefined();
    expect(mapWorkflowDef(row({ scope: null as unknown as Json })).scope).toBeUndefined();
  });
});
