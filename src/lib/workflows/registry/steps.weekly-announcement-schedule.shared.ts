// Pure, side-effect-free pieces of steps.weekly-announcement-schedule.ts,
// extracted only to keep that file under the repo-wide 1000-line ceiling
// (src/file-size-ceiling.structure.test.ts) - same split idiom as
// discussion-serialization.ts, takeAnnouncementTranscription.ts, and
// course-schedule-docx.ts (see each file's own header comment): a cohesive
// piece moved to its own leaf, imported back by every caller that needs it.
// NO BEHAVIOR CHANGED - every export below is copied verbatim from the
// parent file.
//
// What lives here: the weekday option/label constants, the local structural
// types the parent's plan/draft calls are cast through, the two tiny report-
// prefixing helpers, and resolvePackageDeliveryContext - all pure lookup/
// formatting logic with no server-action call and no I/O. Shared by BOTH
// steps.weekly-announcement-schedule.ts (the step's own `run`) and
// steps.weekly-announcement-schedule.package-paths.ts (the package-building
// sub-operations) so neither has to duplicate them and neither has to import
// the other just to reach them.
//
// CLIENT-BUNDLE SAFE: imports only @/lib/announcement-schedule (documents
// itself as synchronous/side-effect-free, safe from a client-bundled
// registry step) and @/lib/workflows/announcement-package-run (documents
// itself as importing neither @/app/actions nor any server-only module). No
// @/lib/supabase/server, @/app/actions/shared, next/headers, or @/app/actions
// import of its own.
import { resolveAnnouncementEmailCopy, parsePostTime } from "@/lib/announcement-schedule";
import { resolvePackageFormats, type PackageFormatSelection } from "@/lib/workflows/announcement-package-run";

export const WEEKDAY_OPTIONS = ["0", "1", "2", "3", "4", "5", "6"];
export const WEEKDAY_LABELS: Record<string, string> = {
  "0": "Sunday",
  "1": "Monday",
  "2": "Tuesday",
  "3": "Wednesday",
  "4": "Thursday",
  "5": "Friday",
  "6": "Saturday",
};

// Local mirrors of shapes owned by files other agents are building
// (@/app/actions/weekly-announcement-drafting.ts, canvas-inbox.ts). Kept
// here as plain structural types, rather than imported, so the parent step
// file's own @/app/actions import stays the literal string the client-bundle
// guard test checks for. Structurally identical to
// announcement-module-content.ts's exported WeeklyAnnouncementDraft (and to
// announcement-package-run.ts's PackageRunInputs.drafts element type), so an
// array typed against this local shape is accepted anywhere either of those
// is expected.
export type WeekPlanAction = "create" | "already-present" | "skip-past" | "reschedule" | "leave-posted" | "resolve-pending";
export type WeekPlanEntry = { week: number; action: WeekPlanAction };
export type WeeklyAnnouncementDraft = {
  week: number;
  title?: string;
  message?: string;
  note?: string;
  defer?: boolean;
};

// T2 (docs/announcement-post-time-acceptance-criteria.md): blank still means
// the documented 8:00 AM default and must never be reported as a problem -
// parsePostTime's own `invalid` flag already makes that distinction (false
// for blank, true only for a present-but-unparseable value), so this just
// turns a true flag into one report line. Returns null for blank AND for a
// value that parsed - both cases mean nothing needs saying. `raw` is passed
// through as originally typed (never re-trimmed here) so the reported value
// matches what the instructor actually entered.
export function postTimeInvalidWarning(raw: string): string | null {
  const parsed = parsePostTime(raw);
  if (!parsed.invalid) return null;
  const hh = String(parsed.hour).padStart(2, "0");
  const mm = String(parsed.minute).padStart(2, "0");
  return `Note: the "Post time" value "${raw}" is not a valid 24-hour HH:MM time - this run used the default ${hh}:${mm} instead.`;
}

// Prepends postTimeInvalidWarning's note (when there is one) to a report
// string / report-line list, so every one of the step's several return
// sites can apply it the same way without repeating the null check. A null
// warning returns its inputs completely unchanged - the ordinary case, since
// the T1 time picker makes an invalid value nearly unreachable from the run
// form itself.
export function prependWarningToReport(report: string, warning: string | null): string {
  return warning ? `${warning}\n${report}` : report;
}
export function prependWarningToLines(lines: string[], warning: string | null): string[] {
  return warning ? [warning, ...lines] : lines;
}

// Shared bit of context every package call site (the uploaded-package
// source, and the live-source "package"/"both" paths) needs to derive from
// `values` - factored out once so the three cannot word/compute it
// differently. Pure string/lookup work only; the actual DECISIONS
// (resolveAnnouncementEmailCopy, resolvePackageFormats) are announcement-
// package-run.ts's / announcement-schedule.ts's, not reinvented here.
export function resolvePackageDeliveryContext(
  values: Record<string, unknown>,
  lms: string,
  weekdayRaw: string
): {
  formats: PackageFormatSelection;
  flavor: "cc" | "canvas";
  emailCopyNote: string;
  emailCopyValue: boolean | null;
  weekdayLabel: string;
} {
  const formats = resolvePackageFormats(String(values.packageFormats ?? ""));
  // AC3 item 17: canvas flavor when the resolved target LMS is Canvas
  // (produces a fuller Canvas-importable cartridge, including
  // course_settings/module_meta.xml and the topicMeta.xml sidecar); cc
  // flavor otherwise, matching buildCommonCartridge's own default.
  const flavor: "cc" | "canvas" = lms.trim().toLowerCase() === "canvas" ? "canvas" : "cc";
  const emailCopyResolution = resolveAnnouncementEmailCopy(lms, String(values.emailCopy ?? "").trim());
  const weekdayLabel = WEEKDAY_LABELS[weekdayRaw] ?? weekdayRaw;
  return {
    formats,
    flavor,
    emailCopyNote: emailCopyResolution.note,
    emailCopyValue: emailCopyResolution.value,
    weekdayLabel,
  };
}
