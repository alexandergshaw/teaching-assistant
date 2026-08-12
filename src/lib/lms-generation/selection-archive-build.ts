// Selection archive assembly - the impure sibling of selection-archive.ts
// (docs/lms-selection-export-download-acceptance-criteria.md). Mirrors this
// repo's established split (see announcement-package-zip.ts's own header
// comment): planSelectionArchive (selection-archive.ts) is a pure decision -
// what's included, at what path, why anything was omitted - and everything
// in THIS file is the thin, jszip/buildCommonCartridge-touching shell around
// that decision. Nothing here re-decides what goes in; it only writes bytes
// for what the plan already decided.
//
// WHY REAL BYTES TRAVEL SEPARATELY FROM THE PLAN. planSelectionArchive is
// deliberately pure (no I/O, no jszip - testable with in-memory fixtures), so
// a "binary" SelectionArchiveEntryContent only ever carries a byte COUNT
// (content.bytes, for cap-checking) - never the actual buffer. The real
// bytes this module needs to WRITE stay in a side-channel map, keyed by the
// same `key` the plan already carries, supplied by the route handler (the
// only place real bytes exist - see office-accessibility.ts's
// getCanvasFileBuffer, the sole real file-bytes function in this repo).
//
// jszip/Blob-under-Node (docs/REGRESSION.md entry 242). This file never hands
// a raw Blob to `zip.file()` on its OWN (.zip) path below - the bytes it
// receives are already a Buffer (from getCanvasFileBuffer, via the route
// handler), and a Buffer/ArrayBuffer never touches jszip's `typeof
// FileReader !== "undefined"` gate the way a Blob does. The .imscc path DOES
// have to hand buildCommonCartridge a real Blob (CartridgeWeek.files[].blob
// is typed as one) - that Blob->ArrayBuffer conversion already happens
// INSIDE buildCommonCartridge's emitContentItems (entry 242 check 1), so
// constructing `new Blob([buffer])` here and handing it in is safe without
// this file repeating that fix. Re-opening the finished cartridge Blob below
// (to inject the manifest) uses the SAME entry-242 idiom every other
// zip-reopen site in this repo uses: `await blob.arrayBuffer()` before
// `JSZip.loadAsync`, never the bare Blob.

import {
  renderArchiveManifest,
  SELECTION_ARCHIVE_MAX_ITEMS,
  type ArchiveCaps,
  type ArchiveFormat,
  type IncludedArchiveItem,
  type SelectionArchivePlan,
} from "./selection-archive";
import { buildCommonCartridge, type CartridgeWeek } from "@/lib/workflows/common-cartridge";

// ---------------------------------------------------------------------------
// Budgets (AC5) - this is the module that assembles the archive, so a new
// budget constant lives here rather than being redeclared in the route
// handler that calls it (AC5's own "any new budget constant lives in the
// module that owns budgets" rule). planSelectionArchive takes caps as a
// plain argument and hardcodes none itself (by design - see that file's own
// header comment), so SOMEWHERE has to own the real numbers; this is that
// place for THIS feature.
//
//   - maxItemBytes is set comfortably BELOW getCanvasFileBuffer's own hard
//     ceiling (fetchCanvasFile, office-accessibility.ts: any file over 15MB
//     throws "This file is too large to edit here." before this module ever
//     sees bytes for it - that already becomes an "unavailable" omission
//     upstream of planSelectionArchive). Setting maxItemBytes at or above
//     15MB would make this cap dead code for File items; setting it below
//     lets it actually fire, with its own clearer reason ("too big by
//     itself", naming this feature's own limit) rather than always losing
//     the race to the unrelated edit-tool ceiling.
//   - maxItems is sized against the 60-second Vercel Hobby ceiling this
//     route's own maxDuration comment documents: N selected items means N
//     Canvas round trips (this feature's own AC doc), fetched at the route's
//     bounded concurrency. The number itself now lives in ONE place,
//     SELECTION_ARCHIVE_MAX_ITEMS (selection-archive.ts) - imported here
//     rather than redeclared, so this cap and the client's pre-flight guard
//     (useSelectionDownload.ts, which imports the same constant) can never
//     drift apart the way two independently-declared `150`s once could.
//     Picking a single shared number is also what guarantees the browser's
//     own pre-flight approval is never second-guessed by a stricter server
//     number for a selection the instructor was already told was fine. The
//     route's own fetch concurrency (FETCH_CONCURRENCY, route.ts) is sized
//     accordingly so a full-cap selection still comfortably clears the
//     60-second Hobby ceiling.
//   - maxTotalBytes bounds the whole archive's footprint in this function's
//     own memory (a streamed .zip does not need the WHOLE thing resident at
//     once, but .imscc does - buildCommonCartridge fully materializes a
//     Blob, see buildSelectionArchive below), sized well under this
//     deployment's serverless function memory rather than picked arbitrarily
//     large.
export const ARCHIVE_CAPS: ArchiveCaps = {
  maxItems: SELECTION_ARCHIVE_MAX_ITEMS,
  maxItemBytes: 10 * 1024 * 1024,
  maxTotalBytes: 100 * 1024 * 1024,
};

/** Real bytes for one included BINARY item, keyed by its selection `key` -
 * see this file's header comment for why the plan itself never carries
 * these. */
export type ArchiveBinaryPayloads = ReadonlyMap<string, Buffer>;

function binaryPayloadFor(item: IncludedArchiveItem, payloads: ArchiveBinaryPayloads): Buffer {
  const buffer = payloads.get(item.key);
  if (!buffer) {
    // The plan and the payload map are built from the SAME fetch pass (the
    // route handler) - a missing payload here means the two fell out of
    // sync, which is an upstream bug this function cannot paper over by
    // silently writing an empty/corrupt file into the archive.
    throw new Error(`No fetched bytes recorded for "${item.title}" (${item.key}).`);
  }
  return buffer;
}

/** The included item's own text, for the (html-kind) branches below. An
 * IncludedArchiveItem's content is NEVER actually "unavailable" -
 * planSelectionArchive routes every "unavailable" candidate into `omitted`
 * before an IncludedArchiveItem is ever constructed (selection-archive.ts) -
 * but TypeScript's structural type for `.content` does not encode that
 * runtime guarantee, so this throws rather than silently coercing a
 * theoretical "unavailable" into an empty string. */
function textContentFor(item: IncludedArchiveItem): string {
  if (item.content.kind === "html") return item.content.html;
  throw new Error(`Expected text content for "${item.title}" (${item.key}), got "${item.content.kind}".`);
}

const MANIFEST_PATH = "manifest.txt";

// ---------------------------------------------------------------------------
// .zip (plain folder archive) - pure entry list
// ---------------------------------------------------------------------------

/** One file this archive will contain, before jszip ever sees it - a plain
 * {path, data} pair, mirroring buildAnnouncementZipEntries' own shape
 * (announcement-package-zip.ts) so this half stays testable the same way:
 * no jszip, no network, frozen-literal assertions. */
export interface SelectionZipEntry {
  path: string;
  data: string | Buffer;
}

/**
 * Pure entry list for the .zip format: the manifest plus every included
 * item at its planned path (assignArchivePaths, selection-archive.ts, has
 * already guaranteed each path is Windows-safe, unique within the plan, and
 * cannot escape the archive root). Omitted items contribute no file - they
 * exist only in the manifest's own "Omitted items" section (AC4).
 */
export function buildSelectionZipEntries(
  plan: SelectionArchivePlan,
  manifestText: string,
  binaryPayloads: ArchiveBinaryPayloads
): SelectionZipEntry[] {
  const entries: SelectionZipEntry[] = [{ path: MANIFEST_PATH, data: manifestText }];
  for (const item of plan.included) {
    const data = item.content.kind === "binary" ? binaryPayloadFor(item, binaryPayloads) : textContentFor(item);
    entries.push({ path: item.path, data });
  }
  return entries;
}

// ---------------------------------------------------------------------------
// .imscc (Common Cartridge) - groups the plan into CartridgeWeek[]
// ---------------------------------------------------------------------------

/**
 * Groups plan.included into CartridgeWeek[] keyed by module, in the order
 * modules first appear among included items - buildCommonCartridge treats
 * each CartridgeWeek as one course folder/module (see that file's own header
 * comment). Only Page/Assignment/File/Announcement items ever reach this
 * function: for format:"imscc", planSelectionArchive has already omitted
 * every other type (CARTRIDGE_SLOT_TYPES, selection-archive.ts) - so the
 * branch below has no "included but unrecognised" case to handle by
 * construction, not by luck. Points/due dates are not part of what this
 * archive's plan carries at all (IncludedArchiveItem has no such fields -
 * AC3 promises the item's CONTENT, not its Canvas scheduling metadata), so
 * every re-packaged assignment lands at 0 points with no due date, same as a
 * fresh manual entry would.
 */
export function planToCartridgeWeeks(plan: SelectionArchivePlan, binaryPayloads: ArchiveBinaryPayloads): CartridgeWeek[] {
  const order: string[] = [];
  const weeksByModule = new Map<string, CartridgeWeek>();

  for (const item of plan.included) {
    let week = weeksByModule.get(item.moduleId);
    if (!week) {
      week = { week: order.length + 1, title: item.moduleLabel, files: [], pages: [], assignments: [] };
      weeksByModule.set(item.moduleId, week);
      order.push(item.moduleId);
    }

    if (item.type === "Page" && item.content.kind === "html") {
      week.pages.push({ title: item.title, html: item.content.html });
    } else if (item.type === "Assignment" && item.content.kind === "html") {
      week.assignments.push({ title: item.title, html: item.content.html, points: 0 });
    } else if (item.type === "File" && item.content.kind === "binary") {
      const buffer = binaryPayloadFor(item, binaryPayloads);
      // Blob's constructor type wants a plain ArrayBuffer-backed
      // ArrayBufferView, not Node's `Buffer<ArrayBufferLike>` generic (which
      // also admits a SharedArrayBuffer backing) - wrapping in a fresh
      // Uint8Array satisfies that without copying semantics changing (jszip/
      // buildCommonCartridge only ever reads these bytes, never mutates
      // them).
      const bytes = new Uint8Array(buffer);
      week.files.push({ name: item.content.fileName, blob: new Blob([bytes], { type: item.content.mimeType }) });
    } else if (item.type === "Announcement" && item.content.kind === "html") {
      week.announcements = week.announcements ?? [];
      week.announcements.push({ title: item.title, html: item.content.html });
    }
    // Anything else is unreachable here for format:"imscc" (see this
    // function's own comment) - skipped rather than thrown, so a future
    // planner defect degrades to "one fewer item in the cartridge" instead
    // of failing the whole build.
  }

  return order.map((moduleId) => weeksByModule.get(moduleId)!);
}

// ---------------------------------------------------------------------------
// Assembly (impure - the only place jszip/buildCommonCartridge are called)
// ---------------------------------------------------------------------------

/** Either a genuine byte stream (the .zip path - jszip can emit one as it
 * compresses, so this route never has to hold the whole archive in memory to
 * serve the first byte) or a finished Blob (the .imscc path -
 * buildCommonCartridge has no streaming API of its own; see this file's
 * header comment and the route handler's own note on what streaming this
 * feature can and cannot actually get). */
export type SelectionArchiveOutput = { kind: "stream"; stream: NodeJS.ReadableStream } | { kind: "blob"; blob: Blob };

/**
 * Builds the archive for a finished SelectionArchivePlan. Always renders the
 * manifest itself (renderArchiveManifest, selection-archive.ts) so there is
 * one call site for it, matching AC4's "every archive contains a manifest"
 * for BOTH formats - callers never construct manifest text separately.
 */
export async function buildSelectionArchive(
  plan: SelectionArchivePlan,
  format: ArchiveFormat,
  courseName: string,
  binaryPayloads: ArchiveBinaryPayloads
): Promise<SelectionArchiveOutput> {
  const manifestText = renderArchiveManifest(plan, { courseName, format });

  if (format === "zip") {
    const entries = buildSelectionZipEntries(plan, manifestText, binaryPayloads);
    const { default: JSZip } = await import("jszip");
    const zip = new JSZip();
    for (const entry of entries) zip.file(entry.path, entry.data);
    // streamFiles:true lets jszip start emitting compressed bytes for
    // earlier files before later ones finish compressing, instead of
    // buffering the whole archive in memory before the first byte leaves
    // this function - the actual streaming mechanism the route handler's
    // Response relies on.
    const stream = zip.generateNodeStream({ type: "nodebuffer", streamFiles: true });
    return { kind: "stream", stream };
  }

  // .imscc: buildCommonCartridge has no streaming output at all - it always
  // fully materializes a Blob via `zip.generateAsync({type:"blob"})" (see
  // that file). This function cannot make that generation itself streaming
  // without editing common-cartridge.ts, which is out of scope for this
  // feature - see the route handler's own note on this limitation. What it
  // CAN avoid is a second, redundant in-memory copy: the manifest is added
  // by re-opening the already-finished Blob (the same "convert via
  // .arrayBuffer() before JSZip.loadAsync" idiom REGRESSION entry 242 fixed
  // at zip-run-log-completion.ts's read site), and the route hands the
  // resulting Blob straight to `Response` rather than buffering it again.
  const weeks = planToCartridgeWeeks(plan, binaryPayloads);
  const cartridgeBlob = await buildCommonCartridge(courseName, weeks);

  const { default: JSZip } = await import("jszip");
  const reopened = await JSZip.loadAsync(await cartridgeBlob.arrayBuffer());
  reopened.file(MANIFEST_PATH, manifestText);
  const blob = await reopened.generateAsync({ type: "blob" });
  return { kind: "blob", blob };
}
