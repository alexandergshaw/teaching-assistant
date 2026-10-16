import { describe, it, expect, vi, beforeEach } from "vitest";
import JSZip from "jszip";
const h = vi.hoisted(() => ({ userId: "11111111-1111-4111-8111-111111111111" as string | null, status: "active", rows: [] as Record<string, unknown>[], calls: [] as [string, unknown][], fail: false }));
vi.mock("@/lib/supabase/server", () => ({
  createClient: async () => ({ auth: { getUser: async () => ({ data: { user: h.userId ? { id: h.userId, email: "person@example.com", email_confirmed_at: "now" } : null }, error: null }), mfa: { getAuthenticatorAssuranceLevel: async () => ({ data: { currentLevel: "aal1", nextLevel: "aal1" }, error: null }) } } }),
  createServiceClient: () => ({ from: () => {
    const filters: [string, unknown][] = []; let pending: Record<string, unknown> | undefined; let patch: Record<string, unknown> | undefined;
    const matches = () => h.rows.filter((row) => filters.every(([key, value]) => row[key] === value));
    const query = { select: () => query, order: () => query,
      eq: (key: string, value: unknown) => { filters.push([key, value]); h.calls.push([key, value]); return query; },
      insert: (row: Record<string, unknown>) => { h.calls.push(["insert", row]); pending = { ...row, id: "33333333-3333-4333-8333-333333333333", updated_at: "now" }; return query; },
      update: (row: Record<string, unknown>) => { patch = row; return query; },
      maybeSingle: async () => ({ data: matches()[0] ?? null, error: null }),
      single: async () => { if (h.fail) return { error: { message: "secret DB" }, data: null }; if (pending) h.rows.push(pending); if (patch) Object.assign(matches()[0] ?? {}, patch); return { data: pending ?? matches()[0], error: null }; },
      then: (resolve: (value: unknown) => void) => resolve({ data: matches(), error: null }),
    }; return query;
  } }),
}));
vi.mock("@/lib/supabase/app-users", () => ({ getAppUser: async () => ({ id: h.userId, email: "person@example.com", role: "instructor", status: h.status, displayName: null, approvedAt: "now", approvedBy: null, createdAt: "now", updatedAt: "now", statusChangedAt: null, statusChangedBy: null, roleGrantedBy: null }), appUserNeedsReconciliation: () => false, ensureAppUser: vi.fn(), ensureAppUserRowExists: vi.fn() }));
vi.mock("@/lib/llm", () => ({ callLlm: vi.fn() }));
import { callLlm } from "@/lib/llm";
import { parseOfficeParagraphs } from "@/lib/office-edit";
import { abstractDocumentTemplateAction, downloadDocumentTemplateAction, getDocumentTemplateAction, listDocumentTemplatesAction, previewDocumentTemplateAction, saveDocumentTemplateAction } from "./document-template-files";
const definition = { version: 1, fields: [{ key: "course", label: "Course" }], replacements: [{ id: "p0", text: "Course {{course}}" }] };
async function upload() {
  const z = new JSZip(); z.file("[Content_Types].xml", '<Types><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/></Types>'); z.file("word/document.xml", '<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body><w:p><w:r><w:t>Course Alpha</w:t></w:r></w:p><w:p><w:r><w:t>Keep policy</w:t></w:r></w:p></w:body></w:document>'); return { fileName: "source.docx", base64: await z.generateAsync({ type: "base64" }) };
}
beforeEach(() => { h.userId = "11111111-1111-4111-8111-111111111111"; h.status = "active"; h.rows = []; h.calls = []; h.fail = false; vi.mocked(callLlm).mockReset(); vi.mocked(callLlm).mockResolvedValue({ ok: true, text: JSON.stringify(definition) }); });
describe("authenticated document template lifecycle", () => {
  it("executes real requireUser for every endpoint before parsing/model/storage, denying anonymous and inactive accounts", async () => {
    for (const state of [{ user: null, status: "active" }, { user: "11111111-1111-4111-8111-111111111111", status: "pending" }, { user: "11111111-1111-4111-8111-111111111111", status: "suspended" }]) {
      h.userId = state.user; h.status = state.status;
      const operations = [() => listDocumentTemplatesAction(), () => getDocumentTemplateAction("bad"), () => abstractDocumentTemplateAction({ fileName: "bad", base64: "bad" }), () => saveDocumentTemplateAction("name", { fileName: "bad", base64: "bad" }, definition), () => downloadDocumentTemplateAction("bad", "original"), () => previewDocumentTemplateAction({ fileName: "bad", base64: "bad" }, definition)];
      for (const run of operations) expect(await run()).toMatchObject({ code: "document_unavailable" });
    }
    expect(callLlm).not.toHaveBeenCalled(); expect(h.calls).toEqual([]);
  });
  it("abstracts, saves, discards proposal, reopens by persisted identity, and downloads literal fill without another model call", async () => {
    const original = await upload(); const analyzed = await abstractDocumentTemplateAction(original); expect("proposal" in analyzed).toBe(true);
    if (!("proposal" in analyzed)) throw new Error("analysis failed");
    expect(analyzed.proposal.review.map((paragraph) => paragraph.templateText)).toEqual(["Course {{course}}", "Keep policy"]);
    const saved = await saveDocumentTemplateAction("Reusable", original, analyzed.proposal.definition); if (!("template" in saved)) throw new Error(JSON.stringify(saved));
    const reopened = await getDocumentTemplateAction(saved.template.id); if (!("template" in reopened)) throw new Error("persistent read missing");
    expect(reopened.template.definition.fields).toEqual([{ key: "course", label: "Course" }]);
    expect(reopened.template.review.map((paragraph) => paragraph.templateText)).toEqual(["Course {{course}}", "Keep policy"]);
    const filled = await downloadDocumentTemplateAction(reopened.template.id, "filled", { course: "$& literal" }); if (!("base64" in filled)) throw new Error(JSON.stringify(filled));
    expect((await parseOfficeParagraphs("docx", Buffer.from(filled.base64, "base64"))).map((p) => p.text)).toEqual(["Course $& literal", "Keep policy"]);
    expect(await downloadDocumentTemplateAction(saved.template.id, "original")).toEqual({ base64: original.base64, fileName: "source.docx" });
    const unfilled = await downloadDocumentTemplateAction(saved.template.id, "template"); if (!("base64" in unfilled)) throw new Error("unfilled failed"); expect((await parseOfficeParagraphs("docx", Buffer.from(unfilled.base64, "base64")))[0].text).toBe("Course {{course}}");
    expect(callLlm).toHaveBeenCalledTimes(1);
    h.userId = "22222222-2222-4222-8222-222222222222";
    expect(await getDocumentTemplateAction(saved.template.id)).toMatchObject({ code: "not_found" }); expect(await downloadDocumentTemplateAction(saved.template.id, "original")).toMatchObject({ code: "not_found" });
    expect(await saveDocumentTemplateAction("Foreign", original, definition, saved.template.id)).toMatchObject({ code: "not_found" });
  });
  it("refuses compressed archive bombs with a concrete stable error before the model or insert", async () => {
    const original = await upload(); const zip = await JSZip.loadAsync(original.base64, { base64: true }); zip.file("word/media/bomb.bin", "x".repeat(2 * 1024 * 1024));
    const result = await abstractDocumentTemplateAction({ fileName: "bomb.docx", base64: await zip.generateAsync({ type: "base64", compression: "DEFLATE" }) });
    expect(result).toMatchObject({ code: "file_complexity" }); expect(callLlm).not.toHaveBeenCalled(); expect(h.rows).toEqual([]);
  });
  it("never writes invalid proposals, hides provider/database details, and leaves proposal retryable on save failure", async () => {
    const original = await upload();
    expect(await saveDocumentTemplateAction("Bad", original, { ...definition, replacements: [{ id: "foreign", text: "{{course}}" }] })).toMatchObject({ code: "invalid_proposal" }); expect(h.rows).toEqual([]);
    vi.mocked(callLlm).mockResolvedValue({ ok: false, status: 503, body: "secret provider" }); expect(await abstractDocumentTemplateAction(original)).toMatchObject({ code: "provider_unavailable" });
    h.fail = true; const failed = await saveDocumentTemplateAction("Ready", original, definition); expect(failed).toMatchObject({ code: "save_failed" }); expect(JSON.stringify(failed)).not.toContain("secret"); expect(h.rows).toEqual([]);
    const preview = await previewDocumentTemplateAction(original, definition); expect("base64" in preview).toBe(true);
    h.fail = false; expect(await saveDocumentTemplateAction("Ready", original, definition)).toHaveProperty("template");
  });
});



describe("round-two authenticated proposal repair paths", () => {
  it("refuses malformed Word XML before model/save and XML-incompatible proposed text before persistence", async () => {
    const original = await upload(); const zip = await JSZip.loadAsync(original.base64, { base64: true });
    const main = await zip.file("word/document.xml")!.async("string"); zip.file("word/document.xml", main.replace("</w:body></w:document>", ""));
    const malformed = { ...original, base64: await zip.generateAsync({ type: "base64" }) };
    expect(await abstractDocumentTemplateAction(malformed)).toMatchObject({ code: "invalid_file" });
    expect(await saveDocumentTemplateAction("Broken", malformed, definition)).toMatchObject({ code: "invalid_file" });
    expect(callLlm).not.toHaveBeenCalled(); expect(h.rows).toEqual([]);
    const bad = { ...definition, replacements: [{ id: "p0", text: "{{course}}\u0001" }] };
    expect(await saveDocumentTemplateAction("Bad text", original, bad)).toMatchObject({ code: "invalid_proposal" });
    expect(await previewDocumentTemplateAction(original, bad)).toMatchObject({ code: "invalid_proposal" }); expect(h.rows).toEqual([]);
  });
  it("downloads unsaved edited proposal from stored original after failed update, keeps saved downloads old, then retries successfully", async () => {
    const original = await upload(); const saved = await saveDocumentTemplateAction("Reusable", original, definition); if (!("template" in saved)) throw new Error("save failed");
    const reopened = await getDocumentTemplateAction(saved.template.id); if (!("template" in reopened)) throw new Error("reopen failed");
    const edited = { ...reopened.template.definition, replacements: [{ id: "p0", text: "Edited {{course}}" }] };
    h.fail = true; expect(await saveDocumentTemplateAction("Edited", { fileName: "", base64: "" }, edited, saved.template.id)).toMatchObject({ code: "save_failed" });
    const preview = await previewDocumentTemplateAction(null, edited, saved.template.id); if (!("base64" in preview)) throw new Error(JSON.stringify(preview));
    expect((await parseOfficeParagraphs("docx", Buffer.from(preview.base64, "base64"))).map((p) => p.text)).toEqual(["Edited {{course}}", "Keep policy"]);
    const persisted = await downloadDocumentTemplateAction(saved.template.id, "template"); if (!("base64" in persisted)) throw new Error("saved download failed");
    expect((await parseOfficeParagraphs("docx", Buffer.from(persisted.base64, "base64")))[0].text).toBe("Course {{course}}");
    expect(await previewDocumentTemplateAction(null, { ...edited, replacements: [{ id: "foreign", text: "{{course}}" }] }, saved.template.id)).toMatchObject({ code: "invalid_proposal" });
    expect(await previewDocumentTemplateAction(null, { ...edited, replacements: [{ id: "p0", text: "{{course}}\u0001" }] }, saved.template.id)).toMatchObject({ code: "invalid_proposal" });
    expect(await downloadDocumentTemplateAction(saved.template.id, "filled", { course: "Alpha\u0001Beta" })).toMatchObject({ code: "invalid_values" });
    const ownId = h.userId; h.userId = "22222222-2222-4222-8222-222222222222"; expect(await previewDocumentTemplateAction(original, edited, saved.template.id)).toMatchObject({ code: "not_found" }); h.userId = ownId;
    h.fail = false; expect(await saveDocumentTemplateAction("Edited", { fileName: "", base64: "" }, edited, saved.template.id)).toHaveProperty("template");
    const retry = await getDocumentTemplateAction(saved.template.id); if (!("template" in retry)) throw new Error("retry reopen failed");
    expect(retry.template.review.map((paragraph) => paragraph.templateText)).toEqual(["Edited {{course}}", "Keep policy"]);
    expect(await downloadDocumentTemplateAction(saved.template.id, "original")).toEqual({ base64: original.base64, fileName: original.fileName }); expect(callLlm).not.toHaveBeenCalled();
  });
});
