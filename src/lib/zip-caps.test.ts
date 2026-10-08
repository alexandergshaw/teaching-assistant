// ZIP-BOMB-CAPS W1 (docs/zip-bomb-caps-scope.md): unit tests for the zip-caps
// leaf. Real in-memory jszip fixtures only; nothing here needs the network.
// Lying-header fixtures patch the central directory of a SMALL zip, so no
// large archive is built except the one real-expansion case (32 MiB of zeros).
import { describe, it, expect, vi, afterEach } from "vitest";
import JSZip from "jszip";
import {
  DEFAULT_ZIP_LIMITS,
  ZIP_ERROR_NAME_MAX_CHARS,
  ZIP_EXTRACTION_CONCURRENCY,
  ZIP_MAX_CUMULATIVE_DECLARED_BYTES,
  ZIP_MAX_CUMULATIVE_ENTRIES,
  ZIP_MAX_MEMBER_DECLARED_BYTES,
  ZIP_REFUSAL_PREFIX,
  ZipCapError,
  chargeArchiveLevel,
  createZipBudget,
  declaredSizesOf,
  readMemberBounded,
  runBounded,
  type ZipMemberKind,
} from "./zip-caps";
import { formatMB } from "./upload-budget";

afterEach(() => {
  vi.restoreAllMocks();
});

function seededBytes(length: number, seed: number): Uint8Array {
  const out = new Uint8Array(length);
  let state = seed >>> 0;
  for (let i = 0; i < length; i += 1) {
    state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
    out[i] = state >>> 24;
  }
  return out;
}

async function makeZip(
  files: Record<string, Uint8Array | string>,
  compression: "STORE" | "DEFLATE" = "STORE"
): Promise<Uint8Array> {
  const zip = new JSZip();
  for (const [name, data] of Object.entries(files)) {
    zip.file(name, data, { createFolders: false });
  }
  return zip.generateAsync({
    type: "uint8array",
    compression,
    compressionOptions: { level: 9 },
  });
}

/** Overwrite the size fields of one entry's CENTRAL-directory record. */
function patchCentralDirectory(
  archive: Uint8Array,
  entryName: string,
  patch: { uncompressed?: number; compressed?: number }
): void {
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
      if (patch.compressed !== undefined) view.setUint32(cursor + 20, patch.compressed, true);
      if (patch.uncompressed !== undefined) view.setUint32(cursor + 24, patch.uncompressed, true);
      return;
    }
    cursor += 46 + nameLength + extraLength + commentLength;
  }
  throw new Error(`entry ${entryName} not found`);
}

const LEAF_ALL = (): ZipMemberKind => "leaf";

function ctx(classify: (name: string) => ZipMemberKind = LEAF_ALL): {
  parentPath: string;
  chain: string[];
  classify: (name: string) => ZipMemberKind;
} {
  return { parentPath: "", chain: [], classify };
}

describe("zip-caps constants and budget", () => {
  it("exposes the owner-tunable constants through DEFAULT_ZIP_LIMITS", () => {
    expect(DEFAULT_ZIP_LIMITS.entries).toBe(ZIP_MAX_CUMULATIVE_ENTRIES);
    expect(DEFAULT_ZIP_LIMITS.cumulativeBytes).toBe(ZIP_MAX_CUMULATIVE_DECLARED_BYTES);
    expect(DEFAULT_ZIP_LIMITS.maxMemberDeclaredBytes).toBe(ZIP_MAX_MEMBER_DECLARED_BYTES);
    expect(DEFAULT_ZIP_LIMITS.concurrency).toBe(ZIP_EXTRACTION_CONCURRENCY);
  });

  it("createZipBudget starts at zero and merges overrides over the defaults", () => {
    const budget = createZipBudget({ entries: 7 });
    expect(budget.entryCount).toBe(0);
    expect(budget.declaredBytes).toBe(0);
    expect(budget.limits.entries).toBe(7);
    expect(budget.limits.cumulativeBytes).toBe(ZIP_MAX_CUMULATIVE_DECLARED_BYTES);
  });

  it("the refusal prefix matches the one grading-incremental routes on", () => {
    expect(ZIP_REFUSAL_PREFIX).toBe("Refused: ");
  });
});

describe("declaredSizesOf - fails closed", () => {
  it("reads both sizes from a loaded entry", async () => {
    const zip = await JSZip.loadAsync(await makeZip({ "a.txt": "hello" }));
    expect(declaredSizesOf(zip.files["a.txt"], "a.txt")).toEqual({ declared: 5, compressed: 5 });
  });

  it.each([
    ["no _data record", {}],
    ["missing uncompressedSize", { _data: { compressedSize: 5 } }],
    ["missing compressedSize", { _data: { uncompressedSize: 5 } }],
    ["NaN size", { _data: { uncompressedSize: Number.NaN, compressedSize: 5 } }],
    ["negative size", { _data: { uncompressedSize: -1, compressedSize: 5 } }],
    ["string size", { _data: { uncompressedSize: "5", compressedSize: 5 } }],
  ])("refuses an entry with %s instead of counting it as 0 bytes", (_label, fake) => {
    let caught: unknown;
    try {
      declaredSizesOf(fake as unknown as JSZip.JSZipObject, "evil.txt");
    } catch (error) {
      caught = error;
    }
    expect(caught).toBeInstanceOf(ZipCapError);
    expect((caught as ZipCapError).code).toBe("unverifiable-size");
    expect((caught as ZipCapError).message.startsWith(ZIP_REFUSAL_PREFIX)).toBe(true);
  });
});

describe("chargeArchiveLevel", () => {
  it("returns the decompressed members in archive order with their declared sizes", async () => {
    const zip = await JSZip.loadAsync(await makeZip({ "b.txt": "bb", "a.txt": "aaa" }));
    const planned = chargeArchiveLevel(zip, createZipBudget(), ctx());
    expect(planned.map((member) => [member.name, member.declared])).toEqual([
      ["b.txt", 2],
      ["a.txt", 3],
    ]);
  });

  it("counts directories and skipped entries toward the entry cap, but charges them no bytes", async () => {
    const zip = new JSZip();
    zip.folder("d");
    zip.file("skip.bin", "xxxx");
    zip.file("keep.txt", "yy");
    const loaded = await JSZip.loadAsync(await zip.generateAsync({ type: "uint8array" }));
    const budget = createZipBudget();
    chargeArchiveLevel(loaded, budget, ctx((name) => (name.endsWith(".bin") ? "skip" : "leaf")));
    expect(budget.entryCount).toBe(3);
    expect(budget.declaredBytes).toBe(2);
  });

  it("never reads the size of a skipped entry (a skipped entry with no size is not a refusal)", async () => {
    const zip = await JSZip.loadAsync(await makeZip({ "skip.bin": "x" }));
    (zip.files["skip.bin"] as unknown as { _data?: unknown })._data = undefined;
    expect(() => chargeArchiveLevel(zip, createZipBudget(), ctx(() => "skip"))).not.toThrow();
  });

  it("refuses entry-count and names the entry that crossed the limit", async () => {
    const zip = await JSZip.loadAsync(await makeZip({ "1.txt": "a", "2.txt": "b", "3.txt": "c" }));
    expect(() => chargeArchiveLevel(zip, createZipBudget({ entries: 2 }), ctx())).toThrowError(
      expect.objectContaining({ code: "entry-count", entryName: "3.txt" })
    );
  });

  it("refuses member-bytes from the declared size alone", async () => {
    const zip = await JSZip.loadAsync(await makeZip({ "big.txt": seededBytes(5000, 1) }));
    expect(() =>
      chargeArchiveLevel(zip, createZipBudget({ maxMemberDeclaredBytes: 4999 }), ctx())
    ).toThrowError(expect.objectContaining({ code: "member-bytes", entryName: "big.txt" }));
  });

  it("refuses cumulative-bytes when members each fit but the sum does not", async () => {
    const zip = await JSZip.loadAsync(
      await makeZip({ "a.txt": seededBytes(3000, 2), "b.txt": seededBytes(3000, 3) })
    );
    expect(() =>
      chargeArchiveLevel(zip, createZipBudget({ cumulativeBytes: 5000 }), ctx())
    ).toThrowError(expect.objectContaining({ code: "cumulative-bytes", entryName: "b.txt" }));
  });

  it("refuses member-ratio above the floor and ignores it below the floor", async () => {
    const archive = await makeZip({ "zeros.txt": new Uint8Array(20000) }, "DEFLATE");
    const zip = await JSZip.loadAsync(archive);
    expect(() =>
      chargeArchiveLevel(zip, createZipBudget({ ratioFloorBytes: 1000, maxMemberRatio: 50 }), ctx())
    ).toThrowError(expect.objectContaining({ code: "member-ratio" }));
    expect(() =>
      chargeArchiveLevel(zip, createZipBudget({ ratioFloorBytes: 1_000_000, maxMemberRatio: 50 }), ctx())
    ).not.toThrow();
  });

  it("refuses archive-ratio for a bomb spread over members that each stay under the member ratio", async () => {
    // Each member compresses roughly 40:1 (under the member limit of 100) and
    // sits under the floor, so only the archive-wide ratio sees the total.
    const files: Record<string, Uint8Array> = {};
    for (let i = 0; i < 6; i += 1) files[`z${i}.txt`] = new Uint8Array(2500);
    const zip = await JSZip.loadAsync(await makeZip(files, "DEFLATE"));
    const limits = { ratioFloorBytes: 5000, maxMemberRatio: 1_000_000, maxArchiveRatio: 20 };
    expect(() => chargeArchiveLevel(zip, createZipBudget(limits), ctx())).toThrowError(
      expect.objectContaining({ code: "archive-ratio" })
    );
  });

  it("fails closed on an unreadable size for a member that would be decompressed", async () => {
    const zip = await JSZip.loadAsync(await makeZip({ "a.txt": "x" }));
    (zip.files["a.txt"] as unknown as { _data?: unknown })._data = undefined;
    expect(() => chargeArchiveLevel(zip, createZipBudget(), ctx())).toThrowError(
      expect.objectContaining({ code: "unverifiable-size" })
    );
  });

  it("carries the zip chain and builds the full path from parentPath", async () => {
    const zip = await JSZip.loadAsync(await makeZip({ "a.txt": seededBytes(100, 4) }));
    let caught: unknown;
    try {
      chargeArchiveLevel(zip, createZipBudget({ maxMemberDeclaredBytes: 10 }), {
        parentPath: "outer.zip",
        chain: ["outer.zip"],
        classify: LEAF_ALL,
      });
    } catch (error) {
      caught = error;
    }
    expect((caught as ZipCapError).entryName).toBe("outer.zip/a.txt");
    expect((caught as ZipCapError).chain).toEqual(["outer.zip"]);
  });
});

describe("ZipCapError wording", () => {
  async function overMemberLimit(name: string): Promise<ZipCapError> {
    const zip = await JSZip.loadAsync(await makeZip({ [name]: seededBytes(100, 5) }));
    try {
      chargeArchiveLevel(zip, createZipBudget({ maxMemberDeclaredBytes: 10 }), ctx());
    } catch (error) {
      return error as ZipCapError;
    }
    throw new Error("expected a refusal");
  }

  it("starts with the Refused prefix and names the entry and the limit", async () => {
    const error = await overMemberLimit("report.txt");
    expect(error.message.startsWith(ZIP_REFUSAL_PREFIX)).toBe(true);
    expect(error.message).toContain("report.txt");
    expect(error.message).toContain("ZIP_MAX_MEMBER_DECLARED_BYTES");
    expect(error.message).toContain(formatMB(10));
  });

  it("replaces control characters and truncates a very long, student-controlled name", async () => {
    const hostile = `a${String.fromCharCode(10)}b${String.fromCharCode(7)}${"x".repeat(400)}.txt`;
    const error = await overMemberLimit(hostile);
    const quoted = /"([^"]*)"/.exec(error.message);
    expect(quoted).not.toBeNull();
    const shown = quoted![1];
    expect(shown.startsWith("a?b?")).toBe(true);
    expect(shown.length).toBeLessThanOrEqual(ZIP_ERROR_NAME_MAX_CHARS + 3);
    for (const ch of error.message) {
      expect(ch.charCodeAt(0) >= 32).toBe(true);
    }
  });
});

describe("readMemberBounded", () => {
  it("returns exactly the member's bytes for an honest header", async () => {
    const payload = seededBytes(70000, 6);
    const zip = await JSZip.loadAsync(await makeZip({ "a.bin": payload }, "DEFLATE"));
    const entry = zip.files["a.bin"];
    const { declared } = declaredSizesOf(entry, "a.bin");
    const out = await readMemberBounded(entry, declared, "a.bin");
    expect(Buffer.compare(out, Buffer.from(payload))).toBe(0);
  });

  it("returns an empty Buffer for an empty member", async () => {
    const zip = await JSZip.loadAsync(await makeZip({ "empty.txt": "" }));
    const out = await readMemberBounded(zip.files["empty.txt"], 0, "empty.txt");
    expect(out.length).toBe(0);
  });

  it("stops with stream-overrun when the header lies SMALL, long before the real size", async () => {
    const realSize = 4 * 1024 * 1024;
    const archive = await makeZip({ "zeros.txt": new Uint8Array(realSize) }, "DEFLATE");
    patchCentralDirectory(archive, "zeros.txt", { uncompressed: 1000 });
    const zip = await JSZip.loadAsync(archive);
    const entry = zip.files["zeros.txt"];
    const { declared } = declaredSizesOf(entry, "zeros.txt");
    expect(declared).toBe(1000);
    let caught: unknown;
    try {
      await readMemberBounded(entry, declared, "zeros.txt");
    } catch (error) {
      caught = error;
    }
    expect(caught).toBeInstanceOf(ZipCapError);
    const error = caught as ZipCapError;
    expect(error.code).toBe("stream-overrun");
    expect(error.message.startsWith(ZIP_REFUSAL_PREFIX)).toBe(true);
    expect(error.observedBytes).toBeGreaterThan(1000);
    expect(error.observedBytes as number).toBeLessThan(realSize);
  });

  it("treats a header that lies LARGE as a plain corrupt-member error, not a cap error", async () => {
    const archive = await makeZip({ "a.txt": seededBytes(1000, 7) });
    patchCentralDirectory(archive, "a.txt", { uncompressed: 5000 });
    const zip = await JSZip.loadAsync(archive);
    const entry = zip.files["a.txt"];
    let caught: unknown;
    try {
      await readMemberBounded(entry, 5000, "a.txt");
    } catch (error) {
      caught = error;
    }
    expect(caught).toBeInstanceOf(Error);
    expect(caught).not.toBeInstanceOf(ZipCapError);
  });

  it("FAILS CLOSED when internalStream is missing: refuses and never falls back to entry.async", async () => {
    const zip = await JSZip.loadAsync(await makeZip({ "a.txt": "hello" }));
    const entry = zip.files["a.txt"];
    const asyncSpy = vi.spyOn(Object.getPrototypeOf(entry), "async");
    Object.defineProperty(entry, "internalStream", { value: undefined, configurable: true });
    let caught: unknown;
    try {
      await readMemberBounded(entry, 5, "a.txt");
    } catch (error) {
      caught = error;
    }
    expect(caught).toBeInstanceOf(ZipCapError);
    expect((caught as ZipCapError).code).toBe("unverifiable-size");
    expect(asyncSpy).not.toHaveBeenCalled();
  });

  it("upgrade canary: the installed jszip still exposes internalStream on its entries", async () => {
    const zip = await JSZip.loadAsync(await makeZip({ "a.txt": "hello" }));
    expect(typeof (zip.files["a.txt"] as unknown as { internalStream?: unknown }).internalStream).toBe(
      "function"
    );
  });
});

describe("runBounded", () => {
  it("never runs more than the limit at once and runs every item", async () => {
    let open = 0;
    let max = 0;
    const seen: number[] = [];
    await runBounded([0, 1, 2, 3, 4, 5, 6, 7], 3, async (item) => {
      open += 1;
      max = Math.max(max, open);
      await new Promise((resolve) => setTimeout(resolve, 2));
      seen.push(item);
      open -= 1;
    });
    expect(max).toBe(3);
    expect(seen.sort()).toEqual([0, 1, 2, 3, 4, 5, 6, 7]);
  });

  it("is fail-fast: after the first rejection no queued item starts, and the first error is thrown", async () => {
    const started: number[] = [];
    const boom = new Error("boom");
    await expect(
      runBounded([0, 1, 2, 3, 4, 5], 1, async (item) => {
        started.push(item);
        if (item === 1) throw boom;
      })
    ).rejects.toBe(boom);
    expect(started).toEqual([0, 1]);
  });

  it("handles an empty list", async () => {
    await expect(runBounded([], 4, async () => undefined)).resolves.toBeUndefined();
  });
});
