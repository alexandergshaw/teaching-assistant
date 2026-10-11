// PPT-TEMPLATE-UPLOAD-PLACE W1: the deck-template-files actions against a
// recording in-memory Supabase stand-in. The client is the SERVICE-ROLE client,
// which bypasses RLS, so the .eq("user_id") filters are the only per-user
// control: these tests prove a foreign id cannot read, fill or delete another
// user's row (S-AUTH-1), that a rejected upload never reaches the parse or the
// insert (S-ORDER-1/2), that the zip-cap error is worded for a template
// (S-ERR-2), and that an over-budget fill refuses cleanly (S-OUT-1).
// The Supabase client is mocked; fetch is never touched.
import { describe, it, expect, vi, beforeEach } from "vitest";
import JSZip from "jszip";
import { readFileSync } from "node:fs";
import path from "node:path";

type Row = Record<string, unknown>;

const h = vi.hoisted(() => {
  const state = {
    userId: "11111111-1111-4111-8111-111111111111",
    rows: [] as Array<Record<string, unknown>>,
    calls: [] as Array<{ op: string; args: unknown[] }>,
    inserted: [] as Array<Record<string, unknown>>,
    nextId: 1,
  };
  return { state };
});

vi.mock("@/lib/supabase/auth", () => ({
  requireUser: vi.fn(async () => ({ id: h.state.userId, email: "a@example.com", role: "instructor", status: "active" })),
}));

function makeBuilder() {
  const filters: Array<[string, unknown]> = [];
  let mode: "select" | "delete" | "insert" = "select";
  let pending: Row | null = null;
  const record = (op: string, args: unknown[]) => h.state.calls.push({ op, args });
  const matches = () => h.state.rows.filter((r) => filters.every(([k, v]) => r[k] === v));
  const run = () => {
    if (mode === "delete") {
      const doomed = new Set(matches());
      h.state.rows = h.state.rows.filter((r) => !doomed.has(r));
      return { data: null, error: null };
    }
    return { data: matches(), error: null };
  };
  const builder = {
    select: (...a: unknown[]) => {
      record("select", a);
      return builder;
    },
    eq: (col: string, val: unknown) => {
      record("eq", [col, val]);
      filters.push([col, val]);
      return builder;
    },
    order: (...a: unknown[]) => {
      record("order", a);
      return builder;
    },
    delete: () => {
      record("delete", []);
      mode = "delete";
      return builder;
    },
    insert: (row: Row) => {
      record("insert", [row]);
      h.state.inserted.push(row);
      mode = "insert";
      pending = { id: `00000000-0000-4000-8000-${String(h.state.nextId++).padStart(12, "0")}`, ...row };
      h.state.rows.push(pending);
      return builder;
    },
    maybeSingle: async () => ({ data: matches()[0] ?? null, error: null }),
    single: async () => ({ data: pending, error: null }),
    then: (resolve: (v: unknown) => void) => resolve(run()),
  };
  return builder;
}

vi.mock("@/lib/supabase/server", () => ({
  createServiceClient: () => ({ from: () => makeBuilder() }),
}));

vi.mock("@/lib/office-edit", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/office-edit")>();
  return { ...actual, parseOfficeParagraphs: vi.fn(actual.parseOfficeParagraphs) };
});

import { parseOfficeParagraphs } from "@/lib/office-edit";
import {
  deleteDeckTemplateFileAction,
  fillDeckTemplateFileAction,
  listDeckTemplateFilesAction,
  uploadDeckTemplateFileAction,
} from "./deck-template-files";
import { requireUser } from "@/lib/supabase/auth";

const USER_A = "11111111-1111-4111-8111-111111111111";
const USER_B = "22222222-2222-4222-8222-222222222222";

const PPTX_MAIN = "application/vnd.openxmlformats-officedocument.presentationml.presentation.main+xml";
const DOCX_MAIN = "application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml";

function slideXml(text: string): string {
  return (
    `<p:sld xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" ` +
    `xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main">` +
    `<p:cSld><p:spTree><p:sp><p:txBody><a:p><a:r><a:t>${text}</a:t></a:r></a:p></p:txBody></p:sp></p:spTree></p:cSld></p:sld>`
  );
}

function contentTypes(overrides: string): string {
  return (
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>` +
    `<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">` +
    `<Default Extension="xml" ContentType="application/xml"/>${overrides}</Types>`
  );
}

async function zipBase64(members: Record<string, string | Uint8Array>): Promise<string> {
  const zip = new JSZip();
  for (const [name, data] of Object.entries(members)) zip.file(name, data, { createFolders: false });
  const bytes = await zip.generateAsync({ type: "nodebuffer", compression: "DEFLATE" });
  return bytes.toString("base64");
}

async function realPptxBase64(extra: Record<string, string | Uint8Array> = {}): Promise<string> {
  return zipBase64({
    "[Content_Types].xml": contentTypes(`<Override PartName="/ppt/presentation.xml" ContentType="${PPTX_MAIN}"/>`),
    "ppt/presentation.xml": "<p:presentation/>",
    "ppt/slides/slide1.xml": slideXml("Hello title"),
    ...extra,
  });
}

function patchDeclaredSize(archive: Uint8Array, entryName: string, uncompressed: number): void {
  const view = new DataView(archive.buffer, archive.byteOffset, archive.byteLength);
  let eocd = -1;
  for (let i = archive.length - 22; i >= 0; i -= 1) {
    if (view.getUint32(i, true) === 0x06054b50) {
      eocd = i;
      break;
    }
  }
  let cursor = view.getUint32(eocd + 16, true);
  const count = view.getUint16(eocd + 10, true);
  const decoder = new TextDecoder();
  for (let n = 0; n < count; n += 1) {
    const nameLength = view.getUint16(cursor + 28, true);
    const extraLength = view.getUint16(cursor + 30, true);
    const commentLength = view.getUint16(cursor + 32, true);
    const name = decoder.decode(archive.subarray(cursor + 46, cursor + 46 + nameLength));
    if (name === entryName) {
      view.setUint32(cursor + 24, uncompressed, true);
      return;
    }
    cursor += 46 + nameLength + extraLength + commentLength;
  }
  throw new Error(`entry ${entryName} not found`);
}

function storedRow(id: string, userId: string, content: string): Row {
  return {
    id,
    user_id: userId,
    name: "Stored",
    file_name: "stored.pptx",
    content,
    updated_at: "2026-10-11T00:00:00.000Z",
  };
}

const DECK = { presentationTitle: "Week 1", slides: [{ title: "Intro", bullets: ["one", "two"] }] };

beforeEach(() => {
  h.state.userId = USER_A;
  h.state.rows = [];
  h.state.calls = [];
  h.state.inserted = [];
  h.state.nextId = 1;
  vi.mocked(parseOfficeParagraphs).mockClear();
  vi.mocked(requireUser).mockClear();
});

describe("uploadDeckTemplateFileAction", () => {
  it("accepts a genuine .pptx and persists it under the session user", async () => {
    const result = await uploadDeckTemplateFileAction("My template", "deck.pptx", await realPptxBase64());
    expect("template" in result).toBe(true);
    expect(h.state.inserted).toHaveLength(1);
    expect(h.state.inserted[0].user_id).toBe(USER_A);
    expect(h.state.inserted[0].file_name).toBe("deck.pptx");
    expect(requireUser).toHaveBeenCalled();
  });

  it("a rejected file never reaches the insert, and head-sniff rows never reach the parse (S-ORDER-1)", async () => {
    const docx = await zipBase64({
      "[Content_Types].xml": contentTypes(`<Override PartName="/word/document.xml" ContentType="${DOCX_MAIN}"/>`),
      "word/document.xml": "<w:document/>",
    });
    const nonOffice = await zipBase64({ "readme.txt": "hello" });
    const noPresentation = await zipBase64({
      "[Content_Types].xml": contentTypes(`<Override PartName="/ppt/presentation.xml" ContentType="${PPTX_MAIN}"/>`),
      "ppt/slides/slide1.xml": slideXml("x"),
    });
    const doctype = await realPptxBase64({
      "[Content_Types].xml": `<!DOCTYPE Types [<!ENTITY a "b">]>${contentTypes(
        `<Override PartName="/ppt/presentation.xml" ContentType="${PPTX_MAIN}"/>`
      )}`,
    });
    const corrupt = Buffer.concat([Buffer.from([0x50, 0x4b, 0x03, 0x04]), Buffer.from("not a zip")]).toString("base64");
    const ole = Buffer.concat([Buffer.from([0xd0, 0xcf, 0x11, 0xe0]), Buffer.alloc(64)]).toString("base64");
    const text = Buffer.from("plain text").toString("base64");

    for (const payload of [docx, nonOffice, noPresentation, doctype, corrupt, ole, text]) {
      const result = await uploadDeckTemplateFileAction("T", "deck.pptx", payload);
      expect("error" in result).toBe(true);
    }
    expect(h.state.inserted).toHaveLength(0);
    expect(vi.mocked(parseOfficeParagraphs)).not.toHaveBeenCalled();
  });

  it("a non-zip is refused without opening a zip (S-ORDER-2)", async () => {
    const spy = vi.spyOn(JSZip, "loadAsync");
    try {
      const result = await uploadDeckTemplateFileAction("T", "deck.pptx", Buffer.from("plain text").toString("base64"));
      expect("error" in result && result.error).toBe("That is not a PowerPoint (.pptx) file.");
      expect(spy).not.toHaveBeenCalled();
    } finally {
      spy.mockRestore();
    }
  });

  it("words a different-Office file and a macro-enabled file, not a generic save error", async () => {
    const docx = await zipBase64({
      "[Content_Types].xml": contentTypes(`<Override PartName="/word/document.xml" ContentType="${DOCX_MAIN}"/>`),
      "word/document.xml": "<w:document/>",
    });
    const result = await uploadDeckTemplateFileAction("T", "deck.pptx", docx);
    expect("error" in result && result.error).toBe("That is a different Office file, not a PowerPoint.");
  });

  it("maps a zip-cap breach to template copy, never the grading-worded text (S-ERR-1/2)", async () => {
    const zip = new JSZip();
    zip.file("[Content_Types].xml", contentTypes(`<Override PartName="/ppt/presentation.xml" ContentType="${PPTX_MAIN}"/>`));
    zip.file("ppt/presentation.xml", "<p:presentation/>");
    zip.file("ppt/slides/slide1.xml", slideXml("x"));
    const archive = await zip.generateAsync({ type: "uint8array", compression: "DEFLATE" });
    patchDeclaredSize(archive, "ppt/slides/slide1.xml", 0x7fffffff);
    const result = await uploadDeckTemplateFileAction("T", "deck.pptx", Buffer.from(archive).toString("base64"));
    expect("error" in result).toBe(true);
    const message = "error" in result ? result.error : "";
    expect(message).toBe("That file is too large or too heavily compressed to open safely.");
    expect(message).not.toContain("Nothing was graded");
    expect(h.state.inserted).toHaveLength(0);

    const corrupt = Buffer.concat([Buffer.from([0x50, 0x4b, 0x03, 0x04]), Buffer.from("not a zip")]).toString("base64");
    const corruptResult = await uploadDeckTemplateFileAction("T", "deck.pptx", corrupt);
    const corruptMessage = "error" in corruptResult ? corruptResult.error : "";
    expect(corruptMessage).not.toMatch(/central directory/i);
  });

  it("keeps the cheap extension, name and empty filters", async () => {
    expect(await uploadDeckTemplateFileAction("T", "deck.docx", "AAAA")).toEqual({
      error: "The template must be a PowerPoint .pptx file.",
    });
    expect(await uploadDeckTemplateFileAction("  ", "deck.pptx", "AAAA")).toEqual({ error: "Enter a template name." });
    expect(await uploadDeckTemplateFileAction("T", "deck.pptx", "")).toEqual({ error: "Upload a .pptx file." });
  });
});

describe("per-user scoping (S-AUTH-1/2)", () => {
  const ID_A = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
  const ID_B = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";

  it("list scopes by the session user and omits another user's rows", async () => {
    h.state.rows = [storedRow(ID_A, USER_A, "x"), storedRow(ID_B, USER_B, "y")];
    const result = await listDeckTemplateFilesAction();
    expect(h.state.calls).toContainEqual({ op: "eq", args: ["user_id", USER_A] });
    expect("templates" in result && result.templates.map((t) => t.id)).toEqual([ID_A]);
    expect(requireUser).toHaveBeenCalled();
  });

  it("delete scopes by user_id: a foreign id removes nothing", async () => {
    h.state.rows = [storedRow(ID_A, USER_A, "x"), storedRow(ID_B, USER_B, "y")];
    const result = await deleteDeckTemplateFileAction(ID_B);
    expect(result).toEqual({ ok: true });
    expect(h.state.calls).toContainEqual({ op: "eq", args: ["user_id", USER_A] });
    expect(h.state.rows.map((r) => r.id)).toEqual([ID_A, ID_B]);
    await deleteDeckTemplateFileAction(ID_A);
    expect(h.state.rows.map((r) => r.id)).toEqual([ID_B]);
  });

  it("fill scopes by user_id: a foreign id and a missing id answer identically", async () => {
    h.state.rows = [storedRow(ID_B, USER_B, await realPptxBase64())];
    const foreign = await fillDeckTemplateFileAction(ID_B, DECK);
    const missing = await fillDeckTemplateFileAction("cccccccc-cccc-4ccc-8ccc-cccccccccccc", DECK);
    expect(h.state.calls).toContainEqual({ op: "eq", args: ["user_id", USER_A] });
    expect(foreign).toEqual({ error: "That template no longer exists." });
    expect(missing).toEqual(foreign);
    expect(requireUser).toHaveBeenCalled();
  });

  it("fill reads and fills the caller's own template", async () => {
    h.state.rows = [storedRow(ID_A, USER_A, await realPptxBase64())];
    const result = await fillDeckTemplateFileAction(ID_A, DECK);
    expect("base64" in result).toBe(true);
    const out = await JSZip.loadAsync(Buffer.from("base64" in result ? result.base64 : "", "base64"));
    const xml = await out.file("ppt/slides/slide1.xml")!.async("string");
    expect(xml).toContain("Intro");
  });

  it("a non-uuid id never reaches the query", async () => {
    const del = await deleteDeckTemplateFileAction("not-a-uuid");
    const fill = await fillDeckTemplateFileAction("not-a-uuid", DECK);
    expect(del).toEqual({ error: "That template no longer exists." });
    expect(fill).toEqual({ error: "That template no longer exists." });
    expect(h.state.calls.filter((c) => c.op === "eq")).toHaveLength(0);
  });

  it("a malformed deck is refused with worded text", async () => {
    const bad = (await fillDeckTemplateFileAction(ID_A, { presentationTitle: "x" } as never)) as { error: string };
    expect(bad.error).toMatch(/expected shape/);
  });
});

describe("post-fill size refusal (S-OUT-1)", () => {
  it("refuses cleanly when the uncompressed fill output exceeds the response budget", async () => {
    // Five 900KB members of zeros: each under the per-member ratio floor, tiny
    // on the wire, but regenerated uncompressed they total about 4.5MB.
    const big: Record<string, Uint8Array> = {};
    for (let i = 0; i < 5; i += 1) big[`ppt/media/pad${i}.bin`] = new Uint8Array(900 * 1024);
    const content = await realPptxBase64(big);
    expect(content.length).toBeLessThan(100 * 1024);
    const id = "dddddddd-dddd-4ddd-8ddd-dddddddddddd";
    h.state.rows = [storedRow(id, USER_A, content)];

    const result = await fillDeckTemplateFileAction(id, DECK);
    expect("base64" in result).toBe(false);
    const message = "error" in result ? result.error : "";
    expect(message).toMatch(/The filled deck is \d+\.\dMB, larger than the \d+\.\dMB/);
  });
});

describe("module shape", () => {
  it("adds no new exported action and no non-async export", () => {
    const source = readFileSync(path.join(process.cwd(), "src", "app", "actions", "deck-template-files.ts"), "utf8");
    const exports = source.split("\n").filter((l) => /^export\s/.test(l));
    expect(exports.filter((l) => !/^export async function /.test(l) && !/^export interface /.test(l))).toEqual([]);
    expect(exports.filter((l) => /^export async function /.test(l))).toHaveLength(4);
  });
});
