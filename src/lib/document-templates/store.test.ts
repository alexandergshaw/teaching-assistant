import { describe, it, expect, vi, beforeEach } from "vitest";
import { readFileSync } from "node:fs";
const h = vi.hoisted(() => ({ rows: [] as Record<string, unknown>[], filters: [] as [string, unknown][], fail: false }));
vi.mock("@/lib/supabase/server", () => ({ createServiceClient: () => ({ from: () => {
  const filters: [string, unknown][] = []; let pending: Record<string, unknown> | undefined; let update: Record<string, unknown> | undefined;
  const matches = () => h.rows.filter((row) => filters.every(([key, value]) => row[key] === value));
  const query = {
    select: () => query, order: () => query,
    eq: (key: string, value: unknown) => { filters.push([key, value]); h.filters.push([key, value]); return query; },
    insert: (row: Record<string, unknown>) => { pending = { ...row, id: "11111111-1111-4111-8111-111111111111", updated_at: "now" }; return query; },
    update: (row: Record<string, unknown>) => { update = row; return query; },
    maybeSingle: async () => ({ data: matches()[0] ?? null, error: null }),
    single: async () => { if (h.fail) return { data: null, error: { message: "secret database text" } }; if (pending) h.rows.push(pending); if (update) Object.assign(matches()[0] ?? {}, update); return { data: pending ?? matches()[0], error: null }; },
    then: (resolve: (value: unknown) => void) => resolve({ data: matches(), error: h.fail ? { message: "secret" } : null }),
  }; return query;
} }) }));
import { getDocumentTemplate, listDocumentTemplates, saveDocumentTemplate } from "./store";
const source = { name: "Template", fileName: "a.docx", sourceKind: "docx" as const, sourceBase64: "original", sourceSha256: "a".repeat(64), templateBase64: "template", definition: { version: 1 as const, fields: [{ key: "course", label: "Course" }], replacements: [{ id: "p0", text: "{{course}}" }] } };
beforeEach(() => { h.rows = []; h.filters = []; h.fail = false; });
describe("tenant document template persistence", () => {
  it("saves then reconstructs entirely through persisted identity and keeps another tenant out", async () => {
    const saved = await saveDocumentTemplate("alice", source);
    expect(await listDocumentTemplates("bob")).toEqual([]);
    await expect(getDocumentTemplate("bob", saved.id)).rejects.toThrow(/unavailable/);
    const reopened = await getDocumentTemplate("alice", saved.id);
    expect(reopened.sourceBase64).toBe("original"); expect(reopened.definition).toEqual(source.definition);
    expect(h.filters).toContainEqual(["user_id", "alice"]); expect(h.filters).toContainEqual(["user_id", "bob"]);
  });
  it("updates only owner definition, refuses source replacement and leaves previous record on save failure", async () => {
    const saved = await saveDocumentTemplate("alice", source);
    const edited = { ...source, name: "Edited" };
    await expect(saveDocumentTemplate("bob", edited, saved.id)).rejects.toThrow();
    await expect(saveDocumentTemplate("alice", { ...edited, sourceBase64: "changed" }, saved.id)).rejects.toThrow(/original/);
    h.fail = true; await expect(saveDocumentTemplate("alice", edited, saved.id)).rejects.toThrow(/reviewed proposal/); h.fail = false;
    expect((await getDocumentTemplate("alice", saved.id)).name).toBe("Template");
    await saveDocumentTemplate("alice", edited, saved.id); expect((await getDocumentTemplate("alice", saved.id)).name).toBe("Edited");
  });
  it("rejects malformed IDs and fixed storage errors", async () => {
    await expect(getDocumentTemplate("alice", "foreign-sql-id")).rejects.toThrow(/unavailable/);
    h.fail = true; await expect(listDocumentTemplates("alice")).rejects.toThrow(/database setup/);
  });
  it("migration enforces RLS ownership and immutable original fields", () => {
    const sql = readFileSync("supabase/migrations/20261031000000_document_template_files.sql", "utf8");
    expect(sql).toMatch(/enable row level security/i); expect(sql.match(/auth.uid\(\)\) = user_id/g)).toHaveLength(4); expect(sql).toContain("new.source_base64 is distinct from old.source_base64"); expect(sql).toContain("new.user_id is distinct from old.user_id"); expect(sql).toMatch(/before update/);
  });
});
