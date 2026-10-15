import { beforeEach, describe, it, expect, vi } from "vitest";
import { getLibrary, getSource, listLibraries, saveLibrary } from "./store";
type Row = Record<string, unknown>;
const h = vi.hoisted(() => ({
  userId: "11111111-1111-4111-8111-111111111111", status: "active", anonymous: false,
  tables: {} as Record<string, Row[]>, calls: [] as Array<{ table: string; op: string; args: unknown[] }>, failSave: false, model: vi.fn(),
}));
function fakeTable(name: string) {
  const filters: [string, unknown][] = [];
  let mode = "read", pending: Row | undefined;
  const record = (op: string, ...args: unknown[]) => { h.calls.push({ table: name, op, args }); };
  const matches = () => (h.tables[name] ?? []).filter(row => filters.every(([key, value]) => row[key] === value));
  const execute = (single = false): { data: unknown; error: unknown } => {
    if (mode !== "read" && h.failSave) return { data: null, error: { message: "private database detail" } };
    let rows = matches();
    if (mode === "insert" && pending) { h.tables[name] ??= []; h.tables[name].push(pending); rows = [pending]; pending = undefined; }
    if (mode === "update") { for (const row of rows) Object.assign(row, pending); }
    return { data: JSON.parse(JSON.stringify(single ? rows[0] ?? null : rows)), error: null };
  };
  const builder = {
    select: (...args: unknown[]) => { record("select", ...args); return builder; },
    eq: (key: string, value: unknown) => { record("eq", key, value); filters.push([key, value]); return builder; },
    order: (...args: unknown[]) => { record("order", ...args); return builder; },
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
  h.calls = []; h.failSave = false;
  h.tables = { deck_template_files: [{ id: sourceId, user_id: h.userId, content: "original", file_name: "source.pptx" }], powerpoint_template_libraries: [] };
});
describe("library storage tenant boundary", () => {
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
  it("does not overwrite saved JSON when a scoped update fails", async () => {
    const created = await saveLibrary(h.userId, null, sourceId, "Before", definition);
    h.failSave = true;
    await expect(saveLibrary(h.userId, created.id, sourceId, "After", definition)).rejects.toMatchObject({ code: "PPT_STORAGE" });
    expect((await getLibrary(h.userId, created.id)).name).toBe("Before");
  });
});
