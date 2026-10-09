import type JSZip from "jszip";
import { formatMB } from "./upload-budget";

/**
 * Zip-bomb caps for server-side archive extraction (ZIP-BOMB-CAPS W1,
 * docs/zip-bomb-caps-scope.md). Three layers, all in this leaf so the owner
 * tunes by editing ONE file:
 *
 *  1. A plan pass (`chargeArchiveLevel`) that refuses from the archive's own
 *     DECLARED sizes before any member is decompressed, against ONE budget
 *     shared by every nesting level.
 *  2. A bounded reader (`readMemberBounded`) that stops decompressing the
 *     moment a member outgrows its declared size (a header can lie low), via
 *     jszip's internalStream + pause. It FAILS CLOSED: if the stream API is
 *     missing or a size is unreadable it refuses, never falling back to an
 *     unbounded read.
 *  3. A fail-fast bounded worker pool (`runBounded`).
 *
 * Every cap refusal is a `ZipCapError` whose message starts with
 * ZIP_REFUSAL_PREFIX: grading-incremental.ts routes a message with that prefix
 * to a dead-end "refused" mode, and any other message to a whole-run fallback
 * that would re-extract the bomb.
 *
 * Imports only the TYPE of jszip and formatMB; nothing here reaches
 * lib/supabase or any server-only module.
 */

/** Must equal REFUSAL_MESSAGE_PREFIX in src/app/actions/grading-incremental.ts. */
export const ZIP_REFUSAL_PREFIX = "Refused: ";

// Starting defaults from ONE machine / ONE node version / ONE synthetic bomb
// (scope section 3, M3-M5); not tuned against the owner's real 13 MB zip.
/** Entries across the archive and everything nested in it (dirs included). */
export const ZIP_MAX_CUMULATIVE_ENTRIES = 1000;
/** Summed declared size of every member that will be decompressed. */
export const ZIP_MAX_CUMULATIVE_DECLARED_BYTES = 100 * 1024 * 1024;
/** Declared size of any single decompressed member. */
export const ZIP_MAX_MEMBER_DECLARED_BYTES = 40 * 1024 * 1024;
/** Below this a compression ratio is noise (small text compresses 5-10x). */
export const ZIP_RATIO_FLOOR_BYTES = 1024 * 1024;
export const ZIP_MAX_MEMBER_RATIO = 100;
export const ZIP_MAX_ARCHIVE_RATIO = 100;
/** Leaf members read at once. */
export const ZIP_EXTRACTION_CONCURRENCY = 4;
/** Student-controlled entry names are truncated to this in an error message. */
export const ZIP_ERROR_NAME_MAX_CHARS = 120;

export interface ZipLimits {
  readonly entries: number;
  readonly cumulativeBytes: number;
  readonly maxMemberDeclaredBytes: number;
  readonly ratioFloorBytes: number;
  readonly maxMemberRatio: number;
  readonly maxArchiveRatio: number;
  readonly concurrency: number;
}

export const DEFAULT_ZIP_LIMITS: ZipLimits = {
  entries: ZIP_MAX_CUMULATIVE_ENTRIES,
  cumulativeBytes: ZIP_MAX_CUMULATIVE_DECLARED_BYTES,
  maxMemberDeclaredBytes: ZIP_MAX_MEMBER_DECLARED_BYTES,
  ratioFloorBytes: ZIP_RATIO_FLOOR_BYTES,
  maxMemberRatio: ZIP_MAX_MEMBER_RATIO,
  maxArchiveRatio: ZIP_MAX_ARCHIVE_RATIO,
  concurrency: ZIP_EXTRACTION_CONCURRENCY,
};

/** The one shared accumulator, threaded through every nesting level. */
export interface ZipBudget {
  readonly limits: ZipLimits;
  entryCount: number;
  declaredBytes: number;
  compressedBytes: number;
}

export function createZipBudget(overrides?: Partial<ZipLimits>): ZipBudget {
  return {
    limits: { ...DEFAULT_ZIP_LIMITS, ...overrides },
    entryCount: 0,
    declaredBytes: 0,
    compressedBytes: 0,
  };
}

export type ZipCapCode =
  | "entry-count"
  | "cumulative-bytes"
  | "member-bytes"
  | "member-ratio"
  | "archive-ratio"
  | "stream-overrun"
  | "unverifiable-size";

export interface ZipCapDetail {
  readonly code: ZipCapCode;
  readonly entryName: string;
  readonly chain: readonly string[];
  /** The constant's name, so the message says which knob to turn. */
  readonly limitName: string;
  readonly limitValue: number;
  readonly limitIsBytes: boolean;
  readonly observed?: number;
  readonly observedBytes?: number;
}

/** Entry names are student-controlled: drop control characters, cap the length. */
function sanitizeEntryName(name: string): string {
  let cleaned = "";
  for (const ch of name) {
    const code = ch.charCodeAt(0);
    cleaned += code < 32 || code === 127 ? "?" : ch;
  }
  return cleaned.length > ZIP_ERROR_NAME_MAX_CHARS
    ? `${cleaned.slice(0, ZIP_ERROR_NAME_MAX_CHARS)}...`
    : cleaned;
}

function describeLimit(detail: ZipCapDetail): string {
  return detail.limitIsBytes ? formatMB(detail.limitValue) : String(detail.limitValue);
}

function reasonClause(detail: ZipCapDetail): string {
  const observedMB = detail.observed === undefined ? "" : formatMB(detail.observed);
  switch (detail.code) {
    case "entry-count":
      return `pushes the archive past the maximum number of entries (counted across the archive and every archive inside it)`;
    case "member-bytes":
      return `declares ${observedMB} uncompressed, over the per-file limit`;
    case "cumulative-bytes":
      return `brings the total uncompressed size to ${observedMB}, over the archive limit`;
    case "member-ratio":
      return `is compressed ${detail.observed}:1, which looks like a zip bomb`;
    case "archive-ratio":
      return `brings the archive's overall compression to ${detail.observed}:1, which looks like a zip bomb`;
    case "stream-overrun":
      return `holds more data than its header declares, so it was not read`;
    case "unverifiable-size":
      return `has no readable size in its header, so it could not be checked and was not read`;
  }
}

export class ZipCapError extends Error {
  readonly code: ZipCapCode;
  readonly entryName: string;
  readonly chain: readonly string[];
  readonly limitName: string;
  readonly limitValue: number;
  readonly observed?: number;
  readonly observedBytes?: number;

  constructor(detail: ZipCapDetail) {
    super(
      `${ZIP_REFUSAL_PREFIX}"${sanitizeEntryName(detail.entryName)}" ${reasonClause(detail)}. ` +
        `Limit: ${detail.limitName} (${describeLimit(detail)}). Nothing was graded. ` +
        `Remove or shrink that file, or split the archive into smaller parts, then upload again.`
    );
    this.name = "ZipCapError";
    this.code = detail.code;
    this.entryName = detail.entryName;
    this.chain = detail.chain;
    this.limitName = detail.limitName;
    this.limitValue = detail.limitValue;
    this.observed = detail.observed;
    this.observedBytes = detail.observedBytes;
  }
}

/**
 * jszip keeps each entry's parsed central-directory record on `_data` and
 * exposes `internalStream`, neither of which is in index.d.ts. Typed loosely
 * and locally (the same idiom as submission-archive-sniff.ts), but unlike that
 * file a missing size is a REFUSAL here, never `?? 0`.
 */
interface BoundedStream {
  on(event: "data", handler: (chunk: Uint8Array) => void): unknown;
  on(event: "end", handler: () => void): unknown;
  on(event: "error", handler: (error: Error) => void): unknown;
  pause(): unknown;
  resume(): unknown;
}

interface ZipEntryInternals {
  _data?: { uncompressedSize?: unknown; compressedSize?: unknown };
  internalStream?: (type: "nodebuffer") => BoundedStream;
}

function isUsableSize(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value) && value >= 0;
}

/** The unreadable-size refusal, shared by the plan pass and the reader. */
function unverifiable(entryName: string, chain: readonly string[], limits: ZipLimits): ZipCapError {
  return new ZipCapError({
    code: "unverifiable-size",
    entryName,
    chain,
    limitName: "ZIP_MAX_MEMBER_DECLARED_BYTES",
    limitValue: limits.maxMemberDeclaredBytes,
    limitIsBytes: true,
  });
}

/** Declared (uncompressed) and compressed sizes from the central directory. FAILS CLOSED. */
export function declaredSizesOf(
  entry: JSZip.JSZipObject,
  entryName: string,
  chain: readonly string[] = [],
  limits: ZipLimits = DEFAULT_ZIP_LIMITS
): { declared: number; compressed: number } {
  const data = (entry as unknown as ZipEntryInternals)._data;
  if (!data || !isUsableSize(data.uncompressedSize) || !isUsableSize(data.compressedSize)) {
    throw unverifiable(entryName, chain, limits);
  }
  return { declared: data.uncompressedSize, compressed: data.compressedSize };
}

export type ZipMemberKind = "nested" | "leaf" | "skip";

export interface PlannedZipMember {
  readonly name: string;
  readonly fullName: string;
  readonly entry: JSZip.JSZipObject;
  readonly kind: "nested" | "leaf";
  readonly declared: number;
}

/**
 * The plan pass for ONE archive level: a SYNCHRONOUS walk in archive order that
 * charges the shared budget from declared sizes and throws on the first
 * violation, before any member is decompressed. Every entry counts toward the
 * entry cap (directories and extension-skipped files included); only members
 * the caller will actually decompress ("nested" or "leaf") are charged bytes.
 */
export function chargeArchiveLevel(
  zip: JSZip,
  budget: ZipBudget,
  ctx: {
    readonly parentPath: string;
    readonly chain: readonly string[];
    readonly classify: (name: string) => ZipMemberKind;
  }
): PlannedZipMember[] {
  const { limits } = budget;
  const planned: PlannedZipMember[] = [];

  for (const [name, entry] of Object.entries(zip.files)) {
    const fullName = ctx.parentPath ? `${ctx.parentPath}/${name}` : name;

    budget.entryCount += 1;
    if (budget.entryCount > limits.entries) {
      throw new ZipCapError({
        code: "entry-count",
        entryName: fullName,
        chain: ctx.chain,
        limitName: "ZIP_MAX_CUMULATIVE_ENTRIES",
        limitValue: limits.entries,
        limitIsBytes: false,
        observed: budget.entryCount,
      });
    }

    if (entry.dir) continue;
    const kind = ctx.classify(name);
    if (kind === "skip") continue;

    const { declared, compressed } = declaredSizesOf(entry, fullName, ctx.chain, limits);

    if (declared > limits.maxMemberDeclaredBytes) {
      throw new ZipCapError({
        code: "member-bytes",
        entryName: fullName,
        chain: ctx.chain,
        limitName: "ZIP_MAX_MEMBER_DECLARED_BYTES",
        limitValue: limits.maxMemberDeclaredBytes,
        limitIsBytes: true,
        observed: declared,
      });
    }

    budget.declaredBytes += declared;
    budget.compressedBytes += compressed;
    if (budget.declaredBytes > limits.cumulativeBytes) {
      throw new ZipCapError({
        code: "cumulative-bytes",
        entryName: fullName,
        chain: ctx.chain,
        limitName: "ZIP_MAX_CUMULATIVE_DECLARED_BYTES",
        limitValue: limits.cumulativeBytes,
        limitIsBytes: true,
        observed: budget.declaredBytes,
      });
    }

    if (declared >= limits.ratioFloorBytes) {
      const memberRatio = Math.round(declared / Math.max(compressed, 1));
      if (memberRatio > limits.maxMemberRatio) {
        throw new ZipCapError({
          code: "member-ratio",
          entryName: fullName,
          chain: ctx.chain,
          limitName: "ZIP_MAX_MEMBER_RATIO",
          limitValue: limits.maxMemberRatio,
          limitIsBytes: false,
          observed: memberRatio,
        });
      }
    }

    if (budget.declaredBytes >= limits.ratioFloorBytes) {
      const archiveRatio = Math.round(budget.declaredBytes / Math.max(budget.compressedBytes, 1));
      if (archiveRatio > limits.maxArchiveRatio) {
        throw new ZipCapError({
          code: "archive-ratio",
          entryName: fullName,
          chain: ctx.chain,
          limitName: "ZIP_MAX_ARCHIVE_RATIO",
          limitValue: limits.maxArchiveRatio,
          limitIsBytes: false,
          observed: archiveRatio,
        });
      }
    }

    planned.push({ name, fullName, entry, kind, declared });
  }

  return planned;
}

/**
 * Read one member into a Buffer, never holding more than `declared` bytes and
 * stopping the decompression as soon as the data outgrows it. The Buffer is
 * allocated with allocUnsafeSlow (non-pooled: a pooled Buffer's `.buffer` is a
 * shared 8 KB slab, extraction.test.ts:220-226) and is only returned fully
 * written. A plain Error (jszip's own size mismatch, a corrupt member) is a
 * corrupt-member failure, NOT a cap error.
 */
export function readMemberBounded(
  entry: JSZip.JSZipObject,
  declared: number,
  entryName: string,
  chain: readonly string[] = [],
  limits: ZipLimits = DEFAULT_ZIP_LIMITS
): Promise<Buffer> {
  const internals = entry as unknown as ZipEntryInternals;
  if (typeof internals.internalStream !== "function") {
    return Promise.reject(unverifiable(entryName, chain, limits));
  }
  if (!isUsableSize(declared)) {
    return Promise.reject(unverifiable(entryName, chain, limits));
  }

  return new Promise<Buffer>((resolve, reject) => {
    const out = Buffer.allocUnsafeSlow(declared);
    let filled = 0;
    let settled = false;
    const stream = (internals.internalStream as (type: "nodebuffer") => BoundedStream).call(
      entry,
      "nodebuffer"
    );

    stream.on("data", (chunk) => {
      // After a refusal the producer keeps delivering the rest of its current
      // burst (up to ~1000 calls); ignore it without storing anything.
      if (settled) return;
      if (filled + chunk.length > declared) {
        settled = true;
        stream.pause();
        reject(
          new ZipCapError({
            code: "stream-overrun",
            entryName,
            chain,
            limitName: "ZIP_MAX_MEMBER_DECLARED_BYTES",
            limitValue: declared,
            limitIsBytes: true,
            observed: declared,
            observedBytes: filled + chunk.length,
          })
        );
        return;
      }
      out.set(chunk, filled);
      filled += chunk.length;
    });
    stream.on("end", () => {
      if (settled) return;
      settled = true;
      if (filled !== declared) {
        reject(new Error(`Corrupt member "${entryName}": read ${filled} of ${declared} declared bytes`));
        return;
      }
      resolve(out);
    });
    stream.on("error", (error) => {
      if (settled) return;
      settled = true;
      reject(error);
    });
    stream.resume();
  });
}

/** Entries in one Office container (a deck legitimately has hundreds). */
export const OFFICE_MAX_ENTRIES = 2000;
/** Summed declared size of every member of one Office container. */
export const OFFICE_MAX_ARCHIVE_DECLARED_BYTES = 100 * 1024 * 1024;

/**
 * Container pre-flight for an Office file (ZIP-BOMB-CAPS W2, scope D8). A
 * SYNCHRONOUS walk over EVERY member, from declared sizes only, before anything
 * is decompressed: entry count, per-member declared size and ratio, and the
 * container's total declared size. Applied to all members because the fallback
 * parser decides for itself what it reads. Not charged to the shared budget.
 * FAILS CLOSED on an unreadable size (declaredSizesOf throws).
 */
export function assertContainerWithinCaps(
  zip: JSZip,
  containerName: string,
  chain: readonly string[] = [],
  limits: ZipLimits = DEFAULT_ZIP_LIMITS,
  container: { readonly maxEntries: number; readonly maxDeclaredBytes: number } = {
    maxEntries: OFFICE_MAX_ENTRIES,
    maxDeclaredBytes: OFFICE_MAX_ARCHIVE_DECLARED_BYTES,
  }
): void {
  let count = 0;
  let total = 0;
  for (const [name, entry] of Object.entries(zip.files)) {
    const fullName = `${containerName}/${name}`;
    count += 1;
    if (count > container.maxEntries) {
      throw new ZipCapError({
        code: "entry-count",
        entryName: fullName,
        chain,
        limitName: "OFFICE_MAX_ENTRIES",
        limitValue: container.maxEntries,
        limitIsBytes: false,
        observed: count,
      });
    }
    if (entry.dir) continue;

    const { declared, compressed } = declaredSizesOf(entry, fullName, chain, limits);
    if (declared > limits.maxMemberDeclaredBytes) {
      throw new ZipCapError({
        code: "member-bytes",
        entryName: fullName,
        chain,
        limitName: "ZIP_MAX_MEMBER_DECLARED_BYTES",
        limitValue: limits.maxMemberDeclaredBytes,
        limitIsBytes: true,
        observed: declared,
      });
    }
    if (declared >= limits.ratioFloorBytes) {
      const ratio = Math.round(declared / Math.max(compressed, 1));
      if (ratio > limits.maxMemberRatio) {
        throw new ZipCapError({
          code: "member-ratio",
          entryName: fullName,
          chain,
          limitName: "ZIP_MAX_MEMBER_RATIO",
          limitValue: limits.maxMemberRatio,
          limitIsBytes: false,
          observed: ratio,
        });
      }
    }
    total += declared;
    if (total > container.maxDeclaredBytes) {
      throw new ZipCapError({
        code: "cumulative-bytes",
        entryName: fullName,
        chain,
        limitName: "OFFICE_MAX_ARCHIVE_DECLARED_BYTES",
        limitValue: container.maxDeclaredBytes,
        limitIsBytes: true,
        observed: total,
      });
    }
  }
}

/**
 * Read one Office member through the bounded reader, charging its declared
 * bytes to `budget` (the shared archive budget when the caller supplied one) so
 * many Office files in one archive cannot multiply the cap.
 */
export async function readOfficeMember(
  entry: JSZip.JSZipObject,
  entryName: string,
  budget: ZipBudget,
  chain: readonly string[] = []
): Promise<Buffer> {
  const { limits } = budget;
  const { declared } = declaredSizesOf(entry, entryName, chain, limits);
  if (declared > limits.maxMemberDeclaredBytes) {
    throw new ZipCapError({
      code: "member-bytes",
      entryName,
      chain,
      limitName: "ZIP_MAX_MEMBER_DECLARED_BYTES",
      limitValue: limits.maxMemberDeclaredBytes,
      limitIsBytes: true,
      observed: declared,
    });
  }
  budget.declaredBytes += declared;
  if (budget.declaredBytes > limits.cumulativeBytes) {
    throw new ZipCapError({
      code: "cumulative-bytes",
      entryName,
      chain,
      limitName: "ZIP_MAX_CUMULATIVE_DECLARED_BYTES",
      limitValue: limits.cumulativeBytes,
      limitIsBytes: true,
      observed: budget.declaredBytes,
    });
  }
  return readMemberBounded(entry, declared, entryName, chain, limits);
}

/**
 * Pre-parse byte gate for a single in-memory file handed to OfficeParser
 * (pdf/rtf and the other formats it parses itself). OfficeParser 7.0.3 has no
 * size hook, so the only available hardening is to refuse an oversize buffer
 * BEFORE the parse. Reuses ZIP_MAX_MEMBER_DECLARED_BYTES (DECOMPRESS-CAP-HARDENING W3).
 */
export function assertBytesWithinMemberCap(
  byteLength: number,
  name: string,
  limits: ZipLimits = DEFAULT_ZIP_LIMITS
): void {
  if (byteLength > limits.maxMemberDeclaredBytes) {
    throw new ZipCapError({
      code: "member-bytes",
      entryName: name,
      chain: [],
      limitName: "ZIP_MAX_MEMBER_DECLARED_BYTES",
      limitValue: limits.maxMemberDeclaredBytes,
      limitIsBytes: true,
      observed: byteLength,
    });
  }
}

/**
 * Run `fn` over `items` with at most `limit` in flight, FAIL-FAST: after the
 * first rejection no queued item starts, in-flight ones are awaited, and the
 * first error is thrown. (A fifth copy of a worker pool on purpose: importing
 * mapWithConcurrency from shared.ts would invert the layer, scope 2.2.)
 */
export async function runBounded<T>(
  items: readonly T[],
  limit: number,
  fn: (item: T, index: number) => Promise<void>
): Promise<void> {
  let next = 0;
  let aborted = false;
  let failed = false;
  let firstError: unknown;

  async function worker(): Promise<void> {
    while (!aborted) {
      const index = next;
      next += 1;
      if (index >= items.length) return;
      try {
        await fn(items[index], index);
      } catch (error) {
        if (!failed) {
          failed = true;
          firstError = error;
        }
        aborted = true;
        return;
      }
    }
  }

  const workerCount = Math.max(1, Math.min(limit, items.length));
  await Promise.all(Array.from({ length: workerCount }, () => worker()));
  if (failed) throw firstError;
}
