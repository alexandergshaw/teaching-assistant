import { beforeEach, describe, it, expect, vi } from "vitest";
import JSZip from "jszip";
import { readFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { uploadPowerPointTemplateAction, analyzePowerPointTemplateAction, savePowerPointTemplateLibraryAction, listPowerPointTemplateLibrariesAction,
  getPowerPointTemplateLibraryAction, reusePowerPointTemplateLibraryAction, downloadPowerPointTemplateLibraryAction } from "./powerpoint-template-library";
import { fillDeckTemplateFileAction } from "./deck-template-files";
import { parseOfficeParagraphs } from "@/lib/office-edit";
import { handoffTemplate } from "@/app/components/powerpoint-templates/panel-logic";
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

async function pptFixture(texts = ["Title", "Divider", "Body", ""]): Promise<Buffer> {
  const zip = new JSZip();
  zip.file("[Content_Types].xml", '<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Override PartName="/ppt/presentation.xml" ContentType="application/vnd.openxmlformats-officedocument.presentationml.presentation.main+xml"/>' + texts.map((_, i) => '<Override PartName="/ppt/slides/slide' + (i + 1) + '.xml" ContentType="application/vnd.openxmlformats-officedocument.presentationml.slide+xml"/>').join("") + '</Types>');
  zip.file("_rels/.rels", '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="root" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="ppt/presentation.xml"/></Relationships>');
  const order = texts.map((_, i) => texts.length - i);
  zip.file("ppt/presentation.xml", '<p:presentation xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><p:sldIdLst>' + order.map(i => '<p:sldId id="' + (255 + i) + '" r:id="r' + i + '"/>').join("") + '</p:sldIdLst></p:presentation>');
  zip.file("ppt/_rels/presentation.xml.rels", '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">' + texts.map((_, i) => '<Relationship Id="r' + (i + 1) + '" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/slide" Target="slides/slide' + (i + 1) + '.xml"/>').join("") + '</Relationships>');
  texts.forEach((text, i) => zip.file('ppt/slides/slide' + (i + 1) + '.xml', '<p:sld xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main" xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main"><p:cSld><p:spTree>' + (text ? '<p:sp><p:txBody><a:p><a:r><a:t>' + text + '</a:t></a:r></a:p></p:txBody></p:sp>' : "") + '</p:spTree></p:cSld></p:sld>'));
  return zip.generateAsync({ type: "nodebuffer" });
}

const sourceId = "22222222-2222-4222-8222-222222222222";
beforeEach(async () => {
  h.userId = "11111111-1111-4111-8111-111111111111"; h.status = "active"; h.anonymous = false; h.failSave = false; h.calls = [];
  h.tables = { deck_template_files: [{ id: sourceId, user_id: h.userId, content: (await pptFixture()).toString("base64"), file_name: "source.pptx" }], powerpoint_template_libraries: [] };
  h.model.mockReset().mockImplementation(async request => ({
    ok: true, text: JSON.stringify({ slides: JSON.parse(request.contents[0].parts[0].text).map((s: { id: string; text: string }) => ({
      id: s.id, role: s.text === "Title" ? "title" : s.text === "Divider" ? "section-divider" : s.text ? "content" : "other",
    })) }),
  }));
});
async function saved() {
  const analysis = await analyzePowerPointTemplateAction(sourceId);
  if ("error" in analysis) throw analysis;
  const save = await savePowerPointTemplateLibraryAction(null, sourceId, "Example library", analysis.definition);
  if ("error" in save) throw save;
  return save.library;
}
describe("authenticated PowerPoint library flow", () => {
  it("saves, discards proposal, reopens corrected classifications, downloads original and reuses recovered identity", async () => {
    const original = h.tables.deck_template_files[0].content as string;
    const hash = createHash("sha256").update(Buffer.from(original, "base64")).digest("hex");
    let library = await saved();
    const correction = { ...library.definition, slides: library.definition.slides.map(s => s.text === "Body" ? { ...s, role: "closing" as const } : s) };
    const updated = await savePowerPointTemplateLibraryAction(library.id, sourceId, "Corrected", correction);
    expect(updated).toHaveProperty("library");
    const persistedId = library.id;
    library = null as unknown as typeof library;
    const reopened = await getPowerPointTemplateLibraryAction(persistedId);
    if ("error" in reopened) throw reopened;
    expect(reopened.library.definition.slides.map(s => [s.ordinal, s.text, s.role])).toEqual([
      [1, "", "other"], [2, "Body", "closing"], [3, "Divider", "section-divider"], [4, "Title", "title"],
    ]);
    const download = await downloadPowerPointTemplateLibraryAction(persistedId, "original");
    if ("error" in download) throw download;
    expect(download.base64).toBe(original);
    expect(createHash("sha256").update(Buffer.from(download.base64, "base64")).digest("hex")).toBe(hash);
    const manifest = await downloadPowerPointTemplateLibraryAction(persistedId, "manifest");
    if ("error" in manifest) throw manifest;
    expect(JSON.parse(Buffer.from(manifest.base64, "base64").toString())).toEqual(reopened.library.definition);
    const reuse = await reusePowerPointTemplateLibraryAction(persistedId);
    if ("error" in reuse) throw reuse;
    let selected = "";
    handoffTemplate(reuse.sourceFileId, { setItem: (_, value) => { selected = value; } }, () => expect(JSON.parse(selected)).toBe(sourceId));
    const filled = await fillDeckTemplateFileAction(JSON.parse(selected), { presentationTitle: "New lesson", slides: [{ title: "Reused original", bullets: [] }] });
    if ("error" in filled) throw filled;
    expect((await parseOfficeParagraphs("pptx", Buffer.from(filled.base64, "base64")))[0].text).toBe("Reused original");
    expect(h.tables.deck_template_files[0].content).toBe(original);
    expect(h.model).toHaveBeenCalledTimes(1);
  });
  it("real requireUser denies anonymous and inactive accounts before parser, model or table access", async () => {
    for (const identity of ["anonymous", "pending", "suspended"]) {
      h.anonymous = identity === "anonymous"; h.status = identity === "anonymous" ? "active" : identity; h.calls = [];
      const operations = [
        () => uploadPowerPointTemplateAction("Name", "x.pptx", "invalid", true),
        () => analyzePowerPointTemplateAction(sourceId), () => listPowerPointTemplateLibrariesAction(),
        () => getPowerPointTemplateLibraryAction(sourceId), () => reusePowerPointTemplateLibraryAction(sourceId),
        () => downloadPowerPointTemplateLibraryAction(sourceId, "original"),
        () => savePowerPointTemplateLibraryAction(null, sourceId, "Name", { version: 1, slides: [] }),
      ];
      for (const action of operations) expect(await action()).toMatchObject({ code: "PPT_AUTH" });
      expect(h.calls).toEqual([]); expect(h.model).not.toHaveBeenCalled();
    }
  });
  it("requires explicit template intent and strict wire/signature validation before existing uploader", async () => {
    const bytes = await pptFixture();
    expect(await uploadPowerPointTemplateAction("Name", "x.pptx", bytes.toString("base64"), false)).toMatchObject({ code: "PPT_INVALID" });
    expect(await uploadPowerPointTemplateAction("Name", "x.docx", bytes.toString("base64"), true)).toMatchObject({ code: "PPT_INVALID" });
    expect(await uploadPowerPointTemplateAction("Name", "x.pptx", "not base64", true)).toMatchObject({ code: "PPT_INVALID" });
    expect(h.calls.filter(c => c.op === "insert")).toEqual([]);
    expect(await uploadPowerPointTemplateAction("Name", "uploaded.pptx", bytes.toString("base64"), true)).toHaveProperty("sourceFileId");
    expect(h.tables.deck_template_files).toHaveLength(2);
  });
  it("scopes foreign reads, list, updates, download, reuse and source attachment", async () => {
    const own = await saved(); const before = JSON.stringify(h.tables);
    h.userId = "33333333-3333-4333-8333-333333333333"; h.calls = [];
    for (const action of [
      () => getPowerPointTemplateLibraryAction(own.id), () => downloadPowerPointTemplateLibraryAction(own.id, "original"),
      () => reusePowerPointTemplateLibraryAction(own.id), () => analyzePowerPointTemplateAction(sourceId),
      () => savePowerPointTemplateLibraryAction(own.id, sourceId, "Foreign", own.definition),
      () => savePowerPointTemplateLibraryAction(null, sourceId, "Foreign", own.definition),
    ]) expect(await action()).toMatchObject({ code: "PPT_NOT_FOUND" });
    expect(await listPowerPointTemplateLibrariesAction()).toEqual({ libraries: [] });
    expect(JSON.stringify(h.tables)).toBe(before);
    expect(h.calls.filter(c => c.op === "eq" && c.args[0] === "user_id").length).toBeGreaterThanOrEqual(7);
  });
  it("keeps previous source and definition on provider/validation/save failures with fixed private-safe errors", async () => {
    const own = await saved(); const original = JSON.stringify(h.tables);
    h.model.mockResolvedValue({ ok: true, text: '{"slides":[]}' });
    expect(await analyzePowerPointTemplateAction(sourceId)).toMatchObject({ code: "PPT_MODEL" });
    const invalid = { ...own.definition, slides: own.definition.slides.slice(1) };
    expect(await savePowerPointTemplateLibraryAction(own.id, sourceId, "Bad", invalid)).toMatchObject({ code: "PPT_MODEL" });
    h.failSave = true;
    const result = await savePowerPointTemplateLibraryAction(own.id, sourceId, "Changed", own.definition);
    expect(result).toMatchObject({ code: "PPT_STORAGE" }); expect(JSON.stringify(result)).not.toContain("private database");
    expect(JSON.stringify(h.tables)).toBe(original);
    h.failSave = false;
    expect(await savePowerPointTemplateLibraryAction(own.id, sourceId, "Retry", own.definition)).toHaveProperty("library");
  });
  it("rechecks ownership after model calls", async () => {
    h.model.mockImplementation(async () => { h.tables.deck_template_files = []; return { ok: true, text: JSON.stringify({ slides: [
      { id: "ppt/slides/slide4.xml", role: "other" }, { id: "ppt/slides/slide3.xml", role: "content" },
      { id: "ppt/slides/slide2.xml", role: "section-divider" }, { id: "ppt/slides/slide1.xml", role: "title" },
    ] }) }; });
    expect(await analyzePowerPointTemplateAction(sourceId)).toMatchObject({ code: "PPT_NOT_FOUND" });
    expect(h.tables.powerpoint_template_libraries).toEqual([]);
  });
  it("requires RLS and a composite owner-source constraint in migration code", () => {
    const sql = readFileSync("supabase/migrations/20261030000000_powerpoint_template_libraries.sql", "utf8");
    expect(sql).toMatch(/foreign key \(user_id, source_file_id\)/i);
    expect(sql).toMatch(/references public.deck_template_files\(user_id, id\)/i);
    expect(sql).toMatch(/enable row level security/i);
    expect(sql).toMatch(/using \(user_id = auth.uid\(\)\) with check \(user_id = auth.uid\(\)\)/i);
  });
});

it("never returns an original binary outside the wire response budget", async () => {
  const library = await saved();
  h.tables.deck_template_files[0].content = "AAAA".repeat(1000000);
  const result = await downloadPowerPointTemplateLibraryAction(library.id, "original");
  expect(result).toMatchObject({ code: "PPT_LIMIT" });
  expect(result).not.toHaveProperty("base64");
});
describe("malformed OOXML refuses before provider or persistence", () => {
  it.each([
    ["ppt/presentation.xml", "</p:presentation>"],
    ["ppt/slides/slide1.xml", "</p:cSld>"],
    ["ppt/_rels/presentation.xml.rels", "</Relationships>"],
    ["[Content_Types].xml", "</Types>"],
  ])("rejects a corrupt XML part in a valid ZIP: %s", async (member, closingTag) => {
    const zip = await JSZip.loadAsync(await pptFixture());
    const xml = await zip.file(member)!.async("string");
    expect(xml).toContain(closingTag);
    zip.file(member, xml.replace(closingTag, ""));
    const base64 = (await zip.generateAsync({ type: "nodebuffer" })).toString("base64");
    const original = JSON.stringify(h.tables);
    expect(await uploadPowerPointTemplateAction("Corrupt", "corrupt.pptx", base64, true)).toMatchObject({ code: "PPT_INVALID" });
    expect(h.model).not.toHaveBeenCalled();
    expect(h.calls).toEqual([]);
    expect(JSON.stringify(h.tables)).toBe(original);
    h.tables.deck_template_files[0].content = base64;
    h.calls = [];
    expect(await analyzePowerPointTemplateAction(sourceId)).toMatchObject({ code: "PPT_INVALID" });
    expect(h.model).not.toHaveBeenCalled();
    expect(h.calls.filter(call => call.op === "insert" || call.op === "update")).toEqual([]);
    expect(h.tables.powerpoint_template_libraries).toEqual([]);
  });
  it("accepts the unchanged valid upload control without calling the provider", async () => {
    const bytes = await pptFixture();
    expect(await uploadPowerPointTemplateAction("Valid", "valid.pptx", bytes.toString("base64"), true)).toHaveProperty("sourceFileId");
    expect(h.tables.deck_template_files).toHaveLength(2);
    expect(h.model).not.toHaveBeenCalled();
  });
});
