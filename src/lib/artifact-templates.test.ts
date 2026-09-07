import { describe, it, expect } from "vitest";
import { mapArtifactTemplate, upsertArtifactTemplate, deleteArtifactTemplate } from "./artifact-templates";
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

// ============================================================================
// Cross-tenant scoping on the write paths.
//
// These two functions are called with a SERVICE-ROLE client (RLS bypassed,
// auth.uid() null) behind a guard - requireOwner - that is now an alias for
// requireUser, i.e. any active account. So the only thing separating one
// instructor's templates from another's is the filter these functions apply
// themselves, and both of them used to apply the wrong one:
//
//   - delete was `.delete().eq("id", id)` with NO owner filter, so any signed-in
//     account could delete anyone's template by supplying its id.
//   - save was `.upsert(row, { onConflict: "id" })` with a CLIENT-SUPPLIED id
//     and this caller's user_id in the row, so supplying someone else's
//     template id matched THEIR row by primary key and rewrote it - destroying
//     their template and reassigning it to the attacker in one call.
//
// Ids are not a meaningful obstacle: this repo prints uuids in the clear in run
// logs on purpose. These tests pin the filters, because nothing else does - the
// table's RLS policies are correct but are bypassed by the service-role client
// these functions are handed.
// ============================================================================

type RecordedCall = { table: string; op: string; filters: Array<[string, unknown]>; row?: unknown };

function fakeSupabase(updateMatchedRows: Array<{ id: string }>) {
  const calls: RecordedCall[] = [];

  function builder(table: string) {
    let current: RecordedCall | null = null;

    const chain = {
      update(row: unknown) {
        current = { table, op: "update", filters: [], row };
        calls.push(current);
        return chain;
      },
      insert(row: unknown) {
        current = { table, op: "insert", filters: [], row };
        calls.push(current);
        return chain;
      },
      delete() {
        current = { table, op: "delete", filters: [] };
        calls.push(current);
        return chain;
      },
      eq(column: string, value: unknown) {
        current?.filters.push([column, value]);
        return chain;
      },
      select() {
        return Promise.resolve({ data: updateMatchedRows, error: null });
      },
      // The delete and insert chains are awaited directly, with no terminal
      // .select(), so the builder itself has to be thenable.
      then(resolve: (value: { error: null }) => unknown) {
        return Promise.resolve({ error: null }).then(resolve);
      },
    };
    return chain;
  }

  return { client: { from: (table: string) => builder(table) }, calls };
}

const TEMPLATE = {
  id: "11111111-1111-4111-8111-111111111111",
  kind: "assignment" as const,
  name: "Weekly lab",
  description: "",
  spec: emptyAssignmentSpec(),
};

describe("deleteArtifactTemplate - owner scoping", () => {
  it("filters on BOTH the template id and the calling user's id", async () => {
    const { client, calls } = fakeSupabase([]);

    await deleteArtifactTemplate(client as never, "user-a", TEMPLATE.id);

    expect(calls).toHaveLength(1);
    expect(calls[0].op).toBe("delete");
    // Sorted so the assertion pins the SET of filters, not the order in which
    // the implementation happens to chain them.
    expect([...calls[0].filters].sort()).toEqual(
      [
        ["id", TEMPLATE.id],
        ["user_id", "user-a"],
      ].sort()
    );
  });

  it("never issues a delete filtered on the id alone", async () => {
    const { client, calls } = fakeSupabase([]);

    await deleteArtifactTemplate(client as never, "user-a", TEMPLATE.id);

    const columns = calls[0].filters.map(([column]) => column);
    expect(columns).toContain("user_id");
  });
});

describe("upsertArtifactTemplate - owner scoping", () => {
  it("updates only a row matching BOTH the id and the calling user, and does not insert when one matched", async () => {
    const { client, calls } = fakeSupabase([{ id: TEMPLATE.id }]);

    await upsertArtifactTemplate(client as never, "user-a", TEMPLATE);

    expect(calls.map((c) => c.op)).toEqual(["update"]);
    expect([...calls[0].filters].sort()).toEqual(
      [
        ["id", TEMPLATE.id],
        ["user_id", "user-a"],
      ].sort()
    );
  });

  it("falls through to an insert when the scoped update matched nothing", async () => {
    const { client, calls } = fakeSupabase([]);

    await upsertArtifactTemplate(client as never, "user-a", TEMPLATE);

    // The insert is what makes creating a NEW template still work. It carries
    // no ON CONFLICT clause, so if that id already belongs to someone else the
    // primary key rejects it - refusing, rather than silently taking it over,
    // is the correct outcome and is the whole reason this is not an upsert.
    expect(calls.map((c) => c.op)).toEqual(["update", "insert"]);
  });

  it("never issues an upsert - a client-supplied id must not be a conflict arbiter", async () => {
    const { client, calls } = fakeSupabase([]);

    await upsertArtifactTemplate(client as never, "user-a", TEMPLATE);

    expect(calls.map((c) => c.op)).not.toContain("upsert");
  });
});
