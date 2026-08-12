// Selection archive planning - the pure core for
// docs/lms-selection-export-download-acceptance-criteria.md.
//
// This module owns EVERYTHING testable about "download a course export
// and/or a plain zip of just the selected modules/items": which items make
// it in, why an item was left out, what path it lands at, and the manifest
// text that reports both. It touches no network, no filesystem, no jszip,
// no React and no Date.now() - every decision is a function of its
// arguments, so the whole surface can be pinned with in-memory fixtures
// (selection-archive.test.ts) with no I/O to fake. Assembling the actual
// .imscc/.zip bytes from a plan is a LATER work item and belongs in an
// impure sibling file, the way announcement-package-zip.ts splits its pure
// entry-builder from buildAnnouncementZip's JSZip shell (see that file's
// header comment) - this file is the "pure core" half of that pattern.
//
// CLASSIFICATION IS AN ALLOWLIST, NOT A DENYLIST. Per the AC's own reuse
// survey (verified against src/lib/workflows/common-cartridge.ts as it
// stands): a Common Cartridge only has native slots for Page, Assignment,
// File and Announcement items. Neither CanvasModuleItem.type nor
// CartridgeModuleItem.type is a TypeScript union - both are bare `string` -
// so nothing stops a type this app has never seen from arriving here. A
// denylist of "known bad" types would silently swallow that unknown type
// into a cartridge with no slot for it (the exact defect this suite's
// header records an earlier version shipping). An allowlist of "known good"
// types instead makes "I don't recognise this" and "this has no cartridge
// slot" the SAME code path by construction: anything not in
// CARTRIDGE_SLOT_TYPES is omitted, with a reason, full stop. A plain .zip
// has no such restriction - it is a folder, and a folder can hold anything
// with actual content - so the allowlist only applies when format is
// "imscc".
//
// THE TWO BYTE CAPS ARE CHECKED INDEPENDENTLY, IN A FIXED ORDER, AND NEVER
// SHARE A NUMBER. `maxItemBytes` asks "is this one item too big on its
// own?" - a fact about the item alone, checked first. `maxTotalBytes` asks
// "does the running total so far leave room for this item?" - a fact about
// the archive's accumulated state, checked second and only once the item
// has already cleared the per-item cap. An item that fails the first check
// never touches the running total (it was never going to be included
// regardless of what came before it); an item that fails the second check
// was small enough by itself but arrived after the budget was already
// spent. Those are different failures for a downloading instructor to
// understand ("this one file is just too big" vs. "this would have fit
// earlier, but not after everything ahead of it"), so their reasons read
// differently on purpose, not just as an implementation accident.
import { sanitizeFilenamePart } from "./artifact-download";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type ArchiveFormat = "imscc" | "zip";

/** The two independent byte caps plus the item-count cap. All three are
 * caller-supplied (never hardcoded here) so the module that actually owns
 * download budgets can define the real numbers in one place - this file
 * only knows how to ENFORCE a set of caps, not what they should be. */
export interface ArchiveCaps {
  /** Refuse the whole archive outright above this many selected items - the
   * one cap that is knowable before any fetch happens. */
  maxItems: number;
  /** An item whose own content exceeds this many bytes is omitted for being
   * too big by itself, independent of everything else selected. */
  maxItemBytes: number;
  /** An item that would push the running included total past this many
   * bytes is omitted for not fitting in what is left, independent of its
   * own size (it already cleared maxItemBytes). */
  maxTotalBytes: number;
}

/** The item-count cap's one real number (AC5: "Any new budget constant
 * lives in the module that owns budgets rather than being redeclared
 * locally"). Two independently-written halves of this feature - the
 * client's pre-flight guard (useSelectionDownload.ts) and the route's own
 * ArchiveCaps (selection-archive-build.ts) - previously each declared their
 * own literal `150` with nothing keeping the two equal. This module is the
 * natural single owner: it is pure and dependency-free (see this file's own
 * header comment - no network, no filesystem, no React), so a CLIENT hook
 * can import a value from it exactly as safely as a server-only route
 * handler can. Both now import THIS constant rather than each declaring
 * their own copy. */
export const SELECTION_ARCHIVE_MAX_ITEMS = 150;

/** An entry's actual content, or the reason it has none. `unavailable`
 * covers every upstream fetch failure (403, 404, timeout, ...) - the caller
 * that gathers entries is expected to catch its own fetch errors and hand
 * this module an `unavailable` entry rather than throwing, which is what
 * lets ONE item's failure become an omission instead of losing the archive
 * (AC6; see planSelectionArchive's unavailable handling below). */
export type SelectionArchiveEntryContent =
  | { kind: "html"; html: string }
  | { kind: "binary"; bytes: number; mimeType: string; fileName: string }
  | { kind: "unavailable"; reason: string };

/** One selected module item, already resolved to its content (or the lack
 * of it) by the caller. This module never fetches anything itself - it only
 * decides, given content that already exists, what happens to it. */
export interface SelectionArchiveEntry {
  /** Stable identity for this selection, e.g. "live:<moduleId>:<itemId>" or
   * "export:<moduleId>:<itemId>" - carried straight through to both the
   * included and omitted buckets so a caller can always reconcile a plan
   * against the selection that produced it. */
  key: string;
  title: string;
  /** Canvas's own item type string (Page, Assignment, Quiz, Discussion,
   * File, SubHeader, ExternalUrl, ExternalTool, Announcement, ...) or
   * anything else Canvas ever adds - deliberately NOT a union; see this
   * file's header comment on why classification is an allowlist. */
  type: string;
  /** Whether this entry came from a live Canvas course or a previously
   * stored export/cartridge (AC12) - a live selection can target either
   * format, an export-sourced selection can only ever produce a .zip. */
  source: "live" | "export";
  moduleId: string;
  moduleLabel: string;
  content: SelectionArchiveEntryContent;
}

/** An entry that made it into the archive, with everything the (later,
 * impure) assembly step needs to actually write it: its own content,
 * carried straight through, and the path it should be written at. */
export interface IncludedArchiveItem {
  key: string;
  title: string;
  type: string;
  source: "live" | "export";
  moduleId: string;
  moduleLabel: string;
  content: SelectionArchiveEntryContent;
  /** Size in bytes this item counted against the caps - 0 for "unavailable"
   * content, which is never included (see planSelectionArchive). */
  bytes: number;
  /** Forward-slash-separated, Windows-safe, unique within the plan, and
   * never able to escape the archive root - see assignArchivePaths below. */
  path: string;
}

/** An entry that did NOT make it in, and the one reason why. Every entry
 * handed to planSelectionArchive ends up in exactly one of included/omitted
 * (AC4) - there is no third, silent outcome. */
export interface OmittedArchiveItem {
  key: string;
  title: string;
  reason: string;
}

export interface SelectionArchivePlan {
  included: IncludedArchiveItem[];
  omitted: OmittedArchiveItem[];
}

/** planSelectionArchive's return type: a plan, or a whole-archive refusal.
 * Refusal is reserved for the two things that make a PARTIAL archive
 * meaningless rather than merely smaller - too many items to reason about
 * (AC5) and export-sourced content that would silently misreport itself as
 * complete in a cartridge (AC12). Everything else that goes wrong with an
 * individual item is an omission, never a refusal (AC6). */
export type SelectionArchivePlanResult = SelectionArchivePlan | { error: string };

// ---------------------------------------------------------------------------
// Classification
// ---------------------------------------------------------------------------

/** The ONLY item types a Common Cartridge (.imscc) has a native slot for,
 * verified against src/lib/workflows/common-cartridge.ts. This is an
 * allowlist, not a denylist - see this file's header comment for why that
 * distinction is load-bearing: it is what makes an unrecognised type
 * default to omitted rather than silently falling through as "included as
 * nothing". A plain .zip never consults this set (it has no format
 * restrictions). */
const CARTRIDGE_SLOT_TYPES: ReadonlySet<string> = new Set(["Page", "Assignment", "File", "Announcement"]);

function unsupportedTypeReason(type: string): string {
  return (
    `${type} items have no slot in a Common Cartridge (.imscc) - the cartridge writer only packages Page, ` +
    `Assignment, File and Announcement items. Download the .zip instead to include this item.`
  );
}

function unavailableReason(upstreamReason: string): string {
  return `This item could not be fetched: ${upstreamReason}`;
}

// CORRECTED (docs/lms-selection-export-download-acceptance-criteria.md,
// AC12): the .zip does NOT copy the export's original files - that would
// require resource-href mapping into the stored cartridge byte-for-byte, a
// separate mechanism this slice deliberately does not build (see the AC's
// own Limits section). The .zip carries the export's text exactly as it was
// already parsed (tag-stripped, truncated at MAX_CARTRIDGE_ITEM_BODY_CHARS -
// see cartridge-import-shared.ts), which is why every export-sourced
// included item is flagged as reduced fidelity in the manifest below
// (renderArchiveManifest) rather than presented as a complete copy.
const EXPORT_SOURCE_IMSCC_REFUSAL =
  "This selection includes content loaded from a stored export. An export's text is already trimmed and " +
  "stripped of markup when it was first parsed, so repackaging it into a Common Cartridge (.imscc) would " +
  "produce truncated stub content that this archive's own manifest would wrongly report as complete. " +
  "Download the .zip instead, which carries the export's text as it was stored, flagged in the manifest as " +
  "reduced fidelity.";

function itemCountRefusalReason(count: number, maxItems: number): string {
  return (
    `This selection has ${count} items, which is more than the ${maxItems}-item limit for a single archive ` +
    `download. Deselect some items and try again.`
  );
}

// ---------------------------------------------------------------------------
// Byte sizing and cap reasons
// ---------------------------------------------------------------------------

/** How many bytes this entry's content actually counts against the caps.
 * "unavailable" content is never sized - planSelectionArchive omits it
 * before this is ever called - so 0 here is unreachable in practice and
 * only exists to keep the switch exhaustive. */
function contentByteSize(content: SelectionArchiveEntryContent): number {
  switch (content.kind) {
    case "html":
      // TextEncoder (not Buffer/Node) so this stays usable from a browser
      // bundle too, in keeping with this file's "no I/O, runs anywhere"
      // promise - it is not just server-only planning.
      return new TextEncoder().encode(content.html).length;
    case "binary":
      return content.bytes;
    case "unavailable":
      return 0;
  }
}

/** Human-readable size formatting - the AC leaves the exact form up to the
 * implementer ("a human-readable '1.5 KB' is as acceptable as a raw byte
 * count"); this module always renders the friendlier form so both cap
 * reasons read like something an instructor, not a debugger, would see. */
function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  const kb = bytes / 1024;
  if (kb < 1024) return `${roundToOneDecimal(kb)} KB`;
  return `${roundToOneDecimal(kb / 1024)} MB`;
}

function roundToOneDecimal(value: number): string {
  return (Math.round(value * 10) / 10).toString();
}

/** "Too big by itself" - the item alone busts maxItemBytes, independent of
 * anything else in the archive. See this file's header comment for why this
 * must read differently from didNotFitReason below. */
function tooBigReason(bytes: number, maxItemBytes: number): string {
  return (
    `This item is ${formatBytes(bytes)}, which is over the ${formatBytes(maxItemBytes)} per-item limit by ` +
    `itself, regardless of anything else in the archive.`
  );
}

/** "Did not fit in what was left" - the item cleared the per-item cap on
 * its own, but the running total already spent by the items ahead of it
 * left no room. See this file's header comment for why this must read
 * differently from tooBigReason above. */
function didNotFitReason(bytes: number, maxTotalBytes: number): string {
  return (
    `This item is ${formatBytes(bytes)}; adding it would push the archive past its ${formatBytes(maxTotalBytes)} ` +
    `total size limit, so it did not fit in what was left.`
  );
}

// ---------------------------------------------------------------------------
// Paths
// ---------------------------------------------------------------------------

/** The file extension a binary entry's path should keep - its own
 * (lowercased) extension when its fileName has one, else a generic
 * fallback. An html entry always renders as ".html" since it is always
 * this module's own rendering of the item's body, never a passthrough of
 * someone else's file. */
function binaryExtension(fileName: string): string {
  const match = /\.([A-Za-z0-9]+)$/.exec(fileName);
  return match ? `.${match[1].toLowerCase()}` : ".bin";
}

function pathExtension(content: SelectionArchiveEntryContent): string {
  return content.kind === "binary" ? binaryExtension(content.fileName) : ".html";
}

/** Assigns each included item a path of the shape "<module>/<item><ext>".
 * Both segments go through sanitizeFilenamePart independently - the SAME
 * function this repo already trusts to handle Windows-illegal characters
 * and the sanitizes-to-nothing fallback (artifact-download.ts), reused
 * rather than reimplemented (AC7). Running each segment through it
 * separately, rather than sanitizing one joined string, is what guarantees
 * a path can never escape the archive: sanitizeFilenamePart strips illegal
 * punctuation INCLUDING "/" and "\\" and collapses a dots-only result (e.g.
 * "..") to a fallback name, so neither segment can ever become "..", empty,
 * or itself contain a path separator - there is no string a title or module
 * label could be that survives sanitization as anything other than a single
 * safe path segment.
 *
 * Uniqueness is enforced afterwards across the WHOLE included set (not just
 * within a module): two items that sanitize to the same module+name land on
 * "(2)", "(3)", ... suffixes, keyed case-insensitively since Windows paths
 * are not case-sensitive. */
function assignArchivePaths(drafts: Array<Omit<IncludedArchiveItem, "path">>): IncludedArchiveItem[] {
  const seenCounts = new Map<string, number>();
  return drafts.map((draft) => {
    const folder = sanitizeFilenamePart(draft.moduleLabel);
    const base = sanitizeFilenamePart(draft.title);
    const ext = pathExtension(draft.content);
    const dedupeKey = `${folder}/${base}${ext}`.toLowerCase();
    const priorCount = seenCounts.get(dedupeKey) ?? 0;
    seenCounts.set(dedupeKey, priorCount + 1);
    const path = priorCount === 0 ? `${folder}/${base}${ext}` : `${folder}/${base} (${priorCount + 1})${ext}`;
    return { ...draft, path };
  });
}

// ---------------------------------------------------------------------------
// Planning
// ---------------------------------------------------------------------------

/**
 * Plans a selection archive: sorts every entry into included or omitted
 * (never anything else - AC4), or refuses the whole archive with an error
 * when that is the only honest outcome (too many items to reason about, or
 * an export-sourced selection asked for a cartridge - AC5, AC12).
 *
 * Order of checks per entry (fixed and significant - see the header
 * comment for why the byte caps in particular must run in this order):
 *   1. unavailable content -> omitted, carrying the upstream reason (AC6).
 *   2. format is "imscc" and the type has no cartridge slot -> omitted
 *      (AC4; allowlist, not denylist - see CARTRIDGE_SLOT_TYPES above).
 *   3. content bigger than maxItemBytes on its own -> omitted ("too big by
 *      itself").
 *   4. content that would push the running total over maxTotalBytes ->
 *      omitted ("did not fit in what was left"); the running total is NOT
 *      incremented for either kind of omission.
 *   5. otherwise included, and the running total is incremented.
 */
export function planSelectionArchive(
  entries: SelectionArchiveEntry[],
  format: ArchiveFormat,
  caps: ArchiveCaps
): SelectionArchivePlanResult {
  if (entries.length > caps.maxItems) {
    return { error: itemCountRefusalReason(entries.length, caps.maxItems) };
  }

  // AC12: an export-sourced selection's body was already tag-stripped and
  // truncated at parse time. Re-emitting that into a cartridge would
  // silently produce stub content that this archive's own manifest would
  // report as complete - a whole-archive refusal, not a per-item omission,
  // because there is no partial version of this archive that is honest.
  if (format === "imscc" && entries.some((candidate) => candidate.source === "export")) {
    return { error: EXPORT_SOURCE_IMSCC_REFUSAL };
  }

  const omitted: OmittedArchiveItem[] = [];
  const includedDrafts: Array<Omit<IncludedArchiveItem, "path">> = [];
  let runningTotalBytes = 0;

  for (const candidate of entries) {
    if (candidate.content.kind === "unavailable") {
      omitted.push({ key: candidate.key, title: candidate.title, reason: unavailableReason(candidate.content.reason) });
      continue;
    }

    if (format === "imscc" && !CARTRIDGE_SLOT_TYPES.has(candidate.type)) {
      omitted.push({ key: candidate.key, title: candidate.title, reason: unsupportedTypeReason(candidate.type) });
      continue;
    }

    const bytes = contentByteSize(candidate.content);

    if (bytes > caps.maxItemBytes) {
      omitted.push({ key: candidate.key, title: candidate.title, reason: tooBigReason(bytes, caps.maxItemBytes) });
      continue;
    }

    if (runningTotalBytes + bytes > caps.maxTotalBytes) {
      omitted.push({ key: candidate.key, title: candidate.title, reason: didNotFitReason(bytes, caps.maxTotalBytes) });
      continue;
    }

    runningTotalBytes += bytes;
    includedDrafts.push({
      key: candidate.key,
      title: candidate.title,
      type: candidate.type,
      source: candidate.source,
      moduleId: candidate.moduleId,
      moduleLabel: candidate.moduleLabel,
      content: candidate.content,
      bytes,
    });
  }

  return { included: assignArchivePaths(includedDrafts), omitted };
}

// ---------------------------------------------------------------------------
// Manifest
// ---------------------------------------------------------------------------

/**
 * Renders the manifest text every archive carries (AC4): every included
 * item, every omission with its reason, and the omission count STATED even
 * when it is zero - a manifest that goes silent on "how many were left out"
 * is indistinguishable from one that omitted nothing, which is exactly the
 * ambiguity AC4 exists to close. For an .imscc, also states the cartridge
 * stamp fact up front (AC11): buildCommonCartridge writes its app-generated
 * stamp unconditionally, so a re-upload of this exact file back into this
 * app as source material will be refused - true of every cartridge this app
 * produces, and worth saying here rather than letting an instructor
 * discover it by surprise later.
 */
export function renderArchiveManifest(
  plan: SelectionArchivePlan,
  info: { courseName: string; format: ArchiveFormat }
): string {
  const lines: string[] = [];
  lines.push(`Archive manifest - ${info.courseName} (${info.format})`);
  lines.push("");
  lines.push(`Included items: ${plan.included.length}`);
  for (const item of plan.included) {
    // AC12: an export-sourced item's body was already tag-stripped and
    // truncated to MAX_CARTRIDGE_ITEM_BODY_CHARS when the export was first
    // parsed (cartridge-import-shared.ts), invisibly to this feature - so
    // this flag is what keeps AC4 true for it: the loss already happened
    // upstream, and the manifest must disclose that rather than present the
    // result as a complete copy (see EXPORT_SOURCE_IMSCC_REFUSAL above,
    // which is the reason format:"imscc" never reaches this branch for an
    // export-sourced item at all - only a .zip's manifest ever shows one).
    // Keyed off `item.source`, never off `info.format`, so this stays
    // correct even if EXPORT_SOURCE_IMSCC_REFUSAL's scope ever changes.
    const fidelityNote =
      item.source === "export" ? " (reduced fidelity - markup removed and text truncated when the export was first parsed)" : "";
    lines.push(`- ${item.title} -> ${item.path}${fidelityNote}`);
  }
  lines.push("");
  lines.push(`Omitted items: ${plan.omitted.length}`);
  for (const omission of plan.omitted) {
    lines.push(`- ${omission.title}: ${omission.reason}`);
  }
  if (info.format === "imscc") {
    lines.push("");
    lines.push(
      "Note: this Common Cartridge is generated by Teaching Assistant. Its imsmanifest.xml carries this " +
        "app's own cartridge stamp, so re-uploading this exact file back into Teaching Assistant as source " +
        "material will be refused."
    );
  }
  return lines.join("\n");
}

// ---------------------------------------------------------------------------
// Filename
// ---------------------------------------------------------------------------

/**
 * The archive's own download filename: the course name (sanitized through
 * the same reused sanitizeFilenamePart - AC7) and the date, so two
 * downloads of the same course on different days never collide and the
 * course is always identifiable at a glance. `when` is an explicit
 * argument rather than `new Date()` read internally, keeping this function
 * pure and its output reproducible in a test. The date is rendered via
 * toISOString() (always UTC) rather than a local-timezone method, so the
 * result does not depend on the machine's timezone.
 */
export function archiveFileName(courseName: string, format: ArchiveFormat, when: Date): string {
  const name = sanitizeFilenamePart(courseName);
  const dateStamp = when.toISOString().slice(0, 10);
  return `${name} - ${dateStamp}.${format}`;
}
