import { describe, it, expect } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import {
  mapCourseIntelAnswer,
  listCourseIntelAnswers,
  exportCourseIntelAnswers,
  appendCourseIntelAnswer,
  deleteCourseIntelAnswer,
  clearCourseIntelAnswers,
  type CourseIntelAnswerRawRow,
} from "./history";
import type { Database, Json } from "../supabase/types";

// CourseIntelAnswerRawRow (not the shared, hand-maintained
// Database["public"]["Tables"]["course_intel_answers"]["Row"]) is the real
// row shape after
// supabase/migrations/20261019000000_course_intel_answers_cross_course.sql -
// see history.ts's own header for why the shared type still describes the
// old, single-course-only schema and is not edited here.
type Row = CourseIntelAnswerRawRow;

function row(overrides: Partial<Row> = {}): Row {
  return {
    id: "a1",
    user_id: "u1",
    course_id: "c1",
    course_ids: [],
    scope_student: "",
    question: "Who is at risk?",
    answer_markdown: "S1 is missing 3 of 7 assignments.",
    cited_students: [{ index: 1, userId: 5001, identitySource: "lms-roster" }] as unknown as Json,
    omissions: [{ kind: "topic-over-cap", detail: "3 topics skipped" }] as unknown as Json,
    tier: "signals",
    assembled_at: "2026-09-01T00:00:00Z",
    created_at: "2026-09-01T00:05:00Z",
    ...overrides,
  };
}

/** A cross-course row: course_id null, course_ids the covered set. */
function crossCourseRow(overrides: Partial<Row> = {}): Row {
  return row({ course_id: null, course_ids: ["c1", "c2", "c3"], ...overrides });
}

// ============================================================================
// Mapper
// ============================================================================

describe("mapCourseIntelAnswer", () => {
  it("maps a full row including populated jsonb", () => {
    const entry = mapCourseIntelAnswer(row());

    expect(entry.id).toBe("a1");
    expect(entry.courseId).toBe("c1");
    expect(entry.courseIds).toEqual([]);
    expect(entry.scopeStudent).toBe("");
    expect(entry.question).toBe("Who is at risk?");
    expect(entry.answerMarkdown).toBe("S1 is missing 3 of 7 assignments.");
    expect(entry.citedStudents).toEqual([{ index: 1, userId: 5001, identitySource: "lms-roster" }]);
    expect(entry.omissions).toEqual([{ kind: "topic-over-cap", detail: "3 topics skipped" }]);
    expect(entry.tier).toBe("signals");
    expect(entry.assembledAt).toBe("2026-09-01T00:00:00Z");
    expect(entry.createdAt).toBe("2026-09-01T00:05:00Z");
  });

  it("maps empty jsonb arrays to empty arrays, not undefined or a throw", () => {
    const entry = mapCourseIntelAnswer(
      row({ cited_students: [] as unknown as Json, omissions: [] as unknown as Json })
    );

    expect(entry.citedStudents).toEqual([]);
    expect(entry.omissions).toEqual([]);
  });

  it("maps a cross-course row: courseId null, courseIds the full covered set", () => {
    const entry = mapCourseIntelAnswer(crossCourseRow());

    expect(entry.courseId).toBeNull();
    expect(entry.courseIds).toEqual(["c1", "c2", "c3"]);
  });

  it("drops a non-string entry from course_ids instead of throwing", () => {
    const entry = mapCourseIntelAnswer(
      row({ course_ids: ["c1", 42, null, "c2"] as unknown as string[] })
    );

    expect(entry.courseIds).toEqual(["c1", "c2"]);
  });

  it("does not throw when course_ids is not an array", () => {
    const entry = mapCourseIntelAnswer(row({ course_ids: null as unknown as string[] }));
    expect(entry.courseIds).toEqual([]);
  });

  it("carries a non-blank scope_student through as scopeStudent", () => {
    const entry = mapCourseIntelAnswer(row({ scope_student: "5001" }));
    expect(entry.scopeStudent).toBe("5001");
  });

  it("drops a malformed cited_students entry instead of throwing", () => {
    const malformed = [
      { index: 1, userId: 5001, identitySource: "lms-roster" },
      { index: "not-a-number", userId: 5002 },
      { userId: 5003 },
      "not-an-object",
      null,
    ] as unknown as Json;

    expect(() => mapCourseIntelAnswer(row({ cited_students: malformed }))).not.toThrow();
    const entry = mapCourseIntelAnswer(row({ cited_students: malformed }));
    expect(entry.citedStudents).toEqual([{ index: 1, userId: 5001, identitySource: "lms-roster" }]);
  });

  it("drops a malformed omissions entry instead of throwing, and keeps optional fields", () => {
    const withOptional = [
      { kind: "topic-failed", detail: "network error", count: 2, studentIndex: 3 },
      { kind: "off-roster-participant" }, // missing detail -> dropped
      { detail: "no kind" }, // missing kind -> dropped
    ] as unknown as Json;

    const entry = mapCourseIntelAnswer(row({ omissions: withOptional }));
    expect(entry.omissions).toEqual([
      { kind: "topic-failed", detail: "network error", count: 2, studentIndex: 3 },
    ]);
  });

  it("does not throw on a non-array jsonb value", () => {
    const entry = mapCourseIntelAnswer(
      row({ cited_students: "not-an-array" as unknown as Json, omissions: null as unknown as Json })
    );
    expect(entry.citedStudents).toEqual([]);
    expect(entry.omissions).toEqual([]);
  });
});

// ============================================================================
// Fake Supabase client - records every chained call so a test can assert on
// the exact filters a function applied, without a live database. Mirrors
// the fake built in src/lib/artifact-templates.test.ts, generalized to
// record ANY method call (not just a fixed op label) so it can serve list,
// insert, delete and count-then-delete call shapes with the same builder.
//
// Deliberately has NO `.upsert()` method: if an implementation ever called
// it, the chain would throw "is not a function" rather than silently
// recording a call that looks like everything else - so "never upserts" is
// enforced by the fake's own shape, not only by an assertion on the log.
//
// `resolveValues` supplies one resolution per `.from(...)` call, in order -
// most write functions here issue exactly one, clearCourseIntelAnswers (a
// count read, then a delete) issues two, and so do listCourseIntelAnswers /
// exportCourseIntelAnswers since
// supabase/migrations/20261019000000_course_intel_answers_cross_course.sql
// (the own-course query, then the cross-course `.contains()` query).
// ============================================================================

type RecordedOp = { method: string; args: unknown[] };
type RecordedCall = { table: string; ops: RecordedOp[] };

function fakeSupabase(resolveValues: unknown[]) {
  const calls: RecordedCall[] = [];
  let fromCallIndex = 0;

  function from(table: string) {
    const idx = fromCallIndex++;
    const resolveValue = resolveValues[idx] ?? { data: null, error: null };
    const record: RecordedCall = { table, ops: [] };
    calls.push(record);

    const chainable = ["insert", "select", "delete", "eq", "order", "contains"] as const;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const chain: any = {};
    for (const method of chainable) {
      chain[method] = (...args: unknown[]) => {
        record.ops.push({ method, args });
        return chain;
      };
    }
    chain.single = () => Promise.resolve(resolveValue);
    chain.maybeSingle = () => Promise.resolve(resolveValue);
    chain.then = (resolve: (value: unknown) => unknown, reject?: (err: unknown) => unknown) =>
      Promise.resolve(resolveValue).then(resolve, reject);

    return chain;
  }

  return { client: { from } as unknown as SupabaseClient<Database>, calls };
}

function eqFilters(call: RecordedCall): Array<[string, unknown]> {
  return call.ops.filter((op) => op.method === "eq").map((op) => op.args as [string, unknown]);
}

function opNames(call: RecordedCall): string[] {
  return call.ops.map((op) => op.method);
}

const SAVED_ROW = row({ id: "new-id" });

// ============================================================================
// Tenant boundary: every read, write and delete filters on user_id. This is
// the ONLY thing separating one instructor's answers from another's, since
// the caller always holds a service-role client (RLS bypassed, auth.uid()
// null) - see history.ts's own header. One test per function, as the
// assignment requires; each was run against a deliberately sabotaged
// implementation (the user_id filter removed) to confirm it goes red - see
// the report for the exact results.
// ============================================================================

// A cross-course row that named course-1 among several others - the row a
// per-course listing must NOT silently drop (D24e).
const CROSS_COURSE_SAVED_ROW = crossCourseRow({
  id: "cross-1",
  course_ids: ["course-1", "course-9"],
  created_at: "2026-09-02T00:00:00Z",
});

describe("listCourseIntelAnswers - tenant boundary and cross-course inclusion", () => {
  it("issues two queries, both filtered on user_id - one on course_id, one on course_ids", async () => {
    const { client, calls } = fakeSupabase([
      { data: [SAVED_ROW], error: null },
      { data: [], error: null },
    ]);

    await listCourseIntelAnswers(client, "user-a", "course-1");

    expect(calls).toHaveLength(2);
    expect(eqFilters(calls[0])).toEqual(
      expect.arrayContaining([
        ["user_id", "user-a"],
        ["course_id", "course-1"],
      ])
    );
    // The tenant filter on the SECOND (cross-course) query - the one a
    // sabotage that removes only this .eq() call would otherwise leave
    // undetected if only the first query were ever checked.
    expect(eqFilters(calls[1])).toEqual(expect.arrayContaining([["user_id", "user-a"]]));
    const containsOp = calls[1].ops.find((op) => op.method === "contains");
    expect(containsOp?.args).toEqual(["course_ids", ["course-1"]]);
  });

  it("orders both queries by created_at descending (newest first)", async () => {
    const { client, calls } = fakeSupabase([
      { data: [], error: null },
      { data: [], error: null },
    ]);

    await listCourseIntelAnswers(client, "user-a", "course-1");

    for (const call of calls) {
      const orderOp = call.ops.find((op) => op.method === "order");
      expect(orderOp?.args).toEqual(["created_at", { ascending: false }]);
    }
  });

  it("returns a single-course row AND a cross-course row that covered it, merged and sorted newest first", async () => {
    const { client } = fakeSupabase([
      { data: [SAVED_ROW], error: null },
      { data: [CROSS_COURSE_SAVED_ROW], error: null },
    ]);

    const entries = await listCourseIntelAnswers(client, "user-a", "course-1");

    expect(entries.map((entry) => entry.id)).toEqual(["cross-1", "new-id"]);
    const crossEntry = entries.find((entry) => entry.id === "cross-1");
    expect(crossEntry?.courseId).toBeNull();
    expect(crossEntry?.courseIds).toEqual(["course-1", "course-9"]);
  });

  it("does not drop a cross-course row just because the own-course query found nothing", async () => {
    const { client } = fakeSupabase([
      { data: [], error: null },
      { data: [CROSS_COURSE_SAVED_ROW], error: null },
    ]);

    const entries = await listCourseIntelAnswers(client, "user-a", "course-1");

    expect(entries.map((entry) => entry.id)).toEqual(["cross-1"]);
  });
});

describe("exportCourseIntelAnswers - tenant boundary and cross-course inclusion", () => {
  it("issues two queries, both filtered on user_id - one on course_id, one on course_ids", async () => {
    const { client, calls } = fakeSupabase([
      { data: [SAVED_ROW], error: null },
      { data: [], error: null },
    ]);

    await exportCourseIntelAnswers(client, "user-a", "course-1");

    expect(calls).toHaveLength(2);
    expect(eqFilters(calls[0])).toEqual(
      expect.arrayContaining([
        ["user_id", "user-a"],
        ["course_id", "course-1"],
      ])
    );
    expect(eqFilters(calls[1])).toEqual(expect.arrayContaining([["user_id", "user-a"]]));
    const containsOp = calls[1].ops.find((op) => op.method === "contains");
    expect(containsOp?.args).toEqual(["course_ids", ["course-1"]]);
  });

  it("orders both queries by created_at ascending (chronological, for a full export)", async () => {
    const { client, calls } = fakeSupabase([
      { data: [], error: null },
      { data: [], error: null },
    ]);

    await exportCourseIntelAnswers(client, "user-a", "course-1");

    for (const call of calls) {
      const orderOp = call.ops.find((op) => op.method === "order");
      expect(orderOp?.args).toEqual(["created_at", { ascending: true }]);
    }
  });

  it("returns a single-course row AND a cross-course row that covered it, merged and sorted oldest first", async () => {
    const { client } = fakeSupabase([
      { data: [SAVED_ROW], error: null },
      { data: [CROSS_COURSE_SAVED_ROW], error: null },
    ]);

    const entries = await exportCourseIntelAnswers(client, "user-a", "course-1");

    expect(entries.map((entry) => entry.id)).toEqual(["new-id", "cross-1"]);
  });
});

describe("appendCourseIntelAnswer - tenant boundary and no upsert", () => {
  const INPUT = {
    courseId: "course-1",
    question: "How is S1 doing?",
    answerMarkdown: "S1 is on track.",
    citedStudents: [{ index: 1, userId: 5001, identitySource: "lms-roster" as const }],
    omissions: [],
    tier: "signals" as const,
    assembledAt: "2026-09-01T00:00:00Z",
  };

  it("inserts the row with user_id taken from the caller's own identity, never from input", async () => {
    const { client, calls } = fakeSupabase([{ data: SAVED_ROW, error: null }]);

    await appendCourseIntelAnswer(client, "user-a", INPUT);

    const insertOp = calls[0].ops.find((op) => op.method === "insert");
    expect((insertOp?.args[0] as { user_id: string }).user_id).toBe("user-a");
  });

  it("defaults scope_student to the whole-course sentinel when not given", async () => {
    const { client, calls } = fakeSupabase([{ data: SAVED_ROW, error: null }]);

    await appendCourseIntelAnswer(client, "user-a", INPUT);

    const insertOp = calls[0].ops.find((op) => op.method === "insert");
    expect((insertOp?.args[0] as { scope_student: string }).scope_student).toBe("");
  });

  it("carries an explicit scopeStudent through to the insert row", async () => {
    const { client, calls } = fakeSupabase([{ data: SAVED_ROW, error: null }]);

    await appendCourseIntelAnswer(client, "user-a", { ...INPUT, scopeStudent: "5001" });

    const insertOp = calls[0].ops.find((op) => op.method === "insert");
    expect((insertOp?.args[0] as { scope_student: string }).scope_student).toBe("5001");
  });

  it("never issues an upsert - a plain insert only", async () => {
    const { client, calls } = fakeSupabase([{ data: SAVED_ROW, error: null }]);

    await appendCourseIntelAnswer(client, "user-a", INPUT);

    expect(opNames(calls[0])).not.toContain("upsert");
    expect(opNames(calls[0])).toContain("insert");
  });

  it("a single-course answer inserts with course_id set and course_ids empty - unaffected by the cross-course path", async () => {
    const { client, calls } = fakeSupabase([{ data: SAVED_ROW, error: null }]);

    await appendCourseIntelAnswer(client, "user-a", INPUT);

    const insertOp = calls[0].ops.find((op) => op.method === "insert");
    const insertedRow = insertOp?.args[0] as { course_id: string | null; course_ids: string[] };
    expect(insertedRow.course_id).toBe("course-1");
    expect(insertedRow.course_ids).toEqual([]);
  });

  describe("cross-course answers", () => {
    const CROSS_INPUT = {
      courseIds: ["course-1", "course-2", "course-3"],
      question: "Which of my courses has the least late work?",
      answerMarkdown: "Of the three courses I could read, C2 has the least.",
      citedStudents: [],
      omissions: [],
      tier: "signals" as const,
      assembledAt: "2026-09-01T00:00:00Z",
    };

    it("inserts with course_id null and course_ids set to the full covered set", async () => {
      const { client, calls } = fakeSupabase([{ data: crossCourseRow({ id: "cross-2" }), error: null }]);

      await appendCourseIntelAnswer(client, "user-a", CROSS_INPUT);

      const insertOp = calls[0].ops.find((op) => op.method === "insert");
      const insertedRow = insertOp?.args[0] as { course_id: string | null; course_ids: string[] };
      expect(insertedRow.course_id).toBeNull();
      expect(insertedRow.course_ids).toEqual(["course-1", "course-2", "course-3"]);
    });

    it("still takes user_id from the caller's own identity, never from input", async () => {
      const { client, calls } = fakeSupabase([{ data: crossCourseRow({ id: "cross-2" }), error: null }]);

      await appendCourseIntelAnswer(client, "user-a", CROSS_INPUT);

      const insertOp = calls[0].ops.find((op) => op.method === "insert");
      expect((insertOp?.args[0] as { user_id: string }).user_id).toBe("user-a");
    });

    it("comes back with its covered-course set intact after the round trip through the mapper", async () => {
      const { client } = fakeSupabase([
        { data: crossCourseRow({ id: "cross-2", course_ids: ["course-1", "course-2", "course-3"] }), error: null },
      ]);

      const entry = await appendCourseIntelAnswer(client, "user-a", CROSS_INPUT);

      expect(entry.courseId).toBeNull();
      expect(entry.courseIds).toEqual(["course-1", "course-2", "course-3"]);
    });

    it("rejects an empty courseIds array before ever reaching the database", async () => {
      const { client, calls } = fakeSupabase([{ data: crossCourseRow(), error: null }]);

      await expect(appendCourseIntelAnswer(client, "user-a", { ...CROSS_INPUT, courseIds: [] })).rejects.toThrow(
        /at least one course id/
      );
      expect(calls).toHaveLength(0);
    });
  });
});

describe("deleteCourseIntelAnswer - tenant boundary", () => {
  it("filters on BOTH the entry id and the calling user's id", async () => {
    const { client, calls } = fakeSupabase([{ error: null }]);

    await deleteCourseIntelAnswer(client, "user-a", "entry-1");

    expect(calls).toHaveLength(1);
    expect(calls[0].ops[0].method).toBe("delete");
    expect(eqFilters(calls[0]).sort()).toEqual(
      [
        ["id", "entry-1"],
        ["user_id", "user-a"],
      ].sort()
    );
  });

  it("never issues a delete filtered on the id alone", async () => {
    const { client, calls } = fakeSupabase([{ error: null }]);

    await deleteCourseIntelAnswer(client, "user-a", "entry-1");

    const columns = eqFilters(calls[0]).map(([column]) => column);
    expect(columns).toContain("user_id");
  });
});

describe("clearCourseIntelAnswers - tenant boundary", () => {
  it("filters the count read on both user_id and course_id", async () => {
    const { client, calls } = fakeSupabase([
      { count: 2, error: null },
      { error: null },
    ]);

    await clearCourseIntelAnswers(client, "user-a", "course-1");

    expect(eqFilters(calls[0])).toEqual(
      expect.arrayContaining([
        ["user_id", "user-a"],
        ["course_id", "course-1"],
      ])
    );
  });

  it("filters the delete on both user_id and course_id", async () => {
    const { client, calls } = fakeSupabase([
      { count: 2, error: null },
      { error: null },
    ]);

    await clearCourseIntelAnswers(client, "user-a", "course-1");

    expect(calls).toHaveLength(2);
    expect(calls[1].ops[0].method).toBe("delete");
    expect(eqFilters(calls[1])).toEqual(
      expect.arrayContaining([
        ["user_id", "user-a"],
        ["course_id", "course-1"],
      ])
    );
  });

  it("returns the real row count", async () => {
    const { client } = fakeSupabase([
      { count: 7, error: null },
      { error: null },
    ]);

    const deleted = await clearCourseIntelAnswers(client, "user-a", "course-1");
    expect(deleted).toBe(7);
  });

  it("skips the delete call entirely when the count is zero", async () => {
    const { client, calls } = fakeSupabase([{ count: 0, error: null }]);

    const deleted = await clearCourseIntelAnswers(client, "user-a", "course-1");

    expect(deleted).toBe(0);
    expect(calls).toHaveLength(1);
  });
});
