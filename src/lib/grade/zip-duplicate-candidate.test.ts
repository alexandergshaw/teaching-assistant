import { describe, expect, it, vi } from "vitest";
import JSZip from "jszip";
import { compareZipCandidates } from "./zip-duplicate-candidate";

async function archive(name: string, entries: readonly [string, string][], compression: "STORE" | "DEFLATE" = "STORE") {
  const zip = new JSZip();
  for (const [path, value] of entries) zip.file(path, value);
  const bytes = await zip.generateAsync({ type: "uint8array", compression });
  return new File([new Uint8Array(bytes).buffer], name, { type: "application/zip" });
}

describe("possible duplicate ZIP metadata", () => {
  it("matches reordered members across different compression, not changed work", async () => {
    const first = await archive("first.zip", [["a.txt", "first"], ["b.txt", "second"]]);
    const same = await archive("second.zip", [["b.txt", "second"], ["a.txt", "first"]], "DEFLATE");
    const changed = await archive("changed.zip", [["a.txt", "different"], ["b.txt", "second"]]);
    expect(await compareZipCandidates([same], [first])).toEqual({ possibleDuplicate: true, incomplete: false });
    expect(await compareZipCandidates([changed], [first])).toEqual({ possibleDuplicate: false, incomplete: false });
    expect(await compareZipCandidates([first, same], [])).toEqual({ possibleDuplicate: true, incomplete: false });
  });
  it("discloses uninspectable archives instead of asserting uniqueness", async () => {
    const bad = new File(["not a zip"], "bad.zip");
    expect(await compareZipCandidates([bad], [])).toEqual({ possibleDuplicate: false, incomplete: true });
  });
  it("bounds reads even when every archive is malformed", async () => {
    const files = Array.from({ length: 80 }, (_, index) => new File(["x".repeat(22)], `${index}.zip`));
    const reads = files.map((file) => vi.spyOn(file, "slice"));
    expect(await compareZipCandidates(files, [])).toEqual({ possibleDuplicate: false, incomplete: true });
    expect(reads.reduce((sum, spy) => sum + spy.mock.calls.length, 0)).toBe(64);
  });
});
