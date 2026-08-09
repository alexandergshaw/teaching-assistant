// TDD contract for the per-(institution, task) instruction storage layer
// (docs/task-institution-instructions-acceptance-criteria.md, "Tests
// written BEFORE implementation" 4-6, plus the mapper). Only the slice of
// the Supabase query-builder surface this module actually calls is faked
// below - .from(table).select(...).eq(...) awaited directly
// (listTaskInstructions), .from(table).upsert(row, opts).select().single()
// (upsertTaskInstruction's write path), and
// .from(table).delete().eq(...).eq(...).eq(...) awaited directly
// (deleteTaskInstruction). This proves which CALLS this module makes and
// with what arguments, not real Postgres/RLS behavior - matching this
// repo's existing precedent of unit-testing Pattern B storage modules
// through their pure/mapper surface (course-tasks.test.ts) plus, here, a
// hand-rolled fake for the handful of business rules (AC2 item 8, AC5 items
// 24/25) that live in this module rather than in the pure resolver.
import { describe, expect, it } from "vitest";
import {
  mapTaskInstructionRow,
  listTaskInstructions,
  upsertTaskInstruction,
  deleteTaskInstruction,
} from "./task-institution-instructions";
import { TASK_INSTRUCTION_MAX_LENGTH } from "@/lib/task-institution-instructions";
import type { Database } from "./types";
import type { SupabaseClient } from "@supabase/supabase-js";

type Row = Database["public"]["Tables"]["course_task_instructions"]["Row"];
type SelectResult = { data: Row[] | null; error: { message: string } | null };
type SingleResult = { data: Row | null; error: { message: string } | null };
type DeleteResult = { error: { message: string } | null };

function makeFakeSupabase(
  opts: {
    selectResult?: SelectResult;
    upsertResult?: (row: unknown) => SingleResult;
    deleteResult?: DeleteResult;
  } = {}
) {
  const calls: {
    from: string[];
    upsertRows: Database["public"]["Tables"]["course_task_instructions"]["Insert"][];
    upsertOpts: unknown[];
    deleteEq: [string, unknown][];
  } = { from: [], upsertRows: [], upsertOpts: [], deleteEq: [] };

  const selectResult: SelectResult = opts.selectResult ?? { data: [], error: null };
  const deleteResult: DeleteResult = opts.deleteResult ?? { error: null };

  const client = {
    from(table: string) {
      calls.from.push(table);
      return {
        select: () => ({
          eq: () => Promise.resolve(selectResult),
        }),
        upsert: (row: Database["public"]["Tables"]["course_task_instructions"]["Insert"], upsertOpts: unknown) => {
          calls.upsertRows.push(row);
          calls.upsertOpts.push(upsertOpts);
          return {
            select: () => ({
              single: async (): Promise<SingleResult> =>
                opts.upsertResult
                  ? opts.upsertResult(row)
                  : {
                      data: {
                        id: "generated-id",
                        user_id: row.user_id,
                        institution: row.institution,
                        task_id: row.task_id,
                        body: row.body ?? null,
                        created_at: "2026-08-01T00:00:00Z",
                        updated_at: row.updated_at ?? "2026-08-01T00:00:00Z",
                      },
                      error: null,
                    },
            }),
          };
        },
        delete: () => ({
          eq: (col1: string, val1: unknown) => {
            calls.deleteEq.push([col1, val1]);
            return {
              eq: (col2: string, val2: unknown) => {
                calls.deleteEq.push([col2, val2]);
                return {
                  eq: (col3: string, val3: unknown) => {
                    calls.deleteEq.push([col3, val3]);
                    return Promise.resolve(deleteResult);
                  },
                };
              },
            };
          },
        }),
      };
    },
  };

  return { client: client as unknown as SupabaseClient<Database>, calls };
}

describe("mapTaskInstructionRow: storage mapper against a realistic row shape", () => {
  function row(overrides: Partial<Row> = {}): Row {
    return {
      id: "i1",
      user_id: "u1",
      institution: "MCC",
      task_id: "syllabus-uploaded",
      body: "Submit via the department Sharepoint.",
      created_at: "2026-08-01T00:00:00Z",
      updated_at: "2026-08-02T00:00:00Z",
      ...overrides,
    };
  }

  it("maps a fully-populated row across the snake_case/camelCase boundary", () => {
    expect(mapTaskInstructionRow(row())).toEqual({
      institution: "MCC",
      taskId: "syllabus-uploaded",
      body: "Submit via the department Sharepoint.",
    });
  });

  it("maps a null body to \"\" rather than null (AC3 item 13 - missing is 'no instruction')", () => {
    expect(mapTaskInstructionRow(row({ body: null })).body).toBe("");
  });

  it("trims a body that was somehow stored with surrounding whitespace", () => {
    expect(mapTaskInstructionRow(row({ body: "  padded  " })).body).toBe("padded");
  });
});

describe("listTaskInstructions", () => {
  it("maps every returned row through mapTaskInstructionRow", async () => {
    const { client } = makeFakeSupabase({
      selectResult: {
        data: [
          {
            id: "i1",
            user_id: "u1",
            institution: "MCC",
            task_id: "syllabus-uploaded",
            body: "Do the thing.",
            created_at: "2026-08-01T00:00:00Z",
            updated_at: "2026-08-01T00:00:00Z",
          },
        ],
        error: null,
      },
    });

    const result = await listTaskInstructions(client, "u1");
    expect(result).toEqual([{ institution: "MCC", taskId: "syllabus-uploaded", body: "Do the thing." }]);
  });

  it("returns an empty array when there are no rows", async () => {
    const { client } = makeFakeSupabase({ selectResult: { data: null, error: null } });
    expect(await listTaskInstructions(client, "u1")).toEqual([]);
  });

  it("throws with the Supabase error message on a read failure", async () => {
    const { client } = makeFakeSupabase({
      selectResult: { data: null, error: { message: "boom" } },
    });
    await expect(listTaskInstructions(client, "u1")).rejects.toThrow("boom");
  });
});

describe("upsertTaskInstruction: blank institution never produces a stored row (AC2 item 8, test 4)", () => {
  it("returns null without ever touching Supabase for an empty-string institution", async () => {
    const { client, calls } = makeFakeSupabase();
    const result = await upsertTaskInstruction(client, "u1", "", "syllabus-uploaded", "Some text.");
    expect(result).toBeNull();
    expect(calls.from).toHaveLength(0);
  });

  it("returns null without ever touching Supabase for a whitespace-only institution", async () => {
    const { client, calls } = makeFakeSupabase();
    const result = await upsertTaskInstruction(client, "u1", "   ", "syllabus-uploaded", "Some text.");
    expect(result).toBeNull();
    expect(calls.from).toHaveLength(0);
  });

  it("returns null without ever touching Supabase for a null institution", async () => {
    const { client, calls } = makeFakeSupabase();
    const result = await upsertTaskInstruction(client, "u1", null, "syllabus-uploaded", "Some text.");
    expect(result).toBeNull();
    expect(calls.from).toHaveLength(0);
  });
});

describe("upsertTaskInstruction: clearing to blank deletes rather than storing \"\" (AC5 item 25, test 5)", () => {
  it("deletes (never upserts) when body is an empty string", async () => {
    const { client, calls } = makeFakeSupabase();
    const result = await upsertTaskInstruction(client, "u1", "mcc", "syllabus-uploaded", "");
    expect(result).toBeNull();
    expect(calls.upsertRows).toHaveLength(0);
    expect(calls.from).toEqual(["course_task_instructions"]);
    expect(calls.deleteEq).toEqual([
      ["user_id", "u1"],
      ["institution", "MCC"],
      ["task_id", "syllabus-uploaded"],
    ]);
  });

  it("deletes (never upserts) when body is whitespace-only", async () => {
    const { client, calls } = makeFakeSupabase();
    const result = await upsertTaskInstruction(client, "u1", "mcc", "syllabus-uploaded", "   \t  ");
    expect(result).toBeNull();
    expect(calls.upsertRows).toHaveLength(0);
    expect(calls.deleteEq.length).toBe(3);
  });

  it("deletes (never upserts) when body is null/undefined", async () => {
    const { client, calls } = makeFakeSupabase();
    const result = await upsertTaskInstruction(client, "u1", "mcc", "syllabus-uploaded", null);
    expect(result).toBeNull();
    expect(calls.upsertRows).toHaveLength(0);
  });
});

describe("upsertTaskInstruction: the cap is enforced on write, not only in the input (AC5 item 24, test 6)", () => {
  it("truncates a body longer than TASK_INSTRUCTION_MAX_LENGTH before it ever reaches the upsert call", async () => {
    const { client, calls } = makeFakeSupabase();
    const longBody = "x".repeat(TASK_INSTRUCTION_MAX_LENGTH + 250);

    await upsertTaskInstruction(client, "u1", "mcc", "syllabus-uploaded", longBody);

    expect(calls.upsertRows).toHaveLength(1);
    expect(calls.upsertRows[0].body).toHaveLength(TASK_INSTRUCTION_MAX_LENGTH);
    expect(calls.upsertRows[0].body).toBe(longBody.slice(0, TASK_INSTRUCTION_MAX_LENGTH));
  });

  it("leaves a body at or under the cap unchanged (aside from trimming)", async () => {
    const { client, calls } = makeFakeSupabase();
    await upsertTaskInstruction(client, "u1", "mcc", "syllabus-uploaded", "  short instruction  ");
    expect(calls.upsertRows[0].body).toBe("short instruction");
  });
});

describe("upsertTaskInstruction: normal write path", () => {
  it("normalizes institution casing and writes onConflict user_id,institution,task_id", async () => {
    const { client, calls } = makeFakeSupabase();
    const result = await upsertTaskInstruction(client, "u1", "mcc", "syllabus-uploaded", "Submit via Sharepoint.");

    expect(calls.from).toEqual(["course_task_instructions"]);
    expect(calls.upsertRows[0]).toMatchObject({
      user_id: "u1",
      institution: "MCC",
      task_id: "syllabus-uploaded",
      body: "Submit via Sharepoint.",
    });
    expect(calls.upsertOpts[0]).toEqual({ onConflict: "user_id,institution,task_id" });
    expect(result).toEqual({ institution: "MCC", taskId: "syllabus-uploaded", body: "Submit via Sharepoint." });
  });

  it("throws with the Supabase error message on a write failure", async () => {
    const { client } = makeFakeSupabase({ upsertResult: () => ({ data: null, error: { message: "write boom" } }) });
    await expect(
      upsertTaskInstruction(client, "u1", "mcc", "syllabus-uploaded", "text")
    ).rejects.toThrow("write boom");
  });
});

describe("deleteTaskInstruction", () => {
  it("normalizes institution casing before deleting", async () => {
    const { client, calls } = makeFakeSupabase();
    await deleteTaskInstruction(client, "u1", "mcc", "syllabus-uploaded");
    expect(calls.deleteEq).toEqual([
      ["user_id", "u1"],
      ["institution", "MCC"],
      ["task_id", "syllabus-uploaded"],
    ]);
  });

  it("is a no-op for a blank institution (nothing could ever be stored under it)", async () => {
    const { client, calls } = makeFakeSupabase();
    await deleteTaskInstruction(client, "u1", "", "syllabus-uploaded");
    expect(calls.from).toHaveLength(0);
  });

  it("throws with the Supabase error message on a delete failure", async () => {
    const { client } = makeFakeSupabase({ deleteResult: { error: { message: "delete boom" } } });
    await expect(deleteTaskInstruction(client, "u1", "mcc", "syllabus-uploaded")).rejects.toThrow("delete boom");
  });
});
