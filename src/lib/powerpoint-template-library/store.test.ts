import { beforeEach, describe, it, expect, vi } from "vitest";
import { getLibrary, getSource, listLibraries, listLibrariesWithCompleteness, saveLibrary } from "./store";
type Row = Record<string, unknown>;
const h = vi.hoisted(() => ({
  userId: "11111111-1111-4111-8111-111111111111", status: "active", anonymous: false,
  tables: {} as Record<string, Row[]>, calls: [] as Array<{ table: string; op: string; args: unknown[] }>, failSave: false, failSourceRead: false, shortPage: false, model: vi.fn(),
}));
function fakeTable(name: string) {
  const filters: [string, unknown][] = [];
  const membership: [string, unknown[]][] = [];
  let mode = "read", pending: Row | undefined;
  let range: [number, number] | null = null;
  const record = (op: string, ...args: unknown[]) => { h.calls.push({ table: name, op, args }); };
  const matches = () => (h.tables[name] ?? []).filter(row => filters.every(([key, value]) => row[key] === value) && membership.every(([key, values]) => values.includes(row[key])));
  const execute = (single = false): { data: unknown; error: unknown; count?: number } => {
    if (name === "deck_template_files" && mode === "read" && h.failSourceRead) return { data: null, error: { message: "unavailable" } };
    if (mode !== "read" && h.failSave) return { data: null, error: { message: "private database detail" } };
    let rows = matches();
    if (mode === "insert" && pending) { h.tables[name] ??= []; h.tables[name].push(pending); rows = [pending]; pending = undefined; }
    if (mode === "update") { for (const row of rows) Object.assign(row, pending); }
    const count = rows.length;
    if (range) rows = rows.slice(range[0], range[1] + 1);
    if (name === "powerpoint_template_libraries" && range && h.shortPage) rows = rows.slice(0, 1);
    return { data: JSON.parse(JSON.stringify(single ? rows[0] ?? null : rows)), error: null, count };
  };
  const builder = {
    select: (...args: unknown[]) => { record("select", ...args); return builder; },
    eq: (key: string, value: unknown) => { record("eq", key, value); filters.push([key, value]); return builder; },
    in: (key: string, values: unknown[]) => { record("in", key, values); membership.push([key, values]); return builder; },
    order: (...args: unknown[]) => { record("order", ...args); return builder; },
    range: (start: number, end: number) => { record("range", start, end); range = [start, end]; return builder; },
    insert: (row: Row) => { record("insert", row); mode = "insert"; pending = { id: "99999999-9999-4999-8999-999999999999", ...row }; return builder; },
    update: (row: Row) => { record("update", row); mode = "update"; pending = row; return builder; },
    single: async () => execute(true),
    maybeSingle: async () => execute(true),
    then: (resolve: (result: unknown) => void) => Promise.resolve(execute()).then(resolve),
  };
  return builder;
}
vi.mock("@/lib/supabase/server", () => ({
  createServiceClient: () => ({ from: fakeTable }),
  createClient: async () => ({ auth: {
    getUser: async () => ({ data: { user: h.anonymous ? null : { id: h.userId, email: "teacher@example.test", email_confirmed_at: "2026-10-01" } }, error: null }),
    mfa: { getAuthenticatorAssuranceLevel: async () => ({ data: { currentLevel: "aal1", nextLevel: "aal1" } }) },
  } }),
}));
vi.mock("@/lib/supabase/app-users", () => ({
  getAppUser: async () => ({ id: h.userId, role: "instructor", status: h.status, display_name: "Teacher" }),
  appUserNeedsReconciliation: () => false, ensureAppUser: vi.fn(), ensureAppUserRowExists: vi.fn(),
}));
vi.mock("@/lib/supabase/owner-context", () => ({ getImpersonatedOwner: () => null }));
vi.mock("@/lib/llm", () => ({ callLlm: h.model }));

const sourceId = "22222222-2222-4222-8222-222222222222";
const definition = { version: 1 as const, slides: [{ id: "ppt/slides/slide1.xml", ordinal: 1, text: "Title", role: "title" as const }] };
beforeEach(() => {
  h.calls = []; h.failSave = false; h.failSourceRead = false; h.shortPage = false;
  h.tables = { deck_template_files: [{ id: sourceId, user_id: h.userId, content: "original", file_name: "source.pptx" }], powerpoint_template_libraries: [] };
});
describe("library storage tenant boundary", () => {
  it("pages past 1,000 records and explicitly marks the bounded result incomplete", async () => {
    h.tables.powerpoint_template_libraries = Array.from({ length: 5001 }, (_, i) => ({ id: String(i), user_id: h.userId, source_file_id: sourceId, name: `Library ${i}`, updated_at: "2026" }));
    h.tables.powerpoint_template_libraries.push({ id: "foreign", user_id: "other", source_file_id: sourceId, name: "Foreign" });
    const result = await listLibrariesWithCompleteness(h.userId);
    expect(result.libraries).toHaveLength(5000); expect(result.truncated).toBe(true);
    expect(result.libraries.some((item) => item.name === "Foreign")).toBe(false);
    expect(h.calls.filter((call) => call.table === "powerpoint_template_libraries" && call.op === "range")).toHaveLength(25);
  });
  it("returns complete results past the usual default cap", async () => {
    h.tables.powerpoint_template_libraries = Array.from({ length: 1001 }, (_, i) => ({ id: String(i), user_id: h.userId, source_file_id: sourceId, name: `Library ${i}`, updated_at: "2026" }));
    const result = await listLibrariesWithCompleteness(h.userId);
    expect(result.libraries).toHaveLength(1001); expect(result.truncated).toBe(false); expect(result.snapshotUncertain).toBe(true);
  });
  it("fails closed when the server silently returns a shorter page than its count", async () => {
    h.tables.powerpoint_template_libraries = Array.from({ length: 5 }, (_, i) => ({ id: String(i), user_id: h.userId, source_file_id: sourceId, name: `Library ${i}`, updated_at: "2026" }));
    h.shortPage = true;
    await expect(listLibrariesWithCompleteness(h.userId)).rejects.toMatchObject({ code: "PPT_STORAGE" });
  });
  it("inserts server identity, lists/reopens durable JSON and enforces owner on update", async () => {
    const created = await saveLibrary(h.userId, null, sourceId, "Library", definition);
    expect(created.definition).toEqual(definition);
    expect((await listLibraries(h.userId))[0].id).toBe(created.id);
    expect(await getLibrary(h.userId, created.id)).toEqual(created);
    expect((await getSource(h.userId, sourceId)).content).toBe("original");
    const updated = await saveLibrary(h.userId, created.id, sourceId, "Changed", definition);
    expect(updated.name).toBe("Changed");
    expect(h.calls).toContainEqual({ table: "powerpoint_template_libraries", op: "eq", args: ["user_id", h.userId] });
    expect(h.calls).toContainEqual({ table: "powerpoint_template_libraries", op: "eq", args: ["id", created.id] });
    expect(h.calls).toContainEqual({ table: "powerpoint_template_libraries", op: "eq", args: ["source_file_id", sourceId] });
  });
  it("refuses foreign source attachment and hides an orphaned library", async () => {
    h.tables.deck_template_files[0].user_id = "foreign";
    await expect(saveLibrary(h.userId, null, sourceId, "Bad", definition)).rejects.toMatchObject({ code: "PPT_NOT_FOUND" });
    h.tables.powerpoint_template_libraries = [{ id: sourceId, user_id: h.userId, source_file_id: sourceId, name: "orphan", definition, updated_at: "" }];
    expect(await listLibraries(h.userId)).toEqual([]);
    await expect(getLibrary(h.userId, sourceId)).rejects.toMatchObject({ code: "PPT_NOT_FOUND" });
  });
  it("batches source ownership checks without selecting source content and keeps duplicate library references", async () => {
    const foreignId = "33333333-3333-4333-8333-333333333333";
    h.tables.deck_template_files.push({ id: foreignId, user_id: "foreign", content: "private" });
    h.tables.powerpoint_template_libraries = [
      { id: "1", user_id: h.userId, source_file_id: sourceId, name: "First", updated_at: "3" },
      { id: "2", user_id: h.userId, source_file_id: sourceId, name: "Second", updated_at: "2" },
      { id: "3", user_id: h.userId, source_file_id: foreignId, name: "Foreign", updated_at: "1" },
    ];
    expect((await listLibraries(h.userId)).map((item) => item.name)).toEqual(["First", "Second"]);
    expect(h.calls.filter((call) => call.table === "deck_template_files" && call.op === "select")).toEqual([{ table: "deck_template_files", op: "select", args: ["id"] }]);
    expect(h.calls).toContainEqual({ table: "deck_template_files", op: "eq", args: ["user_id", h.userId] });
    expect(h.calls).toContainEqual({ table: "deck_template_files", op: "in", args: ["id", [sourceId, foreignId]] });
  });
  it("limits ownership lookups to batches and avoids the source query for an empty list", async () => {
    expect(await listLibraries(h.userId)).toEqual([]);
    expect(h.calls.some((call) => call.table === "deck_template_files")).toBe(false);
    h.calls = [];
    const ids = Array.from({ length: 101 }, (_, i) => `${(i + 1).toString(16).padStart(8, "0")}-0000-4000-8000-000000000000`);
    h.tables.deck_template_files = ids.map((id) => ({ id, user_id: h.userId }));
    h.tables.powerpoint_template_libraries = ids.map((id) => ({ id, user_id: h.userId, source_file_id: id, name: "Example", updated_at: "" }));
    expect(await listLibraries(h.userId)).toHaveLength(101);
    expect(h.calls.filter((call) => call.table === "deck_template_files" && call.op === "in").map((call) => (call.args[1] as string[]).length)).toEqual([100, 1]);
  });
  it("fails closed on a source query error and hides malformed referenced IDs", async () => {
    h.tables.powerpoint_template_libraries = [{ id: "1", user_id: h.userId, source_file_id: sourceId, name: "First", updated_at: "" }];
    h.failSourceRead = true;
    await expect(listLibraries(h.userId)).rejects.toMatchObject({ code: "PPT_STORAGE" });
    h.failSourceRead = false;
    h.tables.powerpoint_template_libraries[0].source_file_id = "bad-id";
    expect(await listLibraries(h.userId)).toEqual([]);
  });
  it("does not overwrite saved JSON when a scoped update fails", async () => {
    const created = await saveLibrary(h.userId, null, sourceId, "Before", definition);
    h.failSave = true;
    await expect(saveLibrary(h.userId, created.id, sourceId, "After", definition)).rejects.toMatchObject({ code: "PPT_STORAGE" });
    expect((await getLibrary(h.userId, created.id)).name).toBe("Before");
  });
});
