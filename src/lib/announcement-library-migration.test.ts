import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const sql = fs.readFileSync(path.join(process.cwd(), "supabase/migrations/20261101000002_announcement_library_autosave.sql"), "utf8")
  .replace(/--[^\n]*/g, "").replace(/\s+/g, " ").toLowerCase();
describe("announcement library CAS SQL contract (source only, no database execution)", () => {
  it("permits only service-role execution under invoker permissions and fixed empty search path", () => {
    expect(sql).toContain("security invoker set search_path = ''");
    expect(sql).not.toContain("security definer");
    expect(sql).toContain("revoke all on function public.update_announcement_library_entry(uuid, uuid, uuid, text, text, jsonb, text, text) from public, anon, authenticated");
    expect(sql).toContain("grant execute on function public.update_announcement_library_entry(uuid, uuid, uuid, text, text, jsonb, text, text) to service_role");
  });
  it("checks owned course, locks scoped existing row, and never creates a missing edit", () => {
    expect(sql).toContain("from public.course_hub c where c.id = p_course_id and c.user_id = p_user_id");
    expect(sql).toContain("where e.id = p_id and e.user_id = p_user_id and e.course_id = p_course_id for update");
    expect(sql).toContain("if not found then return; end if");
    expect(sql).not.toMatch(/\binsert\b|\bupsert\b|\braise\b|\bexecute\s+'/);
  });
  it("acknowledges identical desired state and otherwise compares exact snapshot including null-safe label", () => {
    expect(sql).toContain("current_entry.exemplar_text = p_exemplar_text and current_entry.label is not distinct from p_label then return next current_entry; return;");
    expect(sql).toContain("current_entry.exemplar_text = p_expected_text and current_entry.label is not distinct from p_expected_label");
    expect(sql).toContain("and e.exemplar_text = p_expected_text and e.label is not distinct from p_expected_label returning e.*");
    expect(sql).toContain("octet_length(p_expected_text) > 262144");
    expect(sql).toContain("length(p_expected_label) > 1024");
  });
});
