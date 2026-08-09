// Package-path ORCHESTRATION for "scheduled weekly announcements from a
// package, and back out as one"
// (docs/weekly-announcement-package-io-acceptance-criteria.md). Split out of
// steps.weekly-announcement-schedule.ts (already 372 lines before this
// feature, and required to stay a thin input-reading/dispatch layer per this
// AC document's own header note) so every DECISION this feature makes - how
// each week's title/message/postAt is resolved, which formats get built,
// what the per-week report line says - lives in one testable, pure-ish
// module instead of being buried inside the step's `run` function.
//
// CLIENT-BUNDLE SAFE BY CONSTRUCTION, matching src/lib/announcement-
// drafting.ts's own contract (AC document's TASKS section, item 1): no
// next/headers, no @/lib/supabase/server, no @/app/actions/shared, and - this
// is the one that differs from most of this app's registry-adjacent modules -
// NO @/app/actions import either. Every server-side call (drafting, which
// spends an LLM budget and must stay to exactly ONE call per run - AC6 item
// 39) is taken as an INJECTED function parameter, the same pattern
// announcement-drafting.ts uses for its `draft` callback. Blob assembly
// (building the .imscc / the plain zip) is injected too, both so this module
// never needs to know about JSZip at all and so its own test file can drive
// the full orchestration sequence with in-memory fakes, the same way
// announcement-drafting.test.ts exercises draftWeeklyAnnouncements without a
// real LLM.
//
// WHAT LIVES HERE vs. WHAT DOES NOT. This module resolves scalar inputs
// (a start date, a week count, a weekday, raw title/message templates, an
// already-parsed drafts array or none) into the per-week {week, title,
// message, postAt} triples the package is built from, and turns those
// triples into the CartridgeWeek[] / PackagedAnnouncement[] shapes the two
// (already-built, reused-not-reinvented) builders in common-cartridge.ts and
// announcement-package-zip.ts consume. It does NOT parse an uploaded
// cartridge (parseCartridgeBlob/detectAppGeneratedCartridge are pure/local,
// not server calls, but the AC document's own "given resolved inputs
// (modules or template text...)" framing keeps that parsing in the step file,
// which already owns every other kind of input reading). It does NOT decide
// LMS-target Canvas-only skips (lms-target-guard.ts, unrelated to packaging).
// It does NOT touch Canvas or the weekly_announcement_schedule mapping table
// at all - that is the whole point of the package path (this document's own
// "Mechanism, stated once" section: "A packaged run performs NO Canvas writes
// and NO mapping-table writes at all").
import { parseCourseDate } from "@/lib/course-calendar-dates";
import {
  buildAnnouncementSchedule,
  parsePostTime,
  renderAnnouncementTemplate,
  type AnnouncementSlot,
} from "@/lib/announcement-schedule";
import { resolveAnnouncementTitle, type WeeklyAnnouncementDraft } from "@/lib/announcement-module-content";
import { parseMultiSelectValue } from "@/lib/multi-select-value";
import { markdownLiteToHtml } from "@/lib/markdown-lite";
import type { CartridgeWeek } from "@/lib/workflows/common-cartridge";
import type { PackagedAnnouncement, AnnouncementZipOptions } from "@/lib/announcement-package-zip";
import { DOWNLOADABLE_OUTPUT_KEY } from "@/lib/workflows/run-logging";

// ── Start-date / week-count precedence (AC1 item 10) ───────────────────────
//
// The AC text states the base order as "(a) the course tile's own startDate/
// weeks when a tile is selected; (b) the package's startAt and its module
// count," then adds "Two new optional inputs... override both." Read
// literally, "override" means the explicit inputs - when given - take
// precedence over BOTH (a) and (b), not merely fill a gap neither leaves.
// That is also the ordinary meaning an instructor would expect from a field
// labeled an override: it exists specifically to let them override what
// would otherwise be auto-derived. This module therefore resolves, in order:
// explicit override (if it parses) > course tile (if selected and it has a
// value) > the uploaded package's own value > null (caller throws the named
// error - see AC1 item 10's exact string, which lives in the step file since
// only the step knows which of the three sources was actually in play).
//
// `tileStartDate` is the course-tile column's own "YYYY-MM-DD" form (parsed
// via parseCourseDate, the SAME local-midnight parser weekDeadline/
// dueDateForWeek already use - course-calendar-dates.ts's own header comment
// explains why: parsing `${raw}T00:00:00` with no "Z" round-trips through
// local Date getters regardless of the process's own time zone).
// `packageStartAt` is CartridgeCourseData.startAt - a full ISO-8601 timestamp
// lifted from a Canvas course export's <start_at> tag (parseCourseSettings,
// cartridge-import.ts), not a bare date column, so it is parsed with a plain
// `new Date(...)` rather than the local-midnight idiom.
export function resolvePackageStartDate(params: {
  tileStartDate?: string | null;
  packageStartAt?: string | null;
  explicitStartDate?: string | null;
}): Date | null {
  const explicit = (params.explicitStartDate ?? "").trim();
  if (explicit) {
    const parsed = parseCourseDate(explicit);
    if (parsed) return parsed;
  }

  const tileParsed = parseCourseDate(params.tileStartDate ?? null);
  if (tileParsed) return tileParsed;

  const packageStartAt = (params.packageStartAt ?? "").trim();
  if (packageStartAt) {
    const parsed = new Date(packageStartAt);
    if (!Number.isNaN(parsed.getTime())) return parsed;
  }

  return null;
}

/** Same precedence as resolvePackageStartDate above, for the week count -
 * explicit override, then the tile's own `weeks`, then the uploaded
 * package's module count (one week per module is the only reasonable
 * default an uploaded package can supply on its own). Zero/negative/
 * unparseable values at any source are treated as absent so a stray "0"
 * never silently produces a zero-week term instead of falling through to the
 * next source. */
export function resolvePackageWeekCount(params: {
  tileWeeks?: number | null;
  packageModuleCount?: number | null;
  explicitWeekCount?: string | null;
}): number | null {
  const explicit = (params.explicitWeekCount ?? "").trim();
  if (explicit) {
    const parsed = Number.parseInt(explicit, 10);
    if (Number.isFinite(parsed) && parsed > 0) return parsed;
  }

  if (typeof params.tileWeeks === "number" && params.tileWeeks > 0) return params.tileWeeks;

  if (typeof params.packageModuleCount === "number" && params.packageModuleCount > 0) {
    return params.packageModuleCount;
  }

  return null;
}

// ── Output-format selection (AC3 item 16) ───────────────────────────────────
//
// Mirrors src/lib/output-selection.ts's parseOutputSelection convention
// exactly (this AC document's own text cites it): blank means every family -
// here, both "imscc" and "zip" - so an untouched packageFormats field builds
// everything rather than nothing. Reuses parseMultiSelectValue
// (multi-select-value.ts) rather than a hand-rolled split, the same
// newline-joined "options" + "multi" storage every other multi-select
// runtime field in this app already uses.
export interface PackageFormatSelection {
  imscc: boolean;
  zip: boolean;
}

export function resolvePackageFormats(raw: string): PackageFormatSelection {
  const entries = parseMultiSelectValue(raw);
  if (entries.length === 0) return { imscc: true, zip: true };
  return { imscc: entries.includes("imscc"), zip: entries.includes("zip") };
}

/** "HH:MM", 24-hour, zero-padded - the same resolved value parsePostTime
 * (announcement-schedule.ts) would apply to every slot, rendered back to a
 * label for the zip's README (AC3 item 21) and the packaged report header.
 * Blank/malformed input degrades to "08:00" exactly like parsePostTime
 * itself, since this calls that same function rather than re-parsing. */
export function formatPostTimeLabel(postTimeRaw: string): string {
  const { hour, minute } = parsePostTime(postTimeRaw);
  return `${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}`;
}

// ── Per-week resolution (the core decision this whole module exists for) ───

export interface ResolvedAnnouncementWeek {
  week: number;
  postAt: Date;
  title: string;
  message: string;
  /** Drafting provenance, when a draft actually contributed - carried
   * through to the packaged report the same way the live path's own report
   * carries it (AC7 item 42). Absent for a template-mode week or a week
   * with no draft entry. */
  note?: string;
  /** Set instead of a usable title/message when this week has nothing to
   * package - a deferred draft (its own time budget ran out) or a blank
   * drafted message with a blank template underneath it, mirroring
   * scheduleWeeklyAnnouncementsAction's own "create" branch guard
   * (canvas-inbox.ts) exactly, so a packaged run's per-week outcome for a
   * week that could not be resolved reads the same way the live path's
   * would have. Present values are lowercase sentence fragments meant to
   * follow "Week N: not packaged - ", never a full sentence on their own. */
  failed?: string;
}

/**
 * Resolves every slot's title/message the same way
 * scheduleWeeklyAnnouncementsAction (src/app/actions/canvas-inbox.ts) does
 * for its "create" branch: the instructor's own rendered title template wins
 * whenever it is non-blank (resolveAnnouncementTitle,
 * announcement-module-content.ts), then the drafted title, then "Week N";
 * the drafted message wins over the rendered message template, and a week
 * with neither is "failed" rather than silently posted/packaged blank
 * (Canvas's own create endpoint accepts an empty body without complaint, so
 * nothing downstream would otherwise catch this - see that action's own
 * comment on the identical check).
 *
 * `drafts === undefined` means TEMPLATE MODE (draftFrom === "template"):
 * every week uses the rendered title/message template, unconditionally, the
 * same as the live path's template-mode branch. `drafts` present (even an
 * empty array) means MODULE MODE: a week with no matching entry in `drafts`
 * resolves exactly as a week whose live-path plan action never asked for a
 * draft would - template fallback, same as above - which is what lets the
 * "both" delivery path (AC2 item 15) feed this function the EXACT SAME
 * `drafts` array the live path already computed and get the SAME resolved
 * triples back, without a second drafting call.
 */
export function resolveAnnouncementWeeks(
  slots: AnnouncementSlot[],
  titleTemplate: string,
  messageTemplate: string,
  drafts: WeeklyAnnouncementDraft[] | undefined
): ResolvedAnnouncementWeek[] {
  const draftsEnabled = drafts !== undefined;
  const draftsByWeek = new Map((drafts ?? []).map((d) => [d.week, d] as const));

  return slots.map((slot): ResolvedAnnouncementWeek => {
    const draft = draftsEnabled ? draftsByWeek.get(slot.week) : undefined;

    // A deferred draft (drafting's own time budget ran out before this week
    // was reached) is left ENTIRELY for a re-run, never silently downgraded
    // to the template - the exact same reasoning
    // draftModuleAnnouncementsAction's own "deferred" outcome exists for
    // (REGRESSION.md entry 238 check 2), extended here to the package path.
    if (draft?.defer) {
      return {
        week: slot.week,
        postAt: slot.postAt,
        title: "",
        message: "",
        failed: "not drafted this run - stopped for the drafting time budget",
      };
    }

    const renderedTitle = renderAnnouncementTemplate(titleTemplate, slot.week);
    const renderedMessage = renderAnnouncementTemplate(messageTemplate, slot.week);
    const title = draftsEnabled
      ? resolveAnnouncementTitle(renderedTitle, draft?.title ?? "", slot.week)
      : renderedTitle;
    const message = draftsEnabled
      ? (draft?.message ?? "").trim() || renderedMessage.trim()
      : renderedMessage;

    if (!message.trim()) {
      return {
        week: slot.week,
        postAt: slot.postAt,
        title,
        message: "",
        failed: `no drafted message and the message template is blank for week ${slot.week} - nothing to package`,
      };
    }

    return {
      week: slot.week,
      postAt: slot.postAt,
      title,
      message,
      note: draft?.note,
    };
  });
}

// ── Package payload shaping ─────────────────────────────────────────────────

// Mirrors steps.lms-export.ts:151-152's local `toUtcTimestamp` exactly (same
// algorithm, same reason - Canvas parses a zoneless delayed_post_at/due_at as
// UTC and renders it back in the course timezone, common-cartridge.ts's own
// CartridgeWeek.dueAt comment). That helper is a local, unexported const in a
// registry step file this feature does not otherwise touch, so it cannot be
// imported without widening that file's exports for a one-line function -
// duplicated here instead, deliberately kept byte-identical rather than
// reimplemented, so the two never drift apart in what they actually compute.
function zonelessUtc(d: Date): string {
  return d.toISOString().replace(/\.\d{3}Z$/, "");
}

/** Builds the CartridgeWeek[] the .imscc builder (buildCommonCartridge,
 * common-cartridge.ts) consumes - one CartridgeWeek per resolved week,
 * carrying ONLY an announcement (files/pages/assignments all empty, so
 * emitContentItems never gives this "week" an organization <item> - AC3 item
 * 20: "Announcements are NOT placed inside the numbered weekly modules").
 * Only weeks that actually resolved (no `failed`) are ever passed in here -
 * the caller filters first. `emailCopy` is the resolved tri-state CHOICE
 * (resolveAnnouncementEmailCopy's `value`, announcement-schedule.ts) - passed
 * through unchanged into CartridgeWeek.announcements[].emailCopy, which
 * common-cartridge.ts's emitAnnouncements writes into its own app-owned
 * sidecar (AC4 item 27), never into <topicMeta> (Canvas's namespace, with no
 * such element). */
export function toCartridgeWeeks(weeks: ResolvedAnnouncementWeek[], emailCopy: boolean | null): CartridgeWeek[] {
  return weeks.map((w) => ({
    week: w.week,
    title: `Week ${w.week}`,
    files: [],
    pages: [],
    assignments: [],
    announcements: [
      {
        title: w.title,
        html: markdownLiteToHtml(w.message),
        postAtUtc: zonelessUtc(w.postAt),
        emailCopy,
      },
    ],
  }));
}

/** Builds the PackagedAnnouncement[] the plain-zip builder (buildAnnouncementZip,
 * announcement-package-zip.ts) consumes. Uses a full ISO-8601 timestamp (with
 * its "Z"), NOT the zoneless form above - the zip's front matter is read by a
 * person or a generic tool, never fed back into Canvas, so there is no reason
 * to strip the offset a plain ISO string already carries unambiguously. */
export function toPackagedAnnouncements(weeks: ResolvedAnnouncementWeek[]): PackagedAnnouncement[] {
  return weeks.map((w) => ({
    week: w.week,
    title: w.title,
    message: w.message,
    postAtIso: w.postAt.toISOString(),
  }));
}

/** AC7 item 42's per-week half of the packaged report: week number, resolved
 * post datetime, resolved title, and the drafting note - or, for a week that
 * could not be resolved, why not. The header half (source / delivery /
 * formats / email-copy resolution) is composed by the step file itself: it
 * is plain string assembly from values the step already has in hand, not a
 * decision this module needs to make. */
export function buildPackageWeekReportLines(resolvedWeeks: ResolvedAnnouncementWeek[]): string[] {
  return resolvedWeeks.map((w) => {
    if (w.failed) {
      return `Week ${w.week}: not packaged - ${w.failed}.`;
    }
    const noteSuffix = w.note ? ` ${w.note}.` : "";
    return `Week ${w.week}: packaged for ${w.postAt.toLocaleString()} - "${w.title}".${noteSuffix}`;
  });
}

// ── The orchestrator ─────────────────────────────────────────────────────

export type PackageMode = "template" | "module";

export interface PackageRunInputs {
  mode: PackageMode;
  startDate: Date;
  weekCount: number;
  weekday: number;
  postTimeRaw: string;
  titleTemplate: string;
  messageTemplate: string;
  courseName: string;
  /** The human-readable note from resolveAnnouncementEmailCopy
   * (announcement-schedule.ts) - rendered verbatim into the report and the
   * zip README. */
  emailCopyNote: string;
  /** The machine-readable tri-state CHOICE from the same resolver's `value`
   * field - written into the zip's per-week front matter
   * (AnnouncementZipOptions.emailCopy) and the .imscc's app-owned sidecar
   * (toCartridgeWeeks' `emailCopy` parameter), never derived from
   * `emailCopyNote` (prose is not a machine-readable source). */
  emailCopyValue: boolean | null;
  weekdayLabel: string;
  formats: PackageFormatSelection;
  /** When supplied, drafting is SKIPPED entirely and this array is used
   * as-is - the "both" delivery path's reuse of the live path's own drafts
   * (AC2 item 15: "builds the package from the SAME resolved per-week
   * title/message/postAt triples the live path used"; AC6 item 39: exactly
   * one drafting call per run, whichever path made it). Only meaningful
   * when `mode === "module"`; a template-mode run never drafts, on either
   * path, so this is ignored there. */
  drafts?: WeeklyAnnouncementDraft[];
}

export interface PackageDraftCallbacks {
  /** Injected so this module never imports "@/app/actions" - the caller
   * binds this to whichever server action applies
   * (draftPackageAnnouncementsAction for an uploaded-package source,
   * draftModuleAnnouncementsAction for a live Canvas source), already
   * curried down to this shared shape: every requested week's number, the
   * term's total week count, returning one draft per requested week (never
   * throwing - both underlying actions degrade to `{ error }` on failure,
   * which this module treats as "no drafts, fall back to the template" the
   * same way the live path already does). */
  draft: (weeks: number[], weekCount: number) => Promise<{ drafts: WeeklyAnnouncementDraft[] } | { error: string }>;
}

export interface PackageBuildCallbacks {
  /** Injected so this module never imports jszip or common-cartridge.ts's
   * async builder directly - the caller binds this to
   * `(weeks) => buildCommonCartridge(courseName, weeks, { flavor })` with
   * `flavor` already resolved (canvas vs. cc - AC3 item 17). Omitted (or
   * left undefined) means this format was not requested; the orchestrator
   * checks `inputs.formats.imscc` before ever calling it. */
  buildImscc?: (weeks: CartridgeWeek[]) => Promise<Blob>;
  /** Injected the same way, bound to buildAnnouncementZip. */
  buildZip?: (items: PackagedAnnouncement[], options: AnnouncementZipOptions) => Promise<Blob>;
}

export interface PackageRunResult {
  resolvedWeeks: ResolvedAnnouncementWeek[];
  imsccBlob: Blob | null;
  zipBlob: Blob | null;
  weekReportLines: string[];
}

/**
 * The whole package-path orchestration, given already-resolved scalar inputs
 * plus the injected draft/build callbacks (this module's own header comment
 * explains why both are injected rather than imported). Never touches Canvas
 * or the weekly_announcement_schedule mapping table - that is the entire
 * point of the package path (this AC document's "Mechanism, stated once"
 * section).
 *
 * Throws when literally nothing could be resolved for any in-session week
 * (every week either deferred or came up with a blank message and a blank
 * template) - a packaged run must never silently produce an empty package,
 * the same "never a silent empty success" rule AC1 item 6 states for a
 * zero-module upload.
 */
export async function runAnnouncementPackage(
  inputs: PackageRunInputs,
  draftCallbacks: PackageDraftCallbacks,
  buildCallbacks: PackageBuildCallbacks
): Promise<PackageRunResult> {
  const slots = buildAnnouncementSchedule(
    inputs.startDate,
    inputs.weekCount,
    inputs.weekday,
    parsePostTime(inputs.postTimeRaw)
  );

  let drafts: WeeklyAnnouncementDraft[] | undefined = inputs.drafts;
  if (drafts === undefined && inputs.mode === "module" && slots.length > 0) {
    const weeks = slots.map((s) => s.week);
    const result = await draftCallbacks.draft(weeks, inputs.weekCount);
    // Drafting never blocks packaging, the same guarantee the live path
    // makes (AC2 item 11 / entry 238 check 14): an `{ error }` here just
    // leaves every week to fall back to its message template below.
    drafts = "drafts" in result ? result.drafts : undefined;
  }

  const resolvedWeeks = resolveAnnouncementWeeks(slots, inputs.titleTemplate, inputs.messageTemplate, drafts);
  const successfulWeeks = resolvedWeeks.filter((w) => !w.failed);

  if (successfulWeeks.length === 0) {
    throw new Error("Nothing was drafted for any in-session week - there is nothing to package.");
  }

  let imsccBlob: Blob | null = null;
  let zipBlob: Blob | null = null;

  if (inputs.formats.imscc && buildCallbacks.buildImscc) {
    imsccBlob = await buildCallbacks.buildImscc(toCartridgeWeeks(successfulWeeks, inputs.emailCopyValue));
  }
  if (inputs.formats.zip && buildCallbacks.buildZip) {
    zipBlob = await buildCallbacks.buildZip(toPackagedAnnouncements(successfulWeeks), {
      courseName: inputs.courseName,
      weekdayLabel: inputs.weekdayLabel,
      postTimeLabel: formatPostTimeLabel(inputs.postTimeRaw),
      emailCopy: inputs.emailCopyValue,
      emailCopyNote: inputs.emailCopyNote,
    });
  }

  return {
    resolvedWeeks,
    imsccBlob,
    zipBlob,
    weekReportLines: buildPackageWeekReportLines(resolvedWeeks),
  };
}

// ── Delivery + report assembly (kept here too, so the step file's job stays
// "read inputs, bind callbacks, call one function" - see this file's header
// comment on why that thinness matters) ─────────────────────────────────────

/** Minimal save-side callbacks this module needs - deliberately its OWN
 * small interface rather than importing StepRunHelpers (registry-helpers.ts)
 * wholesale, so this module's import surface stays exactly what its own
 * header comment promises. The caller (the step) passes `helpers.saveBundle`
 * / `helpers.saveCourseExportFile` straight through. */
export interface PackageSaveCallbacks {
  saveBundle: ((blob: Blob, name: string) => Promise<void>) | null;
  saveCourseExportFile: ((courseId: string, blob: Blob, fileName: string) => Promise<void>) | null;
}

export interface PackageDeliveryOutcome {
  /** Only ever carries DOWNLOADABLE_OUTPUT_KEY, when set - merge straight
   * into the step's own `outputs` bag. */
  outputs: Record<string, unknown>;
  reportLines: string[];
}

/**
 * AC3 items 21-23: hands each built blob to `helpers.saveBundle` (the Files
 * tab) and, when a course tile is bound, `helpers.saveCourseExportFile` (the
 * course tile's own LMS Exports list) - the exact same two-destination
 * delivery `steps.lms-export.ts` already uses for the course cartridge it
 * builds. `DOWNLOADABLE_OUTPUT_KEY` is set only on an attended run
 * (`typeof document !== "undefined"`, the same gate run-logging.ts's own doc
 * comment specifies) and only for ONE blob: the .imscc wins when both
 * formats were built, and the returned report lines name where the zip was
 * saved instead - the step itself never triggers a download.
 */
export async function deliverPackageArtifacts(
  imsccBlob: Blob | null,
  zipBlob: Blob | null,
  baseName: string,
  tileId: string | null,
  save: PackageSaveCallbacks
): Promise<PackageDeliveryOutcome> {
  const outputs: Record<string, unknown> = {};
  const reportLines: string[] = [];
  const safeName = baseName.replace(/[^a-zA-Z0-9._ -]/g, "_").trim() || "course";
  const attended = typeof document !== "undefined";
  let downloadableSet = false;

  if (imsccBlob) {
    const fileName = `${safeName}-weekly-announcements.imscc`;
    if (save.saveBundle) await save.saveBundle(imsccBlob, fileName);
    if (tileId && save.saveCourseExportFile) await save.saveCourseExportFile(tileId, imsccBlob, fileName);
    if (attended) {
      outputs[DOWNLOADABLE_OUTPUT_KEY] = { blob: imsccBlob, fileName };
      downloadableSet = true;
    }
    reportLines.push(`Course import package saved: ${fileName}.`);
  }

  if (zipBlob) {
    const fileName = `${safeName}-weekly-announcements.zip`;
    if (save.saveBundle) await save.saveBundle(zipBlob, fileName);
    if (tileId && save.saveCourseExportFile) await save.saveCourseExportFile(tileId, zipBlob, fileName);
    if (attended && !downloadableSet) {
      outputs[DOWNLOADABLE_OUTPUT_KEY] = { blob: zipBlob, fileName };
    }
    reportLines.push(`Plain zip of the announcement documents saved: ${fileName}.`);
  }

  return { outputs, reportLines };
}

/** AC7 item 42's header half of the packaged report - the source, the
 * delivery, an optional override note (AC2 item 13), the formats actually
 * built, and the email-copy resolution note. Plain string assembly from
 * values the caller already resolved; kept here (rather than duplicated at
 * both of the step file's two package call sites - the uploaded-package
 * source and the live-source "package"/"both" paths) so the two can never
 * word this differently. */
export function buildPackageReportHeader(params: {
  sourceLabel: string;
  deliveryLabel: string;
  overrideNote?: string;
  formats: PackageFormatSelection;
  emailCopyNote: string;
}): string[] {
  const formatsLabel =
    [
      params.formats.imscc ? "course import package (.imscc)" : null,
      params.formats.zip ? "plain zip of the announcement documents" : null,
    ]
      .filter((s): s is string => s !== null)
      .join(" and ") || "none";

  const lines = [`Source: ${params.sourceLabel}.`, `Delivery: ${params.deliveryLabel}.`];
  if (params.overrideNote) lines.push(params.overrideNote);
  lines.push(`Formats built: ${formatsLabel}.`);
  lines.push(params.emailCopyNote);
  return lines;
}

export interface PackageRunAndDeliverParams {
  inputs: PackageRunInputs;
  draftCallbacks: PackageDraftCallbacks;
  buildCallbacks: PackageBuildCallbacks;
  save: PackageSaveCallbacks;
  baseFileName: string;
  tileId: string | null;
  sourceLabel: string;
  deliveryLabel: string;
  overrideNote?: string;
}

export interface PackageRunAndDeliverResult {
  /** Number of in-session weeks actually packaged (AC7 item 43: never a
   * count of anything "scheduled" - the caller sets its own
   * `outputs.scheduledCount` to 0 for a package-only run, or to the live
   * path's real count for "both", neither of which this module decides). */
  packagedCount: number;
  /** Only ever carries DOWNLOADABLE_OUTPUT_KEY, when set. */
  outputs: Record<string, unknown>;
  reportLines: string[];
}

/**
 * Ties runAnnouncementPackage, buildPackageReportHeader and
 * deliverPackageArtifacts together - the ONE call both of the step file's
 * package call sites make (the uploaded-package source, unconditionally
 * package-only, and the live-source "package"/"both" paths). Kept as one
 * function specifically so those two call sites cannot drift apart in HOW
 * they assemble a report from a PackageRunResult, only in WHAT labels/
 * callbacks they pass in.
 */
export async function runAndDeliverPackage(
  params: PackageRunAndDeliverParams
): Promise<PackageRunAndDeliverResult> {
  const packageResult = await runAnnouncementPackage(params.inputs, params.draftCallbacks, params.buildCallbacks);

  const headerLines = buildPackageReportHeader({
    sourceLabel: params.sourceLabel,
    deliveryLabel: params.deliveryLabel,
    overrideNote: params.overrideNote,
    formats: params.inputs.formats,
    emailCopyNote: params.inputs.emailCopyNote,
  });

  const { outputs, reportLines: savedLines } = await deliverPackageArtifacts(
    packageResult.imsccBlob,
    packageResult.zipBlob,
    params.baseFileName,
    params.tileId,
    params.save
  );

  return {
    packagedCount: packageResult.resolvedWeeks.filter((w) => !w.failed).length,
    outputs,
    reportLines: [...headerLines, ...savedLines, ...packageResult.weekReportLines],
  };
}
