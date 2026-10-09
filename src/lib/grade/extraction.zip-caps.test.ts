// ZIP-BOMB-CAPS W1 (docs/zip-bomb-caps-scope.md), instruments I1-I5, I8, I10,
// I12 against the real extractSubmissions. Real in-memory jszip fixtures;
// lying-header fixtures patch the central directory of a small zip, and the one
// real-expansion case (I2) is a 32 MiB zero entry.
import { describe, it, expect, vi, afterEach } from "vitest";
import JSZip from "jszip";
import { extractSubmissions } from "./extraction";
import {
  ZIP_EXTRACTION_CONCURRENCY,
  ZIP_MAX_MEMBER_DECLARED_BYTES,
  ZIP_REFUSAL_PREFIX,
  ZipCapError,
  declaredSizesOf,
} from "../zip-caps";
import { formatMB } from "../upload-budget";

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
  files: Array<readonly [string, Uint8Array | string]>,
  compression: "STORE" | "DEFLATE" = "STORE"
): Promise<Uint8Array> {
  const zip = new JSZip();
  for (const [name, data] of files) {
    zip.file(name, data, { createFolders: false, date: new Date(Date.UTC(2020, 0, 1)) });
  }
  return zip.generateAsync({ type: "uint8array", compression, compressionOptions: { level: 9 } });
}

function toArrayBuffer(bytes: Uint8Array): ArrayBuffer {
  return bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer;
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

async function docx(paragraph: string): Promise<Uint8Array> {
  return makeZip([
    ["word/document.xml", `<w:document><w:body><w:p><w:t>${paragraph}</w:t></w:p></w:body></w:document>`],
  ]);
}

/** The prototype every loaded jszip entry shares (where internalStream/async live). */
async function entryPrototype(): Promise<object> {
  const probe = await JSZip.loadAsync(await makeZip([["probe.txt", "p"]]));
  return Object.getPrototypeOf(probe.files["probe.txt"]) as object;
}

async function rejection(promise: Promise<unknown>): Promise<ZipCapError> {
  try {
    await promise;
  } catch (error) {
    expect(error).toBeInstanceOf(ZipCapError);
    return error as ZipCapError;
  }
  throw new Error("expected extractSubmissions to reject");
}

/** A small, honest archive plus a copy whose one member header lies HUGE. */
async function lyingLargeArchive(): Promise<ArrayBuffer> {
  const archive = await makeZip([["bomb.txt", seededBytes(1024, 1)]]);
  patchCentralDirectory(archive, "bomb.txt", { uncompressed: 200 * 1024 * 1024 });
  return toArrayBuffer(archive);
}

describe("I1 - refused from declared sizes WITHOUT decompressing", () => {
  it("rejects a lying-large member with member-bytes, names the entry and the limit, and never opens a stream", async () => {
    const proto = await entryPrototype();
    const streamSpy = vi.spyOn(proto as { internalStream: () => unknown }, "internalStream");
    const asyncSpy = vi.spyOn(proto as { async: () => unknown }, "async");

    const error = await rejection(extractSubmissions(await lyingLargeArchive()));

    expect(error.code).toBe("member-bytes");
    expect(error.message.startsWith(ZIP_REFUSAL_PREFIX)).toBe(true);
    expect(error.message).toContain("bomb.txt");
    expect(error.message).toContain(formatMB(ZIP_MAX_MEMBER_DECLARED_BYTES));
    expect(streamSpy).not.toHaveBeenCalled();
    expect(asyncSpy).not.toHaveBeenCalled();
  });

  it("positive control: the same spy DOES see a legitimate run", async () => {
    const proto = await entryPrototype();
    const streamSpy = vi.spyOn(proto as { internalStream: () => unknown }, "internalStream");
    const archive = await makeZip([["ok.txt", "fine"]]);
    const result = await extractSubmissions(toArrayBuffer(archive));
    expect(result.submissions["ok.txt"]).toBe("fine");
    expect(streamSpy.mock.calls.length).toBeGreaterThanOrEqual(1);
  });
});

describe("I2 - a header that lies SMALL stops early", () => {
  it("rejects stream-overrun well before the real size is decompressed", async () => {
    const realSize = 32 * 1024 * 1024;
    const archive = await makeZip([["zeros.txt", new Uint8Array(realSize)]], "DEFLATE");
    patchCentralDirectory(archive, "zeros.txt", { uncompressed: 1000 });

    const error = await rejection(extractSubmissions(toArrayBuffer(archive)));

    expect(error.code).toBe("stream-overrun");
    expect(error.message.startsWith(ZIP_REFUSAL_PREFIX)).toBe(true);
    // 16 KiB compressed block x 1032:1 deflate ceiling, node_modules/jszip/lib/
    // stream/DataWorker.js:8 (DEFAULT_BLOCK_SIZE): the most one burst can deliver.
    const burstBound = 16 * 1024 * 1032;
    expect(error.observedBytes as number).toBeGreaterThan(1000);
    expect(error.observedBytes as number).toBeLessThanOrEqual(1000 + burstBound);
    expect(error.observedBytes as number).toBeLessThan(realSize);
  });
});

describe("I3 - honest oversize", () => {
  it("rejects a member whose declared size is true but over the injected cap, without decompressing", async () => {
    const proto = await entryPrototype();
    const streamSpy = vi.spyOn(proto as { internalStream: () => unknown }, "internalStream");
    const archive = await makeZip([["big.txt", seededBytes(6000, 2)]]);
    const error = await rejection(
      extractSubmissions(toArrayBuffer(archive), { limits: { maxMemberDeclaredBytes: 5000 } })
    );
    expect(error.code).toBe("member-bytes");
    expect(streamSpy).not.toHaveBeenCalled();
  });
});

describe("I4 - the budget is SHARED across nesting levels", () => {
  async function threeLevelArchive(): Promise<{ archive: ArrayBuffer; levelTotals: number[] }> {
    const level2 = await makeZip([["x.txt", seededBytes(3000, 11)]]);
    const level1 = await makeZip([
      ["y.txt", seededBytes(3000, 12)],
      ["level2.zip", level2],
    ]);
    const outer = await makeZip([
      ["z.txt", seededBytes(3000, 13)],
      ["level1.zip", level1],
    ]);
    const totals: number[] = [];
    for (const bytes of [outer, level1, level2]) {
      const loaded = await JSZip.loadAsync(bytes);
      totals.push(
        Object.entries(loaded.files).reduce(
          (sum, [name, entry]) => sum + declaredSizesOf(entry, name).declared,
          0
        )
      );
    }
    return { archive: toArrayBuffer(outer), levelTotals: totals };
  }

  it("refuses when every level fits the limit but the SUM does not", async () => {
    const { archive, levelTotals } = await threeLevelArchive();
    const limit = 10000;
    // The test asserts its own fixture's two facts: a per-level cap would pass it.
    for (const total of levelTotals) expect(total).toBeLessThan(limit);
    expect(levelTotals.reduce((a, b) => a + b, 0)).toBeGreaterThan(limit);

    const error = await rejection(extractSubmissions(archive, { limits: { cumulativeBytes: limit } }));
    expect(error.code).toBe("cumulative-bytes");
    expect(error.chain.length).toBeGreaterThan(0);
    expect(error.chain.some((name) => name.endsWith(".zip"))).toBe(true);
  });

  it("positive control: the same archive resolves with a large cumulative limit", async () => {
    const { archive } = await threeLevelArchive();
    const result = await extractSubmissions(archive, { limits: { cumulativeBytes: 10_000_000 } });
    expect(Object.keys(result.submissions).length).toBe(3);
  });
});

describe("I5 - entries count cumulatively and include extension-skipped files", () => {
  async function twoLevelBinArchive(): Promise<ArrayBuffer> {
    const nested = await makeZip(
      Array.from({ length: 6 }, (_, i) => [`n${i}.bin`, "x"] as const)
    );
    const outer = await makeZip([
      ...Array.from({ length: 6 }, (_, i) => [`o${i}.bin`, "x"] as const),
      ["inner.zip", nested],
    ]);
    return toArrayBuffer(outer);
  }

  it("refuses entry-count when no single level exceeds the limit", async () => {
    const error = await rejection(extractSubmissions(await twoLevelBinArchive(), { limits: { entries: 10 } }));
    expect(error.code).toBe("entry-count");
  });

  it("positive control: a higher limit resolves", async () => {
    await expect(
      extractSubmissions(await twoLevelBinArchive(), { limits: { entries: 100 } })
    ).resolves.toBeDefined();
  });
});

describe("I8 - a cap error is not swallowed; a corrupt nested archive still is", () => {
  it("rejects when a bomb sits two levels down", async () => {
    const deep = await makeZip([["bomb.txt", seededBytes(1024, 21)]]);
    patchCentralDirectory(deep, "bomb.txt", { uncompressed: 200 * 1024 * 1024 });
    const mid = await makeZip([["deep.zip", deep]]);
    const outer = await makeZip([
      ["fine.txt", "fine"],
      ["mid.zip", mid],
    ]);
    const error = await rejection(extractSubmissions(toArrayBuffer(outer)));
    expect(error.code).toBe("member-bytes");
    expect(error.entryName).toBe("mid.zip/deep.zip/bomb.txt");
    expect(error.chain).toEqual(["mid.zip", "mid.zip/deep.zip"]);
  });

  it("a nested .zip of garbage bytes contributes no submissions and does not abort the batch", async () => {
    const outer = await makeZip([
      ["fine.txt", "fine"],
      ["junk.zip", "this is not a zip archive at all"],
    ]);
    const result = await extractSubmissions(toArrayBuffer(outer));
    expect(result.submissions).toEqual({ "fine.txt": "fine" });
  });

  it("DCH-W2: a corrupt nested .zip is surfaced as a failed file, and a valid student still grades", async () => {
    const outer = await makeZip([
      ["HW1/amy_1001_1001_hw.txt", "amy work"],
      ["HW1/zed_9009_9009_corrupt.zip", seededBytes(256, 77)],
    ]);
    const result = await extractSubmissions(toArrayBuffer(outer));
    expect(result.failedSupportedFiles).toEqual(["HW1/zed_9009_9009_corrupt.zip"]);
    expect(result.attemptedSupportedFiles).toBe(2);
    expect(result.submissions).toEqual({ "HW1/amy_1001_1001_hw.txt": "amy work" });
  });

  it("a non-cap per-file failure still lands in failedSupportedFiles (Z1)", async () => {
    const outer = await makeZip([["broken.docx", "this is not a real docx"]]);
    const result = await extractSubmissions(toArrayBuffer(outer));
    expect(result.failedSupportedFiles).toEqual(["broken.docx"]);
  });
});

describe("missing declared size is a refusal, not a pass", () => {
  it("rejects unverifiable-size when an entry has no readable size", async () => {
    const realLoad = JSZip.loadAsync.bind(JSZip);
    vi.spyOn(JSZip, "loadAsync").mockImplementation(async (data, options) => {
      const zip = await realLoad(data, options);
      for (const entry of Object.values(zip.files)) {
        (entry as unknown as { _data?: unknown })._data = undefined;
      }
      return zip;
    });
    const archive = await makeZip([["a.txt", "hello"]]);
    const error = await rejection(extractSubmissions(toArrayBuffer(archive)));
    expect(error.code).toBe("unverifiable-size");
    expect(error.message.startsWith(ZIP_REFUSAL_PREFIX)).toBe(true);
  });
});

describe("I10 - concurrency is bounded and fail-fast", () => {
  async function trackStreams(): Promise<{ maxOpen: () => number; calls: () => number }> {
    const proto = (await entryPrototype()) as {
      internalStream: (this: unknown, type: string) => {
        on: (event: string, handler: () => void) => unknown;
      };
    };
    const original = proto.internalStream;
    let open = 0;
    let max = 0;
    let calls = 0;
    vi.spyOn(proto, "internalStream").mockImplementation(function (this: unknown, type: string) {
      const helper = original.call(this, type);
      calls += 1;
      open += 1;
      max = Math.max(max, open);
      let closed = false;
      const close = (): void => {
        if (!closed) {
          closed = true;
          open -= 1;
        }
      };
      helper.on("end", close);
      helper.on("error", close);
      return helper;
    });
    return { maxOpen: () => max, calls: () => calls };
  }

  const twelveFiles = (): Array<readonly [string, Uint8Array]> =>
    Array.from({ length: 12 }, (_, i) => [`f${i}.txt`, seededBytes(20000, 30 + i)] as const);

  it("never has more than ZIP_EXTRACTION_CONCURRENCY streams open, and does use concurrency", async () => {
    const tracker = await trackStreams();
    await extractSubmissions(toArrayBuffer(await makeZip(twelveFiles())));
    expect(tracker.calls()).toBe(12);
    expect(tracker.maxOpen()).toBeGreaterThan(1);
    expect(tracker.maxOpen()).toBeLessThanOrEqual(ZIP_EXTRACTION_CONCURRENCY);
  });

  it("honours an injected concurrency limit", async () => {
    const tracker = await trackStreams();
    await extractSubmissions(toArrayBuffer(await makeZip(twelveFiles())), { limits: { concurrency: 2 } });
    expect(tracker.maxOpen()).toBe(2);
  });

  it("starts no further stream after a cap refusal", async () => {
    const tracker = await trackStreams();
    const files = twelveFiles();
    const archive = await makeZip(files);
    patchCentralDirectory(archive, "f0.txt", { uncompressed: 100 });
    const error = await rejection(
      extractSubmissions(toArrayBuffer(archive), { limits: { concurrency: 1 } })
    );
    expect(error.code).toBe("stream-overrun");
    expect(tracker.calls()).toBe(1);
  });
});

describe("I12 - deterministic archive order (scope D7)", () => {
  it("yields leaf files in entry order, then nested archives' contents in entry order", async () => {
    const nested = await makeZip([
      ["n1.txt", "one"],
      ["n2.txt", "two"],
    ]);
    const archive = await makeZip([
      ["a_report.docx", await docx("alpha")],
      ["b.txt", "bee"],
      ["c.png", seededBytes(500, 51)],
      ["d.zip", nested],
      ["e.txt", "ee"],
      ["f.docx", await docx("fox")],
    ]);
    const { submissions, rawData } = await extractSubmissions(toArrayBuffer(archive));
    const expected = [
      "a_report.docx",
      "b.txt",
      "c.png",
      "e.txt",
      "f.docx",
      "d.zip/n1.txt",
      "d.zip/n2.txt",
    ];
    expect(Object.keys(submissions)).toEqual(expected);
    expect(Object.keys(rawData)).toEqual(expected);
  });
});
