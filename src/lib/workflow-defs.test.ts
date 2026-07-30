import { describe, it, expect } from "vitest";
import { mapWorkflowDef, upsertWorkflowDef } from "./workflow-defs";
import type { Database, Json } from "./supabase/types";
import type { WorkflowDef } from "@/lib/workflows/types";
import type { SupabaseClient } from "@supabase/supabase-js";

type Row = Database["public"]["Tables"]["workflow_defs"]["Row"];

function row(overrides: Partial<Row> = {}): Row {
  return {
    id: "w1",
    user_id: "u1",
    name: "My Workflow",
    description: "",
    steps: [] as unknown as Json,
    scope: {} as unknown as Json,
    preset_overrides: null,
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

describe("mapWorkflowDef preset_overrides round-trip", () => {
  it("reads a preset override delta back", () => {
    const delta = { diverged: false, stepOverrides: { 0: { expectedType: "load", bindings: {} } } };
    const def = mapWorkflowDef(row({ preset_overrides: delta as unknown as Json }));
    expect(def.presetOverrideDelta).toEqual(delta);
  });

  it("leaves presetOverrideDelta undefined for a null column (a plain custom workflow)", () => {
    expect(mapWorkflowDef(row({ preset_overrides: null })).presetOverrideDelta).toBeUndefined();
  });

  it("leaves presetOverrideDelta undefined for a non-object / array preset_overrides", () => {
    expect(mapWorkflowDef(row({ preset_overrides: [] as unknown as Json })).presetOverrideDelta).toBeUndefined();
  });
});

describe("upsertWorkflowDef", () => {
  // Minimal fake: just enough of the Supabase query-builder chain for
  // upsertWorkflowDef's one call (.from(...).upsert(payload, opts)).
  function makeSupabase() {
    let capturedPayload: unknown = null;
    let capturedOpts: unknown = null;
    const client = {
      from: () => ({
        upsert: (payload: unknown, opts: unknown) => {
          capturedPayload = payload;
          capturedOpts = opts;
          return Promise.resolve({ error: null });
        },
      }),
    };
    return {
      client: client as unknown as SupabaseClient<Database>,
      getPayload: () => capturedPayload as Record<string, unknown>,
      getOpts: () => capturedOpts as Record<string, unknown>,
    };
  }

  it("upserts onConflict 'user_id,id' - required now that the primary key is composite (see migration 20260916000000)", async () => {
    const { client, getOpts } = makeSupabase();
    const def: WorkflowDef = { id: "w1", name: "W", description: "", steps: [] };
    await upsertWorkflowDef(client, "u1", def);
    expect(getOpts()).toEqual({ onConflict: "user_id,id" });
  });

  it("writes preset_overrides as null for a plain custom workflow (no presetOverrideDelta)", async () => {
    const { client, getPayload } = makeSupabase();
    const def: WorkflowDef = { id: "w1", name: "W", description: "", steps: [] };
    await upsertWorkflowDef(client, "u1", def);
    expect(getPayload().preset_overrides).toBeNull();
  });

  it("writes the presetOverrideDelta verbatim as preset_overrides for a preset override row", async () => {
    const { client, getPayload } = makeSupabase();
    const delta = { diverged: true };
    const def: WorkflowDef = {
      id: "course-kickoff-no-code",
      name: "Course Kickoff (no codebase)",
      description: "",
      preset: true,
      steps: [{ type: "a", bindings: {} }],
      presetOverrideDelta: delta,
    };
    await upsertWorkflowDef(client, "u1", def);
    expect(getPayload().preset_overrides).toEqual(delta);
    expect(getPayload().id).toBe("course-kickoff-no-code");
  });
});
