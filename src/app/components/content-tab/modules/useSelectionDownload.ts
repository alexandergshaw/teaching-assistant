"use client";

// Local UI state + handler for the LMS Modules bulk bar's "Download" row
// (docs/lms-selection-export-download-acceptance-criteria.md) - the client
// half of "download a course export and/or a zip of just the selected
// modules/items". The server half (POST /api/lms-export/selection) is a
// SEPARATE, concurrently-built route this hook never imports from directly:
// everything below codes against that route's WIRE CONTRACT only (the
// request JSON shape, the response headers, the error JSON shape), never
// against the server-only planning module
// (src/lib/lms-generation/selection-archive.ts) that route happens to be
// built on. That module is mid-flight elsewhere and is not this hook's
// dependency, on purpose - the wire contract is the one stable surface
// shared between the two halves, and this file redeclares its own
// SelectionDownloadFormat/request-body shape rather than importing
// selection-archive.ts's ArchiveFormat/etc., so a rename or a signature
// change on that side while this file is being written cannot break this
// one silently.
//
// TWO DELIBERATE EXCEPTIONS to "never against the server-only planning
// module":
//
// (1) sanitizeFilenamePart (src/lib/lms-generation/artifact-download.ts) IS
// imported, for the FALLBACK filename this hook builds when a response
// carries no usable Content-Disposition header. That function is already a
// stable, exported, general-purpose leaf this repo reuses everywhere a
// filename needs sanitizing (useLmsGeneration.ts already imports several of
// its siblings from the same file) - it is not part of the selection-archive
// planning surface, so depending on it does not create the coupling the rest
// of this comment avoids. Reused per the AC's own instruction rather than
// writing a seventh sanitizer.
//
// (2) SELECTION_ARCHIVE_MAX_ITEMS (selection-archive.ts) IS imported, for
// the item-count pre-flight cap (AC5). Both halves of this feature were
// built concurrently and each independently declared their own literal
// `150` for this number, with nothing keeping the two equal - a verification
// pass caught the drift risk and moved the one real number into
// selection-archive.ts, the module that already owns every other archive
// budget decision. That module is pure and dependency-free (no network, no
// filesystem, no React - see its own header comment), so importing a value
// from it is exactly as safe for this client hook as it is for the
// server-only route/build files that also import it - it does not create
// the wire-contract-vs-implementation coupling the rest of this file's
// header avoids, because the number itself is not part of that contract.
//
// SHAPE MIRRORS useLmsGeneration.ts ON PURPOSE (AC9): a single busy string
// ("" | SelectionDownloadFormat) that is set for the duration of one
// download and blocks a second one (of either format) from starting -
// exactly like that hook's own `busy`/`downloading` guard its download().
// This hook does NOT share state with useLmsGeneration, useBulkItemActions
// or useBulkModuleActions (their own `opBusy`): GenerateFromSelectionSection
// already establishes the precedent that a bulk-bar row owns its own busy
// state rather than folding into `opBusy`, and this row follows that
// precedent rather than inventing a fourth coordination scheme.
//
// THE ITEM-COUNT CAP (AC5) IS ENFORCED HERE AS A CLIENT-SIDE PRE-FLIGHT
// GUARD ONLY - the server route re-enforces the SAME SELECTION_ARCHIVE_MAX_
// ITEMS independently on its own fresh read (selection-archive-build.ts's
// ARCHIVE_CAPS), so this check can only ever save a round trip, never be the
// sole enforcement. It uses SELECTION_ARCHIVE_MAX_ITEMS directly (see the
// "TWO DELIBERATE EXCEPTIONS" note above) rather than a locally-declared
// number, so the two can no longer disagree the way two independent literal
// `150`s once could.
import { useState } from "react";
import type { CanvasModule } from "@/lib/canvas-modules";
import type { CartridgeModule } from "@/lib/cartridge-import";
import { expandModuleSelection, type SelectedMaterialItem } from "@/lib/lms-generation/materials";
import { sanitizeFilenamePart } from "@/lib/lms-generation/artifact-download";
import { SELECTION_ARCHIVE_MAX_ITEMS } from "@/lib/lms-generation/selection-archive";
import type { ContentSource } from "../contentSourceGating";
import { triggerFileDownload } from "../../course-planning/utils";

// ── The wire contract (fixed - shared with src/app/api/lms-export/selection/route.ts) ──

export type SelectionDownloadFormat = "imscc" | "zip";
export type SelectionDownloadBusy = "" | SelectionDownloadFormat;

interface SelectionArchiveRequestBody {
  courseUrl: string;
  /** An export selection's course_hub row id - see FINDING 1's fix note
   * above. Undefined for a live selection, which route.ts identifies by
   * courseUrl instead. */
  courseId?: string;
  acronym?: string;
  courseName: string;
  format: SelectionDownloadFormat;
  source: "live" | "export";
  itemKeys: string[];
  moduleKeys: string[];
}

/** contentSourceGating.ts's own "canvas" | "export" vocabulary, mapped onto
 * the wire contract's "live" | "export" - two different words for the same
 * fact, kept apart deliberately: "canvas" names WHERE the app read this
 * content from (a UI/display concern, contentSourceGating.ts's own
 * vocabulary), "live" names whether the archive route may hit the live
 * Canvas API for it (a server concern, the wire contract's own vocabulary).
 * This is the one place that translation happens, rather than either side
 * guessing the other's word. */
export function wireSourceFor(source: ContentSource): "live" | "export" {
  return source === "export" ? "export" : "live";
}

export function tooManyItemsNote(count: number, max: number): string {
  return (
    `This selection has ${count} items, which is more than the ${max}-item limit for a single download. ` +
    `Deselect some items and try again.`
  );
}

// AC12: the .imscc control's own unavailable reason - exported so
// DownloadSelectionSection.tsx can render the SAME text as the visible,
// aria-describedby-linked explanation next to the disabled control, rather
// than keeping a second copy that could drift from the defensive re-check
// download() itself does below.
export const IMSCC_UNAVAILABLE_REASON =
  "Unavailable for a stored export: an export's text is already stripped of markup and truncated when it was " +
  "first parsed, so a Common Cartridge built from it would contain stub content that the archive's own manifest " +
  "would wrongly report as complete. Download the .zip instead - it carries the export's text as parsed, flagged " +
  "as reduced fidelity in the manifest.";

// Regression pass fix (docs/REGRESSION.md entry 274, FINDING 1): an earlier
// version of this file checked `courseUrl` unconditionally, before `source`
// was ever consulted, on the claim that "the wire contract carries
// courseUrl, not courseId" - true when that version was written, but it made
// the check WRONG rather than merely incomplete: ContentTab.tsx sends "" for
// `courseUrl` for EVERY export-sourced selection (an export-only course, or
// an export view of a course whose live-course status is not threaded
// through yet - see that file's own `sourceContext` comment), so checking
// courseUrl first, regardless of source, disabled BOTH controls for every
// export-sourced course permanently - not merely the .imscc control AC12
// already restricts. The wire contract now carries `courseId` too (route.ts,
// SelectionArchiveRequestBody below): an export selection is identified by
// its course_hub row id, never by a Canvas URL at all, so a missing
// courseUrl is simply not a fact about whether an export request can
// succeed. See selectionDownloadUnavailableReason below for the per-source
// check this replaced the unconditional one with.
export const COURSE_URL_UNAVAILABLE_REASON =
  "This download needs a connected Canvas course. This selection has no Canvas course URL to send - only a " +
  "stored export - so there is nowhere for the server to fetch the selected content from.";

/** The export counterpart of COURSE_URL_UNAVAILABLE_REASON above: why a
 * request cannot succeed when the active selection is export-sourced but has
 * no course_hub row id to send. Practically unreachable from today's UI
 * (ContentTab.tsx's handleSelectExportCourse only ever sets `courseId` from
 * a row the picker itself listed), but modelled explicitly rather than
 * assumed - the same posture COURSE_URL_UNAVAILABLE_REASON already took for
 * the live side before this fix made it reachable. */
export const COURSE_ID_UNAVAILABLE_REASON =
  "This download needs a stored course export. This selection has no saved export to read from, so there is " +
  "nowhere for the server to load the selected content from.";

/** Why `format` cannot be downloaded right now, or null when it can. Which
 * identifier a request even NEEDS depends on its source (FINDING 1 fix): a
 * live selection is identified by `courseUrl`, an export selection by
 * `courseId` instead - checking `courseUrl` unconditionally regardless of
 * `source` (the prior defect) is what made every export-sourced request look
 * identical to a courseUrl-less live one. Only once the source's own usable
 * identifier exists does the narrower, .imscc-only AC12 fidelity refusal get
 * a chance to apply - a format-specific reason only makes sense once "can
 * this request reach the server at all" is already answered yes. Shared by
 * the hook's own download() gate and by DownloadSelectionSection's visible
 * per-control hint, so the two can never say different things about the same
 * control. */
export function selectionDownloadUnavailableReason(
  format: SelectionDownloadFormat,
  courseUrl: string,
  source: ContentSource,
  courseId: string | undefined
): string | null {
  if (source === "export") {
    if (!courseId?.trim()) return COURSE_ID_UNAVAILABLE_REASON;
  } else if (!courseUrl.trim()) {
    return COURSE_URL_UNAVAILABLE_REASON;
  }
  if (format === "imscc" && source === "export") return IMSCC_UNAVAILABLE_REASON;
  return null;
}

// ── Response parsing (pure) ─────────────────────────────────────────────────

/** Parse a filename out of a `Content-Disposition: attachment; filename="...";
 * filename*=UTF-8''...` header value. Prefers the RFC 5987 `filename*` form
 * (correctly carries non-ASCII characters) when present, falling back to the
 * plain quoted `filename` form otherwise - real servers commonly emit both
 * together for older-client compatibility, so this checks for either.
 * Returns null (never throws) when neither form is found, so a missing or
 * malformed header degrades to the caller's own fallback name instead of
 * losing the download outright. */
export function parseContentDispositionFilename(header: string | null): string | null {
  if (!header) return null;
  const star = header.match(/filename\*\s*=\s*[^']*''([^;]+)/i);
  if (star) {
    try {
      return decodeURIComponent(star[1].trim());
    } catch {
      // Malformed percent-encoding - fall through to the plain form rather
      // than failing the whole parse over one bad header.
    }
  }
  const plain = header.match(/filename\s*=\s*"([^"]*)"|filename\s*=\s*([^;]+)/i);
  const value = plain ? (plain[1] ?? plain[2] ?? "").trim() : "";
  return value || null;
}

/** The download filename when the response carried no usable
 * Content-Disposition header - the same "<course> - <date>.<ext>" shape the
 * server's own filename builder produces, reproduced independently here
 * (see this file's header comment on why that module is not imported)
 * rather than falling back to a generic "download.zip". */
export function fallbackArchiveFileName(courseName: string, format: SelectionDownloadFormat): string {
  const name = sanitizeFilenamePart(courseName);
  const dateStamp = new Date().toISOString().slice(0, 10);
  return `${name} - ${dateStamp}.${format}`;
}

function parseCountHeader(value: string | null): number | null {
  if (value == null) return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

/** AC4's counts, restated client-side: "the UI note after a download states
 * the same counts" the archive's own manifest carries. Falls back to a
 * counts-free sentence when a header is missing/malformed rather than
 * printing "null included" - the download itself already succeeded by the
 * time this runs, so a missing header degrades the note, not the outcome. */
export function downloadSuccessNote(filename: string, included: number | null, omitted: number | null): string {
  if (included == null || omitted == null) {
    return `Downloaded "${filename}". Nothing was written to Canvas or saved anywhere.`;
  }
  const includedPart = `${included} item${included === 1 ? "" : "s"} included`;
  const omittedPart = omitted > 0 ? `, ${omitted} omitted (see the archive's manifest for why)` : ", none omitted";
  return `Downloaded "${filename}": ${includedPart}${omittedPart}. Nothing was written to Canvas or saved anywhere.`;
}

/** Non-JSON failure responses (an auth redirect to the login page, a
 * platform timeout/error page) are treated as a clean, generic error instead
 * of letting `res.json()` throw "Unexpected token '<'" - mirrors
 * generateDeckApi's own guard (useLmsGeneration.ts) for the identical
 * failure mode on the sibling deck route. */
async function readErrorMessage(res: Response): Promise<string> {
  if (!res.headers.get("content-type")?.includes("application/json")) {
    return res.status === 401 || res.status === 403
      ? "Your session expired - sign in again."
      : `Download failed (HTTP ${res.status}).`;
  }
  try {
    const body = (await res.json()) as { error?: string };
    return body.error ?? `Download failed (HTTP ${res.status}).`;
  } catch {
    return `Download failed (HTTP ${res.status}).`;
  }
}

// ── Hook ─────────────────────────────────────────────────────────────────

export interface UseSelectionDownloadReturn {
  busy: SelectionDownloadBusy;
  download: (format: SelectionDownloadFormat) => void;
  /** Null when the .imscc control can be used right now; otherwise the
   * reason to show next to it (DownloadSelectionSection) AND the text
   * download() itself surfaces through `setNote` if the control is
   * activated anyway - see selectionDownloadUnavailableReason above. */
  imsccUnavailableReason: string | null;
  /** Same as imsccUnavailableReason, for the .zip control. A plain .zip has
   * no format-driven restriction of its own, so this is only ever the
   * "no usable identifier for this source" reason - COURSE_URL_UNAVAILABLE_
   * REASON for a live selection, COURSE_ID_UNAVAILABLE_REASON for an export
   * one (selectionDownloadUnavailableReason) - computed the same way rather
   * than assumed, so a future format-specific .zip restriction has somewhere
   * to plug in without DownloadSelectionSection needing to change. */
  zipUnavailableReason: string | null;
}

export function useSelectionDownload(
  courseUrl: string,
  /** An export selection's course_hub row id - threaded through from
   * ContentTab exactly the way `courseUrl` already is (see that file's own
   * `exportCourseId` derivation), undefined for a live selection. FINDING 1
   * fix: this is what actually identifies an export-sourced request; a live
   * request still identifies itself by `courseUrl`. */
  courseId: string | undefined,
  acronym: string | undefined,
  courseName: string | undefined,
  /** Which Course Content source is active - see contentSourceGating.ts.
   * Only the source string is needed here (never `hasLiveCourse`): AC8, this
   * row is a read, not a write, so the "no live course to write to" fact
   * gateOperation's callers key on does not apply to it. */
  source: ContentSource,
  selectedMaterialItems: () => SelectedMaterialItem[],
  selectedModules: Set<string>,
  modules: CanvasModule[],
  exportModules: CartridgeModule[] | null | undefined,
  setNote: (n: { kind: "success" | "error"; text: string } | null) => void
): UseSelectionDownloadReturn {
  const [busy, setBusy] = useState<SelectionDownloadBusy>("");

  // Computed every render from courseUrl/courseId/source rather than cached
  // in state: all three are already the hook's own arguments (owned by the
  // caller), so there is no event that would make a cached copy go stale
  // that a plain recompute doesn't already track for free.
  const imsccUnavailableReason = selectionDownloadUnavailableReason("imscc", courseUrl, source, courseId);
  const zipUnavailableReason = selectionDownloadUnavailableReason("zip", courseUrl, source, courseId);

  const download = (format: SelectionDownloadFormat) => {
    // AC9: one download in flight at a time, mirroring useLmsGeneration's
    // own busy/downloading guard on its download().
    if (busy !== "") return;

    // Verification-pass fix: DownloadSelectionSection renders BOTH controls
    // `aria-disabled` (not `disabled`) when unavailable, specifically so a
    // keyboard/screen-reader user can still reach them and discover why -
    // see that component's own header comment. That only works if
    // activating one anyway actually DOES something: a reachable, focusable
    // control that is silent on activation is worse than a plain disabled
    // one. Reusing the SAME imsccUnavailableReason/zipUnavailableReason this
    // hook already computed for the controls' own visible hints guarantees
    // the note text a bypassing caller sees can never drift from what was
    // already displayed next to the button.
    const reason = format === "imscc" ? imsccUnavailableReason : zipUnavailableReason;
    if (reason) {
      setNote({ kind: "error", text: reason });
      return;
    }

    const materialItems = selectedMaterialItems();
    const moduleKeys = Array.from(selectedModules);
    if (materialItems.length === 0 && moduleKeys.length === 0) return;

    // AC5: the item-count cap is enforced HERE, before any request, using
    // the same expandModuleSelection the server itself uses to turn a
    // whole-module selection into its items (materials.ts) - so the count
    // checked against the cap is the true fetch count, not merely how many
    // rows the instructor clicked (a single selected module can expand to
    // dozens of items). Passing this hook's own (possibly slightly stale)
    // `modules` tree here is fine: this is a UX pre-check, not the source of
    // truth for what gets archived - the server re-reads a fresh tree and
    // expands again itself (AC2), so a stale client count can at most let a
    // request through that the server ends up refusing on its own (via the
    // SAME error-note path this hook already renders), never silently
    // mis-archive anything.
    const expandedCount = expandModuleSelection(materialItems, moduleKeys, modules, exportModules ?? undefined).length;
    if (expandedCount > SELECTION_ARCHIVE_MAX_ITEMS) {
      setNote({ kind: "error", text: tooManyItemsNote(expandedCount, SELECTION_ARCHIVE_MAX_ITEMS) });
      return;
    }

    const body: SelectionArchiveRequestBody = {
      courseUrl,
      courseId,
      acronym,
      courseName: courseName ?? "",
      format,
      source: wireSourceFor(source),
      // AC2/AC7: the selection's raw keys, verbatim - the route re-reads a
      // fresh module tree itself and expands whole-module selections
      // server-side (expandModuleSelection again, against ITS OWN fresh
      // read), the same way the deck route already trusts nothing from the
      // client but the raw selection. `materialItems` already carries each
      // entry's own itemKey/exportItemKey-formatted `key` (useModuleSelection's
      // selectedMaterialItems), so mapping it is exactly the selection's own
      // `selected` Set contents - sending the expanded array computed above
      // instead would silently reintroduce trusting this hook's possibly-stale
      // `modules` tree for what actually gets archived; that array is only
      // ever used for the cap check above.
      itemKeys: materialItems.map((it) => it.key),
      moduleKeys,
    };

    void (async () => {
      setBusy(format);
      setNote(null);
      try {
        const res = await fetch("/api/lms-export/selection", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        });

        if (!res.ok) {
          setNote({ kind: "error", text: await readErrorMessage(res) });
          return;
        }

        const blob = await res.blob();
        const filename =
          parseContentDispositionFilename(res.headers.get("Content-Disposition")) ??
          fallbackArchiveFileName(courseName ?? "", format);
        // AC7: the one place a blob is handed to the browser - never a
        // hand-rolled createObjectURL/anchor/click/revoke dance (REGRESSION
        // entry 267 check 4 already refused a sixth copy of it).
        triggerFileDownload(blob, filename);

        const included = parseCountHeader(res.headers.get("X-Archive-Included"));
        const omitted = parseCountHeader(res.headers.get("X-Archive-Omitted"));
        setNote({ kind: "success", text: downloadSuccessNote(filename, included, omitted) });
      } catch (e) {
        // AC6: a failure to build/fetch the archive itself is the one thing
        // that surfaces as an error here - it never touches the selection,
        // so a failed download leaves the instructor free to just try again.
        const message = e instanceof Error ? e.message : String(e);
        setNote({ kind: "error", text: `Could not download the archive: ${message}` });
      } finally {
        setBusy("");
      }
    })();
  };

  return { busy, download, imsccUnavailableReason, zipUnavailableReason };
}
