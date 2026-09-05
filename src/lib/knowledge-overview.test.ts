// Every function under test here takes an injected SupabaseClient<Database>
// (Pattern B - see knowledge-overview.ts's own header comment), so there is
// no internal Supabase import to intercept with vi.mock. Instead a small
// in-memory fake client is built below and passed in directly - the same
// dependency-injection approach fakeSupabase() uses in
// src/lib/deck-templates.test.ts, and the same real-filtering-over-an-array
// shape src/lib/supabase/generated-artifacts.test.ts's makeFakeClient() uses
// (rather than the canned-response recorder some other test files use),
// because appendScopeQuestion's prune needs a real ORDER BY created_at desc
// and a real slice past the cap to exercise honestly.
//
// The fake computes scope_key itself, independently of scopeKeyFor, using a
// hardcoded copy of the nil-uuid literal (NIL_UUID below) rather than
// importing INSTITUTION_ROOT_SCOPE_KEY from the module under test - so a
// regression that changed the exported constant's value would not silently
// "fix itself" in the fake and hide the break.
import { describe, it, expect, vi } from "vitest";
import {
  INSTITUTION_ROOT_SCOPE_KEY,
  scopeKeyFor,
  mapScopeSummary,
  mapScopeQuestion,
  listScopeSummaries,
  getScopeSummary,
  upsertScopeSummary,
  listScopeQuestions,
  appendScopeQuestion,
  deleteScopeQuestion,
  clearScopeQuestions,
  MAX_SCOPE_QA_ENTRIES,
  MAX_SUMMARY_CHARS,
  MAX_QUESTION_CHARS,
  MAX_ANSWER_CHARS,
  type SummarySourcePage,
  type AnswerCitation,
} from "./knowledge-overview";
import type { Database, Json } from "./supabase/types";
import type { SupabaseClient } from "@supabase/supabase-js";

type SummaryRow = Database["public"]["Tables"]["institution_knowledge_summaries"]["Row"];
type QuestionRow = Database["public"]["Tables"]["institution_knowledge_questions"]["Row"];

// Independent of the module's own INSTITUTION_ROOT_SCOPE_KEY - see this
// file's header comment for why.
const NIL_UUID = "00000000-0000-0000-0000-000000000000";

function summaryRow(overrides: Partial<SummaryRow> = {}): SummaryRow {
  return {
    id: "summary-1",
    user_id: "user-1",
    institution: "MCC",
    scope_page_id: null,
    scope_key: NIL_UUID,
    summary: "Attendance policy summary.",
    source_pages: [] as unknown as Json,
    model: "gemini-3.1-flash-lite",
    generated_at: "2026-01-01T00:00:00.000Z",
    created_at: "2026-01-01T00:00:00.000Z",
    updated_at: "2026-01-01T00:00:00.000Z",
    ...overrides,
  };
}

function questionRow(overrides: Partial<QuestionRow> = {}): QuestionRow {
  return {
    id: "question-1",
    user_id: "user-1",
    institution: "MCC",
    scope_page_id: null,
    scope_key: NIL_UUID,
    question: "How much PTO do I get?",
    answer: "Per the handbook, full-time staff accrue 10 days per year.",
    citations: [] as unknown as Json,
    source_pages: [] as unknown as Json,
    grounded: true,
    model: "gemini-3.1-flash-lite",
    created_at: "2026-01-01T00:00:00.000Z",
    ...overrides,
  };
}

/**
 * Minimal in-memory stand-in for the two tables this module reads and
 * writes, with REAL filtering, ordering, limiting, upsert-conflict matching
 * and delete - not a canned-response recorder - because appendScopeQuestion's
 * prune has to be driven through an honest ORDER BY + slice to prove it
 * drops the OLDEST rows, not just however many happen to come back first.
 *
 * scope_key is computed by the fake itself (mirroring the migration's
 * generated column) on every insert/upsert, and is NEVER read from the
 * caller's payload - the production module's Insert type has no scope_key
 * field at all (X11), so there would be nothing to read even if this fake
 * tried to.
 */
function makeFakeClient(initial: { summaries?: SummaryRow[]; questions?: QuestionRow[] } = {}) {
  let summaries: SummaryRow[] = [...(initial.summaries ?? [])];
  let questions: QuestionRow[] = [...(initial.questions ?? [])];
  let serial = 0;

  const upsertCalls: { table: string; row: Record<string, unknown>; options: { onConflict: string } }[] = [];
  const insertCalls: { table: string; row: Record<string, unknown> }[] = [];

  function nextId(prefix: string): string {
    serial += 1;
    return `${prefix}-${serial}`;
  }

  function deriveScopeKey(row: Record<string, unknown>): string {
    const scopePageId = row.scope_page_id as string | null | undefined;
    return scopePageId ?? NIL_UUID;
  }

  function tableStore(table: string): { getAll: () => Record<string, unknown>[]; setAll: (rows: Record<string, unknown>[]) => void } {
    if (table === "institution_knowledge_summaries") {
      return {
        getAll: () => summaries as unknown as Record<string, unknown>[],
        setAll: (rows) => {
          summaries = rows as unknown as SummaryRow[];
        },
      };
    }
    if (table === "institution_knowledge_questions") {
      return {
        getAll: () => questions as unknown as Record<string, unknown>[],
        setAll: (rows) => {
          questions = rows as unknown as QuestionRow[];
        },
      };
    }
    throw new Error(`fake client asked for unexpected table: ${table}`);
  }

  interface SelectSpec {
    filters: Array<[string, unknown]>;
    order?: { col: string; ascending: boolean };
    limitN?: number;
  }

  function applySpec(rows: Record<string, unknown>[], spec: SelectSpec): Record<string, unknown>[] {
    let result = rows.filter((row) => spec.filters.every(([col, val]) => row[col] === val));
    if (spec.order) {
      const { col, ascending } = spec.order;
      result = [...result].sort((a, b) => {
        const av = String(a[col]);
        const bv = String(b[col]);
        if (av === bv) return 0;
        return ascending ? (av < bv ? -1 : 1) : av < bv ? 1 : -1;
      });
    }
    if (spec.limitN !== undefined) result = result.slice(0, spec.limitN);
    return result;
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  function selectChain(getAll: () => Record<string, unknown>[], spec: SelectSpec): any {
    return {
      eq(col: string, val: unknown) {
        return selectChain(getAll, { ...spec, filters: [...spec.filters, [col, val]] });
      },
      order(col: string, options: { ascending?: boolean } = {}) {
        return selectChain(getAll, { ...spec, order: { col, ascending: options.ascending !== false } });
      },
      limit(n: number) {
        return selectChain(getAll, { ...spec, limitN: n });
      },
      maybeSingle() {
        const rows = applySpec(getAll(), spec);
        return Promise.resolve({ data: rows[0] ?? null, error: null });
      },
      single() {
        const rows = applySpec(getAll(), spec);
        return Promise.resolve({ data: rows[0] ?? null, error: null });
      },
      then(onFulfilled: (value: { data: unknown; error: null }) => unknown, onRejected?: (reason: unknown) => unknown) {
        return Promise.resolve({ data: applySpec(getAll(), spec), error: null }).then(onFulfilled, onRejected);
      },
    };
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  function countChain(getAll: () => Record<string, unknown>[], filters: Array<[string, unknown]>): any {
    return {
      eq(col: string, val: unknown) {
        return countChain(getAll, [...filters, [col, val]]);
      },
      then(onFulfilled: (value: { count: number; error: null }) => unknown, onRejected?: (reason: unknown) => unknown) {
        const count = getAll().filter((row) => filters.every(([col, val]) => row[col] === val)).length;
        return Promise.resolve({ count, error: null }).then(onFulfilled, onRejected);
      },
    };
  }

  type DeleteFilter = { type: "eq"; col: string; val: unknown } | { type: "in"; col: string; values: unknown[] };

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  function deleteChain(table: string, filters: DeleteFilter[]): any {
    const store = tableStore(table);
    return {
      eq(col: string, val: unknown) {
        return deleteChain(table, [...filters, { type: "eq", col, val }]);
      },
      in(col: string, values: unknown[]) {
        return deleteChain(table, [...filters, { type: "in", col, values }]);
      },
      then(onFulfilled: (value: { error: null }) => unknown, onRejected?: (reason: unknown) => unknown) {
        const matches = (row: Record<string, unknown>) =>
          filters.every((f) => (f.type === "eq" ? row[f.col] === f.val : f.values.includes(row[f.col])));
        store.setAll(store.getAll().filter((row) => !matches(row)));
        return Promise.resolve({ error: null }).then(onFulfilled, onRejected);
      },
    };
  }

  const from = vi.fn((table: string) => {
    const store = tableStore(table);
    return {
      select(_columns?: string, opts?: { count?: string; head?: boolean }) {
        if (opts?.head) return countChain(store.getAll, []);
        return selectChain(store.getAll, { filters: [] });
      },
      insert(row: Record<string, unknown>) {
        insertCalls.push({ table, row });
        return {
          select() {
            return {
              single() {
                const now = new Date().toISOString();
                const saved: Record<string, unknown> = {
                  id: nextId("row"),
                  created_at: now,
                  ...row,
                  scope_key: deriveScopeKey(row),
                };
                store.setAll([...store.getAll(), saved]);
                return Promise.resolve({ data: saved, error: null });
              },
            };
          },
        };
      },
      upsert(row: Record<string, unknown>, options: { onConflict: string }) {
        upsertCalls.push({ table, row, options });
        return {
          select() {
            return {
              single() {
                const conflictCols = options.onConflict.split(",");
                const scopeKey = deriveScopeKey(row);
                const candidate: Record<string, unknown> = { ...row, scope_key: scopeKey };
                const rows = store.getAll();
                const existingIndex = rows.findIndex((existing) =>
                  conflictCols.every((col) => existing[col] === candidate[col])
                );
                const now = new Date().toISOString();
                let saved: Record<string, unknown>;
                if (existingIndex >= 0) {
                  saved = { ...rows[existingIndex], ...row, scope_key: scopeKey };
                  const next = [...rows];
                  next[existingIndex] = saved;
                  store.setAll(next);
                } else {
                  saved = {
                    id: nextId("row"),
                    created_at: now,
                    ...row,
                    scope_key: scopeKey,
                  };
                  store.setAll([...rows, saved]);
                }
                return Promise.resolve({ data: saved, error: null });
              },
            };
          },
        };
      },
      delete() {
        return deleteChain(table, []);
      },
    };
  });

  return {
    client: { from } as unknown as SupabaseClient<Database>,
    from,
    upsertCalls,
    insertCalls,
    getSummaries: () => summaries,
    getQuestions: () => questions,
  };
}

describe("INSTITUTION_ROOT_SCOPE_KEY and scopeKeyFor", () => {
  it("the sentinel is the exact nil uuid the migration coalesces to (frozen literal)", () => {
    expect(INSTITUTION_ROOT_SCOPE_KEY).toBe("00000000-0000-0000-0000-000000000000");
  });

  it("scopeKeyFor(null) === INSTITUTION_ROOT_SCOPE_KEY", () => {
    expect(scopeKeyFor(null)).toBe(INSTITUTION_ROOT_SCOPE_KEY);
  });

  it("scopeKeyFor(id) returns the id unchanged", () => {
    expect(scopeKeyFor("page-42")).toBe("page-42");
  });
});

describe("mapScopeSummary", () => {
  it("maps every column to its camelCase field", () => {
    const mapped = mapScopeSummary(
      summaryRow({
        source_pages: [{ id: "p1", title: "Attendance", updatedAt: "2026-01-01T00:00:00.000Z", included: true }] as unknown as Json,
      })
    );
    expect(mapped).toEqual({
      id: "summary-1",
      institution: "MCC",
      scopePageId: null,
      summary: "Attendance policy summary.",
      sourcePages: [{ id: "p1", title: "Attendance", updatedAt: "2026-01-01T00:00:00.000Z", included: true }],
      model: "gemini-3.1-flash-lite",
      generatedAt: "2026-01-01T00:00:00.000Z",
      createdAt: "2026-01-01T00:00:00.000Z",
      updatedAt: "2026-01-01T00:00:00.000Z",
    });
  });

  it("a malformed source_pages entry is DROPPED, never cast - one bad entry degrades the list by one item", () => {
    const mapped = mapScopeSummary(
      summaryRow({
        source_pages: [
          { id: "p1", title: "Attendance", updatedAt: "2026-01-01T00:00:00.000Z", included: true },
          { id: "p2", title: "Missing updatedAt", included: true },
          { id: "p3", title: 42, updatedAt: "2026-01-01T00:00:00.000Z", included: false },
          "not-an-object",
          null,
        ] as unknown as Json,
      })
    );
    expect(mapped.sourcePages).toEqual([
      { id: "p1", title: "Attendance", updatedAt: "2026-01-01T00:00:00.000Z", included: true },
    ]);
  });

  it("a non-array source_pages maps to an empty array rather than throwing", () => {
    const mapped = mapScopeSummary(summaryRow({ source_pages: { not: "an array" } as unknown as Json }));
    expect(mapped.sourcePages).toEqual([]);
  });

  it("a null model maps to a null model, not a crash", () => {
    expect(mapScopeSummary(summaryRow({ model: null })).model).toBeNull();
  });
});

describe("mapScopeQuestion", () => {
  it("maps every column to its camelCase field", () => {
    const mapped = mapScopeQuestion(
      questionRow({
        citations: [{ id: "p1", title: "Attendance" }] as unknown as Json,
        source_pages: [{ id: "p1", title: "Attendance", updatedAt: "2026-01-01T00:00:00.000Z", included: true }] as unknown as Json,
      })
    );
    expect(mapped).toEqual({
      id: "question-1",
      institution: "MCC",
      scopePageId: null,
      question: "How much PTO do I get?",
      answer: "Per the handbook, full-time staff accrue 10 days per year.",
      citations: [{ id: "p1", title: "Attendance" }],
      sourcePages: [{ id: "p1", title: "Attendance", updatedAt: "2026-01-01T00:00:00.000Z", included: true }],
      grounded: true,
      model: "gemini-3.1-flash-lite",
      createdAt: "2026-01-01T00:00:00.000Z",
    });
  });

  it("a malformed citation entry is dropped, never cast", () => {
    const mapped = mapScopeQuestion(
      questionRow({
        citations: [
          { id: "p1", title: "Attendance" },
          { id: "p2" },
          { title: "No id" },
          42,
        ] as unknown as Json,
      })
    );
    expect(mapped.citations).toEqual([{ id: "p1", title: "Attendance" }]);
  });

  it("grounded: false round-trips as false, not coerced to true", () => {
    expect(mapScopeQuestion(questionRow({ grounded: false })).grounded).toBe(false);
  });
});

describe("listScopeSummaries / getScopeSummary", () => {
  it("institution is normalized on read - a lowercase call still finds an uppercase-stored row", async () => {
    const { client } = makeFakeClient({ summaries: [summaryRow({ institution: "MCC" })] });
    const list = await listScopeSummaries(client, "user-1", "mcc");
    expect(list).toHaveLength(1);

    const single = await getScopeSummary(client, "user-1", "mcc", null);
    expect(single?.id).toBe("summary-1");
  });

  it("getScopeSummary filters on scope_key, never scope_page_id directly", async () => {
    const { client } = makeFakeClient({
      summaries: [
        summaryRow({ id: "root-summary", scope_page_id: null, scope_key: NIL_UUID }),
        summaryRow({ id: "page-summary", scope_page_id: "page-1", scope_key: "page-1" }),
      ],
    });
    expect((await getScopeSummary(client, "user-1", "MCC", null))?.id).toBe("root-summary");
    expect((await getScopeSummary(client, "user-1", "MCC", "page-1"))?.id).toBe("page-summary");
  });

  it("getScopeSummary returns null when nothing has been generated for that scope", async () => {
    const { client } = makeFakeClient();
    expect(await getScopeSummary(client, "user-1", "MCC", null)).toBeNull();
  });
});

describe("upsertScopeSummary", () => {
  const sourcePages: SummarySourcePage[] = [
    { id: "p1", title: "Attendance", updatedAt: "2026-01-01T00:00:00.000Z", included: true },
  ];

  it("upserts onConflict exactly 'user_id,institution,scope_key'", async () => {
    const { client, upsertCalls } = makeFakeClient();
    await upsertScopeSummary(client, "user-1", {
      institution: "mcc",
      scopePageId: null,
      summary: "Summary text.",
      sourcePages,
      model: "gemini-3.1-flash-lite",
      generatedAt: "2026-02-01T00:00:00.000Z",
    });
    expect(upsertCalls).toHaveLength(1);
    expect(upsertCalls[0].options).toEqual({ onConflict: "user_id,institution,scope_key" });
  });

  it("the insert/upsert payload NEVER contains scope_key - it is a generated column the app cannot write", async () => {
    const { client, upsertCalls } = makeFakeClient();
    await upsertScopeSummary(client, "user-1", {
      institution: "MCC",
      scopePageId: "page-1",
      summary: "Summary text.",
      sourcePages,
      model: null,
      generatedAt: "2026-02-01T00:00:00.000Z",
    });
    expect(Object.prototype.hasOwnProperty.call(upsertCalls[0].row, "scope_key")).toBe(false);
  });

  it("institution is normalized on write", async () => {
    const { client } = makeFakeClient();
    await upsertScopeSummary(client, "user-1", {
      institution: "mcc",
      scopePageId: null,
      summary: "Summary text.",
      sourcePages,
      model: null,
      generatedAt: "2026-02-01T00:00:00.000Z",
    });
    const saved = await getScopeSummary(client, "user-1", "MCC", null);
    expect(saved?.institution).toBe("MCC");
  });

  it("generatedAt is written verbatim from the input, never defaulted by the fake's own clock", async () => {
    const { client } = makeFakeClient();
    const saved = await upsertScopeSummary(client, "user-1", {
      institution: "MCC",
      scopePageId: null,
      summary: "Summary text.",
      sourcePages,
      model: null,
      generatedAt: "2020-05-05T05:05:05.000Z",
    });
    expect(saved.generatedAt).toBe("2020-05-05T05:05:05.000Z");
  });

  it("a regenerate for the SAME scope replaces the row rather than creating a second one", async () => {
    const { client, getSummaries } = makeFakeClient();
    await upsertScopeSummary(client, "user-1", {
      institution: "MCC",
      scopePageId: null,
      summary: "v1",
      sourcePages,
      model: null,
      generatedAt: "2026-01-01T00:00:00.000Z",
    });
    await upsertScopeSummary(client, "user-1", {
      institution: "MCC",
      scopePageId: null,
      summary: "v2",
      sourcePages,
      model: null,
      generatedAt: "2026-01-02T00:00:00.000Z",
    });
    expect(getSummaries()).toHaveLength(1);
    expect(getSummaries()[0].summary).toBe("v2");
  });

  it("a different scope_page_id does not collide with the root scope", async () => {
    const { client, getSummaries } = makeFakeClient();
    await upsertScopeSummary(client, "user-1", {
      institution: "MCC",
      scopePageId: null,
      summary: "root summary",
      sourcePages,
      model: null,
      generatedAt: "2026-01-01T00:00:00.000Z",
    });
    await upsertScopeSummary(client, "user-1", {
      institution: "MCC",
      scopePageId: "page-1",
      summary: "subtree summary",
      sourcePages,
      model: null,
      generatedAt: "2026-01-01T00:00:00.000Z",
    });
    expect(getSummaries()).toHaveLength(2);
  });

  it("a summary longer than MAX_SUMMARY_CHARS is clamped with the truncation marker", async () => {
    const { client } = makeFakeClient();
    const longSummary = "a".repeat(MAX_SUMMARY_CHARS + 50);
    const saved = await upsertScopeSummary(client, "user-1", {
      institution: "MCC",
      scopePageId: null,
      summary: longSummary,
      sourcePages,
      model: null,
      generatedAt: "2026-01-01T00:00:00.000Z",
    });
    expect(saved.summary.length).toBeLessThan(longSummary.length);
    expect(saved.summary.endsWith(" [truncated]")).toBe(true);
  });

  it("a summary exactly at MAX_SUMMARY_CHARS is left untouched", async () => {
    const { client } = makeFakeClient();
    const exact = "a".repeat(MAX_SUMMARY_CHARS);
    const saved = await upsertScopeSummary(client, "user-1", {
      institution: "MCC",
      scopePageId: null,
      summary: exact,
      sourcePages,
      model: null,
      generatedAt: "2026-01-01T00:00:00.000Z",
    });
    expect(saved.summary).toBe(exact);
  });

  it("round-trips sourcePages through the mapper unchanged", async () => {
    const { client } = makeFakeClient();
    const saved = await upsertScopeSummary(client, "user-1", {
      institution: "MCC",
      scopePageId: null,
      summary: "Summary text.",
      sourcePages,
      model: null,
      generatedAt: "2026-01-01T00:00:00.000Z",
    });
    expect(saved.sourcePages).toEqual(sourcePages);
  });
});

describe("listScopeQuestions", () => {
  it("returns newest first for the given scope", async () => {
    const { client } = makeFakeClient({
      questions: [
        questionRow({ id: "q1", created_at: "2026-01-01T00:00:00.000Z" }),
        questionRow({ id: "q3", created_at: "2026-01-03T00:00:00.000Z" }),
        questionRow({ id: "q2", created_at: "2026-01-02T00:00:00.000Z" }),
      ],
    });
    const list = await listScopeQuestions(client, "user-1", "MCC", null);
    expect(list.map((q) => q.id)).toEqual(["q3", "q2", "q1"]);
  });

  it("scopes to institution (normalized) and scope_key only", async () => {
    const { client } = makeFakeClient({
      questions: [
        questionRow({ id: "root-q", scope_page_id: null, scope_key: NIL_UUID }),
        questionRow({ id: "page-q", scope_page_id: "page-1", scope_key: "page-1" }),
        questionRow({ id: "other-institution-q", institution: "OTHER" }),
      ],
    });
    const list = await listScopeQuestions(client, "user-1", "mcc", null);
    expect(list.map((q) => q.id)).toEqual(["root-q"]);
  });

  it("defaults the limit to MAX_SCOPE_QA_ENTRIES", async () => {
    const rows = Array.from({ length: MAX_SCOPE_QA_ENTRIES + 10 }, (_, i) =>
      questionRow({ id: `q-${i}`, created_at: new Date(2026, 0, i + 1).toISOString() })
    );
    const { client } = makeFakeClient({ questions: rows });
    const list = await listScopeQuestions(client, "user-1", "MCC", null);
    expect(list).toHaveLength(MAX_SCOPE_QA_ENTRIES);
  });
});

describe("appendScopeQuestion", () => {
  const citations: AnswerCitation[] = [{ id: "p1", title: "Attendance" }];
  const sourcePages: SummarySourcePage[] = [
    { id: "p1", title: "Attendance", updatedAt: "2026-01-01T00:00:00.000Z", included: true },
  ];

  it("institution is normalized on write", async () => {
    const { client } = makeFakeClient();
    const saved = await appendScopeQuestion(client, "user-1", {
      institution: "mcc",
      scopePageId: null,
      question: "How much PTO do I get?",
      answer: "10 days per year.",
      citations,
      sourcePages,
      grounded: true,
      model: null,
    });
    expect(saved.institution).toBe("MCC");
  });

  it("a question longer than MAX_QUESTION_CHARS is clamped", async () => {
    const { client } = makeFakeClient();
    const longQuestion = "a".repeat(MAX_QUESTION_CHARS + 50);
    const saved = await appendScopeQuestion(client, "user-1", {
      institution: "MCC",
      scopePageId: null,
      question: longQuestion,
      answer: "short answer",
      citations,
      sourcePages,
      grounded: true,
      model: null,
    });
    expect(saved.question.endsWith(" [truncated]")).toBe(true);
    expect(saved.question.length).toBeLessThan(longQuestion.length);
  });

  it("an answer longer than MAX_ANSWER_CHARS is clamped", async () => {
    const { client } = makeFakeClient();
    const longAnswer = "a".repeat(MAX_ANSWER_CHARS + 50);
    const saved = await appendScopeQuestion(client, "user-1", {
      institution: "MCC",
      scopePageId: null,
      question: "short question",
      answer: longAnswer,
      citations,
      sourcePages,
      grounded: true,
      model: null,
    });
    expect(saved.answer.endsWith(" [truncated]")).toBe(true);
  });

  it("appends without pruning when under the cap", async () => {
    const { client, getQuestions } = makeFakeClient();
    await appendScopeQuestion(client, "user-1", {
      institution: "MCC",
      scopePageId: null,
      question: "Q1",
      answer: "A1",
      citations,
      sourcePages,
      grounded: true,
      model: null,
    });
    expect(getQuestions()).toHaveLength(1);
  });

  it("prunes the OLDEST rows once the scope exceeds MAX_SCOPE_QA_ENTRIES, keeping exactly the cap", async () => {
    // MAX_SCOPE_QA_ENTRIES pre-existing rows, oldest to newest, then one more
    // append should push the total to cap+1 and prune back down to the cap -
    // dropping the single oldest row, never a newest one.
    const existing = Array.from({ length: MAX_SCOPE_QA_ENTRIES }, (_, i) =>
      questionRow({
        id: `existing-${i}`,
        created_at: new Date(2026, 0, i + 1).toISOString(),
      })
    );
    const { client, getQuestions } = makeFakeClient({ questions: existing });

    await appendScopeQuestion(client, "user-1", {
      institution: "MCC",
      scopePageId: null,
      question: "the newest question",
      answer: "the newest answer",
      citations,
      sourcePages,
      grounded: true,
      model: null,
    });

    const remaining = getQuestions();
    expect(remaining).toHaveLength(MAX_SCOPE_QA_ENTRIES);
    // The very first existing row (oldest created_at) must be the one
    // pruned away; every other existing row, plus the new one, survives.
    expect(remaining.some((r) => r.id === "existing-0")).toBe(false);
    expect(remaining.some((r) => r.id === "existing-1")).toBe(true);
    expect(remaining.some((r) => r.question === "the newest question")).toBe(true);
  });

  it("a prune failure is swallowed - the saved question is still returned, and history is simply left over the cap", async () => {
    const existing = Array.from({ length: MAX_SCOPE_QA_ENTRIES + 5 }, (_, i) =>
      questionRow({ id: `existing-${i}`, created_at: new Date(2026, 0, i + 1).toISOString() })
    );
    const { client, from, getQuestions } = makeFakeClient({ questions: existing });

    // Make the delete step of the prune blow up, by having `.in` throw -
    // exercised through the real client rather than a mock, so the
    // try/catch in appendScopeQuestion is what is actually under test.
    const realFrom = from.getMockImplementation()!;
    from.mockImplementation((table: string) => {
      const real = realFrom(table);
      if (table !== "institution_knowledge_questions") return real;
      return {
        ...real,
        delete: () => {
          throw new Error("simulated prune failure");
        },
      };
    });

    const consoleError = vi.spyOn(console, "error").mockImplementation(() => {});
    const saved = await appendScopeQuestion(client, "user-1", {
      institution: "MCC",
      scopePageId: null,
      question: "one more question",
      answer: "one more answer",
      citations,
      sourcePages,
      grounded: true,
      model: null,
    });

    expect(saved.question).toBe("one more question");
    // Nothing was pruned - the insert succeeded, and the failed prune left
    // every prior row (plus the new one) in place.
    expect(getQuestions().length).toBe(MAX_SCOPE_QA_ENTRIES + 6);
    expect(consoleError).toHaveBeenCalled();
    consoleError.mockRestore();
  });

  it("asking the same question twice under the same scope is two rows, not a conflict", async () => {
    const { client, getQuestions } = makeFakeClient();
    await appendScopeQuestion(client, "user-1", {
      institution: "MCC",
      scopePageId: null,
      question: "How much PTO do I get?",
      answer: "10 days.",
      citations,
      sourcePages,
      grounded: true,
      model: null,
    });
    await appendScopeQuestion(client, "user-1", {
      institution: "MCC",
      scopePageId: null,
      question: "How much PTO do I get?",
      answer: "10 days.",
      citations,
      sourcePages,
      grounded: true,
      model: null,
    });
    expect(getQuestions()).toHaveLength(2);
  });
});

describe("deleteScopeQuestion", () => {
  it("deletes only the row matching both id and user_id", async () => {
    const { client, getQuestions } = makeFakeClient({
      questions: [questionRow({ id: "q1" }), questionRow({ id: "q2" })],
    });
    await deleteScopeQuestion(client, "user-1", "q1");
    expect(getQuestions().map((q) => q.id)).toEqual(["q2"]);
  });

  it("is owner-scoped - a matching id under a different user_id is left alone", async () => {
    const { client, getQuestions } = makeFakeClient({
      questions: [questionRow({ id: "q1", user_id: "other-user" })],
    });
    await deleteScopeQuestion(client, "user-1", "q1");
    expect(getQuestions()).toHaveLength(1);
  });
});

describe("clearScopeQuestions", () => {
  it("returns the real row count for the scope and deletes exactly those rows", async () => {
    const { client, getQuestions } = makeFakeClient({
      questions: [
        questionRow({ id: "root-1", scope_page_id: null, scope_key: NIL_UUID }),
        questionRow({ id: "root-2", scope_page_id: null, scope_key: NIL_UUID }),
        questionRow({ id: "page-1", scope_page_id: "page-1", scope_key: "page-1" }),
      ],
    });
    const count = await clearScopeQuestions(client, "user-1", "MCC", null);
    expect(count).toBe(2);
    expect(getQuestions().map((q) => q.id)).toEqual(["page-1"]);
  });

  it("institution is normalized", async () => {
    const { client } = makeFakeClient({ questions: [questionRow({ institution: "MCC" })] });
    const count = await clearScopeQuestions(client, "user-1", "mcc", null);
    expect(count).toBe(1);
  });

  it("returns 0 and deletes nothing when the scope has no history", async () => {
    const { client, from } = makeFakeClient();
    const count = await clearScopeQuestions(client, "user-1", "MCC", null);
    expect(count).toBe(0);
    // Only the count read should have happened - no delete call needed
    // (and none issued) when there is nothing to delete.
    expect(from).toHaveBeenCalledTimes(1);
  });
});
