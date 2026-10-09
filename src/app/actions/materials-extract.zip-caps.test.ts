// DECOMPRESS-CAP-HARDENING W1: materials-extract must never fully decompress a
// member before its size is checked. Best-effort contract: refused members are
// LISTED with empty text, never a thrown error.
import { describe, it, expect, vi } from "vitest";
import JSZip from "jszip";
import { readFileSync } from "node:fs";

vi.mock("@/lib/supabase/auth", () => ({ requireOwner: vi.fn(async () => undefined) }));

import { extractZipMaterialsTextAction } from "./materials-extract";

function patchDeclaredSize(archive: Uint8Array, entryName: string, uncompressed: number): void {
  const view = new DataView(archive.buffer, archive.byteOffset, archive.byteLength);
  let eocd = -1;
  for (let i = archive.length - 22; i >= 0; i -= 1) {
    if (view.getUint32(i, true) === 0x06054b50) {
      eocd = i;
      break;
    }
  }
  if (eocd < 0) throw new Error("no end-of-central-directory record");
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

async function build(): Promise<Uint8Array> {
  const zip = new JSZip();
  zip.file("good.txt", "normal member text");
  zip.file("liar.txt", "y".repeat(500));
  zip.file("big.txt", "z".repeat(3000));
  return zip.generateAsync({ type: "uint8array", compression: "DEFLATE" });
}

describe("materials-extract zip caps (DECOMPRESS-CAP-HARDENING W1)", () => {
  it("lists a normal member's text", async () => {
    const res = await extractZipMaterialsTextAction(Buffer.from(await build()).toString("base64"));
    if (!("entries" in res)) throw new Error(res.error);
    expect(res.entries.find((e) => e.name === "good.txt")?.text).toBe("normal member text");
  });

  it("lists a lie-low member with empty text instead of inflating it", async () => {
    const archive = await build();
    patchDeclaredSize(archive, "liar.txt", 5);
    const res = await extractZipMaterialsTextAction(Buffer.from(archive).toString("base64"));
    if (!("entries" in res)) throw new Error(res.error);
    expect(res.entries.find((e) => e.name === "liar.txt")?.text).toBe("");
    expect(res.entries.find((e) => e.name === "good.txt")?.text).toBe("normal member text");
  });

  it("lists a header-honest oversized member with empty text, by declared size", async () => {
    const res = await extractZipMaterialsTextAction(Buffer.from(await build()).toString("base64"), 20, 1000);
    if (!("entries" in res)) throw new Error(res.error);
    expect(res.entries.find((e) => e.name === "big.txt")).toEqual({ name: "big.txt", size: 3000, text: "" });
  });

  it("census: no raw decompress, and the bounded read precedes extraction", () => {
    const src = readFileSync(new URL("./materials-extract.ts", import.meta.url), "utf-8");
    expect(src.match(/\.async\(/g) ?? []).toEqual([]);
    const sizes = src.indexOf("declaredSizesOf(member");
    const read = src.indexOf("await readMemberBounded(member, declared");
    const extract = src.indexOf("await extractTextFromBuffer(");
    const guard = src.indexOf("declared > maxMemberBytes");
    expect(sizes).toBeGreaterThan(-1);
    // The oversize SKIP decision must sit between the declared-size read and the
    // bounded read, so an honest-oversized member is never inflated first.
    expect(guard).toBeGreaterThan(sizes);
    expect(guard).toBeLessThan(read);
    expect(read).toBeGreaterThan(sizes);
    expect(extract).toBeGreaterThan(read);
  });
});
