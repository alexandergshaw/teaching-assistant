// The two package-BUILDING sub-operations of steps.weekly-announcement-
// schedule.ts, extracted only to keep that file under the repo-wide
// 1000-line ceiling (src/file-size-ceiling.structure.test.ts) - same split
// idiom as discussion-serialization.ts, takeAnnouncementTranscription.ts, and
// course-schedule-docx.ts (see each file's own header comment): a cohesive
// sub-operation moved to its own leaf, imported back by its one caller. NO
// BEHAVIOR CHANGED - both functions below are copied verbatim from the
// parent file.
//
// buildPackageForLiveSource handles a LIVE Canvas tile as the term's content
// source (deliver === "package" or "both"); runCartridgeSourcedPackage
// handles an uploaded course cartridge/export as the source (draftFrom ===
// "cartridge", AC1 of docs/weekly-announcement-package-io-acceptance-
// criteria.md) - a fully self-contained path that never touches the live
// Canvas/mapping-table checks the step's own `run` makes for the live
// source. Both are dispatched from the step file's `run`, never from each
// other.
//
// This file's only SERVER-ACTION import is the literal string
// "@/app/actions" - the sanctioned route steps.weekly-announcement-
// schedule.ts itself uses (see that file's own header comment for the full
// account of why that import is safe here: every Canvas call and every
// mapping-table read/write lives behind a server action, and none of this
// file's other imports (cartridge-import.ts, common-cartridge.ts,
// announcement-package-zip.ts, announcement-package-run.ts,
// .shared.ts, lms-target-guard.ts) pulls in @/lib/supabase/server,
// @/app/actions/shared, or next/headers, even transitively.
import {
  listCourseHubAction,
  draftModuleAnnouncementsAction,
  draftPackageAnnouncementsAction,
} from "@/app/actions";
import { type StepRunHelpers, type StepRunResult } from "@/lib/workflows/registry-helpers";
import { resolveLmsFromTile } from "@/lib/workflows/registry/lms-target-guard";
import { parseCartridgeBlob, detectAppGeneratedCartridge } from "@/lib/cartridge-import";
import { buildCommonCartridge } from "@/lib/workflows/common-cartridge";
import { buildAnnouncementZip } from "@/lib/announcement-package-zip";
import {
  resolvePackageStartDate,
  resolvePackageWeekCount,
  runAndDeliverPackage,
  type PackageMode,
} from "@/lib/workflows/announcement-package-run";
import type { Course } from "@/lib/supabase/courses";
import {
  WEEKDAY_OPTIONS,
  postTimeInvalidWarning,
  prependWarningToLines,
  resolvePackageDeliveryContext,
  type WeeklyAnnouncementDraft,
} from "./steps.weekly-announcement-schedule.shared";

// Shared package-build call for a LIVE source (draftFrom "" or "template") -
// used by BOTH `deliver === "package"` (fresh drafting, every in-session
// week) and `deliver === "both"` (reusing the live path's own already-
// fetched `drafts`, per AC2 item 15 / AC6 item 39's "exactly one drafting
// call" rule - see the `drafts` parameter below). Never called for a
// draftFrom === "cartridge" run, which has its own tile-optional resolution
// (runCartridgeSourcedPackage below) and never reaches here.
export async function buildPackageForLiveSource(ctx: {
  tile: Course;
  canvasUrl: string;
  startDateRaw: string;
  tileWeeks: number;
  mode: PackageMode;
  weekdayRaw: string;
  weekday: number;
  postTime: string;
  title: string;
  message: string;
  extraNotes: string | undefined;
  acronym: string | undefined;
  values: Record<string, unknown>;
  helpers: StepRunHelpers;
  /** Present (even an empty array) only for the "both" reuse case - see
   * this function's own header comment. Absent for a fresh `deliver ===
   * "package"` build, which always drafts every in-session week itself. */
  drafts?: WeeklyAnnouncementDraft[];
}): Promise<{ outputs: Record<string, unknown>; reportLines: string[]; packagedCount: number }> {
  const startDate = resolvePackageStartDate({
    tileStartDate: ctx.startDateRaw,
    packageStartAt: null,
    explicitStartDate: String(ctx.values.startDate ?? ""),
  });
  if (!startDate) {
    // Defensive only: this function is only ever called after the caller's
    // own `!tile.startDate` check already passed, so `ctx.startDateRaw` is
    // always a valid "YYYY-MM-DD" string in practice.
    throw new Error("The course tile has no start date set.");
  }
  const weekCount =
    resolvePackageWeekCount({
      tileWeeks: ctx.tileWeeks,
      packageModuleCount: null,
      explicitWeekCount: String(ctx.values.weekCount ?? ""),
    }) ?? ctx.tileWeeks;

  const lms = await resolveLmsFromTile(ctx.tile, ctx.helpers);
  const { formats, flavor, emailCopyNote, emailCopyValue, weekdayLabel } = resolvePackageDeliveryContext(
    ctx.values,
    lms,
    ctx.weekdayRaw
  );

  return runAndDeliverPackage({
    inputs: {
      mode: ctx.mode,
      startDate,
      weekCount,
      weekday: ctx.weekday,
      postTimeRaw: ctx.postTime,
      titleTemplate: ctx.title,
      messageTemplate: ctx.message,
      courseName: ctx.tile.name,
      emailCopyNote,
      emailCopyValue,
      weekdayLabel,
      formats,
      drafts: ctx.drafts,
    },
    draftCallbacks: {
      draft: (weeks, weekCountArg) =>
        draftModuleAnnouncementsAction(ctx.canvasUrl, weeks, weekCountArg, ctx.acronym, {
          provider: ctx.helpers.provider,
          courseName: ctx.tile.name,
          extraNotes: ctx.extraNotes,
        }),
    },
    buildCallbacks: {
      buildImscc: (weeks) => buildCommonCartridge(ctx.tile.name, weeks, { flavor }),
      buildZip: (items, options) => buildAnnouncementZip(items, options),
    },
    save: { saveBundle: ctx.helpers.saveBundle, saveCourseExportFile: ctx.helpers.saveCourseExportFile },
    baseFileName: ctx.tile.name,
    tileId: ctx.tile.id,
    sourceLabel: ctx.mode === "template" ? "the message template" : "Canvas module content",
    deliveryLabel: "package only (no LMS changes)",
  });
}

// AC1: an uploaded course cartridge or export as the term's content source.
// FORCES package-only delivery (AC2 item 13) regardless of what `deliver`
// holds, and never reaches any Canvas call, any mapping-table read/write, or
// any of the live-path checks above (AC1 item 9: the course tile is OPTIONAL
// here). Dispatched from `run` before the (otherwise unconditional)
// `hubCourse` check below even runs.
export async function runCartridgeSourcedPackage(
  values: Record<string, unknown>,
  helpers: StepRunHelpers,
  onProgress: (text: string) => void
): Promise<StepRunResult> {
  // AC1 item 3: named error, before any other work.
  const files = Array.isArray(values.cartridge) ? (values.cartridge as File[]) : [];
  if (files.length === 0) {
    throw new Error(
      "Upload a course cartridge or course export (.imscc or .zip) - the uploaded package source needs it."
    );
  }
  const blob = files[0];

  // AC1 item 5: refuse the app's own output fed back in, matching entries
  // 202/206's exact wording.
  if (await detectAppGeneratedCartridge(blob)) {
    throw new Error(
      "That cartridge was produced by this app, not exported from a real course - drafting announcements from it would feed the app its own output back in. Upload the LMS's own export instead."
    );
  }

  onProgress("Reading the uploaded package...");
  // AC1 item 4: parseCartridgeBlob already dispatches Blackboard / Canvas /
  // generic Common Cartridge by content, and a Moodle .mbz surfaces that
  // parser's own named error unchanged - nothing extra to do here.
  const data = await parseCartridgeBlob(blob);
  // AC1 item 6: never a silent empty success.
  if (data.modules.length === 0) {
    throw new Error("The uploaded package has no modules - nothing to draft each week's announcement from.");
  }

  const weekdayRaw = String(values.weekday ?? "").trim();
  if (!WEEKDAY_OPTIONS.includes(weekdayRaw)) {
    throw new Error("Choose a weekday to post on.");
  }
  const weekday = Number.parseInt(weekdayRaw, 10);
  const postTime = String(values.postTime ?? "").trim();
  const postTimeWarning = postTimeInvalidWarning(postTime);
  const title = String(values.title ?? "").trim();
  const message = String(values.message ?? "").trim();
  const extraNotes = String(values.extraNotes ?? "").trim() || undefined;

  // AC1 item 9: the course tile is OPTIONAL for an uploaded-package source -
  // used only to name the output and to supply a course title when the
  // package has none. No Canvas URL, no start date on the tile, and no LMS
  // link are required.
  const hubCourseId = String(values.hubCourse ?? "").trim();
  let tile: Course | null = null;
  if (hubCourseId) {
    const list = await listCourseHubAction();
    if (!("error" in list)) {
      tile = list.courses.find((c) => c.id === hubCourseId) ?? null;
    }
  }

  // AC1 item 10: explicit override > tile > package (see
  // resolvePackageStartDate/resolvePackageWeekCount's own header comments in
  // announcement-package-run.ts for why "override" is read as taking
  // precedence over both other sources, not merely filling a gap neither
  // leaves).
  const startDate = resolvePackageStartDate({
    tileStartDate: tile?.startDate ?? null,
    packageStartAt: data.startAt,
    explicitStartDate: String(values.startDate ?? ""),
  });
  if (!startDate) {
    throw new Error("Set a start date - the uploaded package does not carry one and no course tile is selected.");
  }
  // packageModuleCount is always > 0 here (the zero-modules check above
  // already threw), so resolvePackageWeekCount can only return null when
  // BOTH other sources are also absent/invalid - which cannot happen once
  // packageModuleCount is a valid fallback. The `?? data.modules.length` is
  // therefore a type-level reassurance, not a reachable runtime fallback.
  const weekCount =
    resolvePackageWeekCount({
      tileWeeks: tile?.weeks ?? null,
      packageModuleCount: data.modules.length,
      explicitWeekCount: String(values.weekCount ?? ""),
    }) ?? data.modules.length;

  const courseName = tile?.name || data.title || "Course";
  const lms = tile ? await resolveLmsFromTile(tile, helpers) : "";
  const { formats, flavor, emailCopyNote, emailCopyValue, weekdayLabel } = resolvePackageDeliveryContext(
    values,
    lms,
    weekdayRaw
  );

  const deliverRaw = String(values.deliver ?? "").trim();
  const overrideNote =
    deliverRaw === "" || deliverRaw === "both"
      ? "Source is an uploaded package, so nothing was written to the LMS - the package below is the whole output."
      : undefined;

  onProgress(`Drafting ${weekCount} week announcement${weekCount === 1 ? "" : "s"} from the uploaded package...`);

  // AC6 item 39's structural-typing note (weekly-announcement-drafting.ts's
  // own header comment): draftPackageAnnouncementsAction is a "use server"
  // export and cannot re-export the CartridgeModule type, so it accepts a
  // plain structural array instead - this mapping is exactly that shape.
  const modules = data.modules.map((m) => ({
    name: m.name,
    position: m.position,
    items: m.items.map((it) => ({ title: it.title, type: it.type, body: it.body })),
  }));

  const packaged = await runAndDeliverPackage({
    inputs: {
      mode: "module",
      startDate,
      weekCount,
      weekday,
      postTimeRaw: postTime,
      titleTemplate: title,
      messageTemplate: message,
      courseName,
      emailCopyNote,
      emailCopyValue,
      weekdayLabel,
      formats,
    },
    draftCallbacks: {
      draft: (weeks, weekCountArg) =>
        draftPackageAnnouncementsAction(modules, weeks, weekCountArg, {
          provider: helpers.provider,
          courseName,
          extraNotes,
        }),
    },
    buildCallbacks: {
      buildImscc: (weeks) => buildCommonCartridge(courseName, weeks, { flavor }),
      buildZip: (items, options) => buildAnnouncementZip(items, options),
    },
    save: { saveBundle: helpers.saveBundle, saveCourseExportFile: helpers.saveCourseExportFile },
    baseFileName: courseName,
    tileId: tile?.id ?? null,
    sourceLabel: "an uploaded course cartridge or export",
    deliveryLabel: "package only (forced by the uploaded-package source)",
    overrideNote,
  });

  const reportLines = prependWarningToLines(packaged.reportLines, postTimeWarning);
  return {
    outputs: {
      // AC7 item 43: never implies anything was scheduled.
      scheduledCount: 0,
      report: reportLines.join("\n"),
      ...packaged.outputs,
    },
    summary: {
      kind: "list",
      label: `${packaged.packagedCount} week(s) packaged from the uploaded package`,
      items: reportLines,
    },
  };
}
